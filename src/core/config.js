'use strict';

require('dotenv').config();

const path = require('path');

const ROOT = path.join(__dirname, '..', '..');

const ownerRaw = [
  process.env.OWNER_1,
  process.env.OWNER_2
].filter(Boolean);

const ownerDigits = ownerRaw.map((n) =>
  n.replace(/[^0-9]/g, '')
);

const num = (value, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

// Prefer new SEC_ variables, but support old BT_ variables temporarily.
const securityEnv = (newName, oldName, fallback) =>
  num(process.env[newName] ?? process.env[oldName], fallback);

const security = {
  maxTextLength: securityEnv('SEC_MAX_TEXT_LENGTH', 'BT_MAX_TEXT_LENGTH', 4000),
  maxVcardLength: securityEnv('SEC_MAX_VCARD_LENGTH', 'BT_MAX_VCARD_LENGTH', 3000),
  maxVcardCount: securityEnv('SEC_MAX_VCARD_COUNT', 'BT_MAX_VCARD_COUNT', 50),
  maxMentions: securityEnv('SEC_MAX_MENTIONS', 'BT_MAX_MENTIONS', 15),
  maxRepeatedChar: securityEnv('SEC_MAX_REPEATED_CHAR', 'BT_MAX_REPEATED_CHAR', 500),
  maxInvisibleChars: securityEnv('SEC_MAX_INVISIBLE_CHARS', 'BT_MAX_INVISIBLE_CHARS', 200),

  spamWindowMs: securityEnv('SEC_SPAM_WINDOW_MS', 'BT_SPAM_WINDOW_MS', 8000),
  spamMaxMessages: securityEnv('SEC_SPAM_MAX_MESSAGES', 'BT_SPAM_MAX_MESSAGES', 6),

  commandCooldownMs: securityEnv('SEC_COMMAND_COOLDOWN_MS', 'BT_COMMAND_COOLDOWN_MS', 1200),

  strikeWarnAt: securityEnv('SEC_STRIKE_WARN_AT', 'BT_STRIKE_WARN_AT', 3),
  strikeMuteAt: securityEnv('SEC_STRIKE_MUTE_AT', 'BT_STRIKE_MUTE_AT', 5),
  strikeMuteMinutes: securityEnv('SEC_STRIKE_MUTE_MINUTES', 'BT_STRIKE_MUTE_MINUTES', 10),
  strikeBlacklistAt: securityEnv('SEC_STRIKE_BLACKLIST_AT', 'BT_STRIKE_BLACKLIST_AT', 9)
};

module.exports = {
  root: ROOT,

  // Identity
  botName: process.env.BOT_NAME || 'BLACK HORNET MD',
  version: require('../../package.json').version,
  prefix: (process.env.PREFIX || '.').trim()[0] || '.',

  // Owners
  owners: ownerDigits,

  // Server
  port: num(process.env.PORT, 3000),

  // Paths
  sessionFolder: process.env.SESSION_FOLDER
    ? path.resolve(process.env.SESSION_FOLDER)
    : path.join(ROOT, 'storage', 'session'),

  storageDir: path.join(ROOT, 'storage'),
  logsDir: path.join(ROOT, 'storage', 'logs'),
  reportsDir: path.join(ROOT, 'reports'),
  assetsDir: path.join(ROOT, 'assets'),

  // Security configuration
  security,

  // Temporary backward compatibility.
  // Remove after every module has migrated to config.security.
  blueTeam: security,

  // Monitoring
  monitor: {
    sampleIntervalMs: num(process.env.MON_SAMPLE_INTERVAL_MS, 30000),
    eventLoopWarnMs: num(process.env.MON_EVENTLOOP_WARN_MS, 150),
    memoryWarnMB: num(process.env.MON_MEMORY_WARN_MB, 400),
    historySize: num(process.env.MON_HISTORY_SIZE, 200)
  },

  // Reporting
  reporting: {
    maxEvents: num(process.env.REPORT_MAX_EVENTS, 2000)
  },

  // Authorized testing numbers
  authorizedTestNumbers: (process.env.AUTHORIZED_TEST_NUMBERS || '')
    .split(',')
    .map((s) => s.replace(/[^0-9]/g, ''))
    .filter(Boolean),

  isOwnerNumber(digits) {
    return ownerDigits.includes(digits);
  },

  isAuthorizedTestNumber(digits) {
    return this.authorizedTestNumbers.includes(digits) ||
      this.isOwnerNumber(digits);
  }
};
