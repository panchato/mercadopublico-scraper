#!/usr/bin/env node
/**
 * Session/Token Expiry Monitor for Mercado Público scraper
 *
 * Exit codes:
 * 0 = healthy
 * 1 = warning (expiring soon)
 * 2 = critical/expired/invalid
 */

const fs = require('fs');
const https = require('https');

const SESSION_PATH = './session.json';
const WARN_HOURS = Number(process.env.SESSION_WARN_HOURS || 24);
const CRIT_HOURS = Number(process.env.SESSION_CRIT_HOURS || 6);
const DO_PROBE = process.argv.includes('--probe');

function decodeJwtExp(token) {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    return payload.exp || null;
  } catch {
    return null;
  }
}

function hoursUntil(epochSeconds) {
  if (!epochSeconds || epochSeconds <= 0) return null;
  return (epochSeconds - Date.now() / 1000) / 3600;
}

function fmtHours(h) {
  if (h === null) return 'unknown';
  return `${h.toFixed(1)}h`;
}

function extractSignalCookies(cookies) {
  const find = (name) => cookies.find(c => c.name === name);

  const keycloakIdentity = find('KEYCLOAK_IDENTITY');
  const keycloakSession = find('KEYCLOAK_SESSION');
  const accessToken = find('access_token_ccr') || find('access_token');

  return {
    keycloakIdentityExp: keycloakIdentity ? decodeJwtExp(keycloakIdentity.value) : null,
    keycloakSessionExp: keycloakSession?.expires ? Math.floor(keycloakSession.expires) : null,
    accessTokenExp: accessToken ? decodeJwtExp(accessToken.value) : null,
    hasAccessToken: Boolean(accessToken)
  };
}

function classify(hoursLeftList) {
  const known = hoursLeftList.filter(h => h !== null);
  if (known.length === 0) return { level: 'WARN', code: 1, reason: 'No parseable expiry timestamps' };

  const minHours = Math.min(...known);
  if (minHours <= 0) return { level: 'CRITICAL', code: 2, reason: 'Session/token expired' };
  if (minHours <= CRIT_HOURS) return { level: 'CRITICAL', code: 2, reason: `Expiring very soon (${fmtHours(minHours)})` };
  if (minHours <= WARN_HOURS) return { level: 'WARN', code: 1, reason: `Expiring soon (${fmtHours(minHours)})` };
  return { level: 'OK', code: 0, reason: `Healthy (${fmtHours(minHours)} min remaining signal)` };
}

function probeApi(bearerToken) {
  return new Promise((resolve) => {
    if (!bearerToken) return resolve({ ok: false, status: 0, error: 'Missing bearer token' });

    const now = new Date();
    const past = new Date(Date.now() - 24 * 3600 * 1000);
    const fmt = (d) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;

    const query = new URLSearchParams({
      desde: fmt(past),
      hasta: fmt(now),
      orderBy: '2',
      estado: '2',
      page: '1',
      size: '1'
    }).toString();

    const url = `https://servicios-compra-agil.mercadopublico.cl/v1/compra-agil-busqueda/buscar?${query}`;

    const req = https.get(url, {
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'Authorization': `Bearer ${bearerToken}`,
        'Origin': 'https://compra-agil.mercadopublico.cl',
        'Referer': 'https://compra-agil.mercadopublico.cl/'
      }
    }, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        const ok = res.statusCode === 200;
        resolve({ ok, status: res.statusCode, error: ok ? null : body.slice(0, 180) });
      });
    });

    req.on('error', (err) => resolve({ ok: false, status: 0, error: err.message }));
  });
}

(async function main() {
  if (!fs.existsSync(SESSION_PATH)) {
    console.log('CRITICAL: session.json not found');
    process.exit(2);
  }

  let session;
  try {
    session = JSON.parse(fs.readFileSync(SESSION_PATH, 'utf8'));
  } catch (e) {
    console.log(`CRITICAL: invalid session.json (${e.message})`);
    process.exit(2);
  }

  const cookies = Array.isArray(session.cookies) ? session.cookies : [];
  const s = extractSignalCookies(cookies);

  const hAccess = hoursUntil(s.accessTokenExp);
  const hIdentity = hoursUntil(s.keycloakIdentityExp);
  const hSession = hoursUntil(s.keycloakSessionExp);

  let outcome = classify([hAccess, hIdentity, hSession]);

  const accessCookie = cookies.find(c => c.name === 'access_token_ccr' || c.name === 'access_token');
  if (DO_PROBE) {
    const probe = await probeApi(accessCookie?.value);
    if (!probe.ok) {
      outcome = {
        level: 'CRITICAL',
        code: 2,
        reason: `API probe failed (${probe.status}): ${probe.error || 'unknown error'}`
      };
    }
  }

  console.log(`[${outcome.level}] ${outcome.reason}`);
  console.log(`- access_token: ${fmtHours(hAccess)}`);
  console.log(`- KEYCLOAK_IDENTITY: ${fmtHours(hIdentity)}`);
  console.log(`- KEYCLOAK_SESSION: ${fmtHours(hSession)}`);
  console.log(`- probe: ${DO_PROBE ? 'enabled' : 'disabled'}`);

  process.exit(outcome.code);
})();
