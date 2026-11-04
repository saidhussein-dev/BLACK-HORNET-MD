const fs = require('fs');
const path = require('path');
// CHANGE '../utils/generatePayload' TO '../../utils/generatePayload'
const { generateTestPayload } = require('../../utils/generatePayload');

module.exports = {
  name: 'crashstick',
  aliases: ['fuzzstick', 'boomstick'],
  category: 'RESEARCH',
  description: 'Deploys a heavy hardware resource validation payload to the sandbox.',
  access: 'owner',

  /**
   * @param {object} sock Baileys socket
   * @param {object} m Message context: { chatJid, sender, isOwner, isAdmin, raw }
   * @param {string[]} args
   */
  async execute(sock, m, args) {
    const payloadPath = path.join(process.cwd(), 'src', 'storage', 'crash_test.webp');

    try {
      if (!fs.existsSync(payloadPath)) {
        await sock.sendMessage(m.chatJid, { text: '⏳ Test asset missing. Pre-compiling payload container buffer...' }, { quoted: m.raw });
        await generateTestPayload();
      }

      await sock.sendMessage(m.chatJid, { text: '🚀 Dispatching binary layout stream into target context channel...' }, { quoted: m.raw });

      const stickerBuffer = fs.readFileSync(payloadPath);

      await sock.sendMessage(m.chatJid, { 
        sticker: stickerBuffer 
      });

    } catch (error) {
      throw error;
    }
  }
};
