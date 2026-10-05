// Unit tests for nse-sector-indices.js. No real network: fetchImpl is mocked.
const { createNseSectorIndices, normalize, pickSectors, isSectoral, SECTORS } = require("../nse-sector-indices");

let fails = 0;
const check = (n, ok, x = "") => { if (!ok) fails++; console.log((ok ? "PASS " : "FAIL ") + n + (x ? "  -> " + x : "")); };

// ---- normalize ----
check("normalize: strips NIFTY prefix", normalize("NIFTY BANK") === "BANK");
check("normalize: strips INDEX suffix word", normalize("NIFTY AUTO INDEX") === "AUTO");
check("normalize: strips non-letters (spaces, &, -)", normalize("NIFTY PVT BANK") === "PVTBANK" && normalize("NIFTY OIL & GAS") === "OILGAS");
check("normalize: null/undefined -> empty string", normalize(null) === "" && normalize(undefined) === "");

// ---- isSectoral ----
check("isSectoral: tags a SECTORAL INDICES row", isSectoral({ key: "SECTORAL INDICES" }));
check("isSectoral: rejects BROAD MARKET INDICES", !isSectoral({ key: "BROAD MARKET INDICES" }));
check("isSectoral: rejects a row with no key", !isSectoral({}));

// ---- pickSectors: order matters (specific before generic), unmatched omitted, used-once ----
const rowsAll = [
  { index: "NIFTY BANK", percentChange: 0.5, pe: 15.2 },
  { index: "NIFTY PSU BANK", percentChange: -1.2, pe: 8.1 },
  { index: "NIFTY PRIVATE BANK", percentChange: 0.3, pe: 17.4 },
  { index: "NIFTY AUTO", percentChange: 1.1, pe: 22.0 },
  { index: "NIFTY IT", percentChange: -0.8, pe: 28.5 },
  { index: "NIFTY FMCG", percentChange: 0.2, pe: 45.0 },
  { index: "NIFTY MEDIA", percentChange: 2.5, pe: 30.1 },
  { index: "NIFTY MIDCAP 100", percentChange: 0.9, pe: 25.0 }, // not in SECTORS, should be ignored
];
const picked = pickSectors(rowsAll);
check("pickSectors: PSU Bank matched to its own label, not swallowed by generic Bank", picked.find((p) => p.label === "PSU Banks")?.pct === -1.2);
check("pickSectors: Pvt Bank matched to its own label", picked.find((p) => p.label === "Pvt Bank")?.pct === 0.3);
check("pickSectors: generic Bank still gets its own row (not reused for PSU/Pvt)", picked.find((p) => p.label === "Bank")?.pct === 0.5);
check("pickSectors: each NSE row used at most once", new Set(picked.map((p) => p.name)).size === picked.length);
check("pickSectors: Auto/IT/FMCG/Media all matched", ["Auto", "IT", "FMCG", "Media"].every((l) => picked.some((p) => p.label === l)));
check("pickSectors: an index with no matching label (Midcap 100) contributes nothing extra", picked.length === 7, JSON.stringify(picked.map((p) => p.label)));

check("pickSectors: unmatched sector is simply omitted, not a crash", (() => {
  const out = pickSectors([{ index: "NIFTY BANK", percentChange: 1, pe: 10 }]);
  return out.length === 1 && out[0].label === "Bank" && SECTORS.some((s) => s.label === "Capital Mkts") && !out.some((p) => p.label === "Capital Mkts");
})());

check("pickSectors: non-finite pe/pct become null rather than NaN", (() => {
  const out = pickSectors([{ index: "NIFTY AUTO", percentChange: "—", pe: "—" }]);
  return out.length === 1 && out[0].pct === null && out[0].pe === null;
})());

check("pickSectors: empty input -> empty output", pickSectors([]).length === 0);

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
    [/allIndices/, async () => ({ ok: true, status: 200, json: async () => ({
      data: [
        { key: "BROAD MARKET INDICES", index: "NIFTY 50", percentChange: 0.4, pe: 23.0 },
        { key: "SECTORAL INDICES", index: "NIFTY BANK", percentChange: 0.5, pe: 15.2 },
        { key: "SECTORAL INDICES", index: "NIFTY PSU BANK", percentChange: -1.2, pe: 8.1 },
        { key: "SECTORAL INDICES", index: "NIFTY IT", percentChange: -0.8, pe: 28.5 },
      ],
    }) })],
  ]);

  const h = createNseSectorIndices({ fetchImpl, wwwBase: "https://nseindia.com" });
  const out = await h.get();
  check("get(): returns asOf + sectors", typeof out.asOf === "string" && Array.isArray(out.sectors));
  check("get(): broad-market row (NIFTY 50) excluded from sectors", !out.sectors.some((s) => s.name === "NIFTY 50"), JSON.stringify(out.sectors));
  check("get(): sectoral rows included with real pct+pe", out.sectors.find((s) => s.label === "Bank")?.pe === 15.2);
  check("get(): cookie was primed before the api call", fetchImpl.calls[0].endsWith("nseindia.com/"));

  const before = fetchImpl.calls.length;
  await h.get();
  check("get(): cached within cacheMs (no extra fetch calls)", fetchImpl.calls.length === before);

  // blocked upstream
  const fetchImplBlocked = mockFetch([
    [/nseindia\.com\/$/, async () => ({ ok: true, status: 200, headers: {} })],
    [/allIndices/, async () => ({ ok: false, status: 403, json: async () => ({}) })],
  ]);
  const hBlocked = createNseSectorIndices({ fetchImpl: fetchImplBlocked, wwwBase: "https://nseindia.com" });
  let errCode = null;
  try { await hBlocked.get(); } catch (e) { errCode = e.code; }
  check("blocked: surfaces a 'blocked' error", errCode === "blocked");

  // rate-limited upstream
  const fetchImplRate = mockFetch([
    [/nseindia\.com\/$/, async () => ({ ok: true, status: 200, headers: {} })],
    [/allIndices/, async () => ({ ok: false, status: 429, json: async () => ({}) })],
  ]);
  const hRate = createNseSectorIndices({ fetchImpl: fetchImplRate, wwwBase: "https://nseindia.com" });
  errCode = null;
  try { await hRate.get(); } catch (e) { errCode = e.code; }
  check("rate_limited: surfaces a 'rate_limited' error", errCode === "rate_limited");

  // unreadable upstream (not JSON shaped as expected)
  const fetchImplBad = mockFetch([
    [/nseindia\.com\/$/, async () => ({ ok: true, status: 200, headers: {} })],
    [/allIndices/, async () => ({ ok: true, status: 200, json: async () => ({ oops: true }) })],
  ]);
  const hBad = createNseSectorIndices({ fetchImpl: fetchImplBad, wwwBase: "https://nseindia.com" });
  errCode = null;
  try { await hBad.get(); } catch (e) { errCode = e.code; }
  check("unreadable: surfaces an 'unreadable' error", errCode === "unreadable");

  // defensive fallback: no row tagged SECTORAL, matches across all rows instead
  const fetchImplNoKey = mockFetch([
    [/nseindia\.com\/$/, async () => ({ ok: true, status: 200, headers: {} })],
    [/allIndices/, async () => ({ ok: true, status: 200, json: async () => ({
      data: [{ index: "NIFTY AUTO", percentChange: 1.5, pe: 20.0 }],
    }) })],
  ]);
  const hNoKey = createNseSectorIndices({ fetchImpl: fetchImplNoKey, wwwBase: "https://nseindia.com" });
  const outNoKey = await hNoKey.get();
  check("fallback: matches across all rows when none is tagged SECTORAL", outNoKey.sectors.some((s) => s.label === "Auto"), JSON.stringify(outNoKey.sectors));

  console.log(fails === 0 ? "\nall passed" : `\n${fails} FAILED`);
  process.exit(fails === 0 ? 0 : 1);
})();
