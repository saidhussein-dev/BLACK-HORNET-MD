// src/recovery/errorHandler.js
// Process-level safety net: an unhandled rejection or stray exception must
// never take the whole bot down. Every incident is logged so REPORTING can
// surface it, and the process stays alive.
const logger = require('../core/logger').child('RECOVERY');
const eventLogger = require('../reporting/eventLogger');

function install() {
  process.on('unhandledRejection', (reason) => {
    logger.error('unhandled rejection:', reason);
    eventLogger.logEvent('RECOVERY', 'process.unhandledRejection', { reason: String(reason?.message || reason) });
  });

  process.on('uncaughtException', (err) => {
    logger.error('uncaught exception:', err);
    eventLogger.logEvent('RECOVERY', 'process.uncaughtException', { error: err?.message, stack: err?.stack });
    // Deliberately NOT exiting: a single bad event handler must not kill an
    // otherwise-healthy connection. Baileys' own connection.update handler
    // is where real disconnects are detected and reconnected from.
  });

  logger.info('global error handlers installed');
}

module.exports = { install };
