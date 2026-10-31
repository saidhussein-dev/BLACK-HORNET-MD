const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { acquireSession } = require('../src/connection/sessionLoader');
const { encodeSession } = require('../src/connection/sessionCodec');

const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'bhmd-session-'));
const creds = (n = '255700000000') => ({ noiseKey: 'k', me: { id: `${n}:1@s.whatsapp.net` } });

test('reports "missing" when there is no SESSION_ID and no creds.json on disk', () => {
  assert.equal(acquireSession(tmpDir(), {}).status, 'missing');
});

test('reports "unchanged" when creds.json already exists and no SESSION_ID is given', () => {
  const folder = tmpDir();
  fs.writeFileSync(path.join(folder, 'creds.json'), JSON.stringify({ me: 'x' }));
  assert.equal(acquireSession(folder, {}).status, 'unchanged');
});

test('loads a valid SESSION_ID, writes creds.json and reports the phone', () => {
  const folder = tmpDir();
  const result = acquireSession(folder, { SESSION_ID: encodeSession(creds()) });
  assert.equal(result.status, 'loaded');
  assert.equal(result.phone, '255700000000');
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(folder, 'creds.json'), 'utf8')), creds());
});

test('the SAME SESSION_ID on the next boot keeps the fresher creds on disk', () => {
  const folder = tmpDir();
  const id = encodeSession(creds());
  assert.equal(acquireSession(folder, { SESSION_ID: id }).status, 'loaded');
  const fresher = { ...creds(), advSecretKey: 'rotated' };
  fs.writeFileSync(path.join(folder, 'creds.json'), JSON.stringify(fresher));
  assert.equal(acquireSession(folder, { SESSION_ID: id }).status, 'unchanged');
  assert.equal(JSON.parse(fs.readFileSync(path.join(folder, 'creds.json'), 'utf8')).advSecretKey, 'rotated');
});

test('a NEW SESSION_ID replaces the old session', () => {
  const folder = tmpDir();
  acquireSession(folder, { SESSION_ID: encodeSession(creds('255700000000')) });
  fs.writeFileSync(path.join(folder, 'old-key.json'), '{}');
  const r = acquireSession(folder, { SESSION_ID: encodeSession(creds('255711111111')) });
  assert.equal(r.status, 'loaded');
  assert.equal(r.phone, '255711111111');
  assert.equal(fs.existsSync(path.join(folder, 'old-key.json')), false);
});

test('tolerates quotes and line breaks added by hosts or copy/paste', () => {
  const id = encodeSession(creds());
  const wrapped = `"${id.slice(0, 40)}\n${id.slice(40, 90)}\r\n${id.slice(90)}"`;
  assert.equal(acquireSession(tmpDir(), { SESSION_ID: wrapped }).status, 'loaded');
});

test('falls back to a session.txt file when no env var is set', () => {
  const folder = tmpDir();
  const file = path.join(tmpDir(), 'session.txt');
  fs.writeFileSync(file, encodeSession(creds()) + '\n');
  assert.equal(acquireSession(folder, {}, { sessionFile: file }).status, 'loaded');
});

test('reports "invalid" for a malformed SESSION_ID', () => {
  const r = acquireSession(tmpDir(), { SESSION_ID: 'garbage-not-a-session' });
  assert.equal(r.status, 'invalid');
  assert.ok(r.message);
});

test('reports "invalid" for an ID from an unfinished pairing (no account linked)', () => {
  const r = acquireSession(tmpDir(), { SESSION_ID: encodeSession({ noiseKey: 'k' }) });
  assert.equal(r.status, 'invalid');
  assert.match(r.message, /unfinished/);
});
