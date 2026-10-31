// src/detection/patternDetector.js
// Combines the Blue Team validator + anomaly detector into one 0-100 threat
// score with a verdict, for the `.scan` command and the research/reporting
// pipeline. Detection and scoring ONLY — this module never constructs or
// sends a malicious payload.
const validator = require('../blueteam/validator');
const anomalyDetector = require('./anomalyDetector');

function verdictFor(score) {
  if (score >= 70) return 'HIGH RISK';
  if (score >= 35) return 'SUSPICIOUS';
  if (score > 0) return 'LOW RISK';
  return 'CLEAN';
}

/**
 * @param {object} input Same shape as validator.validateMessage, plus optional `sender`.
 * @returns {{ score: number, verdict: string, reasons: string[], metrics: object }}
 */
function scanPayload(input = {}) {
  const { suspicious, reasons, metrics } = validator.validateMessage(input);
  let score = 0;
  const allReasons = [...reasons];

  // Each structural flag contributes to the score; a message can trip more than one.
  if (metrics.textLength > 0) {
    if (reasons.some((r) => r.includes('oversized text'))) score += 25;
    if (reasons.some((r) => r.includes('invisible'))) score += 30;
    if (reasons.some((r) => r.includes('repeated-character'))) score += 25;
  }
  if (reasons.some((r) => r.includes('vCard'))) score += 25;
  if (reasons.some((r) => r.includes('contact-array'))) score += 30;
  if (reasons.some((r) => r.includes('mass-mention'))) score += 20;

  if (input.sender) {
    const anomaly = anomalyDetector.observe(input.sender, { length: metrics.textLength });
    if (anomaly.score > 0) {
      score += Math.round(anomaly.score * 0.4); // anomaly contributes, but structural flags dominate
      allReasons.push(...anomaly.reasons);
    }
  }

  score = Math.min(100, score);

  return { score, verdict: verdictFor(score), reasons: allReasons, metrics, suspicious };
}

module.exports = { scanPayload, verdictFor };
