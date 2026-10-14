// Unit tests for fear-greed-india.js. No real network: fetchImpl is mocked,
// same pattern as test/trend-india.test.js.
const {
  createFearGreedIndia,
  computeFearGreedSeries,
  zoneOf,
  SIGNALS,
  NIFTY_SYMBOL,
  GOLD_SYMBOL,
} = require("../fear-greed-india");

let fails = 0;
const check = (n, ok, x = "") => { if (!ok) fails++; console.log((ok ? "PASS " : "FAIL ") + n + (x ? "  -> " + x : "")); };

const DAY = 86400;
function series(n, closeAt, startT = 1_000_000_000) {
  return Array.from({ length: n }, (_, i) => ({ t: startT + i * DAY, close: closeAt(i) }));
}

// ---- SIGNALS / zoneOf ----
check("SIGNALS: four disclosed signals", SIGNALS.length === 4, String(SIGNALS.length));
check("SIGNALS: every key is unique", new Set(SIGNALS.map((s) => s.key)).size === 4);
check("zoneOf: 0 is Extreme Fear", zoneOf(0) === "Extreme Fear");
check("zoneOf: 19 is still Extreme Fear", zoneOf(19) === "Extreme Fear");
check("zoneOf: 20 is Fear", zoneOf(20) === "Fear");
check("zoneOf: 50 is Neutral", zoneOf(50) === "Neutral");
check("zoneOf: 79 is still Greed", zoneOf(79) === "Greed");
check("zoneOf: 80 is Extreme Greed", zoneOf(80) === "Extreme Greed");
check("zoneOf: 100 is Extreme Greed", zoneOf(100) === "Extreme Greed");
check("zoneOf: null -> null", zoneOf(null) === null);

// ---- computeFearGreedSeries: not enough history yet ----
{
  const nifty = series(60, (i) => 100 + i);
  const gold = series(60, (i) => 50 + i * 0.1);
  const r = computeFearGreedSeries(nifty, gold);
  check("short history: latest score is null (fewer than 125 bars)", r.latest.score === null);
  check("short history: bars count matches input", r.bars === 60);
  check("short history: zone is null to match the null score", r.latest.zone === null);
}

// ---- computeFearGreedSeries: flat series on both legs -> neutral ----
{
  const nifty = series(300, () => 100);
  const gold = series(300, () => 50);
  const r = computeFearGreedSeries(nifty, gold);
  check("flat series: no crash, score is a finite number", Number.isFinite(r.latest.score), String(r.latest.score));
  check("flat series: score reads as neutral", r.latest.score === 50, String(r.latest.score));
  check("flat series: zone is Neutral", r.latest.zone === "Neutral", String(r.latest.zone));
}

// A pure constant-rate exponential series is self-similar: the percentile
// framework correctly ranks every day the same (~50th percentile) against
// such a series' own history, since nothing about "today" is unusual
// relative to "always." To exercise the signals meaningfully, these cases
// use a RECENT acceleration/break against an otherwise steady base, so
// today's reading is genuinely unusual relative to its own trailing history
// — the thing percentile-of-own-history is actually meant to catch.

// ---- computeFearGreedSeries: a recent breakout, gold left behind -> greedier ----
{
  const BREAK = 350;
  const nifty = series(400, (i) => i < BREAK ? 100 * Math.exp(0.0003 * i) : 100 * Math.exp(0.0003 * BREAK) * Math.exp(0.004 * (i - BREAK)));
  const gold = series(400, () => 50); // flat throughout
  const r = computeFearGreedSeries(nifty, gold);
  check("recent breakout vs flat gold: score is above neutral", r.latest.score > 50, String(r.latest.score));
  check("recent breakout vs flat gold: momentum ranks high against its own history", r.components.find((c) => c.key === "momentum").percentile > 60, JSON.stringify(r.components.find((c) => c.key === "momentum")));
  check("recent breakout vs flat gold: zone matches zoneOf(score)", r.latest.zone === zoneOf(r.latest.score));
}

// ---- computeFearGreedSeries: a recent crash, gold breaking out -> fear ----
{
  const BREAK = 350;
  const nifty = series(400, (i) => i < BREAK ? 1000 * Math.exp(-0.0003 * i) : 1000 * Math.exp(-0.0003 * BREAK) * Math.exp(-0.005 * (i - BREAK)));
  const gold = series(400, (i) => i < BREAK ? 50 * Math.exp(0.0002 * i) : 50 * Math.exp(0.0002 * BREAK) * Math.exp(0.004 * (i - BREAK)));
  const r = computeFearGreedSeries(nifty, gold);
  check("recent crash vs gold breakout: score reads as fear (well under neutral)", r.latest.score < 40, String(r.latest.score));
  check("recent crash vs gold breakout: safe-haven demand ranks low against its own history", r.components.find((c) => c.key === "safeHaven").percentile < 40, JSON.stringify(r.components.find((c) => c.key === "safeHaven")));
}

// ---- computeFearGreedSeries: components breakdown ----
{
  const nifty = series(300, (i) => 100 * Math.exp(0.001 * i));
  const gold = series(300, (i) => 50 * Math.exp(0.0003 * i));
  const r = computeFearGreedSeries(nifty, gold);
  check("components: one row per signal", r.components.length === SIGNALS.length);
  check("components: every row has a percentile in [0,100]", r.components.every((c) => c.percentile == null || (c.percentile >= 0 && c.percentile <= 100)));
  check("components: contributions sum close to the composite score", Math.abs(r.components.reduce((a, c) => a + (c.contribution || 0), 0) - r.latest.score) <= SIGNALS.length);
}

// ---- computeFearGreedSeries: week/month/year-ago comparisons ----
{
  const nifty = series(500, (i) => 100 * Math.exp(0.0015 * i));
  const gold = series(500, (i) => 50 * Math.exp(0.0004 * i));
  const r = computeFearGreedSeries(nifty, gold);
  check("comparisons: week-ago resolves", r.comparisons.week.score != null, String(r.comparisons.week.score));
  check("comparisons: month-ago resolves", r.comparisons.month.score != null, String(r.comparisons.month.score));
  check("comparisons: year-ago resolves with enough history", r.comparisons.year.score != null, String(r.comparisons.year.score));
  check("comparisons: year-ago zone matches zoneOf(score)", r.comparisons.year.zone === zoneOf(r.comparisons.year.score));
}

{
  const nifty = series(200, (i) => 100 + i); // short of the 365-day lookback
  const gold = series(200, (i) => 50 + i * 0.1);
  const r = computeFearGreedSeries(nifty, gold);
  check("comparisons: year-ago is null, not a wrong number, when history is short", r.comparisons.year.score === null);
}

// ---- computeFearGreedSeries: chart series ----
{
  const nifty = series(500, (i) => 100 + i * 0.3);
  const gold = series(500, (i) => 50 + i * 0.05);
  const r = computeFearGreedSeries(nifty, gold);
  check("chartLong: thinned well below the full bar count", r.chartLong.length < nifty.length, `${r.chartLong.length} of ${nifty.length}`);
  check("chartRecent: capped around the last ~500 bars", r.chartRecent.length <= 500);
  check("chartRecent: every point has a finite score", r.chartRecent.every((p) => Number.isFinite(p.score)));
}

// ---- createFearGreedIndia: handler + caching, mocked fetch (two symbols) ----
(async () => {
  let calls = 0;
  const nifty = series(300, (i) => 100 * Math.exp(0.001 * i));
  const gold = series(300, (i) => 50 * Math.exp(0.0003 * i));
  const toChart = (s) => ({ timestamp: s.map((p) => p.t), indicators: { quote: [{ close: s.map((p) => p.close) }] } });

  const fetchImpl = async (url) => {
    calls++;
    const u = String(url);
    check(`request ${calls}: asks Yahoo for the full-history range`, u.includes("range=max"), u);
    if (u.includes(encodeURIComponent(NIFTY_SYMBOL))) return { ok: true, json: async () => ({ chart: { result: [toChart(nifty)] } }) };
    if (u.includes(encodeURIComponent(GOLD_SYMBOL))) return { ok: true, json: async () => ({ chart: { result: [toChart(gold)] } }) };
    throw new Error("unexpected symbol in " + u);
  };
  const fg = createFearGreedIndia({ fetchImpl });

  const first = await fg.get();
  check("get(): returns a computed fear/greed reading", first.latest.score != null && first.components.length === 4);
  check("get(): fetched both symbols once each", calls === 2, String(calls));

  await fg.get();
  check("get(): second call within cacheMs reuses the cache (no extra fetches)", calls === 2, String(calls));

  // Express-shaped handler smoke test (req/res stand-ins, no real server).
  let jsonBody = null, statusCode = 200;
  const req = {};
  const res = { set: () => {}, status(c) { statusCode = c; return this; }, json(b) { jsonBody = b; } };
  await fg(req, res);
  check("handler: writes a JSON body", jsonBody && jsonBody.latest && jsonBody.latest.score != null, String(statusCode));

  console.log(fails === 0 ? "\nall passed" : `\n${fails} FAILED`);
  process.exit(fails === 0 ? 0 : 1);
})();
