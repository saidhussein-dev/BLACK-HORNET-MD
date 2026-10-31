// src/blueteam/abuseTracker.js
// Strike-based escalation for repeat offenders: warn -> temporary mute -> blacklist.
// In-memory strike counts (reset on restart by design — persistent punishment
// lives in configStore's mute list / blacklist, which IS persisted).
const config = require('../core/config');
const configStore = require('./configStore');
const eventLogger = require('../reporting/eventLogger');

const strikes = new Map(); // "chat_sender" -> count

function key(chatJid, sender) {
  return `${chatJid}_${sender}`;
}

/**
 * Record a violation and return the escalation decision.
 * @returns {{ strikes: number, action: 'warn'|'mute'|'blacklist'|'none' }}
 */
function recordViolation(chatJid, sender, reason) {
  const k = key(chatJid, sender);
  const count = (strikes.get(k) || 0) + 1;
  strikes.set(k, count);

  const t = config.blueTeam;
  let action = 'none';

  if (count >= t.strikeBlacklistAt) {
    configStore.addToBlacklist(sender);
    action = 'blacklist';
  } else if (count >= t.strikeMuteAt) {
    configStore.muteUser(chatJid, sender, t.strikeMuteMinutes);
    action = 'mute';
  } else if (count >= t.strikeWarnAt) {
    action = 'warn';
  }

  eventLogger.logEvent('BLUE_TEAM', 'abuse.strike', { chat: chatJid, sender, reason, strikes: count, action });
  return { strikes: count, action };
}

function getStrikes(chatJid, sender) {
  return strikes.get(key(chatJid, sender)) || 0;
}

function clearStrikes(chatJid, sender) {
  strikes.delete(key(chatJid, sender));
}

module.exports = { recordViolation, getStrikes, clearStrikes };
