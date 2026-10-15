// Unit tests for nse-option-chain.js. No real network.
//
// The core test rebuilds the exact strikes from the LTP Calculator screenshot
// and asserts this code reproduces that tool's INTRINSIC, TIME VAL and
// LTP TOTAL to the paisa. If NSE ever changes shape, or someone "fixes" the
// signed/floored intrinsic asymmetry, these fail loudly.
const { buildChain, toCsv, impliedFuture, maxPain, nearestStrike, HEADER } = require("../nse-option-chain");

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

console.log(fails === 0 ? "\nall passed" : `\n${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);
