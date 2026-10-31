const eventLogger = require('../../reporting/eventLogger');

module.exports = {
  name: 'threatlog',
  category: 'SCANNER',
  scope: 'OWNER',
  usage: '[count]',
  description: 'Show the most recent Blue Team / Scanner events',
  async execute(sock, m, args) {
    const limit = Math.min(Number(args[0]) || 10, 30);
    const events = eventLogger.recentEvents(limit).filter((e) => e.category === 'BLUE_TEAM' || e.category === 'SCANNER');
    if (!events.length) {
      await sock.sendMessage(m.chatJid, { text: '✅ No threats logged yet.' }, { quoted: m.raw });
      return;
    }
    const lines = events.map((e) => `[${e.iso}] ${e.category}/${e.action} ${JSON.stringify(e.data)}`).join('\n');
    await sock.sendMessage(m.chatJid, { text: `🔎 *Threat log (last ${events.length})*\n\n${lines}` }, { quoted: m.raw });
  }
};
