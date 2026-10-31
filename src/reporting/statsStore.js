// src/reporting/statsStore.js
// Aggregate counters for the reporting module — cheap to read, so command
// handlers (like .report) can call this on every invocation without scanning
// the whole event log.
const path = require('path');
const config = require('../core/config');
const { JsonStore } = require('../database/jsonStore');

const DEFAULTS = {
  startedAt: Date.now(),
  messagesScanned: 0,
  commandsExecuted: 0,
  threatsBlocked: {}, // { antispam: 3, antibug: 1, ... }
  scansRun: 0,
  reconnects: 0,
  monitorAlerts: 0
};

const store = new JsonStore(path.join(config.storageDir, 'stats.json'), DEFAULTS);

function increment(key, amount = 1) {
  return store.update((s) => {
    s[key] = (s[key] || 0) + amount;
    return s;
  });
}

function incrementThreat(type, amount = 1) {
  return store.update((s) => {
    s.threatsBlocked = s.threatsBlocked || {};
    s.threatsBlocked[type] = (s.threatsBlocked[type] || 0) + amount;
    return s;
  });
}

function getStats() {
  return store.read();
}

function reset() {
  store.write({ ...DEFAULTS, startedAt: Date.now() });
}

module.exports = { increment, incrementThreat, getStats, reset };
