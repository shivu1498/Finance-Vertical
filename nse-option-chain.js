// Live NSE option chain, for the spreadsheet.
//
// Source: https://www.nseindia.com/api/option-chain-indices?symbol=NIFTY —
// the JSON behind NSE's own option-chain page, behind the same cookie wall
// as every other NSE integration here (see nse-sector-indices.js).
//
// DERIVED COLUMNS. These were reverse-engineered from a screenshot of the
// "LTP Calculator" tool and verified to the paisa against 9 strikes of its
// output, so the numbers here reproduce that tool exactly:
//
//   REF       the ATM strike. NOT the spot. The tool prices everything off
//             the synthetic future implied by put-call parity (K + C - P,
//             which agrees to ~±5 pts across the chain), rounded to the
//             nearest strike. With spot at 22997.35 the future was ~22951
//             and REF was 22950 — using spot would shift every intrinsic
//             by a strike.
//   INTRINSIC REF - K. Signed for calls (so a 23000 call shows -50);
//             floored at zero for puts. The asymmetry is the tool's, not a
//             bug here — both halves were verified against its output.
//   TIME VAL  LTP - INTRINSIC, which is why deep-ITM puts show negative
//             time value in that tool.
//   LTP TOTAL sum of LTP across 3 consecutive strikes either side of REF.
//
// NOT reproduced: the tool's REVERSAL column. See the README — it does not
// reduce to any function of the fields NSE publishes, and nothing here
// guesses at it. BREAKEVEN below is the standard, disclosed calculation
// (K + call premium / K - put premium), which is a different thing and is
// labelled as such.

const WWW = "https://www.nseindia.com";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

function num(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim().replace(/,/g, "");
  if (!s || s === "-" || s === "NA") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
function pick(o, keys) {
  if (!o) return null;
  for (const k of keys) if (o[k] !== undefined && o[k] !== null && String(o[k]).trim() !== "") return o[k];
  return null;
}
const leg = (o) => ({
  ltp: num(pick(o, ["lastPrice"])),
  chg: num(pick(o, ["change"])),
  iv: num(pick(o, ["impliedVolatility"])),
  oi: num(pick(o, ["openInterest"])),
  oiChg: num(pick(o, ["changeinOpenInterest"])),
  vol: num(pick(o, ["totalTradedVolume"])),
});

// The future implied by put-call parity, taken as the MEDIAN of K + C - P
// over the strikes nearest the money. Median not mean: one stale quote on an
// illiquid wing would drag an average by hundreds of points.
function impliedFuture(rows, spot) {
  const cand = rows
    .filter((r) => r.call.ltp != null && r.put.ltp != null && r.call.ltp > 0 && r.put.ltp > 0)
    .map((r) => ({ d: Math.abs(r.strike - spot), v: r.strike + r.call.ltp - r.put.ltp }))
    .sort((a, b) => a.d - b.d)
    .slice(0, 10)
    .map((x) => x.v)
    .sort((a, b) => a - b);
  if (!cand.length) return spot;
  const m = Math.floor(cand.length / 2);
  return cand.length % 2 ? cand[m] : (cand[m - 1] + cand[m]) / 2;
}

const nearestStrike = (strikes, x) => strikes.reduce((best, k) => (Math.abs(k - x) < Math.abs(best - x) ? k : best), strikes[0]);

// Max pain: the strike at which total intrinsic value owed to option buyers
// is smallest — i.e. where the most premium expires worthless.
function maxPain(rows) {
  let best = null, bestVal = Infinity;
  for (const a of rows) {
    let total = 0;
    for (const b of rows) {
      if (b.call.oi) total += Math.max(0, a.strike - b.strike) * b.call.oi;
      if (b.put.oi) total += Math.max(0, b.strike - a.strike) * b.put.oi;
    }
    if (total < bestVal) { bestVal = total; best = a.strike; }
  }
  return best;
}

function buildChain(json, { strikeWindow = 20 } = {}) {
  const recs = json?.records;
  const data = Array.isArray(recs?.data) ? recs.data : null;
  if (!data) throw Object.assign(new Error("NSE returned an option chain this app couldn't read."), { status: 502, code: "unreadable" });

  const expiries = Array.isArray(recs.expiryDates) ? recs.expiryDates : [];
  const expiry = expiries[0] || null;
  const spot = num(recs.underlyingValue) ?? 0;

  let rows = data
    .filter((d) => !expiry || d.expiryDate === expiry)
    .map((d) => ({ strike: num(d.strikePrice), call: leg(d.CE), put: leg(d.PE) }))
    .filter((r) => r.strike != null)
    .sort((a, b) => a.strike - b.strike);
  if (!rows.length) throw Object.assign(new Error("no strikes for the near expiry"), { status: 502, code: "unreadable" });

  const fut = impliedFuture(rows, spot);
  const strikes = rows.map((r) => r.strike);
  const ref = nearestStrike(strikes, fut);

  // Keep a window around the money; the full chain is mostly dead strikes.
  const refIdx = strikes.indexOf(ref);
  rows = rows.slice(Math.max(0, refIdx - strikeWindow), refIdx + strikeWindow + 1);

  const out = rows.map((r) => {
    const intrC = ref - r.strike;                 // signed, per the tool
    const intrP = Math.max(0, ref - r.strike);    // floored, per the tool
    const n = (x) => (x == null ? null : Math.round(x * 100) / 100);
    return {
      strike: r.strike,
      call: { ...r.call, intrinsic: n(intrC), timeVal: r.call.ltp == null ? null : n(r.call.ltp - intrC), breakeven: r.call.ltp == null ? null : n(r.strike + r.call.ltp) },
      put: { ...r.put, intrinsic: n(intrP), timeVal: r.put.ltp == null ? null : n(r.put.ltp - intrP), breakeven: r.put.ltp == null ? null : n(r.strike - r.put.ltp) },
      pcrOi: r.call.oi ? n(r.put.oi / r.call.oi) : null,
      pcrVol: r.call.vol ? n(r.put.vol / r.call.vol) : null,
    };
  });

  // LTP TOTAL: 3 strikes above REF for calls, REF and 2 below for puts.
  const idx = out.findIndex((r) => r.strike === ref);
  const sum = (arr, f) => arr.reduce((a, x) => a + (f(x) || 0), 0);
  const ltpTotalCall = idx >= 0 ? Math.round(sum(out.slice(idx + 1, idx + 4), (r) => r.call.ltp) * 100) / 100 : null;
  const ltpTotalPut = idx >= 0 ? Math.round(sum(out.slice(Math.max(0, idx - 2), idx + 1), (r) => r.put.ltp) * 100) / 100 : null;

  const totCallOi = sum(out, (r) => r.call.oi), totPutOi = sum(out, (r) => r.put.oi);
  const totCallVol = sum(out, (r) => r.call.vol), totPutVol = sum(out, (r) => r.put.vol);

  return {
    asOf: recs.timestamp || new Date().toISOString(),
    expiry, spot,
    future: Math.round(fut * 100) / 100,
    ref,
    maxPain: maxPain(out),
    pcrOi: totCallOi ? Math.round((totPutOi / totCallOi) * 100) / 100 : null,
    pcrVol: totCallVol ? Math.round((totPutVol / totCallVol) * 100) / 100 : null,
    ltpTotalCall, ltpTotalPut,
    rows: out,
  };
}

const HEADER = ["Call OI","Call OI Chg","Call Vol","Call IV","Call LTP","Call Chg","Call Intrinsic","Call Time Val","Call Breakeven",
  "STRIKE","Put LTP","Put Chg","Put IV","Put Vol","Put OI","Put OI Chg","Put Intrinsic","Put Time Val","Put Breakeven",
  "PCR-OI","PCR-Vol","Moneyness"];

function toCsv(chain) {
  const c = (v) => (v == null ? "" : v);
  const lines = [HEADER.join(",")];
  for (const r of chain.rows) {
    lines.push([
      c(r.call.oi), c(r.call.oiChg), c(r.call.vol), c(r.call.iv), c(r.call.ltp), c(r.call.chg), c(r.call.intrinsic), c(r.call.timeVal), c(r.call.breakeven),
      r.strike,
      c(r.put.ltp), c(r.put.chg), c(r.put.iv), c(r.put.vol), c(r.put.oi), c(r.put.oiChg), c(r.put.intrinsic), c(r.put.timeVal), c(r.put.breakeven),
      c(r.pcrOi), c(r.pcrVol),
      r.strike === chain.ref ? "ATM" : r.strike < chain.ref ? "Call ITM" : "Put ITM",
    ].join(","));
  }
  return lines.join("\n");
}

function createNseOptionChain({ fetchImpl = fetch, wwwBase = WWW, cacheMs = 60_000, symbol = "NIFTY" } = {}) {
  let cookieJar = null, cookieAt = 0, cached = null, cachedAt = 0;
  const COOKIE_TTL = 10 * 60 * 1000;

  async function primeCookies() {
    if (cookieJar && Date.now() - cookieAt < COOKIE_TTL) return cookieJar;
    const res = await fetchImpl(`${wwwBase}/`, { headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml", "Accept-Language": "en-US,en;q=0.9" } });
    const set = typeof res.headers?.getSetCookie === "function" ? res.headers.getSetCookie() : res.headers?.raw?.()["set-cookie"] || [];
    cookieJar = (Array.isArray(set) ? set : set ? [set] : []).map((x) => x.split(";")[0]).join("; ") || null;
    cookieAt = Date.now();
    return cookieJar;
  }

  async function fetchChain(sym = symbol) {
    if (cached && cached.sym === sym && Date.now() - cachedAt < cacheMs) return cached.result;
    const cookie = await primeCookies();
    const res = await fetchImpl(`${wwwBase}/api/option-chain-indices?symbol=${encodeURIComponent(sym)}`, {
      headers: { "User-Agent": UA, Accept: "application/json, text/plain, */*", Referer: `${wwwBase}/option-chain`, ...(cookie ? { Cookie: cookie } : {}) },
    });
    if (res.status === 401 || res.status === 403) throw Object.assign(new Error("NSE blocked this server's option-chain request."), { status: 502, code: "blocked" });
    if (res.status === 429) throw Object.assign(new Error("NSE is rate-limiting right now."), { status: 429, code: "rate_limited" });
    if (!res.ok) throw Object.assign(new Error(`NSE responded ${res.status}`), { status: 502, code: "upstream" });
    const result = buildChain(await res.json().catch(() => null));
    cached = { sym, result }; cachedAt = Date.now();
    return result;
  }

  async function handler(req, res) {
    const sym = String(req?.query?.symbol || symbol).toUpperCase().slice(0, 20);
    try {
      const chain = await fetchChain(sym);
      res.set("Content-Type", "text/csv; charset=utf-8");
      res.set("Cache-Control", "public, max-age=60");
      res.set("Access-Control-Allow-Origin", "*");
      res.send(toCsv(chain));
    } catch (err) {
      res.status(err.status || 502);
      res.set("Content-Type", "text/csv; charset=utf-8");
      res.send(`Error,Message\n${err.code || "oc_error"},"${String(err.message).replace(/"/g, '""')}"`);
    }
  }
  handler.get = fetchChain;
  handler.summary = async function summaryHandler(req, res) {
    try {
      const { rows, ...meta } = await fetchChain(String(req?.query?.symbol || symbol).toUpperCase().slice(0, 20));
      res.set("Cache-Control", "public, max-age=60");
      res.json({ ...meta, strikes: rows.length });
    } catch (err) {
      res.status(err.status || 502).json({ error: err.code || "oc_error", message: err.message });
    }
  };
  return handler;
}

module.exports = { createNseOptionChain, buildChain, toCsv, impliedFuture, maxPain, nearestStrike, HEADER };
