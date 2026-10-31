// src/connection/sessionLoader.js
// Decides where this run's WhatsApp session comes from — the same session-only deployment
// VORTE PRO uses. The bot never pairs by itself: you generate a SESSION_ID on the pairing
// site, then deploy the bot with it (SESSION_ID env var, or a session.txt file next to
// index.js).
//   loaded    - the ID was written to disk (first run, or a NEW ID was supplied)
//   unchanged - same ID as last time (or no ID but a session is already on disk); the saved,
//               fresher credentials are kept instead of being overwritten by the old ID
//   invalid   - an ID is present but unusable (message says why)
//   missing   - no SESSION_ID and nothing on disk: the bot stays idle
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sessionCodec = require('./sessionCodec');

const HASH_FILE = '.session_hash'; // sha256 of the SESSION_ID currently written to disk
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

function readIf(file) { try { return fs.readFileSync(file, 'utf8').trim(); } catch (e) { return ''; } }

/**
 * @param {string} sessionFolder Absolute path to the Baileys auth-state folder.
 * @param {object} env Usually process.env (injected for testability).
 * @param {{ sessionFile?: string }} [opts] sessionFile: optional session.txt fallback for hosts without env vars.
 * @returns {{ status: 'loaded'|'unchanged'|'missing'|'invalid', message?: string, phone?: string }}
 */
function acquireSession(sessionFolder, env = {}, opts = {}) {
  if (!fs.existsSync(sessionFolder)) fs.mkdirSync(sessionFolder, { recursive: true });
  const credsPath = path.join(sessionFolder, 'creds.json');

  let raw = env.SESSION_ID && String(env.SESSION_ID).trim() ? env.SESSION_ID : '';
  if (!raw && opts.sessionFile) raw = readIf(opts.sessionFile);

  if (raw) {
    const decoded = sessionCodec.decodeSession(raw);
    if (!decoded.ok) return { status: 'invalid', message: decoded.error };
    if (!decoded.creds.me?.id) {
      return { status: 'invalid', message: 'SESSION_ID is from an unfinished pairing (no account linked). Finish pairing on the generator site, then copy the ID' };
    }
    const phone = String(decoded.creds.me.id).split(':')[0].split('@')[0];
    const hash = sha(decoded.normalized);

    if (readIf(path.join(sessionFolder, HASH_FILE)) === hash && fs.existsSync(credsPath)) {
      return { status: 'unchanged', phone };
    }
    try {
      for (const f of fs.readdirSync(sessionFolder)) {
        if (f === '.gitkeep') continue;
        fs.rmSync(path.join(sessionFolder, f), { recursive: true, force: true });
      }
      fs.writeFileSync(credsPath, JSON.stringify(decoded.creds, null, 2));
      fs.writeFileSync(path.join(sessionFolder, HASH_FILE), hash);
      return { status: 'loaded', phone };
    } catch (e) {
      return { status: 'invalid', message: `could not write session from SESSION_ID: ${e.message}` };
    }
  }

  if (fs.existsSync(credsPath)) return { status: 'unchanged' };
  return { status: 'missing' };
}

module.exports = { acquireSession };
