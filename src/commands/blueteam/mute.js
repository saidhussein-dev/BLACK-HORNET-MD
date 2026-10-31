const configStore = require('../../blueteam/configStore');
const jid = require('../../utils/jid');

module.exports.mute = {
  name: 'mute',
  category: 'BLUE_TEAM',
  scope: 'GROUP',
  admin: true,
  usage: '<number> [minutes]',
  description: 'Temporarily mute a number in this group (bot ignores their messages)',
  async execute(sock, m, args) {
    const number = jid.normalize(args[0] || '');
    const minutes = Number(args[1]) > 0 ? Number(args[1]) : 10;
    if (!number) {
      await sock.sendMessage(m.chatJid, { text: 'Usage: .mute <number> [minutes]' }, { quoted: m.raw });
      return;
    }
    configStore.muteUser(m.chatJid, number, minutes);
    await sock.sendMessage(m.chatJid, { text: `🔇 ${number} muted for ${minutes} minute(s) in this chat.` }, { quoted: m.raw });
  }
};

module.exports.unmute = {
  name: 'unmute',
  category: 'BLUE_TEAM',
  scope: 'GROUP',
  admin: true,
  usage: '<number>',
  description: 'Lift a mute in this group',
  async execute(sock, m, args) {
    const number = jid.normalize(args[0] || '');
    if (!number) {
      await sock.sendMessage(m.chatJid, { text: 'Usage: .unmute <number>' }, { quoted: m.raw });
      return;
    }
    configStore.unmuteUser(m.chatJid, number);
    await sock.sendMessage(m.chatJid, { text: `🔊 ${number} unmuted in this chat.` }, { quoted: m.raw });
  }
};
