const https = require('https');
const path = require('path');

const { getValidToken, TokenExpiredError } = require('./token-manager');

const BASE_URL = 'https://servicios-compra-agil.mercadopublico.cl';
const DETAIL_ENDPOINT_BASE = '/v1/compra-agil/solicitud';

function parseClosingDate(value) {
  if (!value || typeof value !== 'string') return null;

  const direct = new Date(value);
  if (!Number.isNaN(direct.getTime())) return direct;

  const ddmmyyyy = value.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!ddmmyyyy) return null;

  const [, dd, mm, yyyy, hh = '00', min = '00', ss = '00'] = ddmmyyyy;
  const normalized = `${yyyy}-${mm}-${dd}T${hh}:${min}:${ss}`;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function shouldEnrich(opportunity, nowMs) {
  if (!opportunity || typeof opportunity !== 'object') return false;

  const hasNoOffers = Number(opportunity.misOfertas) === 0 && Number(opportunity.numeroOfertas) === 0;
  if (!hasNoOffers) return false;

  const closingDate = parseClosingDate(opportunity.fechaCierre);
  if (!closingDate) return false;

  const deltaMs = closingDate.getTime() - nowMs;
  return deltaMs >= 0 && deltaMs <= 72 * 60 * 60 * 1000;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function requestDetail(codigo, bearerToken, timeoutMs) {
  const endpointPath = path.posix.join(DETAIL_ENDPOINT_BASE, encodeURIComponent(String(codigo)));
  const url = `${BASE_URL}${endpointPath}`;

  return new Promise((resolve, reject) => {
    const options = {
      method: 'GET',
      headers: {
        Accept: 'application/json, text/plain, */*',
        Authorization: `Bearer ${bearerToken}`,
        Origin: 'https://compra-agil.mercadopublico.cl',
        Referer: 'https://compra-agil.mercadopublico.cl/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    };

    let settled = false;
    const req = https.get(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        if (settled) return;
        settled = true;

        if (res.statusCode === 200) {
          try {
            resolve(JSON.parse(data));
          } catch (error) {
            const parseError = new Error(`Failed to parse detail JSON: ${error.message}`);
            parseError.retryable = false;
            reject(parseError);
          }
          return;
        }

        if (res.statusCode === 401) {
          reject(new TokenExpiredError(`HTTP 401 for detail ${codigo}. Session refresh failed or expired.`));
          return;
        }

        const httpError = new Error(`HTTP ${res.statusCode} for detail ${codigo}: ${data.substring(0, 200)}`);
        httpError.statusCode = res.statusCode;
        httpError.retryable = res.statusCode >= 500 && res.statusCode < 600;
        reject(httpError);
      });
    });

    req.setTimeout(timeoutMs, () => {
      const timeoutError = new Error(`Request timed out after ${Math.floor(timeoutMs / 1000)}s`);
      timeoutError.code = 'ETIMEDOUT';
      timeoutError.retryable = true;
      req.destroy(timeoutError);
    });

    req.on('error', (error) => {
      if (settled) return;
      settled = true;

      if (error.code === 'ETIMEDOUT' && !error.retryable) {
        error.retryable = true;
      }
      if (error.retryable === undefined) {
        error.retryable = true;
      }

      reject(error);
    });
  });
}

async function requestDetailWithRetry(codigo, bearerToken, timeoutMs, maxRetries) {
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      return await requestDetail(codigo, bearerToken, timeoutMs);
    } catch (error) {
      if (error instanceof TokenExpiredError) {
        throw error;
      }
      if (error.statusCode === 400 || error.statusCode === 401) {
        throw error;
      }

      const isRetryable =
        error.retryable === true ||
        (error.statusCode >= 500 && error.statusCode < 600);

      if (!isRetryable || attempt === maxRetries) {
        throw error;
      }

      const delaySeconds = 2 ** attempt;
      console.log(`   Attempt ${attempt + 1} failed: ${error.message}. Retrying in ${delaySeconds}s...`);
      await delay(delaySeconds * 1000);
    }
  }

  throw new Error(`Failed to enrich ${codigo} after retries.`);
}

function mapDetail(opportunity, detail) {
  const productos = Array.isArray(detail.productos)
    ? detail.productos.map((producto) => ({
        codigoProducto: producto.codigoProducto,
        cantidad: producto.cantidad,
        descripcion: producto.descripcion,
        nombre: producto.nombre,
        unidad: {
          codigo: producto.unidad?.codigo,
          nombre: producto.unidad?.nombre
        }
      }))
    : [];

  return {
    codigo: opportunity.codigo,
    nombre: opportunity.nombre,
    organismo: opportunity.organismo,
    montoDisponible: opportunity.montoDisponible,
    fechaCierre: opportunity.fechaCierre,
    detalle: {
      descripcion: detail.descripcion,
      moneda: detail.moneda,
      montoMoneda: detail.montoMoneda,
      montoTotalEstimado: detail.montoTotalEstimado,
      plazoEntrega: detail.plazoEntrega,
      direccion: detail.direccion,
      productos,
      institucion: {
        empresa: detail.institucion?.empresa,
        organizacion: detail.institucion?.organizacion,
        rut: detail.institucion?.rut
      }
    }
  };
}

async function enrichSingle(opportunity, index, total, bearerToken, timeoutMs, maxRetries) {
  const codigo = opportunity.codigo;
  try {
    const response = await requestDetailWithRetry(codigo, bearerToken, timeoutMs, maxRetries);
    const detail = response?.payload?.detalleSolicitud;
    if (!detail) {
      throw new Error(`Missing payload.detalleSolicitud for ${codigo}`);
    }

    console.log(`   [${index}/${total}] ${codigo} with ✅ enriched`);
    return mapDetail(opportunity, detail);
  } catch (error) {
    console.warn(`⚠️  Skipping ${codigo} after retries: ${error.message}`);
    console.log(`   [${index}/${total}] ${codigo} with ⚠️ skipped`);
    return null;
  }
}

async function enrichOpportunities(opportunities, options = {}) {
  if (!Array.isArray(opportunities) || opportunities.length === 0) {
    return [];
  }

  const concurrency = Number.isInteger(options.concurrency) && options.concurrency > 0 ? options.concurrency : 5;
  const timeoutMs = Number.isInteger(options.timeoutMs) && options.timeoutMs > 0 ? options.timeoutMs : 15000;
  const maxRetries = Number.isInteger(options.maxRetries) && options.maxRetries >= 0 ? options.maxRetries : 3;

  const nowMs = Date.now();
  const filtered = opportunities.filter((opp) => shouldEnrich(opp, nowMs));

  console.log(`🔍 Enriching ${filtered.length} opportunities (of ${opportunities.length} total)...`);
  if (filtered.length === 0) {
    return [];
  }

  const bearerToken = await getValidToken();
  const enriched = [];

  for (let start = 0; start < filtered.length; start += concurrency) {
    const batch = filtered.slice(start, start + concurrency);
    const batchPromises = batch.map((opportunity, idx) =>
      enrichSingle(opportunity, start + idx + 1, filtered.length, bearerToken, timeoutMs, maxRetries)
    );

    const settled = await Promise.allSettled(batchPromises);
    for (const entry of settled) {
      if (entry.status === 'fulfilled' && entry.value) {
        enriched.push(entry.value);
      }
    }
  }

  return enriched;
}

module.exports = {
  enrichOpportunities
};
