// src/blueteam/rateLimiter.js
// Generic sliding-window rate limiter, used both for raw-message flood
// detection (antispam) and per-sender command cooldowns. Pure in-memory —
// state resets on restart, which is fine for rate limiting.
class SlidingWindowLimiter {
  /**
   * @param {number} windowMs Window size in milliseconds.
   * @param {number} maxEvents Events allowed within the window before `hit()` reports a trip.
   */
  constructor(windowMs, maxEvents) {
    this.windowMs = windowMs;
    this.maxEvents = maxEvents;
    this.buckets = new Map(); // key -> timestamps[]
  }

  /** Record one event for `key`. Returns true if this event exceeds the limit. */
  hit(key) {
    const now = Date.now();
    const timestamps = (this.buckets.get(key) || []).filter((t) => now - t < this.windowMs);
    timestamps.push(now);
    this.buckets.set(key, timestamps);
    return timestamps.length > this.maxEvents;
  }

  /** Current count within the window, without recording a new event. */
  count(key) {
    const now = Date.now();
    const timestamps = (this.buckets.get(key) || []).filter((t) => now - t < this.windowMs);
    return timestamps.length;
  }

  reset(key) {
    this.buckets.delete(key);
  }

  /** Periodic sweep so the map never grows without bound. Call on an unref'd interval. */
  sweep() {
    const now = Date.now();
    for (const [key, timestamps] of this.buckets) {
      const fresh = timestamps.filter((t) => now - t < this.windowMs);
      if (fresh.length === 0) this.buckets.delete(key);
      else this.buckets.set(key, fresh);
    }
  }
}

/** Simple cooldown: true if `key` acted within `cooldownMs`. */
class Cooldown {
  constructor(cooldownMs) {
    this.cooldownMs = cooldownMs;
    this.last = new Map();
  }

  /** Returns true if the caller is still on cooldown (should be rejected). Updates the timestamp either way is avoided — only a pass is recorded. */
  check(key) {
    const now = Date.now();
    const last = this.last.get(key) || 0;
    if (now - last < this.cooldownMs) return true;
    this.last.set(key, now);
    return false;
  }

  sweep() {
    const now = Date.now();
    for (const [key, t] of this.last) if (now - t > this.cooldownMs * 10) this.last.delete(key);
  }
}

module.exports = { SlidingWindowLimiter, Cooldown };
