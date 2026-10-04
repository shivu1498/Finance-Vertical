#!/usr/bin/env node
// Builds public/au-stocks.json from an ASX-listed-companies CSV (the kind ASX
// itself and index trackers publish): Code, Company, Sector, Market Cap,
// Weight(%), then two blank/footer columns.
//
//   node scripts/import-au-stocks.js path/to/asx-listed-companies.csv
//
// Market Cap is plain AUD (not scaled); the browser formats it as $ Tn/Bn/Mn.
// Rows with no sector (mainly ETFs in these exports) are grouped as "ETF / Fund".
// The CSV's own first line/date (e.g. "ASX Listed Companies (1 May 2020)") is
// kept as `asOf` so the UI can say how old the snapshot is.

const fs = require("fs");
const path = require("path");

function parseCsv(text) {
  const rows = [];
  let row = [], field = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; } else field += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.length > 1 || row[0] !== "") rows.push(row);
  return rows;
}

const num = (s) => {
  const t = String(s == null ? "" : s).replace(/[,$\s]/g, "");
  if (!t || t === "-") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

function build(csv) {
  const all = parseCsv(csv.replace(/^﻿/, "")).filter((r) => r.some((x) => x !== ""));
  const titleRow = all[0] || [];
  const asOfMatch = /\(([^)]+)\)/.exec(titleRow[0] || "");
  const asOf = asOfMatch ? asOfMatch[1] : null;
  const headerIdx = all.findIndex((r) => /^code$/i.test((r[0] || "").trim()));
  const head = headerIdx >= 0 ? all[headerIdx] : ["Code", "Company", "Sector", "Market Cap", "Weight(%)"];
  const body = all.slice(headerIdx >= 0 ? headerIdx + 1 : 1);
  const col = (re) => head.findIndex((h) => re.test((h || "").trim()));
  const ix = { code: col(/^code$/i), name: col(/^company$/i), sector: col(/^sector$/i), mc: col(/^market cap$/i), w: col(/^weight/i) };
  if (ix.code < 0 || ix.name < 0) throw new Error("This doesn't look like an ASX listed-companies CSV (Code / Company columns missing).");
  const rows = [];
  const seen = new Set();
  for (const r of body) {
    const code = (r[ix.code] || "").trim();
    const name = (r[ix.name] || "").trim();
    if (!code || !name || seen.has(code)) continue;
    seen.add(code);
    const sector = (r[ix.sector] || "").trim() || "ETF / Fund";
    rows.push({ t: code, n: name, sector, mc: num(r[ix.mc]), w: ix.w >= 0 ? num(r[ix.w]) : null });
  }
  rows.sort((a, b) => a.n.localeCompare(b.n));
  const sectors = [...new Set(rows.map((r) => r.sector))].sort();
  return { v: 1, source: "ASX listed companies", asOf, mcUnit: "AUD", sectors, rows };
}

if (require.main === module) {
  const src = process.argv[2];
  if (!src) { console.error("usage: node scripts/import-au-stocks.js <csv>"); process.exit(1); }
  const out = build(fs.readFileSync(src, "utf8"));
  const dest = path.join(__dirname, "..", "public", "au-stocks.json");
  fs.writeFileSync(dest, JSON.stringify(out));
  console.log(`${out.rows.length} companies -> ${path.relative(process.cwd(), dest)}${out.asOf ? ` (as of ${out.asOf})` : ""}`);
}

module.exports = { build, parseCsv };
