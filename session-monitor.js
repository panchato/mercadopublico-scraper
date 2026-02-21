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
const { inspectToken } = require('./token-manager');

const SESSION_PATH = './session.json';
const WARN_HOURS = Number(process.env.SESSION_WARN_HOURS || 24);
const CRIT_HOURS = Number(process.env.SESSION_CRIT_HOURS || 6);
const DO_PROBE = process.argv.includes('--probe');

function fmtHours(h) {
  if (h === null) return 'unknown';
  return `${h.toFixed(1)}h`;
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

    let settled = false;
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
        if (settled) return;
        settled = true;
        const ok = res.statusCode === 200;
        resolve({ ok, status: res.statusCode, error: ok ? null : body.slice(0, 180) });
      });
    });

    req.setTimeout(10000, () => {
      if (settled) return;
      settled = true;
      req.destroy();
      resolve({ ok: false, status: 0, error: 'Request timed out after 10s' });
    });

    req.on('error', (err) => {
      if (settled) return;
      settled = true;
      resolve({ ok: false, status: 0, error: err.message });
    });
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
  const inspected = inspectToken();
  const accessToken = {
    ...(inspected.accessToken || {}),
    hoursLeft:
      inspected.accessToken && inspected.accessToken.hoursLeft !== undefined && inspected.accessToken.hoursLeft !== null
        ? Number(inspected.accessToken.hoursLeft)
        : inspected.accessToken && inspected.accessToken.secondsRemaining !== undefined && inspected.accessToken.secondsRemaining !== null
          ? Number(inspected.accessToken.secondsRemaining) / 3600
          : null
  };
  const hAccess = accessToken.hoursLeft !== null ? Number(accessToken.hoursLeft) : null;

  const keycloakIdentityCookie = cookies.find(c => c.name === 'KEYCLOAK_IDENTITY');
  let hIdentity = null;
  if (keycloakIdentityCookie?.value) {
    try {
      const parts = String(keycloakIdentityCookie.value).split('.');
      if (parts.length >= 2) {
        const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
        if (payload?.exp && Number(payload.exp) > 0) {
          hIdentity = (Number(payload.exp) - Date.now() / 1000) / 3600;
        }
      }
    } catch {
      hIdentity = null;
    }
  }

  const keycloakSessionCookie = cookies.find(c => c.name === 'KEYCLOAK_SESSION');
  let hSession = null;
  if (keycloakSessionCookie?.expires) {
    const sessionExp = Math.floor(Number(keycloakSessionCookie.expires));
    if (sessionExp > 0) {
      hSession = (sessionExp - Date.now() / 1000) / 3600;
    }
  }

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
  console.log(`- access_token: ${accessToken.hoursLeft !== null ? accessToken.hoursLeft + 'h' : 'unknown'}`);
  console.log(`- KEYCLOAK_IDENTITY: ${fmtHours(hIdentity)}`);
  console.log(`- KEYCLOAK_SESSION: ${fmtHours(hSession)}`);
  console.log(`- probe: ${DO_PROBE ? 'enabled' : 'disabled'}`);

  process.exit(outcome.code);
})();
