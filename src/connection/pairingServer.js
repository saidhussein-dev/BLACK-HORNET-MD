// src/connection/pairingServer.js
// BLACK HORNET MD — Express pairing server.
// Handles the pairing website, QR delivery, pairing codes and SESSION_ID access.
// WhatsApp socket and pairing-code algorithm remain in baileysClient.js.

'use strict';

const express = require('express');
const path = require('path');
const crypto = require('crypto');
const QRCode = require('qrcode');

const config = require('../core/config');
const logger = require('../core/logger').child('PAIRING');

const {
  requestPairingCode
} = require('./baileysClient');

const {
  normalizePhone,
  formatPairingCode
} = require('./phone');

const sessionLoader = require('./sessionLoader');

const CLIENT_COOKIE = 'bh_pair_client';
const SESSION_WINDOW_MS = 10 * 60 * 1000;
const CODE_EXPIRY_SECONDS = 60;

/**
 * Read a cookie without requiring cookie-parser.
 */
function readCookie(header, name) {
  if (!header) return null;

  const cookies = header.split(';');

  for (const item of cookies) {
    const separator = item.indexOf('=');

    if (separator === -1) continue;

    const key = item.slice(0, separator).trim();
    const value = item.slice(separator + 1).trim();

    if (key === name) {
      try {
        return decodeURIComponent(value);
      } catch (_) {
        return null;
      }
    }
  }

  return null;
}

/**
 * Give each browser a temporary pairing identity.
 * This allows SESSION_ID retrieval only from the browser
 * that initiated pairing.
 */
function browserIdentity(req, res, next) {
  let token = readCookie(
    req.headers.cookie,
    CLIENT_COOKIE
  );

  if (!token || !/^[a-f0-9]{48}$/.test(token)) {
    token = crypto.randomBytes(24).toString('hex');

    const secure =
      req.secure ||
      req.headers['x-forwarded-proto'] === 'https';

    const cookie = [
      `${CLIENT_COOKIE}=${encodeURIComponent(token)}`,
      'Path=/',
      'HttpOnly',
      'SameSite=Strict',
      'Max-Age=1800',
      secure ? 'Secure' : ''
    ].filter(Boolean).join('; ');

    res.append('Set-Cookie', cookie);
  }

  req.pairToken = token;

  next();
}

/**
 * Mask a connected phone number for the public status endpoint.
 */
function maskPhone(phone) {
  if (!phone) return null;

  const digits = String(phone).replace(/\D/g, '');

  if (digits.length <= 4) return '••••';

  return `+${'•'.repeat(Math.min(digits.length - 4, 8))}${digits.slice(-4)}`;
}

/**
 * Start the pairing website and return the shared pairing state.
 *
 * index.js passes this same state to startBot().
 */
function startPairingServer() {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(express.json({
    limit: '1kb',
    strict: true
  }));

  const pairingState = {
    sock: null,
    latestQR: null,
    connectedPhone: null,
    connectedAt: null,
    bootRegistered: undefined,
    sessionSent: false,

    pairingCodeRequest: false,

    // Browser that initiated the successful pairing attempt.
    pairBrowserToken: null,
    pairStartedAt: null
  };

  app.use(browserIdentity);

  // --------------------------------------------------
  // Static pairing website
  // --------------------------------------------------

  const webDirectory = path.join(
    config.root,
    'src',
    'web'
  );

  app.use(express.static(webDirectory, {
    index: 'index.html',
    extensions: ['html']
  }));

  // --------------------------------------------------
  // GET /status
  // --------------------------------------------------

  app.get('/status', (req, res) => {
    const connected = !!pairingState.connectedPhone;

    res.set('Cache-Control', 'no-store');

    res.json({
      connected,

      phone: connected
        ? maskPhone(pairingState.connectedPhone)
        : null,

      botName: config.botName,
      version: config.version,

      uptime: Math.floor(process.uptime()),

      qrReady: !!pairingState.latestQR,

      fresh: pairingState.bootRegistered === false
    });
  });

  // --------------------------------------------------
  // GET /qr.png
  // --------------------------------------------------

  app.get('/qr.png', async (req, res) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.set('Pragma', 'no-cache');

    if (pairingState.connectedPhone) {
      return res.status(409).json({
        error: 'WhatsApp is already connected.'
      });
    }

    if (!pairingState.latestQR) {
      return res.status(503).json({
        error: 'QR code is not ready yet.'
      });
    }

    // Claim this browser for QR-based pairing.
    if (!pairingState.pairBrowserToken) {
      pairingState.pairBrowserToken = req.pairToken;
      pairingState.pairStartedAt = Date.now();
    }

    try {
      const image = await QRCode.toBuffer(
        pairingState.latestQR,
        {
          type: 'png',
          width: 400,
          margin: 2,
          errorCorrectionLevel: 'M'
        }
      );

      res.type('png');
      return res.send(image);

    } catch (error) {
      logger.error(
        'QR image generation failed:',
        error.message
      );

      return res.status(500).json({
        error: 'Could not generate QR image.'
      });
    }
  });

  // --------------------------------------------------
  // POST /pair
  // --------------------------------------------------

  app.post('/pair', async (req, res) => {
    try {
      if (pairingState.connectedPhone) {
        return res.status(409).json({
          error: 'This bot is already connected to WhatsApp.'
        });
      }

      const { dial, number } = req.body || {};

      const normalized = normalizePhone(dial, number);

      if (!normalized.ok) {
        return res.status(400).json({
          error: normalized.error
        });
      }

      // Keep the existing Baileys pairing-code algorithm.
      const rawCode = await requestPairingCode(
        pairingState,
        normalized.digits
      );

      const formattedCode = formatPairingCode(rawCode);

      if (!formattedCode) {
        return res.status(502).json({
          error: 'WhatsApp returned an invalid pairing code.'
        });
      }

      // Associate this browser with the pairing attempt.
      pairingState.pairBrowserToken = req.pairToken;
      pairingState.pairStartedAt = Date.now();

      logger.info(
        `Pairing code issued for number ending ${normalized.digits.slice(-4)}.`
      );

      return res.json({
        success: true,
        code: formattedCode,
        expiresIn: CODE_EXPIRY_SECONDS
      });

    } catch (error) {
      const status = Number(error.status) || 500;

      logger.error(
        'Pairing endpoint failed:',
        error.message
      );

      return res.status(status).json({
        error: status >= 500
          ? 'Unable to generate a pairing code. Please try again.'
          : error.message
      });
    }
  });

  // --------------------------------------------------
  // GET /session
  // --------------------------------------------------

  app.get('/session', (req, res) => {
    res.set('Cache-Control', 'no-store');

    if (!pairingState.connectedPhone) {
      return res.status(409).json({
        error: 'WhatsApp is not connected.'
      });
    }

    // Existing session restored from SESSION_ID.
    if (pairingState.bootRegistered !== false) {
      return res.status(403).json({
        reason: 'restored'
      });
    }

    // Only the browser that initiated pairing can retrieve it.
    if (
      !pairingState.pairBrowserToken ||
      pairingState.pairBrowserToken !== req.pairToken
    ) {
      return res.status(403).json({
        reason: 'not-pairing-browser'
      });
    }

    // SESSION_ID is available for a limited time.
    if (
      !pairingState.pairStartedAt ||
      Date.now() - pairingState.pairStartedAt > SESSION_WINDOW_MS
    ) {
      return res.status(410).json({
        reason: 'expired'
      });
    }

    const sessionId = sessionLoader.exportSessionId(
      config.sessionFolder
    );

    if (!sessionId) {
      return res.status(404).json({
        error: 'SESSION_ID is not available yet.'
      });
    }

    logger.info('SESSION_ID retrieved by the pairing browser.');

    return res.json({
      sessionId
    });
  });

  // --------------------------------------------------
  // Unknown API routes
  // --------------------------------------------------

  app.use('/pair', (req, res) => {
    res.status(405).json({
      error: 'Method not allowed.'
    });
  });

  app.use('/status', (req, res) => {
    res.status(405).json({
      error: 'Method not allowed.'
    });
  });

  // --------------------------------------------------
  // Error handler
  // --------------------------------------------------

  app.use((error, req, res, next) => {
    logger.error(
      'Pairing server error:',
      error.message
    );

    if (res.headersSent) {
      return next(error);
    }

    res.status(500).json({
      error: 'Internal pairing server error.'
    });
  });

  // --------------------------------------------------
  // Start HTTP server
  // --------------------------------------------------

  const server = app.listen(
    config.port,
    '0.0.0.0',
    () => {
      logger.info(
        `Pairing website listening on port ${config.port}.`
      );
    }
  );

  server.on('error', (error) => {
    logger.error(
      'Pairing server failed:',
      error.message
    );
  });

  // Expose server for controlled shutdown if needed.
  pairingState.server = server;

  return pairingState;
}

module.exports = {
  startPairingServer
};
