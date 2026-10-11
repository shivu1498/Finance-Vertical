// Trend & momentum, for Indian indices — the server side of The Memo tab's
// first real dashboard (see public/trend-ui.js). Modelled on the kind of
// page tipsheet.markets publishes (a 0-100 "trend score" from several
// moving-average/momentum signals, an uptrend/downtrend state with a start
// date, and today's score shown against its own percentile history) but
// computed independently, from this app's own data source and its own
// simplified signal set — not a copy of their 24-signal methodology, which
// isn't published in enough detail to reproduce exactly.
//
// Data source: Yahoo Finance's public chart endpoint, the same one
// fetchQuote/fetchPeriods in app.js already use — see quotes.js's
// parseLongSeries. Requested with range=max (or an explicit `period1`
// decades back) so the whole available history comes back in one call,
// unlike NSE's own historical APIs which cap how far back a single request
// can reach. Yahoo's Indian-index symbols (^NSEI, ^NSEBANK, ^BSESN) are
// already used elsewhere in this app (public/data.js), so this reuses
// symbols already known to work rather than guessing new ones — Nifty 500
// and the sector indices aren't wired in yet for exactly that reason (no
// Yahoo symbol for them has been confirmed against a live response from
// this sandbox); see the README for how to add one once confirmed.
//
// Signals: at four horizons (20/50/100/200 trading-day bars — the same
// lookbacks public/app.js's breadth lookbacks use, so "a 200-day reading"
// means the same thing everywhere in this app), two votes each: is price
// above its own N-bar simple moving average, and is price higher than it
// was N bars ago. The trend score is the share of those 8 votes pointing
// up, 0-100. An uptrend starts the first time the score reaches 70 (and
// lasts until it falls to 30); a downtrend starts the first time it falls
// to 30 (and lasts until it climbs back to 70) — same threshold rule
// tipsheet.markets' page describes, applied to this app's own score.

const { parseLongSeries } = require("./quotes");

const HORIZONS = [20, 50, 100, 200]; // trading-day bars

const TREND_MARKETS = [
  { slug: "nifty-50", label: "Nifty 50", symbol: "^NSEI" },
  { slug: "nifty-bank", label: "Nifty Bank", symbol: "^NSEBANK" },
  { slug: "sensex", label: "BSE Sensex", symbol: "^BSESN" },
];
const MARKET_BY_SLUG = new Map(TREND_MARKETS.map((m) => [m.slug, m]));

function sma(closes, i, n) {
  if (i < n - 1) return null;
  let sum = 0;
  for (let j = i - n + 1; j <= i; j++) sum += closes[j];
  return sum / n;
}

// One day's score (0-100, or null before there's 200 bars of history to
// judge every horizon) plus the running all-time-high-so-far off-high %.
function scoreAt(closes, i) {
  if (i < HORIZONS[HORIZONS.length - 1]) return null;
  let up = 0;
  const price = closes[i];
  for (const n of HORIZONS) {
    const avg = sma(closes, i, n);
    if (avg != null && price > avg) up++;
    const past = closes[i - n];
    if (past != null && price > past) up++;
  }
  return Math.round((up / (HORIZONS.length * 2)) * 100);
}

// Percentile rank of `value` within `arr` (both plain numbers), 0-100,
// linear — "higher than this share of history," the same framing every
// "usual range" reading on the site uses.
function percentileOf(arr, value) {
  if (!arr.length) return null;
  const below = arr.filter((v) => v < value).length;
  const equal = arr.filter((v) => v === value).length;
  return Math.round(((below + equal / 2) / arr.length) * 100);
}

function quantile(sorted, q) {
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

// Pure, synchronous and the thing test/trend-india.test.js exercises
// directly: given a plain [{t, close}] series (oldest first — see
// parseLongSeries), computes the full score history, the trend state
// machine, drawdown-from-running-high, and the summary stats the UI shows.
function computeTrendSeries(series) {
  const closes = series.map((p) => p.close);
  const n = closes.length;

  const scores = new Array(n).fill(null);
  const offHighs = new Array(n).fill(null);
  let runningHigh = -Infinity;
  for (let i = 0; i < n; i++) {
    runningHigh = Math.max(runningHigh, closes[i]);
    offHighs[i] = ((closes[i] - runningHigh) / runningHigh) * 100; // <= 0
    scores[i] = scoreAt(closes, i);
  }

  // Trend state machine: starts "none" (not enough history, or never yet
  // hit either threshold); flips to "up" the first time score >= 70, to
  // "down" the first time score <= 30, and otherwise just carries the
  // previous state forward through the 30-70 band.
  let state = "none";
  let stateStartT = null;
  const states = new Array(n).fill("none");
  for (let i = 0; i < n; i++) {
    const s = scores[i];
    if (s != null) {
      if (s >= 70 && state !== "up") { state = "up"; stateStartT = series[i].t; }
      else if (s <= 30 && state !== "down") { state = "down"; stateStartT = series[i].t; }
    }
    states[i] = state;
  }

  const validScores = scores.filter((s) => s != null);
  const sortedScores = [...validScores].sort((a, b) => a - b);
  const validOffHighs = offHighs.filter((v) => Number.isFinite(v));
  const sortedOffHighs = [...validOffHighs].sort((a, b) => a - b);

  const lastIdx = n - 1;
  const latestScore = scores[lastIdx];
  const latestOffHigh = offHighs[lastIdx];

  // Calendar-day returns, same convention as quotes.js's parsePeriods
  // (walk back by days against the bar timestamps, not a fixed bar count).
  const RETURN_WINDOWS = [["1M", 30], ["3M", 91], ["6M", 182], ["1Y", 365]];
  const nowT = series[lastIdx].t;
  function closeBefore(cutoffT) {
    for (let i = lastIdx; i >= 0; i--) if (series[i].t <= cutoffT) return series[i].close;
    return null;
  }
  const returns = {};
  for (const [label, days] of RETURN_WINDOWS) {
    const base = closeBefore(nowT - days * 86400);
    returns[label] = base ? ((closes[lastIdx] - base) / base) * 100 : null;
  }

  return {
    asOf: new Date(series[lastIdx].t * 1000).toISOString(),
    bars: n,
    since: new Date(series[0].t * 1000).toISOString(),
    latest: {
      close: closes[lastIdx],
      score: latestScore,
      state: states[lastIdx],
      stateSince: stateStartT ? new Date(stateStartT * 1000).toISOString() : null,
      offHigh: Number.isFinite(latestOffHigh) ? latestOffHigh : null,
      scorePercentile: latestScore != null ? percentileOf(sortedScores, latestScore) : null,
      offHighPercentile: Number.isFinite(latestOffHigh) ? percentileOf(sortedOffHighs, latestOffHigh) : null,
    },
    usualRange: {
      score: { p25: quantile(sortedScores, 0.25), p75: quantile(sortedScores, 0.75), min: sortedScores[0] ?? null, max: sortedScores.at(-1) ?? null },
      offHigh: { p25: quantile(sortedOffHighs, 0.25), p75: quantile(sortedOffHighs, 0.75), min: sortedOffHighs[0] ?? null, max: sortedOffHighs.at(-1) ?? null },
    },
    returns,
    // A sparser chart series (monthly, roughly) keeps the response small —
    // 4000+ daily points is far more than a line chart needs to look right.
    chart: series
      .map((p, i) => ({ t: p.t, close: p.close, score: scores[i] }))
      .filter((_, i) => i === n - 1 || i % 5 === 0),
  };
}

function createTrendIndia({ fetchImpl = fetch, yahooBase = "https://query1.finance.yahoo.com", cacheMs = 15 * 60_000 } = {}) {
  const cache = new Map(); // slug -> { at, result }

  async function fetchMarket(slug) {
    const market = MARKET_BY_SLUG.get(slug);
    if (!market) throw Object.assign(new Error(`unknown market "${slug}"`), { status: 400, code: "unknown_market" });

    const cached = cache.get(slug);
    if (cached && Date.now() - cached.at < cacheMs) return cached.result;

    // period1=0 + range isn't a valid combo on Yahoo's API; `range=max`
    // alone is the documented way to ask for "everything available."
    const url = `${yahooBase}/v8/finance/chart/${encodeURIComponent(market.symbol)}?interval=1d&range=max`;
    const res = await fetchImpl(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        Accept: "application/json",
      },
    });
    if (!res.ok) throw Object.assign(new Error(`upstream ${res.status} for ${market.symbol}`), { status: 502, code: "upstream" });
    const series = parseLongSeries(await res.json(), market.symbol);
    const trend = computeTrendSeries(series);
    const result = { slug: market.slug, label: market.label, ...trend };

    cache.set(slug, { at: Date.now(), result });
    return result;
  }

  async function handler(req, res) {
    const slug = (req.params.slug || "nifty-50").toString();
    try {
      res.set("Cache-Control", "public, max-age=300");
      res.json(await fetchMarket(slug));
    } catch (err) {
      res.status(err.status || 502).json({ error: err.code || "trend_error", message: err.message });
    }
  }
  handler.get = fetchMarket;
  return handler;
}

module.exports = { createTrendIndia, computeTrendSeries, percentileOf, quantile, TREND_MARKETS, MARKET_BY_SLUG, HORIZONS };
