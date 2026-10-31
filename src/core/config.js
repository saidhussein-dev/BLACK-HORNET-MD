// src/core/config.js
// Central configuration, loaded only from environment variables (.env). No secrets hardcoded.
require('dotenv').config();
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');

const ownerRaw = [process.env.OWNER_1, process.env.OWNER_2].filter(Boolean);
const ownerDigits = ownerRaw.map((n) => n.replace(/[^0-9]/g, ''));

const num = (value, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

module.exports = {
  root: ROOT,

  // Identity
  botName: process.env.BOT_NAME || 'BLACK HORNET MD',
  version: require('../../package.json').version,
  prefix: (process.env.PREFIX || '.').trim()[0] || '.',

  // Owners / authorized testers (digits only, no '+' or spaces)
  owners: ownerDigits,

  // Pairing website (QR + portable SESSION_ID). Most hosting panels (Katabump
  // and similar) inject their own PORT env var — fall back to 3000 locally.
  port: num(process.env.PORT, 3000),

  // Paths
  sessionFolder: process.env.SESSION_FOLDER ? path.resolve(process.env.SESSION_FOLDER) : path.join(ROOT, 'storage', 'session'),
  storageDir: path.join(ROOT, 'storage'),
  logsDir: path.join(ROOT, 'storage', 'logs'),
  reportsDir: path.join(ROOT, 'reports'),
  assetsDir: path.join(ROOT, 'assets'),

  // Blue Team thresholds (overridable via .env)
  blueTeam: {
    maxTextLength: num(process.env.BT_MAX_TEXT_LENGTH, 4000),
    maxVcardLength: num(process.env.BT_MAX_VCARD_LENGTH, 3000),
    maxVcardCount: num(process.env.BT_MAX_VCARD_COUNT, 50),
    maxMentions: num(process.env.BT_MAX_MENTIONS, 15),
    maxRepeatedChar: num(process.env.BT_MAX_REPEATED_CHAR, 500),
    maxInvisibleChars: num(process.env.BT_MAX_INVISIBLE_CHARS, 200),
    spamWindowMs: num(process.env.BT_SPAM_WINDOW_MS, 8000),
    spamMaxMessages: num(process.env.BT_SPAM_MAX_MESSAGES, 6),
    commandCooldownMs: num(process.env.BT_COMMAND_COOLDOWN_MS, 1200),
    strikeWarnAt: num(process.env.BT_STRIKE_WARN_AT, 3),
    strikeMuteAt: num(process.env.BT_STRIKE_MUTE_AT, 5),
    strikeMuteMinutes: num(process.env.BT_STRIKE_MUTE_MINUTES, 10),
    strikeBlacklistAt: num(process.env.BT_STRIKE_BLACKLIST_AT, 9)
  },

  // Monitoring
  monitor: {
    sampleIntervalMs: num(process.env.MON_SAMPLE_INTERVAL_MS, 30000),
    eventLoopWarnMs: num(process.env.MON_EVENTLOOP_WARN_MS, 150),
    memoryWarnMB: num(process.env.MON_MEMORY_WARN_MB, 400),
    historySize: num(process.env.MON_HISTORY_SIZE, 200)
  },

  // Reporting / storage caps
  reporting: {
    maxEvents: num(process.env.REPORT_MAX_EVENTS, 2000)
  },

  // Testing environment: numbers Said has explicitly authorized for controlled
  // red/blue-team exercises between his own devices. Nothing in this bot acts
  // on a number that is not in this list AND not the owner.
  authorizedTestNumbers: (process.env.AUTHORIZED_TEST_NUMBERS || '')
    .split(',').map((s) => s.replace(/[^0-9]/g, '')).filter(Boolean),

  isOwnerNumber(digits) {
    return ownerDigits.includes(digits);
  },

  isAuthorizedTestNumber(digits) {
    return this.authorizedTestNumbers.includes(digits) || this.isOwnerNumber(digits);
  }
};
