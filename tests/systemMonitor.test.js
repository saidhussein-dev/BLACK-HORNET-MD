const test = require('node:test');
const assert = require('node:assert/strict');
const systemMonitor = require('../src/monitoring/systemMonitor');

test('snapshot returns well-formed metrics', () => {
  const s = systemMonitor.snapshot();
  assert.equal(typeof s.cpuLoadPercent, 'number');
  assert.equal(typeof s.processMemoryMB, 'number');
  assert.equal(typeof s.eventLoopDelayMs, 'number');
  assert.equal(typeof s.uptimeSec, 'number');
  assert.ok(s.cpuLoadPercent >= 0 && s.cpuLoadPercent <= 100);
  assert.ok(Array.isArray(s.loadavg) && s.loadavg.length === 3);
});

test('getHistory grows as snapshots are taken', () => {
  const before = systemMonitor.getHistory(1000).length;
  systemMonitor.snapshot();
  systemMonitor.snapshot();
  const after = systemMonitor.getHistory(1000).length;
  assert.ok(after >= before + 2);
});
