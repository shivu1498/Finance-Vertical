// Pure mutual-fund analytics over NAV series. No network, no state.
// A series is { t: [ms timestamps ascending], v: [NAV values] }.

const DAY = 86_400_000;
const YEAR = 365.25 * DAY;
const RISK_FREE = 0.065; // annual, used for the Sharpe ratio

// Metric weights for the composite score (they sum to 100).
const WEIGHTS = { cagr3: 20, cagr5: 20, sip: 10, sharpe: 15, maxdd: 15, consistency: 10, alpha: 10 };
const LABELS = {
  cagr3: "3Y returns", cagr5: "5Y returns", sip: "SIP returns", sharpe: "risk-adjusted return",
  maxdd: "downside protection", consistency: "consistency", alpha: "edge over peers",
};

// mfapi.in rows are { date: "DD-MM-YYYY", nav: "123.45" }, newest first.
function toSeries(rows) {
  const pts = [];
  for (const r of rows || []) {
    const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(r.date);
    const nav = parseFloat(r.nav);
    if (!m || !(nav > 0)) continue;
    pts.push([Date.UTC(+m[3], +m[2] - 1, +m[1]), nav]);
  }
  pts.sort((a, b) => a[0] - b[0]);
  const t = [], v = [];
  for (const [ts, nav] of pts) {
    if (t.length && t[t.length - 1] === ts) v[v.length - 1] = nav;
    else { t.push(ts); v.push(nav); }
  }
  return { t, v };
}

// Index of the last observation at or before ts, or -1.
function idxAtOrBefore(s, ts) {
  let lo = 0, hi = s.t.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (s.t[mid] <= ts) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans;
}

// First observation at or after ts, or -1.
function idxAtOrAfter(s, ts) {
  let lo = 0, hi = s.t.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (s.t[mid] >= ts) { ans = mid; hi = mid - 1; } else lo = mid + 1;
  }
  return ans;
}

// NAV at a date, tolerating weekends/holidays (up to 10 days stale).
function navAt(s, ts) {
  const i = idxAtOrBefore(s, ts);
  if (i < 0 || ts - s.t[i] > 10 * DAY) return null;
  return s.v[i];
}

const last = (s) => s.t.length - 1;
const spanYears = (s) => (s.t[last(s)] - s.t[0]) / YEAR;

// Annualised return over the trailing `years`, as a percentage; null if history is too short.
function cagr(s, years) {
  if (s.t.length < 2) return null;
  const target = s.t[last(s)] - years * YEAR;
  if (s.t[0] > target + 7 * DAY) return null;
  const i = Math.max(idxAtOrBefore(s, target), 0);
  const elapsed = (s.t[last(s)] - s.t[i]) / YEAR;
  if (elapsed < years * 0.97) return null;
  return (Math.pow(s.v[last(s)] / s.v[i], 1 / elapsed) - 1) * 100;
}

// Trailing return over `years` ending at ts (not annualised), as a fraction; null if unavailable.
function periodReturn(s, endTs, years) {
  const a = navAt(s, endTs - years * YEAR);
  const b = navAt(s, endTs);
  return a == null || b == null ? null : b / a - 1;
}

function sharpe(s, years = 3) {
  const startTs = s.t[last(s)] - years * YEAR;
  if (s.t[0] > startTs + 7 * DAY) return null;
  const i0 = Math.max(idxAtOrBefore(s, startTs), 0);
  const n = last(s) - i0;
  if (n < 100) return null;
  const rets = [];
  for (let i = i0 + 1; i <= last(s); i++) rets.push(s.v[i] / s.v[i - 1] - 1);
  const span = (s.t[last(s)] - s.t[i0]) / YEAR;
  const ppy = rets.length / span;
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const variance = rets.reduce((a, b) => a + (b - mean) ** 2, 0) / (rets.length - 1);
  const sd = Math.sqrt(variance);
  if (!(sd > 0)) return null;
  return ((mean - RISK_FREE / ppy) / sd) * Math.sqrt(ppy);
}

// Worst peak-to-trough fall over the trailing window, as a negative percentage.
function maxDrawdown(s, years = 5) {
  const startTs = s.t[last(s)] - years * YEAR;
  const i0 = Math.max(idxAtOrBefore(s, startTs), 0);
  if ((s.t[last(s)] - s.t[i0]) / YEAR < 2.9) return null;
  let peak = s.v[i0], peakT = s.t[i0], worst = 0, worstPeakT = peakT, worstTroughT = peakT;
  for (let i = i0; i <= last(s); i++) {
    if (s.v[i] > peak) { peak = s.v[i]; peakT = s.t[i]; }
    const dd = s.v[i] / peak - 1;
    if (dd < worst) { worst = dd; worstPeakT = peakT; worstTroughT = s.t[i]; }
  }
  return { pct: worst * 100, peakT: worstPeakT, troughT: worstTroughT };
}

// Rate r solving sum(cf / (1+r)^(years from first flow)) = 0, by bisection.
function xirr(flows) {
  const t0 = flows[0].t;
  const npv = (r) => flows.reduce((a, f) => a + f.cf / Math.pow(1 + r, (f.t - t0) / YEAR), 0);
  let lo = -0.95, hi = 10;
  if (npv(lo) * npv(hi) > 0) return null;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    npv(lo) * npv(mid) <= 0 ? (hi = mid) : (lo = mid);
  }
  return (lo + hi) / 2;
}

// Monthly SIP over the trailing `months` (needs >= 3 years of history); XIRR as a percentage.
function sip(s, months = 60) {
  const avail = Math.floor(spanYears(s) * 12);
  if (avail < 36) return null;
  const m = Math.min(months, avail);
  const flows = [];
  let units = 0, invested = 0, lastIdx = -1;
  for (let k = m; k >= 1; k--) {
    const i = idxAtOrAfter(s, s.t[last(s)] - k * 30.4375 * DAY);
    if (i < 0 || i === lastIdx) continue;
    lastIdx = i;
    flows.push({ t: s.t[i], cf: -1 });
    units += 1 / s.v[i];
    invested += 1;
  }
  const value = units * s.v[last(s)];
  flows.push({ t: s.t[last(s)], cf: value });
  const r = xirr(flows);
  return r == null ? null : { xirr: r * 100, invested, value, months: flows.length - 1 };
}

// Calendar-year returns for the last `n` years plus year-to-date.
function calendarReturns(s, n = 6) {
  const endYear = new Date(s.t[last(s)]).getUTCFullYear();
  const out = [];
  for (let y = endYear - n + 1; y <= endYear; y++) {
    const startRef = navAt(s, Date.UTC(y - 1, 11, 31));
    const endRef = y === endYear ? s.v[last(s)] : navAt(s, Date.UTC(y, 11, 31));
    if (startRef == null || endRef == null) continue;
    out.push({ year: y, ret: (endRef / startRef - 1) * 100, ytd: y === endYear });
  }
  return out;
}

const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;

// Percentile of v within a sorted ascending array: 0 = worst, 100 = best.
function percentile(v, sorted) {
  let less = 0, equal = 0;
  for (const x of sorted) (x < v ? less++ : x === v && equal++);
  return ((less + equal / 2) / sorted.length) * 100;
}

// Weighted average of per-metric percentiles; missing metrics are dropped and the rest re-weighted.
function score(pcts) {
  let sum = 0, w = 0;
  for (const [k, weight] of Object.entries(WEIGHTS)) {
    if (pcts[k] != null) { sum += pcts[k] * weight; w += weight; }
  }
  return w ? sum / w : null;
}

const rate = (sc) => (sc >= 70 ? "BUY" : sc >= 50 ? "HOLD" : "AVOID");

function verdict(rating, pcts) {
  const ranked = Object.entries(pcts).filter(([, p]) => p != null).sort((a, b) => b[1] - a[1]);
  const strong = ranked.filter(([, p]) => p >= 70).slice(0, 2).map(([k]) => LABELS[k]);
  const weak = ranked.filter(([, p]) => p <= 35).slice(-2).reverse().map(([k]) => LABELS[k]);
  const and = (a) => a.join(" and ");
  if (rating === "BUY") {
    return `Leads its peers on ${strong.length ? and(strong) : "overall quality"}${weak.length ? `; weaker on ${and(weak)}` : ""}.`;
  }
  if (rating === "HOLD") {
    return `Mid-pack: ${strong.length ? `good on ${and(strong)}` : "no standout strength"}${weak.length ? `, weaker on ${and(weak)}` : ""}.`;
  }
  return `Trails peers${weak.length ? `, especially on ${and(weak)}` : ""}.`;
}

module.exports = {
  DAY, YEAR, RISK_FREE, WEIGHTS, LABELS,
  toSeries, idxAtOrBefore, idxAtOrAfter, navAt, cagr, periodReturn, sharpe, maxDrawdown,
  xirr, sip, calendarReturns, mean, percentile, score, rate, verdict,
};
