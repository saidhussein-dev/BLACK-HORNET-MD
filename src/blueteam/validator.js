// src/blueteam/validator.js
// Pure, stateless input validation. Given a message's text/vcard/mentions,
// decide whether it matches known malformed-payload shapes ("bug" messages
// used to crash or freeze a WhatsApp client) WITHOUT ever constructing such
// a payload ourselves. Detection-only, by design.
const config = require('../core/config');

// Unicode categories commonly abused for "invisible flood" crash payloads:
// zero-width characters, combining marks, and format/control characters.
const INVISIBLE_CHAR_REGEX = /[​-‏‪-‮⁠-⁯︀-️̀-ͯ]/g;

function countInvisibleChars(text) {
  const matches = text.match(INVISIBLE_CHAR_REGEX);
  return matches ? matches.length : 0;
}

/** Longest run of the same single character (catches "aaaaaa...x50000" flood strings). */
function longestRepeatedRun(text) {
  let longest = 1;
  let current = 1;
  for (let i = 1; i < text.length; i++) {
    if (text[i] === text[i - 1]) {
      current++;
      if (current > longest) longest = current;
    } else {
      current = 1;
    }
  }
  return text.length ? longest : 0;
}

/**
 * @param {object} input
 * @param {string} input.text
 * @param {string} [input.vcard] Single contact vCard string
 * @param {Array}  [input.vcardArray] Array of { vcard } for contactsArrayMessage
 * @param {Array}  [input.mentionedJid]
 * @returns {{ suspicious: boolean, reasons: string[], metrics: object }}
 */
function validateMessage({ text = '', vcard = '', vcardArray = [], mentionedJid = [] } = {}) {
  const reasons = [];
  const t = config.blueTeam;

  const textLength = text.length;
  if (textLength > t.maxTextLength) reasons.push(`oversized text (${textLength} > ${t.maxTextLength} chars)`);

  const invisibleCount = countInvisibleChars(text);
  if (invisibleCount > t.maxInvisibleChars) reasons.push(`excessive invisible/zero-width characters (${invisibleCount})`);

  const repeatedRun = longestRepeatedRun(text);
  if (repeatedRun > t.maxRepeatedChar) reasons.push(`repeated-character flood (run of ${repeatedRun})`);

  const totalVcardLength = (vcard?.length || 0) + vcardArray.reduce((sum, c) => sum + (c.vcard?.length || 0), 0);
  if (totalVcardLength > t.maxVcardLength) reasons.push(`oversized vCard payload (${totalVcardLength} bytes)`);
  if (vcardArray.length > t.maxVcardCount) reasons.push(`contact-array bomb (${vcardArray.length} contacts)`);

  if ((mentionedJid?.length || 0) > t.maxMentions) reasons.push(`mass-mention / tag-bombing (${mentionedJid.length} mentions)`);

  return {
    suspicious: reasons.length > 0,
    reasons,
    metrics: { textLength, invisibleCount, repeatedRun, totalVcardLength, vcardCount: vcardArray.length, mentionCount: mentionedJid?.length || 0 }
  };
}

module.exports = { validateMessage, countInvisibleChars, longestRepeatedRun, INVISIBLE_CHAR_REGEX };
