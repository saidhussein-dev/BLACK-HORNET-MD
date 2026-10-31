// src/core/logger.js
// Minimal leveled console logger. Kept dependency-free and silent-safe: a logging
// call must never throw and must never be the reason the bot crashes.
const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const configuredLevel = LEVELS[(process.env.LOG_LEVEL || 'info').toLowerCase()] ?? LEVELS.info;

const ICON = { debug: '🔍', info: 'ℹ️', warn: '⚠️', error: '❌' };

function ts() {
  return new Date().toISOString();
}

function log(level, tag, ...args) {
  try {
    if (LEVELS[level] < configuredLevel) return;
    const prefix = `${ICON[level] || ''} [${ts()}] [${tag}]`;
    (level === 'error' ? console.error : level === 'warn' ? console.warn : console.log)(prefix, ...args);
  } catch (_) { /* logging must never throw */ }
}

function child(tag) {
  return {
    debug: (...a) => log('debug', tag, ...a),
    info: (...a) => log('info', tag, ...a),
    warn: (...a) => log('warn', tag, ...a),
    error: (...a) => log('error', tag, ...a)
  };
}

module.exports = { child, log };
