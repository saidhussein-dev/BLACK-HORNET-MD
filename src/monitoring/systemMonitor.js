// src/monitoring/systemMonitor.js
// CPU, RAM, event-loop lag and uptime monitoring. Uses only Node built-ins
// (os, perf_hooks) — no external dependency needed for this.
const os = require('os');
const { monitorEventLoopDelay } = require('perf_hooks');
const config = require('../core/config');
const eventLogger = require('../reporting/eventLogger');
const statsStore = require('../reporting/statsStore');

const elDelay = monitorEventLoopDelay({ resolution: 20 });
elDelay.enable();

const history = []; // ring buffer of snapshots

function cpuLoadPercent() {
  // Approximate instantaneous CPU load from the 1-minute loadavg relative to core count.
  // (A true instantaneous reading needs two os.cpus() samples over time; loadavg is
  // the standard cheap proxy and is what most monitoring tools show on Linux/macOS.)
  const cores = os.cpus().length || 1;
  const load1 = os.loadavg()[0];
  return Math.min(100, Math.round((load1 / cores) * 100));
}

function snapshot() {
  const mem = process.memoryUsage();
  const sys = { total: os.totalmem(), free: os.freemem() };
  const eventLoopDelayMs = elDelay.mean / 1e6; // nanoseconds -> ms

  const snap = {
    ts: Date.now(),
    uptimeSec: Math.floor(process.uptime()),
    cpuLoadPercent: cpuLoadPercent(),
    loadavg: os.loadavg(),
    cores: os.cpus().length,
    processMemoryMB: Math.round(mem.rss / 1e6),
    heapUsedMB: Math.round(mem.heapUsed / 1e6),
    systemMemoryUsedPercent: Math.round(((sys.total - sys.free) / sys.total) * 100),
    systemMemoryTotalMB: Math.round(sys.total / 1e6),
    eventLoopDelayMs: Number.isFinite(eventLoopDelayMs) ? Math.round(eventLoopDelayMs * 100) / 100 : 0,
    eventLoopDelayMaxMs: Number.isFinite(elDelay.max / 1e6) ? Math.round((elDelay.max / 1e6) * 100) / 100 : 0
  };

  history.push(snap);
  if (history.length > config.monitor.historySize) history.shift();

  return snap;
}

function getHistory(limit = 50) {
  return history.slice(-limit);
}

let samplerInterval = null;
let alertCallback = null;

/** Start periodic sampling; calls `onAlert(snap, reasons)` when a threshold is breached. */
function startSampler(onAlert) {
  alertCallback = onAlert || null;
  if (samplerInterval) return;
  samplerInterval = setInterval(() => {
    const snap = snapshot();
    const reasons = [];
    if (snap.eventLoopDelayMs > config.monitor.eventLoopWarnMs) reasons.push(`event-loop delay ${snap.eventLoopDelayMs}ms > ${config.monitor.eventLoopWarnMs}ms`);
    if (snap.processMemoryMB > config.monitor.memoryWarnMB) reasons.push(`process memory ${snap.processMemoryMB}MB > ${config.monitor.memoryWarnMB}MB`);
    if (reasons.length) {
      statsStore.increment('monitorAlerts');
      eventLogger.logEvent('MONITOR', 'threshold.alert', { snapshot: snap, reasons });
      if (alertCallback) { try { alertCallback(snap, reasons); } catch (_) {} }
    }
  }, config.monitor.sampleIntervalMs);
  samplerInterval.unref();
}

function stopSampler() {
  if (samplerInterval) clearInterval(samplerInterval);
  samplerInterval = null;
}

module.exports = { snapshot, getHistory, startSampler, stopSampler };
