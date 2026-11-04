const config = require('../../core/config');

module.exports = {
  name: 'owner',
  category: 'GENERAL',
  scope: 'BOTH',
  description: 'Show bot owner / authorized-test contact info',
  async execute(sock, m) {
    const owners = config.owners.length ? config.owners.join(', ') : 'not configured';
    const testers = config.authorizedTestNumbers.length ? config.authorizedTestNumbers.join(', ') : '(none beyond owner)';
    await sock.sendMessage(m.chatJid, {
      text: `👤 *${config.botName}*\n\nOwner number(s): ${owners}\nAuthorized test numbers: ${testers}\n\nThis bot only runs controlled research actions between numbers listed above.`
    }, { quoted: m.raw });
  }
};
