#!/usr/bin/env node
// Builds public/companies.json from a BSE/NSE company-list CSV.
//
//   node scripts/import-companies.js path/to/bse-nse-company-list.csv
//
// Expected columns: Name, BSE Code, NSE Code, ISIN Code, Industry Group, Industry.
// Rows with neither an NSE nor a BSE code are dropped (nothing to look up by).
// Blank industries become "Unclassified". Output is dictionary-encoded to stay
// small (the browser downloads it): industries point at groups, rows at industries.

const fs = require("fs");
const path = require("path");

// Minimal RFC-4180 parser: quoted fields, "" escapes, CRLF/LF.
function parseCsv(text) {
  const rows = [];
  let row = [], field = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else q = false;
      } else field += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((x) => x !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); if (row.some((x) => x !== "")) rows.push(row); }
  return rows;
}

function build(csvText) {
  const [head, ...body] = parseCsv(csvText.replace(/^﻿/, ""));
  const col = Object.fromEntries(head.map((h, i) => [h.trim(), i]));
  for (const need of ["Name", "BSE Code", "NSE Code", "ISIN Code", "Industry Group", "Industry"]) {
    if (!(need in col)) throw new Error(`missing column "${need}"`);
  }
  const get = (r, k) => (r[col[k]] || "").trim();

  const groups = [], industries = [];
  const gIdx = new Map(), iIdx = new Map();
  const group = (g) => {
    if (!gIdx.has(g)) { gIdx.set(g, groups.length); groups.push(g); }
    return gIdx.get(g);
  };
  const industry = (g, i) => {
    const key = g + "\u0000" + i;
    if (!iIdx.has(key)) { iIdx.set(key, industries.length); industries.push([i, group(g)]); }
    return iIdx.get(key);
  };

  const rows = [];
  const seen = new Set();
  let dropped = 0, dupes = 0;
  for (const r of body) {
    const nse = get(r, "NSE Code").toUpperCase(), bse = get(r, "BSE Code");
    if (!nse && !bse) { dropped++; continue; }
    const isin = get(r, "ISIN Code");
    const key = isin || nse || bse;
    if (seen.has(key)) { dupes++; continue; }
    seen.add(key);
    const g = get(r, "Industry Group") || "Unclassified";
    const i = get(r, "Industry") || "Unclassified";
    rows.push([get(r, "Name"), nse, bse, isin, industry(g, i)]);
  }
  rows.sort((a, b) => a[0].localeCompare(b[0], "en", { sensitivity: "base" }));
  return { data: { v: 1, groups, industries, rows }, dropped, dupes };
}

if (require.main === module) {
  const src = process.argv[2];
  if (!src) { console.error("usage: node scripts/import-companies.js <company-list.csv>"); process.exit(1); }
  const { data, dropped, dupes } = build(fs.readFileSync(src, "utf8"));
  const out = path.join(__dirname, "..", "public", "companies.json");
  fs.writeFileSync(out, JSON.stringify(data));
  console.log(`wrote ${out}: ${data.rows.length} companies, ${data.groups.length} industry groups, ${data.industries.length} industries (dropped ${dropped} without a ticker, ${dupes} duplicates)`);
}

module.exports = { parseCsv, build };
