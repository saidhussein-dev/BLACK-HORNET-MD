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
 * Tolerant: trims, strips wrapping quotes and ANY whitespace/newlines (hosts and copy/paste
 * often wrap long values), and finds the prefix even if something was pasted before it.
 * @returns {{ ok: true, creds: object } | { ok: false, error: string }}
 */
function decodeSession(sessionId) {
  if (typeof sessionId !== 'string' || !sessionId.trim()) {
    return { ok: false, error: 'empty SESSION_ID' };
  }
  const cleaned = sessionId.trim().replace(/^["']+|["']+$/g, '').replace(/\s+/g, '');
  const at = cleaned.indexOf(PREFIX);
  if (at === -1) {
    return { ok: false, error: `SESSION_ID does not start with the expected "${PREFIX}" prefix (copy the whole value from the generator)` };
  }
  const b64 = cleaned.slice(at + PREFIX.length);
  if (!b64 || !/^[A-Za-z0-9+/=_-]+$/.test(b64)) {
    return { ok: false, error: 'SESSION_ID contains characters that are not valid base64 — it was probably cut or altered when pasted' };
  }
  try {
    const json = Buffer.from(b64.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    const creds = JSON.parse(json);
    if (!creds || typeof creds !== 'object') return { ok: false, error: 'decoded SESSION_ID is not a valid object' };
    return { ok: true, creds, normalized: PREFIX + b64 };
  } catch (e) {
    return { ok: false, error: 'SESSION_ID could not be decoded — it is incomplete or corrupted. Generate a new one' };
  }
}

module.exports = { encodeSession, decodeSession, PREFIX };
