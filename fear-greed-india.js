// India Fear & Greed Index — a single composite 0-100 reading built in the
// spirit of the "fear & greed" style page tipsheet.markets publishes (a big
// score + word label, a 0-100 scale with five zones from Extreme Fear to
// Extreme Greed, a week/month/year-ago comparison, a component breakdown
// table, and score history charts) but computed independently: this app's
// own four-signal method, disclosed below, not their undisclosed model, and
// sourced from this app's own existing Yahoo Finance pipeline rather than
// scraped from their page.
//
// Four signals, each ranked as a percentile against its OWN history (same
// "how unusual is this, for this series" framing as trend-india.js), then
// averaged into one 0-100 score:
//
//  1. Momentum       — Nifty 50 close vs. its own 125-trading-day average.
//  2. Volatility      — India VIX, the market's own priced expectation of
//                        near-term swings, where history for it is available;
//                        otherwise 21-day realised volatility of Nifty 50
//                        daily returns, annualised. Either way it is
//                        inverted, so a calmer market scores greedier, and
//                        the response says which of the two was used.
//  3. Safe-haven demand — Nifty 50's trailing-20-day return minus gold's
//                        (GOLDBEES.NS, an NSE-listed gold ETF, so it shares
//                        Nifty's own trading calendar — no date-alignment
//                        guesswork needed). Equities outrunning gold reads
//                        as risk appetite; gold outrunning equities reads
//                        as caution.
//  4. Distance from highs — how far today's close sits below the highest
//                        close so far (reuses the same running-high/offHigh
//                        idea as trend-india.js's drawdown figure).
//
// Data source: Yahoo Finance's public chart endpoint, over an explicit
// daily window (quotes.js's dailyChartUrl, never range=max), via the
// same parseLongSeries this app's Trend & Momentum dashboard already uses
// in production (trend-india.js) — ^NSEI is already confirmed working
// there. GOLDBEES.NS uses the same ".NS" Yahoo convention this app's
// breadth engine already fetches at scale (app.js's /api/breadth route), so
// it isn't a new, unverified kind of symbol — just a new one.

const { parseLongSeries, dailyChartUrl } = require("./quotes");
const { percentileOf } = require("./trend-india");

const NIFTY_SYMBOL = "^NSEI";
const GOLD_SYMBOL = "GOLDBEES.NS"; // Nippon India ETF Gold BeES
// India VIX. Yahoo's coverage of it couldn't be checked from the dev sandbox,
// so nothing depends on it: if the fetch fails or the history is too thin,
// the volatility signal silently falls back to realised volatility and the
// response reports which source was actually used.
const VIX_SYMBOL = "^INDIAVIX";

const MOMENTUM_DAYS = 125; // trading bars, ~6 months
const VOL_DAYS = 21; // trading bars, ~1 month of returns
const SAFE_HAVEN_DAYS = 20; // trading bars, ~1 month

const SIGNALS = [
  {
    key: "momentum",
    label: "Market momentum",
    description: "Nifty 50 vs. its own 125-day average — how far the index is running above or below its recent trend.",
  },
  {
    key: "volatility",
    label: "Volatility",
    description: "How calm or turbulent the market is. Calmer reads greedier.",
  },
  {
    key: "safeHaven",
    label: "Safe-haven demand",
    description: "Nifty 50's one-month return against gold's. Equities outrunning gold reads as risk appetite; gold outrunning equities reads as caution.",
  },
  {
    key: "distanceFromHigh",
    label: "Distance from highs",
    description: "How far the index sits below its highest close to date. Near a high reads as greed; a deep drawdown reads as fear.",
  },
];

function zoneOf(score) {
  if (score == null) return null;
  if (score < 20) return "Extreme Fear";
  if (score < 40) return "Fear";
  if (score < 60) return "Neutral";
  if (score < 80) return "Greed";
  return "Extreme Greed";
}

function dayOf(t) {
  return Math.floor(t / 86400);
}

// Forward-fills another series onto each Nifty bar's calendar day. Used for
// both gold and India VIX, each NSE-listed and so sharing Nifty's trading
// calendar — a same-day lookup in the overwhelming majority of cases, with
// the forward-fill only mattering for the rare day one series has a bar and
// the other doesn't. Returns nulls for days before that series begins.
function alignSeries(niftySeries, otherSeries) {
  if (!otherSeries || !otherSeries.length) return niftySeries.map(() => null);
  const byDay = new Map(otherSeries.map((p) => [dayOf(p.t), p.close]));
  let last = null;
  return niftySeries.map((p) => {
    const d = dayOf(p.t);
    if (byDay.has(d)) last = byDay.get(d);
    return last;
  });
}

function logReturn(a, b) {
  return Math.log(a / b);
}

// Pure, synchronous, and what test/fear-greed-india.test.js exercises
// directly: given the two plain [{t, close}] series (oldest first — see
// parseLongSeries), computes the full day-by-day composite history, the
// component breakdown for the latest day, week/month/year-ago comparisons,
// and the chart series the UI shows.
function computeFearGreedSeries(niftySeries, goldSeries, vixSeries) {
  const closes = niftySeries.map((p) => p.close);
  const n = closes.length;
  const gold = alignSeries(niftySeries, goldSeries);
  const vix = alignSeries(niftySeries, vixSeries);

  const momentumRaw = new Array(n).fill(null);
  const realisedRaw = new Array(n).fill(null);
  const safeHavenRaw = new Array(n).fill(null);
  const offHigh = new Array(n).fill(null);

  let runningHigh = -Infinity;
  for (let i = 0; i < n; i++) {
    runningHigh = Math.max(runningHigh, closes[i]);
    offHigh[i] = ((closes[i] - runningHigh) / runningHigh) * 100;

    if (i >= MOMENTUM_DAYS - 1) {
      let sum = 0;
      for (let j = i - MOMENTUM_DAYS + 1; j <= i; j++) sum += closes[j];
      const avg = sum / MOMENTUM_DAYS;
      momentumRaw[i] = ((closes[i] - avg) / avg) * 100;
    }

    if (i >= VOL_DAYS) {
      let sum = 0, sumSq = 0;
      for (let j = i - VOL_DAYS + 1; j <= i; j++) {
        const r = logReturn(closes[j], closes[j - 1]);
        sum += r;
        sumSq += r * r;
      }
      const mean = sum / VOL_DAYS;
      const variance = Math.max(sumSq / VOL_DAYS - mean * mean, 0);
      realisedRaw[i] = Math.sqrt(variance * 252) * 100;
    }

    if (i >= SAFE_HAVEN_DAYS && gold[i] != null && gold[i - SAFE_HAVEN_DAYS] != null) {
      const eqRet = (closes[i] / closes[i - SAFE_HAVEN_DAYS] - 1) * 100;
      const goldRet = (gold[i] / gold[i - SAFE_HAVEN_DAYS] - 1) * 100;
      safeHavenRaw[i] = eqRet - goldRet;
    }
  }

  function sortedValid(arr) {
    return arr.filter((v) => v != null).sort((a, b) => a - b);
  }
  const momSorted = sortedValid(momentumRaw);
  const vixSorted = sortedValid(vix);
  const realisedSorted = sortedValid(realisedRaw);
  const shSorted = sortedValid(safeHavenRaw);
  const dhSorted = sortedValid(offHigh);

  // India VIX and realised volatility are different quantities on different
  // scales, so their RAW values must never share one percentile pool. Each is
  // ranked against its own history first; only the resulting percentiles —
  // same unit, same meaning ("how calm is this, for this market") — are
  // interchangeable. Where VIX history exists it wins; elsewhere the realised
  // proxy carries the day, so the composite still spans the full history.
  const momPct = new Array(n).fill(null);
  const volPct = new Array(n).fill(null);
  const volRaw = new Array(n).fill(null);
  const volSource = new Array(n).fill(null);
  const shPct = new Array(n).fill(null);
  const dhPct = new Array(n).fill(null);
  const scores = new Array(n).fill(null);

  for (let i = 0; i < n; i++) {
    if (vix[i] != null) {
      volPct[i] = 100 - percentileOf(vixSorted, vix[i]); // calmer = greedier
      volRaw[i] = vix[i];
      volSource[i] = "india-vix";
    } else if (realisedRaw[i] != null) {
      volPct[i] = 100 - percentileOf(realisedSorted, realisedRaw[i]);
      volRaw[i] = realisedRaw[i];
      volSource[i] = "realised";
    }
    if (momentumRaw[i] == null || volPct[i] == null || safeHavenRaw[i] == null || offHigh[i] == null) continue;
    momPct[i] = percentileOf(momSorted, momentumRaw[i]);
    shPct[i] = percentileOf(shSorted, safeHavenRaw[i]);
    dhPct[i] = percentileOf(dhSorted, offHigh[i]);
    scores[i] = Math.round((momPct[i] + volPct[i] + shPct[i] + dhPct[i]) / 4);
  }

  const lastIdx = n - 1;
  const nowT = niftySeries[lastIdx].t;

  // Last index whose score is non-null and whose bar is at/before cutoffT.
  function scoreBefore(cutoffT) {
    for (let i = lastIdx; i >= 0; i--) {
      if (niftySeries[i].t <= cutoffT && scores[i] != null) return { score: scores[i], t: niftySeries[i].t };
    }
    return null;
  }
  function compareAt(label, daysAgo) {
    const hit = scoreBefore(nowT - daysAgo * 86400);
    return { label, score: hit ? hit.score : null, zone: hit ? zoneOf(hit.score) : null, asOf: hit ? new Date(hit.t * 1000).toISOString() : null };
  }

  const rawByKey = { momentum: momentumRaw, volatility: volRaw, safeHaven: safeHavenRaw, distanceFromHigh: offHigh };
  const pctByKey = { momentum: momPct, volatility: volPct, safeHaven: shPct, distanceFromHigh: dhPct };
  const VOL_TEXT = {
    "india-vix": "India VIX — the market's own priced expectation of near-term swings. A calmer reading is greedier.",
    realised: "How far daily moves have swung over the last month, annualised (a stand-in, used where India VIX history isn't available). Calmer reads greedier.",
  };
  const components = SIGNALS.map((s) => ({
    ...s,
    description: s.key === "volatility" ? (VOL_TEXT[volSource[lastIdx]] || s.description) : s.description,
    unit: s.key === "volatility" && volSource[lastIdx] === "india-vix" ? "level" : "percent",
    value: rawByKey[s.key][lastIdx],
    percentile: pctByKey[s.key][lastIdx],
    contribution: pctByKey[s.key][lastIdx] != null ? Math.round(pctByKey[s.key][lastIdx] / SIGNALS.length) : null,
  }));

  const latestScore = scores[lastIdx];

  // Two chart series: a long, thinned history (same every-5th-bar thinning
  // trend-india.js uses, so roughly weekly) and the last ~2 trading years
  // at full daily resolution.
  const chartLong = niftySeries
    .map((p, i) => ({ t: p.t, score: scores[i] }))
    .filter((p, i) => p.score != null && (i === lastIdx || i % 5 === 0));
  const recentStart = Math.max(0, n - 500);
  const chartRecent = niftySeries
    .slice(recentStart)
    .map((p, i) => ({ t: p.t, score: scores[recentStart + i] }))
    .filter((p) => p.score != null);

  return {
    asOf: new Date(nowT * 1000).toISOString(),
    bars: n,
    since: new Date(niftySeries[0].t * 1000).toISOString(),
    latest: {
      close: closes[lastIdx],
      score: latestScore,
      zone: zoneOf(latestScore),
      volatilitySource: volSource[lastIdx],
    },
    components,
    comparisons: {
      week: compareAt("A week ago", 7),
      month: compareAt("A month ago", 30),
      year: compareAt("A year ago", 365),
    },
    chartLong,
    chartRecent,
  };
}

function createFearGreedIndia({ fetchImpl = fetch, yahooBase = "https://query1.finance.yahoo.com", cacheMs = 15 * 60_000 } = {}) {
  let cached = null; // { at, result }

  async function fetchSeries(symbol) {
    const url = dailyChartUrl(yahooBase, symbol);
    const res = await fetchImpl(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        Accept: "application/json",
      },
    });
    if (!res.ok) throw Object.assign(new Error(`upstream ${res.status} for ${symbol}`), { status: 502, code: "upstream" });
    return parseLongSeries(await res.json(), symbol);
  }

  async function fetchFearGreed() {
    if (cached && Date.now() - cached.at < cacheMs) return cached.result;
    // Nifty and gold are required; India VIX is a bonus. allSettled rather
    // than all, so an unavailable VIX history degrades the volatility signal
    // back to the realised-volatility proxy instead of failing the page.
    const [nifty, gold, vix] = await Promise.allSettled([
      fetchSeries(NIFTY_SYMBOL),
      fetchSeries(GOLD_SYMBOL),
      fetchSeries(VIX_SYMBOL),
    ]);
    if (nifty.status !== "fulfilled") throw nifty.reason;
    if (gold.status !== "fulfilled") throw gold.reason;
    const vixSeries = vix.status === "fulfilled" ? vix.value : null;
    const result = computeFearGreedSeries(nifty.value, gold.value, vixSeries);
    cached = { at: Date.now(), result };
    return result;
  }

  async function handler(req, res) {
    try {
      res.set("Cache-Control", "public, max-age=300");
      res.json(await fetchFearGreed());
    } catch (err) {
      res.status(err.status || 502).json({ error: err.code || "fear_greed_error", message: err.message });
    }
  }
  handler.get = fetchFearGreed;
  return handler;
}

module.exports = { createFearGreedIndia, computeFearGreedSeries, zoneOf, SIGNALS, NIFTY_SYMBOL, GOLD_SYMBOL, VIX_SYMBOL, MOMENTUM_DAYS, VOL_DAYS, SAFE_HAVEN_DAYS };
