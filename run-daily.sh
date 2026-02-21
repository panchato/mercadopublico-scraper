#!/bin/bash
#
# Daily Compra Ágil Scraper
# Run this script daily to get new opportunities
#

cd "$(dirname "$0")"

# Load local env vars if present
if [ -f .env ]; then
  set -a
  source .env
  set +a
fi

ALERT_MODE="${ALERT_MODE:-critical-only}"

should_send_alert() {
  local level="$1"  # success|warning|critical
  case "$ALERT_MODE" in
    all) return 0 ;;
    critical-only)
      [ "$level" = "critical" ] && return 0 || return 1
      ;;
    warnings)
      [ "$level" = "critical" ] || [ "$level" = "warning" ] && return 0 || return 1
      ;;
    none) return 1 ;;
    *)
      # safe default
      [ "$level" = "critical" ] && return 0 || return 1
      ;;
  esac
}

send_telegram_alert() {
  local level="$1"
  local text="$2"

  should_send_alert "$level" || return 0

  if [ -z "$TELEGRAM_BOT_TOKEN" ] || [ -z "$TELEGRAM_CHAT_ID" ]; then
    return 0
  fi

  curl -sS -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
    -d "chat_id=${TELEGRAM_CHAT_ID}" \
    --data-urlencode "text=${text}" \
    -d "disable_web_page_preview=true" >/dev/null || true
}

echo "🎯 Mercado Público - Daily Scraper"
echo "=================================="
echo "Date: $(date)"
echo ""

# Pre-flight auth/session check (includes lightweight API probe)
node session-monitor.js --probe
MONITOR_EXIT=$?
if [ $MONITOR_EXIT -eq 2 ]; then
  echo "❌ Session/token is invalid or expired."
  echo "➡️ Re-auth required: run 'node login-local.js' on laptop and copy new session.json to VPS."
  send_telegram_alert "critical" "❌ Mercado Público scraper: session/token expired or invalid. Re-auth required (run login-local.js and update session.json)."
  exit 2
elif [ $MONITOR_EXIT -eq 1 ]; then
  echo "⚠️ Session/token expiring soon. Proceeding with scrape, but re-auth is recommended soon."
  send_telegram_alert "warning" "⚠️ Mercado Público scraper: session/token expiring soon. Scrape will continue, but re-auth is recommended."
fi

# Run scraper with your preferred filters
node scraper-final.js --region-metropolitana --mis-rubros --days=1
SCRAPE_EXIT=$?

if [ $SCRAPE_EXIT -ne 0 ]; then
  send_telegram_alert "critical" "❌ Mercado Público scraper failed with exit code ${SCRAPE_EXIT}. Check scraper.log on VPS."
  exit $SCRAPE_EXIT
fi

echo ""
echo "✅ Done! Check the JSON files for results."
echo ""
send_telegram_alert "success" "✅ Mercado Público scraper completed successfully."

# Optional: Send results somewhere
# Examples:
# - Email the summary
# - Upload to cloud storage  
# - Send to Telegram/Slack
# - Insert into database

exit 0
