// src/connection/messageHandler.js
// Per-message pipeline: resolve identity/permissions -> Blue Team inspection
// -> enforcement OR command dispatch. This is the one place everything else
// (blueteam, detection, commands) gets wired together.
const logger = require('../core/logger').child('MESSAGE');
const config = require('../core/config');
const jid = require('../utils/jid');
const commandRegistry = require('../commands');
const blueTeamEngine = require('../blueteam/engine');
const configStore = require('../blueteam/configStore');
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
      logger.error('message processing error:', err);
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
  const vcard = raw.message?.contactMessage?.vcard || '';
  const vcardArray = raw.message?.contactsArrayMessage?.contacts || [];
  const mentionedJid = raw.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];

  let isAdmin = false;
  if (isGroup && !isOwner) {
    try {
      const meta = await sock.groupMetadata(chatJid);
      const participant = meta.participants.find((p) => jid.normalize(p.id) === sender);
      isAdmin = !!participant && (participant.admin === 'admin' || participant.admin === 'superadmin');
    } catch (e) { /* metadata lookup failing must never block the pipeline */ }
  }

  // Own messages that are not commands are ignored (avoid echoing/looping on the bot's own chatter).
  const isCommand = text.startsWith(config.prefix);
  if (raw.key.fromMe && !isCommand) return;

  // ---- Blue Team inspection (skips commands sent by the owner/admins implicitly via engine.inspect) ----
  if (isGroup && text) {
    const verdict = blueTeamEngine.inspect({ chatJid, sender, isGroup, isOwner, isAdmin, text, vcard, vcardArray, mentionedJid });
    if (verdict.action === 'block') {
      try { await sock.sendMessage(chatJid, { delete: raw.key }); } catch (_) {}
      if (verdict.strikeAction === 'warn') {
        await sock.sendMessage(chatJid, { text: `⚠️ @${sender} message blocked by ${verdict.feature} (${verdict.reasons[0] || 'policy violation'}).`, mentions: [senderJid] }).catch(() => {});
      } else if (verdict.strikeAction === 'mute') {
        await sock.sendMessage(chatJid, { text: `🔇 @${sender} has been muted for repeated violations.`, mentions: [senderJid] }).catch(() => {});
      } else if (verdict.strikeAction === 'blacklist') {
        await sock.sendMessage(chatJid, { text: `🚫 @${sender} has been blacklisted for repeated violations.`, mentions: [senderJid] }).catch(() => {});
      }
      return;
    }
  } else if (!isOwner && configStore.isBlacklisted(sender)) {
    return; // blacklisted senders are ignored in private chat too
  }

  if (!isCommand) return;

  const args = text.slice(config.prefix.length).trim().split(/\s+/);
  const commandName = (args.shift() || '').toLowerCase();
  if (!commandName) return;

  const handled = await commandRegistry.dispatch(sock, { chatJid, sender, isOwner, isAdmin, raw }, commandName, args);
  if (!handled) {
    eventLogger.logEvent('SYSTEM', 'command.unknown', { chat: chatJid, sender, commandName });
  }
}

module.exports = { handleMessage, extractText };
