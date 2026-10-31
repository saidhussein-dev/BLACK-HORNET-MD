const eventLogger = require('../../reporting/eventLogger');

module.exports = {
  name: 'history',
  category: 'REPORTING',
  scope: 'OWNER',
  usage: '[count] [category]',
  description: 'Show raw event history (optionally filtered by category)',
  async execute(sock, m, args) {
    const limit = Math.min(Number(args[0]) || 20, 50);
    const category = args[1] ? args[1].toUpperCase() : null;
    const events = eventLogger.recentEvents(limit, category);
    if (!events.length) {
      await sock.sendMessage(m.chatJid, { text: 'No events recorded yet.' }, { quoted: m.raw });
      return;
    }
    const lines = events.map((e) => `[${e.iso}] ${e.category}/${e.action}`).join('\n');
    await sock.sendMessage(m.chatJid, { text: `📊 *Event history* (last ${events.length}${category ? `, ${category}` : ''})\n\n${lines}` }, { quoted: m.raw });
  }
};
