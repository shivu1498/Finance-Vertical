// Mock of the mfapi.in endpoints (search, full history). Synthetic data only.
const express = require("express");
const { CATEGORIES } = require("../mf-universe");
const app = express();
const PORT = Number(process.env.PORT || 4100);
const FLAKY = process.env.FLAKY === "1";

function rng(seed) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const gauss = (r) => Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r());

const today = new Date(); today.setUTCHours(0, 0, 0, 0);
const days = (yrs) => { const out = []; const d = new Date(today); const start = new Date(today); start.setUTCFullYear(start.getUTCFullYear() - yrs);
  for (let x = new Date(start); x <= d; x.setUTCDate(x.getUTCDate() + 1)) if (x.getUTCDay() % 6) out.push(new Date(x)); return out; };

const MARKET = { large: [0.00040, 0.0090, 11], mid: [0.00062, 0.0120, 22], small: [0.00078, 0.0140, 33] };
const factor = {}; for (const [k, [mu, sg, seed]] of Object.entries(MARKET)) { const r = rng(seed); factor[k] = days(12).map(() => mu + sg * gauss(r)); }

const catalog = []; let code = 100000;
const labelOf = { large: "Large Cap Fund", mid: "Mid Cap Fund", small: "Small Cap Fund" };
for (const [catKey, cat] of Object.entries(CATEGORIES)) {
  cat.funds.forEach((phrases, i) => {
    if (i === 5 || i === 13) return;                      // funds that do not exist on the mock (-> unmatched)
    const useAlt = (i === 2 || i === 8) && phrases[1];     // renamed funds: only the alternate phrase exists
    const base = useAlt ? phrases[1] : phrases[0];
    const hyphen = catKey === "mid" && i % 3 === 0 ? base.replace(/ Mid Cap/i, " Mid-Cap") : base;
    const years = i === 17 ? 2 : i % 4 === 0 ? 8 : 11;      // one fund with <3y history
    const c = ++code;
    catalog.push({ code: c, name: `${hyphen} Fund - Direct Plan - Growth Option`, catKey, years, i });
    catalog.push({ code: c + 50000, name: `${hyphen} Fund - Regular Plan - Growth Option`, catKey, years, i, decoy: true });
    catalog.push({ code: c + 60000, name: `${hyphen} Fund - Direct Plan - IDCW`, catKey, years, i, decoy: true });
  });
}
// decoys that must not be picked
catalog.push({ code: 190001, name: "Nippon India Large & Mid Cap Fund - Direct Plan - Growth Option", catKey: "large", years: 8, i: 1, decoy: true });
catalog.push({ code: 190002, name: "SBI Large Cap Index Fund - Direct Plan - Growth", catKey: "large", years: 8, i: 2, decoy: true });

const histories = new Map();
function historyOf(c) {
  if (histories.has(c.code)) return histories.get(c.code);
  const r = rng(c.code);
  const ds = days(c.years), fac = factor[c.catKey].slice(-ds.length);
  const skill = (rng(c.i * 7 + c.catKey.length)() - 0.5) * 0.00028, beta = 0.88 + rng(c.i + 5)() * 0.24, idio = 0.0015 + rng(c.i + 9)() * 0.0025;
  let nav = 20 + rng(c.i + 3)() * 400; const rows = [];
  ds.forEach((d, k) => { nav *= 1 + beta * fac[k] + skill + idio * gauss(r); const dd = String(d.getUTCDate()).padStart(2, "0"), mm = String(d.getUTCMonth() + 1).padStart(2, "0"); rows.push({ date: `${dd}-${mm}-${d.getUTCFullYear()}`, nav: nav.toFixed(5) }); });
  rows.reverse();                                            // mfapi returns newest first
  histories.set(c.code, rows); return rows;
}

let hits = 0; const log = [];
app.get("/_log", (req, res) => res.json({ hits, log }));
app.use((req, res, next) => { hits++; log.push(req.url); if (FLAKY && hits % 6 === 0) { res.set("Retry-After", "1"); return res.status(429).json({ message: "slow down" }); } next(); });
app.get("/mf/search", (req, res) => {
  const q = String(req.query.q || "").toLowerCase();
  res.json(catalog.filter((c) => c.name.toLowerCase().includes(q)).map((c) => ({ schemeCode: c.code, schemeName: c.name })));
});
app.get("/mf/:code", (req, res) => {
  const c = catalog.find((x) => String(x.code) === req.params.code);
  if (!c) return res.status(404).json({ status: "ERROR", message: "not found" });
  res.json({ meta: { fund_house: c.name.split(" ").slice(0, 2).join(" "), scheme_type: "Open Ended Schemes", scheme_category: `Equity Scheme - ${labelOf[c.catKey]}`, scheme_code: c.code, scheme_name: c.name, isin_growth: "INF" + String(c.code).padStart(9, "0"), isin_div_reinvestment: null }, data: historyOf(c), status: "SUCCESS" });
});
app.listen(PORT, "127.0.0.1", () => console.log(`mock mfapi on ${PORT} with ${catalog.length} schemes`));
