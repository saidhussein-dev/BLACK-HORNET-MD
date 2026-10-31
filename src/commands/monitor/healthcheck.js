const systemMonitor = require('../../monitoring/systemMonitor');
const reconnectManager = require('../../recovery/reconnectManager');
const config = require('../../core/config');

module.exports = {
  name: 'healthcheck',
  aliases: ['health'],
  category: 'MONITOR',
  scope: 'OWNER',
  description: 'Run a full diagnostic: system resources + connection recovery status',
  async execute(sock, m) {
    const s = systemMonitor.snapshot();
    const recovery = reconnectManager.getStatus();

    const checks = [
      [s.eventLoopDelayMs <= config.monitor.eventLoopWarnMs, `Event-loop delay ${s.eventLoopDelayMs}ms (limit ${config.monitor.eventLoopWarnMs}ms)`],
      [s.processMemoryMB <= config.monitor.memoryWarnMB, `Process memory ${s.processMemoryMB}MB (limit ${config.monitor.memoryWarnMB}MB)`],
      [s.cpuLoadPercent < 90, `CPU load ${s.cpuLoadPercent}%`],
      [!recovery.pending, recovery.pending ? 'A reconnect is currently pending' : 'Connection stable, no pending reconnect']
    ];

    const lines = checks.map(([ok, label]) => `${ok ? '✅' : '⚠️'} ${label}`).join('\n');
    const overall = checks.every(([ok]) => ok) ? '✅ HEALTHY' : '⚠️ ATTENTION NEEDED';

    await sock.sendMessage(m.chatJid, { text: `🛠️ *Health Check* — ${overall}\n\n${lines}` }, { quoted: m.raw });
  }
};
