const alertConfig = require('../../monitoring/alertConfig');

module.exports = {
  name: 'sysmonitor',
  category: 'MONITOR',
  scope: 'OWNER',
  usage: 'on|off',
  description: 'Toggle automatic owner alerts when CPU/RAM/event-loop thresholds are breached',
  async execute(sock, m, args) {
    const arg = (args[0] || '').toLowerCase();
    if (!['on', 'off'].includes(arg)) {
      await sock.sendMessage(m.chatJid, { text: `Monitor alerts are currently *${alertConfig.isEnabled() ? 'ON' : 'OFF'}*.\nUsage: .sysmonitor on|off` }, { quoted: m.raw });
      return;
    }
    alertConfig.setEnabled(arg === 'on');
    await sock.sendMessage(m.chatJid, { text: `✅ Monitor alerts turned *${arg.toUpperCase()}*.` }, { quoted: m.raw });
  }
};
