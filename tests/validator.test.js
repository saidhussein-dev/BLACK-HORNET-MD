const test = require('node:test');
const assert = require('node:assert/strict');
const validator = require('../src/blueteam/validator');

test('clean short text is not suspicious', () => {
  const result = validator.validateMessage({ text: 'hello world' });
  assert.equal(result.suspicious, false);
  assert.deepEqual(result.reasons, []);
});

test('oversized text is flagged', () => {
  const result = validator.validateMessage({ text: 'a'.repeat(5000) });
  assert.equal(result.suspicious, true);
  assert.ok(result.reasons.some((r) => r.includes('oversized text')));
});

test('excessive zero-width characters are flagged', () => {
  const text = 'hi' + '​'.repeat(300);
  const result = validator.validateMessage({ text });
  assert.equal(result.suspicious, true);
  assert.ok(result.reasons.some((r) => r.includes('invisible')));
});

test('repeated-character flood is flagged', () => {
  const result = validator.validateMessage({ text: 'x'.repeat(1000) });
  assert.equal(result.suspicious, true);
  assert.ok(result.reasons.some((r) => r.includes('repeated-character')));
});

test('oversized vCard is flagged', () => {
  const result = validator.validateMessage({ text: 'hi', vcard: 'V'.repeat(5000) });
  assert.ok(result.reasons.some((r) => r.includes('vCard')));
});

test('contact-array bomb is flagged', () => {
  const vcardArray = Array.from({ length: 60 }, () => ({ vcard: 'short' }));
  const result = validator.validateMessage({ text: 'hi', vcardArray });
  assert.ok(result.reasons.some((r) => r.includes('contact-array')));
});

test('mass mentions are flagged', () => {
  const mentionedJid = Array.from({ length: 20 }, (_, i) => `${i}@s.whatsapp.net`);
  const result = validator.validateMessage({ text: 'hi', mentionedJid });
  assert.ok(result.reasons.some((r) => r.includes('mass-mention')));
});

test('longestRepeatedRun counts correctly', () => {
  assert.equal(validator.longestRepeatedRun('aaabbbbbc'), 5);
  assert.equal(validator.longestRepeatedRun(''), 0);
  assert.equal(validator.longestRepeatedRun('abc'), 1);
});
