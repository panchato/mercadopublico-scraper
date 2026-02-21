# Mercado Público Scraper

A Node.js scraper for Chile's [Compra Ágil](https://compra-agil.mercadopublico.cl) public procurement platform. Runs daily to surface new opportunities filtered by region and product categories.

## What it does

- Authenticates via a saved Keycloak session (`session.json`)
- Pulls procurement opportunities from the Compra Ágil API
- Filters by region (Región Metropolitana) and registered product categories
- Optionally enriches opportunities closing within 72h with no existing offers
- Outputs full and summary JSON files per run
- Sends Telegram alerts on session expiry or scrape failure

## Quick start
    # Daily run (monitor + scrape + alerts)
    make run

    # Scrape only
    node scraper-final.js --region-metropolitana --mis-rubros --days=1

    # With enrichment
    node scraper-final.js --region-metropolitana --mis-rubros --days=1 --enrich

    # Check session health
    make monitor

    # Check session health + live API probe
    make probe


## Re-auth (when session expires)
    node login-local.js

Complete the 2FA flow in the browser. A fresh `session.json` will be saved automatically.

## Key files

| File | Purpose |
|---|---|
| `scraper-final.js` | Main scraper |
| `token-manager.js` | Token refresh and inspection |
| `enricher.js` | Detail enrichment for filtered opportunities |
| `session-monitor.js` | Session health checks |
| `login-local.js` | 2FA re-auth helper |
| `run-daily.sh` | Daily orchestration script |

## Configuration

Copy `.env.example` to `.env` and fill in your credentials:
    MP_USERNAME=your_rut
    MP_PASSWORD=your_password
    TELEGRAM_BOT_TOKEN=optional
    TELEGRAM_CHAT_ID=optional
    ALERT_MODE=critical-only


## CLI flags

| Flag | Description |
|---|---|
| `--region-metropolitana` | Filter by Región Metropolitana |
| `--mis-rubros` | Filter by your registered product categories |
| `--days=N` | Days back to search (1-90, default 7) |
| `--pages=N` | Max pages to fetch (1-50, default 10) |
| `--enrich` | Enrich opportunities closing within 72h with no existing offers |

## Security

Keep `session.json` and `.env` private. Both are gitignored. Never commit real credentials.
