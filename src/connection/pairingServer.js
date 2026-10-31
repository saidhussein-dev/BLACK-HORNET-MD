// src/connection/pairingServer.js
// Pairing website for BLACK HORNET MD. Two ways to link WhatsApp from a browser:
//   1. Pairing code (main) — type your number, get a code, enter it in WhatsApp.
//   2. QR code — scan it from Linked Devices.
// Once linked, the page shows the portable SESSION_ID (only to the browser that
// paired, and only for a fresh pairing — never when restored from the env var).
// Needed on hosts (Katabump and similar panels) whose console can't render a QR.
const express = require('express');
const path = require('path');
const crypto = require('crypto');
const QRCode = require('qrcode');
const config = require('../core/config');
const logger = require('../core/logger').child('PAIRING');
const sessionLoader = require('./sessionLoader');
const { requestPairingCode } = require('./baileysClient');
const { normalizePhone, formatPairingCode } = require('./phone');
const { createLimiter } = require('./pairLimiter');

const REVEAL_WINDOW_MS = 10 * 60 * 1000; // session ID visible on the site for 10 min after linking

/** @type {object} Shared with baileysClient — it keeps this in sync with the socket. */
const pairingState = {
  sock: null,
  latestQR: null,
  connectedPhone: null,
  connectedAt: 0,
  bootRegistered: undefined, // did this process start already paired?
  sessionSent: false
};

const limiter = createLimiter({ max: 8, windowMs: 60000, minGapMs: 2000 });
const pairingClients = new Set(); // cookie tokens of browsers that used the pairing flow

function readCookie(req, name) {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return null;
}

function maskPhone(digits) {
  if (!digits) return null;
  return digits.length > 6 ? `${digits.slice(0, 3)}••••${digits.slice(-3)}` : '••••';
}

function claimClient(token) {
  if (pairingClients.size >= 20) pairingClients.clear();
  pairingClients.add(token);
}

function startPairingServer() {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(express.json({ limit: '1kb' }));

  // Every browser gets a random cookie; it is what later authorises showing the SESSION_ID.
  app.use((req, res, next) => {
    let token = readCookie(req, 'bh_pair');
    if (!token || !/^[a-f0-9]{32}$/.test(token)) {
      token = crypto.randomBytes(16).toString('hex');
      res.setHeader('Set-Cookie', `bh_pair=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400`);
    }
    req.pairToken = token;
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    next();
  });

  app.use(express.static(path.join(__dirname, '..', 'web'), { index: 'index.html', cacheControl: false }));

  app.get('/qr.png', async (req, res) => {
    if (!pairingState.latestQR) return res.status(204).end();
    claimClient(req.pairToken);
    try {
      const buffer = await QRCode.toBuffer(pairingState.latestQR, { width: 400, margin: 1 });
      res.type('png').send(buffer);
    } catch (e) {
      logger.error('failed to render QR:', e.message);
      res.status(500).end();
    }
  });

  // Main flow: number in, pairing code out. No lock — a wrong/expired code can always be replaced.
  app.post('/pair', async (req, res) => {
    const verdict = limiter.check(req.ip);
    if (!verdict.ok) {
      return res.status(429).json({ error: `Too many requests. Try again in ${Math.ceil(verdict.retryAfterMs / 1000)}s.` });
    }
    const phone = normalizePhone(req.body?.dial, req.body?.number);
    if (!phone.ok) return res.status(400).json({ error: phone.error });

    try {
      const raw = await requestPairingCode(pairingState, phone.digits);
      claimClient(req.pairToken);
      logger.info(`pairing code issued for +${maskPhone(phone.digits)}`);
      res.json({ code: formatPairingCode(raw), expiresIn: 60 });
    } catch (e) {
      logger.warn('pairing code request failed:', e.message);
      const status = e.status || 500;
      res.status(status).json({ error: e.status ? e.message : 'Could not get a pairing code. Try again.' });
    }
  });

  app.get('/status', (req, res) => {
    res.json({
      connected: !!pairingState.connectedPhone,
      phone: maskPhone(pairingState.connectedPhone),
      botName: config.botName,
      version: config.version,
      uptime: Math.floor(process.uptime()),
      qrReady: !!pairingState.latestQR,
      fresh: pairingState.bootRegistered === false
    });
  });

  // SESSION_ID for the browser that paired this run. Never for restored sessions, never to strangers.
  app.get('/session', (req, res) => {
    if (!pairingState.connectedPhone) return res.status(409).json({ reason: 'not-connected' });
    if (pairingState.bootRegistered !== false) return res.status(403).json({ reason: 'restored' });
    if (!pairingClients.has(req.pairToken)) return res.status(403).json({ reason: 'not-pairing-browser' });
    if (Date.now() - pairingState.connectedAt > REVEAL_WINDOW_MS) return res.status(403).json({ reason: 'expired' });
    const sessionId = sessionLoader.exportSessionId(config.sessionFolder);
    if (!sessionId) return res.status(500).json({ reason: 'unreadable' });
    res.json({ sessionId });
  });

  const port = config.port;
  app.listen(port, () => logger.info(`pairing site listening on port ${port}`));

  return pairingState;
}

module.exports = { startPairingServer, pairingState };
