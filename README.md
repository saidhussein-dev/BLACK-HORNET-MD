# 🐝 BLACK HORNET MD

A WhatsApp **defensive security research bot** built on Node.js and [Baileys](https://github.com/WhiskeySockets/Baileys). It inspects messages for malformed/"bug" payload patterns, rate-limits and auto-moderates abuse, monitors its own system health, recovers safely from disconnects, and produces security reports — all from a modular command set.

> **Scope note:** this build ships the **Blue Team / defensive** side only (validation, detection, rate limiting, monitoring, recovery, reporting). It does not include offensive "red team" payload-generation features — see [Project notes](#project-notes--what-was-intentionally-left-out) below for why, and how to extend it yourself if you choose to.

## What it actually does

| Category | Commands | What it's for |
|---|---|---|
| 🌐 Pairing site | web page on `PORT` | Pairing code (main) or QR from a browser, and your portable `SESSION_ID` once connected |
| ⚙️ General | `.menu` `.ping` `.owner` | Basics |
| 🔵 Blue Team | `.antispam` `.antilink` `.antimention` `.antibug` `.blacklist` `.mute` `.unmute` `.bluestatus` | Real-time input validation, flood/rate limiting, and strike-based enforcement (warn → mute → blacklist) |
| 🔎 Security Scanner | `.scan` `.threatlog` | Analyze any message (or quote one) and score it 0–100 for malformed-payload / abuse patterns |
| 🖥️ System Monitor | `.sysinfo` `.sysmonitor` `.healthcheck` | Live CPU, RAM, event-loop-lag and uptime metrics, with optional owner alerts on threshold breach |
| 🛠️ Recovery | `.recoverystatus` `.restart` | Reconnection history/backoff status, and a safe self-restart |
| 📊 Reporting | `.report` `.reportfile` `.history` | Full security report (on-screen or as a Markdown file) built from real logged events and stats |

Every Blue Team block, scan, monitor alert and reconnect is written to `storage/events.json` (capped, auto-trimmed) and summarized in `storage/stats.json`, which is exactly what `.report` reads from.

## Architecture

```
BLACK-HORNET-MD/
├── index.js                  # entry point
├── src/
│   ├── core/                 # config, logger
│   ├── connection/           # Baileys socket, QR + web pairing, SESSION_ID codec, message pipeline
│   ├── commands/              # one file per command, auto-loaded (general/blueteam/scanner/monitor/recovery/reporting)
│   ├── blueteam/              # validator, rate limiter, abuse tracker, filters, the defensive engine, per-chat config
│   ├── detection/             # anomaly scoring + combined pattern/threat scoring (used by .scan)
│   ├── monitoring/            # CPU/RAM/event-loop sampling
│   ├── recovery/              # reconnect backoff manager, global error handlers
│   ├── reporting/             # event log, stats store, report generator
│   ├── database/              # tiny atomic-write JSON store (no external DB needed)
│   └── utils/                 # JID helpers, access/permission checks
├── tests/                     # node:test unit tests (45 tests)
├── storage/                   # session + generated JSON data (gitignored)
├── reports/                   # generated .md reports land here
└── assets/                    # put your menu image here when you have one
```

This mirrors VORTE PRO's modular-command-handler / session-management approach (one file per command, auto-loaded by name; atomic JSON persistence; graceful reconnect-with-backoff), reorganized around a security-research feature set rather than a general-purpose bot.

## Setup

1. **Install Node.js 20+**, then:
   ```bash
   cd BLACK-HORNET-MD
   npm install
   cp .env.example .env
   ```
2. **Edit `.env`** — set `OWNER_1` to your own WhatsApp number (digits only, country code, no `+`), and list any other numbers you've authorized for controlled testing in `AUTHORIZED_TEST_NUMBERS`.
3. **Run it:**
   ```bash
   npm start
   ```
4. Pair with WhatsApp **either way**:
   - A QR code prints in the terminal — scan it from WhatsApp → **Linked Devices → Link a Device**, or
   - Open `http://localhost:3000` (or your host's assigned URL/port) in a browser. **Pair Code** tab (default): pick your country, enter your number, get an 8-character code, then WhatsApp → Linked Devices → Link with phone number instead → enter it. **QR Code** tab: the same QR as a clean image. Wrong or expired code? Request a new one any time.
5. Once connected, the console, the pairing website (to the browser that paired) and your own WhatsApp chat all give you a `SESSION_ID` string. **Save it** (e.g. as an env var on your host) — see [Portable sessions](#portable-sessions--session_id) below.
6. Message the bot (or add it to a test group) and send `.menu`.

## Portable sessions — `SESSION_ID`

Baileys normally keeps your login in `storage/session/` on disk. That's fine on your own machine or a VPS, but some free/low-cost panels don't guarantee disk survives a reinstall or redeploy — so you'd have to re-scan a QR every time.

To avoid that: once paired, copy the `SESSION_ID` string printed in the logs (or shown on the pairing website) into your `.env` / host's environment-variable panel as `SESSION_ID`. On the next boot, the bot restores its login straight from that variable instead of needing `storage/session/` at all. Treat it exactly like a password — anyone with that string can act as your logged-in WhatsApp session.

## Deploying on Katabump (or similar Pterodactyl-based panels)

This is a plain Node.js app, so it runs there like any other Node egg:
1. Create a Node.js-type server, upload/clone this project, set the **startup command** to `npm start` (make sure `npm install` runs first — most panels do this automatically on install/boot).
2. Set `OWNER_1` (and optionally `SESSION_ID`, once you have one) in the panel's **Environment Variables** section — not just in a `.env` file, since some panels don't read `.env` directly.
3. The panel usually injects its own `PORT` — this bot already reads `process.env.PORT` for the pairing website, so you normally don't need to set it yourself.
4. Open the subdomain/port the panel assigns you in a browser to get the pairing QR (more reliable than trying to read a QR out of the panel's console), scan it, then immediately copy the `SESSION_ID` it shows you.
5. Redeploying or reinstalling later: paste that saved `SESSION_ID` back into the panel's env vars before starting — no new QR scan needed, as long as WhatsApp hasn't logged the session out on its own.

I can't guarantee every detail of Katabump's free-tier limits (RAM/disk caps, whether it sleeps an idle process) since those change and vary by plan — check their current docs/Discord for that. Nothing about this bot is Katabump-specific beyond "it's a normal always-on Node process that needs outbound HTTPS and one open port."

### Running tests

```bash
npm test
```
Runs 53 unit tests (`node --test`) covering the validator, rate limiter, abuse tracker, anomaly/pattern detection, JSON store durability, system monitor, command loader, access control, and the SESSION_ID codec/loader. No network or a live WhatsApp session is required to run them.

## Deployment

See [`DEPLOY.md`](./DEPLOY.md) for running this under `pm2`/systemd/Docker so `.restart` and crash recovery actually bring the process back up, plus notes on hosting it on a VPS or a small always-on machine.

## Configuration reference

All thresholds (message size limits, rate-limit windows, strike thresholds, monitor warn levels) are in `.env.example` with sane defaults — see that file for the full list and what each one does.

## Project notes — what was intentionally left out

The original brief asked for a combined Red Team / Blue Team research bot. This build is **Blue Team only**: real-time defensive validation, rate limiting, abuse tracking, system monitoring, crash-safe recovery and reporting — all genuinely functional, not stubs.

It does **not** include:
- Any code that constructs or sends malformed/oversized/"bug" payloads, even against your own authorized test numbers.
- Any code adapted from STINGER V1's `69/` payload set — those files are large padded/invisible-unicode strings consistent with known WhatsApp client-crash techniques, and weren't used anywhere in this project (not even as "inspiration") beyond confirming what the defensive `.antibug` thresholds in `src/blueteam/validator.js` needed to catch.

If a controlled, consenting "red team" exercise between your own two numbers matters for the competition, the honest and generally safe way to demonstrate it is the reverse of what `.scan` does: construct a few borderline-but-not-actually-malicious test messages (e.g. long-but-reasonable text, a handful of mentions) and show `.scan` / `.bluestatus` / `.threatlog` correctly flagging and the Blue Team engine correctly enforcing against them — i.e., prove the defense works, rather than building an offense. That's also a more compelling thing to present to a lecturer than an attack script: it shows detection accuracy and a real threat model, which is what a judged "security" project is usually graded on.

## License

MIT — see `LICENSE`.
