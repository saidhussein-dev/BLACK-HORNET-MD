const configStore = require('../../blueteam/configStore');

module.exports = {
  name: 'bluestatus',
  aliases: ['btstatus'],
  category: 'BLUE_TEAM',
  scope: 'GROUP',
  description: 'Show Blue Team protection status for this chat',
  async execute(sock, m) {
    const cfg = configStore.getChatConfig(m.chatJid);
    const mutedCount = Object.values(cfg.mutedUsers || {}).filter((exp) => exp > Date.now()).length;
    const line = (name) => `${cfg[name] ? '✅ ON' : '⭕ OFF'}  — ${name}`;
    await sock.sendMessage(m.chatJid, {
      text: `🔵 *Blue Team status for this chat*\n\n${line('antispam')}\n${line('antilink')}\n${line('antimention')}\n${cfg.antibug === false ? '⭕ OFF' : '✅ ON'}  — antibug\nCurrently muted here: ${mutedCount}`
    }, { quoted: m.raw });
  }
};
