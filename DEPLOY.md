# Deployment

BLACK HORNET MD is a plain long-running Node.js process. It needs:
- A place to run continuously (a VPS, a spare machine, or your own computer left on).
- Persistent disk for `storage/session/` (your WhatsApp login) and `storage/*.json` (Blue Team config, events, stats) — on an ephemeral filesystem (many free hosts) keep your `SESSION_ID` env var set so the bot can log in again after every restart.
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
docker logs -f black-hornet-md   # needs SESSION_ID in .env (generate it on the generator site first)
```

## Option D — Katabump (or other Pterodactyl-based free/low-cost panels)

1. Create a Node.js application/server on the panel and upload this project (or point it at your git repo).
2. Start command `npm start` (the panel runs `npm install`).
3. Set environment variables in the panel's **Variables** tab, not only in a `.env` file: `OWNER_1` and `SESSION_ID` (see "Get a SESSION_ID" below). Never set `SESSION_GENERATOR_ONLY` here.
4. The panel injects its own `PORT`; the bot already reads `process.env.PORT`.
5. No SESSION_ID yet? Put it in a `session.txt` file next to `index.js` instead and restart.

## Option E — Render (generator site only)

Render hosts the **Session ID generator website**, not the bot (free instances sleep and have no persistent disk).

1. New → Web Service → your repo. `render.yaml` sets everything: build `npm install`, start `npm start`, `SESSION_GENERATOR_ONLY=true`, health check `/health`.
2. Open the `onrender.com` URL → pair with a code or QR → copy the `SESSION_ID`.
3. Deploy the **bot** somewhere else (VPS, Katabump, your PC) with that `SESSION_ID`.
4. Free tier sleeps after ~15 minutes without traffic; the first visit after that takes a while to wake. Optional: point an uptime monitor at `/health`.
5. Optional bot download button: put the bot ZIP at `files/BLACK-HORNET-MD.zip`, or set `BOT_DOWNLOAD_URL` (see `files/README.md`).

## Get a SESSION_ID

Open the generator site (`http://<host>:<PORT>/`) and use **Pair Code** (enter your number, type the code into WhatsApp → Linked Devices → Link with phone number instead) or **QR Code**. A wrong or expired code can be replaced any time by requesting a new one. When linking finishes, the page shows the `SESSION_ID` **once** and a copy is sent to your WhatsApp chat. Linking only generates the ID — **it does not start or deploy the bot.**

## Portable sessions — `SESSION_ID`

The bot logs in only from a `SESSION_ID` (env var, or `session.txt`); it never pairs by itself. Without one it stays idle and says so. (`ENABLE_QR=true` prints a terminal QR for local testing only.)

- Using the **same** `SESSION_ID` again after a restart keeps the saved (fresher) credentials; a **new** one replaces them.
- If WhatsApp logs the session out, the bot stops with `Generate a NEW SESSION_ID` and does not retry. Replace it and restart.
- **One session = one running bot.** The same `SESSION_ID` on two hosts makes WhatsApp disconnect one of them.
- It is equivalent to your WhatsApp login. Only put it in your host's env-var store, never in a committed file.

### Generator-site switches
| Variable | Effect |
|---|---|
| `SESSION_GENERATOR_ONLY=true` | Website only, no bot (what `render.yaml` sets). **Never set it on a normal bot deployment.** |
| `MAX_PAIRINGS` (5) | Pairings in progress at once (each holds a WhatsApp socket). |
| `PAIRING_MAX_PER_IP_HOUR` (10) | Requests per IP per hour. |
| `PAIRING_COOLDOWN_MS` (5000) | Minimum gap between requests for the same number. |
| `QR_EXPIRE_MS` / `PAIRING_EXPIRE_MS` | How long an unscanned QR (3 min) / uncompleted code (10 min) is kept. |
| `BOT_DOWNLOAD_URL` | Link for the "Download bot file" button when no ZIP is in `files/`. |
| `TRUST_PROXY` (1) | Proxies in front of the site; set `0` if exposed directly. |

## Environment variables

See `.env.example` for the full, documented list. At minimum, set `OWNER_1` before deploying.
