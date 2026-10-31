const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { acquireSession, exportSessionId } = require('../src/connection/sessionLoader');
const { encodeSession } = require('../src/connection/sessionCodec');

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'bhmd-session-'));
}

test('reports "missing" when there is no SESSION_ID and no creds.json on disk', () => {
  const folder = tmpDir();
  const result = acquireSession(folder, {});
  assert.equal(result.status, 'missing');
});

test('reports "unchanged" when creds.json already exists and no SESSION_ID is given', () => {
  const folder = tmpDir();
  fs.writeFileSync(path.join(folder, 'creds.json'), JSON.stringify({ me: 'x' }));
  const result = acquireSession(folder, {});
  assert.equal(result.status, 'unchanged');
});

test('loads a valid SESSION_ID and writes creds.json', () => {
  const folder = tmpDir();
  const creds = { me: { id: '255700000000:1@s.whatsapp.net' } };
  const sessionId = encodeSession(creds);
  const result = acquireSession(folder, { SESSION_ID: sessionId });
  assert.equal(result.status, 'loaded');
  const written = JSON.parse(fs.readFileSync(path.join(folder, 'creds.json'), 'utf8'));
  assert.deepEqual(written, creds);
});

test('reports "invalid" for a malformed SESSION_ID', () => {
  const folder = tmpDir();
  const result = acquireSession(folder, { SESSION_ID: 'garbage-not-a-session' });
  assert.equal(result.status, 'invalid');
  assert.ok(result.message);
});

test('exportSessionId returns null when there is no creds.json yet', () => {
  const folder = tmpDir();
  assert.equal(exportSessionId(folder), null);
});

test('exportSessionId round-trips with acquireSession', () => {
  const folder = tmpDir();
  const creds = { me: { id: '255711111111:1@s.whatsapp.net' }, noiseKey: 'k' };
  const sessionId = encodeSession(creds);
  acquireSession(folder, { SESSION_ID: sessionId });
  const exported = exportSessionId(folder);
  assert.equal(exported, sessionId);
});
