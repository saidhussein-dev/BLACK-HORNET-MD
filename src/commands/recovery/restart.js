// src/commands/recovery/restart.js
// Gracefully restarts the BOT PROCESS ITSELF (not anyone else's device).
// Requires the bot to run under a process manager that restarts on exit
// (pm2, systemd, Docker --restart=always) — see README "Deployment".
const eventLogger = require('../../reporting/eventLogger');

module.exports = {
  name: 'restart',
  category: 'RECOVERY',
  scope: 'OWNER',
  description: 'Gracefully restart the bot process (needs a process manager to come back up)',
  async execute(sock, m) {
    eventLogger.logEvent('RECOVERY', 'restart.requested', { requestedBy: m.sender });
    await sock.sendMessage(m.chatJid, { text: '🔄 Restarting... the bot will reconnect shortly if a process manager is configured.' }, { quoted: m.raw });
    setTimeout(() => process.exit(0), 1500);
  }
};
