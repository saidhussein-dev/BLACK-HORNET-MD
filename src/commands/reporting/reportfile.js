const fs = require('fs');
const reportGenerator = require('../../reporting/reportGenerator');

module.exports = {
  name: 'reportfile',
  category: 'REPORTING',
  scope: 'OWNER',
  description: 'Generate a security report and send it as a Markdown file',
  async execute(sock, m) {
    const filePath = reportGenerator.saveReportToFile();
    await sock.sendMessage(m.chatJid, {
      document: fs.readFileSync(filePath),
      fileName: filePath.split('/').pop(),
      mimetype: 'text/markdown',
      caption: '📊 Security report generated.'
    }, { quoted: m.raw });
  }
};
