'use strict';

require('dotenv').config();

const config = require('./src/core/config');
const logger = require('./src/core/logger').child('MAIN');

const errorHandler = require('./src/recovery/errorHandler');
const systemMonitor = require('./src/monitoring/systemMonitor');
const alertConfig = require('./src/monitoring/alertConfig');

const { startGeneratorServer } = require('./src/generator/server');
const { startBot } = require('./src/connection/baileysClient');
const { handleMessage } = require('./src/connection/messageHandler');

function displayBanner() {
  console.log(`
╔══════════════════════════════════════════╗
║                                          ║
║ BLACK HORNET MD                          ║
║ Version: ${config.version}
╚══════════════════════════════════════════╝
  `);
}

function startMonitoring(pairingState) {
  systemMonitor.startSampler((snapshot, reasons) => {
    if (!alertConfig.isEnabled()) return;
    if (!config.owners.length) return;

    const ownerJid = `${config.owners[0]}@s.whatsapp.net`;

    const message = [
      '⚠️ *System Monitor Alert*',
      '',
      ...reasons,
      '',
      `CPU: ${snapshot.cpuLoadPercent}%`,
      `Memory: ${snapshot.processMemoryMB} MB`,
      `Event Loop: ${snapshot.eventLoopDelayMs} ms`
    ].join('\n');

    pairingState.sock
      ?.sendMessage(ownerJid, { text: message })
      .catch((error) => {
        logger.error(`Failed to send monitoring alert: ${error.message}`);
      });
  });
}

async function main() {
  displayBanner();

  errorHandler.install();

  // Start session generator website.
  const { pairingState } = startGeneratorServer();

  // Website-only deployment.
  if (process.env.SESSION_GENERATOR_ONLY === 'true') {
    logger.info('Generator-only mode enabled. Bot startup skipped.');
    return;
  }

  if (!config.owners.length) {
    logger.warn(
      'No OWNER_1 configured. Owner-only commands will be unavailable.'
    );
  }

  // Start WhatsApp bot.
  logger.info('Initializing WhatsApp connection...');

  const sock = await startBot(
    {
      onMessage: (socket, upsert) => {
        return handleMessage(socket, upsert);
      }
    },
    pairingState
  );

  // Start system monitoring.
  startMonitoring(pairingState);

  if (sock) {
    logger.info(
      `BLACK HORNET MD initialized successfully. Website port: ${config.port}`
    );
  } else {
    logger.warn(
      `Bot is idle. No SESSION_ID found. Website port: ${config.port}`
    );
  }
}

main().catch((error) => {
  logger.error(`Critical startup error: ${error.stack || error.message}`);
  process.exit(1);
});
