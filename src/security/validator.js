'use strict';

// Stateless message validation.
// Detects suspicious message structures without generating harmful payloads.

const config = require('../core/config');

// Invisible Unicode characters and combining marks.
const INVISIBLE_CHAR_REGEX = /[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFE00-\uFE0F\u0300-\u036F]/g;

function countInvisibleChars(text) {
  if (typeof text !== 'string' || !text.length) {
    return 0;
  }

  const matches = text.match(INVISIBLE_CHAR_REGEX);
  return matches ? matches.length : 0;
}

/**
 * Find the longest consecutive run of identical characters.
 */
function longestRepeatedRun(text) {
  if (typeof text !== 'string' || !text.length) {
    return 0;
  }

  let longest = 1;
  let current = 1;

  for (let i = 1; i < text.length; i++) {
    if (text[i] === text[i - 1]) {
      current++;

      if (current > longest) {
        longest = current;
      }
    } else {
      current = 1;
    }
  }

  return longest;
}

/**
 * Validate an incoming message.
 *
 * @param {object} input
 * @param {string} input.text
 * @param {string} [input.vcard]
 * @param {Array} [input.vcardArray]
 * @param {Array} [input.mentionedJid]
 *
 * @returns {{
 *   suspicious: boolean,
 *   reasons: string[],
 *   metrics: object
 * }}
 */
function validateMessage({
  text = '',
  vcard = '',
  vcardArray = [],
  mentionedJid = []
} = {}) {
  const reasons = [];
  const security = config.security;

  // Normalize unexpected input types.
  text = typeof text === 'string' ? text : '';
  vcard = typeof vcard === 'string' ? vcard : '';

  vcardArray = Array.isArray(vcardArray) ? vcardArray : [];
  mentionedJid = Array.isArray(mentionedJid) ? mentionedJid : [];

  const textLength = text.length;

  if (textLength > security.maxTextLength) {
    reasons.push(
      `oversized text (${textLength} > ${security.maxTextLength} chars)`
    );
  }

  const invisibleCount = countInvisibleChars(text);

  if (invisibleCount > security.maxInvisibleChars) {
    reasons.push(
      `excessive invisible characters (${invisibleCount})`
    );
  }

  const repeatedRun = longestRepeatedRun(text);

  if (repeatedRun > security.maxRepeatedChar) {
    reasons.push(
      `repeated-character flood (run of ${repeatedRun})`
    );
  }

  const arrayVcardLength = vcardArray.reduce((sum, contact) => {
    return sum + (
      typeof contact?.vcard === 'string'
        ? contact.vcard.length
        : 0
    );
  }, 0);

  const totalVcardLength = vcard.length + arrayVcardLength;

  if (totalVcardLength > security.maxVcardLength) {
    reasons.push(
      `oversized vCard payload (${totalVcardLength} chars)`
    );
  }

  if (vcardArray.length > security.maxVcardCount) {
    reasons.push(
      `excessive contact count (${vcardArray.length})`
    );
  }

  const mentionCount = mentionedJid.length;

  if (mentionCount > security.maxMentions) {
    reasons.push(
      `excessive mentions (${mentionCount})`
    );
  }

  return {
    suspicious: reasons.length > 0,
    reasons,

    metrics: {
      textLength,
      invisibleCount,
      repeatedRun,
      totalVcardLength,
      vcardCount: vcardArray.length,
      mentionCount
    }
  };
}

module.exports = {
  validateMessage,
  countInvisibleChars,
  longestRepeatedRun,
  INVISIBLE_CHAR_REGEX
};
