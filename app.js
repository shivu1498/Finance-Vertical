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
const { createFinviz } = require("./finviz");
const { createMf } = require("./mf");
const { createFilings } = require("./filings");
const { parseChart, parsePeriods } = require("./quotes");
const { createNseAnnouncements } = require("./nse-announcements");
const { createNseSectorIndices } = require("./nse-sector-indices");
const { createNseIndexBreadth, INDEX_UNIVERSES } = require("./nse-index-breadth");
const { createBreadthEngine } = require("./breadth");
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

// Separate cache for the (much heavier, 2y-of-daily-bars) period-return
// fetch used by the Markets tab's 1D/1W/1M/3M/6M/1Y chips — only ever one
// or two symbols (the active country's index) hit this, and the figures
// barely move intraday outside of today's bar, so a longer TTL is fine.
const periodsCache = new Map();
const PERIODS_CACHE_MS = 5 * 60_000;

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

async function fetchPeriods(symbol) {
  const cached = periodsCache.get(symbol);
  if (cached && Date.now() - cached.ts < PERIODS_CACHE_MS) return cached.data;

  // 2y of daily bars comfortably covers a 1-year-ago lookback even with
  // holiday gaps near the boundary.
  const url = `${YAHOO_BASE}/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=2y`;

  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      Accept: "application/json",
    },
  });

  if (!res.ok) throw new Error(`upstream ${res.status} for ${symbol}`);
  const data = parsePeriods(await res.json(), symbol);

  periodsCache.set(symbol, { data, ts: Date.now() });
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

// One symbol's % change over 1D/1W/1M/3M/6M/1Y, for the Markets tab's
// period chips next to the country index. Deliberately separate from
// /api/quotes (which stays a cheap 5-day fetch for the ticker tape, sector
// heatmap, etc. — paying for 2y of history on every one of those symbols
// would be wasteful for data almost nothing there uses).
app.get("/api/quotes/periods", async (req, res) => {
  const symbol = (req.query.symbol || "").toString().trim();
  if (!symbol) return res.status(400).json({ error: "symbol query param required" });
  try {
    res.json(await fetchPeriods(symbol));
  } catch (err) {
    res.status(502).json({ error: "upstream_error", message: err.message });
  }
});

const screenerHandler = createScreenerHandler({ sessionId: process.env.SCREENER_SESSIONID, directory: companies.loadDefault() });
app.get("/api/screener/company/:symbol", screenerHandler.company);
app.get("/api/screener/:symbol", screenerHandler);

// US company data from Finviz (see finviz.js). No key or cookie needed.
app.get("/api/finviz/:ticker", createFinviz());

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

// "Announcements": NSE's live corporate-announcements feed, scanned for
// capex, new-order/contract-win, product-launch, M&A, and management-change
// filings, cross-checked against our own industry classification. See
// nse-announcements.js.
app.get("/api/filings/in/announcements", createNseAnnouncements({ directory: companies.loadDefault() }));

// Sector Heatmap (India): NSE's own "SECTORAL INDICES" — real % change and
// P/E per sector, covering sectors with no/too-few Nifty 50 constituents
// (Capital Mkts, Media, Realty, MNC) that the constituent-average heatmap
// can't. See nse-sector-indices.js. The client falls back to the
// constituent-average heatmap if this fails or hasn't loaded yet.
app.get("/api/indices/in/sectors", createNseSectorIndices());

// Market Breadth (India): advance/decline across ~21 selectable NSE index
// universes (Nifty 50 through Nifty Total Market), compared across six
// lookback windows (1D/1W/20D/50D/100D/200D). See nse-index-breadth.js
// (constituents + live 1D % change) and breadth.js (the multi-period
// orchestration for the other five windows, built around a shared
// cross-universe cache + time budget since the larger universes run to
// hundreds of stocks). 1D uses NSE's own live pChange per stock rather
// than a Yahoo-derived sign, since that's the same figure already shown
// everywhere else in this app and needs no extra fetch.
const nseIndexBreadth = createNseIndexBreadth();
const breadthEngine = createBreadthEngine();
app.get("/api/breadth/in", async (req, res) => {
  const slug = (req.query.universe || "nifty50").toString();
  try {
    const constituents = await nseIndexBreadth.get(slug);
    const yahooSymbols = constituents.stocks.map((s) => `${s.symbol}.NS`);
    const { periods, coverage } = await breadthEngine.computeBreadth(yahooSymbols);

    let adv1d = 0, dec1d = 0, flat1d = 0, checked1d = 0;
    for (const s of constituents.stocks) {
      if (s.pChange == null) continue;
      checked1d++;
      if (s.pChange > 0) adv1d++;
      else if (s.pChange < 0) dec1d++;
      else flat1d++;
    }
    periods["1D"] = { adv: adv1d, dec: dec1d, flat: flat1d };

    res.set("Cache-Control", "public, max-age=30");
    res.json({
      asOf: constituents.asOf,
      slug: constituents.slug,
      label: constituents.label,
      total: constituents.stocks.length,
      periods,
      coverage: { ...coverage, oneDay: { checked: checked1d, total: constituents.stocks.length } },
    });
  } catch (err) {
    res.status(err.status || 502).json({ error: err.code || "breadth_error", message: err.message });
  }
});
app.get("/api/breadth/in/universes", (req, res) => {
  res.set("Cache-Control", "public, max-age=3600");
  res.json({ universes: INDEX_UNIVERSES.map(({ slug, label, approxSize }) => ({ slug, label, approxSize })) });
});

module.exports = app;
