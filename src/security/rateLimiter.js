'use strict';

// In-memory sliding-window rate limiter and cooldown manager.

class SlidingWindowLimiter {
  /**
   * @param {number} windowMs Window duration in milliseconds.
   * @param {number} maxEvents Maximum allowed events within the window.
   */
  constructor(windowMs, maxEvents) {
    if (!Number.isFinite(windowMs) || windowMs <= 0) {
      throw new TypeError('windowMs must be a positive number');
    }

    if (!Number.isInteger(maxEvents) || maxEvents < 1) {
      throw new TypeError('maxEvents must be a positive integer');
    }

    this.windowMs = windowMs;
    this.maxEvents = maxEvents;
    this.buckets = new Map();
  }

  /**
   * Record an event.
   * Returns true when the event exceeds the configured limit.
   */
  hit(key) {
    if (typeof key !== 'string' || !key) {
      throw new TypeError('Rate limiter key must be a non-empty string');
    }

    const now = Date.now();

    const timestamps = (this.buckets.get(key) || [])
      .filter((timestamp) => now - timestamp < this.windowMs);

    timestamps.push(now);
    this.buckets.set(key, timestamps);

    return timestamps.length > this.maxEvents;
  }

  /**
   * Get the current event count without recording another event.
   */
  count(key) {
    if (typeof key !== 'string' || !key) {
      return 0;
    }

    const now = Date.now();

    const timestamps = (this.buckets.get(key) || [])
      .filter((timestamp) => now - timestamp < this.windowMs);

    if (timestamps.length) {
      this.buckets.set(key, timestamps);
    } else {
      this.buckets.delete(key);
    }

    return timestamps.length;
  }

  reset(key) {
    this.buckets.delete(key);
  }

  /**
   * Remove expired buckets.
   */
  sweep() {
    const now = Date.now();

    for (const [key, timestamps] of this.buckets) {
      const fresh = timestamps.filter(
        (timestamp) => now - timestamp < this.windowMs
      );

      if (fresh.length === 0) {
        this.buckets.delete(key);
      } else {
        this.buckets.set(key, fresh);
      }
    }
  }
}

/**
 * Simple per-key cooldown manager.
 */
class Cooldown {
  constructor(cooldownMs) {
    if (!Number.isFinite(cooldownMs) || cooldownMs <= 0) {
      throw new TypeError('cooldownMs must be a positive number');
    }

    this.cooldownMs = cooldownMs;
    this.last = new Map();
  }

  /**
   * Returns true when the key is still on cooldown.
   * Successful checks record the current timestamp.
   */
  check(key) {
    if (typeof key !== 'string' || !key) {
      throw new TypeError('Cooldown key must be a non-empty string');
    }

    const now = Date.now();
    const last = this.last.get(key) || 0;

    if (now - last < this.cooldownMs) {
      return true;
    }

    this.last.set(key, now);

    return false;
  }

  /**
   * Remove expired cooldown entries.
   */
  sweep() {
    const now = Date.now();

    for (const [key, timestamp] of this.last) {
      if (now - timestamp > this.cooldownMs * 10) {
        this.last.delete(key);
      }
    }
  }

  reset(key) {
    this.last.delete(key);
  }
}

module.exports = {
  SlidingWindowLimiter,
  Cooldown
};
