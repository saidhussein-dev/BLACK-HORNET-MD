const test = require('node:test');
const assert = require('node:assert/strict');
const { encodeSession, decodeSession, PREFIX } = require('../src/connection/sessionCodec');

test('encode then decode round-trips the original object', () => {
  const creds = { noiseKey: 'abc', me: { id: '255700000000:1@s.whatsapp.net' }, signedIdentityKey: 'xyz' };
  const sessionId = encodeSession(creds);
  assert.ok(sessionId.startsWith(PREFIX));
  const decoded = decodeSession(sessionId);
  assert.equal(decoded.ok, true);
  assert.deepEqual(decoded.creds, creds);
});

test('decodeSession rejects an empty string', () => {
  const result = decodeSession('');
  assert.equal(result.ok, false);
});

test('decodeSession rejects a string without the expected prefix', () => {
  const result = decodeSession('not-a-real-session-id');
  assert.equal(result.ok, false);
  assert.match(result.error, /prefix/);
});

test('decodeSession rejects corrupted base64/JSON', () => {
  const result = decodeSession(PREFIX + 'this-is-not-valid-base64-json!!!');
  assert.equal(result.ok, false);
});
