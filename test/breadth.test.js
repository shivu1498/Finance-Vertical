// Unit tests for breadth.js. No real network: fetchImpl is mocked.
const { createBreadthEngine } = require("../breadth");

let fails = 0;
const check = (n, ok, x = "") => { if (!ok) fails++; console.log((ok ? "PASS " : "FAIL ") + n + (x ? "  -> " + x : "")); };

// A Yahoo chart response with `n` rising daily bars (so every lookback the
// symbol has enough history for reads "up").
function risingChart(n) {
  const closes = Array.from({ length: n }, (_, i) => 100 + i);
  return { chart: { result: [{ meta: { regularMarketPrice: closes[n - 1] + 1 }, indicators: { quote: [{ close: closes }] } }] } };
}
function fallingChart(n) {
  const closes = Array.from({ length: n }, (_, i) => 500 - i);
  return { chart: { result: [{ meta: { regularMarketPrice: closes[n - 1] - 1 }, indicators: { quote: [{ close: closes }] } }] } };
}

function mockFetch(fn) {
  const calls = [];
  const f = async (url, opts) => { calls.push(url); return fn(url, opts); };
  f.calls = calls;
  return f;
}

(async () => {
  // ---- basic tally: some up, some down ----
  {
    let n = 0;
    const fetchImpl = mockFetch(async () => {
      n++;
      const body = n % 2 === 0 ? fallingChart(250) : risingChart(250);
      return { ok: true, json: async () => body };
    });
    const engine = createBreadthEngine({ fetchImpl, concurrency: 4, timeBudgetMs: 5000 });
    const { periods, coverage } = await engine.computeBreadth(["A.NS", "B.NS", "C.NS", "D.NS"]);
    check("tally: 2 up, 2 down on 1D", periods["1D"].adv === 2 && periods["1D"].dec === 2, JSON.stringify(periods["1D"]));
    check("tally: same split holds for every lookback (same series shape)", periods["200D"].adv === 2 && periods["200D"].dec === 2);
    check("coverage: all 4 symbols checked, not timed out", coverage.checked === 4 && coverage.total === 4 && coverage.timedOut === false, JSON.stringify(coverage));
  }

  // ---- a symbol that errors doesn't abort the batch or get tallied ----
  {
    const fetchImpl = mockFetch(async (url) => {
      if (url.includes("BAD")) return { ok: false, status: 500 };
      return { ok: true, json: async () => risingChart(250) };
    });
    const engine = createBreadthEngine({ fetchImpl, concurrency: 3, timeBudgetMs: 5000 });
    const { periods, coverage } = await engine.computeBreadth(["A.NS", "BAD.NS", "C.NS"]);
    check("one bad symbol: the other two still get fetched and tallied", periods["1D"].adv === 2, JSON.stringify(periods["1D"]));
    check("one bad symbol: coverage.checked reflects only the successes", coverage.checked === 2 && coverage.total === 3, JSON.stringify(coverage));
  }

  // ---- time budget: stops launching new fetches once it's elapsed ----
  {
    let started = 0;
    const fetchImpl = mockFetch(async () => {
      started++;
      await new Promise((r) => setTimeout(r, 30)); // each fetch takes a little while
      return { ok: true, json: async () => risingChart(250) };
    });
    const manySymbols = Array.from({ length: 50 }, (_, i) => `S${i}.NS`);
    const engine = createBreadthEngine({ fetchImpl, concurrency: 5, timeBudgetMs: 60 }); // budget expires well before all 50 finish
    const { coverage } = await engine.computeBreadth(manySymbols);
    check("time budget: fewer than all symbols got checked", coverage.checked < 50, `checked=${coverage.checked}`);
    check("time budget: timedOut is reported", coverage.timedOut === true);
    check("time budget: coverage.total still reflects the full request", coverage.total === 50);
  }

  // ---- shared cache: a symbol fetched once is reused across calls (the
  // cross-universe superset trick this module is built around) ----
  {
    let fetchCount = 0;
    const fetchImpl = mockFetch(async () => { fetchCount++; return { ok: true, json: async () => risingChart(250) }; });
    const engine = createBreadthEngine({ fetchImpl, concurrency: 4, timeBudgetMs: 5000, barsCacheMs: 60_000 });
    await engine.computeBreadth(["A.NS", "B.NS"]); // e.g. "Nifty 50" universe
    const afterFirst = fetchCount;
    await engine.computeBreadth(["A.NS", "B.NS", "C.NS"]); // e.g. "Nifty 100" (a superset)
    check("shared cache: overlapping symbols (A, B) are not re-fetched", fetchCount === afterFirst + 1, `fetchCount=${fetchCount}, afterFirst=${afterFirst}`);
  }

  // ---- empty symbol list ----
  {
    const fetchImpl = mockFetch(async () => ({ ok: true, json: async () => risingChart(250) }));
    const engine = createBreadthEngine({ fetchImpl });
    const { coverage, periods } = await engine.computeBreadth([]);
    check("empty universe: no crash, coverage is 0/0", coverage.checked === 0 && coverage.total === 0);
    check("empty universe: every period still present with zero counts", periods["1D"].adv === 0 && periods["1D"].dec === 0);
  }

  console.log(fails === 0 ? "\nall passed" : `\n${fails} FAILED`);
  process.exit(fails === 0 ? 0 : 1);
})();
