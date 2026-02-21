# Mercado Público Scraper (Production Guide)

Status: **Production path active** ✅

## Canonical architecture (single path)

Use only these files for daily operation:

- `scraper-final.js` → API scraper (main)
- `session-monitor.js` → token/session health check
- `run-daily.sh` → monitor + scrape + Telegram alerts
- `login-local.js` → manual re-auth (2FA on laptop)
- `FINAL-STATUS.md` → current operational status

## Directory layout (after cleanup)

- `./` (root): production runtime files only
- `_archive/legacy-scripts/`: old Playwright/debug scripts
- `_archive/legacy-docs/`: old docs kept for reference
- Note: legacy scripts are not present in the current repo - the directory is retained for documentation continuity only.
- `artifacts/samples-2026-02-12/`: historical sample outputs

Output files now include full timestamp (`YYYY-MM-DD_HH-mm-ss`) so each run is saved separately.
- `artifacts/screenshots/`: historical screenshots/debug captures

## Daily run

```bash
cd /path/to/project
make run
```

(Equivalent: `./run-daily.sh`)

## Monitoring

```bash
make monitor  # expiry signal checks
make probe    # expiry checks + live API probe
```

(Equivalent npm scripts still work.)

Exit codes:
- `0` healthy
- `1` warning (expiring soon)
- `2` critical (expired/invalid)

## Telegram alerts (optional)

Set in `.env`:

```bash
TELEGRAM_BOT_TOKEN=123456:ABCDEF...
TELEGRAM_CHAT_ID=7709859105
ALERT_MODE=critical-only
```

`ALERT_MODE` values:
- `critical-only` (recommended)
- `warnings`
- `all`
- `none`

## Re-auth flow (when expired)

1. Run locally (laptop):
   ```bash
   node login-local.js
   ```
2. Complete 2FA

## Security notes

- Keep `session.json` and `.env` private.
- Never commit real tokens/passwords.
- Treat `_archive` as non-production reference only.
