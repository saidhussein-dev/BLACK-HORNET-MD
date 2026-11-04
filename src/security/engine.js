'use strict';

// Defensive security pipeline for incoming messages.

const config = require('../core/config');
const logger = require('../core/logger').child('SECURITY');

const validator = require('./validator');
const filters = require('./filters');

const { SlidingWindowLimiter } = require('./rateLimiter');

const abuseTracker = require('./abuseTracker');
const configStore = require('./configStore');

const eventLogger = require('../reporting/eventLogger');
const statsStore = require('../reporting/statsStore');

const spamLimiter = new SlidingWindowLimiter(
  config.security.spamWindowMs,
  config.security.spamMaxMessages
);

setInterval(() => {
  spamLimiter.sweep();
}, 5 * 60 * 1000).unref();

/**
 * Inspect an incoming message.
 *
 * @param {object} ctx
 * @param {string} ctx.chatJid
 * @param {string} ctx.sender
 * @param {boolean} ctx.isGroup
 * @param {boolean} ctx.isOwner
 * @param {boolean} ctx.isAdmin
 * @param {string} ctx.text
 * @param {string} [ctx.vcard]
 * @param {Array} [ctx.vcardArray]
 * @param {Array} [ctx.mentionedJid]
 *
 * @returns {{
 *   action: 'allow'|'block',
 *   reasons: string[],
 *   feature: string|null,
 *   strikeAction: string|null
 * }}
 */
function inspect(ctx) {
  statsStore.increment('messagesScanned');

  // Owners bypass security enforcement.
  if (ctx.isOwner) {
    return {
      action: 'allow',
      reasons: [],
      feature: null,
      strikeAction: null
    };
  }

  // Global blacklist.
  if (configStore.isBlacklisted(ctx.sender)) {
    return {
      action: 'block',
      reasons: ['sender is blacklisted'],
      feature: 'blacklist',
      strikeAction: null
    };
  }

  const chatCfg = configStore.getChatConfig(ctx.chatJid);

  // Group mute enforcement.
  if (
    ctx.isGroup &&
    configStore.isMuted(ctx.chatJid, ctx.sender)
  ) {
    return {
      action: 'block',
      reasons: ['sender is muted'],
      feature: 'mute',
      strikeAction: null
    };
  }

  // Admins bypass content filters, but not existing sanctions.
  const exempt = ctx.isGroup && ctx.isAdmin;

  // Message validation.
  if (ctx.isGroup && chatCfg.antibug !== false && !exempt) {
    const result = validator.validateMessage({
      text: ctx.text,
      vcard: ctx.vcard,
      vcardArray: ctx.vcardArray,
      mentionedJid: ctx.mentionedJid
    });

    if (result.suspicious) {
      return finalize(ctx, 'antibug', result.reasons);
    }
  }

  // Mention filtering.
  if (ctx.isGroup && chatCfg.antimention !== false && !exempt) {
    const count = ctx.mentionedJid?.length || 0;

    if (count > config.security.maxMentions) {
      return finalize(ctx, 'antimention', [
        `mass-mention (${count} mentions)`
      ]);
    }
  }

  // Link filtering.
  if (
    ctx.isGroup &&
    chatCfg.antilink &&
    !exempt &&
    filters.containsLink(ctx.text)
  ) {
    return finalize(ctx, 'antilink', [
      'message contains a link'
    ]);
  }

  // Spam detection.
  if (
    ctx.isGroup &&
    chatCfg.antispam &&
    !exempt &&
    ctx.text
  ) {
    const key = `${ctx.chatJid}_${ctx.sender}`;

    if (spamLimiter.hit(key)) {
      return finalize(ctx, 'antispam', [
        'flood: too many messages in a short window'
      ]);
    }
  }

  return {
    action: 'allow',
    reasons: [],
    feature: null,
    strikeAction: null
  };
}

function finalize(ctx, feature, reasons) {
  statsStore.incrementThreat(feature);

  eventLogger.logEvent(
    'SECURITY',
    `${feature}.block`,
    {
      chat: ctx.chatJid,
      sender: ctx.sender,
      reasons
    }
  );

  const { action: strikeAction } = abuseTracker.recordViolation(
    ctx.chatJid,
    ctx.sender,
    feature
  );

  logger.info(
    `blocked [${feature}] from ${ctx.sender} in ${ctx.chatJid}: ${reasons.join('; ')}`
  );

  return {
    action: 'block',
    reasons,
    feature,
    strikeAction
  };
}

module.exports = {
  inspect,
  spamLimiter
};
