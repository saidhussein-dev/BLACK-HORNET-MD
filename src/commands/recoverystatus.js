const reconnectManager = require('../../recovery/reconnectManager');

module.exports = {
  name: 'recoverystatus',
  aliases: ['reconnectstatus'],
  category: 'RECOVERY',
  scope: 'OWNER',
  description: 'Show reconnection attempts and recent connection history',
  async execute(sock, m) {
    const status = reconnectManager.getStatus();
    const lines = status.history.length
      ? status.history.map((h) => `[${new Date(h.ts).toISOString()}] ${h.event}${h.reason ? ' — ' + h.reason : ''}`).join('\n')
      : '  (no reconnect events yet — connection has been stable)';
    await sock.sendMessage(m.chatJid, {
      text: `🛠️ *Recovery status*\n\nCurrent attempt streak: ${status.attempts}\nReconnect pending: ${status.pending ? 'yes' : 'no'}\n\nRecent history:\n${lines}`
    }, { quoted: m.raw });
  }
};
