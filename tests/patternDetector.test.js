const test = require('node:test');
const assert = require('node:assert/strict');
const patternDetector = require('../src/detection/patternDetector');

test('clean message scores 0 and verdict CLEAN', () => {
  const result = patternDetector.scanPayload({ text: 'hello there' });
  assert.equal(result.score, 0);
  assert.equal(result.verdict, 'CLEAN');
});

test('oversized + invisible-char payload scores HIGH RISK', () => {
  const text = 'a'.repeat(5000) + '​'.repeat(300);
  const result = patternDetector.scanPayload({ text });
  assert.ok(result.score >= 70);
  assert.equal(result.verdict, 'HIGH RISK');
});

test('verdictFor boundaries', () => {
  assert.equal(patternDetector.verdictFor(0), 'CLEAN');
  assert.equal(patternDetector.verdictFor(10), 'LOW RISK');
  assert.equal(patternDetector.verdictFor(50), 'SUSPICIOUS');
  assert.equal(patternDetector.verdictFor(90), 'HIGH RISK');
});
