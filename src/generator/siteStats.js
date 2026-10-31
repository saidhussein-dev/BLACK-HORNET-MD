// src/generator/siteStats.js — REAL counters for the Session ID site (no simulation).
// Persisted to storage/site-stats.json (survives restarts on hosts that keep the disk).
//   visitors   unique browsers (one cookie each), bots excluded
//   pageViews  page loads
//   successful session IDs actually generated
//   failed     code request failed, session could not be extracted, or a code pairing timed out
//   retries    a new code/QR was requested while an earlier attempt was still waiting (NOT a failure)
//   downloads  bot-file downloads
const fs = require('fs');
const path = require('path');
const config = require('../core/config');

const FILE = path.join(config.storageDir, 'site-stats.json');
const KEYS = ['visitors', 'pageViews', 'successful', 'failed', 'retries', 'downloads'];
const state = { visitors: 0, pageViews: 0, successful: 0, failed: 0, retries: 0, downloads: 0, since: new Date().toISOString() };

try {
  const saved = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  for (const k of KEYS) if (Number.isFinite(saved[k]) && saved[k] >= 0) state[k] = Math.floor(saved[k]);
  if (typeof saved.since === 'string') state.since = saved.since;
} catch { /* first run, or unreadable file: start from zero */ }

let timer = null;
function writeNow() {
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    const tmp = FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(state));
    fs.renameSync(tmp, FILE); // atomic: a crash never leaves half a file
  } catch (e) { console.error('site stats not saved:', e.message); }
}
function save() { if (!timer) { timer = setTimeout(() => { timer = null; writeNow(); }, 2000); if (timer.unref) timer.unref(); } }
process.on('exit', () => { if (timer) writeNow(); });

const bump = (k) => () => { state[k]++; save(); };

module.exports = {
  newVisitor: bump('visitors'),
  pageView: bump('pageViews'),
  success: bump('successful'),
  fail: bump('failed'),
  retry: bump('retries'),
  download: bump('downloads'),
  snapshot: () => ({ ...state })
};
