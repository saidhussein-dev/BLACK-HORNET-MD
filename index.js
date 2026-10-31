// index.js — BLACK HORNET MD entry point
const config = require('./src/core/config');
const logger = require('./src/core/logger').child('MAIN');
const errorHandler = require('./src/recovery/errorHandler');
const systemMonitor = require('./src/monitoring/systemMonitor');
const alertConfig = require('./src/monitoring/alertConfig');
const { startGeneratorServer } = require('./src/generator/server');
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

  // Session ID generator website (pair code or QR -> SESSION_ID). It runs on PORT in both modes and
  // never touches the bot's own connection. SESSION_GENERATOR_ONLY=true turns a deployment (e.g. Render)
  // into the website only: no bot is started there.
  const { pairingState } = startGeneratorServer();

  if (process.env.SESSION_GENERATOR_ONLY === 'true') {
    logger.info('SESSION_GENERATOR_ONLY is true — the bot will NOT start. Serving the session generator site only.');
    return;
  }

  if (!config.owners.length) {
    logger.warn('No OWNER_1 configured in .env — owner-only commands will be unreachable. See .env.example.');
  }

  // The bot logs in with a SESSION_ID (env var or session.txt); without one it stays idle.
  const sock = await startBot({
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

  logger.info(sock
    ? `bot initialization complete — site on port ${config.port}, monitoring events.`
    : `bot is idle (no SESSION_ID) — site on port ${config.port}.`);
}

main().catch((err) => {
  console.error('💥 Critical error during startup:', err);
  process.exit(1);
});
