// Unit tests for index-returns.js and the way its figures merge into the
// CSV feed. No real network: fetchImpl is mocked.
const { createIndexReturns, computeReturns, normalizeName, PERIODS } = require("../index-returns");
const { toCsv } = require("../nse-all-indices");

let fails = 0;
const check = (n, ok, x = "") => { if (!ok) fails++; console.log((ok ? "PASS " : "FAIL ") + n + (x ? "  -> " + x : "")); };

const DAY = 86400;
const NOW = 1_800_000_000;
// `days` of daily bars ending today, priced by closeAt(daysAgo).
function backSeries(days, closeAt) {
  return Array.from({ length: days }, (_, i) => ({ t: NOW - (days - 1 - i) * DAY, close: closeAt(days - 1 - i) }));
}

// ---- PERIODS ----
check("PERIODS: covers all 13 requested windows", PERIODS.length === 13, String(PERIODS.length));
check("PERIODS: 12M and 1Y are the same window by definition",
  PERIODS.find((p) => p[0] === "12M")[1] === PERIODS.find((p) => p[0] === "1Y")[1]);
check("PERIODS: windows increase in length", PERIODS.every((p, i) => i === 0 || p[1] >= PERIODS[i - 1][1]));

// ---- normalizeName ----
check("normalizeName: uppercases and collapses spaces", normalizeName("  Nifty   50 ") === "NIFTY 50");
check("normalizeName: null-safe", normalizeName(null) === "");

// ---- computeReturns ----
{
  // Exactly +1% per day compounding, 11 years of bars.
  const s = backSeries(4200, (ago) => 100 * Math.pow(1.0005, 4200 - ago));
  const r = computeReturns(s, NOW);
  check("computeReturns: every period resolves with deep history", PERIODS.every(([l]) => r[l] !== null), JSON.stringify(r));
  check("computeReturns: a rising series is positive over every window", PERIODS.every(([l]) => r[l] > 0));
  check("computeReturns: longer windows show bigger gains", r["10Y"] > r["5Y"] && r["5Y"] > r["1Y"] && r["1Y"] > r["1M"], `10Y ${r["10Y"].toFixed(1)} > 5Y ${r["5Y"].toFixed(1)} > 1Y ${r["1Y"].toFixed(1)}`);
  check("computeReturns: 12M equals 1Y", r["12M"] === r["1Y"]);
}
{
  // Only ~2 years of history: the long windows must be blank, not wrong.
  const s = backSeries(500, (ago) => 100 + (500 - ago) * 0.1);
  const r = computeReturns(s, NOW);
  check("computeReturns: 1Y resolves with 2y of bars", r["1Y"] !== null, String(r["1Y"]));
  check("computeReturns: 5Y is null, not computed off the oldest bar", r["5Y"] === null, String(r["5Y"]));
  check("computeReturns: 10Y is null too", r["10Y"] === null);
}
{
  const s = backSeries(400, () => 250);
  const r = computeReturns(s, NOW);
  check("computeReturns: a flat series returns 0, not null", r["1M"] === 0 && r["6M"] === 0);
}
check("computeReturns: an empty series yields no periods", Object.keys(computeReturns([], NOW)).length === 0);

// ---- merge precedence in the CSV ----
{
  const header = (csv) => csv.split("\n")[0].split(",");
  const cellOf = (csv, label) => {
    const h = header(csv), row = csv.split("\n")[1].split(",");
    return row[h.indexOf(`${label} %`)];
  };

  // NSE publishes 1D/1M/1Y; history offers conflicting values for those plus
  // the windows NSE lacks.
  const row = {
    raw: { index: "NIFTY 50", key: "BROAD MARKET INDICES", last: 100, percentChange: -0.4, perChange30d: -3.3, perChange365d: -9 },
    returns: { "1D": 99, "15D": 1.5, "1M": 99, "3M": -5.1, "6M": 7.2, "9M": 3.3, "12M": 99, "1Y": 99, "2Y": 22, "3Y": 31, "5Y": 88, "7Y": 120, "10Y": 240 },
    weekPct: null,
    asOf: "15-Oct-2026 15:30",
  };
  const csv = toCsv([row]);
  check("merge: NSE's own 1D wins over computed history", cellOf(csv, "1D") === "-0.4", cellOf(csv, "1D"));
  check("merge: NSE's own 1M wins", cellOf(csv, "1M") === "-3.3", cellOf(csv, "1M"));
  check("merge: NSE's own 1Y wins", cellOf(csv, "1Y") === "-9", cellOf(csv, "1Y"));
  check("merge: NSE's own 365d figure also fills 12M", cellOf(csv, "12M") === "-9", cellOf(csv, "12M"));
  check("merge: history fills 3M, which NSE doesn't publish", cellOf(csv, "3M") === "-5.1", cellOf(csv, "3M"));
  check("merge: history fills 10Y", cellOf(csv, "10Y") === "240", cellOf(csv, "10Y"));

  // An index with no Yahoo symbol keeps NSE's three and blanks the rest.
  const bare = { raw: { index: "NIFTY WAVES", key: "THEMATIC INDICES", last: 50, percentChange: 0.5, perChange30d: 2.9, perChange365d: -6 }, returns: null, weekPct: null, asOf: "x" };
  const csv2 = toCsv([bare]);
  check("merge: an uncovered index keeps NSE's 1D", cellOf(csv2, "1D") === "0.5");
  check("merge: an uncovered index leaves 3M blank", cellOf(csv2, "3M") === "", `"${cellOf(csv2, "3M")}"`);
  check("merge: an uncovered index leaves 10Y blank", cellOf(csv2, "10Y") === "", `"${cellOf(csv2, "10Y")}"`);
}

// ---- buildHistoryCsv: the wide daily table ----
{
  const { buildHistoryCsv, toIsoDay } = require("../index-returns");
  const spine = backSeries(10, (ago) => 100 + ago);          // NIFTY 50
  const partial = spine.slice(3).map((p) => ({ ...p, close: 50 })); // starts later
  const csv = buildHistoryCsv({ "NIFTY 50": spine, "NIFTY IT": partial }, "NIFTY 50");
  const lines = csv.split("\n");

  check("history: header is Date plus one column per index", lines[0] === "Date,NIFTY 50,NIFTY IT", lines[0]);
  check("history: one row per spine bar", lines.length === spine.length + 1, String(lines.length));
  check("history: dates are ISO so Sheets parses them", /^\d{4}-\d{2}-\d{2},/.test(lines[1]), lines[1]);
  check("history: a column with no bar that day is blank, not shifted", lines[1].endsWith(","), lines[1]);
  check("history: the later-starting column fills in once it begins", lines.at(-1).split(",")[2] === "50", lines.at(-1));
  check("history: rows run oldest to newest", lines[1].split(",")[0] < lines.at(-1).split(",")[0]);
  check("history: an empty spine degrades to a header only", buildHistoryCsv({}, "NIFTY 50") === "Date\n");
  check("toIsoDay: converts an epoch second to yyyy-mm-dd", /^\d{4}-\d{2}-\d{2}$/.test(toIsoDay(NOW)));
}

// ---- createIndexReturns: one dead symbol never poisons the others ----
(async () => {
  const good = backSeries(3000, (ago) => 100 * Math.pow(1.0004, 3000 - ago));
  const chart = (s) => ({ chart: { result: [{ timestamp: s.map((p) => p.t), indicators: { quote: [{ close: s.map((p) => p.close) }] } }] } });

  let calls = 0;
  const fetchImpl = async (url) => {
    calls++;
    if (String(url).includes("DEAD")) return { ok: false, status: 404 };
    return { ok: true, status: 200, json: async () => chart(good) };
  };

  const ir = createIndexReturns({ fetchImpl, symbols: { "NIFTY 50": "^NSEI", "NIFTY BANK": "^NSEBANK", "NIFTY GHOST": "^DEAD" } });
  const r = await ir.fetchReturns();

  check("createIndexReturns: fetches every mapped symbol", calls === 3, String(calls));
  check("createIndexReturns: live symbols produce returns", r.byName.get("NIFTY 50") && r.byName.get("NIFTY BANK"));
  check("createIndexReturns: a dead symbol is simply absent, not an exception", !r.byName.has("NIFTY GHOST"));
  check("createIndexReturns: coverage lists what worked", r.covered.length === 2 && r.missing.length === 1, JSON.stringify(r));

  const before = calls;
  await ir.fetchReturns();
  check("createIndexReturns: caches between calls", calls === before, String(calls));

  console.log(fails === 0 ? "\nall passed" : `\n${fails} FAILED`);
  process.exit(fails === 0 ? 0 : 1);
})();
