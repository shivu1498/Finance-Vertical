// Unit tests for nse-all-indices.js. No real network: fetchImpl is mocked,
// same pattern as test/nse-announcements.test.js.
const { createNseAllIndices, toCsv, csvCell, num, text, weekPct, FIELDS } = require("../nse-all-indices");
const { PERIODS } = require("../index-returns");

// Keeps the NSE-feed tests focused: no Yahoo history, so every long window
// is blank and only NSE's own figures appear.
const noReturns = { fetchReturns: async () => ({ byName: new Map(), covered: [], missing: [] }) };

let fails = 0;
const check = (n, ok, x = "") => { if (!ok) fails++; console.log((ok ? "PASS " : "FAIL ") + n + (x ? "  -> " + x : "")); };

// ---- num / text ----
check("num: parses a plain number", num(24500.5) === 24500.5);
check("num: parses a numeric string", num("22.54") === 22.54);
check("num: strips thousands separators", num("1,234.5") === 1234.5);
check("num: NSE's '-' placeholder becomes null", num("-") === null);
check("num: empty string becomes null", num("") === null);
check("num: null stays null", num(null) === null);
check("num: junk becomes null", num("n/a") === null);
check("text: trims", text("  NIFTY 50 ") === "NIFTY 50");
check("text: '-' becomes empty", text("-") === "");

// ---- csvCell quoting ----
check("csvCell: plain value is unquoted", csvCell("NIFTY 50") === "NIFTY 50");
check("csvCell: a comma forces quoting", csvCell("Nifty Auto, Ltd") === '"Nifty Auto, Ltd"');
check("csvCell: inner quotes are doubled", csvCell('He said "hi"') === '"He said ""hi"""');
check("csvCell: newline forces quoting", csvCell("a\nb") === '"a\nb"');
check("csvCell: null becomes empty", csvCell(null) === "");

// ---- weekPct ----
check("weekPct: derives from oneWeekAgo", Math.abs(weekPct({ last: 110, oneWeekAgo: 100 }) - 10) < 1e-9, String(weekPct({ last: 110, oneWeekAgo: 100 })));
check("weekPct: null when the base is missing", weekPct({ last: 110 }) === null);
check("weekPct: null when the base is zero (no divide-by-zero)", weekPct({ last: 110, oneWeekAgo: 0 }) === null);

// ---- toCsv ----
{
  const rows = [
    { raw: { index: "NIFTY 50", key: "BROAD MARKET INDICES", last: 24500.123456, percentChange: -0.41, pe: "22.54", yearHigh: 26277.35, advances: "19" }, weekPct: 1.2345678, asOf: "15-Oct-2026 15:30" },
    { raw: { index: "Nifty Auto, Large", key: "SECTORAL INDICES", last: 100, percentChange: "-", pe: "" }, weekPct: null, asOf: "15-Oct-2026 15:30" },
  ];
  const csv = toCsv(rows);
  const lines = csv.split("\n");
  check("toCsv: one header plus one line per row", lines.length === 3, String(lines.length));
  check("toCsv: header starts with Index,Group", lines[0].startsWith("Index,Group"), lines[0]);
  check("toCsv: header ends with the period columns then the timestamp", lines[0].endsWith("10Y %,As Of"), lines[0]);
  check("toCsv: header carries one column per period", PERIODS.every(([l]) => lines[0].includes(`${l} %`)), lines[0]);
  check("toCsv: header column count matches FIELDS + periods + 1", lines[0].split(",").length === FIELDS.length + PERIODS.length + 1, String(lines[0].split(",").length));
  check("toCsv: numbers are rounded to 4dp", lines[1].includes("24500.1235"), lines[1]);
  check("toCsv: a name containing a comma is quoted", lines[2].includes('"Nifty Auto, Large"'), lines[2]);
  check("toCsv: NSE's '-' becomes an empty cell, not a zero", lines[2].split(",").slice(-4).join(",").indexOf("0") !== 0);
  check("toCsv: a row with no history leaves the long windows blank", lines[2].includes(",,"), lines[2]);
  check("toCsv: every row carries the timestamp", lines[1].includes("15-Oct-2026 15:30") && lines[2].includes("15-Oct-2026 15:30"));
}

// ---- createNseAllIndices: cookie priming, caching, errors ----
(async () => {
  function mockFetch(apiResponse, opts = {}) {
    const calls = [];
    const impl = async (url, init) => {
      calls.push({ url: String(url), init });
      if (String(url).endsWith("/")) {
        return {
          ok: true, status: 200,
          headers: { getSetCookie: () => ["nsit=abc123; Path=/", "nseappid=xyz789; Path=/"] },
        };
      }
      return { ok: opts.status ? opts.status < 400 : true, status: opts.status || 200, json: async () => apiResponse };
    };
    return { impl, calls };
  }

  const payload = {
    timestamp: "15-Oct-2026 15:30",
    data: [
      { index: "NIFTY 50", key: "BROAD MARKET INDICES", last: 24500, percentChange: -0.41, oneWeekAgo: 24000 },
      { index: "NIFTY BANK", key: "SECTORAL INDICES", last: 51000, percentChange: 0.3 },
      { index: "", key: "JUNK", last: 1 }, // unnamed row, should be dropped
    ],
  };

  {
    const { impl, calls } = mockFetch(payload);
    const h = createNseAllIndices({ fetchImpl: impl, indexReturns: noReturns });
    const r = await h.get();
    check("get(): primes cookies before hitting the API", calls.length === 2 && calls[0].url.endsWith("/"), JSON.stringify(calls.map((c) => c.url)));
    check("get(): reports which symbols the history layer covered", Array.isArray(r.coverage.covered) && Array.isArray(r.coverage.missing));
    check("get(): replays the cookie on the API call", /nsit=abc123/.test(calls[1].init.headers.Cookie || ""), String(calls[1].init.headers.Cookie));
    check("get(): sends a browser-like User-Agent", /Mozilla/.test(calls[1].init.headers["User-Agent"]));
    check("get(): drops rows with no index name", r.count === 2, String(r.count));
    check("get(): carries NSE's own timestamp", r.asOf === "15-Oct-2026 15:30", r.asOf);
    check("get(): derives the 7-day % where oneWeekAgo exists", Math.abs(r.rows[0].weekPct - 2.0833333) < 1e-4, String(r.rows[0].weekPct));
    check("get(): leaves 7-day % null where it doesn't", r.rows[1].weekPct === null);

    const before = calls.length;
    await h.get();
    check("get(): second call within cacheMs reuses the cache", calls.length === before, String(calls.length));
  }

  // Blocked / rate-limited / unreadable all fail closed with typed errors.
  for (const [status, code] of [[403, "blocked"], [401, "blocked"], [429, "rate_limited"], [500, "upstream"]]) {
    const { impl } = mockFetch(payload, { status });
    const h = createNseAllIndices({ fetchImpl: impl, indexReturns: noReturns });
    try {
      await h.get();
      check(`get(): HTTP ${status} rejects`, false);
    } catch (e) {
      check(`get(): HTTP ${status} rejects with code "${code}"`, e.code === code, e.code);
    }
  }

  {
    const { impl } = mockFetch({ notData: true });
    const h = createNseAllIndices({ fetchImpl: impl, indexReturns: noReturns });
    try {
      await h.get();
      check("get(): an unreadable payload rejects", false);
    } catch (e) {
      check("get(): an unreadable payload rejects with 'unreadable'", e.code === "unreadable", e.code);
    }
  }

  // CSV handler shape.
  {
    const { impl } = mockFetch(payload);
    const h = createNseAllIndices({ fetchImpl: impl, indexReturns: noReturns });
    let body = null, headers = {}, status = 200;
    const res = {
      set(k, v) { if (typeof k === "object") Object.assign(headers, k); else headers[k] = v; return this; },
      status(c) { status = c; return this; },
      send(b) { body = b; },
    };
    await h({ query: {} }, res);
    check("handler: serves text/csv", /text\/csv/.test(headers["Content-Type"] || ""), headers["Content-Type"]);
    check("handler: body is CSV with a header row", String(body).split("\n")[0].startsWith("Index,Group"));
    check("handler: body has one line per surviving index", String(body).split("\n").length === 3, String(String(body).split("\n").length));
    check("handler: returns 200 on success", status === 200);
  }

  // An upstream failure still returns readable CSV, not a parse error.
  {
    const { impl } = mockFetch(payload, { status: 403 });
    const h = createNseAllIndices({ fetchImpl: impl, indexReturns: noReturns });
    let body = null, headers = {}, status = 200;
    const res = {
      set(k, v) { headers[k] = v; return this; },
      status(c) { status = c; return this; },
      send(b) { body = b; },
    };
    await h({ query: {} }, res);
    check("handler: an upstream block returns CSV-shaped error text", String(body).startsWith("Error,Message"), String(body));
    check("handler: an upstream block sets a non-200 status", status === 502, String(status));
  }

  console.log(fails === 0 ? "\nall passed" : `\n${fails} FAILED`);
  process.exit(fails === 0 ? 0 : 1);
})();
