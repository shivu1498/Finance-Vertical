// Market-breadth orchestration: for a list of symbols, counts how many are
// up/down/flat at each of quotes.js's BREADTH_LOOKBACKS (1D/1W/20D/50D/
// 100D/200D), each stock's sign derived from one 2-year-daily-bar Yahoo
// chart fetch (see parseBreadthSigns in quotes.js).
//
// The hard constraint this is built around: a universe like Nifty 500 or
// Nifty Total Market (~500-750 stocks, see nse-index-breadth.js) means
// that many individual Yahoo fetches, and this app's serverless function
// has a hard wall-clock limit (30s, see vercel.json's maxDuration) — there
// is no way to fetch and parse 750 two-year daily-bar responses one
// request at a time inside that window, even on the free endpoint. Two
// things make this workable instead of just timing out every time:
//
//  1. A per-symbol cache shared ACROSS every universe, not scoped to one
//     request. NSE's broader indices are strict supersets of its narrower
//     ones (every Nifty 50 stock is also in Nifty 100, Nifty 200, Nifty
//     500, Nifty Total Market, ...), so once a stock's bars are fetched for
//     one universe they're already warm for every other universe that
//     includes it — the real number of *distinct* symbols across all ~21
//     universes is far smaller than their sizes summed, and each one only
//     gets fetched once per cache TTL, not once per request.
//  2. A wall-clock time budget. Concurrency-capped fetches run until every
//     symbol is covered or the budget runs out; whatever didn't finish is
//     simply left out of the tally. The response always carries
//     `coverage: { checked, total, timedOut }` so the caller can be honest
//     about a partial read rather than silently present it as complete —
//     and because of (1), the next call within the TTL only has to pay for
//     whatever's still missing, so coverage on a huge universe climbs
//     toward complete over a few requests instead of stalling the same way
//     every time.

const { parseBreadthSigns, BREADTH_LOOKBACKS } = require("./quotes");

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

function createBreadthEngine({
  fetchImpl = fetch,
  yahooBase = "https://query1.finance.yahoo.com",
  barsCacheMs = 60 * 60 * 1000, // signs barely change intraday outside today's bar
  concurrency = 12,
  timeBudgetMs = 18_000, // leaves headroom under the 30s function cap
} = {}) {
  const barsCache = new Map(); // yahooSymbol -> { at, signs }

  async function fetchSigns(symbol) {
    const cached = barsCache.get(symbol);
    if (cached && Date.now() - cached.at < barsCacheMs) return cached.signs;

    const url = `${yahooBase}/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=2y`;
    const res = await fetchImpl(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`upstream ${res.status} for ${symbol}`);
    const { signs } = parseBreadthSigns(await res.json(), symbol);
    barsCache.set(symbol, { at: Date.now(), signs });
    return signs;
  }

  // Runs `symbols` through fetchSigns with up to `concurrency` in flight at
  // once, stopping once `timeBudgetMs` elapses (lets whatever's already in
  // flight finish, just doesn't start new work) — a worker-pool loop, so
  // one slow or hung symbol can't stall everything queued behind it the
  // way a single chunked Promise.all would.
  async function computeBreadth(symbols) {
    const t0 = Date.now();
    const counts = {};
    for (const [label] of BREADTH_LOOKBACKS) counts[label] = { adv: 0, dec: 0, flat: 0 };
    let checked = 0;
    let cursor = 0;
    let timedOut = false;

    async function worker() {
      while (cursor < symbols.length) {
        if (Date.now() - t0 > timeBudgetMs) { timedOut = true; return; }
        const symbol = symbols[cursor++];
        try {
          const signs = await fetchSigns(symbol);
          for (const [label] of BREADTH_LOOKBACKS) {
            const s = signs[label];
            if (s == null) continue;
            if (s > 0) counts[label].adv++;
            else if (s < 0) counts[label].dec++;
            else counts[label].flat++;
          }
          checked++;
        } catch {
          // one symbol failing (delisted, rate-limited, bad data) just
          // doesn't count toward any period — never aborts the batch
        }
      }
    }

    const pool = Array.from({ length: Math.max(1, Math.min(concurrency, symbols.length)) }, worker);
    await Promise.all(pool);

    return {
      periods: counts,
      coverage: { checked, total: symbols.length, timedOut },
    };
  }

  return { computeBreadth, fetchSigns, barsCache };
}

module.exports = { createBreadthEngine };
