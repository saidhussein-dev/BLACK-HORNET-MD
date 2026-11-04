'use strict';

const fs = require('fs');
const path = require('path');

const logger = require('../core/logger').child('COMMANDS');
const config = require('../core/config');
const access = require('../utils/access');
const statsStore = require('../reporting/statsStore');

class CommandRegistry {
  constructor() {
    this.commands = new Map();
    this.categories = new Map();

    this.load();
  }

  load() {
    this.commands.clear();
    this.categories.clear();

    const files = fs.readdirSync(__dirname, {
      withFileTypes: true
    });

    for (const entry of files) {
      if (!entry.isFile() || !entry.name.endsWith('.js')) {
        continue;
      }

      if (entry.name === path.basename(__filename)) {
        continue;
      }

      const fullPath = path.join(__dirname, entry.name);

      try {
        delete require.cache[require.resolve(fullPath)];

        const mod = require(fullPath);

        const isCommand = (command) =>
          command &&
          typeof command.name === 'string' &&
          command.name.trim().length > 0 &&
          typeof command.execute === 'function';

        const commands = isCommand(mod)
          ? [mod]
          : Object.values(mod || {}).filter(isCommand);

        for (const command of commands) {
          this.register(command, entry.name);
        }
      } catch (err) {
        logger.error(
          `Failed to load command "${entry.name}":`,
          err
        );
      }
    }

    logger.info(
      `Loaded ${this.primaryCount()} commands across ${this.categories.size} categories`
    );
  }

  register(command, filename) {
    const name = command.name.trim().toLowerCase();

    if (this.commands.has(name)) {
      logger.warn(
        `Duplicate command "${name}" in ${filename}. Skipping.`
      );
      return;
    }

    command.name = name;

    this.commands.set(name, command);

    const aliases = Array.isArray(command.aliases)
      ? command.aliases
      : [];

    for (const alias of aliases) {
      if (typeof alias !== 'string' || !alias.trim()) {
        logger.warn(
          `Invalid alias in "${name}" from ${filename}. Skipping.`
        );
        continue;
      }

      const normalizedAlias = alias.trim().toLowerCase();

      if (this.commands.has(normalizedAlias)) {
        logger.warn(
          `Duplicate alias "${normalizedAlias}" in ${filename}. Skipping alias.`
        );
        continue;
      }

      this.commands.set(normalizedAlias, command);
    }

    const category =
      typeof command.category === 'string' && command.category.trim()
        ? command.category.trim().toUpperCase()
        : 'GENERAL';

    command.category = category;

    if (!this.categories.has(category)) {
      this.categories.set(category, []);
    }

    this.categories.get(category).push(name);
  }

  get(name) {
    if (typeof name !== 'string') {
      return undefined;
    }

    return this.commands.get(name.trim().toLowerCase());
  }

  primaryCount() {
    return new Set(this.commands.values()).size;
  }

  async dispatch(sock, m, commandName, args) {
    const command = this.get(commandName);

    if (!command) {
      return false;
    }

    const verdict = access.check(command, m);

    if (!verdict.ok) {
      await sock.sendMessage(
        m.chatJid,
        { text: verdict.message },
        { quoted: m.raw }
      ).catch(() => {});

      return true;
    }

    try {
      statsStore.increment('commandsExecuted');

      await command.execute(sock, m, args, {
        registry: this,
        botName: config.botName,
        prefix: config.prefix
      });
    } catch (err) {
      logger.error(
        `Error executing "${commandName}":`,
        err
      );

      await sock.sendMessage(
        m.chatJid,
        {
          text: `An error occurred while running ${config.prefix}${commandName}.`
        },
        { quoted: m.raw }
      ).catch(() => {});
    }

    return true;
  }
}

module.exports = new CommandRegistry();
