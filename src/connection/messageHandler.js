'use strict';

const logger = require('../core/logger').child('MESSAGE');
const config = require('../core/config');
const jid = require('../utils/jid');

const commandRegistry = require('../commands');
const securityEngine = require('../security/engine');
const configStore = require('../security/configStore');
const eventLogger = require('../reporting/eventLogger');

function extractText(message) {
  return (
    message?.conversation ||
    message?.extendedTextMessage?.text ||
    message?.imageMessage?.caption ||
    message?.videoMessage?.caption ||
    ''
  );
}

async function handleMessage(sock, upsert) {
  if (upsert.type !== 'notify') return;

  for (const raw of upsert.messages || []) {
    try {
      await processMessage(sock, raw);
    } catch (err) {
      logger.error('Message processing error:', err);
    }
  }
}

async function processMessage(sock, raw) {
  if (!raw?.key || raw.key.remoteJid === 'status@broadcast') return;

  const chatJid = raw.key.remoteJid;
  const senderJid = raw.key.participant || raw.key.remoteJid;
  const sender = jid.normalize(senderJid);

  const isGroup = jid.isGroup(chatJid);
  const isOwner = !!raw.key.fromMe || config.isOwnerNumber(sender);

  const text = extractText(raw.message).trim();

  // Ignore non-command messages sent by the bot itself.
  const isCommand = text.startsWith(config.prefix);

  if (raw.key.fromMe && !isCommand) return;

  const vcard = raw.message?.contactMessage?.vcard || '';
  const vcardArray = raw.message?.contactsArrayMessage?.contacts || [];
  const mentionedJid =
    raw.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];

  let isAdmin = false;

  // Resolve group admin status when needed.
  if (isGroup && text) {
    try {
      const metadata = await sock.groupMetadata(chatJid);

      const participant = metadata.participants.find(
        (p) => jid.normalize(p.id) === sender
      );

      isAdmin =
        !!participant &&
        (participant.admin === 'admin' ||
          participant.admin === 'superadmin');
    } catch (err) {
      logger.debug('Could not retrieve group metadata:', err.message);
    }
  }

  // Security inspection for group messages.
  if (isGroup && text) {
    const verdict = securityEngine.inspect({
      chatJid,
      sender,
      isGroup,
      isOwner,
      isAdmin,
      text,
      vcard,
      vcardArray,
      mentionedJid
    });

    if (verdict.action === 'block') {
      try {
        await sock.sendMessage(chatJid, {
          delete: raw.key
        });
      } catch (_) {}

      const messages = {
        warn: `⚠️ @${sender} message blocked by ${verdict.feature}.`,
        mute: `🔇 @${sender} has been muted for repeated violations.`,
        blacklist: `🚫 @${sender} has been blacklisted for repeated violations.`
      };

      const notification = messages[verdict.strikeAction];

      if (notification) {
        await sock.sendMessage(
          chatJid,
          {
            text: notification,
            mentions: [senderJid]
          }
        ).catch(() => {});
      }

      return;
    }
  }

  // Ignore blacklisted senders in private chats.
  if (!isGroup && !isOwner && configStore.isBlacklisted(sender)) {
    return;
  }

  if (!isCommand) return;

  const args = text
    .slice(config.prefix.length)
    .trim()
    .split(/\s+/);

  const commandName = (args.shift() || '').toLowerCase();

  if (!commandName) return;

  const messageContext = {
    chatJid,
    sender,
    isOwner,
    isAdmin,
    raw
  };

  const handled = await commandRegistry.dispatch(
    sock,
    messageContext,
    commandName,
    args
  );

  if (!handled) {
    eventLogger.logEvent(
      'SYSTEM',
      'command.unknown',
      {
        chat: chatJid,
        sender,
        commandName
      }
    );
  }
}

module.exports = {
  handleMessage,
  extractText
};
