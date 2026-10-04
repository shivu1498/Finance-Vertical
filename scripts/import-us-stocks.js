#!/usr/bin/env node
// Builds public/us-stocks.json from a Dhan "All US Stocks" CSV export.
//
//   node scripts/import-us-stocks.js path/to/Dhan_-_US_All_Us_Stocks.csv
//
// Expected columns: Name, LTP ($), Change(%), Volume, Market Cap ($), PE Ratio,
// Industry PE, 52W High ($), 1M/3M/1 Yr/3 Yr/5 Yr Returns, ROE, ROCE.
//   - numbers use Indian digit grouping ("11,57,12,833"); "-" means no value
//   - Market Cap is in $ millions (56,37,351.50 = $5.64 Tn); stored as-is, the
//     browser formats it as Tn / Bn / Mn
// The CSV has no ticker column, so tickers come from the TICKERS table below
// (name -> [ticker, TradingView exchange]). A name that isn't listed keeps a null
// ticker: it still shows in the table, just without a company page or chart link.

const fs = require("fs");
const path = require("path");

const TICKERS = {
  "NVIDIA Corp": ["NVDA", "NASDAQ"],
  "Apple Inc": ["AAPL", "NASDAQ"],
  "Microsoft Corp": ["MSFT", "NASDAQ"],
  "Amazon.com Inc": ["AMZN", "NASDAQ"],
  "Taiwan Semiconductor Manufacturing Co Ltd": ["TSM", "NYSE"],
  "Alphabet Inc - Class A": ["GOOGL", "NASDAQ"],
  "Alphabet Inc - Class C": ["GOOG", "NASDAQ"],
  "Broadcom Inc": ["AVGO", "NASDAQ"],
  "Meta Platforms Inc - Class A": ["META", "NASDAQ"],
  "Tesla Inc": ["TSLA", "NASDAQ"],
  "Micron Technology Inc": ["MU", "NASDAQ"],
  "Eli Lilly and Co": ["LLY", "NYSE"],
  "Advanced Micro Devices Inc": ["AMD", "NASDAQ"],
  "JPMorgan Chase & Co": ["JPM", "NYSE"],
  "Walmart Inc": ["WMT", "NASDAQ"],
  "ASML Holding NV": ["ASML", "NASDAQ"],
  "Berkshire Hathaway Inc - Class B": ["BRK-B", "NYSE"],
  "Exxon Mobil Corp": ["XOM", "NYSE"],
  "Intel Corp": ["INTC", "NASDAQ"],
  "Johnson & Johnson": ["JNJ", "NYSE"],
  "Visa Inc - Class A": ["V", "NYSE"],
  "Mastercard Inc - Class A": ["MA", "NYSE"],
  "AbbVie Inc": ["ABBV", "NYSE"],
};

function parseCsv(text) {
  const rows = [];
  let row = [], field = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((x) => x !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((x) => x !== "")) rows.push(row);
  return rows;
}

const num = (s) => {
  const t = String(s == null ? "" : s).replace(/[,%$\s]/g, "");
  if (!t || t === "-") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

function build(csv) {
  const [head, ...body] = parseCsv(csv.replace(/^﻿/, ""));
  const col = (re) => head.findIndex((h) => re.test(h));
  const ix = {
    name: col(/^name$/i), p: col(/^ltp/i), c: col(/^change/i), vol: col(/^volume/i), mc: col(/^market cap/i),
    pe: col(/^pe ratio/i), ipe: col(/^industry pe/i), hi: col(/52w high/i),
    r1m: col(/^1m/i), r3m: col(/^3m/i), r1y: col(/^1 yr/i), r3y: col(/^3 yr/i), r5y: col(/^5 yr/i),
    roe: col(/^roe/i), roce: col(/^roce/i),
  };
  if (ix.name < 0 || ix.p < 0 || ix.mc < 0) throw new Error("This doesn't look like the Dhan US stocks CSV (Name / LTP / Market Cap columns missing).");
  const rows = [];
  for (const r of body) {
    const name = (r[ix.name] || "").trim();
    if (!name) continue;
    const [t, x] = TICKERS[name] || [null, null];
    rows.push({
      n: name, t, x,
      p: num(r[ix.p]), c: num(r[ix.c]), vol: num(r[ix.vol]), mc: num(r[ix.mc]),
      pe: num(r[ix.pe]), ipe: num(r[ix.ipe]), hi: num(r[ix.hi]),
      r1m: num(r[ix.r1m]), r3m: num(r[ix.r3m]), r1y: num(r[ix.r1y]), r3y: num(r[ix.r3y]), r5y: num(r[ix.r5y]),
      roe: num(r[ix.roe]), roce: num(r[ix.roce]),
    });
  }
  return { v: 1, source: "Dhan - All US Stocks", mcUnit: "USD millions", rows };
}

if (require.main === module) {
  const src = process.argv[2];
  if (!src) { console.error("usage: node scripts/import-us-stocks.js <csv>"); process.exit(1); }
  const out = build(fs.readFileSync(src, "utf8"));
  const dest = path.join(__dirname, "..", "public", "us-stocks.json");
  fs.writeFileSync(dest, JSON.stringify(out));
  const missing = out.rows.filter((r) => !r.t).map((r) => r.n);
  console.log(`${out.rows.length} companies -> ${path.relative(process.cwd(), dest)}`);
  if (missing.length) console.log(`no ticker mapped (shown without a page link): ${missing.join(", ")}`);
}

module.exports = { build, parseCsv };
