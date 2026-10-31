// src/database/jsonStore.js
// Tiny file-backed JSON store with atomic writes (temp file + rename) and a
// last-good backup, so a process kill mid-write can never corrupt the file.
// This is intentionally dependency-free: the project's data (config toggles,
// event log, stats) is small enough that a real database would be overkill.
const fs = require('fs');
const path = require('path');

class JsonStore {
  /**
   * @param {string} filePath Absolute path to the JSON file.
   * @param {*} defaultValue Value used when the file does not exist yet.
   */
  constructor(filePath, defaultValue) {
    this.filePath = filePath;
    this.bakPath = filePath + '.bak';
    this.tmpPath = filePath + '.tmp';
    this.defaultValue = defaultValue;
    this._cache = null;
    this._ensureDir();
    if (!fs.existsSync(this.filePath)) {
      this._writeRaw(JSON.stringify(this.defaultValue, null, 2));
    }
  }

  _ensureDir() {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }

  _writeRaw(text) {
    fs.writeFileSync(this.tmpPath, text);
    fs.renameSync(this.tmpPath, this.filePath);
    this._cache = text;
  }

  /** Read and parse the file, falling back to the last good backup, then the default. */
  read() {
    try {
      if (this._cache === null) this._cache = fs.readFileSync(this.filePath, 'utf8');
      return JSON.parse(this._cache);
    } catch (e) {
      try {
        const bak = fs.readFileSync(this.bakPath, 'utf8');
        this._cache = bak;
        return JSON.parse(bak);
      } catch (_) {
        this._cache = null;
        return JSON.parse(JSON.stringify(this.defaultValue));
      }
    }
  }

  /** Overwrite the file with `data`, then mirror it to the backup so .bak always holds the latest known-good copy. */
  write(data) {
    const text = JSON.stringify(data, null, 2);
    this._writeRaw(text);
    try { fs.writeFileSync(this.bakPath, text); } catch (_) { /* backup is best effort */ }
    return data;
  }

  /** Read-modify-write helper: `mutator(current)` returns the new value to persist. */
  update(mutator) {
    const current = this.read();
    const next = mutator(current);
    this.write(next);
    return next;
  }
}

module.exports = { JsonStore };
