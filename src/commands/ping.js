'use strict';

module.exports = {
  name: 'ping',
  category: 'GENERAL',
  scope: 'BOTH',
  description: 'Check bot latency',

  async execute(sock, m) {
    const start = Date.now();

    const latency = Date.now() - start;

    let status = 'EXCELLENT';
    if (latency >= 500) status = 'SLOW';
    else if (latency >= 200) status = 'MODERATE';

    const output = [
      '╭━━━〔 PING RESULT 〕━━━╮',
      '┃',
      '┃  Status  : ONLINE',
      `┃  Latency : ${latency} ms`,
      `┃  Quality : ${status}`,
      '┃',
      '╰━━━━━━━━━━━━━━━━━━━━╯',
      '       BLACK HORNET MD'
    ].join('\n');

    await sock.sendMessage(
      m.chatJid,
      { text: output, edit: sent?.key }
    ).catch(async () => {
      await sock.sendMessage(m.chatJid, { text: output });
    });
  }
};
