const test = require('node:test');
const assert = require('node:assert/strict');
const registry = require('../src/commands');

test('loads a reasonable number of commands without throwing', () => {
  assert.ok(registry.primaryCount() >= 15, `expected at least 15 commands, got ${registry.primaryCount()}`);
});

test('menu command is registered under GENERAL', () => {
  const cmd = registry.get('menu');
  assert.ok(cmd);
  assert.equal(cmd.category, 'GENERAL');
});

test('toggle.js loaded all four blue team feature commands', () => {
  for (const name of ['antispam', 'antilink', 'antimention', 'antibug']) {
    const cmd = registry.get(name);
    assert.ok(cmd, `expected command "${name}" to be registered`);
    assert.equal(cmd.category, 'BLUE_TEAM');
  }
});

test('unknown command dispatch returns false without throwing', async () => {
  const fakeSock = { sendMessage: async () => ({}) };
  const handled = await registry.dispatch(fakeSock, { chatJid: 'x@s.whatsapp.net', isOwner: false, isAdmin: false }, 'definitely-not-a-real-command', []);
  assert.equal(handled, false);
});

test('an OWNER-scoped command is rejected for a non-owner with a clear message', async () => {
  let sentText = null;
  const fakeSock = { sendMessage: async (jid, content) => { sentText = content.text; return {}; } };
  const handled = await registry.dispatch(fakeSock, { chatJid: 'x@s.whatsapp.net', isOwner: false, isAdmin: false }, 'report', []);
  assert.equal(handled, true);
  assert.match(sentText, /owner/i);
});
