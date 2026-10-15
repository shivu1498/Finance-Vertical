// Unit tests for trend-india.js. No real network: fetchImpl is mocked,
// same pattern as test/nse-index-breadth.test.js.
const { createTrendIndia, computeTrendSeries, percentileOf, quantile, TREND_MARKETS, MARKET_BY_SLUG, HORIZONS } = require("../trend-india");

let fails = 0;
const check = (n, ok, x = "") => { if (!ok) fails++; console.log((ok ? "PASS " : "FAIL ") + n + (x ? "  -> " + x : "")); };

const DAY = 86400;
// `n` daily bars starting at a fixed epoch, closes built from `closeAt(i)`.
function series(n, closeAt, startT = 1_000_000_000) {
  return Array.from({ length: n }, (_, i) => ({ t: startT + i * DAY, close: closeAt(i) }));
}

// ---- TREND_MARKETS ----
check("TREND_MARKETS: every slug is unique", new Set(TREND_MARKETS.map((m) => m.slug)).size === TREND_MARKETS.length);
check("TREND_MARKETS: nifty-50 is in the list", MARKET_BY_SLUG.has("nifty-50"));
check("TREND_MARKETS: every entry has a Yahoo symbol", TREND_MARKETS.every((m) => m.symbol.length > 0));
check("HORIZONS: four trading-day lookbacks", HORIZONS.length === 4);

// ---- percentileOf / quantile ----
check("percentileOf: value at the top", percentileOf([1, 2, 3, 4, 5], 5) === 90, String(percentileOf([1, 2, 3, 4, 5], 5)));
check("percentileOf: value at the bottom", percentileOf([1, 2, 3, 4, 5], 1) === 10, String(percentileOf([1, 2, 3, 4, 5], 1)));
check("percentileOf: empty array -> null", percentileOf([], 5) === null);
check("quantile: median of an odd-length sorted array", quantile([1, 2, 3, 4, 5], 0.5) === 3);
check("quantile: p25 interpolates", Math.abs(quantile([1, 2, 3, 4], 0.25) - 1.75) < 1e-9, String(quantile([1, 2, 3, 4], 0.25)));
check("quantile: empty array -> null", quantile([], 0.5) === null);

// ---- computeTrendSeries: not enough history yet ----
{
  const s = series(50, (i) => 100 + i);
  const r = computeTrendSeries(s);
  check("short history: latest score is null (fewer than 200 bars)", r.latest.score === null);
  check("short history: trend state is 'none'", r.latest.state === "none");
  check("short history: bars count matches input", r.bars === 50);
}

// ---- computeTrendSeries: a strictly rising series ----
// 400 calendar-day-equivalent bars (one per day here, for simplicity) so
// the 1Y return window actually has a base to compare against.
{
  const s = series(400, (i) => 100 + i);
  const r = computeTrendSeries(s);
  check("rising series: latest score is 100 (every signal points up)", r.latest.score === 100, String(r.latest.score));
  check("rising series: trend state is 'up'", r.latest.state === "up");
  check("rising series: off-high is 0 (today is always the new high)", r.latest.offHigh === 0, String(r.latest.offHigh));
  check("rising series: stateSince is set", typeof r.latest.stateSince === "string" && r.latest.stateSince.length > 0);
  check("rising series: 1Y return is positive", r.returns["1Y"] > 0, String(r.returns["1Y"]));
  check("rising series: usual-range score max is 100", r.usualRange.score.max === 100);
}

// ---- computeTrendSeries: a strictly falling series ----
{
  const s = series(400, (i) => 1000 - i);
  const r = computeTrendSeries(s);
  check("falling series: latest score is 0 (every signal points down)", r.latest.score === 0, String(r.latest.score));
  check("falling series: trend state is 'down'", r.latest.state === "down");
  check("falling series: off-high is well below 0", r.latest.offHigh < -10, String(r.latest.offHigh));
  check("falling series: 1Y return is negative", r.returns["1Y"] < 0, String(r.returns["1Y"]));
}

// ---- computeTrendSeries: too little history for a return window yet ----
{
  const s = series(260, (i) => 100 + i); // short of the 365-day 1Y window
  const r = computeTrendSeries(s);
  check("short history: 1Y return is null, not a wrong number", r.returns["1Y"] === null, String(r.returns["1Y"]));
  check("short history: 3M return still resolves", r.returns["3M"] != null, String(r.returns["3M"]));
}

// ---- computeTrendSeries: flat series (no signal, no history crash) ----
{
  const s = series(260, () => 100);
  const r = computeTrendSeries(s);
  check("flat series: off-high is 0 throughout", r.latest.offHigh === 0);
  check("flat series: no crash, score is a finite number", Number.isFinite(r.latest.score), String(r.latest.score));
}

// ---- computeTrendSeries: chart series is thinned, not every bar ----
{
  const s = series(500, (i) => 100 + i);
  const r = computeTrendSeries(s);
  check("chart: thinned well below the full bar count", r.chart.length < s.length, `${r.chart.length} of ${s.length}`);
  check("chart: last point is always included", r.chart.at(-1).t === s.at(-1).t);
}

// ---- createTrendIndia: handler + caching, mocked fetch ----
(async () => {
  let calls = 0;
  const bigSeries = series(260, (i) => 100 + i);
  const timestamp = bigSeries.map((p) => p.t);
  const close = bigSeries.map((p) => p.close);
  const fetchImpl = async (url) => {
    calls++;
    check("request: asks Yahoo for DAILY bars over an explicit window (never range=max, which returns monthly)",
      String(url).includes("interval=1d") && String(url).includes("period1=") && !String(url).includes("range=max"), String(url));
    return { ok: true, json: async () => ({ chart: { result: [{ timestamp, indicators: { quote: [{ close }] } }] } }) };
  };
  const trend = createTrendIndia({ fetchImpl });

  const first = await trend.get("nifty-50");
  check("get(): returns slug/label plus the computed trend", first.slug === "nifty-50" && first.label === "Nifty 50" && first.latest.state === "up");

  await trend.get("nifty-50");
  check("get(): second call within cacheMs reuses the cache (no extra fetch)", calls === 1, String(calls));

  try {
    await trend.get("not-a-real-market");
    check("get(): unknown slug rejects", false);
  } catch (e) {
    check("get(): unknown slug rejects with unknown_market", e.code === "unknown_market" && e.status === 400);
  }

  // Express-shaped handler smoke test (req/res stand-ins, no real server).
  let jsonBody = null, statusCode = 200;
  const req = { params: { slug: "nifty-50" } };
  const res = { set: () => {}, status(c) { statusCode = c; return this; }, json(b) { jsonBody = b; } };
  await trend(req, res);
  check("handler: writes a JSON body for a known slug", jsonBody && jsonBody.slug === "nifty-50", String(statusCode));

  console.log(fails === 0 ? "\nall passed" : `\n${fails} FAILED`);
  process.exit(fails === 0 ? 0 : 1);
})();
