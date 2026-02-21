# Mercado Público Scraper - convenience commands

.PHONY: help run monitor probe relogin

help:
	@echo "Targets:"
	@echo "  make run      - run daily flow (monitor + scrape + alerts)"
	@echo "  make monitor  - expiry signal checks"
	@echo "  make probe    - monitor + live API probe"
	@echo "  make relogin  - run local 2FA login helper"

run:
	./run-daily.sh

monitor:
	npm run monitor

probe:
	npm run monitor:probe

relogin:
	node login-local.js
