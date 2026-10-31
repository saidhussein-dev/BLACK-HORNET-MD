// src/blueteam/engine.js
// Orchestrates the defensive pipeline for one incoming message: validation,
// filters, rate limiting and enforcement. This is the single place the
// message handler calls into for Blue Team protection.
const config = require('../core/config');
const logger = require('../core/logger').child('BLUETEAM');
const validator = require('./validator');
const filters = require('./filters');
const { SlidingWindowLimiter } = require('./rateLimiter');
const abuseTracker = require('./abuseTracker');
const configStore = require('./configStore');
const eventLogger = require('../reporting/eventLogger');
const statsStore = require('../reporting/statsStore');

const spamLimiter = new SlidingWindowLimiter(config.blueTeam.spamWindowMs, config.blueTeam.spamMaxMessages);
setInterval(() => spamLimiter.sweep(), 5 * 60 * 1000).unref();

/**
 * @param {object} ctx
 * @param {string} ctx.chatJid
 * @param {string} ctx.sender Bare number (digits only)
 * @param {boolean} ctx.isGroup
 * @param {boolean} ctx.isOwner
 * @param {boolean} ctx.isAdmin
 * @param {string} ctx.text
 * @param {string} [ctx.vcard]
 * @param {Array}  [ctx.vcardArray]
 * @param {Array}  [ctx.mentionedJid]
 * @returns {{ action: 'allow'|'block', reasons: string[], feature: string|null, strikeAction: string|null }}
 */
function inspect(ctx) {
  statsStore.increment('messagesScanned');

  if (ctx.isOwner) return { action: 'allow', reasons: [], feature: null, strikeAction: null };

  // Global blacklist: silently ignored everywhere.
  if (configStore.isBlacklisted(ctx.sender)) {
    return { action: 'block', reasons: ['sender is blacklisted'], feature: 'blacklist', strikeAction: null };
  }

  const chatCfg = configStore.getChatConfig(ctx.chatJid);

  // Mute: muted users are silently blocked (but not logged as a threat — it's an existing sanction).
  if (ctx.isGroup && configStore.isMuted(ctx.chatJid, ctx.sender)) {
    return { action: 'block', reasons: ['sender is muted'], feature: 'mute', strikeAction: null };
  }

  // Admins are exempt from content filters (but never from the blacklist/mute above).
  const exempt = ctx.isGroup && ctx.isAdmin;

  if (ctx.isGroup && chatCfg.antibug !== false && !exempt) {
    const result = validator.validateMessage({ text: ctx.text, vcard: ctx.vcard, vcardArray: ctx.vcardArray, mentionedJid: ctx.mentionedJid });
    if (result.suspicious) {
      return finalize(ctx, 'antibug', result.reasons);
    }
  }

  if (ctx.isGroup && chatCfg.antimention !== false && !exempt) {
    const count = ctx.mentionedJid?.length || 0;
    if (count > config.blueTeam.maxMentions) {
      return finalize(ctx, 'antimention', [`mass-mention (${count} mentions)`]);
    }
  }

  if (ctx.isGroup && chatCfg.antilink && !exempt && filters.containsLink(ctx.text)) {
    return finalize(ctx, 'antilink', ['message contains a link']);
  }

  if (ctx.isGroup && chatCfg.antispam && !exempt && ctx.text) {
    if (spamLimiter.hit(`${ctx.chatJid}_${ctx.sender}`)) {
      return finalize(ctx, 'antispam', ['flood: too many messages in a short window']);
    }
  }

  return { action: 'allow', reasons: [], feature: null, strikeAction: null };
}

function finalize(ctx, feature, reasons) {
  statsStore.incrementThreat(feature);
  eventLogger.logEvent('BLUE_TEAM', `${feature}.block`, { chat: ctx.chatJid, sender: ctx.sender, reasons });
  const { action: strikeAction } = abuseTracker.recordViolation(ctx.chatJid, ctx.sender, feature);
  logger.info(`blocked [${feature}] from ${ctx.sender} in ${ctx.chatJid}: ${reasons.join('; ')}`);
  return { action: 'block', reasons, feature, strikeAction };
}

module.exports = { inspect, spamLimiter };
