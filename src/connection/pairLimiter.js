// src/connection/pairLimiter.js
// Tiny in-memory per-key limiter for the "get pairing code" endpoint. Users
// MUST be able to request a new code any time (wrong code, expired code), so
// this only stops hammering: a short minimum gap plus a per-minute cap.
function createLimiter({ max = 8, windowMs = 60000, minGapMs = 2000, now = Date.now } = {}) {
  const hits = new Map(); // key -> number[] timestamps

  return {
    /** @returns {{ ok: true } | { ok: false, retryAfterMs: number }} */
    check(key) {
      const t = now();
      const list = (hits.get(key) || []).filter((ts) => t - ts < windowMs);
      if (list.length && t - list[list.length - 1] < minGapMs) {
        return { ok: false, retryAfterMs: minGapMs - (t - list[list.length - 1]) };
      }
      if (list.length >= max) return { ok: false, retryAfterMs: windowMs - (t - list[0]) };
      list.push(t);
      hits.set(key, list);
      if (hits.size > 5000) hits.clear(); // hard cap on memory
      return { ok: true };
    }
  };
}

module.exports = { createLimiter };
