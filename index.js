// index.js — BLACK HORNET MD entry point
const config = require('./src/core/config');
const logger = require('./src/core/logger').child('MAIN');
const errorHandler = require('./src/recovery/errorHandler');
const systemMonitor = require('./src/monitoring/systemMonitor');
const alertConfig = require('./src/monitoring/alertConfig');
const { startPairingServer } = require('./src/connection/pairingServer');
const { startBot } = require('./src/connection/baileysClient');
const { handleMessage } = require('./src/connection/messageHandler');

async function main() {
  console.log(`
  ╔══════════════════════════════════════════╗
  ║   🐝  BLACK HORNET MD  —  v${config.version}
  ║   WhatsApp Security Research & Defense
  ╚══════════════════════════════════════════╝
  `);

  errorHandler.install();

  if (!config.owners.length) {
    logger.warn('No OWNER_1 configured in .env — owner-only commands will be unreachable. See .env.example.');
  }

  // Web pairing site: shows a live QR while unpaired, and a portable
  // SESSION_ID once connected (useful on hosts where the console can't
  // render a scannable QR, or where disk isn't guaranteed to persist).
  const pairingState = startPairingServer();

  await startBot({
    onMessage: (s, upsert) => handleMessage(s, upsert)
  }, pairingState);

  // System monitor always samples (so history/reporting stay populated);
  // whether it PUSHES an alert to the owner is gated by alertConfig / .sysmonitor.
  systemMonitor.startSampler((snap, reasons) => {
    if (!alertConfig.isEnabled() || !config.owners.length) return;
    const ownerJid = `${config.owners[0]}@s.whatsapp.net`;
    pairingState.sock?.sendMessage(ownerJid, {
      text: `⚠️ *System Monitor Alert*\n\n${reasons.join('\n')}\n\nSnapshot: CPU ${snap.cpuLoadPercent}%, mem ${snap.processMemoryMB}MB, event-loop ${snap.eventLoopDelayMs}ms`
    }).catch(() => {});
  });

  logger.info(`bot initialization complete — pairing site on port ${config.port}, monitoring events.`);
}

main().catch((err) => {
  console.error('💥 Critical error during startup:', err);
  process.exit(1);
});
