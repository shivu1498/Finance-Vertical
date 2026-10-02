const M = require("../mf-metrics");
let fails = 0;
const near = (name, got, want, tol) => { const ok = got != null && Math.abs(got - want) <= tol; if (!ok) fails++; console.log((ok ? "PASS " : "FAIL ") + name + "  got " + (got == null ? got : got.toFixed(4)) + ", want " + want + " ± " + tol); };
const is = (name, ok, x = "") => { if (!ok) fails++; console.log((ok ? "PASS " : "FAIL ") + name + (x ? "  " + x : "")); };

// 8 years of daily points growing exactly 12% a year (geometric in calendar time)
const start = Date.UTC(2018, 0, 1);
const grow = (g, days, f = (d) => 100 * Math.pow(1 + g, d / 365.25)) => {
  const t = [], v = [];
  for (let d = 0; d <= days; d++) { t.push(start + d * M.DAY); v.push(f(d)); }
  return { t, v };
};
const s12 = grow(0.12, 8 * 365);
near("cagr 3Y on a steady 12% series", M.cagr(s12, 3), 12, 0.02);
near("cagr 5Y on a steady 12% series", M.cagr(s12, 5), 12, 0.02);
is("cagr 10Y is null when only ~8 years exist", M.cagr(s12, 10) === null);
const dd0 = M.maxDrawdown(s12, 5); near("max drawdown of an always-rising series", dd0.pct, 0, 1e-9);
const sip12 = M.sip(s12, 60); near("SIP XIRR on a steady 12% series equals 12%", sip12.xirr, 12, 0.15);
is("SIP invests ~60 monthly instalments", sip12.months >= 58 && sip12.months <= 60, "months=" + sip12.months);
near("SIP value > invested by plausible multiple", sip12.value / sip12.invested, 1.40, 0.15);

// XIRR on a trivial case
near("xirr: -100 then +110 one year later = 10%", M.xirr([{ t: 0, cf: -100 }, { t: M.YEAR, cf: 110 }]) * 100, 10, 1e-6);
near("xirr: loss case -100 then 90 = -10%", M.xirr([{ t: 0, cf: -100 }, { t: M.YEAR, cf: 90 }]) * 100, -10, 1e-6);

// Max drawdown with a known 30% fall (peak 200 -> trough 140), then recovery
const dd = grow(0, 5 * 365, (d) => (d < 1000 ? 100 + d * 0.1 : d < 1100 ? 200 - (d - 1000) * 0.6 : 140 + (d - 1100) * 0.05));
const mdd = M.maxDrawdown(dd, 5);
near("max drawdown finds the -30% fall", mdd.pct, -30, 0.01);
is("drawdown peak/trough dates sit on the right days", Math.round((mdd.troughT - mdd.peakT) / M.DAY) === 100, "days peak->trough = " + Math.round((mdd.troughT - mdd.peakT) / M.DAY));
is("drawdown null for under 3 years of history", M.maxDrawdown(grow(0.1, 2 * 365), 5) === null);

// Sharpe against an independent closed form: alternating returns a±b, daily spacing
const a = 0.0005, b = 0.01, N = 3 * 365 + 30;
const alt = { t: [], v: [] }; let nav = 100;
for (let i = 0; i <= N; i++) { alt.t.push(start + i * M.DAY); alt.v.push(nav); nav *= 1 + a + (i % 2 ? b : -b); }
// window = last 3 years of observations: n returns
const j0 = M.idxAtOrBefore(alt, alt.t[alt.t.length - 1] - 3 * M.YEAR); const n = alt.t.length - 1 - j0;
const rets = []; for (let i = j0 + 1; i < alt.t.length; i++) rets.push(alt.v[i] / alt.v[i - 1] - 1);
const mu = rets.reduce((x, y) => x + y, 0) / n, sd = Math.sqrt(rets.reduce((x, y) => x + (y - mu) ** 2, 0) / (n - 1));
const ppy = n / ((alt.t[alt.t.length - 1] - alt.t[j0]) / M.YEAR);
near("sharpe matches the closed form", M.sharpe(alt, 3), ((mu - M.RISK_FREE / ppy) / sd) * Math.sqrt(ppy), 1e-9);
is("sharpe null on a flat NAV series (zero volatility)", M.sharpe(grow(0, 4 * 365, () => 100), 3) === null);
is("sharpe null with too little history", M.sharpe(grow(0.1, 365), 3) === null);

// Calendar returns on the steady series
const cal = M.calendarReturns(s12, 4);
is("calendar returns: full years are ~12%", cal.filter((c) => !c.ytd).every((c) => Math.abs(c.ret - 12) < 0.2), cal.map((c) => c.year + ":" + c.ret.toFixed(2)).join(" "));
near("period return over 1 year (daily data, so within a day of exact)", M.periodReturn(s12, s12.t[s12.t.length - 1], 1) * 100, 12, 0.1);

// parsing
const parsed = M.toSeries([{ date: "03-01-2024", nav: "10.5" }, { date: "01-01-2024", nav: "10" }, { date: "bad", nav: "1" }, { date: "02-01-2024", nav: "-3" }, { date: "01-01-2024", nav: "10.1" }]);
is("toSeries sorts ascending, drops invalid rows, de-duplicates days", parsed.t.length === 2 && parsed.v[0] === 10.1 && parsed.v[1] === 10.5 && parsed.t[0] < parsed.t[1], JSON.stringify(parsed.v));
is("toSeries reads DD-MM-YYYY correctly", new Date(parsed.t[1]).toISOString().slice(0, 10) === "2024-01-03");

// percentile / score / rating / verdict
const arr = [1, 2, 3, 4, 5];
near("percentile of the best value", M.percentile(5, arr), 90, 1e-9);
near("percentile of the worst value", M.percentile(1, arr), 10, 1e-9);
near("percentile of the median", M.percentile(3, arr), 50, 1e-9);
near("score re-weights when metrics are missing", M.score({ cagr3: 100, cagr5: null, sip: null, sharpe: null, maxdd: null, consistency: null, alpha: null }), 100, 1e-9);
near("score uses the weights", M.score({ cagr3: 100, cagr5: 0, sip: 0, sharpe: 0, maxdd: 0, consistency: 0, alpha: 0 }), 20, 1e-9);
is("weights sum to 100", Object.values(M.WEIGHTS).reduce((x, y) => x + y, 0) === 100);
is("rating thresholds", M.rate(70) === "BUY" && M.rate(69.9) === "HOLD" && M.rate(50) === "HOLD" && M.rate(49.9) === "AVOID");
console.log("verdict samples:\n  " + [M.verdict("BUY", { cagr3: 90, cagr5: 80, sharpe: 20 }), M.verdict("HOLD", { cagr3: 55, cagr5: 60 }), M.verdict("AVOID", { cagr3: 10, maxdd: 20, sharpe: 60 })].join("\n  "));
console.log(fails ? `\n${fails} FAILED` : "\nall passed");
process.exit(fails ? 1 : 0);
