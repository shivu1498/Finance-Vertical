// Multi-period returns for Indian indices (1D through 10Y), for the
// spreadsheet feed in nse-all-indices.js.
//
// WHY THIS IS SEPARATE FROM THE NSE FEED. NSE's /api/allIndices carries
// exactly three return figures: percentChange (1 day), perChange30d and
// perChange365d. Everything longer — 3M, 6M, 2Y, 5Y, 10Y and the rest —
// has to be computed from historical index levels, which that endpoint
// doesn't provide. Yahoo Finance does have deep daily history, but only for
// a handful of Indian indices, so this module fills what it can and leaves
// the rest blank rather than inventing numbers.
//
// Coverage is therefore deliberately partial and that is the honest
// outcome, not a bug: every index keeps NSE's own 1D/1M/1Y, and the longer
// windows appear only where real history backs them.
//
// SYMBOLS. ^NSEI, ^NSEBANK and ^INDIAVIX are already used elsewhere in this
// app and known to work. The ^CNX* sector symbols below are Yahoo's older
// naming for NSE sector indices; whether each still resolves couldn't be
// checked from the dev sandbox (no outbound network), so every fetch is
// independent and a failure just means blanks for that index. Adding a
// symbol here is the only step needed to extend coverage.

const { parseLongSeries } = require("./quotes");

// [label, calendar days back]. 12M and 1Y are the same window by
// definition; both are emitted because both were asked for.
const PERIODS = [
  ["1D", 1],
  ["15D", 15],
  ["1M", 30],
  ["3M", 91],
  ["6M", 182],
  ["9M", 273],
  ["12M", 365],
  ["1Y", 365],
  ["2Y", 730],
  ["3Y", 1095],
  ["5Y", 1826],
  ["7Y", 2556],
  ["10Y", 3652],
];

// Normalised NSE index name -> Yahoo symbol.
const YAHOO_INDEX_SYMBOLS = {
  "NIFTY 50": "^NSEI",
  "NIFTY BANK": "^NSEBANK",
  "INDIA VIX": "^INDIAVIX",
  "NIFTY 100": "^CNX100",
  "NIFTY 500": "^CRSLDX",
  "NIFTY NEXT 50": "^NSMIDCP",
  "NIFTY MIDCAP 50": "^NSEMDCP50",
  "NIFTY IT": "^CNXIT",
  "NIFTY AUTO": "^CNXAUTO",
  "NIFTY PHARMA": "^CNXPHARMA",
  "NIFTY METAL": "^CNXMETAL",
  "NIFTY FMCG": "^CNXFMCG",
  "NIFTY REALTY": "^CNXREALTY",
  "NIFTY ENERGY": "^CNXENERGY",
  "NIFTY INFRASTRUCTURE": "^CNXINFRA",
  "NIFTY MEDIA": "^CNXMEDIA",
  "NIFTY PSU BANK": "^CNXPSUBANK",
  "NIFTY PSE": "^CNXPSE",
  "NIFTY COMMODITIES": "^CNXCMDT",
  "NIFTY INDIA CONSUMPTION": "^CNXCONSUM",
  "NIFTY FINANCIAL SERVICES": "^CNXFIN",
  "NIFTY MNC": "^CNXMNC",
  "NIFTY SERVICES SECTOR": "^CNXSERVICE",
};

function normalizeName(name) {
  return String(name || "").toUpperCase().replace(/\s+/g, " ").trim();
}

// % change from the last close at or before each cutoff, same calendar-day
// convention as quotes.js's parsePeriods and trend-india.js's returns —
// so "1Y" means the same thing everywhere in this app.
function computeReturns(series, nowT) {
  if (!series || !series.length) return {};
  const lastIdx = series.length - 1;
  const latest = series[lastIdx].close;
  const asOf = Number.isFinite(nowT) ? nowT : series[lastIdx].t;

  function closeBefore(cutoffT) {
    for (let i = lastIdx; i >= 0; i--) {
      if (series[i].t <= cutoffT) return series[i].close;
    }
    return null;
  }

  const out = {};
  for (const [label, days] of PERIODS) {
    const base = closeBefore(asOf - days * 86400);
    // A base of null means the history doesn't reach back that far — blank,
    // never a zero or a wrong number computed off the oldest available bar.
    out[label] = base && base !== 0 ? ((latest - base) / base) * 100 : null;
  }
  return out;
}

function createIndexReturns({
  fetchImpl = fetch,
  yahooBase = "https://query1.finance.yahoo.com",
  cacheMs = 6 * 60 * 60 * 1000, // daily bars; no reason to refetch often
  symbols = YAHOO_INDEX_SYMBOLS,
} = {}) {
  let cached = null;
  let cachedAt = 0;

  async function fetchOne(symbol) {
    const url = `${yahooBase}/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=max`;
    const res = await fetchImpl(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        Accept: "application/json",
      },
    });
    if (!res.ok) throw new Error(`upstream ${res.status} for ${symbol}`);
    return parseLongSeries(await res.json(), symbol);
  }

  // Returns a Map of normalised index name -> { "3M": -4.1, ... }. Symbols
  // that fail are simply absent from the map; one dead symbol never affects
  // the others, and never fails the caller.
  async function fetchReturns() {
    if (cached && Date.now() - cachedAt < cacheMs) return cached;

    const entries = Object.entries(symbols);
    const settled = await Promise.allSettled(entries.map(([, sym]) => fetchOne(sym)));
    const nowT = Math.floor(Date.now() / 1000);

    const byName = new Map();
    const covered = [];
    const missing = [];
    settled.forEach((r, i) => {
      const [name, sym] = entries[i];
      if (r.status === "fulfilled" && r.value.length) {
        byName.set(name, computeReturns(r.value, nowT));
        covered.push(sym);
      } else {
        missing.push(sym);
      }
    });

    cached = { byName, covered, missing, asOf: new Date().toISOString() };
    cachedAt = Date.now();
    return cached;
  }

  return { fetchReturns, computeReturns, PERIODS };
}

module.exports = { createIndexReturns, computeReturns, normalizeName, PERIODS, YAHOO_INDEX_SYMBOLS };
