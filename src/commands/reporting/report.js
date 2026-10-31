const reportGenerator = require('../../reporting/reportGenerator');

module.exports = {
  name: 'report',
  category: 'REPORTING',
  scope: 'OWNER',
  description: 'Generate and display a full security report (stats, threats blocked, system health)',
  async execute(sock, m) {
    const { text } = reportGenerator.buildReport();
    await sock.sendMessage(m.chatJid, { text }, { quoted: m.raw });
  }
};
