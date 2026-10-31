// src/generator/server.js
// SESSION ID GENERATOR website — the same system VORTE PRO uses, plus QR pairing.
//
//   Visitor opens the site -> picks Pair Code (main) or QR Code
//   -> the server opens a TEMPORARY WhatsApp socket just for that visitor
//   -> visitor links it (types the code in WhatsApp, or scans the QR)
//   -> the saved credentials become one SESSION_ID string (BHMD~...)
//   -> shown once on the page, also sent to the visitor's own WhatsApp chat
//   -> temp socket + files are deleted. The bot itself is deployed separately with that SESSION_ID.
//
// Nothing here touches the bot's own WhatsApp connection.
const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const pino = require('pino');
const QRCode = require('qrcode');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  makeCacheableSignalKeyStore,
  fetchLatestBaileysVersion,
  DisconnectReason
} = require('baileys');
const config = require('../core/config');
const logger = require('../core/logger').child('GENERATOR');
const siteStats = require('./siteStats');
const sessionCodec = require('../connection/sessionCodec');
const { normalizePhone, formatPairingCode } = require('../connection/phone');

const envNum = (name, fallback) => { const n = Number(process.env[name]); return process.env[name] !== undefined && Number.isFinite(n) && n >= 0 ? n : fallback; };

const WEB_DIR = path.join(__dirname, '..', 'web');
const BOT_FILE = path.join(config.root, 'files', 'BLACK-HORNET-MD.zip'); // downloadable bot (see files/README.md)
const TEMP_DIR = path.join(config.storageDir, 'temp_sessions');

const COOLDOWN_MS = envNum('PAIRING_COOLDOWN_MS', 5000);                 // min gap between requests for the same number / same visitor's QR
const PAIRING_EXPIRE_MS = envNum('PAIRING_EXPIRE_MS', 10 * 60 * 1000);   // a code pairing nobody completes is cleaned up and counted as failed
const QR_EXPIRE_MS = envNum('QR_EXPIRE_MS', 3 * 60 * 1000);              // an unscanned QR is dropped after this long
const MAX_ACTIVE = envNum('MAX_PAIRINGS', 5);                            // pairings in progress at once (each holds a WhatsApp socket)
const MAX_PER_IP_HOUR = envNum('PAIRING_MAX_PER_IP_HOUR', 10);           // requests per IP per hour
const REPLACE_AFTER_MS = envNum('PAIRING_REPLACE_AFTER_MS', 60 * 1000);  // another IP may replace a waiting attempt only after this long
const EXTRACT_DELAY_MS = envNum('GENERATOR_EXTRACT_DELAY_MS', 3000);     // let Baileys finish writing creds.json
const MAX_SOCKET_RETRIES = 5;

const sessionMap = new Map();   // token -> attempt entry
const lastRequestAt = new Map(); // attempt key -> time of last request
const keyToToken = new Map();   // attempt key -> token of that key's CURRENT attempt
const ipHits = new Map();       // ip -> times of recent requests
const BOT_UA = /bot|crawl|spider|slurp|curl|wget|python-requests|monitor|uptime|pingdom|headless|lighthouse|facebookexternalhit/i;

const waitingCount = () => [...sessionMap.values()].filter((e) => e.status === 'waiting').length;
const parseCookies = (h) => Object.fromEntries(String(h || '').split(';').map((c) => c.trim().split('=')).filter((p) => p[0]).map(([k, ...v]) => [k, v.join('=')]));
const botVersion = () => { const [a, b] = String(config.version).split('.'); return `v${a}.${b || 0}`; };

setInterval(() => {
  const cutoff = Date.now() - 3600 * 1000;
  for (const [ip, v] of ipHits) { const f = v.filter((t) => t > cutoff); if (f.length) ipHits.set(ip, f); else ipHits.delete(ip); }
  for (const [k, t] of lastRequestAt) if (t < cutoff) lastRequestAt.delete(k);
  for (const [k, tok] of keyToToken) if (!sessionMap.has(tok)) keyToToken.delete(k);
}, 10 * 60 * 1000).unref();

/** Count a page view and (once per browser, via cookie) a unique visitor. Bots are skipped. */
function countVisit(req, res) {
  if (req.method !== 'GET' || BOT_UA.test(req.headers['user-agent'] || '')) return;
  siteStats.pageView();
  if (!parseCookies(req.headers.cookie).bh_vid) {
    res.cookie('bh_vid', Date.now().toString(36) + Math.random().toString(36).slice(2, 8), { maxAge: 365 * 24 * 3600 * 1000, httpOnly: true, sameSite: 'lax' });
    siteStats.newVisitor();
  }
}

/** Remove temp session folders left behind by an earlier crash/restart. */
function sweepTempSessions() {
  try {
    if (!fs.existsSync(TEMP_DIR)) return;
    for (const d of fs.readdirSync(TEMP_DIR)) {
      const p = path.join(TEMP_DIR, d);
      if (Date.now() - fs.statSync(p).mtimeMs > 30 * 60 * 1000) fs.rmSync(p, { recursive: true, force: true });
    }
  } catch { /* best effort */ }
}

/**
 * Shared by pair-code and QR pairing: admission checks, then a temporary socket for this visitor.
 * @param {'code'|'qr'} mode
 */
async function beginAttempt(req, res, mode) {
  const ip = req.ip || req.socket?.remoteAddress || 'unknown';
  const fail = (status, error, extra = {}) => res.status(status).json({ success: false, error, ...extra });

  let phoneDigits = null;
  let key;
  if (mode === 'code') {
    const phone = normalizePhone(req.body?.dial, req.body?.number);
    if (!phone.ok) return fail(400, phone.error);
    phoneDigits = phone.digits;
    key = phoneDigits;
  } else {
    key = `qr:${ip}`; // one QR attempt per visitor at a time
  }

  // Abuse limits: per-IP hourly cap and a global cap on pairings in progress.
  const nowTs = Date.now();
  const recent = (ipHits.get(ip) || []).filter((t) => nowTs - t < 3600 * 1000);
  if (recent.length >= MAX_PER_IP_HOUR) return fail(429, 'Too many requests. Please try again later.');

  const prevToken = keyToToken.get(key);
  const previous = prevToken ? sessionMap.get(prevToken) : null;
  const previousWaiting = !!previous && previous.status === 'waiting';
  if (waitingCount() - (previousWaiting ? 1 : 0) >= MAX_ACTIVE) return fail(429, 'The server is busy right now. Please try again in a minute.');

  const since = Date.now() - (lastRequestAt.get(key) || 0);
  if (since < COOLDOWN_MS) {
    const wait = Math.ceil((COOLDOWN_MS - since) / 1000);
    return fail(429, `Please wait ${wait}s before requesting again.`, { retryAfter: wait });
  }

  // A wrong-code / expired / abandoned attempt must NEVER block a new one: cancel it and carry on.
  // Only the SAME visitor (same IP) may replace an attempt right away; someone else waits a minute,
  // so a stranger can't keep cancelling another person's pairing.
  if (previousWaiting) {
    if (previous.ip === ip || Date.now() - previous.createdAt > REPLACE_AFTER_MS) {
      previous.cancel('replaced');
      siteStats.retry();
    } else {
      return fail(409, 'A pairing for this number is already in progress. Please wait a minute and try again.');
    }
  }
  lastRequestAt.set(key, Date.now());
  recent.push(nowTs); ipHits.set(ip, recent);

  // The token the page polls with is a random secret — never the phone number.
  const token = crypto.randomBytes(24).toString('hex');
  const attemptId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const folder = path.join(TEMP_DIR, `${token}_${attemptId}`); // one folder PER ATTEMPT
  const tag = mode === 'code' ? `+${phoneDigits.slice(0, 3)}***${phoneDigits.slice(-2)}` : `QR ${ip}`;

  let isFinished = false;
  let cancelled = false;
  let currentSock = null;
  let expireTimer = null;
  let codeRequested = false;
  let socketRetries = 0;

  const removeFolderLater = (ms) => setTimeout(() => {
    try { if (fs.existsSync(folder)) fs.rmSync(folder, { recursive: true, force: true }); } catch (e) { /* ignore */ }
  }, ms).unref?.();
  const forget = () => {
    if (sessionMap.get(token) === entry) sessionMap.delete(token);
    if (keyToToken.get(key) === token) keyToToken.delete(key);
  };
  const entry = {
    mode, status: 'waiting', sessionId: null, error: null, qrImg: null, ip, key, createdAt: Date.now(),
    cancel: (reason) => {
      if (isFinished || cancelled) return;
      cancelled = true; isFinished = true;
      clearTimeout(expireTimer);
      try { currentSock?.ev?.removeAllListeners?.('creds.update'); } catch (e) { /* ignore */ }
      try { currentSock?.end(undefined); } catch (e) { /* ignore */ }
      removeFolderLater(5000); // let any pending credential write drain first
      forget();
      if (!res.headersSent) res.status(409).json({ success: false, error: 'Superseded by a newer request.' });
      logger.info(`attempt ${tag} cancelled (${reason}).`);
    }
  };
  const update = (patch) => { if (sessionMap.get(token) === entry) Object.assign(entry, patch); };
  const giveUp = (message, countFailed = true) => {
    if (isFinished) return;
    isFinished = true; clearTimeout(expireTimer);
    try { currentSock?.end(undefined); } catch (e) { /* ignore */ }
    if (countFailed) siteStats.fail();
    removeFolderLater(5000);
    if (!res.headersSent) { // the visitor never got a token, so there is nothing for them to poll
      forget();
      return res.status(500).json({ success: false, error: message });
    }
    update({ status: 'error', error: message });
  };

  try {
    sessionMap.set(token, entry);
    keyToToken.set(key, token);
    expireTimer = setTimeout(() => {
      if (entry.status === 'waiting' && !isFinished) {
        logger.info(`attempt ${tag} expired without being completed.`);
        if (mode === 'code') siteStats.fail();
        entry.cancel('expired');
      }
    }, mode === 'code' ? PAIRING_EXPIRE_MS : QR_EXPIRE_MS);
    if (expireTimer.unref) expireTimer.unref();

    fs.mkdirSync(folder, { recursive: true });
    const { state, saveCreds } = await useMultiFileAuthState(folder);
    const { version } = await fetchLatestBaileysVersion();

    let linked = false;
    const onLinked = (sock) => {
      if (linked) return;
      linked = true;
      logger.info(`linked: ${tag}. Extracting session ID...`);
      let tries = 0;
      const extract = async () => {
        if (cancelled) return;
        tries++;
        let creds = null;
        try { creds = JSON.parse(fs.readFileSync(path.join(folder, 'creds.json'), 'utf8')); } catch (e) { /* not ready yet */ }
        if (!creds?.me?.id) {
          if (tries < 8) return void setTimeout(extract, 1000);
          giveUp('Linked, but the credentials could not be read. Please try again.');
          return;
        }
        const sessionId = sessionCodec.encodeSession(creds);
        clearTimeout(expireTimer);
        update({ status: 'ready', sessionId });
        siteStats.success();
        logger.info(`session ID generated for ${tag}`);

        try { // send to the visitor's own chat
          const me = String(sock.user?.id || creds.me.id).split(':')[0].split('@')[0];
          const jid = `${me}@s.whatsapp.net`;
          await sock.sendMessage(jid, { text: `*${config.botName} — SESSION GENERATED*\n\n> Never share this ID with anyone. It works as your WhatsApp login.\n\nCopy the ID below and set it as the SESSION_ID variable on your bot host:` });
          await new Promise((r) => setTimeout(r, 800));
          await sock.sendMessage(jid, { text: sessionId });
          await new Promise((r) => setTimeout(r, 1500)); // let the socket flush before it closes
        } catch (e) { logger.warn('could not send the session to the visitor chat:', e.message); }

        isFinished = true;
        try { sock.end(undefined); } catch (e) { /* ignore */ }
        setTimeout(() => {
          try { if (fs.existsSync(folder)) fs.rmSync(folder, { recursive: true, force: true }); } catch (e) { /* ignore */ }
          forget();
          logger.info(`cleanup completed for ${tag}`);
        }, 60000).unref?.(); // 60s so Baileys' creds write queue drains completely
      };
      setTimeout(extract, EXTRACT_DELAY_MS);
    };

    const requestCodeOnce = async (sock) => {
      if (codeRequested || isFinished) return;
      codeRequested = true;
      try {
        const code = formatPairingCode(await sock.requestPairingCode(phoneDigits));
        logger.info(`pairing code issued for ${tag}`);
        if (!res.headersSent) res.json({ success: true, code, token });
      } catch (err) {
        logger.warn('failed to request code:', err.message);
        giveUp('Failed to generate a pairing code. Make sure the number is registered on WhatsApp.');
      }
    };

    const startSock = () => {
      const sock = makeWASocket({
        logger: pino({ level: 'silent' }),
        browser: ['Ubuntu', 'Chrome', '20.0.04'],
        printQRInTerminal: false,
        auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })) },
        version
      });
      currentSock = sock;
      sock.ev.on('creds.update', saveCreds);
      // Safety net: if no QR event arrives (it normally does within a second or two), ask for the code anyway.
      if (mode === 'code' && !codeRequested) setTimeout(() => requestCodeOnce(sock), 7000).unref?.();

      sock.ev.on('connection.update', async (u) => {
        if (isFinished) return;
        const { connection, lastDisconnect, qr } = u;

        if (qr) {
          if (mode === 'qr') {
            QRCode.toDataURL(qr, { margin: 1, width: 320 }).then((img) => update({ qrImg: img })).catch(() => {});
          } else {
            requestCodeOnce(sock); // the first QR event means the WhatsApp handshake is done
          }
        }

        if (connection === 'open') return onLinked(sock);

        if (connection === 'close') {
          const reason = lastDisconnect?.error?.output?.statusCode;
          if (reason === DisconnectReason.restartRequired || reason === 515) {
            logger.info(`restart required for ${tag}. Reconnecting...`);
            startSock(); // normal right after linking
          } else if (reason === DisconnectReason.loggedOut) {
            giveUp('WhatsApp refused the pairing. Please try again.');
          } else if (mode === 'qr' && !state.creds.me) {
            entry.cancel('qr-expired'); // nobody scanned it — WhatsApp stopped rotating QR codes
          } else if (reason === DisconnectReason.connectionLost || reason === DisconnectReason.connectionClosed || reason === 408) {
            if (++socketRetries > MAX_SOCKET_RETRIES) giveUp('The connection to WhatsApp kept dropping. Please try again.');
            else setTimeout(() => { if (!isFinished) startSock(); }, 2000 * socketRetries); // growing pause, never a tight loop
          } else {
            logger.warn(`connection closed for ${tag}: ${reason}`);
          }
        }
      });
    };

    startSock();
    if (mode === 'qr') res.json({ success: true, token, expiresIn: Math.round(QR_EXPIRE_MS / 1000) });
  } catch (err) {
    logger.error('generator error:', err);
    giveUp('Internal server error.');
  }
}

/**
 * @param {{ port?: number }} [opts]
 * @returns {{ app, server, pairingState }} pairingState is the bot's own live-connection state (unused in generator-only mode).
 */
function startGeneratorServer(opts = {}) {
  const app = express();
  // Behind one proxy (Render, Cloudflare Tunnel, a panel host) req.ip must be the visitor. Set TRUST_PROXY=0 if exposed directly.
  app.set('trust proxy', Number(process.env.TRUST_PROXY ?? 1));
  app.disable('x-powered-by');
  app.use(express.json({ limit: '10kb' }));
  sweepTempSessions();

  // Bot's own connection state, kept in sync by connection/baileysClient.js.
  const pairingState = { sock: null, latestQR: null, connectedPhone: null };

  app.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    next();
  });

  app.get('/', (req, res) => {
    try { countVisit(req, res); } catch (e) { /* counting must never break the page */ }
    res.sendFile(path.join(WEB_DIR, 'index.html'));
  });
  app.get('/countries.js', (req, res) => res.sendFile(path.join(WEB_DIR, 'countries.js')));

  app.post('/api/request-code', (req, res) => { beginAttempt(req, res, 'code').catch((e) => { logger.error(e); if (!res.headersSent) res.status(500).json({ success: false, error: 'Internal server error.' }); }); });
  app.post('/api/request-qr', (req, res) => { beginAttempt(req, res, 'qr').catch((e) => { logger.error(e); if (!res.headersSent) res.status(500).json({ success: false, error: 'Internal server error.' }); }); });

  // The page polls this. For a QR attempt it also carries the current QR image.
  app.get('/api/session-status/:token', (req, res) => {
    const { token } = req.params;
    const gone = () => res.status(404).json({ success: false, error: 'No active pairing session found. Please try again.' });
    if (!/^[a-f0-9]{48}$/.test(token)) return gone();
    const info = sessionMap.get(token);
    if (!info) return gone();

    if (info.status === 'ready') {
      // One-time read: handed over once, then removed from memory (a copy was also sent to the visitor's WhatsApp chat).
      const { sessionId } = info;
      sessionMap.delete(token);
      if (keyToToken.get(info.key) === token) keyToToken.delete(info.key);
      return res.json({ success: true, status: 'ready', sessionId });
    }
    if (info.status === 'error') {
      sessionMap.delete(token);
      return res.json({ success: false, status: 'error', error: info.error });
    }
    res.json({ success: true, status: 'waiting', ...(info.mode === 'qr' && info.qrImg ? { qr: info.qrImg } : {}) });
  });

  // REAL numbers for the site (counted on the server, saved to disk). No simulation.
  app.get('/api/stats', (req, res) => {
    const st = siteStats.snapshot();
    res.json({
      visitors: st.visitors, pageViews: st.pageViews, successful: st.successful, failed: st.failed, downloads: st.downloads,
      countingSince: st.since, uptimeSeconds: Math.floor(process.uptime()), activePairings: waitingCount(),
      botName: config.botName, botVersion: botVersion()
    });
  });

  // Is there a bot file to download? (uploaded ZIP, or an external link from BOT_DOWNLOAD_URL)
  app.get('/api/bot-file', (req, res) => {
    try {
      if (fs.existsSync(BOT_FILE)) return res.json({ available: true, kind: 'file', name: 'BLACK-HORNET-MD.zip', sizeBytes: fs.statSync(BOT_FILE).size, version: botVersion() });
    } catch (e) { /* fall through */ }
    if (/^https?:\/\//i.test(process.env.BOT_DOWNLOAD_URL || '')) return res.json({ available: true, kind: 'link', name: 'BLACK-HORNET-MD', sizeBytes: null, version: botVersion() });
    res.json({ available: false, version: botVersion() });
  });
  app.get('/download/bot', (req, res) => {
    if (fs.existsSync(BOT_FILE)) { siteStats.download(); return res.download(BOT_FILE, 'BLACK-HORNET-MD.zip'); }
    if (/^https?:\/\//i.test(process.env.BOT_DOWNLOAD_URL || '')) { siteStats.download(); return res.redirect(process.env.BOT_DOWNLOAD_URL); }
    res.status(404).send('The bot file has not been uploaded yet.');
  });

  // Health / keep-alive (uptime monitors and Render health checks)
  app.get('/health', (req, res) => res.status(200).json({ status: 'ok', uptime: Math.floor(process.uptime()), activePairings: waitingCount() }));

  const port = opts.port !== undefined ? opts.port : config.port;
  const server = app.listen(port, '0.0.0.0', () => logger.info(`session generator site listening on port ${server.address().port}`));
  return { app, server, pairingState };
}

module.exports = { startGeneratorServer };
