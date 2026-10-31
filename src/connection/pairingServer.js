// src/connection/baileysClient.js
// WhatsApp connection: session acquisition, Baileys socket,
// pairing codes, QR pairing, and reconnection.

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore
} = require('baileys');

const pino = require('pino');
const config = require('../core/config');
const logger = require('../core/logger').child('CONNECTION');
const reconnectManager = require('../recovery/reconnectManager');
const eventLogger = require('../reporting/eventLogger');
const sessionLoader = require('./sessionLoader');

/**
 * @param {object} handlers
 * @param {object} pairingState
 * @returns {Promise<object>}
 */
async function startBot(handlers = {}, pairingState = {}) {
  logger.info('initializing WhatsApp connection...');

  const acquired = sessionLoader.acquireSession(
    config.sessionFolder,
    process.env
  );

  if (acquired.status === 'invalid') {
    logger.error(
      `SESSION_ID problem: ${acquired.message}. Fix SESSION_ID or unset it to pair fresh.`
    );
  } else if (acquired.status === 'loaded') {
    logger.info('session restored from SESSION_ID env var.');
  }

  if (sessionLoader.discardStaleSession(config.sessionFolder)) {
    logger.info('discarded an unfinished pairing attempt.');
  }

  const { state, saveCreds } = await useMultiFileAuthState(
    config.sessionFolder
  );

  if (pairingState.bootRegistered === undefined) {
    pairingState.bootRegistered = !!(
      state.creds.registered || state.creds.account
    );
  }

  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    logger: pino({ level: 'silent' }),
    browser: [config.botName, 'Chrome', config.version],
    printQRInTerminal: false,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(
        state.keys,
        pino().child({ level: 'silent' })
      )
    },
    version
  });

  pairingState.sock = sock;

  sock.ev.on('creds.update', saveCreds);

  if (handlers.onMessage) {
    sock.ev.on('messages.upsert', (upsert) => {
      Promise.resolve(
        handlers.onMessage(sock, upsert)
      ).catch((e) => logger.error('message handler error:', e));
    });
  }

  if (handlers.onGroupUpdate) {
    sock.ev.on('group-participants.update', (update) => {
      Promise.resolve(
        handlers.onGroupUpdate(sock, update)
      ).catch((e) => logger.error('group update handler error:', e));
    });
  }

  if (handlers.onCall) {
    sock.ev.on('call', (calls) => {
      Promise.resolve(
        handlers.onCall(sock, calls)
      ).catch((e) => logger.error('call handler error:', e));
    });
  }

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      pairingState.latestQR = qr;

      const qrcodeTerminal = require('qrcode-terminal');

      logger.info(
        'Scan QR with WhatsApp -> Linked Devices -> Link a Device:'
      );

      qrcodeTerminal.generate(qr, { small: true });
    }

    if (connection === 'close') {
      pairingState.sock = null;
      pairingState.latestQR = null;
      pairingState.connectedPhone = null;

      const code = lastDisconnect?.error?.output?.statusCode;

      logger.warn(`connection closed (code: ${code})`);

      eventLogger.logEvent(
        'RECOVERY',
        'connection.closed',
        { code }
      );

      if (code === DisconnectReason.loggedOut) {
        logger.error(
          'Session logged out. Delete storage/session and unset SESSION_ID to pair again.'
        );

        eventLogger.logEvent(
          'RECOVERY',
          'connection.loggedOut',
          {}
        );

        return;
      }

      try {
        sock.ev.removeAllListeners();
      } catch (_) {}

      if (code === DisconnectReason.restartRequired) {
        setTimeout(() => {
          startBot(handlers, pairingState).catch((e) => {
            logger.error(
              'post-pairing restart failed:',
              e.message
            );
          });
        }, 500);

        return;
      }

      reconnectManager.scheduleReconnect(
        () => startBot(handlers, pairingState),
        `disconnect code ${code}`
      );
    }

    if (connection === 'open') {
      reconnectManager.resetAttempts();

      const phone = sock.user?.id?.split(':')[0];

      pairingState.latestQR = null;
      pairingState.connectedPhone = phone || null;
      pairingState.connectedAt = Date.now();
      pairingState.sock = sock;

      logger.info(`connected successfully as ${phone}`);

      eventLogger.logEvent(
        'RECOVERY',
        'connection.open',
        { phone }
      );

      const sessionId = sessionLoader.exportSessionId(
        config.sessionFolder
      );

      if (sessionId) {
        logger.info(
          'SESSION_ID generated. Keep it secret.'
        );
      }

      const fresh = pairingState.bootRegistered === false;

      if (phone) {
        const self = `${phone}@s.whatsapp.net`;

        sock.sendMessage(self, {
          text:
            `🐝 *${config.botName} ONLINE*\n\n` +
            `Connected and monitoring. Send *.menu* for commands.` +
            (
              sessionId && fresh
                ? '\n\nYour SESSION_ID is in the next message. Save it securely.'
                : ''
            )
        }).catch(() => {});

        if (sessionId && fresh && !pairingState.sessionSent) {
          pairingState.sessionSent = true;

          sock.sendMessage(self, {
            text: sessionId
          }).catch(() => {});

          sock.sendMessage(self, {
            text:
              '⚠️ This is your SESSION_ID. It grants access to your WhatsApp session. Never share it.'
          }).catch(() => {});
        }
      }
    }
  });

  return sock;
}

/**
 * Generate a WhatsApp pairing code.
 *
 * Follows VORTE PRO's initialization delay and credential check.
 *
 * @param {object} pairingState
 * @param {string} phoneDigits International number, digits only.
 * @returns {Promise<string>}
 */
async function requestPairingCode(pairingState, phoneDigits) {
  const fail = (status, message) =>
    Object.assign(new Error(message), { status });

  const phone = String(phoneDigits || '').replace(/\D/g, '');

  if (!/^[1-9]\d{7,14}$/.test(phone)) {
    throw fail(
      400,
      'Invalid international phone number.'
    );
  }

  if (pairingState.connectedPhone) {
    throw fail(
      409,
      'This bot is already connected to WhatsApp.'
    );
  }

  if (pairingState.pairingCodeRequest) {
    throw fail(
      409,
      'A pairing-code request is already processing.'
    );
  }

  pairingState.pairingCodeRequest = true;

  try {
    const sock = pairingState.sock;

    if (!sock) {
      throw fail(
        503,
        'WhatsApp socket is not initialized.'
      );
    }

    // Give Baileys time to initialize, as VORTE PRO does.
    await new Promise(resolve => setTimeout(resolve, 2500));

    if (pairingState.connectedPhone) {
      throw fail(
        409,
        'This bot is already connected.'
      );
    }

    if (pairingState.sock !== sock) {
      throw fail(
        503,
        'WhatsApp socket restarted. Please try again.'
      );
    }

    // Match VORTE PRO's credential check.
    if (sock.authState?.creds?.me) {
      throw fail(
        409,
        'This WhatsApp session is already registered.'
      );
    }

    // Request the real code from WhatsApp.
    const code = await sock.requestPairingCode(phone);

    if (
      !code ||
      typeof code !== 'string' ||
      !/^[A-Z0-9]{8}$/i.test(code)
    ) {
      throw fail(
        502,
        'WhatsApp did not return a valid pairing code.'
      );
    }

    logger.info('WhatsApp pairing code generated successfully.');

    return code;

  } catch (error) {
    logger.error(
      'pairing code request failed:',
      error.message
    );

    throw error;

  } finally {
    pairingState.pairingCodeRequest = false;
  }
}

module.exports = {
  startBot,
  requestPairingCode
};
