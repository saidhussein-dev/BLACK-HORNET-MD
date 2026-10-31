// src/connection/baileysClient.js
// WhatsApp connection: session acquisition (SESSION_ID env var / session.txt, like
// VORTE PRO), the Baileys socket itself, and reconnection via recovery/reconnectManager.
// The bot NEVER pairs by itself — get a SESSION_ID from the pairing site first.
// (ENABLE_QR=true prints a terminal QR for local testing only.)
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore
} = require('baileys');
const pino = require('pino');
const path = require('path');
const config = require('../core/config');
const logger = require('../core/logger').child('CONNECTION');
const reconnectManager = require('../recovery/reconnectManager');
const eventLogger = require('../reporting/eventLogger');
const sessionLoader = require('./sessionLoader');

/**
 * @param {object} handlers { onMessage, onGroupUpdate, onCall }
 * @param {object} [pairingState] Shared live-connection state (sock / connectedPhone / latestQR).
 * @returns {Promise<object|null>} the Baileys socket, or null when there is no usable session (bot stays idle)
 */
async function startBot(handlers = {}, pairingState = {}) {
  logger.info('initializing WhatsApp connection...');

  const acquired = sessionLoader.acquireSession(config.sessionFolder, process.env, { sessionFile: path.join(config.root, 'session.txt') });
  const qrEnabled = process.env.ENABLE_QR === 'true';

  if (acquired.status === 'loaded') logger.info(`session restored from SESSION_ID for +${acquired.phone}.`);
  else if (acquired.status === 'unchanged' && acquired.phone) logger.info(`SESSION_ID unchanged (+${acquired.phone}) — using the saved credentials.`);

  const idle = (...lines) => {
    logger.error('\n' + lines.map((l) => '❌ ' + l).join('\n') + '\n');
    pairingState.sock = null;
    return null; // stay idle instead of crash-looping against WhatsApp
  };
  if (acquired.status === 'invalid') return idle(`SESSION_ID problem: ${acquired.message}`, 'Fix the SESSION_ID variable and restart.');
  if (acquired.status === 'missing' && !qrEnabled) {
    return idle(
      'No SESSION_ID was provided, so there is nothing to log in with.',
      'Generate one on the pairing site, then set it as the SESSION_ID variable (or put it in a session.txt file next to index.js) and restart.',
      '(For local testing only, ENABLE_QR=true prints a QR code in the console instead.)'
    );
  }

  const { state, saveCreds } = await useMultiFileAuthState(config.sessionFolder);

  const sock = makeWASocket({
    logger: pino({ level: 'silent' }),
    browser: [config.botName, 'Chrome', config.version],
    printQRInTerminal: false, // rendered ourselves below (only with ENABLE_QR=true)
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, pino().child({ level: 'silent' }))
    },
    version
  });

  pairingState.sock = sock;

  sock.ev.on('creds.update', saveCreds);

  if (handlers.onMessage) {
    sock.ev.on('messages.upsert', (upsert) => {
      Promise.resolve(handlers.onMessage(sock, upsert)).catch((e) => logger.error('message handler error:', e));
    });
  }
  if (handlers.onGroupUpdate) {
    sock.ev.on('group-participants.update', (update) => {
      Promise.resolve(handlers.onGroupUpdate(sock, update)).catch((e) => logger.error('group update handler error:', e));
    });
  }
  if (handlers.onCall) {
    sock.ev.on('call', (calls) => {
      Promise.resolve(handlers.onCall(sock, calls)).catch((e) => logger.error('call handler error:', e));
    });
  }

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr && qrEnabled) {
      pairingState.latestQR = qr;
      const qrcodeTerminal = require('qrcode-terminal');
      logger.info('scan this QR with WhatsApp -> Linked Devices -> Link a Device:');
      qrcodeTerminal.generate(qr, { small: true });
    }

    if (connection === 'close') {
      pairingState.sock = null;
      pairingState.latestQR = null;
      pairingState.connectedPhone = null;
      const code = lastDisconnect?.error?.output?.statusCode;
      logger.warn(`connection closed (code: ${code})`);
      eventLogger.logEvent('RECOVERY', 'connection.closed', { code });

      if (code === DisconnectReason.loggedOut) {
        logger.error('session was logged out by WhatsApp. Generate a NEW SESSION_ID on the pairing site and replace the old one.');
        eventLogger.logEvent('RECOVERY', 'connection.loggedOut', {});
        return; // not reconnecting: the saved credentials are no longer valid
      }

      try { sock.ev.removeAllListeners(); } catch (_) {}

      // WhatsApp closes the socket with "restart required" right after a successful
      // pairing (QR or code). Reconnect at once instead of waiting out the backoff.
      if (code === DisconnectReason.restartRequired) {
        setTimeout(() => startBot(handlers, pairingState).catch((e) => logger.error('post-pairing restart failed:', e.message)), 500);
        return;
      }
      reconnectManager.scheduleReconnect(() => startBot(handlers, pairingState), `disconnect code ${code}`);
    }

    if (connection === 'open') {
      reconnectManager.resetAttempts();
      const phone = sock.user?.id?.split(':')[0];
      pairingState.latestQR = null;
      pairingState.connectedPhone = phone || null;
      pairingState.sock = sock;
      logger.info(`connected successfully as ${phone}`);
      eventLogger.logEvent('RECOVERY', 'connection.open', { phone });

      if (phone) {
        sock.sendMessage(`${phone}@s.whatsapp.net`, {
          text: `🐝 *${config.botName} ONLINE*\n\nConnected and monitoring. Send *.menu* for commands.`
        }).catch(() => {});
      }
    }
  });

  return sock;
}

module.exports = { startBot };
