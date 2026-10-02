const { parseChart } = require("../quotes");
let fails = 0;
const near = (n, got, want, tol = 1e-9) => { const ok = got != null && Math.abs(got - want) <= tol; if (!ok) fails++; console.log((ok ? "PASS " : "FAIL ") + n + `  got ${got}, want ${want}`); };
const is = (n, ok, x = "") => { if (!ok) fails++; console.log((ok ? "PASS " : "FAIL ") + n + (x ? "  " + x : "")); };
const chart = (meta, closes) => ({ chart: { result: [{ meta, indicators: { quote: [{ close: closes }] } }] } });

// day change is measured against the previous session, not the start of the 5-day window
let q = parseChart(chart({ regularMarketPrice: 105.5, chartPreviousClose: 90 }, [100, 102, 101, 103, 105]), "X");
near("change is vs the previous session close (103), not the window start (90)", q.prevClose, 103);
near("day change", q.change, 2.5);
near("day change percent", q.changePercent, (2.5 / 103) * 100, 1e-9);
is("a 5-day-window baseline would have given a very different (wrong) number", Math.abs(((105.5 - 90) / 90) * 100 - q.changePercent) > 10);

// market closed: last close equals the live price, previous is the day before
q = parseChart(chart({ regularMarketPrice: 105, chartPreviousClose: 90 }, [100, 102, 101, 103, 105]), "X");
near("closed market: change vs the day before", q.change, 2);

// null closes (holidays / not yet printed) are ignored
q = parseChart(chart({ regularMarketPrice: 50 }, [48, null, 49, null]), "X");
near("nulls ignored; previous close = last earlier real close", q.prevClose, 48);
near("...and the change follows", q.change, 2);

// only one bar: fall back to the meta fields
q = parseChart(chart({ regularMarketPrice: 10, previousClose: 8, chartPreviousClose: 5 }, [10]), "X");
near("single bar uses meta.previousClose first", q.prevClose, 8);
q = parseChart(chart({ regularMarketPrice: 10, chartPreviousClose: 5 }, [10]), "X");
near("then meta.chartPreviousClose", q.prevClose, 5);

// price missing in meta -> last close
q = parseChart(chart({}, [10, 11, 12]), "X");
near("price falls back to the last close", q.price, 12);
near("previous is the one before it", q.prevClose, 11);

// no previous close at all
q = parseChart(chart({ regularMarketPrice: 7 }, [7]), "X");
is("no previous close gives a zero change instead of NaN", q.change === 0 && q.changePercent === 0 && q.prevClose === null);

// bad responses
for (const [name, body] of [["empty result", { chart: { result: null } }], ["no chart", {}], ["no price anywhere", chart({}, [])]]) {
  let threw = false; try { parseChart(body, "X"); } catch { threw = true; }
  is(`throws on ${name}`, threw);
}
// timestamps decide which bar is "today", so a missing close can't shift the baseline
const D = 86400, base = Date.UTC(2026, 9, 1) / 1000;           // 2026-10-01 00:00 UTC
const withTs = (meta, closes, ts) => ({ chart: { result: [{ meta, timestamp: ts, indicators: { quote: [{ close: closes }] } }] } });
q = parseChart(withTs({ regularMarketPrice: 104, regularMarketTime: base + 2 * D + 3600 }, [100, 102, null], [base, base + D, base + 2 * D]), "X");
near("mid-session, today's bar has no close yet: baseline is yesterday (102), not two days ago", q.prevClose, 102);
q = parseChart(withTs({ regularMarketPrice: 102, regularMarketTime: base + D + 3600 }, [100, 102], [base, base + D]), "X");
near("normal: today's bar present, baseline is the day before (100)", q.prevClose, 100);
q = parseChart(withTs({ regularMarketPrice: 102, regularMarketTime: base + 2 * D + 3600 }, [100, 102], [base, base + D]), "X");
near("no bar for today's session yet: baseline is the last completed close (102)", q.prevClose, 102);
// India (IST, +05:30): the daily bar stamped 03:45 UTC and a quote at 09:00 UTC are the same IST day
const ist = { gmtoffset: 19800 };
q = parseChart(withTs({ ...ist, regularMarketPrice: 51, regularMarketTime: base + D + 9 * 3600 }, [50, 51], [base + 3 * 3600 + 2700, base + D + 3 * 3600 + 2700]), "^NSEI");
near("IST timezone: same-day matching works across the UTC date line", q.prevClose, 50);
q = parseChart(withTs({ ...ist, regularMarketPrice: 51, regularMarketTime: base + D + 20 * 3600 }, [50, 51], [base + 3 * 3600 + 2700, base + D + 3 * 3600 + 2700]), "^NSEI");
near("IST: a quote stamped after UTC midnight still belongs to that IST session? (20:00 UTC = next IST day -> no bar yet)", q.prevClose, 51);
// weekend: the quote is Friday's; Friday's bar is today's session
const fri = Date.UTC(2026, 9, 2) / 1000;
q = parseChart(withTs({ regularMarketPrice: 105, regularMarketTime: fri + 6 * 3600 }, [101, 103, 105], [fri - 2 * D, fri - D, fri]), "X");
near("weekend: baseline is Thursday's close", q.prevClose, 103);

// negative moves and yields
q = parseChart(chart({ regularMarketPrice: 4.2 }, [4.4, 4.3, 4.25]), "^TNX");
near("negative change", q.change, 4.2 - 4.3, 1e-9);
console.log(fails ? `\n${fails} FAILED` : "\nall passed");
process.exit(fails ? 1 : 0);
