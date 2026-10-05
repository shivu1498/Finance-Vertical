// Runs the real server against a mock Yahoo chart API and checks /api/quotes end to end.
const { spawn } = require("child_process");
const path = require("path");
const express = require("express");
let fails = 0;
const check = (n, ok, x = "") => { if (!ok) fails++; console.log((ok ? "PASS " : "FAIL ") + n + (x ? "  -> " + x : "")); };

// Mock Yahoo: closes over 5 days; chartPreviousClose is a week-old decoy.
const day = 86400, t0 = Math.floor(Date.UTC(2026, 9, 2) / 1000) - 4 * day;
const SERIES = {
  "^NSEI": { closes: [22000, 22100, 22050, 22200, 22420], price: 22420 },
  "^TNX": { closes: [4.1, 4.2, 4.25, 4.3, 4.28], price: 4.28 },
  "EURUSD=X": { closes: [1.07, 1.075, 1.08, 1.079, 1.082], price: 1.082 },
  // 400 days of history, for /api/quotes/periods (needs a much wider window
  // than the 5-day one above to resolve 3M/6M/1Y).
  "^LONG": { closes: Array.from({ length: 400 }, (_, i) => 100 + i), price: 100 + 399 },
};
const mock = express();
mock.get("/v8/finance/chart/:symbol", (req, res) => {
  const s = SERIES[req.params.symbol];
  if (!s) return res.status(404).json({ chart: { result: null, error: { code: "Not Found" } } });
  const ts = s.closes.map((_, i) => t0 + i * day);
  res.json({ chart: { result: [{ meta: { symbol: req.params.symbol, currency: "USD", regularMarketPrice: s.price, regularMarketTime: ts.at(-1) + 3600, chartPreviousClose: s.closes[0] * 0.9, gmtoffset: 0 }, timestamp: ts, indicators: { quote: [{ close: s.closes }] } }], error: null } });
});

(async () => {
  const mockSrv = mock.listen(0, "127.0.0.1");
  await new Promise((r) => mockSrv.once("listening", r));
  const port = 3987;
  const srv = spawn(process.execPath, [path.join(__dirname, "..", "server.js")], {
    env: { ...process.env, PORT: String(port), YAHOO_BASE: `http://127.0.0.1:${mockSrv.address().port}`, MF_DISABLE: "1", NO_OPEN: "1" }, stdio: "ignore",
  });
  process.on("exit", () => srv.kill());
  for (let i = 0; i < 50; i++) { try { await fetch(`http://127.0.0.1:${port}/`); break; } catch { await new Promise((r) => setTimeout(r, 100)); } }

  const get = async (syms) => (await (await fetch(`http://127.0.0.1:${port}/api/quotes?symbols=${encodeURIComponent(syms)}`)).json()).quotes;
  const q = Object.fromEntries((await get("^NSEI,^TNX,EURUSD=X,NOPE")).map((x) => [x.symbol, x]));
  check("Nifty: change is vs the previous session (22200), not the week-old decoy", Math.abs(q["^NSEI"].prevClose - 22200) < 1e-9 && Math.abs(q["^NSEI"].change - 220) < 1e-9, `prev ${q["^NSEI"].prevClose}, change ${q["^NSEI"].change}`);
  check("Nifty percent change", Math.abs(q["^NSEI"].changePercent - (220 / 22200) * 100) < 1e-9, q["^NSEI"].changePercent.toFixed(4));
  check("a falling yield gives a negative change", Math.abs(q["^TNX"].change - (4.28 - 4.3)) < 1e-9 && q["^TNX"].changePercent < 0, `${q["^TNX"].change.toFixed(3)}`);
  check("an FX pair gives a positive change", Math.abs(q["EURUSD=X"].change - (1.082 - 1.079)) < 1e-9);
  check("an unknown symbol is reported as an error, not a crash", q["NOPE"].error === true && /404/.test(q["NOPE"].message), q["NOPE"].message);
  check("the symbols param is required", (await fetch(`http://127.0.0.1:${port}/api/quotes`)).status === 400);

  // /api/quotes/periods: the Markets tab's 1D/1W/1M/3M/6M/1Y chips
  const lp = await (await fetch(`http://127.0.0.1:${port}/api/quotes/periods?symbol=${encodeURIComponent("^LONG")}`)).json();
  check("periods: price is the live price", lp.price === 499, lp.price);
  check("periods: 1D matches the same day-change math as /api/quotes", Math.abs(lp.periods["1D"] - (1 / 498) * 100) < 1e-9, lp.periods["1D"]);
  check("periods: 1Y resolves given 400 days of history", Math.abs(lp.periods["1Y"] - (365 / 134) * 100) < 1e-6, lp.periods["1Y"]);
  check("periods: symbol query param is required", (await fetch(`http://127.0.0.1:${port}/api/quotes/periods`)).status === 400);
  check("periods: an unknown symbol is a clean upstream error, not a crash", (await fetch(`http://127.0.0.1:${port}/api/quotes/periods?symbol=NOPE`)).status === 502);

  srv.kill(); mockSrv.close();
  console.log(fails ? `\n${fails} FAILED` : "\nall passed");
  process.exit(fails ? 1 : 0);
})();
