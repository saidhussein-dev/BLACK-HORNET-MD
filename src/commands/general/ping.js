module.exports = {
  name: 'ping',
  category: 'GENERAL',
  scope: 'BOTH',
  description: 'Check bot latency',
  async execute(sock, m) {
    const start = Date.now();
    const sent = await sock.sendMessage(m.chatJid, { text: '🏓 Pinging...' }, { quoted: m.raw });
    const latency = Date.now() - start;
    await sock.sendMessage(m.chatJid, { text: `🏓 Pong! ${latency}ms`, edit: sent?.key }).catch(async () => {
      await sock.sendMessage(m.chatJid, { text: `🏓 Pong! ${latency}ms` });
    });
  }
};
