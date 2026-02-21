const express = require('express');
const fs = require('fs');
const path = require('path');

const { inspectToken } = require('./token-manager');
const CompraAgilScraper = require('./scraper-final');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const ROOT_DIR = __dirname;
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');

let isRunInProgress = false;

function toBoolean(value, defaultValue = false) {
  if (value === undefined || value === null || value === '') return defaultValue;
  const normalized = String(value).toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

function toBoundedInt(value, defaultValue, min, max) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isInteger(parsed)) return defaultValue;
  if (parsed < min || parsed > max) return defaultValue;
  return parsed;
}

function classifyResultType(filename) {
  if (filename.includes('-enriched')) return 'enriched';
  if (filename.includes('-summary')) return 'summary';
  return 'full';
}

function formatSseMessage(message) {
  return String(message).replace(/\r?\n/g, ' ');
}

function getHoursLeft(tokenState) {
  if (!tokenState || tokenState.secondsRemaining === null || tokenState.secondsRemaining === undefined) {
    return null;
  }
  return (Number(tokenState.secondsRemaining) / 3600).toFixed(1);
}

app.use(express.static(PUBLIC_DIR));

app.get('/', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

app.get('/api/auth/status', (req, res) => {
  const token = inspectToken();
  const accessHoursLeft = getHoursLeft(token.accessToken);
  const refreshHoursLeft = getHoursLeft(token.refreshToken);

  res.json({
    accessToken: {
      present: Boolean(token.accessToken?.present),
      hoursLeft: accessHoursLeft,
      isExpired: token.accessToken?.isExpired === true,
      isExpiringSoon: token.accessToken?.isExpiringSoon === true
    },
    refreshToken: {
      present: Boolean(token.refreshToken?.present),
      hoursLeft: refreshHoursLeft,
      isExpired: token.refreshToken?.isExpired === true
    }
  });
});

app.get('/api/scrape/run', async (req, res) => {
  if (isRunInProgress) {
    res.status(429).json({ error: 'A scrape is already running' });
    return;
  }

  isRunInProgress = true;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  let streamClosed = false;
  req.on('close', () => {
    streamClosed = true;
  });

  const sendSse = (message) => {
    if (streamClosed || res.writableEnded) return;
    res.write(`data: ${formatSseMessage(message)}\n\n`);
  };

  const options = {
    region: toBoolean(req.query.region, false) ? 13 : null,
    misRubros: toBoolean(req.query.misRubros, false),
    daysBack: toBoundedInt(req.query.days, 7, 1, 90),
    maxPages: toBoundedInt(req.query.pages, 10, 1, 50),
    enrich: toBoolean(req.query.enrich, false)
  };

  const originalLog = console.log;
  console.log = (...args) => {
    const message = args
      .map((arg) => {
        if (typeof arg === 'string') return arg;
        try {
          return JSON.stringify(arg);
        } catch {
          return String(arg);
        }
      })
      .join(' ');
    sendSse(message);
    originalLog(...args);
  };

  try {
    const scraper = new CompraAgilScraper();
    await scraper.scrape(options);
    sendSse('__DONE__');
  } catch (error) {
    sendSse(`__ERROR__: ${error.message}`);
  } finally {
    console.log = originalLog;
    isRunInProgress = false;
    if (!res.writableEnded) {
      res.end();
    }
  }
});

app.get('/api/results/files', async (req, res) => {
  try {
    const entries = await fs.promises.readdir(ROOT_DIR, { withFileTypes: true });
    const files = entries
      .filter((entry) => entry.isFile() && /^compra-agil-.*\.json$/.test(entry.name))
      .map((entry) => entry.name);

    const withStats = await Promise.all(
      files.map(async (filename) => {
        const fullPath = path.join(ROOT_DIR, filename);
        const stat = await fs.promises.stat(fullPath);
        return {
          filename,
          type: classifyResultType(filename),
          size: stat.size,
          modified: stat.mtime.toISOString(),
          modifiedMs: stat.mtimeMs
        };
      })
    );

    withStats.sort((a, b) => b.modifiedMs - a.modifiedMs);
    res.json(withStats.map(({ modifiedMs, ...rest }) => rest));
  } catch (error) {
    res.status(500).json({ error: `Failed to list result files: ${error.message}` });
  }
});

app.get('/api/results/file/:filename', async (req, res) => {
  const { filename } = req.params;
  if (!/^compra-agil-[A-Za-z0-9._-]+\.json$/.test(filename)) {
    res.status(400).json({ error: 'Invalid filename' });
    return;
  }

  const safeName = path.basename(filename);
  const fullPath = path.join(ROOT_DIR, safeName);

  try {
    const raw = await fs.promises.readFile(fullPath, 'utf8');
    const content = JSON.parse(raw);
    res.json(content);
  } catch (error) {
    if (error.code === 'ENOENT') {
      res.status(404).json({ error: 'File not found' });
      return;
    }
    res.status(500).json({ error: `Failed to read file: ${error.message}` });
  }
});

app.listen(PORT, () => {
  console.log(`Web UI server running at http://localhost:${PORT}`);
});
