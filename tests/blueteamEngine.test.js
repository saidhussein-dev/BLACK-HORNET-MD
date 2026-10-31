const test = require('node:test');
const assert = require('node:assert/strict');
const engine = require('../src/blueteam/engine');
const configStore = require('../src/blueteam/configStore');

const CHAT = 'test-chat-engine@g.us';

test('owner messages are always allowed, even if content would normally trip filters', () => {
  const result = engine.inspect({
    chatJid: CHAT, sender: '255700000001', isGroup: true, isOwner: true, isAdmin: false,
    text: 'a'.repeat(5000)
  });
  assert.equal(result.action, 'allow');
});

test('antibug blocks an oversized/malformed payload from a non-admin', () => {
  configStore.setChatConfig(CHAT, { antibug: true });
  const result = engine.inspect({
    chatJid: CHAT, sender: '255700000002', isGroup: true, isOwner: false, isAdmin: false,
    text: 'a'.repeat(5000)
  });
  assert.equal(result.action, 'block');
  assert.equal(result.feature, 'antibug');
});

test('group admins are exempt from content filters', () => {
  configStore.setChatConfig(CHAT, { antibug: true });
  const result = engine.inspect({
    chatJid: CHAT, sender: '255700000003', isGroup: true, isOwner: false, isAdmin: true,
    text: 'a'.repeat(5000)
  });
  assert.equal(result.action, 'allow');
});

test('clean, ordinary messages pass through', () => {
  const result = engine.inspect({
    chatJid: CHAT, sender: '255700000004', isGroup: true, isOwner: false, isAdmin: false,
    text: 'hello, how is everyone doing today?'
  });
  assert.equal(result.action, 'allow');
});

test('blacklisted senders are blocked regardless of content', () => {
  configStore.addToBlacklist('255700000099');
  const result = engine.inspect({
    chatJid: CHAT, sender: '255700000099', isGroup: true, isOwner: false, isAdmin: false,
    text: 'hi'
  });
  assert.equal(result.action, 'block');
  assert.equal(result.feature, 'blacklist');
  configStore.removeFromBlacklist('255700000099'); // clean up after the test
});
