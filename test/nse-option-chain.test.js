// Unit tests for nse-option-chain.js. No real network.
//
// The core test rebuilds the exact strikes from the LTP Calculator screenshot
// and asserts this code reproduces that tool's INTRINSIC, TIME VAL and
// LTP TOTAL to the paisa. If NSE ever changes shape, or someone "fixes" the
// signed/floored intrinsic asymmetry, these fail loudly.
const { createNseOptionChain, buildChain, chainRows, chainSpot, toCsv, impliedFuture, maxPain, nearestStrike, HEADER } = require("../nse-option-chain");

let fails = 0;
const check = (n, ok, x = "") => { if (!ok) fails++; console.log((ok ? "PASS " : "FAIL ") + n + (x ? "  -> " + x : "")); };

// strike: [callLTP, putLTP] from the 15:40 snapshot, NIFTY spot 22997.35.
const SNAP = {
  22250:[706.60,8.80], 22500:[467.40,19.50], 22800:[214.00,62.35], 22850:[179.95,76.30],
  22900:[145.10,94.85], 22950:[116.20,115.45], 23000:[91.85,140.00], 23050:[70.65,169.10],
  23100:[53.10,201.35], 23650:[3.00,691.65],
};
const json = {
  records: {
    timestamp: "15-Oct-2026 15:40:00",
    expiryDates: ["19-Oct-2026"],
    underlyingValue: 22997.35,
    data: Object.entries(SNAP).map(([k, [c, p]]) => ({
      strikePrice: Number(k), expiryDate: "19-Oct-2026",
      CE: { lastPrice: c, openInterest: 1000, changeinOpenInterest: 10, totalTradedVolume: 500, impliedVolatility: 8, change: 1 },
      PE: { lastPrice: p, openInterest: 2000, changeinOpenInterest: 20, totalTradedVolume: 800, impliedVolatility: 15, change: -1 },
    })),
  },
};

const chain = buildChain(json);
const at = (k) => chain.rows.find((r) => r.strike === k);

// ---- the reference price ----
check("REF is the ATM strike, not the spot", chain.ref === 22950, String(chain.ref));
check("implied future comes from put-call parity, near 22950", Math.abs(chain.future - 22950) < 10, String(chain.future));
check("spot is carried through unchanged", chain.spot === 22997.35);
check("REF differs from the nearest strike to SPOT (23000) — the point of using parity",
  chain.ref !== nearestStrike(Object.keys(SNAP).map(Number), 22997.35), `ref ${chain.ref}`);

// ---- intrinsic, verified against the tool's own output ----
const EXPECT = { // K: [callIntrinsic, putIntrinsic, callTimeVal, putTimeVal]
  22250:[ 700,700, 6.60,-691.20], 22500:[ 450,450,17.40,-430.50],
  22800:[ 150,150,64.00, -87.65], 22850:[ 100,100,79.95, -23.70],
  22900:[  50, 50,95.10,  44.85], 22950:[   0,  0,116.20,115.45],
  23000:[ -50,  0,141.85,140.00], 23100:[-150,  0,203.10,201.35],
  23650:[-700,  0,703.00,691.65],
};
for (const [k, [ci, pi, ctv, ptv]] of Object.entries(EXPECT)) {
  const r = at(Number(k));
  check(`K=${k}: call intrinsic is SIGNED (${ci})`, r.call.intrinsic === ci, String(r.call.intrinsic));
  check(`K=${k}: put intrinsic is FLOORED at 0 (${pi})`, r.put.intrinsic === pi, String(r.put.intrinsic));
  check(`K=${k}: call time value ${ctv}`, Math.abs(r.call.timeVal - ctv) < 0.011, String(r.call.timeVal));
  check(`K=${k}: put time value ${ptv}`, Math.abs(r.put.timeVal - ptv) < 0.011, String(r.put.timeVal));
}

// ---- LTP TOTAL, the header figure the screenshot showed ----
check("LTP TOTAL (calls) = 215.60, the screenshot's own figure", Math.abs(chain.ltpTotalCall - 215.60) < 0.011, String(chain.ltpTotalCall));
check("LTP TOTAL (puts)  = 286.60, the screenshot's own figure", Math.abs(chain.ltpTotalPut - 286.60) < 0.011, String(chain.ltpTotalPut));

// ---- breakeven is the standard disclosed calculation, NOT the tool's reversal ----
check("call breakeven = strike + premium", at(23000).call.breakeven === 23091.85, String(at(23000).call.breakeven));
check("put breakeven = strike - premium", at(22500).put.breakeven === 22480.50, String(at(22500).put.breakeven));

// ---- moneyness / PCR / max pain ----
check("PCR-OI per strike", at(23000).pcrOi === 2, String(at(23000).pcrOi));
check("PCR-Vol per strike", Math.abs(at(23000).pcrVol - 1.6) < 0.011, String(at(23000).pcrVol));
check("max pain returns a real strike", Object.keys(SNAP).map(Number).includes(chain.maxPain), String(chain.maxPain));

// ---- CSV shape ----
{
  const lines = toCsv(chain).split("\n");
  check("csv: header matches HEADER", lines[0] === HEADER.join(","), lines[0].slice(0, 60));
  check("csv: one line per strike", lines.length === chain.rows.length + 1, String(lines.length));
  check("csv: STRIKE sits between the call and put blocks", HEADER.indexOf("STRIKE") === 9);
  check("csv: a null field is blank, never 0", toCsv(buildChain({ records: { expiryDates: ["x"], underlyingValue: 100, data: [
    { strikePrice: 100, expiryDate: "x", CE: {}, PE: {} }] } })).split("\n")[1].startsWith(",,,"));
}

// ---- failure modes ----
for (const [label, bad] of [["no records", {}], ["no data array", { records: {} }], ["empty data", { records: { data: [] } }]]) {
  try { buildChain(bad); check(`buildChain rejects ${label}`, false); }
  catch (e) { check(`buildChain rejects ${label} with a typed error`, e.code === "unreadable", e.code); }
}

// ---- impliedFuture is robust to one silly quote on an illiquid wing ----
{
  // Prices constructed so K + C - P === 23000 at every strike, with both
  // legs comfortably positive so none are filtered out.
  const F = 23000, rows = [];
  for (let k = 22800; k <= 23200; k += 50) {
    rows.push({ strike: k, call: { ltp: (F - k) / 2 + 300 }, put: { ltp: -(F - k) / 2 + 300 } });
  }
  check("impliedFuture: clean chain recovers the parity future exactly", impliedFuture(rows, F) === F, String(impliedFuture(rows, F)));
  rows.push({ strike: 25000, call: { ltp: 9999 }, put: { ltp: 0.05 } }); // junk far wing
  const f = impliedFuture(rows, F);
  check("impliedFuture: a junk far-wing quote cannot move the median", f === F, String(f));
  const mean = rows.map((r) => r.strike + r.call.ltp - r.put.ltp).reduce((a, b) => a + b, 0) / rows.length;
  check("impliedFuture: the same junk WOULD have wrecked a mean (why median)", Math.abs(mean - F) > 500, mean.toFixed(0));
}

// ---- response-shape tolerance: v3 vs the retired endpoint ----
{
  const rowsOnly = [{ strikePrice: 100, CE: { lastPrice: 5 }, PE: { lastPrice: 5 } }];
  check("chainRows: reads records.data (legacy shape)", chainRows({ records: { data: rowsOnly } }).length === 1);
  check("chainRows: reads a bare data array (v3 shape)", chainRows({ data: rowsOnly }).length === 1);
  check("chainRows: reads filtered.data", chainRows({ filtered: { data: rowsOnly } }).length === 1);
  check("chainRows: null when no shape matches", chainRows({ nope: 1 }) === null);
  check("chainSpot: reads records.underlyingValue", chainSpot({ records: { underlyingValue: 123 } }) === 123);
  check("chainSpot: reads a top-level underlyingValue", chainSpot({ underlyingValue: 456 }) === 456);
  // v3 rows carry no expiryDate; they must NOT be filtered away.
  const v3 = buildChain({ data: rowsOnly, underlyingValue: 100 }, { expiry: "19-Oct-2026" });
  check("buildChain: v3 rows without expiryDate survive the expiry filter", v3.rows.length === 1, String(v3.rows.length));
}

// ---- the two-call v3 flow ----
(async () => {
  const calls = [];
  const expiries = { expiryDates: ["19-Oct-2026", "26-Oct-2026"] };
  const chainJson = { records: { timestamp: "15-Oct-2026 15:40:00", underlyingValue: 22997.35,
    data: Object.entries(SNAP).map(([k, [c, p]]) => ({ strikePrice: Number(k),
      CE: { lastPrice: c, openInterest: 1, totalTradedVolume: 1 },
      PE: { lastPrice: p, openInterest: 1, totalTradedVolume: 1 } })) } };

  const mk = (behaviour) => async (url) => {
    const u = String(url); calls.push(u);
    if (u.endsWith("/")) return { ok: true, status: 200, headers: { getSetCookie: () => ["nsit=a; Path=/"] } };
    if (behaviour && behaviour(u)) return behaviour(u);
    if (u.includes("option-chain-contract-info")) return { ok: true, status: 200, json: async () => expiries };
    if (u.includes("option-chain-v3")) return { ok: true, status: 200, json: async () => chainJson };
    return { ok: false, status: 404 };
  };

  const oc = createNseOptionChain({ fetchImpl: mk(null) });
  const r = await oc.get("NIFTY");
  check("flow: primes cookies first", calls[0].endsWith("/"), calls[0]);
  check("flow: asks contract-info for expiries", calls[1].includes("/api/option-chain-contract-info?symbol=NIFTY"), calls[1]);
  check("flow: then calls option-chain-v3 with type, symbol and expiry",
    calls[2].includes("/api/option-chain-v3?type=Indices&symbol=NIFTY&expiry=19-Oct-2026"), calls[2]);
  check("flow: never calls the retired option-chain-indices", !calls.some((c) => c.includes("option-chain-indices")));
  check("flow: uses the NEAREST expiry", r.expiry === "19-Oct-2026", String(r.expiry));
  check("flow: still decodes REF correctly end-to-end", r.ref === 22950, String(r.ref));
  check("flow: caches, so a repeat makes no extra calls", (await oc.get("NIFTY")) && calls.length === 3, String(calls.length));

  // A 404 must say "retired", not a vague upstream error — that distinction
  // is what made the real breakage diagnosable from the spreadsheet.
  const oc404 = createNseOptionChain({ fetchImpl: mk((u) => (u.includes("contract-info") ? { ok: false, status: 404 } : null)) });
  try { await oc404.get("NIFTY"); check("flow: a 404 rejects", false); }
  catch (e) { check("flow: a 404 is reported as 'retired', not a generic upstream error", e.code === "retired", e.code); }

  const oc403 = createNseOptionChain({ fetchImpl: mk((u) => (u.includes("contract-info") ? { ok: false, status: 403 } : null)) });
  try { await oc403.get("NIFTY"); check("flow: a 403 rejects", false); }
  catch (e) { check("flow: a 403 is reported as blocked", e.code === "blocked", e.code); }

  const ocEmpty = createNseOptionChain({ fetchImpl: mk((u) => (u.includes("contract-info") ? { ok: true, status: 200, json: async () => ({}) } : null)) });
  try { await ocEmpty.get("NIFTY"); check("flow: no expiries rejects", false); }
  catch (e) { check("flow: an empty expiry list rejects cleanly", e.code === "unreadable", e.code); }

  // The CSV handler answers 200 even when upstream failed, so IMPORTDATA can
  // display the reason instead of a bare #N/A.
  let body = null, status = 200;
  const res = { set() { return this; }, status(c) { status = c; return this; }, send(b) { body = b; } };
  await createNseOptionChain({ fetchImpl: mk((u) => (u.includes("contract-info") ? { ok: false, status: 404 } : null)) })({ query: {} }, res);
  check("handler: upstream failure still answers 200", status === 200, String(status));
  check("handler: body names the reason in CSV", String(body).startsWith("Error,Message") && String(body).includes("retired"), String(body).slice(0, 80));

  console.log(fails === 0 ? "\nall passed" : `\n${fails} FAILED`);
  process.exit(fails === 0 ? 0 : 1);
})();
