// src/utils/access.js
// Scope / permission gate, run before every command executes.
// A command declares: scope: 'PRIVATE' | 'GROUP' | 'BOTH' | 'OWNER', admin: bool.
const jid = require('./jid');
const config = require('../core/config');

const SCOPES = ['PRIVATE', 'GROUP', 'BOTH', 'OWNER'];

const MSG = {
  ownerOnly: '🚫 This command is restricted to the bot owner.',
  groupOnly: '🚫 This command can only be used inside a group.',
  privateOnly: '🚫 This command can only be used in a private chat.',
  adminOnly: '🚫 This command requires group admin privileges.'
};

/**
 * @param {object} command
 * @param {{ chatJid: string, isOwner: boolean, isAdmin: boolean }} m
 */
function check(command, m) {
  const scope = command.scope || 'BOTH';
  if (!SCOPES.includes(scope)) return { ok: false, message: MSG.ownerOnly };

  const group = jid.isGroup(m.chatJid);
  if (scope === 'GROUP' && !group) return { ok: false, message: MSG.groupOnly };
  if (scope === 'PRIVATE' && group) return { ok: false, message: MSG.privateOnly };
  if (scope === 'OWNER' && !m.isOwner) return { ok: false, message: MSG.ownerOnly };
  if (command.admin && group && !m.isOwner && !m.isAdmin) return { ok: false, message: MSG.adminOnly };

  return { ok: true };
}

function isOwnerNumber(number) {
  return config.isOwnerNumber(number);
}

module.exports = { check, isOwnerNumber, MSG };
