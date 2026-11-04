const systemMonitor = require('../../monitoring/systemMonitor');

module.exports = {
  name: 'sysinfo',
  aliases: ['sys'],
  category: 'MONITOR',
  scope: 'BOTH',
  description: 'Show a live CPU / RAM / event-loop snapshot',
  async execute(sock, m) {
    const s = systemMonitor.snapshot();
    await sock.sendMessage(m.chatJid, {
      text: `🖥️ *System Monitor*\n\n` +
        `CPU load        : ${s.cpuLoadPercent}% (${s.cores} cores)\n` +
        `Load average     : ${s.loadavg.map((n) => n.toFixed(2)).join(', ')}\n` +
        `Process memory   : ${s.processMemoryMB} MB (heap ${s.heapUsedMB} MB)\n` +
        `System memory    : ${s.systemMemoryUsedPercent}% of ${s.systemMemoryTotalMB} MB used\n` +
        `Event-loop delay : ${s.eventLoopDelayMs} ms (peak ${s.eventLoopDelayMaxMs} ms)\n` +
        `Uptime           : ${s.uptimeSec}s`
    }, { quoted: m.raw });
  }
};
