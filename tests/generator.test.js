// End-to-end test of the Session ID generator with a FAKE WhatsApp (no network):
// pair code flow, QR flow, one-time session read, replacing an attempt, abuse limits.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');
const Module = require('module');

process.env.PAIRING_COOLDOWN_MS = '0';
process.env.GENERATOR_EXTRACT_DELAY_MS = '30';
process.env.PAIRING_MAX_PER_IP_HOUR = '1000';

const socks = []; // every fake socket created, newest last
const fakeBaileys = {
  default(opts) {
    const ev = new EventEmitter();
    const sock = {
      ev, authState: opts.auth, user: null, sent: [], ended: false,
      sendMessage: async (jid, msg) => { sock.sent.push([jid, msg.text]); },
      end() { sock.ended = true; },
      requestPairingCode: async (n) => { opts.auth.creds.me = { id: `${n}@s.whatsapp.net`, name: '~' }; return 'ABCD1234'; },
      // test helper: behave like WhatsApp finishing the link
      async link(number = '255778271055') {
        Object.assign(opts.auth.creds, { registered: true, noiseKey: 'nk', me: { id: `${number}:1@s.whatsapp.net`, name: 'T' } });
        sock.user = { id: `${number}:1@s.whatsapp.net` };
        sock.ev.emit('creds.update', {});
        sock.ev.emit('connection.update', { connection: 'open' });
      }
    };
    socks.push(sock);
    setTimeout(() => ev.emit('connection.update', { qr: 'fake-qr-' + socks.length }), 20);
    return sock;
  },
  useMultiFileAuthState: async (folder) => {
    const state = { creds: {}, keys: {} };
    return { state, saveCreds: async () => fs.writeFileSync(path.join(folder, 'creds.json'), JSON.stringify(state.creds)) };
  },
  makeCacheableSignalKeyStore: (k) => k,
  fetchLatestBaileysVersion: async () => ({ version: [2, 0, 0] }),
  DisconnectReason: { restartRequired: 515, loggedOut: 401, connectionLost: 408, connectionClosed: 428, timedOut: 408 }
};
const origLoad = Module._load;
Module._load = function (request, ...rest) { return request === 'baileys' ? fakeBaileys : origLoad.call(this, request, ...rest); };

const { startGeneratorServer } = require('../src/generator/server');
const { decodeSession } = require('../src/connection/sessionCodec');
const { server } = startGeneratorServer({ port: 0 });
const base = () => `http://127.0.0.1:${server.address().port}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const post = async (p, body) => { const r = await fetch(base() + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) }); return [r.status, await r.json()]; };
const get = async (p) => { const r = await fetch(base() + p); return [r.status, await r.json()]; };
async function until(fn, ms = 3000) { const t = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t > ms) throw new Error('timeout'); await sleep(40); } }

test.after(() => { Module._load = origLoad; server.close(); setTimeout(() => process.exit(0), 100).unref(); });

test('serves the site, health and real stats', async () => {
  assert.equal((await fetch(base() + '/')).status, 200);
  assert.equal((await fetch(base() + '/countries.js')).status, 200);
  assert.equal((await get('/health'))[1].status, 'ok');
  const [, st] = await get('/api/stats');
  assert.equal(typeof st.successful, 'number');
  assert.equal((await get('/api/bot-file'))[0], 200);
});

test('rejects bad numbers', async () => {
  assert.equal((await post('/api/request-code', { dial: '255', number: '' }))[0], 400);
  assert.equal((await post('/api/request-code', { dial: '255', number: '12' }))[0], 400);
});

test('pair code flow: code -> link -> session ID, read once, sent to the user chat', async () => {
  const [status, body] = await post('/api/request-code', { dial: '255', number: '0778 271 055' });
  assert.equal(status, 200);
  assert.equal(body.code, 'ABCD-1234');
  assert.match(body.token, /^[a-f0-9]{48}$/);
  assert.deepEqual((await get('/api/session-status/' + body.token))[1], { success: true, status: 'waiting' });

  const sock = socks[socks.length - 1];
  await sock.link();
  const ready = await until(async () => { const [, j] = await get('/api/session-status/' + body.token); return j.status === 'ready' ? j : null; });
  assert.ok(ready.sessionId.startsWith('BHMD~'));
  assert.equal(decodeSession(ready.sessionId).creds.me.id, '255778271055:1@s.whatsapp.net');
  assert.equal((await get('/api/session-status/' + body.token))[0], 404); // one-time read
  await until(() => sock.sent.length >= 2);
  assert.equal(sock.sent[1][1], ready.sessionId); // the ID itself went to the user's own chat
  assert.equal(sock.sent[0][0], '255778271055@s.whatsapp.net');
});

test('a wrong/abandoned code never blocks a new one: re-request cancels the old attempt', async () => {
  const [, first] = await post('/api/request-code', { dial: '255', number: '712345678' });
  const oldSock = socks[socks.length - 1];
  const [s2, second] = await post('/api/request-code', { dial: '255', number: '712345678' });
  assert.equal(s2, 200);
  assert.notEqual(second.token, first.token);
  assert.equal((await get('/api/session-status/' + first.token))[0], 404);
  assert.equal(oldSock.ended, true);
});

test('QR flow: QR image appears, rotates, then link gives a session ID', async () => {
  const [status, body] = await post('/api/request-qr');
  assert.equal(status, 200);
  const waiting = await until(async () => { const [, j] = await get('/api/session-status/' + body.token); return j.qr ? j : null; });
  assert.match(waiting.qr, /^data:image\/png;base64,/);
  const sock = socks[socks.length - 1];
  sock.ev.emit('connection.update', { qr: 'rotated-qr' }); // WhatsApp rotates the QR
  await sock.link('255700111222');
  const ready = await until(async () => { const [, j] = await get('/api/session-status/' + body.token); return j.status === 'ready' ? j : null; });
  assert.equal(decodeSession(ready.sessionId).creds.me.id, '255700111222:1@s.whatsapp.net');
});

test('a second QR request from the same visitor replaces the first', async () => {
  const [, a] = await post('/api/request-qr');
  const [s, b] = await post('/api/request-qr');
  assert.equal(s, 200);
  assert.equal((await get('/api/session-status/' + a.token))[0], 404);
  assert.equal((await get('/api/session-status/' + b.token))[0], 200);
});

test('an unknown or malformed token is a 404', async () => {
  assert.equal((await get('/api/session-status/not-a-token'))[0], 404);
  assert.equal((await get('/api/session-status/' + 'a'.repeat(48)))[0], 404);
});
