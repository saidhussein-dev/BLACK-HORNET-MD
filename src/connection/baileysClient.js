// src/connection/baileysClient.js
// WhatsApp connection: session acquisition (SESSION_ID env var, or disk from
// a previous QR pairing), the Baileys socket itself, and reconnection via
// recovery/reconnectManager. Adapted from VORTE PRO's src/bot/client.js.
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
 * @param {object} handlers { onMessage, onGroupUpdate, onCall }
 * @param {object} [pairingState] Shared state object from pairingServer — updated with latestQR/connectedPhone/sock so the website stays in sync.
 * @returns {Promise<object>} the Baileys socket
 */
async function startBot(handlers = {}, pairingState = {}) {
  logger.info('initializing WhatsApp connection...');

  const acquired = sessionLoader.acquireSession(config.sessionFolder, process.env);
  if (acquired.status === 'invalid') {
    logger.error(`SESSION_ID problem: ${acquired.message}. Fix the SESSION_ID variable and restart, or unset it to pair fresh with a QR.`);
  } else if (acquired.status === 'loaded') {
    logger.info('session restored from SESSION_ID env var.');
  }

  if (sessionLoader.discardStaleSession(config.sessionFolder)) {
    logger.info('discarded an unfinished pairing attempt; starting with a clean session.');
  }

  const { state, saveCreds } = await useMultiFileAuthState(config.sessionFolder);

  // Remember (once per process) whether this boot began already paired. A run that
  // starts unpaired and then links is a "fresh pairing" — only then is the new
  // SESSION_ID shown on the site / sent to WhatsApp (never when restored from env).
  if (pairingState.bootRegistered === undefined) {
    pairingState.bootRegistered = !!(state.creds.registered || state.creds.account);
  }
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    logger: pino({ level: 'silent' }),
    browser: [config.botName, 'Chrome', config.version],
    printQRInTerminal: false, // rendered ourselves below (terminal + pairing website)
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

    if (qr) {
      pairingState.latestQR = qr;
      const qrcodeTerminal = require('qrcode-terminal');
      logger.info('scan this QR with WhatsApp -> Linked Devices -> Link a Device (or open the pairing website):');
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
        logger.error('session was logged out. Delete storage/session (and unset SESSION_ID) to re-pair with a fresh QR.');
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
      pairingState.connectedAt = Date.now();
      pairingState.sock = sock;
      logger.info(`connected successfully as ${phone}`);
      eventLogger.logEvent('RECOVERY', 'connection.open', { phone });

      const sessionId = sessionLoader.exportSessionId(config.sessionFolder);
      if (sessionId) logger.info('SESSION_ID (save this as an env var for portable redeploys — keep it secret): ' + sessionId);

      const fresh = pairingState.bootRegistered === false;
      if (phone) {
        const self = `${phone}@s.whatsapp.net`;
        sock.sendMessage(self, {
          text: `🐝 *${config.botName} ONLINE*\n\nConnected and monitoring. Send *.menu* for commands.${sessionId && fresh ? '\n\nYour SESSION_ID is in the next message — save it as the SESSION_ID env var so a redeploy does not need re-pairing.' : ''}`
        }).catch(() => {});
        // Fresh pairing only: deliver the SESSION_ID once, as its own message so it is easy to copy.
        if (sessionId && fresh && !pairingState.sessionSent) {
          pairingState.sessionSent = true;
          sock.sendMessage(self, { text: sessionId }).catch(() => {});
          sock.sendMessage(self, { text: '⚠️ The message above is your SESSION_ID. It is equivalent to your WhatsApp login — never share it, then delete it from this chat once saved.' }).catch(() => {});
        }
      }
    }
  });

  return sock;
}

/**
 * Asks WhatsApp for a pairing code for `phoneDigits` (international, digits only).
 * Safe to call repeatedly — each call issues a fresh code, so a wrong or expired
 * code never locks the user out.
 * @returns {Promise<string>} the raw 8-character code
 */
async function requestPairingCode(pairingState, phoneDigits) {
  const fail = (status, message) => Object.assign(new Error(message), { status });

  if (pairingState.connectedPhone) throw fail(409, 'This bot is already connected to WhatsApp.');

  // The socket can only issue a code once its handshake finished (that is when the first QR is emitted).
  const deadline = Date.now() + 15000;
  while ((!pairingState.sock || !pairingState.latestQR) && Date.now() < deadline) {
    if (pairingState.connectedPhone) throw fail(409, 'This bot is already connected to WhatsApp.');
    await new Promise((r) => setTimeout(r, 300));
  }
  const sock = pairingState.sock;
  if (!sock || !pairingState.latestQR) throw fail(503, 'The bot is still starting. Try again in a few seconds.');

  const creds = sock.authState?.creds;
  if (creds && (creds.registered || creds.account)) throw fail(409, 'This bot already has a linked session.');

  return sock.requestPairingCode(phoneDigits);
}

module.exports = { startBot, requestPairingCode };
