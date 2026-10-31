// src/commands/scanner/scan.js
// Analyzes a quoted/replied message (or the text passed as arguments) for
// malformed-payload / crash-bug patterns, mass-mentions, vCard bombs etc.,
// and reports a threat score. Detection only — it never sends such a payload.
const patternDetector = require('../../detection/patternDetector');
const statsStore = require('../../reporting/statsStore');
const eventLogger = require('../../reporting/eventLogger');

module.exports = {
  name: 'scan',
  category: 'SCANNER',
  scope: 'BOTH',
  usage: '[reply to a message] or <text to analyze>',
  description: 'Analyze a message for malformed-payload / abuse patterns and score the threat',
  async execute(sock, m, args) {
    const quoted = m.raw?.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const quotedText = quoted?.conversation || quoted?.extendedTextMessage?.text || quoted?.imageMessage?.caption || '';
    const vcard = quoted?.contactMessage?.vcard || '';
    const vcardArray = quoted?.contactsArrayMessage?.contacts || [];
    const mentionedJid = quoted?.extendedTextMessage?.contextInfo?.mentionedJid
      || m.raw?.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];

    const text = quotedText || args.join(' ');
    if (!text && !vcard && !vcardArray.length) {
      await sock.sendMessage(m.chatJid, { text: 'Reply to a message with .scan, or run .scan <text> to analyze it.' }, { quoted: m.raw });
      return;
    }

    statsStore.increment('scansRun');
    const result = patternDetector.scanPayload({ text, vcard, vcardArray, mentionedJid, sender: m.sender });
    eventLogger.logEvent('SCANNER', 'scan.run', { requestedBy: m.sender, score: result.score, verdict: result.verdict });

    const reasonLines = result.reasons.length ? result.reasons.map((r) => `  • ${r}`).join('\n') : '  • none';
    await sock.sendMessage(m.chatJid, {
      text: `🔎 *Security Scan Result*\n\nVerdict: *${result.verdict}*\nScore: ${result.score}/100\n\nFindings:\n${reasonLines}\n\nMetrics: ${JSON.stringify(result.metrics)}`
    }, { quoted: m.raw });
  }
};
