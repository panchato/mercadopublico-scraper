const https = require('https');
const fs = require('fs');
const path = require('path');

const SESSION_PATH = path.resolve(__dirname, 'session.json');
const TOKEN_ENDPOINT = 'https://heimdall.mercadopublico.cl/auth/realms/chilecomprarealm/protocol/openid-connect/token';
const CLIENT_ID = 'mercadoPublicoClient';
const ACCESS_MIN_VALIDITY_SECONDS = 300;

class TokenExpiredError extends Error {
  constructor(message) {
    super(message || 'Session token expired or missing. Manual re-auth required.');
    this.name = 'TokenExpiredError';
    this.requiresManualReauth = true;
  }
}

class TokenRefreshError extends Error {
  constructor(message) {
    super(message || 'Token refresh failed. Manual re-auth required.');
    this.name = 'TokenRefreshError';
    this.requiresManualReauth = true;
  }
}

function decodeJwtExp(token) {
  try {
    if (!token || typeof token !== 'string') return null;
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    return Number.isFinite(payload.exp) ? payload.exp : null;
  } catch {
    return null;
  }
}

function normalizeEpochSeconds(value) {
  if (!Number.isFinite(value)) return null;
  const n = Math.floor(Number(value));
  return n > 0 ? n : null;
}

function secondsRemaining(expEpochSeconds) {
  if (!expEpochSeconds) return null;
  return expEpochSeconds - Math.floor(Date.now() / 1000);
}

function readSessionFileOrThrow() {
  let raw;
  try {
    raw = fs.readFileSync(SESSION_PATH, 'utf8');
  } catch (error) {
    throw new TokenExpiredError(`Unable to read session.json: ${error.message}`);
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.cookies)) parsed.cookies = [];
    return parsed;
  } catch (error) {
    throw new TokenExpiredError(`Invalid session.json format: ${error.message}`);
  }
}

function readSessionFileSafe() {
  try {
    return readSessionFileOrThrow();
  } catch (error) {
    return {
      cookies: [],
      _error: error.message
    };
  }
}

function findCookie(cookies, names) {
  for (const name of names) {
    const found = cookies.find((cookie) => cookie && cookie.name === name);
    if (found) return found;
  }
  return null;
}

function buildTokenState(cookieName, cookieValue, cookieExpires) {
  const jwtExp = decodeJwtExp(cookieValue);
  const cookieExp = normalizeEpochSeconds(cookieExpires);
  const expEpochSeconds = jwtExp || cookieExp;
  const remaining = secondsRemaining(expEpochSeconds);

  return {
    cookieName,
    present: Boolean(cookieValue),
    expiresAtEpochSeconds: expEpochSeconds,
    expiresAtISO: expEpochSeconds ? new Date(expEpochSeconds * 1000).toISOString() : null,
    secondsRemaining: remaining,
    isExpired: remaining !== null ? remaining <= 0 : null,
    isExpiringSoon: remaining !== null ? remaining <= ACCESS_MIN_VALIDITY_SECONDS : null
  };
}

function inspectToken() {
  const session = readSessionFileSafe();
  const cookies = Array.isArray(session.cookies) ? session.cookies : [];

  const accessCookie =
    findCookie(cookies, ['access_token_ccr']) ||
    findCookie(cookies, ['access_token']) ||
    null;
  const refreshCookie = findCookie(cookies, ['refresh_token']);

  const accessState = buildTokenState(
    accessCookie ? accessCookie.name : null,
    accessCookie ? accessCookie.value : null,
    accessCookie ? accessCookie.expires : null
  );
  const refreshState = buildTokenState(
    refreshCookie ? refreshCookie.name : null,
    refreshCookie ? refreshCookie.value : null,
    refreshCookie ? refreshCookie.expires : null
  );

  return {
    sessionPath: SESSION_PATH,
    inspectedAt: new Date().toISOString(),
    minAccessValiditySeconds: ACCESS_MIN_VALIDITY_SECONDS,
    accessToken: accessState,
    refreshToken: refreshState,
    error: session._error || null
  };
}

function upsertCookie(cookies, name, value, expEpochSeconds, template) {
  const expires = normalizeEpochSeconds(expEpochSeconds);
  const existing = cookies.find((cookie) => cookie && cookie.name === name);

  if (existing) {
    existing.value = value;
    if (expires) existing.expires = expires;
    return existing;
  }

  const synthetic = {
    name,
    value,
    domain: template?.domain || 'heimdall.mercadopublico.cl',
    path: template?.path || '/',
    httpOnly: template?.httpOnly !== undefined ? template.httpOnly : true,
    secure: template?.secure !== undefined ? template.secure : true,
    sameSite: template?.sameSite || 'Lax',
    expires: expires || -1
  };

  cookies.push(synthetic);
  return synthetic;
}

function requestTokenRefresh(refreshToken) {
  return new Promise((resolve, reject) => {
    const body =
      `grant_type=refresh_token` +
      `&client_id=${encodeURIComponent(CLIENT_ID)}` +
      `&refresh_token=${encodeURIComponent(refreshToken)}`;

    const endpoint = new URL(TOKEN_ENDPOINT);
    const req = https.request(
      {
        method: 'POST',
        hostname: endpoint.hostname,
        port: endpoint.port || 443,
        path: `${endpoint.pathname}${endpoint.search}`,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(body)
        }
      },
      (res) => {
        let responseBody = '';
        res.on('data', (chunk) => {
          responseBody += chunk;
        });
        res.on('end', () => {
          if (res.statusCode !== 200) {
            return reject(
              new TokenRefreshError(
                `Token endpoint returned HTTP ${res.statusCode}: ${responseBody.slice(0, 300)}`
              )
            );
          }

          let payload;
          try {
            payload = JSON.parse(responseBody);
          } catch (error) {
            return reject(new TokenRefreshError(`Failed to parse token refresh response: ${error.message}`));
          }

          if (!payload || !payload.access_token) {
            return reject(new TokenRefreshError('Token refresh response did not include access_token.'));
          }

          resolve(payload);
        });
      }
    );

    req.setTimeout(20000, () => {
      req.destroy(new TokenRefreshError('Token refresh request timed out.'));
    });

    req.on('error', (error) => {
      if (error instanceof TokenRefreshError) {
        reject(error);
      } else {
        reject(new TokenRefreshError(`Token refresh request failed: ${error.message}`));
      }
    });

    req.write(body);
    req.end();
  });
}

function persistRefreshedTokens(session, refreshed, fallbackRefreshCookie) {
  const cookies = Array.isArray(session.cookies) ? session.cookies : [];
  const nowEpochSeconds = Math.floor(Date.now() / 1000);

  const accessToken = refreshed.access_token;
  const refreshToken = refreshed.refresh_token || fallbackRefreshCookie.value;

  const accessExp =
    decodeJwtExp(accessToken) ||
    (Number.isFinite(Number(refreshed.expires_in)) ? nowEpochSeconds + Number(refreshed.expires_in) : null);

  const refreshExp =
    decodeJwtExp(refreshToken) ||
    (Number.isFinite(Number(refreshed.refresh_expires_in))
      ? nowEpochSeconds + Number(refreshed.refresh_expires_in)
      : normalizeEpochSeconds(fallbackRefreshCookie.expires));

  const accessTemplate =
    findCookie(cookies, ['access_token_ccr']) ||
    findCookie(cookies, ['access_token']) ||
    findCookie(cookies, ['KEYCLOAK_IDENTITY']) ||
    null;

  upsertCookie(cookies, 'access_token_ccr', accessToken, accessExp, accessTemplate);
  upsertCookie(cookies, 'access_token', accessToken, accessExp, accessTemplate);
  upsertCookie(cookies, 'refresh_token', refreshToken, refreshExp, fallbackRefreshCookie);

  session.cookies = cookies;
  fs.writeFileSync(SESSION_PATH, JSON.stringify(session, null, 2));
}

async function getValidToken() {
  const session = readSessionFileOrThrow();
  const cookies = Array.isArray(session.cookies) ? session.cookies : [];

  const accessCookie =
    findCookie(cookies, ['access_token_ccr']) ||
    findCookie(cookies, ['access_token']) ||
    null;

  const refreshCookie = findCookie(cookies, ['refresh_token']);

  const accessToken = accessCookie ? accessCookie.value : null;
  const accessExp =
    decodeJwtExp(accessToken) ||
    normalizeEpochSeconds(accessCookie ? accessCookie.expires : null);
  const remaining = secondsRemaining(accessExp);

  if (accessToken && remaining !== null && remaining > ACCESS_MIN_VALIDITY_SECONDS) {
    return accessToken;
  }

  if (!refreshCookie || !refreshCookie.value) {
    throw new TokenExpiredError('No refresh_token found in session.json. Manual re-auth required.');
  }

  let refreshed;
  try {
    refreshed = await requestTokenRefresh(refreshCookie.value);
  } catch (error) {
    if (error instanceof TokenRefreshError) {
      throw error;
    }
    throw new TokenRefreshError(error.message);
  }

  persistRefreshedTokens(session, refreshed, refreshCookie);
  return refreshed.access_token;
}

if (require.main === module) {
  console.log(JSON.stringify(inspectToken(), null, 2));
}

module.exports = {
  getValidToken,
  inspectToken,
  TokenExpiredError,
  TokenRefreshError
};
