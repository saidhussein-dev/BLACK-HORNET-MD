'use strict';

const os = require('os');
const config = require('../../core/config');

const CATEGORY_ORDER = [
  'GENERAL',
  'SECURITY',
  'SCANNER',
  'MONITOR',
  'RECOVERY',
  'REPORTING'
];

// Internal category names can remain unchanged.
// Their displayed names don't need to expose the old architecture.
const CATEGORY_LABEL = {
  GENERAL: 'GENERAL',
  SECURITY: 'SECURITY',
  SCANNER: 'SECURITY SCANNER',
  MONITOR: 'MONITORING',
  RECOVERY: 'RECOVERY',
  REPORTING: 'REPORTING'
};

function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);

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

    const usedRam = (process.memoryUsage().rss / 1024 / 1024).toFixed(1);
    const totalRam = (os.totalmem() / 1024 / 1024).toFixed(0);
    const uptime = formatDuration(process.uptime());

    const output = [
const output = [
  '╭━━━〔 BLACK HORNET MD 〕━━━╮',
  '┃',
  '┃  WhatsApp Crasher',
  '┃  Creator  : 𝔇𝔢𝔞𝔱𝔥𝔰𝔱𝔯𝔬𝔨𝔢',
  `┃  Prefix   : ${prefix}`,
  `┃  Commands : ${registry.primaryCount()}`,
  `┃  Uptime   : ${uptime}`,
  `┃  Memory   : ${usedRam} MB / ${totalRam} MB`,
  '┃  Status   : Online',
  '┃'
];

    for (const category of CATEGORY_ORDER) {
      const names = registry.categories.get(category);

      if (!names || !names.length) continue;

      output.push(
        `┣━━━〔 ${CATEGORY_LABEL[category] || category} 〕━━━`
      );

      const uniqueNames = [...new Set(names)].sort();

      for (const name of uniqueNames) {
        const command = registry.get(name);

        if (!command) continue;

        output.push(`┃ ${prefix}${name}`);

        if (command.description) {
          output.push(`┃   ↳ ${command.description}`);
        }
      }

      output.push('┃');
    }
output.push(
  '╰━━━━━━━━━━━━━━━━━━━━╯',
  '   CREATED BY 𝔇𝔢𝔞𝔱𝔥𝔰𝔱𝔯𝔬𝔨𝔢',
  '        Enjoy :)'
);

    await sock.sendMessage(
      m.chatJid,
      { text: output.join('\n') },
      { quoted: m.raw }
    );
  }
};
