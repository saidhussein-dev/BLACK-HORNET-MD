// src/monitoring/alertConfig.js
// Whether MONITOR threshold breaches should be pushed to the owner as a
// WhatsApp message. The sampler itself always runs (so history/reporting
// stay populated); this only gates the push notification.
const path = require('path');
const config = require('../core/config');
const { JsonStore } = require('../database/jsonStore');

const store = new JsonStore(path.join(config.storageDir, 'monitor-config.json'), { alertsEnabled: true });

function isEnabled() {
  return store.read().alertsEnabled !== false;
}

function setEnabled(enabled) {
  store.write({ alertsEnabled: !!enabled });
}

module.exports = { isEnabled, setEnabled };
