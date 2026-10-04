// Parser + handler tests for the full Screener company page. The fixture HTML is
// a hand-built reconstruction of Screener's markup (ids/classes), not a capture.
const fs = require("fs");
const path = require("path");
const { parseFullPage, parsePeers } = require("../screener-page");
const { createScreenerHandler } = require("../screener");
const { createDirectory } = require("../companies");

let failed = 0;
const check = (name, ok) => { if (!ok) failed++; console.log(`${ok ? "ok  " : "FAIL"} ${name}`); };
const read = (f) => fs.readFileSync(path.join(__dirname, "fixtures", f), "utf8");

(async () => {
  const p = parseFullPage(read("screener-company.html"));
  check("name", p.name === "Abbott India Ltd");
  check("price from Current Price ratio", p.price === "₹ 26,840");
  check("day change is negative", p.change && p.change.pct === -1.05);
  check("links", p.links.bse === "500488" && p.links.nse === "ABBOTINDIA" && p.links.website.label === "abbott.co.in");
  check("5 top ratios", p.ratios.length === 5 && p.ratios[0].name === "Market Cap" && p.ratios[0].value === "₹ 57,035 Cr.");
  check("about text, footnotes stripped", p.about.startsWith("Abbott India Ltd is one") && !p.about.includes("[1]"));
  check("key points", p.keyPoints.length === 2 && p.keyPoints[0].startsWith("Abbott Group:"));
  check("pros/cons", p.pros.length === 2 && p.cons.length === 1);
  check("warehouse id", p.warehouseId === "6598746");
  check("breadcrumb path", p.path.join("|") === "Healthcare|Healthcare|Pharmaceuticals & Biotechnology");
  const q = p.tables.quarters;
  check("quarters headers", q.headers.join(",") === ",Jun 2025,Sep 2025");
  check("quarters rows; '+' button stripped", q.rows[0].name === "Sales" && q.rows[0].values.join(",") === "1,738,1,757");
  check("strong row flagged", q.rows[1].strong === true && q.rows[0].strong === false);
  check("basis line", q.basis === "Consolidated Figures in Rs. Crores");
  check("P&L / BS / CF / ratios present", ["profitLoss", "balanceSheet", "cashFlow", "ratios"].every((k) => p.tables[k] && p.tables[k].rows.length));
  check("ranges parsed (2 blocks)", p.ranges.length === 2 && p.ranges[0].title === "Compounded Sales Growth" && p.ranges[0].rows[0][0] === "10 Years");
  check("shareholding quarterly + yearly", p.tables.shareholding.quarterly.rows[0].name === "Promoters" && p.tables.shareholding.yearly.rows[0].values[0] === "74.99%");

  const peers = parsePeers(read("screener-peers.html"));
  check("peers: symbols from links", peers.rows[0].symbol === "SUNPHARMA" && peers.rows[1].symbol === "DIVISLAB");
  check("peers: median row (no link)", peers.rows[2].symbol === null && peers.rows[2].name.startsWith("Median"));
  check("empty html is safe", parseFullPage("<html></html>").ratios.length === 0 && parsePeers("") === null);

  // Handler: mocked fetch, one request at a time, cache, validation, not_configured.
  const calls = [];
  const realFetch = global.fetch;
  global.fetch = async (url, opts) => {
    calls.push(url);
    const body = url.includes("/peers/") ? read("screener-peers.html") : url.endsWith("/consolidated/") ? read("screener-company.html") : "";
    return { ok: true, status: 200, url, text: async () => body };
  };
  const directory = createDirectory({ groups: ["Healthcare"], industries: [["Pharma", 0]], rows: [["Abbott India", "ABBOTINDIA", "500488", "INE", 0]] });
  const mk = (sessionId) => createScreenerHandler({ sessionId, minGapMs: 1, directory });
  const run = async (h, sym) => {
    const out = {};
    await h.company({ params: { symbol: sym } }, { status(c) { out.code = c; return this; }, set() {}, json(b) { out.body = b; return this; } });
    return out;
  };
  const h = mk("sess");
  let r = await run(h, "abbotindia");
  check("handler 200 with parsed page + peers", !r.code && r.body.name === "Abbott India Ltd" && r.body.peers.rows.length === 3 && r.body.consolidated === true);
  check("uses consolidated page then the peers fragment", calls.length === 2 && calls[1].includes("/api/company/6598746/peers/"));
  r = await run(h, "ABBOTINDIA");
  check("second call served from cache", calls.length === 2);
  r = await run(h, "RANDOMCO");
  check("unknown company rejected (404)", r.code === 404 && r.body.error === "unknown_company");
  r = await run(h, "bad symbol!");
  check("invalid symbol rejected (400)", r.code === 400);
  r = await run(mk(undefined), "ABBOTINDIA");
  check("no cookie -> 503 not_configured", r.code === 503 && r.body.error === "not_configured");
  global.fetch = realFetch;

  console.log(failed ? `\n${failed} failed` : "\nall passed");
  process.exit(failed ? 1 : 0);
})();
