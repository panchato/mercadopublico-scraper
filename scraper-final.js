/**
 * Mercado Público - Compra Ágil Scraper (Final Version)
 * 
 * Supports all filters including region and "mis rubros"
 */

const https = require('https');
const fs = require('fs');
require('dotenv').config();

class CompraAgilScraper {
  constructor() {
    this.baseUrl = 'https://servicios-compra-agil.mercadopublico.cl';
    this.endpoint = '/v1/compra-agil-busqueda/buscar';
    
    const sessionData = JSON.parse(fs.readFileSync('./session.json', 'utf-8'));
    this.cookies = this.extractCookies(sessionData);
  }
  
  extractCookies(sessionData) {
    const accessTokenCookie = sessionData.cookies.find(c => 
      c.name === 'access_token' || c.name === 'access_token_ccr'
    );
    
    if (accessTokenCookie) {
      this.bearerToken = accessTokenCookie.value;
      console.log('✅ Authentication ready\n');
    }
    
    return sessionData.cookies.map(c => `${c.name}=${c.value}`).join('; ');
  }
  
  async fetchOpportunities(filters = {}) {
    const defaultFilters = {
      desde: this.formatDate(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)),
      hasta: this.formatDate(new Date()),
      orderBy: 2,
      page: filters.page || 1,
      estado: 2,
      size: filters.size || 20
    };
    
    // Add optional filters
    if (filters.region) defaultFilters.region = filters.region;
    if (filters.misRubros) defaultFilters.misRubros = 1;
    
    const queryParams = { ...defaultFilters, ...filters };
    delete queryParams.maxPages; // Not an API parameter
    
    const queryString = Object.entries(queryParams)
      .map(([key, val]) => `${key}=${encodeURIComponent(val)}`)
      .join('&');
    
    const url = `${this.baseUrl}${this.endpoint}?${queryString}`;
    
    return new Promise((resolve, reject) => {
      const options = {
        method: 'GET',
        headers: {
          'Accept': 'application/json, text/plain, */*',
          'Authorization': `Bearer ${this.bearerToken}`,
          'Origin': 'https://compra-agil.mercadopublico.cl',
          'Referer': 'https://compra-agil.mercadopublico.cl/',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      };
      
      https.get(url, options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (res.statusCode === 200) {
            try {
              resolve(JSON.parse(data));
            } catch (e) {
              reject(new Error(`Failed to parse JSON: ${e.message}`));
            }
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${data.substring(0, 200)}`));
          }
        });
      }).on('error', reject);
    });
  }
  
  formatDate(date) {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  }
  
  async scrape(options = {}) {
    const {
      region = null,        // 13 for Región Metropolitana
      misRubros = false,    // true to filter by your categories
      maxPages = 10,
      daysBack = 7
    } = options;
    
    console.log('🎯 Compra Ágil Scraper\n');
    console.log('Filters:');
    if (region) console.log(`  - Region: ${region}`);
    if (misRubros) console.log(`  - Mis Rubros: ✅`);
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
      for (let page = 1; page <= maxPages; page++) {
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
        
        // Show first opportunity on page 1
        if (page === 1 && opportunities.length > 0) {
          const first = opportunities[0];
          console.log(`\n📊 Sample:`);
          console.log(`   ${first.codigo}: ${first.nombre.substring(0, 80)}...`);
          console.log(`   Organization: ${first.organismo}`);
          console.log(`   Budget: ${first.moneda} ${first.montoDisponible?.toLocaleString() || 'N/A'}`);
          console.log(`   Closes: ${first.fechaCierre?.substring(0, 10)}\n`);
        }
        
        // Check pagination
        if (page >= response.payload.pageCount) {
          console.log(`   ✅ Last page (${response.payload.pageCount} total)\n`);
          break;
        }
        
        await new Promise(r => setTimeout(r, 1000)); // Be nice to the server
      }
      
      console.log(`✅ Total: ${allOpportunities.length} opportunities\n`);
      
      // Save results
      const now = new Date();
      const timestamp = now.toISOString().replace(/:/g, '-').replace('T', '_').split('.')[0];
      const regionSuffix = region ? `-region${region}` : '';
      const rubrosSuffix = misRubros ? '-misrubros' : '';
      
      const filename = `compra-agil${regionSuffix}${rubrosSuffix}-${timestamp}.json`;
      fs.writeFileSync(filename, JSON.stringify(allOpportunities, null, 2));
      console.log(`💾 Full data: ${filename}`);
      
      // Create summary
      const summary = allOpportunities.map(opp => ({
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
      
      // Show top 10
      console.log('📋 Top 10 opportunities:\n');
      summary.slice(0, 10).forEach((opp, i) => {
        console.log(`${i + 1}. [${opp.codigo}] ${opp.nombre.substring(0, 70)}...`);
        console.log(`   ${opp.organismo} | ${opp.monto} | Closes: ${opp.cierre}\n`);
      });
      
      return allOpportunities;
      
    } catch (error) {
      console.error('❌ Error:', error.message);
      throw error;
    }
  }
}

// CLI
if (require.main === module) {
  const args = process.argv.slice(2);
  
  const options = {
    region: args.includes('--region-metropolitana') ? 13 : null,
    misRubros: args.includes('--mis-rubros'),
    maxPages: 10,
    daysBack: 7
  };
  
  // Parse --pages=N
  const pagesArg = args.find(a => a.startsWith('--pages='));
  if (pagesArg) options.maxPages = parseInt(pagesArg.split('=')[1]);
  
  // Parse --days=N
  const daysArg = args.find(a => a.startsWith('--days='));
  if (daysArg) options.daysBack = parseInt(daysArg.split('=')[1]);
  
  const scraper = new CompraAgilScraper();
  
  scraper.scrape(options)
    .then(() => {
      console.log('✅ Done!\n');
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Failed:', error);
      process.exit(1);
    });
}

module.exports = CompraAgilScraper;
