'use strict';

// Strike-based escalation for repeated violations:
// warn -> temporary mute -> blacklist.
//
// Strike counts are stored in memory and reset on restart.
// Persistent sanctions are stored by configStore.

const config = require('../core/config');
const configStore = require('./configStore');
const eventLogger = require('../reporting/eventLogger');

const strikes = new Map();

function key(chatJid, sender) {
  return `${chatJid}_${sender}`;
}

/**
 * Record a violation and determine the escalation action.
 *
 * @returns {{
 *   strikes: number,
 *   action: 'warn'|'mute'|'blacklist'|'none'
 * }}
 */
function recordViolation(chatJid, sender, reason) {
  const k = key(chatJid, sender);
  const count = (strikes.get(k) || 0) + 1;

  strikes.set(k, count);

  const security = config.security;
  let action = 'none';

  if (count >= security.strikeBlacklistAt) {
    configStore.addToBlacklist(sender);
    action = 'blacklist';
  } else if (count >= security.strikeMuteAt) {
    configStore.muteUser(
      chatJid,
      sender,
      security.strikeMuteMinutes
    );

    action = 'mute';
  } else if (count >= security.strikeWarnAt) {
    action = 'warn';
  }

  eventLogger.logEvent(
    'SECURITY',
    'abuse.strike',
    {
      chat: chatJid,
      sender,
      reason,
      strikes: count,
      action
    }
  );

  return {
    strikes: count,
    action
  };
}

function getStrikes(chatJid, sender) {
  return strikes.get(key(chatJid, sender)) || 0;
}

function clearStrikes(chatJid, sender) {
  strikes.delete(key(chatJid, sender));
}

module.exports = {
  recordViolation,
  getStrikes,
  clearStrikes
};
