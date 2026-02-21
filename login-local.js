#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
require('dotenv').config();

const START_URL = 'https://www.mercadopublico.cl';
const SUCCESS_DOMAIN = 'proveedor.mercadopublico.cl';
const SESSION_PATH = path.resolve(__dirname, 'session.json');
const LOCAL_STORAGE_ORIGINS = [
  'https://www.mercadopublico.cl',
  'https://proveedor.mercadopublico.cl',
  'https://accounts.claveunica.gob.cl'
];

function decodeJwtExp(token) {
  try {
    if (!token) return null;
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    return Number.isFinite(payload.exp) ? payload.exp : null;
  } catch {
    return null;
  }
}

function formatAsStorageEntries(input) {
  return Object.entries(input).map(([name, value]) => ({ name, value: String(value) }));
}

async function waitForProveedorLanding(context, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const matchingPage = context.pages().find((page) => {
      try {
        return page.url().includes(SUCCESS_DOMAIN);
      } catch {
        return false;
      }
    });

    if (matchingPage) return matchingPage;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw new Error(`Timed out waiting for login completion on ${SUCCESS_DOMAIN}.`);
}

async function collectLocalStorageByOrigin(context, origin) {
  const page = await context.newPage();
  try {
    await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 60000 });
    const storage = await page.evaluate(() => {
      const data = {};
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        data[key] = localStorage.getItem(key);
      }
      return data;
    });
    return { origin, localStorage: formatAsStorageEntries(storage) };
  } catch (error) {
    console.warn(`⚠️  Could not read localStorage for ${origin}: ${error.message}`);
    return { origin, localStorage: [] };
  } finally {
    await page.close();
  }
}

async function main() {
  const captured = {
    accessToken: null,
    refreshToken: null,
    expiresIn: null,
    refreshExpiresIn: null
  };

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  context.on('response', async (response) => {
    if (!/protocol\/openid-connect\/token/.test(response.url())) return;

    try {
      const payload = await response.json();
      if (payload && payload.access_token) {
        captured.accessToken = payload.access_token;
        captured.expiresIn = Number(payload.expires_in) || null;
      }
      if (payload && payload.refresh_token) {
        captured.refreshToken = payload.refresh_token;
        captured.refreshExpiresIn = Number(payload.refresh_expires_in) || null;
      }
    } catch {
      // Ignore non-JSON token responses.
    }
  });

  console.log('Opening Mercado Publico login flow...');
  console.log('Complete login + 2FA in the browser window.');

  await page.goto(START_URL, { waitUntil: 'domcontentloaded' });
  await waitForProveedorLanding(context, 20 * 60 * 1000);

  console.log(`✅ Login completed (landed on ${SUCCESS_DOMAIN}).`);

  if (captured.refreshToken) {
    const nowEpochSeconds = Math.floor(Date.now() / 1000);
    const derivedRefreshExp =
      captured.refreshExpiresIn && captured.refreshExpiresIn > 0
        ? nowEpochSeconds + captured.refreshExpiresIn
        : decodeJwtExp(captured.refreshToken);

    if (!derivedRefreshExp) {
      console.warn('⚠️  refresh_token captured, but refresh_expires_in is missing.');
    }

    await context.addCookies([
      {
        name: 'refresh_token',
        value: captured.refreshToken,
        domain: 'heimdall.mercadopublico.cl',
        path: '/',
        httpOnly: true,
        secure: true,
        sameSite: 'Lax',
        expires: derivedRefreshExp || -1
      }
    ]);
  } else {
    console.warn('⚠️  No refresh token was captured from token endpoint responses.');
  }

  const cookies = await context.cookies();
  const origins = [];
  for (const origin of LOCAL_STORAGE_ORIGINS) {
    origins.push(await collectLocalStorageByOrigin(context, origin));
  }

  const session = {
    capturedAt: new Date().toISOString(),
    cookies,
    origins,
    tokenCapture: {
      hasAccessToken: Boolean(captured.accessToken),
      hasRefreshToken: Boolean(captured.refreshToken),
      accessTokenExp: decodeJwtExp(captured.accessToken),
      refreshTokenExp: decodeJwtExp(captured.refreshToken),
      refreshExpiresIn: captured.refreshExpiresIn
    }
  };

  fs.writeFileSync(SESSION_PATH, JSON.stringify(session, null, 2));
  console.log(`💾 Session saved to ${SESSION_PATH}`);

  await browser.close();
}

main().catch((error) => {
  console.error(`❌ login-local failed: ${error.message}`);
  process.exit(1);
});
