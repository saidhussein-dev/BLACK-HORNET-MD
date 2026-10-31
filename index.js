// index.js — BLACK HORNET MD entry point
'use strict';

const config = require('./src/core/config');
const logger = require('./src/core/logger').child('MAIN');
const errorHandler = require('./src/recovery/errorHandler');
const systemMonitor = require('./src/monitoring/systemMonitor');
const alertConfig = require('./src/monitoring/alertConfig');

const pairingServerModule = require('./src/connection/pairingServer');
const { startBot } = require('./src/connection/baileysClient');
const { handleMessage } = require('./src/connection/messageHandler');

// Resolve the pairing server export without assuming its export style.
const startPairingServer =
  typeof pairingServerModule.startPairingServer === 'function'
    ? pairingServerModule.startPairingServer
    : typeof pairingServerModule === 'function'
      ? pairingServerModule
      : null;

async function main() {
  console.log(`
  ╔══════════════════════════════════════════╗
  ║   🐝  BLACK HORNET MD  —  v${config.version}
  ║   WhatsApp Security Research & Defense
  ╚══════════════════════════════════════════╝
  `);

  errorHandler.install();

  if (!config.owners.length) {
    logger.warn(
      'No OWNER_1 configured in .env — owner-only commands will be unreachable.'
    );
  }

  if (typeof startBot !== 'function') {
    throw new Error(
      'startBot is not exported by src/connection/baileysClient.js'
    );
  }

  // Shared state used by the WhatsApp connection and pairing server.
  const pairingState = {
    sock: null,
    latestQR: null,
    connectedPhone: null,
    connectedAt: null,
    bootRegistered: false,
    sessionSent: false
  };

  // Start the pairing website when its server function is available.
  if (startPairingServer) {
    const serverState = startPairingServer();

    if (serverState && typeof serverState === 'object') {
      Object.assign(pairingState, serverState);
    }

    logger.info('Pairing server initialized.');
  } else {
    logger.error(
      'startPairingServer is not exported by pairingServer.js. ' +
      'Starting WhatsApp without the pairing website.'
    );
  }

  await startBot(
    {
      onMessage: (sock, upsert) => handleMessage(sock, upsert)
    },
    pairingState
  );

  systemMonitor.startSampler((snap, reasons) => {
    if (!alertConfig.isEnabled() || !config.owners.length) return;

    const ownerJid = `${config.owners[0]}@s.whatsapp.net`;

    pairingState.sock?.sendMessage(ownerJid, {
      text:
        `⚠️ *System Monitor Alert*\n\n` +
        `${reasons.join('\n')}\n\n` +
        `Snapshot: CPU ${snap.cpuLoadPercent}%, ` +
        `mem ${snap.processMemoryMB}MB, ` +
        `event-loop ${snap.eventLoopDelayMs}ms`
    }).catch(() => {});
  });

  logger.info(
    `Bot initialization complete — port ${config.port}, monitoring events.`
  );
}

main().catch((err) => {
  console.error('💥 Critical error during startup:', err);
  process.exit(1);
});
