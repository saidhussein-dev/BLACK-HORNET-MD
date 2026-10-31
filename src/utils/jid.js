// src/utils/jid.js
// JID helpers shared across the bot.
function isGroup(jid) {
  return !!jid && jid.endsWith('@g.us');
}

/** Bare digit string from any JID shape (@s.whatsapp.net, @lid, with/without :device). */
function normalize(jid) {
  if (!jid) return '';
  return jid.split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
}

module.exports = { isGroup, normalize };
