// src/blueteam/configStore.js
// Per-chat Blue Team toggles (antispam/antilink/antimention/antibug), the
// mute list and the blacklist. Mirrors VORTE PRO's settings.json pattern:
// one JSON file, atomic writes, cached in memory.
const path = require('path');
const config = require('../core/config');
const { JsonStore } = require('../database/jsonStore');

const store = new JsonStore(path.join(config.storageDir, 'blueteam-config.json'), {
  global: { blacklist: [] },
  chats: {} // chatJid -> { antispam, antilink, antimention, antibug, mutedUsers: { number: expiryTs } }
});

function getChatConfig(chatJid) {
  const state = store.read();
  return state.chats?.[chatJid] || {};
}

function setChatConfig(chatJid, patch) {
  return store.update((state) => {
    state.chats = state.chats || {};
    state.chats[chatJid] = { ...(state.chats[chatJid] || {}), ...patch };
    return state;
  });
}

function toggleFeature(chatJid, feature, on) {
  return setChatConfig(chatJid, { [feature]: !!on });
}

function muteUser(chatJid, number, minutes) {
  return store.update((state) => {
    state.chats = state.chats || {};
    const chat = state.chats[chatJid] || {};
    chat.mutedUsers = chat.mutedUsers || {};
    chat.mutedUsers[number] = Date.now() + minutes * 60 * 1000;
    state.chats[chatJid] = chat;
    return state;
  });
}

function unmuteUser(chatJid, number) {
  return store.update((state) => {
    const chat = state.chats?.[chatJid];
    if (chat?.mutedUsers) delete chat.mutedUsers[number];
    return state;
  });
}

function isMuted(chatJid, number) {
  const chat = getChatConfig(chatJid);
  const expiry = chat.mutedUsers?.[number];
  return !!expiry && expiry > Date.now();
}

function getBlacklist() {
  return store.read().global?.blacklist || [];
}

function addToBlacklist(number) {
  return store.update((state) => {
    state.global = state.global || { blacklist: [] };
    if (!state.global.blacklist.includes(number)) state.global.blacklist.push(number);
    return state;
  });
}

function removeFromBlacklist(number) {
  return store.update((state) => {
    state.global = state.global || { blacklist: [] };
    state.global.blacklist = state.global.blacklist.filter((n) => n !== number);
    return state;
  });
}

function isBlacklisted(number) {
  return getBlacklist().includes(number);
}

module.exports = {
  getChatConfig, setChatConfig, toggleFeature,
  muteUser, unmuteUser, isMuted,
  getBlacklist, addToBlacklist, removeFromBlacklist, isBlacklisted
};
