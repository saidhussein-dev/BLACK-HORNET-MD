const test = require('node:test');
const assert = require('node:assert/strict');
const anomalyDetector = require('../src/detection/anomalyDetector');

test('first message from a sender has no anomaly score', () => {
  anomalyDetector.reset('tester-1');
  const result = anomalyDetector.observe('tester-1', { length: 20 });
  assert.equal(result.score, 0);
  assert.equal(result.burst, false);
});

test('burst of 5+ messages in under 2s is detected', () => {
  anomalyDetector.reset('tester-2');
  const now = Date.now();
  let result;
  for (let i = 0; i < 6; i++) {
    result = anomalyDetector.observe('tester-2', { length: 20, ts: now + i * 100 });
  }
  assert.equal(result.burst, true);
  assert.ok(result.score > 0);
});

test('reset clears history for a sender', () => {
  anomalyDetector.reset('tester-3');
  anomalyDetector.observe('tester-3', { length: 10 });
  anomalyDetector.reset('tester-3');
  const result = anomalyDetector.observe('tester-3', { length: 10 });
  assert.equal(result.score, 0); // behaves like a fresh sender again
});
