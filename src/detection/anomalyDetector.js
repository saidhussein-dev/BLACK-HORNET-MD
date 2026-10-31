// src/detection/anomalyDetector.js
// Lightweight behavioral-anomaly scoring: is this sender's current message
// frequency/size far outside their own recent baseline? Pure statistics over
// in-memory per-sender history, no payload generation of any kind.
const HISTORY_LIMIT = 50;
const history = new Map(); // sender -> [{ ts, length }]

function mean(arr) { return arr.reduce((a, b) => a + b, 0) / (arr.length || 1); }
function stddev(arr, avg) {
  if (arr.length < 2) return 0;
  const variance = arr.reduce((sum, v) => sum + (v - avg) ** 2, 0) / (arr.length - 1);
  return Math.sqrt(variance);
}

/**
 * Record one message and return an anomaly score (0-100) for it relative to
 * the sender's own history.
 * @returns {{ score: number, burst: boolean, reasons: string[] }}
 */
function observe(sender, { length = 0, ts = Date.now() } = {}) {
  const hist = history.get(sender) || [];
  const reasons = [];
  let score = 0;

  if (hist.length >= 5) {
    const intervals = [];
    for (let i = 1; i < hist.length; i++) intervals.push(hist[i].ts - hist[i - 1].ts);
    const avgInterval = mean(intervals);
    const lastInterval = ts - hist[hist.length - 1].ts;
    if (avgInterval > 0 && lastInterval < avgInterval * 0.15) {
      score += 35;
      reasons.push('message arrived far faster than this sender\'s usual pace');
    }

    const lengths = hist.map((h) => h.length);
    const avgLen = mean(lengths);
    const sd = stddev(lengths, avgLen);
    if (sd > 0 && length > avgLen + sd * 3) {
      score += 35;
      reasons.push('message size is a statistical outlier vs. this sender\'s history');
    }
  }

  // Burst: 5+ messages inside 2 seconds, independent of long-term baseline.
  const recentWindow = hist.filter((h) => ts - h.ts < 2000);
  const burst = recentWindow.length >= 5;
  if (burst) { score += 30; reasons.push('burst of 5+ messages within 2 seconds'); }

  hist.push({ ts, length });
  if (hist.length > HISTORY_LIMIT) hist.shift();
  history.set(sender, hist);

  return { score: Math.min(score, 100), burst, reasons };
}

function reset(sender) {
  if (sender) history.delete(sender);
  else history.clear();
}

module.exports = { observe, reset };
