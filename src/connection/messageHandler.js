'use strict';

const logger = require('../core/logger').child('MESSAGE');
const config = require('../core/config');
const jid = require('../utils/jid');

const commandRegistry = require('../commands');
const securityEngine = require('../security/engine');
const configStore = require('../security/configStore');
const eventLogger = require('../reporting/eventLogger');

function extractText(message) {
  if (!message || typeof message !== 'object') {
    return '';
  }

  return (
    message.conversation ||
    message.extendedTextMessage?.text ||
    message.imageMessage?.caption ||
    message.videoMessage?.caption ||
    ''
  );
}

async function handleMessage(sock, upsert) {
  if (!upsert || upsert.type !== 'notify') {
    return;
  }

  for (const raw of upsert.messages || []) {
    try {
      await processMessage(sock, raw);
    } catch (err) {
      logger.error('Message processing error:', err);
    }
  }
}

async function processMessage(sock, raw) {
  if (!raw?.key?.remoteJid || raw.key.remoteJid === 'status@broadcast') {
    return;
  }

  const chatJid = raw.key.remoteJid;
  const senderJid = raw.key.participant || raw.key.remoteJid;
  const sender = jid.normalize(senderJid);

  if (!sender) {
    return;
  }

  const isGroup = jid.isGroup(chatJid);
  const isOwner = Boolean(raw.key.fromMe || config.isOwnerNumber(sender));

  const message = raw.message || {};
  const text = extractText(message).trim();

  const vcard = message.contactMessage?.vcard || '';
  const vcardArray = message.contactsArrayMessage?.contacts || [];

  const mentionedJid =
    message.extendedTextMessage?.contextInfo?.mentionedJid || [];

  const isCommand = text.startsWith(config.prefix);

  // Ignore ordinary messages sent by the bot itself.
  if (raw.key.fromMe && !isCommand) {
    return;
  }

  let isAdmin = false;

  // Fetch group metadata only when required.
  if (isGroup && text && !isOwner) {
    try {
      const metadata = await sock.groupMetadata(chatJid);

      const participant = metadata.participants?.find(
        (entry) => jid.normalize(entry.id) === sender
      );

      isAdmin = Boolean(
        participant &&
        (participant.admin === 'admin' ||
          participant.admin === 'superadmin')
      );
    } catch (err) {
      logger.debug('Could not retrieve group metadata:', err.message);
    }
  }

  // Inspect group messages containing supported content.
  if (isGroup && (text || vcard || vcardArray.length)) {
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
      } catch (err) {
        logger.debug('Could not delete flagged message:', err.message);
      }

      const notifications = {
        warn: `⚠️ @${sender} message blocked by ${verdict.feature}.`,
        mute: `🔇 @${sender} has been muted for repeated violations.`,
        blacklist: `🚫 @${sender} has been blacklisted for repeated violations.`
      };

      const notification = notifications[verdict.strikeAction];

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

  if (!isCommand) {
    return;
  }

  const commandText = text.slice(config.prefix.length).trim();

  if (!commandText) {
    return;
  }

  const args = commandText.split(/\s+/);
  const commandName = args.shift().toLowerCase();

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
