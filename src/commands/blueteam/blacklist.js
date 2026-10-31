const configStore = require('../../blueteam/configStore');
const jid = require('../../utils/jid');

module.exports = {
  name: 'blacklist',
  category: 'BLUE_TEAM',
  scope: 'OWNER',
  usage: 'add|remove|list <number>',
  description: 'Manage the global blacklist (silently ignored everywhere)',
  async execute(sock, m, args) {
    const sub = (args[0] || '').toLowerCase();
    const number = jid.normalize(args[1] || '');

    if (sub === 'list' || !sub) {
      const list = configStore.getBlacklist();
      await sock.sendMessage(m.chatJid, { text: list.length ? `🚫 Blacklist:\n${list.join('\n')}` : '✅ Blacklist is empty.' }, { quoted: m.raw });
      return;
    }
    if (!number) {
      await sock.sendMessage(m.chatJid, { text: 'Usage: .blacklist add|remove|list <number>' }, { quoted: m.raw });
      return;
    }
    if (sub === 'add') {
      configStore.addToBlacklist(number);
      await sock.sendMessage(m.chatJid, { text: `🚫 ${number} added to the blacklist.` }, { quoted: m.raw });
    } else if (sub === 'remove') {
      configStore.removeFromBlacklist(number);
      await sock.sendMessage(m.chatJid, { text: `✅ ${number} removed from the blacklist.` }, { quoted: m.raw });
    } else {
      await sock.sendMessage(m.chatJid, { text: 'Usage: .blacklist add|remove|list <number>' }, { quoted: m.raw });
    }
  }
};
