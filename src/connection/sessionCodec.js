// src/connection/sessionCodec.js
// Encodes Baileys' creds.json into one portable string (and back) so a
// logged-in session can be stored as a SESSION_ID environment variable
// instead of depending on the host's disk surviving a redeploy. Pure
// functions, no I/O — kept separate from sessionLoader so it's unit-testable
// without touching the filesystem.
const PREFIX = 'BHMD~'; // identifies this bot's session strings (vs. a stray paste)

function encodeSession(credsObject) {
  const json = JSON.stringify(credsObject);
  const base64 = Buffer.from(json, 'utf8').toString('base64');
  return PREFIX + base64;
}

/**
 * @returns {{ ok: true, creds: object } | { ok: false, error: string }}
 */
function decodeSession(sessionId) {
  if (typeof sessionId !== 'string' || !sessionId.trim()) {
    return { ok: false, error: 'empty SESSION_ID' };
  }
  const trimmed = sessionId.trim();
  if (!trimmed.startsWith(PREFIX)) {
    return { ok: false, error: `SESSION_ID does not start with the expected "${PREFIX}" prefix` };
  }
  try {
    const json = Buffer.from(trimmed.slice(PREFIX.length), 'base64').toString('utf8');
    const creds = JSON.parse(json);
    if (!creds || typeof creds !== 'object') return { ok: false, error: 'decoded SESSION_ID is not a valid object' };
    return { ok: true, creds };
  } catch (e) {
    return { ok: false, error: `could not decode SESSION_ID: ${e.message}` };
  }
}

module.exports = { encodeSession, decodeSession, PREFIX };
