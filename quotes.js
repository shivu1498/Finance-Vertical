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

module.exports = { parseChart };
