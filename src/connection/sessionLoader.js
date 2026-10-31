// src/connection/sessionLoader.js
// Decides where this run's WhatsApp session comes from: an explicit
// SESSION_ID env var (portable — works on hosts with ephemeral disk, like
// many free panels) takes priority, falling back to whatever's already on
// disk from a previous QR pairing. Mirrors VORTE PRO's sessionLoader/
// sessionPrompt split, minus the interactive console prompt (this bot is
// meant to run unattended under a process manager).
const fs = require('fs');
const path = require('path');
const sessionCodec = require('./sessionCodec');

/**
 * @param {string} sessionFolder Absolute path to the Baileys auth-state folder.
 * @param {object} env Usually process.env (injected for testability).
 * @returns {{ status: 'loaded'|'unchanged'|'missing'|'invalid', message?: string }}
 */
function acquireSession(sessionFolder, env = {}) {
  if (!fs.existsSync(sessionFolder)) fs.mkdirSync(sessionFolder, { recursive: true });
  const credsPath = path.join(sessionFolder, 'creds.json');

  const sessionId = env.SESSION_ID;
  if (sessionId && sessionId.trim()) {
    const decoded = sessionCodec.decodeSession(sessionId);
    if (!decoded.ok) return { status: 'invalid', message: decoded.error };
    try {
      fs.writeFileSync(credsPath, JSON.stringify(decoded.creds, null, 2));
      return { status: 'loaded' };
    } catch (e) {
      return { status: 'invalid', message: `could not write session from SESSION_ID: ${e.message}` };
    }
  }

  if (fs.existsSync(credsPath)) return { status: 'unchanged' };
  return { status: 'missing' };
}

/** Reads the current creds.json (after Baileys has logged in) and returns a portable SESSION_ID string, or null if not logged in yet. */
function exportSessionId(sessionFolder) {
  const credsPath = path.join(sessionFolder, 'creds.json');
  if (!fs.existsSync(credsPath)) return null;
  try {
    const creds = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
    return sessionCodec.encodeSession(creds);
  } catch (e) {
    return null;
  }
}

/**
 * A pairing-CODE attempt that never finished leaves a placeholder creds.json
 * behind (Baileys stores a fake "me" before the user enters the code). Booting
 * from that makes WhatsApp reject the login, so it is removed and the next
 * socket starts clean. A finished pairing (QR or code) is never touched.
 * @returns {boolean} true if an unfinished session was discarded.
 */
function discardStaleSession(sessionFolder) {
  const credsPath = path.join(sessionFolder, 'creds.json');
  if (!fs.existsSync(credsPath)) return false;
  let creds;
  try {
    creds = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
  } catch (e) {
    creds = null; // unreadable creds are as good as none
  }
  if (creds && (creds.registered || creds.account)) return false;
  for (const entry of fs.readdirSync(sessionFolder)) {
    if (entry === '.gitkeep') continue;
    fs.rmSync(path.join(sessionFolder, entry), { recursive: true, force: true });
  }
  return true;
}

module.exports = { acquireSession, exportSessionId, discardStaleSession };
