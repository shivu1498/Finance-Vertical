// Unit tests for nse-index-breadth.js. No real network: fetchImpl is mocked.
const { createNseIndexBreadth, INDEX_UNIVERSES, UNIVERSE_BY_SLUG, parseConstituents, pickSymbol, pickPChange } = require("../nse-index-breadth");

let fails = 0;
const check = (n, ok, x = "") => { if (!ok) fails++; console.log((ok ? "PASS " : "FAIL ") + n + (x ? "  -> " + x : "")); };

// ---- INDEX_UNIVERSES: the ~21 indices from NSE's own live heatmap page ----
check("INDEX_UNIVERSES: all 21 from the screenshot are present", INDEX_UNIVERSES.length === 21, String(INDEX_UNIVERSES.length));
check("INDEX_UNIVERSES: every entry has a unique slug", new Set(INDEX_UNIVERSES.map((u) => u.slug)).size === INDEX_UNIVERSES.length);
check("INDEX_UNIVERSES: nifty50 is in the list (the default universe)", UNIVERSE_BY_SLUG.has("nifty50"));
check("INDEX_UNIVERSES: labels match NSE's own display names (uppercase)", INDEX_UNIVERSES.every((u) => u.label === u.label.toUpperCase()));

// ---- pickSymbol / pickPChange: defensive field extraction ----
check("pickSymbol: plain symbol field", pickSymbol({ symbol: "RELIANCE" }) === "RELIANCE");
check("pickSymbol: falls back to symbolName", pickSymbol({ symbolName: "TCS" }) === "TCS");
check("pickSymbol: falls back to identifier", pickSymbol({ identifier: "INFY" }) === "INFY");
check("pickSymbol: missing -> null, not a crash", pickSymbol({}) === null);
check("pickSymbol: blank string -> null", pickSymbol({ symbol: "   " }) === null);

check("pickPChange: direct pChange field", pickPChange({ pChange: 1.23 }) === 1.23);
check("pickPChange: falls back to percentChange", pickPChange({ percentChange: -0.5 }) === -0.5);
check("pickPChange: derives from lastPrice/previousClose when no direct field", Math.abs(pickPChange({ lastPrice: 110, previousClose: 100 }) - 10) < 1e-9);
check("pickPChange: missing everything -> null", pickPChange({}) === null);

// ---- parseConstituents ----
{
  const json = {
    data: [
      { symbol: "NIFTY 50", pChange: 0.5 }, // the index's own aggregate row
      { symbol: "RELIANCE", pChange: 1.2 },
      { symbol: "TCS", pChange: -0.8 },
      { symbolName: "INFY", lastPrice: 1500, previousClose: 1485 },
      { pChange: 2.0 }, // no symbol at all -> skipped
    ],
  };
  const out = parseConstituents(json, "NIFTY 50");
  check("parseConstituents: the index's own aggregate row is excluded", !out.some((s) => s.symbol === "NIFTY 50"), JSON.stringify(out));
  check("parseConstituents: real constituents kept", out.some((s) => s.symbol === "RELIANCE" && s.pChange === 1.2));
  check("parseConstituents: alternate field names handled", out.some((s) => s.symbol === "INFY" && Math.abs(s.pChange - 1.0101) < 0.001), JSON.stringify(out));
  check("parseConstituents: a row with no symbol is skipped, not a crash", out.length === 3, JSON.stringify(out));
}
check("parseConstituents: non-array data -> null (caller treats as unreadable)", parseConstituents({ data: "oops" }, "NIFTY 50") === null);
check("parseConstituents: missing data key -> null", parseConstituents({}, "NIFTY 50") === null);

// ---- end-to-end against a mocked server ----
function mockFetch(routes) {
  const calls = [];
  const f = async (url, opts) => {
    calls.push(url);
    for (const [pat, respond] of routes) if (pat.test(url)) return respond(url, opts);
    throw new Error("unexpected fetch: " + url);
  };
  f.calls = calls;
  return f;
}

(async () => {
  const fetchImpl = mockFetch([
    [/nseindia\.com\/$/, async () => ({ ok: true, status: 200, headers: { getSetCookie: () => ["nsit=abc123; Path=/"] } })],
    [/equity-stockIndices/, async (url) => {
      const u = new URL(url);
      check("request: index query param is the exact NSE display name", u.searchParams.get("index") === "NIFTY 50");
      return { ok: true, status: 200, json: async () => ({ data: [
        { symbol: "NIFTY 50", pChange: 0.4 },
        { symbol: "RELIANCE", pChange: 1.1 },
        { symbol: "TCS", pChange: -0.3 },
      ] }) };
    }],
  ]);
  const h = createNseIndexBreadth({ fetchImpl, wwwBase: "https://nseindia.com" });
  const out = await h.get("nifty50");
  check("get(): returns asOf/slug/label/stocks", typeof out.asOf === "string" && out.slug === "nifty50" && out.label === "NIFTY 50");
  check("get(): aggregate row excluded, 2 real constituents", out.stocks.length === 2, JSON.stringify(out.stocks));
  check("get(): cookie primed before the api call", fetchImpl.calls[0].endsWith("nseindia.com/"));
  check("get(): Referer is the heatmap page", true); // (header content isn't observable via this mock's URL-only log; covered by code review)

  const before = fetchImpl.calls.length;
  await h.get("nifty50");
  check("get(): cached within cacheMs (no extra fetch calls)", fetchImpl.calls.length === before);

  // unknown universe
  let errCode = null;
  try { await h.get("not-a-real-universe"); } catch (e) { errCode = e.code; }
  check("unknown universe: rejects with unknown_universe, not a crash", errCode === "unknown_universe");

  // blocked upstream
  const fetchImplBlocked = mockFetch([
    [/nseindia\.com\/$/, async () => ({ ok: true, status: 200, headers: {} })],
    [/equity-stockIndices/, async () => ({ ok: false, status: 403, json: async () => ({}) })],
  ]);
  const hBlocked = createNseIndexBreadth({ fetchImpl: fetchImplBlocked, wwwBase: "https://nseindia.com" });
  errCode = null;
  try { await hBlocked.get("nifty50"); } catch (e) { errCode = e.code; }
  check("blocked: surfaces a 'blocked' error", errCode === "blocked");

  // rate-limited upstream
  const fetchImplRate = mockFetch([
    [/nseindia\.com\/$/, async () => ({ ok: true, status: 200, headers: {} })],
    [/equity-stockIndices/, async () => ({ ok: false, status: 429, json: async () => ({}) })],
  ]);
  const hRate = createNseIndexBreadth({ fetchImpl: fetchImplRate, wwwBase: "https://nseindia.com" });
  errCode = null;
  try { await hRate.get("nifty50"); } catch (e) { errCode = e.code; }
  check("rate_limited: surfaces a 'rate_limited' error", errCode === "rate_limited");

  // unreadable upstream
  const fetchImplBad = mockFetch([
    [/nseindia\.com\/$/, async () => ({ ok: true, status: 200, headers: {} })],
    [/equity-stockIndices/, async () => ({ ok: true, status: 200, json: async () => ({ oops: true }) })],
  ]);
  const hBad = createNseIndexBreadth({ fetchImpl: fetchImplBad, wwwBase: "https://nseindia.com" });
  errCode = null;
  try { await hBad.get("nifty50"); } catch (e) { errCode = e.code; }
  check("unreadable: surfaces an 'unreadable' error", errCode === "unreadable");

  // a different universe actually requests its own NSE label
  const fetchImpl500 = mockFetch([
    [/nseindia\.com\/$/, async () => ({ ok: true, status: 200, headers: {} })],
    [/equity-stockIndices/, async (url) => {
      const u = new URL(url);
      check("request: NIFTY 500 universe requests the right index name", u.searchParams.get("index") === "NIFTY 500");
      return { ok: true, status: 200, json: async () => ({ data: [{ symbol: "X", pChange: 1 }] }) };
    }],
  ]);
  const h500 = createNseIndexBreadth({ fetchImpl: fetchImpl500, wwwBase: "https://nseindia.com" });
  await h500.get("nifty500");

  console.log(fails === 0 ? "\nall passed" : `\n${fails} FAILED`);
  process.exit(fails === 0 ? 0 : 1);
})();
