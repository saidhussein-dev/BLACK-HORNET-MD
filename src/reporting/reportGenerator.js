// src/reporting/reportGenerator.js
// Builds a human-readable security report from statsStore + eventLogger +
// the live system snapshot, and can save it to reports/ as Markdown.
const fs = require('fs');
const path = require('path');
const config = require('../core/config');
const statsStore = require('./statsStore');
const eventLogger = require('./eventLogger');
const systemMonitor = require('../monitoring/systemMonitor');
const reconnectManager = require('../recovery/reconnectManager');

function formatDuration(ms) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h}h ${m}m ${sec}s`;
}

function buildReport() {
  const stats = statsStore.getStats();
  const snap = systemMonitor.snapshot();
  const recent = eventLogger.recentEvents(15);
  const recovery = reconnectManager.getStatus();

  const threatLines = Object.entries(stats.threatsBlocked || {})
    .sort((a, b) => b[1] - a[1])
    .map(([type, count]) => `  • ${type}: ${count}`)
    .join('\n') || '  • none recorded yet';

  const recentLines = recent
    .map((e) => `  • [${e.iso}] ${e.category}/${e.action}`)
    .join('\n') || '  • no events yet';

  const text = `
╔══════════════════════════════════════╗
║   ${config.botName} — SECURITY REPORT
╚══════════════════════════════════════╝

Generated: ${new Date().toISOString()}
Uptime since last restart: ${formatDuration(Date.now() - stats.startedAt)}

── TRAFFIC ──────────────────────────────
Messages scanned   : ${stats.messagesScanned}
Commands executed  : ${stats.commandsExecuted}
Scanner runs        : ${stats.scansRun}

── THREATS BLOCKED ──────────────────────
${threatLines}

── SYSTEM HEALTH (current) ──────────────
CPU load            : ${snap.cpuLoadPercent}% (${snap.cores} cores)
Process memory      : ${snap.processMemoryMB} MB
System memory used  : ${snap.systemMemoryUsedPercent}%
Event-loop delay     : ${snap.eventLoopDelayMs} ms (peak ${snap.eventLoopDelayMaxMs} ms)
Monitor alerts fired : ${stats.monitorAlerts}

── RECOVERY ──────────────────────────────
Reconnects so far    : ${stats.reconnects}
Reconnect attempts pending: ${recovery.pending ? 'yes' : 'no'}

── RECENT EVENTS (last 15) ───────────────
${recentLines}
`.trim();

  return { text, stats, snapshot: snap, recentEvents: recent, recovery };
}

function saveReportToFile() {
  const { text } = buildReport();
  if (!fs.existsSync(config.reportsDir)) fs.mkdirSync(config.reportsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filePath = path.join(config.reportsDir, `report-${stamp}.md`);
  fs.writeFileSync(filePath, text, 'utf8');
  return filePath;
}

module.exports = { buildReport, saveReportToFile };
