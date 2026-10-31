const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { normalizePhone, formatPairingCode } = require('../src/connection/phone');
const { createLimiter } = require('../src/connection/pairLimiter');
const { discardStaleSession } = require('../src/connection/sessionLoader');

test('normalizePhone joins dial code and number, dropping the trunk zero', () => {
  assert.deepEqual(normalizePhone('255', '0778 271 055'), { ok: true, digits: '255778271055' });
  assert.deepEqual(normalizePhone('+255', '778271055'), { ok: true, digits: '255778271055' });
});

test('normalizePhone treats a leading + as a full international number', () => {
  assert.deepEqual(normalizePhone('255', '+254 712 345 678'), { ok: true, digits: '254712345678' });
});

test('normalizePhone rejects empty, too short and too long numbers', () => {
  assert.equal(normalizePhone('255', '').ok, false);
  assert.equal(normalizePhone('255', '12').ok, false);
  assert.equal(normalizePhone('1', '1'.repeat(20)).ok, false);
  assert.equal(normalizePhone('', '778271055').ok, false);
});

test('formatPairingCode splits an 8-char code', () => {
  assert.equal(formatPairingCode('abcd1234'), 'ABCD-1234');
});

test('limiter enforces a minimum gap and a per-window cap, per key', () => {
  let t = 0;
  const l = createLimiter({ max: 3, windowMs: 60000, minGapMs: 2000, now: () => t });
  assert.equal(l.check('a').ok, true);
  t += 500; assert.equal(l.check('a').ok, false); // too fast
  assert.equal(l.check('b').ok, true);             // other key unaffected
  t += 2000; assert.equal(l.check('a').ok, true);
  t += 2000; assert.equal(l.check('a').ok, true);
  t += 2000; assert.equal(l.check('a').ok, false); // cap of 3 reached
  t += 60000; assert.equal(l.check('a').ok, true); // window passed
});

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'bhmd-stale-')); }

test('discardStaleSession wipes an unfinished pairing-code attempt', () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, 'creds.json'), JSON.stringify({ registered: false, me: { id: '255700000000@s.whatsapp.net', name: '~' } }));
  fs.writeFileSync(path.join(dir, 'pre-key-1.json'), '{}');
  assert.equal(discardStaleSession(dir), true);
  assert.deepEqual(fs.readdirSync(dir), []);
});

test('discardStaleSession keeps finished sessions (code-paired or QR-paired)', () => {
  const a = tmp(); fs.writeFileSync(path.join(a, 'creds.json'), JSON.stringify({ registered: true }));
  const b = tmp(); fs.writeFileSync(path.join(b, 'creds.json'), JSON.stringify({ registered: false, account: { details: 'x' } }));
  assert.equal(discardStaleSession(a), false);
  assert.equal(discardStaleSession(b), false);
  assert.ok(fs.existsSync(path.join(a, 'creds.json')) && fs.existsSync(path.join(b, 'creds.json')));
});

test('discardStaleSession is a no-op with no creds.json', () => {
  assert.equal(discardStaleSession(tmp()), false);
});
