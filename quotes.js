// Turns a Yahoo Finance v8 "chart" response into a quote with a correct day change.
//
// With range=5d, meta.chartPreviousClose is the close from *before the window*
// (about a week ago), not yesterday's. The previous session's close is the
// second-to-last daily close, so the change is measured against that.
// Close of the session before the one the live price belongs to. Uses the bar
// timestamps so a missing close on today's bar can't shift the baseline a day.
function previousSessionClose(result, meta, closes) {
  const raw = result.indicators?.quote?.[0]?.close || [];
  const ts = result.timestamp || [];
  const rt = meta.regularMarketTime;
  const lastFinite = (from) => {
    for (let j = from; j >= 0; j--) if (Number.isFinite(raw[j])) return raw[j];
    return undefined;
  };

  if (Number.isFinite(rt) && ts.length === raw.length && ts.length) {
    const off = meta.gmtoffset || 0;
    const dayOf = (t) => Math.floor((t + off) / 86400);
    let sessionIdx = -1;
    for (let i = ts.length - 1; i >= 0; i--) {
      if (dayOf(ts[i]) === dayOf(rt)) { sessionIdx = i; break; }
    }
    const prev = sessionIdx >= 0 ? lastFinite(sessionIdx - 1) : lastFinite(raw.length - 1);
    if (prev !== undefined) return prev;
  }
  if (closes.length >= 2) return closes[closes.length - 2];
  return meta.previousClose ?? meta.chartPreviousClose;
}

function parseChart(json, symbol) {
  const result = json?.chart?.result?.[0];
  if (!result) throw new Error(`no data for ${symbol}`);
  const meta = result.meta || {};
  const closes = (result.indicators?.quote?.[0]?.close || []).filter(Number.isFinite);

  const price = Number.isFinite(meta.regularMarketPrice) ? meta.regularMarketPrice : closes.at(-1);
  if (!Number.isFinite(price)) throw new Error(`no price for ${symbol}`);

  const prevClose = previousSessionClose(result, meta, closes);
  const change = Number.isFinite(prevClose) ? price - prevClose : 0;
  const changePercent = prevClose ? (change / prevClose) * 100 : 0;

  return {
    symbol,
    price,
    prevClose: Number.isFinite(prevClose) ? prevClose : null,
    change,
    changePercent,
    currency: meta.currency,
    marketState: meta.marketState,
    name: meta.symbol,
  };
}

// 1D reuses previousSessionClose's session-boundary logic (handles weekends/
// holidays correctly); the longer windows just walk back by calendar days to
// the last close on or before that cutoff — good enough for a period-return
// figure, and far simpler than counting trading days.
const PERIODS = [
  ["1D", 1],
  ["1W", 7],
  ["1M", 30],
  ["3M", 91],
  ["6M", 182],
  ["1Y", 365],
];

// Turns a Yahoo "chart" response (expects a wide range, e.g. 2y of daily
// bars) into % change over each of PERIODS, all from the one fetch.
function parsePeriods(json, symbol) {
  const result = json?.chart?.result?.[0];
  if (!result) throw new Error(`no data for ${symbol}`);
  const meta = result.meta || {};
  const ts = result.timestamp || [];
  const raw = result.indicators?.quote?.[0]?.close || [];
  const closes = raw.filter(Number.isFinite);

  const price = Number.isFinite(meta.regularMarketPrice) ? meta.regularMarketPrice : closes.at(-1);
  if (!Number.isFinite(price)) throw new Error(`no price for ${symbol}`);

  const nowSec = Number.isFinite(meta.regularMarketTime) ? meta.regularMarketTime : Math.floor(Date.now() / 1000);

  // Last finite close at or before `cutoffSec`, walking back from the
  // newest bar — a gap/NaN on one day just falls through to the next.
  function closeBefore(cutoffSec) {
    for (let i = ts.length - 1; i >= 0; i--) {
      if (ts[i] <= cutoffSec && Number.isFinite(raw[i])) return raw[i];
    }
    return undefined;
  }

  const periods = {};
  for (const [label, days] of PERIODS) {
    const base = label === "1D" ? previousSessionClose(result, meta, closes) : closeBefore(nowSec - days * 86400);
    periods[label] = Number.isFinite(base) && base ? ((price - base) / base) * 100 : null;
  }

  return { symbol, price, periods, currency: meta.currency, name: meta.symbol };
}

module.exports = { parseChart, parsePeriods };
