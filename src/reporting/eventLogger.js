// src/reporting/eventLogger.js
// Append-only, capped event log for every security-relevant thing the bot does:
// blocked payloads, rate-limit trips, reconnects, monitor alerts, scans. This is
// what REPORTING and the SECURITY SCANNER's "threatlog" are built from.
const path = require('path');
const config = require('../core/config');
const { JsonStore } = require('../database/jsonStore');

const store = new JsonStore(path.join(config.storageDir, 'events.json'), { events: [] });

/**
 * @param {string} category One of BLUE_TEAM | SCANNER | MONITOR | RECOVERY | SYSTEM
 * @param {string} action Short action name, e.g. "antispam.block"
 * @param {object} data Arbitrary JSON-serializable detail
 */
function logEvent(category, action, data = {}) {
  try {
    store.update((state) => {
      const events = state.events || [];
      events.push({
        ts: Date.now(),
        iso: new Date().toISOString(),
        category,
        action,
        data
      });
      // Cap to the configured max so the file never grows without bound.
      const max = config.reporting.maxEvents;
      const trimmed = events.length > max ? events.slice(events.length - max) : events;
      return { events: trimmed };
    });
  } catch (_) { /* event logging must never break the caller */ }
}

/** Most recent `limit` events, newest first. Optionally filtered by category. */
function recentEvents(limit = 50, category = null) {
  const events = store.read().events || [];
  const filtered = category ? events.filter((e) => e.category === category) : events;
  return filtered.slice(-limit).reverse();
}

function allEvents() {
  return store.read().events || [];
}

function clear() {
  store.write({ events: [] });
}

module.exports = { logEvent, recentEvents, allEvents, clear };
