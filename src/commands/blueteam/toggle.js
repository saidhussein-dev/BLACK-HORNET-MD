// src/commands/blueteam/toggle.js
// One command file handles antispam/antilink/antimention/antibug on/off —
// they share identical logic, so four near-duplicate files would just be
// copy-paste. Baileys-facing command names are generated below.
const configStore = require('../../blueteam/configStore');

const FEATURES = {
  antispam: 'Flood / rate-limit protection on raw messages',
  antilink: 'Blocks WhatsApp/invite links from non-admins',
  antimention: 'Blocks mass-mention ("tag bombing") messages',
  antibug: 'Blocks oversized / malformed payloads (crash-bug patterns)'
};

function makeToggleCommand(feature, description) {
  return {
    name: feature,
    category: 'BLUE_TEAM',
    scope: 'GROUP',
    admin: true,
    usage: 'on|off',
    description,
    async execute(sock, m, args) {
      const arg = (args[0] || '').toLowerCase();
      if (!['on', 'off'].includes(arg)) {
        const current = configStore.getChatConfig(m.chatJid)[feature];
        await sock.sendMessage(m.chatJid, { text: `🔵 ${feature} is currently *${current ? 'ON' : 'OFF'}*.\nUsage: .${feature} on|off` }, { quoted: m.raw });
        return;
      }
      configStore.toggleFeature(m.chatJid, feature, arg === 'on');
      await sock.sendMessage(m.chatJid, { text: `✅ ${feature} turned *${arg.toUpperCase()}* for this chat.` }, { quoted: m.raw });
    }
  };
}

// commands/index.js loads every exported { name, execute } it finds in a file.
// Export one command object per feature under distinct keys so all four load.
module.exports.antispam = makeToggleCommand('antispam', FEATURES.antispam);
module.exports.antilink = makeToggleCommand('antilink', FEATURES.antilink);
module.exports.antimention = makeToggleCommand('antimention', FEATURES.antimention);
module.exports.antibug = makeToggleCommand('antibug', FEATURES.antibug);
