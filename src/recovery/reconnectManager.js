// src/recovery/reconnectManager.js
// Exponential-backoff reconnect scheduling + a short history of connection
// events, so RECOVERY has something real to report on. Adapted from VORTE
// PRO's client.js reconnect logic, generalized into its own module.
const logger = require('../core/logger').child('RECOVERY');
const eventLogger = require('../reporting/eventLogger');
const statsStore = require('../reporting/statsStore');

const MAX_DELAY_MS = 60000;
const BASE_DELAY_MS = 5000;

let attempts = 0;
let timer = null;
const history = [];

function recordHistory(entry) {
  history.push({ ts: Date.now(), ...entry });
  if (history.length > 100) history.shift();
}

/**
 * @param {Function} reconnectFn async () => void — performs the actual reconnect.
 * @param {string} reason Human-readable reason the connection dropped.
 */
function scheduleReconnect(reconnectFn, reason = 'unknown') {
  if (timer) return; // one pending attempt at a time
  const delay = Math.min(BASE_DELAY_MS * 2 ** attempts, MAX_DELAY_MS) + Math.random() * 1000;
  recordHistory({ event: 'scheduled', reason, delayMs: Math.round(delay), attempt: attempts + 1 });
  logger.info(`reconnecting in ${Math.round(delay / 1000)}s (attempt ${attempts + 1}), reason: ${reason}`);

  timer = setTimeout(async () => {
    timer = null;
    attempts++;
    statsStore.increment('reconnects');
    eventLogger.logEvent('RECOVERY', 'reconnect.attempt', { attempt: attempts, reason });
    try {
      await reconnectFn();
      recordHistory({ event: 'succeeded', attempt: attempts });
      resetAttempts();
    } catch (err) {
      recordHistory({ event: 'failed', attempt: attempts, error: err?.message });
      logger.error('reconnect attempt failed:', err?.message);
      scheduleReconnect(reconnectFn, `retry after failure: ${err?.message}`);
    }
  }, delay);
  if (timer.unref) timer.unref();
}

function resetAttempts() {
  attempts = 0;
}

function cancel() {
  if (timer) clearTimeout(timer);
  timer = null;
}

function getStatus() {
  return { attempts, pending: !!timer, history: history.slice(-20).reverse() };
}

module.exports = { scheduleReconnect, resetAttempts, cancel, getStatus };
