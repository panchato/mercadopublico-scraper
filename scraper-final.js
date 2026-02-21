/**
 * Mercado Público - Compra Ágil Scraper (Final Version)
 *
 * Supports all filters including region and "mis rubros"
 */

const https = require('https');
const fs = require('fs');
require('dotenv').config();

const { getValidToken, TokenExpiredError } = require('./token-manager');
const { enrichOpportunities } = require('./enricher');

class CompraAgilScraper {
  constructor() {
    this.baseUrl = 'https://servicios-compra-agil.mercadopublico.cl';
    this.endpoint = '/v1/compra-agil-busqueda/buscar';
    this.bearerToken = null;
    this.requestTimeoutMs = 15000;
    this.maxAttempts = 3;
  }

  async ensureToken() {
    this.bearerToken = await getValidToken();
    return this.bearerToken;
  }

  async fetchOpportunities(filters = {}) {
    await this.ensureToken();

    const defaultFilters = {
      desde: this.formatDate(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)),
      hasta: this.formatDate(new Date()),
      orderBy: 2,
      page: filters.page || 1,
      estado: 2,
      size: filters.size || 20
    };

    if (filters.region) defaultFilters.region = filters.region;
    if (filters.misRubros) defaultFilters.misRubros = 1;

    const queryParams = { ...defaultFilters, ...filters };
    delete queryParams.maxPages;

    const queryString = Object.entries(queryParams)
      .map(([key, val]) => `${key}=${encodeURIComponent(val)}`)
      .join('&');

    const url = `${this.baseUrl}${this.endpoint}?${queryString}`;

    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      try {
        return await this.requestOpportunities(url);
      } catch (error) {
        if (error instanceof TokenExpiredError) {
          throw error;
        }

        if (error.statusCode === 400) {
          throw error;
        }

        const isRetryable =
          error.retryable === true ||
          (error.statusCode >= 500 && error.statusCode < 600);

        if (!isRetryable || attempt === this.maxAttempts) {
          throw error;
        }

        const delaySeconds = 2 ** (attempt - 1);
        console.log(`   Attempt ${attempt} failed: ${error.message}. Retrying in ${delaySeconds}s...`);
        await new Promise((resolve) => setTimeout(resolve, delaySeconds * 1000));
      }
    }

    throw new Error('Failed to fetch opportunities after retries.');
  }

  requestOpportunities(url) {
    return new Promise((resolve, reject) => {
      const options = {
        method: 'GET',
        headers: {
          Accept: 'application/json, text/plain, */*',
          Authorization: `Bearer ${this.bearerToken}`,
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
              const parseError = new Error(`Failed to parse JSON: ${error.message}`);
              parseError.retryable = false;
              reject(parseError);
            }
            return;
          }

          if (res.statusCode === 401) {
            reject(new TokenExpiredError('HTTP 401 from Compra Ágil API. Session refresh failed or expired.'));
            return;
          }

          const httpError = new Error(`HTTP ${res.statusCode}: ${data.substring(0, 200)}`);
          httpError.statusCode = res.statusCode;
          httpError.retryable = res.statusCode >= 500 && res.statusCode < 600;
          reject(httpError);
        });
      });

      req.setTimeout(this.requestTimeoutMs, () => {
        const timeoutError = new Error('Request timed out after 15s');
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

  formatDate(date) {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  }

  async scrape(options = {}) {
    const { region = null, misRubros = false, maxPages = 10, daysBack = 7, enrich = false } = options;

    console.log('🎯 Compra Ágil Scraper\n');

    await this.ensureToken();
    console.log('✅ Authentication ready\n');

    console.log('Filters:');
    if (region) console.log(`  - Region: ${region}`);
    if (misRubros) console.log('  - Mis Rubros: ✅');
    console.log(`  - Days back: ${daysBack}`);
    console.log(`  - Max pages: ${maxPages}\n`);

    const filters = {
      desde: this.formatDate(new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000)),
      hasta: this.formatDate(new Date())
    };

    if (region) filters.region = region;
    if (misRubros) filters.misRubros = 1;

    const allOpportunities = [];

    try {
      for (let page = 1; page <= maxPages; page += 1) {
        console.log(`📄 Page ${page}...`);

        const response = await this.fetchOpportunities({ ...filters, page });

        if (!response.payload || !response.payload.resultados) {
          console.log('   ⚠️  No data in response');
          break;
        }

        const opportunities = response.payload.resultados;
        console.log(`   ✅ ${opportunities.length} opportunities`);

        if (opportunities.length === 0) break;

        allOpportunities.push(...opportunities);

        if (page === 1 && opportunities.length > 0) {
          const first = opportunities[0];
          console.log('\n📊 Sample:');
          console.log(`   ${first.codigo}: ${first.nombre.substring(0, 80)}...`);
          console.log(`   Organization: ${first.organismo}`);
          console.log(`   Budget: ${first.moneda} ${first.montoDisponible?.toLocaleString() || 'N/A'}`);
          console.log(`   Closes: ${first.fechaCierre?.substring(0, 10)}\n`);
        }

        if (page >= response.payload.pageCount) {
          console.log(`   ✅ Last page (${response.payload.pageCount} total)\n`);
          break;
        }

        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      console.log(`✅ Total: ${allOpportunities.length} opportunities\n`);

      const now = new Date();
      const timestamp = now.toISOString().replace(/:/g, '-').replace('T', '_').split('.')[0];
      const regionSuffix = region ? `-region${region}` : '';
      const rubrosSuffix = misRubros ? '-misrubros' : '';

      const filename = `compra-agil${regionSuffix}${rubrosSuffix}-${timestamp}.json`;
      fs.writeFileSync(filename, JSON.stringify(allOpportunities, null, 2));
      console.log(`💾 Full data: ${filename}`);

      const summary = allOpportunities.map((opp) => ({
        codigo: opp.codigo,
        nombre: opp.nombre,
        organismo: opp.organismo,
        monto: `${opp.moneda} ${opp.montoDisponible?.toLocaleString() || 'N/A'}`,
        cierre: opp.fechaCierre?.substring(0, 10),
        estado: opp.estado
      }));

      const summaryFile = `compra-agil-summary${regionSuffix}${rubrosSuffix}-${timestamp}.json`;
      fs.writeFileSync(summaryFile, JSON.stringify(summary, null, 2));
      console.log(`📋 Summary: ${summaryFile}\n`);

      if (enrich) {
        const enriched = await enrichOpportunities(allOpportunities);
        if (enriched.length === 0) {
          console.log('ℹ️  No opportunities matched enrichment criteria (closing within 72h, no existing offers)');
        } else {
          const enrichedFile = `compra-agil-enriched${regionSuffix}${rubrosSuffix}-${timestamp}.json`;
          fs.writeFileSync(enrichedFile, JSON.stringify(enriched, null, 2));
          console.log(`🔬 Enriched: ${enrichedFile} (${enriched.length} opportunities)`);
        }
      }

      console.log('📋 Top 10 opportunities:\n');
      summary.slice(0, 10).forEach((opp, index) => {
        console.log(`${index + 1}. [${opp.codigo}] ${opp.nombre.substring(0, 70)}...`);
        console.log(`   ${opp.organismo} | ${opp.monto} | Closes: ${opp.cierre}\n`);
      });

      return allOpportunities;
    } catch (error) {
      console.error('❌ Error:', error.message);
      throw error;
    }
  }
}

if (require.main === module) {
  const args = process.argv.slice(2);

  const options = {
    region: args.includes('--region-metropolitana') ? 13 : null,
    misRubros: args.includes('--mis-rubros'),
    enrich: args.includes('--enrich'),
    maxPages: 10,
    daysBack: 7
  };

  const pagesArg = args.find((arg) => arg.startsWith('--pages='));
  if (pagesArg) {
    const pagesRaw = pagesArg.split('=')[1];
    const pagesValue = Number(pagesRaw);
    const isValidPages = /^\d+$/.test(pagesRaw) && Number.isInteger(pagesValue) && pagesValue >= 1 && pagesValue <= 50;
    if (!isValidPages) {
      console.error('--pages must be an integer between 1 and 50');
      process.exit(1);
    }
    options.maxPages = pagesValue;
  }

  const daysArg = args.find((arg) => arg.startsWith('--days='));
  if (daysArg) {
    const daysRaw = daysArg.split('=')[1];
    const daysValue = Number(daysRaw);
    const isValidDays = /^\d+$/.test(daysRaw) && Number.isInteger(daysValue) && daysValue >= 1 && daysValue <= 90;
    if (!isValidDays) {
      console.error('--days must be an integer between 1 and 90');
      process.exit(1);
    }
    options.daysBack = daysValue;
  }

  const scraper = new CompraAgilScraper();

  scraper
    .scrape(options)
    .then(() => {
      console.log('✅ Done!\n');
      process.exit(0);
    })
    .catch((error) => {
      if (error && error.requiresManualReauth === true) {
        console.error('❌ Authentication expired and requires manual re-auth.');
        console.error("➡️ Run 'node login-local.js' locally, complete 2FA, then copy session.json to the server.");
        process.exit(2);
        return;
      }

      console.error('❌ Failed:', error);
      process.exit(1);
    });
}

module.exports = CompraAgilScraper;
