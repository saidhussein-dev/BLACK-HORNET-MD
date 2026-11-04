'use strict';

// Composable content filters for incoming messages.

const LINK_REGEX = /(https?:\/\/[^\s]+|www\.[^\s]+|chat\.whatsapp\.com\/[^\s]+|wa\.me\/[^\s]+)/i;

/**
 * Check whether text contains a recognizable URL.
 *
 * @param {string} text
 * @returns {boolean}
 */
function containsLink(text = '') {
  if (typeof text !== 'string' || !text.length) {
    return false;
  }

  return LINK_REGEX.test(text);
}

module.exports = {
  LINK_REGEX,
  containsLink
};
