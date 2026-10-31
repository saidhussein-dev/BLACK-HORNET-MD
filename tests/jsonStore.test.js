const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { JsonStore } = require('../src/database/jsonStore');

function tmpFile() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'bhmd-')), 'data.json');
}

test('creates file with default value when missing', () => {
  const file = tmpFile();
  const store = new JsonStore(file, { count: 0 });
  assert.deepEqual(store.read(), { count: 0 });
  assert.ok(fs.existsSync(file));
});

test('write then read round-trips', () => {
  const store = new JsonStore(tmpFile(), {});
  store.write({ a: 1, b: 'two' });
  assert.deepEqual(store.read(), { a: 1, b: 'two' });
});

test('update applies a mutator and persists it', () => {
  const store = new JsonStore(tmpFile(), { n: 0 });
  store.update((s) => { s.n += 5; return s; });
  assert.deepEqual(store.read(), { n: 5 });
});

test('falls back to default when the file is corrupted and no backup exists', () => {
  const file = tmpFile();
  new JsonStore(file, { ok: true }); // creates the file
  fs.writeFileSync(file, '{ this is not valid json');
  const store2 = new JsonStore(file, { ok: true });
  assert.deepEqual(store2.read(), { ok: true });
});

test('falls back to last-good backup after a corrupted write', () => {
  const file = tmpFile();
  const store = new JsonStore(file, { v: 'default' });
  store.write({ v: 'good' });
  // Simulate the main file getting corrupted after a good write (backup should hold 'good').
  fs.writeFileSync(file, 'not json at all');
  const store2 = new JsonStore(file, { v: 'default' });
  assert.deepEqual(store2.read(), { v: 'good' });
});
