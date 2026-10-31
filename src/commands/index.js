// src/commands/index.js
// Modular command loader + dispatcher. Every .js file in this directory
// (except this one) that exports { name, execute } becomes a command,
// mirroring VORTE PRO's commandHandler pattern.
const fs = require('fs');
const path = require('path');
const logger = require('../core/logger').child('COMMANDS');
const config = require('../core/config');
const access = require('../utils/access');
const jid = require('../utils/jid');
const statsStore = require('../reporting/statsStore');

class CommandRegistry {
  constructor() {
    this.commands = new Map();
    this.categories = new Map(); // category -> [commandName]
    this.load();
  }

  load() {
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) { walk(full); continue; }
        if (!entry.name.endsWith('.js') || full === __filename) continue;
        try {
          const mod = require(full);
          // A file exports either one command ({ name, execute, ... }) or a
          // map of several related commands ({ foo: {...}, bar: {...} }),
          // as used by toggle.js for the four antispam/antilink/antimention/antibug twins.
          const isCommand = (c) => c && typeof c.name === 'string' && typeof c.execute === 'function';
          const list = isCommand(mod) ? [mod] : Object.values(mod || {}).filter(isCommand);
          for (const command of list) {
            this.commands.set(command.name, command);
            (command.aliases || []).forEach((a) => this.commands.set(a, command));
            const cat = command.category || 'GENERAL';
            if (!this.categories.has(cat)) this.categories.set(cat, []);
            this.categories.get(cat).push(command.name);
          }
        } catch (err) {
          // A single broken command file must never stop the rest from loading.
          logger.error(`failed to load command file "${full}":`, err.message);
        }
      }
    };
    walk(__dirname);
    logger.info(`loaded ${this.commands.size} commands (including aliases) across ${this.categories.size} categories`);
  }

  get(name) {
    return this.commands.get(name);
  }

  primaryCount() {
    return new Set(this.commands.values()).size;
  }

  /**
   * @param {object} sock Baileys socket
   * @param {object} m Message context: { chatJid, sender, isOwner, isAdmin, raw }
   * @param {string} commandName
   * @param {string[]} args
   */
  async dispatch(sock, m, commandName, args) {
    const command = this.get(commandName);
    if (!command) return false;

    const verdict = access.check(command, m);
    if (!verdict.ok) {
      await sock.sendMessage(m.chatJid, { text: verdict.message }, { quoted: m.raw }).catch(() => {});
      return true;
    }

    try {
      statsStore.increment('commandsExecuted');
      await command.execute(sock, m, args, { registry: this, botName: config.botName, prefix: config.prefix });
    } catch (err) {
      logger.error(`error executing "${commandName}":`, err);
      await sock.sendMessage(m.chatJid, { text: `❌ An error occurred while running .${commandName}.` }, { quoted: m.raw }).catch(() => {});
    }
    return true;
  }
}

module.exports = new CommandRegistry();
