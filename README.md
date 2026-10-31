# 🐝 BLACK HORNET MD

A WhatsApp **defensive security research bot** built on Node.js and [Baileys](https://github.com/WhiskeySockets/Baileys). It inspects messages for malformed/"bug" payload patterns, rate-limits and auto-moderates abuse, monitors its own system health, recovers safely from disconnects, and produces security reports — all from a modular command set.

> **Scope note:** this build ships the **Blue Team / defensive** side only (validation, detection, rate limiting, monitoring, recovery, reporting). It does not include offensive "red team" payload-generation features — see [Project notes](#project-notes--what-was-intentionally-left-out) below for why, and how to extend it yourself if you choose to.

## What it actually does

| Category | Commands | What it's for |
|---|---|---|
| 🌐 Session ID generator site | web page on `PORT` | Link WhatsApp with a pairing code (main) or QR and get your `SESSION_ID`; the bot is then deployed with it |
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
│   ├── generator/            # session ID generator site (pair code + QR), real stats
│   ├── web/                  # the site's page (index.html, countries.js)
│   ├── connection/           # Baileys socket, SESSION_ID codec/loader, message pipeline
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
4. **Get a SESSION_ID** — the bot never pairs by itself. Open the generator site (`http://localhost:3000`, or your host's URL):
   - **Pair Code** tab (default): pick your country, enter your number, get an 8-character code, then WhatsApp → Linked Devices → Link with phone number instead → enter it.
   - **QR Code** tab: scan the QR from WhatsApp → Linked Devices → Link a Device.
   - Wrong or expired code? Request a new one any time.
   The site shows your `SESSION_ID` once and also sends it to your WhatsApp chat. **Save it.**
5. **Deploy the bot with it:** set `SESSION_ID` in `.env` (or your host's env vars, or a `session.txt` file next to `index.js`) and start the bot. Pairing on the site does **not** start the bot — the bot only runs where you give it a `SESSION_ID`. Without one it stays idle and tells you so.

## Two ways to deploy (same as VORTE PRO)

- **Generator site only** (e.g. Render): set `SESSION_GENERATOR_ONLY=true`. Only the website runs, no bot. `render.yaml` does this for you.
- **The bot** (VPS, Katabump, your PC, ...): set `SESSION_ID` (never `SESSION_GENERATOR_ONLY`). The bot logs in with it; the generator site is also served on `PORT`.

## Portable sessions — `SESSION_ID`

`SESSION_ID` is one string (starts with `BHMD~`) that holds your WhatsApp login, so a redeploy or a panel with a wiped disk needs no re-pairing. Treat it exactly like a password. Using the **same** `SESSION_ID` again after a restart keeps the saved (fresher) credentials; supplying a **new** one replaces them. If WhatsApp logs the session out, the bot stops and asks for a new `SESSION_ID`. One session = one running bot: don't run the same `SESSION_ID` on two hosts at once.

## Deploying on Katabump (or similar Pterodactyl-based panels)

1. Upload this project (or point the panel at your git repo) and run `npm install`.
2. In the panel's **Environment Variables** set `OWNER_1` and `SESSION_ID` (generate it on the generator site first — see Setup above). Start command: `npm start`.
3. The panel usually injects `PORT`; the bot already reads it.
4. Redeploying later: keep the same `SESSION_ID` in the env vars — no new pairing needed.

### Running tests

```bash
npm test
```
Runs 59 unit tests (`node --test`) covering the validator, rate limiter, abuse tracker, anomaly/pattern detection, JSON store durability, system monitor, command loader, access control, the SESSION_ID codec/loader, and the session generator (pair code + QR flows, against a fake WhatsApp). No network or a live WhatsApp session is required to run them.

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
