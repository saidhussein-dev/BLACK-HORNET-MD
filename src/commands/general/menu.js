// src/commands/general/menu.js
const os = require('os');
const config = require('../../core/config');

const CATEGORY_ORDER = ['GENERAL', 'BLUE_TEAM', 'SCANNER', 'MONITOR', 'RECOVERY', 'REPORTING'];
const CATEGORY_LABEL = {
  GENERAL: '⚙️ GENERAL',
  BLUE_TEAM: '🔵 BLUE TEAM — DEFENSE',
  SCANNER: '🔎 SECURITY SCANNER',
  MONITOR: '🖥️ SYSTEM MONITOR',
  RECOVERY: '🛠️ RECOVERY',
  REPORTING: '📊 REPORTING'
};

function formatDuration(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return `${h}h ${m}m ${s}s`;
}

module.exports = {
  name: 'menu',
  aliases: ['help', 'blackhornet'],
  category: 'GENERAL',
  scope: 'BOTH',
  description: 'Show the BLACK HORNET MD command menu',
  async execute(sock, m, args, context) {
    const { registry, prefix, botName } = context;
    const usedRam = (process.memoryUsage().rss / 1e6).toFixed(1);
    const totalRam = (os.totalmem() / 1e6).toFixed(0);
    const uptime = formatDuration(process.uptime());

    let body = `
╔══════════════════════════════╗
║   🐝 ${botName}
║   WhatsApp Security Research & Defense
╚══════════════════════════════╝

➤ Prefix     : ${prefix}
➤ Commands   : ${registry.primaryCount()}
➤ Uptime     : ${uptime}
➤ Memory     : ${usedRam}MB / ${totalRam}MB
➤ Mode       : Defensive research (Blue Team)

`.trimStart();

    for (const cat of CATEGORY_ORDER) {
      const names = registry.categories.get(cat);
      if (!names || !names.length) continue;
      body += `┌─「 ${CATEGORY_LABEL[cat] || cat} 」\n`;
      for (const name of [...new Set(names)].sort()) {
        const cmd = registry.get(name);
        body += `│ ${prefix}${name}${cmd.usage ? ' ' + cmd.usage : ''}\n│   ↳ ${cmd.description || ''}\n`;
      }
      body += `└───────────────\n\n`;
    }

    body += `All actions are logged for REPORTING. Use "${prefix}help" any time to see this menu again.`;

    await sock.sendMessage(m.chatJid, { text: body }, { quoted: m.raw });
  }
};
