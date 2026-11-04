// src/blueteam/filters.js
// Small, composable content filters used by the defensive message pipeline.
const LINK_REGEX = /(https?:\/\/[^\s]+|www\.[^\s]+|chat\.whatsapp\.com\/[^\s]+|wa\.me\/[^\s]+)/i;

function containsLink(text = '') {
  return LINK_REGEX.test(text);
}

module.exports = { LINK_REGEX, containsLink };
