# Deployment

BLACK HORNET MD is a plain long-running Node.js process. It needs:
- A place to run continuously (a VPS, a spare machine, or your own computer left on).
- Persistent disk for `storage/session/` (your WhatsApp login) and `storage/*.json` (Blue Team config, events, stats) — don't deploy to an ephemeral filesystem that wipes on restart, or you'll have to re-scan the QR every time.
- A process manager, so `.restart` and crash recovery actually bring the process back up (the bot's own code never auto-respawns itself after `process.exit`).

## Option A — pm2 (simplest)

```bash
npm install -g pm2
cd BLACK-HORNET-MD
npm install
pm2 start index.js --name black-hornet-md
pm2 save
pm2 startup   # follow the printed instructions to survive a machine reboot
```

Useful commands: `pm2 logs black-hornet-md`, `pm2 restart black-hornet-md`, `pm2 stop black-hornet-md`.

## Option B — systemd (Linux server)

Create `/etc/systemd/system/black-hornet-md.service`:

```ini
[Unit]
Description=BLACK HORNET MD WhatsApp Bot
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/black-hornet-md
ExecStart=/usr/bin/node index.js
Restart=always
RestartSec=5
User=botuser
EnvironmentFile=/opt/black-hornet-md/.env

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now black-hornet-md
sudo journalctl -u black-hornet-md -f   # follow logs
```

## Option C — Docker

A minimal `Dockerfile`:

```dockerfile
FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .
VOLUME ["/app/storage", "/app/reports"]
CMD ["node", "index.js"]
```

```bash
docker build -t black-hornet-md .
docker run -d --name black-hornet-md \
  --restart=always \
  -v $(pwd)/storage:/app/storage \
  -v $(pwd)/reports:/app/reports \
  --env-file .env \
  black-hornet-md
docker logs -f black-hornet-md   # scan the QR from here on first run
```

## Option D — Katabump (or other Pterodactyl-based free/low-cost panels)

1. Create a Node.js application/server on the panel and upload this project (or point it at your git repo).
2. Startup command: `npm start` (ensure the panel's install step runs `npm install` first).
3. Set environment variables in the panel's **Variables** tab, not only in a `.env` file — at minimum `OWNER_1`. Add `SESSION_ID` here once you have one (see below).
4. These panels usually assign their own `PORT` automatically; this bot already reads `process.env.PORT` for the pairing website, so no change needed unless the panel requires a specific one.
5. Start the server, then open the URL/port the panel assigns you — that's the pairing website. Use the **Pair Code** tab (enter your number, type the code into WhatsApp → Linked Devices → Link with phone number instead) or the **QR Code** tab. Both are more reliable than a panel's log console.
6. Immediately after it connects, copy the `SESSION_ID` the page shows you (it is also sent to your WhatsApp chat and printed in the logs) and save it in the panel's env vars. See "Portable sessions" below — this matters more here than on a VPS, since free panels don't always guarantee disk survives a reinstall/redeploy.

I can't vouch for Katabump's current free-tier specifics (RAM/disk limits, whether an idle process gets suspended) since plan details change — check their own docs for that. The bot itself has no Katabump-specific code; it's a standard long-running Node process with one HTTP port.

## First run / re-pairing

On a fresh deploy (empty `storage/session/`, no `SESSION_ID` set), the process prints a QR code to its logs **and** serves it at `http://<host>:<PORT>/` as a browser-friendly image. Scan either one from WhatsApp on your owner number within 20 seconds. Once connected, the page shows a `SESSION_ID` string (only in the browser that paired, for 10 minutes, and only on a fresh pairing) and the bot sends it to your own WhatsApp chat — save it. A pairing-code attempt that is never completed is cleaned up automatically on the next connection, so just request a new code.

## Portable sessions — `SESSION_ID`

`storage/session/` (Baileys' own auth-state files) is the normal source of truth. `SESSION_ID` is an alternative: a single string encoding the same credentials, meant for hosts where persistent disk isn't guaranteed (see the Katabump section above). Set it as an environment variable and the bot restores its login from it on boot instead of depending on `storage/session/` existing. It's generated automatically — shown in the logs and on the pairing website right after a successful QR scan — never typed by hand. Treat it like a password: anyone holding it can act as your logged-in WhatsApp session, so only put it in your host's env-var store, never in a committed file.

If the session is ever logged out from the WhatsApp app itself (Linked Devices → remove), the bot logs an explicit "session was logged out" message and stops reconnecting — delete `storage/session/`, unset `SESSION_ID`, and restart to re-pair with a fresh QR.

## Environment variables

See `.env.example` for the full, documented list. At minimum, set `OWNER_1` before deploying.
