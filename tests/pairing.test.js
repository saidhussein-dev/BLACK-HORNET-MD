const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizePhone, formatPairingCode } = require('../src/connection/phone');

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
