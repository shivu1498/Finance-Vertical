// StalkingStocks — Express app (routes only, no listen()).
//
// Shared by two entrypoints:
//  - server.js: traditional/local hosting (calls app.listen() + opens a browser)
//  - api/[...all].js: Vercel's serverless runtime (Vercel invokes this app
//    directly per-request; there is no persistent process to listen() with)
//
// Proxies Yahoo Finance's public chart endpoint (free, no API key) so the
// browser never hits a foreign origin directly (avoids CORS + hides nothing
// sensitive, since Yahoo's endpoint is unauthenticated).
const express = require("express");
const path = require("path");
const fs = require("fs");
const { createScreenerHandler } = require("./screener");
const { createMf } = require("./mf");
const { createFilings } = require("./filings");
const { parseChart } = require("./quotes");
const tijori = require("./tijori");
const companies = require("./companies");

// Minimal .env loader so the Screener session cookie never lives in code.
// (On Vercel, env vars come from the dashboard instead; a missing .env here
// is expected and harmless.)
try {
  for (const line of fs.readFileSync(path.join(__dirname, ".env"), "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch {
  // no .env file: Screener integration simply stays disabled
}

const app = express();

// symbol -> { data, ts }
const cache = new Map();
const CACHE_MS = 15_000;
const YAHOO_BASE = process.env.YAHOO_BASE || "https://query1.finance.yahoo.com";

async function fetchQuote(symbol) {
  const cached = cache.get(symbol);
  if (cached && Date.now() - cached.ts < CACHE_MS) return cached.data;

  const url = `${YAHOO_BASE}/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`;

  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      Accept: "application/json",
    },
  });

  if (!res.ok) throw new Error(`upstream ${res.status} for ${symbol}`);
  const data = parseChart(await res.json(), symbol);

  cache.set(symbol, { data, ts: Date.now() });
  return data;
}

// Vercel serves a root-level public/ directory as static assets on its own,
// but this also keeps `node server.js` working unchanged for local/Render/
// Railway hosting.
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/quotes", async (req, res) => {
  const raw = (req.query.symbols || "").toString();
  const symbols = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (symbols.length === 0) {
    return res.status(400).json({ error: "symbols query param required" });
  }

  const results = await Promise.allSettled(symbols.map(fetchQuote));

  const quotes = results.map((r, i) =>
    r.status === "fulfilled"
      ? r.value
      : { symbol: symbols[i], error: true, message: r.reason?.message }
  );

  res.json({ quotes, updatedAt: new Date().toISOString() });
});

const screenerHandler = createScreenerHandler({ sessionId: process.env.SCREENER_SESSIONID, directory: companies.loadDefault() });
app.get("/api/screener/company/:symbol", screenerHandler.company);
app.get("/api/screener/:symbol", screenerHandler);

// Ticker -> Tijori Finance company page (name from Screener if configured,
// else Yahoo). See tijori.js.
app.use(
  "/api/tijori",
  tijori.createRouter(tijori.createResolver({ screenerLookup: screenerHandler.lookup, directory: companies.loadDefault() }))
);

// Mutual-fund screener (mfapi.in). Builds in the background and caches to data/.
// This relies on local disk + setInterval, neither of which survive on Vercel's
// serverless runtime, so it's disabled there by default (vercel.json sets
// MF_DISABLE=1). It works as-is on Render, Railway, or any traditional host.
const mf = createMf();
app.use("/api/mf", mf.router);
if (process.env.MF_DISABLE !== "1") mf.start();

// Annual-report filings (SEC EDGAR for US, NSE's RSS feed for India — see
// filings.js for why no other market is offered).
const filings = createFilings();
app.use("/api/filings", filings.router);

module.exports = app;
