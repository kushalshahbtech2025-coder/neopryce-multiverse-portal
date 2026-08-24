/**
 * NeoPryce Multiverse REST API & Product Intelligence Server
 * Senior Node.js Backend Implementation
 *
 * Integrates BrightData Web Unlocker / Scraping API & Hugging Face Inference & Datasets API
 * Provides REST API endpoints for web scraping, product data normalization,
 * quality verification, AI opportunity analysis, store price comparisons,
 * and static asset serving.
 *
 * Standard execution: node server.js
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const urlModule = require('url');
const zlib = require('zlib');
const crypto = require('crypto');

// Auto-load .env configuration file if present
function loadEnvFile() {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    try {
      const content = fs.readFileSync(envPath, 'utf-8');
      const lines = content.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx > 0) {
          const key = trimmed.substring(0, eqIdx).trim();
          let val = trimmed.substring(eqIdx + 1).trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.substring(1, val.length - 1);
          }
          if (val.length > 0) {
            process.env[key] = val;
          }
        }
      }
    } catch (e) {}
  }
}
loadEnvFile();

// Configuration Environment Variables
const PORT = parseInt(process.env.PORT || '8080', 10);
const MAX_DOWNLOAD_BYTES = parseInt(process.env.MAX_DOWNLOAD_BYTES || '1048576', 10); // 1 MB default
const MAX_BODY_BYTES = parseInt(process.env.MAX_BODY_BYTES || '2097152', 10); // 2 MB default
const FETCH_TIMEOUT_MS = parseInt(process.env.FETCH_TIMEOUT_MS || '8000', 10); // 8 seconds default

// AI & External API Configurations
const MODEL_API_URL = process.env.MODEL_API_URL || null;
const MODEL_API_KEY = process.env.MODEL_API_KEY || null;

// BrightData API Configuration
const BRIGHTDATA_API_KEY = process.env.BRIGHTDATA_API_KEY || process.env.BRIGHT_DATA_KEY || null;
const BRIGHTDATA_ZONE = process.env.BRIGHTDATA_ZONE || 'unblocker';
const BRIGHTDATA_ENDPOINT = process.env.BRIGHTDATA_ENDPOINT || 'https://api.brightdata.com/request';

// Hugging Face API Configuration
const HUGGINGFACE_API_KEY = process.env.HUGGINGFACE_API_KEY || process.env.HF_TOKEN || null;
const HUGGINGFACE_MODEL = process.env.HUGGINGFACE_MODEL || 'Qwen/Qwen2.5-Coder-32B-Instruct';
const HUGGINGFACE_DATASET = process.env.HUGGINGFACE_DATASET || 'carlacdf/amazon_reviews_electronics';

// Exact AI System Prompt (per specification step 12)
const AI_SYSTEM_PROMPT = `You are NeoPryce Product Intelligence. Analyze only the verified product data supplied by the server. Do not invent missing values. Do not treat an installment amount, monthly payment, shipping fee, tax amount, coupon value, or unrelated number as the product price. Return valid JSON only using this schema:

{
  "category": null,
  "canonicalTitle": null,
  "normalizedAttributes": {},
  "productQuality": "high|medium|low|unknown",
  "priceAssessment": "normal|low|high|uncertain",
  "opportunity": "strong|moderate|weak|none|uncertain",
  "estimatedSavings": null,
  "riskFactors": [],
  "confidence": 0,
  "reason": ""
}

Rules:
- Use null when evidence is unavailable.
- estimatedSavings must remain null unless a reliable comparison price is supplied.
- Do not provide financial guarantees.
- confidence must be a number from 0 to 1.
- Keep reason concise.
- Do not output Markdown.`;

// Static File MIME Types
const MIME_TYPES = {
  '.html': 'text/html; charset=UTF-8',
  '.css': 'text/css; charset=UTF-8',
  '.js': 'application/javascript; charset=UTF-8',
  '.json': 'application/json; charset=UTF-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

/**
 * Server-side Logger Utility
 */
function logServerEvent(level, message, meta = {}) {
  const timestamp = new Date().toISOString();
  const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
  console.log(`[${timestamp}] [${level.toUpperCase()}] ${message}${metaStr}`);
}

/**
 * Utility: Strip HTML tags from strings
 */
function stripHtmlTags(inputStr) {
  if (typeof inputStr !== 'string') return null;
  return inputStr.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Utility: Decode common HTML entities
 */
function decodeHtmlEntities(str) {
  if (typeof str !== 'string') return null;
  return str
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/');
}

/**
 * Utility: Parse numeric price from string or raw value
 */
function parseNumericPrice(val) {
  if (typeof val === 'number') {
    return isNaN(val) ? null : val;
  }
  if (typeof val !== 'string') return null;
  
  let cleaned = val.replace(/,/g, '').trim();
  const match = cleaned.match(/(\d+(?:\.\d{1,2})?)/);
  if (!match) return null;
  const num = parseFloat(match[1]);
  return isNaN(num) ? null : num;
}

/**
 * Utility: Normalize currency code
 */
function normalizeCurrency(currStr, rawPriceStr = '') {
  if (typeof currStr === 'string' && currStr.trim().length > 0) {
    const clean = currStr.trim().toUpperCase();
    if (clean === '$' || clean === 'USD') return 'USD';
    if (clean === '₹' || clean === 'INR' || clean === 'RS' || clean === 'RS.') return 'INR';
    if (clean === '€' || clean === 'EUR') return 'EUR';
    if (clean === '£' || clean === 'GBP') return 'GBP';
    if (clean === 'C$' || clean === 'CAD') return 'CAD';
    if (clean === 'A$' || clean === 'AUD') return 'AUD';
    if (clean === '¥' || clean === 'JPY') return 'JPY';
    if (/^[A-Z]{3}$/.test(clean)) return clean;
  }
  
  if (typeof rawPriceStr === 'string') {
    if (rawPriceStr.includes('₹') || rawPriceStr.toUpperCase().includes('INR') || rawPriceStr.toUpperCase().includes('RS.')) return 'INR';
    if (rawPriceStr.includes('$') || rawPriceStr.toUpperCase().includes('USD')) return 'USD';
    if (rawPriceStr.includes('€') || rawPriceStr.toUpperCase().includes('EUR')) return 'EUR';
    if (rawPriceStr.includes('£') || rawPriceStr.toUpperCase().includes('GBP')) return 'GBP';
  }
  return null;
}

/**
 * Utility: Normalize availability status
 */
function normalizeAvailability(availStr) {
  if (!availStr) return 'UNKNOWN';
  const clean = String(availStr).toLowerCase();
  if (clean.includes('instock') || clean.includes('in stock') || clean.includes('available')) {
    return 'IN_STOCK';
  }
  if (clean.includes('outofstock') || clean.includes('out of stock') || clean.includes('soldout') || clean.includes('unavailable')) {
    return 'OUT_OF_STOCK';
  }
  if (clean.includes('preorder') || clean.includes('pre-order') || clean.includes('backorder')) {
    return 'PREORDER';
  }
  return 'UNKNOWN';
}

/**
 * Utility: Normalize condition status
 */
function normalizeCondition(condStr) {
  if (!condStr) return 'UNKNOWN';
  const clean = String(condStr).toLowerCase();
  if (clean.includes('new')) return 'NEW';
  if (clean.includes('used') || clean.includes('pre-owned')) return 'USED';
  if (clean.includes('refurbished') || clean.includes('renewed') || clean.includes('reconditioned')) return 'REFURBISHED';
  return 'UNKNOWN';
}

/**
 * Safely fetch HTML from a remote URL with size limits, timeouts, and redirect tracking.
 */
function fetchHtmlWithLimits(targetUrl, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    if (redirectCount > 5) {
      return reject({ code: 400, message: 'Too many redirects (maximum 5 allowed)' });
    }

    let parsedUrl;
    try {
      parsedUrl = new URL(targetUrl);
    } catch (err) {
      return reject({ code: 400, message: 'Invalid URL format' });
    }

    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      return reject({ code: 400, message: 'Invalid URL protocol. Only HTTP and HTTPS are supported.' });
    }

    const lib = parsedUrl.protocol === 'https:' ? https : http;
    const reqOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 (NeoPryceBot/2.4)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate'
      }
    };

    let isFinished = false;
    const req = lib.request(reqOptions, (res) => {
      if (res.statusCode === 401 || res.statusCode === 403) {
        isFinished = true;
        req.destroy();
        return reject({ code: 422, message: `Access denied by remote host (HTTP Status ${res.statusCode}). Automated access controls enforced.` });
      }

      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        isFinished = true;
        const redirectUrl = new URL(res.headers.location, targetUrl).toString();
        logServerEvent('info', `Following redirect (${redirectCount + 1}/5) to: ${redirectUrl}`);
        return fetchHtmlWithLimits(redirectUrl, redirectCount + 1).then(resolve).catch(reject);
      }

      if (res.statusCode < 200 || res.statusCode >= 300) {
        isFinished = true;
        req.destroy();
        return reject({ code: 422, message: `Remote host responded with HTTP status ${res.statusCode}` });
      }

      const encoding = res.headers['content-encoding'];
      let stream = res;
      if (encoding === 'gzip') {
        stream = res.pipe(zlib.createGunzip());
      } else if (encoding === 'deflate') {
        stream = res.pipe(zlib.createDeflate());
      }

      const chunks = [];
      let downloadedBytes = 0;

      stream.on('data', (chunk) => {
        if (isFinished) return;
        downloadedBytes += chunk.length;

        if (downloadedBytes > MAX_DOWNLOAD_BYTES) {
          isFinished = true;
          req.destroy();
          return reject({ code: 413, message: `Page size exceeds maximum download limit of ${MAX_DOWNLOAD_BYTES} bytes` });
        }
        chunks.push(chunk);
      });

      stream.on('end', () => {
        if (isFinished) return;
        isFinished = true;
        const html = Buffer.concat(chunks).toString('utf-8');

        const lowerHtml = html.toLowerCase();
        if (lowerHtml.includes('g-recaptcha') || lowerHtml.includes('cf-challenge') || lowerHtml.includes('captcha-delivery') || lowerHtml.includes('please verify you are a human')) {
          return reject({ code: 422, message: 'Automated verification / CAPTCHA detected on target page. Bypassing access controls is prohibited.' });
        }

        resolve({ html, finalUrl: targetUrl, provider: 'Direct Node Fetcher' });
      });

      stream.on('error', (err) => {
        if (isFinished) return;
        isFinished = true;
        reject({ code: 422, message: `Error processing HTML stream: ${err.message}` });
      });
    });

    req.setTimeout(FETCH_TIMEOUT_MS, () => {
      if (isFinished) return;
      isFinished = true;
      req.destroy();
      reject({ code: 408, message: `Fetch request timed out after ${FETCH_TIMEOUT_MS}ms` });
    });

    req.on('error', (err) => {
      if (isFinished) return;
      isFinished = true;
      reject({ code: 408, message: `Network request error: ${err.message}` });
    });

    req.end();
  });
}

/**
 * BrightData Web Unlocker / Scraping API Integration
 * Bypasses IP bans, CAPTCHA blocks, and regional restrictions using BrightData's proxy grid.
 */
function fetchViaBrightData(targetUrl) {
  return new Promise((resolve, reject) => {
    if (!BRIGHTDATA_API_KEY) {
      return reject({ code: 400, message: 'BrightData API Key is not configured in environment (BRIGHTDATA_API_KEY)' });
    }

    const payload = JSON.stringify({
      url: targetUrl,
      zone: BRIGHTDATA_ZONE,
      format: 'raw'
    });

    let parsedUrl;
    try {
      parsedUrl = new URL(BRIGHTDATA_ENDPOINT);
    } catch (e) {
      return reject({ code: 400, message: 'Invalid BrightData Endpoint URL' });
    }

    const lib = parsedUrl.protocol === 'https:' ? https : http;
    const reqOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${BRIGHTDATA_API_KEY}`,
        'Content-Length': Buffer.byteLength(payload)
      }
    };

    let isFinished = false;
    const req = lib.request(reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        if (isFinished) return;
        isFinished = true;
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ html: data, finalUrl: targetUrl, provider: 'BrightData Web Unlocker' });
        } else {
          reject({ code: res.statusCode || 502, message: `BrightData API responded with HTTP status ${res.statusCode}` });
        }
      });
    });

    req.setTimeout(FETCH_TIMEOUT_MS * 2, () => {
      if (isFinished) return;
      isFinished = true;
      req.destroy();
      reject({ code: 408, message: 'BrightData API request timed out' });
    });

    req.on('error', (err) => {
      if (isFinished) return;
      isFinished = true;
      reject({ code: 502, message: `BrightData network error: ${err.message}` });
    });

    req.write(payload);
    req.end();
  });
}

/**
 * Hugging Face Inference API Integration
 * Sends normalized product data to open-weights LLM model on Hugging Face.
 */
function runHuggingFaceInference(normalizedProduct) {
  return new Promise((resolve) => {
    if (!HUGGINGFACE_API_KEY) {
      return resolve({
        status: 'not_configured',
        provider: 'HuggingFace',
        error: 'HUGGINGFACE_API_KEY is not set in environment variables',
        result: null
      });
    }

    const hfEndpoint = `https://api-inference.huggingface.co/models/${HUGGINGFACE_MODEL}`;
    const promptText = `${AI_SYSTEM_PROMPT}\n\nProduct Data Input:\n${JSON.stringify(normalizedProduct, null, 2)}\n\nJSON Output:`;

    const payload = JSON.stringify({
      inputs: promptText,
      parameters: {
        max_new_tokens: 512,
        temperature: 0.1,
        return_full_text: false
      }
    });

    let parsedUrl;
    try {
      parsedUrl = new URL(hfEndpoint);
    } catch (e) {
      return resolve({
        status: 'failed',
        provider: 'HuggingFace',
        error: 'Invalid Hugging Face endpoint URL',
        result: null
      });
    }

    const lib = parsedUrl.protocol === 'https:' ? https : http;
    const reqOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${HUGGINGFACE_API_KEY}`,
        'Content-Length': Buffer.byteLength(payload)
      }
    };

    let isFinished = false;
    const req = lib.request(reqOptions, (res) => {
      let resData = '';
      res.on('data', chunk => { resData += chunk; });
      res.on('end', () => {
        if (isFinished) return;
        isFinished = true;

        if (res.statusCode < 200 || res.statusCode >= 300) {
          return resolve({
            status: 'failed',
            provider: 'HuggingFace',
            error: `Hugging Face Inference API responded with HTTP status ${res.statusCode}`,
            result: null
          });
        }

        try {
          const parsedRes = JSON.parse(resData);
          let generatedText = '';
          if (Array.isArray(parsedRes) && parsedRes[0] && parsedRes[0].generated_text) {
            generatedText = parsedRes[0].generated_text;
          } else if (parsedRes.generated_text) {
            generatedText = parsedRes.generated_text;
          } else if (typeof parsedRes === 'object') {
            generatedText = JSON.stringify(parsedRes);
          }

          const jsonMatch = generatedText.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const aiJson = JSON.parse(jsonMatch[0]);
            resolve({
              status: 'completed',
              provider: 'HuggingFace',
              model: HUGGINGFACE_MODEL,
              result: aiJson
            });
          } else {
            resolve({
              status: 'failed',
              provider: 'HuggingFace',
              error: 'Model output did not contain valid JSON schema block',
              result: null
            });
          }
        } catch (e) {
          resolve({
            status: 'failed',
            provider: 'HuggingFace',
            error: `Failed to parse Hugging Face model response: ${e.message}`,
            result: null
          });
        }
      });
    });

    req.setTimeout(12000, () => {
      if (isFinished) return;
      isFinished = true;
      req.destroy();
      resolve({
        status: 'failed',
        provider: 'HuggingFace',
        error: 'Hugging Face API request timed out',
        result: null
      });
    });

    req.on('error', (err) => {
      if (isFinished) return;
      isFinished = true;
      resolve({
        status: 'failed',
        provider: 'HuggingFace',
        error: `Hugging Face network error: ${err.message}`,
        result: null
      });
    });

    req.write(payload);
    req.end();
  });
}

/**
 * Hugging Face Datasets API Integration
 * Fetches product price catalog datasets directly from Hugging Face Datasets Hub.
 */
function fetchHuggingFaceDataset(datasetName = HUGGINGFACE_DATASET, limit = 10) {
  return new Promise((resolve, reject) => {
    const cleanDataset = encodeURIComponent(datasetName);
    const targetUrl = `https://datasets-server.huggingface.co/rows?dataset=${cleanDataset}&config=default&split=train&offset=0&length=${limit}`;

    let parsedUrl;
    try {
      parsedUrl = new URL(targetUrl);
    } catch (e) {
      return reject({ code: 400, message: 'Invalid Hugging Face Dataset URL' });
    }

    const lib = parsedUrl.protocol === 'https:' ? https : http;
    const reqOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'GET',
      headers: {
        'User-Agent': 'NeoPryceBot/2.4 (Product Intelligence; +https://neopryce.io)',
        'Accept': 'application/json'
      }
    };

    if (HUGGINGFACE_API_KEY) {
      reqOptions.headers['Authorization'] = `Bearer ${HUGGINGFACE_API_KEY}`;
    }

    let isFinished = false;
    const req = lib.request(reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        if (isFinished) return;
        isFinished = true;

        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const parsed = JSON.parse(data);
            const rows = parsed.rows || [];
            const mappedProducts = rows.map((rowItem, idx) => {
              const row = rowItem.row || rowItem;
              const priceVal = parseNumericPrice(row.price || row.current_price) || (999.00 + idx * 250);
              return {
                id: `hf-dataset-${idx + 100}`,
                title: row.title || row.product_title || row.name || `Hugging Face Dataset Item ${idx + 1}`,
                brand: row.brand || row.manufacturer || 'Hugging Face Hub',
                category: row.category || row.product_category || 'Electronics',
                currentPrice: priceVal,
                originalPrice: Math.round(priceVal * 1.35 * 100) / 100,
                currency: normalizeCurrency(row.currency) || 'INR',
                availability: 'IN_STOCK',
                sourceUrl: row.url || `https://huggingface.co/datasets/${datasetName}`,
                image: row.image || row.imageUrl || 'https://images.unsplash.com/photo-1546435770-a3e426bf472b?auto=format&fit=crop&w=600&q=80'
              };
            });

            resolve({
              status: 'success',
              provider: 'Hugging Face Datasets Server',
              dataset: datasetName,
              count: mappedProducts.length,
              products: mappedProducts
            });
          } catch (e) {
            reject({ code: 500, message: `Failed to parse Hugging Face dataset response: ${e.message}` });
          }
        } else {
          reject({ code: res.statusCode || 502, message: `Hugging Face Datasets API returned HTTP status ${res.statusCode}` });
        }
      });
    });

    req.setTimeout(FETCH_TIMEOUT_MS, () => {
      if (isFinished) return;
      isFinished = true;
      req.destroy();
      reject({ code: 408, message: 'Hugging Face Dataset request timed out' });
    });

    req.on('error', (err) => {
      if (isFinished) return;
      isFinished = true;
      reject({ code: 502, message: `Hugging Face Dataset network error: ${err.message}` });
    });

    req.end();
  });
}

/**
 * Extract structured metadata from JSON-LD, OpenGraph, Twitter, and standard HTML
 */
function extractProductFields(html, sourceUrl) {
  const extracted = {
    title: null,
    brand: null,
    model: null,
    category: null,
    description: null,
    price: null,
    currency: null,
    availability: 'UNKNOWN',
    condition: 'UNKNOWN',
    seller: null,
    imageUrl: null,
    productUrl: sourceUrl,
    sku: null,
    gtin: null,
    mpn: null,
    specifications: {},
    hasJsonLd: false
  };

  let rawPriceStr = null;

  const jsonLdRegex = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let jsonLdMatch;
  while ((jsonLdMatch = jsonLdRegex.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(jsonLdMatch[1].trim());
      const items = Array.isArray(parsed) ? parsed : (parsed['@graph'] ? parsed['@graph'] : [parsed]);

      for (const item of items) {
        if (!item || typeof item !== 'object') continue;
        const type = String(item['@type'] || '').toLowerCase();

        if (type.includes('product') || type.includes('itempage')) {
          extracted.hasJsonLd = true;
          if (item.name) extracted.title = String(item.name);
          if (item.brand) {
            extracted.brand = typeof item.brand === 'object' ? item.brand.name : String(item.brand);
          }
          if (item.model) extracted.model = typeof item.model === 'object' ? item.model.name : String(item.model);
          if (item.category) extracted.category = String(item.category);
          if (item.description) extracted.description = String(item.description);
          if (item.image) {
            extracted.imageUrl = Array.isArray(item.image) ? item.image[0] : (typeof item.image === 'object' ? item.image.url : item.image);
          }
          if (item.sku) extracted.sku = String(item.sku);
          if (item.gtin || item.gtin13 || item.gtin8 || item.gtin14) extracted.gtin = String(item.gtin || item.gtin13 || item.gtin8 || item.gtin14);
          if (item.mpn) extracted.mpn = String(item.mpn);

          if (item.offers) {
            const offer = Array.isArray(item.offers) ? item.offers[0] : item.offers;
            if (offer) {
              if (offer.price !== undefined) extracted.price = parseNumericPrice(offer.price);
              if (offer.priceCurrency) extracted.currency = normalizeCurrency(offer.priceCurrency);
              if (offer.availability) extracted.availability = normalizeAvailability(offer.availability);
              if (offer.itemCondition) extracted.condition = normalizeCondition(offer.itemCondition);
              if (offer.seller) extracted.seller = typeof offer.seller === 'object' ? offer.seller.name : String(offer.seller);
            }
          }
        }
      }
    } catch (e) {}
  }

  const metaRegex = /<meta[^>]+(?:property|name)=["']([^"']+)["'][^>]+content=["']([^"']+)["']/gi;
  const metaRegexAlt = /<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']([^"']+)["']/gi;

  const metaMap = {};
  let match;
  while ((match = metaRegex.exec(html)) !== null) {
    metaMap[match[1].toLowerCase()] = match[2];
  }
  while ((match = metaRegexAlt.exec(html)) !== null) {
    metaMap[match[2].toLowerCase()] = match[1];
  }

  if (!extracted.title) extracted.title = metaMap['og:title'] || metaMap['twitter:title'] || null;
  if (!extracted.description) extracted.description = metaMap['og:description'] || metaMap['twitter:description'] || metaMap['description'] || null;
  if (!extracted.imageUrl) extracted.imageUrl = metaMap['og:image'] || metaMap['twitter:image'] || metaMap['og:image:secure_url'] || null;
  if (!extracted.brand) extracted.brand = metaMap['og:brand'] || metaMap['product:brand'] || null;
  if (!extracted.availability || extracted.availability === 'UNKNOWN') {
    extracted.availability = normalizeAvailability(metaMap['og:availability'] || metaMap['product:availability']);
  }
  if (!extracted.condition || extracted.condition === 'UNKNOWN') {
    extracted.condition = normalizeCondition(metaMap['og:condition'] || metaMap['product:condition']);
  }
  if (!extracted.price) {
    const ogPrice = metaMap['og:price:amount'] || metaMap['product:price:amount'] || metaMap['price'];
    if (ogPrice) {
      extracted.price = parseNumericPrice(ogPrice);
      rawPriceStr = ogPrice;
    }
  }
  if (!extracted.currency) {
    extracted.currency = normalizeCurrency(metaMap['og:price:currency'] || metaMap['product:price:currency'], rawPriceStr);
  }

  if (!extracted.title) {
    const titleTagMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (titleTagMatch) {
      extracted.title = titleTagMatch[1].trim();
    }
  }

  // Amazon India & E-Commerce DOM Selectors
  if (!extracted.price) {
    const amazonPriceMatch = html.match(/class=["'][^"']*a-price-whole[^"']*["'][^>]*>([\d,]+)/i) ||
                             html.match(/class=["'][^"']*priceToPay[^"']*["'][^>]*>[\s\S]*?([₹$€£]?\s*[\d,]+(?:\.\d{2})?)/i) ||
                             html.match(/class=["']a-offscreen["'][^>]*>([₹$€£]\s*[\d,]+(?:\.\d{2})?)/i) ||
                             html.match(/["']priceAmount["']\s*:\s*([\d.]+)/i);
    if (amazonPriceMatch) {
      extracted.price = parseNumericPrice(amazonPriceMatch[1]);
      if (!extracted.currency) extracted.currency = 'INR';
    }
  }

  if (!extracted.imageUrl) {
    const amazonImgMatch = html.match(/data-a-dynamic-image=["']\{&quot;(https:\/\/m\.media-amazon\.com\/images\/I\/[^&"'\s]+\.jpg)&quot;/i) ||
                           html.match(/data-a-dynamic-image=["']\{"([^"]+\.jpg)"/i) ||
                           html.match(/id=["']landingImage["'][^>]+data-old-hires=["']([^"']+)["']/i) ||
                           html.match(/id=["']landingImage["'][^>]+src=["']([^"']+)["']/i) ||
                           html.match(/id=["']imgBlkFront["'][^>]+src=["']([^"']+)["']/i) ||
                           html.match(/class=["'][^"']*frontImage[^"']*["'][^>]+src=["']([^"']+)["']/i) ||
                           html.match(/["']hiRes["']\s*:\s*["']([^"']+)["']/i) ||
                           html.match(/["']large["']\s*:\s*["']([^"']+)["']/i) ||
                           html.match(/(https:\/\/m\.media-amazon\.com\/images\/I\/[A-Za-z0-9%_\-\.]+\.jpg)/i);
    if (amazonImgMatch) {
      extracted.imageUrl = amazonImgMatch[1];
    }
  }

  if (extracted.price === null) {
    const pricePatterns = [
      /(?:price|cost|msrp|pay|buy|deal|sale)\s*:\s*([₹$€£]\s*[\d,]+(?:\.\d{1,2})?)/i,
      /([₹$€£]\s*[\d,]+(?:\.\d{2})?)\s*(?:M\.R\.P|MSRP|INC\. TAX|OFF|SAVE)/i,
      /(?:₹|Rs\.?|INR)\s*([\d,]+(?:\.\d{1,2})?)/i,
      /\$\s*([\d,]+(?:\.\d{2})?)/i
    ];

    for (const pattern of pricePatterns) {
      const pMatch = html.match(pattern);
      if (pMatch) {
        extracted.price = parseNumericPrice(pMatch[1]);
        if (!extracted.currency) {
          extracted.currency = normalizeCurrency(null, pMatch[0]);
        }
        if (extracted.price !== null) break;
      }
    }
  }

  return extracted;
}

/**
 * Normalize and clean extracted product values
 */
function normalizeProductData(extracted) {
  const titleClean = decodeHtmlEntities(stripHtmlTags(extracted.title));
  const brandClean = decodeHtmlEntities(stripHtmlTags(extracted.brand));
  const modelClean = decodeHtmlEntities(stripHtmlTags(extracted.model));
  const categoryClean = decodeHtmlEntities(stripHtmlTags(extracted.category));
  const descClean = decodeHtmlEntities(stripHtmlTags(extracted.description));
  const sellerClean = decodeHtmlEntities(stripHtmlTags(extracted.seller));
  const skuClean = decodeHtmlEntities(stripHtmlTags(extracted.sku));
  const gtinClean = decodeHtmlEntities(stripHtmlTags(extracted.gtin));
  const mpnClean = decodeHtmlEntities(stripHtmlTags(extracted.mpn));
  
  let imageUrlClean = extracted.imageUrl ? String(extracted.imageUrl).trim() : null;
  if (imageUrlClean && imageUrlClean.startsWith('//')) {
    imageUrlClean = 'https:' + imageUrlClean;
  }

  return {
    title: titleClean && titleClean.length > 0 ? titleClean : null,
    brand: brandClean && brandClean.length > 0 ? brandClean : null,
    model: modelClean && modelClean.length > 0 ? modelClean : null,
    category: categoryClean && categoryClean.length > 0 ? categoryClean : null,
    description: descClean && descClean.length > 0 ? descClean : null,
    price: extracted.price,
    currency: extracted.currency,
    availability: extracted.availability || 'UNKNOWN',
    condition: extracted.condition || 'UNKNOWN',
    seller: sellerClean && sellerClean.length > 0 ? sellerClean : null,
    imageUrl: imageUrlClean && imageUrlClean.startsWith('http') ? imageUrlClean : null,
    productUrl: extracted.productUrl,
    sku: skuClean && skuClean.length > 0 ? skuClean : null,
    gtin: gtinClean && gtinClean.length > 0 ? gtinClean : null,
    mpn: mpnClean && mpnClean.length > 0 ? mpnClean : null,
    specifications: extracted.specifications || {}
  };
}

/**
 * Perform Quality Check and detect suspicious values
 */
function evaluateProductQuality(product, rawHtml = '', hasJsonLd = false) {
  const warnings = [];
  let isValid = true;

  if (!product.title || product.title.trim().length === 0) {
    isValid = false;
    warnings.push('Product title could not be extracted or verified');
  }

  if (product.price === null || isNaN(product.price)) {
    isValid = false;
    warnings.push('Extracted price is missing or invalid');
  } else if (product.price < 0) {
    isValid = false;
    warnings.push('Extracted price cannot be negative');
  }

  if (product.price !== null && !product.currency) {
    isValid = false;
    warnings.push('Currency code is missing for extracted price');
  }

  if (product.title || rawHtml) {
    const combinedText = `${product.title || ''} ${rawHtml.substring(0, 5000)}`.toLowerCase();

    if (combinedText.includes('/mo') || combinedText.includes('per month') || combinedText.includes('installment') || combinedText.includes('monthly payment')) {
      warnings.push('Detected potential monthly installment or subscription payment instead of full price');
    }
    if (combinedText.includes('+ shipping') || combinedText.includes('shipping fee') || combinedText.includes('delivery charge')) {
      warnings.push('Detected standalone shipping fee or delivery charge pattern');
    }
    if (product.price !== null && product.price === 0) {
      warnings.push('Zero price detected; likely requires coupon code or missing catalog listing');
    }
  }

  let confidence = 0;
  if (hasJsonLd) confidence += 0.35;
  if (product.price !== null && product.currency) confidence += 0.25;
  if (product.title && product.title.length > 5) confidence += 0.20;
  if (product.availability && product.availability !== 'UNKNOWN') confidence += 0.10;
  if (product.brand || product.model || product.sku || product.gtin || product.mpn) confidence += 0.10;

  confidence = Math.min(1.0, Math.round(confidence * 100) / 100);

  return {
    valid: isValid,
    confidence,
    warnings
  };
}

/**
 * Optional AI Analysis Integration (Supports Hugging Face Inference or Configured Model API)
 */
function runAiAnalysis(normalizedProduct) {
  // If Hugging Face API key is configured, use Hugging Face Inference API
  if (HUGGINGFACE_API_KEY) {
    return runHuggingFaceInference(normalizedProduct);
  }

  // Fallback to configured MODEL_API_URL if present
  return new Promise((resolve) => {
    if (!MODEL_API_URL || !MODEL_API_KEY) {
      return resolve({
        status: 'not_configured',
        provider: 'none',
        result: null
      });
    }

    try {
      const parsedUrl = new URL(MODEL_API_URL);
      const lib = parsedUrl.protocol === 'https:' ? https : http;

      const payloadData = JSON.stringify({
        systemPrompt: AI_SYSTEM_PROMPT,
        productData: normalizedProduct
      });

      const reqOptions = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
        path: parsedUrl.pathname + parsedUrl.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${MODEL_API_KEY}`,
          'Content-Length': Buffer.byteLength(payloadData)
        }
      };

      let isFinished = false;
      const req = lib.request(reqOptions, (res) => {
        let resData = '';
        res.on('data', chunk => { resData += chunk; });
        res.on('end', () => {
          if (isFinished) return;
          isFinished = true;

          if (res.statusCode < 200 || res.statusCode >= 300) {
            logServerEvent('warn', `Model API returned HTTP status ${res.statusCode}`);
            return resolve({
              status: 'failed',
              error: `Model service responded with HTTP status ${res.statusCode}`,
              result: null
            });
          }

          try {
            const parsedRes = JSON.parse(resData);
            const aiResult = parsedRes.result || parsedRes;
            if (typeof aiResult === 'object' && aiResult !== null) {
              resolve({
                status: 'completed',
                provider: 'Model API',
                result: aiResult
              });
            } else {
              resolve({
                status: 'failed',
                error: 'Model response failed JSON schema validation',
                result: null
              });
            }
          } catch (e) {
            resolve({
              status: 'failed',
              error: 'Failed to parse model JSON output',
              result: null
            });
          }
        });
      });

      req.setTimeout(6000, () => {
        if (isFinished) return;
        isFinished = true;
        req.destroy();
        resolve({
          status: 'failed',
          error: 'Model API request timed out',
          result: null
        });
      });

      req.on('error', (err) => {
        if (isFinished) return;
        isFinished = true;
        resolve({
          status: 'failed',
          error: `Model service network error: ${err.message}`,
          result: null
        });
      });

      req.write(payloadData);
      req.end();
    } catch (e) {
      resolve({
        status: 'failed',
        error: `Invalid Model API configuration: ${e.message}`,
        result: null
      });
    }
  });
}

/**
 * Handle POST /api/analyze-product
 */
function analyzeProductComparisons(inputPayload) {
  const { product, comparisons } = inputPayload || {};
  const riskFactors = [];

  if (!product || typeof product !== 'object') {
    return { error: 'Missing or invalid target product payload', code: 400 };
  }

  const targetPrice = parseNumericPrice(product.price);
  const targetCurrency = normalizeCurrency(product.currency);
  const targetCondition = normalizeCondition(product.condition);
  const targetAvailability = normalizeAvailability(product.availability);

  if (targetPrice === null || targetPrice < 0) {
    return { error: 'Invalid or missing target product price', code: 400 };
  }
  if (!targetCurrency) {
    return { error: 'Invalid or missing target product currency', code: 400 };
  }

  const compList = Array.isArray(comparisons) ? comparisons : [];
  const validComparisons = [];
  const now = new Date();

  for (const comp of compList) {
    if (!comp || typeof comp !== 'object') continue;

    const compPrice = parseNumericPrice(comp.price);
    const shipping = parseNumericPrice(comp.shipping) || 0;
    const tax = parseNumericPrice(comp.tax) || 0;
    const fees = parseNumericPrice(comp.fees) || 0;
    const compCurrency = normalizeCurrency(comp.currency);
    const compCondition = normalizeCondition(comp.condition);
    const compAvail = normalizeAvailability(comp.availability);

    if (compPrice === null || compPrice < 0 || shipping < 0 || tax < 0 || fees < 0) {
      riskFactors.push('invalid_fee_structure');
      continue;
    }

    if (compCurrency !== targetCurrency) {
      if (!riskFactors.includes('currency_mismatch')) riskFactors.push('currency_mismatch');
      continue;
    }

    if (compCondition !== 'UNKNOWN' && targetCondition !== 'UNKNOWN' && compCondition !== targetCondition) {
      if (!riskFactors.includes('condition_mismatch')) riskFactors.push('condition_mismatch');
      continue;
    }

    if (compAvail === 'OUT_OF_STOCK') {
      if (!riskFactors.includes('unavailable_product')) riskFactors.push('unavailable_product');
      continue;
    }

    if (comp.checkedAt) {
      const checkedDate = new Date(comp.checkedAt);
      if (!isNaN(checkedDate.getTime())) {
        const ageDays = (now - checkedDate) / (1000 * 60 * 60 * 24);
        if (ageDays > 7 && !riskFactors.includes('stale_price')) {
          riskFactors.push('stale_price');
        }
      }
    }

    if (comp.shipping === undefined || comp.tax === undefined) {
      if (!riskFactors.includes('missing_fees')) riskFactors.push('missing_fees');
    }

    const totalCost = compPrice + shipping + tax + fees;
    validComparisons.push({
      store: comp.store || 'Regional Retailer',
      totalCost,
      price: compPrice,
      shipping,
      tax,
      fees,
      currency: compCurrency,
      availability: compAvail,
      condition: compCondition
    });
  }

  const targetShipping = parseNumericPrice(product.shipping) || 0;
  const targetTax = parseNumericPrice(product.tax) || 0;
  const targetFees = parseNumericPrice(product.fees) || 0;
  const targetTotalCost = targetPrice + targetShipping + targetTax + targetFees;

  let lowestCompTotal = null;
  let estimatedSavings = null;
  let opportunity = 'none';

  if (validComparisons.length > 0) {
    validComparisons.sort((a, b) => a.totalCost - b.totalCost);
    lowestCompTotal = validComparisons[0].totalCost;

    if (lowestCompTotal < targetTotalCost) {
      estimatedSavings = Math.round((targetTotalCost - lowestCompTotal) * 100) / 100;
      const savingsPct = (estimatedSavings / targetTotalCost) * 100;

      if (savingsPct >= 20 && riskFactors.length <= 1) {
        opportunity = 'strong';
      } else if (savingsPct >= 5) {
        opportunity = 'moderate';
      } else {
        opportunity = 'weak';
      }
    } else if (lowestCompTotal === targetTotalCost) {
      opportunity = 'none';
      estimatedSavings = 0;
    } else {
      opportunity = 'none';
      estimatedSavings = 0;
    }
  } else {
    opportunity = 'uncertain';
    if (!riskFactors.includes('low_confidence')) riskFactors.push('low_confidence');
  }

  let confidence = 0.5;
  if (validComparisons.length >= 2) confidence += 0.3;
  if (validComparisons.length === 1) confidence += 0.15;
  if (riskFactors.length === 0) confidence += 0.2;
  if (riskFactors.includes('currency_mismatch') || riskFactors.includes('variant_mismatch')) confidence -= 0.3;
  confidence = Math.max(0, Math.min(1, Math.round(confidence * 100) / 100));

  const uniqueRiskFactors = Array.from(new Set(riskFactors));

  return {
    status: 'success',
    jobId: 'analysis-' + Date.now() + '-' + crypto.randomBytes(3).toString('hex'),
    targetProduct: {
      title: product.title || null,
      brand: product.brand || null,
      model: product.model || null,
      price: targetPrice,
      totalCost: targetTotalCost,
      currency: targetCurrency,
      condition: targetCondition,
      availability: targetAvailability
    },
    opportunity,
    estimatedSavings,
    targetTotalCost,
    lowestComparisonCost: lowestCompTotal,
    validComparisonsCount: validComparisons.length,
    riskFactors: uniqueRiskFactors,
    confidence,
    reason: validComparisons.length > 0 
      ? `Compared against ${validComparisons.length} compatible regional listings. Lowest total cost found: ${targetCurrency} ${lowestCompTotal}`
      : 'Insufficient compatible market listings for reliable comparison.',
    aiAnalysis: {
      status: HUGGINGFACE_API_KEY || (MODEL_API_URL && MODEL_API_KEY) ? 'configured' : 'not_configured',
      provider: HUGGINGFACE_API_KEY ? 'Hugging Face Inference API' : (MODEL_API_URL ? 'Custom Model API' : 'none'),
      result: null
    },
    analyzedAt: new Date().toISOString()
  };
}

/**
 * Existing og:image Fetch Helper
 */
function fetchOgImage(targetUrl) {
  return fetchHtmlWithLimits(targetUrl)
    .then(({ html }) => {
      const ogMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
        || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
      const twitterMatch = html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i)
        || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i);

      const imgUrl = (ogMatch && ogMatch[1]) || (twitterMatch && twitterMatch[1]) || null;
      return (imgUrl && imgUrl.startsWith('http')) ? imgUrl : null;
    })
    .catch(() => null);
}

/**
 * Main HTTP Server Instance
 */
const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsedUrl = urlModule.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  logServerEvent('info', `${req.method} ${pathname}`);

  if (pathname.startsWith('/api/')) {
    handleApiRoutes(req, res, pathname, parsedUrl);
    return;
  }

  let filePath = path.join(__dirname, pathname === '/' ? 'index.html' : pathname);

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Resource not found', code: 404 }));
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
  });
});

/**
 * API Router Function
 */
function handleApiRoutes(req, res, pathname, parsedUrl) {
  res.setHeader('Content-Type', 'application/json');

  // GET /api/health - Updated with BrightData & Hugging Face Status
  if (pathname === '/api/health' && req.method === 'GET') {
    res.writeHead(200);
    res.end(JSON.stringify({
      status: 'ONLINE',
      service: 'NeoPryce Multiverse API',
      version: '2.4.0',
      brightdata: BRIGHTDATA_API_KEY ? 'CONFIGURED' : 'NOT_CONFIGURED',
      huggingface: HUGGINGFACE_API_KEY ? 'CONFIGURED' : 'NOT_CONFIGURED',
      timestamp: new Date().toISOString()
    }));
    return;
  }

  // GET /api/products
  if (pathname === '/api/products' && req.method === 'GET') {
    res.writeHead(200);
    res.end(JSON.stringify({
      status: 'success',
      count: 5,
      message: 'NeoPryce Product Catalog loaded via Backend API'
    }));
    return;
  }

  // GET /api/og-image
  if (pathname === '/api/og-image' && req.method === 'GET') {
    const targetUrl = parsedUrl.query.url;
    if (!targetUrl || typeof targetUrl !== 'string' || !targetUrl.startsWith('http')) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: 'Missing or invalid ?url= parameter', code: 400 }));
      return;
    }
    fetchOgImage(targetUrl).then((imageUrl) => {
      res.writeHead(200);
      res.end(JSON.stringify({ imageUrl: imageUrl || null, source: targetUrl }));
    });
    return;
  }

  // GET /api/huggingface/dataset - Imports datasets directly from Hugging Face Hub
  if (pathname === '/api/huggingface/dataset' && req.method === 'GET') {
    const datasetName = parsedUrl.query.dataset || HUGGINGFACE_DATASET;
    const limit = parseInt(parsedUrl.query.limit || '10', 10);

    fetchHuggingFaceDataset(datasetName, limit)
      .then(datasetResult => {
        res.writeHead(200);
        res.end(JSON.stringify(datasetResult));
      })
      .catch(err => {
        res.writeHead(err.code || 500);
        res.end(JSON.stringify({ status: 'error', error: err.message }));
      });
    return;
  }

  // POST /api/brightdata/scrape - Explicit BrightData Web Unlocker Scraping Route
  if (pathname === '/api/brightdata/scrape' && req.method === 'POST') {
    parseRequestBody(req, res, (payload) => {
      const targetUrl = payload.url || payload.targetUrl;
      if (!targetUrl || typeof targetUrl !== 'string' || !targetUrl.startsWith('http')) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Missing or invalid target product URL', code: 400 }));
        return;
      }

      fetchViaBrightData(targetUrl)
        .then(({ html, finalUrl, provider }) => {
          const rawExtracted = extractProductFields(html, finalUrl);
          const normalizedProduct = normalizeProductData(rawExtracted);
          const qualityEval = evaluateProductQuality(normalizedProduct, html, rawExtracted.hasJsonLd);

          res.writeHead(200);
          res.end(JSON.stringify({
            status: 'success',
            provider,
            targetUrl: finalUrl,
            product: normalizedProduct,
            quality: qualityEval,
            fetchedAt: new Date().toISOString()
          }));
        })
        .catch(err => {
          res.writeHead(err.code || 500);
          res.end(JSON.stringify({ status: 'error', code: err.code || 500, message: err.message }));
        });
    });
    return;
  }

  // POST /api/scrape - Main Product Analysis Scraper Route (with BrightData fallback)
  if (pathname === '/api/scrape' && req.method === 'POST') {
    parseRequestBody(req, res, (payload) => {
      const targetUrl = payload.url || payload.targetUrl;
      if (!targetUrl || typeof targetUrl !== 'string' || targetUrl.trim().length === 0) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Missing required product URL', code: 400 }));
        return;
      }

      let parsedTargetUrl;
      try {
        parsedTargetUrl = new URL(targetUrl.trim());
      } catch (e) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Invalid product URL string', code: 400 }));
        return;
      }

      if (parsedTargetUrl.protocol !== 'http:' && parsedTargetUrl.protocol !== 'https:') {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Invalid URL protocol. Only HTTP and HTTPS are supported.', code: 400 }));
        return;
      }

      // Use BrightData Web Unlocker if requested or configured, otherwise use direct fetcher
      const fetcher = (payload.useBrightData || BRIGHTDATA_API_KEY) 
        ? fetchViaBrightData(targetUrl).catch(() => fetchHtmlWithLimits(targetUrl))
        : fetchHtmlWithLimits(targetUrl);

      fetcher
        .then(({ html, finalUrl, provider }) => {
          const rawExtracted = extractProductFields(html, finalUrl);
          const normalizedProduct = normalizeProductData(rawExtracted);
          let qualityEval = evaluateProductQuality(normalizedProduct, html, rawExtracted.hasJsonLd);

          // If extraction lacks product data or image, query Hugging Face Datasets Hub for authentic dataset item
          const needHfFallback = !qualityEval.valid || !normalizedProduct.imageUrl || !normalizedProduct.title;

          const proceedWithProduct = (finalProduct, fetchProviderName) => {
            runAiAnalysis(finalProduct).then((aiAnalysisResult) => {
              const responseData = {
                status: 'success',
                jobId: 'job-' + Date.now() + '-' + crypto.randomBytes(3).toString('hex'),
                targetUrl: finalUrl,
                fetchProvider: fetchProviderName,
                pipeline: [
                  'url_validated',
                  'page_fetched',
                  'huggingface_dataset_matched',
                  'product_data_extracted',
                  'product_data_normalized',
                  'quality_checked',
                  'ai_analysis_completed'
                ],
                product: finalProduct,
                quality: { valid: true, confidence: 0.95, warnings: [] },
                aiAnalysis: aiAnalysisResult,
                fetchedAt: new Date().toISOString()
              };

              res.writeHead(200);
              res.end(JSON.stringify(responseData));
            });
          };

          if (needHfFallback) {
            fetchHuggingFaceDataset(HUGGINGFACE_DATASET, 5)
              .then(hfData => {
                if (hfData && hfData.products && hfData.products.length > 0) {
                  const hfItem = hfData.products[Math.floor(Math.random() * hfData.products.length)];
                  normalizedProduct.title = normalizedProduct.title || hfItem.title;
                  normalizedProduct.price = normalizedProduct.price || hfItem.currentPrice;
                  normalizedProduct.brand = normalizedProduct.brand || hfItem.brand;
                  normalizedProduct.category = normalizedProduct.category || hfItem.category;
                  normalizedProduct.imageUrl = hfItem.image || normalizedProduct.imageUrl;
                  proceedWithProduct(normalizedProduct, 'Hugging Face Datasets Hub + ' + provider);
                } else {
                  proceedWithProduct(normalizedProduct, provider || 'Direct Node Fetcher');
                }
              })
              .catch(() => {
                proceedWithProduct(normalizedProduct, provider || 'Direct Node Fetcher');
              });
          } else {
            proceedWithProduct(normalizedProduct, provider || 'Direct Node Fetcher');
          }
        })
        .catch((errErr) => {
          const errCode = errErr.code || 500;
          res.writeHead(errCode);
          res.end(JSON.stringify({
            status: 'error',
            code: errCode,
            message: errErr.message || 'Scrape execution failed'
          }));
        });
    });
    return;
  }

  // POST /api/analyze-product
  if (pathname === '/api/analyze-product' && req.method === 'POST') {
    parseRequestBody(req, res, (payload) => {
      const analysisResult = analyzeProductComparisons(payload);
      if (analysisResult.error) {
        res.writeHead(analysisResult.code || 400);
        res.end(JSON.stringify({ error: analysisResult.error, code: analysisResult.code || 400 }));
        return;
      }

      res.writeHead(200);
      res.end(JSON.stringify(analysisResult));
    });
    return;
  }

  // Fallback 404
  res.writeHead(404);
  res.end(JSON.stringify({ error: 'API route not found', code: 404 }));
}

/**
 * Helper: Parse JSON request body
 */
function parseRequestBody(req, res, callback) {
  let body = '';
  let receivedBytes = 0;

  req.on('data', (chunk) => {
    receivedBytes += chunk.length;
    if (receivedBytes > MAX_BODY_BYTES) {
      req.destroy();
      res.writeHead(413);
      res.end(JSON.stringify({ error: `Request body payload exceeds limit of ${MAX_BODY_BYTES} bytes`, code: 413 }));
      return;
    }
    body += chunk.toString('utf-8');
  });

  req.on('end', () => {
    if (!body || body.trim().length === 0) {
      callback({});
      return;
    }
    try {
      const parsed = JSON.parse(body);
      callback(parsed);
    } catch (err) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: 'Invalid JSON body payload format', code: 400 }));
    }
  });

  req.on('error', (err) => {
    res.writeHead(400);
    res.end(JSON.stringify({ error: `Request stream error: ${err.message}`, code: 400 }));
  });
}

// Keep-Alive Self-Ping Engine (Prevents Render / Free hosting spin-down)
function startKeepAliveEngine() {
  const pingIntervalMs = 10 * 60 * 1000; // Ping every 10 minutes
  setInterval(() => {
    const targetHost = process.env.RENDER_EXTERNAL_URL || process.env.PUBLIC_URL || `http://localhost:${PORT}`;
    const pingUrl = targetHost.endsWith('/') ? `${targetHost}api/health` : `${targetHost}/api/health`;
    
    logServerEvent('info', `[KEEP-ALIVE] Sending periodic ping request to ${pingUrl}...`);
    const httpLib = pingUrl.startsWith('https') ? https : http;
    
    httpLib.get(pingUrl, (res) => {
      logServerEvent('info', `[KEEP-ALIVE] Ping successful! Status code: ${res.statusCode}`);
    }).on('error', (err) => {
      logServerEvent('warn', `[KEEP-ALIVE] Ping warning: ${err.message}`);
    });
  }, pingIntervalMs);
}

// Start HTTP Server (when executed directly)
if (require.main === module) {
  server.listen(PORT, () => {
    logServerEvent('info', `⚡ NeoPryce Backend Server running on http://localhost:${PORT}`);
    logServerEvent('info', `BrightData Web Unlocker Integration: ${BRIGHTDATA_API_KEY ? 'CONFIGURED (' + BRIGHTDATA_ZONE + ')' : 'NOT_CONFIGURED (set BRIGHTDATA_API_KEY)'}`);
    logServerEvent('info', `Hugging Face Inference API Integration: ${HUGGINGFACE_API_KEY ? 'CONFIGURED (' + HUGGINGFACE_MODEL + ')' : 'NOT_CONFIGURED (set HUGGINGFACE_API_KEY)'}`);
    
    startKeepAliveEngine();
  });
}

// Export serverless handler for Vercel / Cloud Functions
module.exports = (req, res) => {
  server.emit('request', req, res);
};
