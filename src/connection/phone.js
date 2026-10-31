// src/connection/phone.js
// Turns what the pairing form sends (country dial code + number the user typed)
// into the digits-only international number Baileys needs for a pairing code.

/**
 * @param {string} dial   Country dial code, e.g. "255" or "+255".
 * @param {string} number What the user typed. A leading "+" means "this already
 *                        includes the country code"; otherwise leading zeros
 *                        (trunk prefix) are dropped.
 * @returns {{ ok: true, digits: string } | { ok: false, error: string }}
 */
function normalizePhone(dial, number) {
  const dialDigits = String(dial || '').replace(/[^0-9]/g, '');
  const raw = String(number || '').trim();
  const numDigits = raw.replace(/[^0-9]/g, '');
  if (!numDigits) return { ok: false, error: 'Enter your WhatsApp number.' };

  let digits;
  if (raw.startsWith('+')) {
    digits = numDigits;
  } else {
    if (!dialDigits) return { ok: false, error: 'Choose your country.' };
    digits = dialDigits + numDigits.replace(/^0+/, '');
  }

  if (digits.length < 8 || digits.length > 15 || digits[0] === '0') {
    return { ok: false, error: 'That number does not look valid. Check the country and number.' };
  }
  return { ok: true, digits };
}

/** "ABCD1234" -> "ABCD-1234" */
function formatPairingCode(code) {
  const c = String(code || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  return c.length === 8 ? `${c.slice(0, 4)}-${c.slice(4)}` : c;
}

module.exports = { normalizePhone, formatPairingCode };
