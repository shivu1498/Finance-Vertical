#!/usr/bin/env node
// Merges an NYSE ticker list (the plain "ACT Symbol,Company Name" export NYSE
// itself publishes) into public/us-stocks.json, adding every symbol not
// already there. Existing entries (currently the 23 richer Dhan-sourced
// companies: price, market cap, P/E, returns, ...) are left untouched and
// win on ticker collisions; everything new from this file gets a name,
// ticker and exchange="NYSE" with the financial columns left null (the UI
// shows "—" for those — live price/change come from Yahoo Finance instead,
// at render time, for every row regardless of source).
//
//   node scripts/import-nyse-listed.js path/to/nyse-listed.csv [us-stocks.json]

const fs = require("fs");
const path = require("path");
const { parseCsv } = require("./import-us-stocks");

function build(csv, existing) {
  const [head, ...body] = parseCsv(csv.replace(/^﻿/, ""));
  const ixSym = head.findIndex((h) => /^act symbol$/i.test((h || "").trim()));
  const ixName = head.findIndex((h) => /^company name$/i.test((h || "").trim()));
  if (ixSym < 0 || ixName < 0) throw new Error("This doesn't look like the NYSE listed-companies CSV (ACT Symbol / Company Name columns missing).");

  const have = new Set(existing.rows.map((r) => String(r.t || "").toUpperCase()));
  const added = [];
  for (const r of body) {
    const t = (r[ixSym] || "").trim().toUpperCase();
    const n = (r[ixName] || "").trim().replace(/\s+/g, " ");
    if (!t || !n || have.has(t)) continue;
    have.add(t);
    added.push({ n, t, x: "NYSE", p: null, c: null, vol: null, mc: null, pe: null, ipe: null, hi: null, r1m: null, r3m: null, r1y: null, r3y: null, r5y: null, roe: null, roce: null });
  }
  const rows = existing.rows.concat(added).sort((a, b) => a.n.localeCompare(b.n));
  return { out: { ...existing, rows }, addedCount: added.length };
}

if (require.main === module) {
  const src = process.argv[2];
  const destPath = path.resolve(process.argv[3] || path.join(__dirname, "..", "public", "us-stocks.json"));
  if (!src) { console.error("usage: node scripts/import-nyse-listed.js <csv> [us-stocks.json]"); process.exit(1); }
  const existing = JSON.parse(fs.readFileSync(destPath, "utf8"));
  const { out, addedCount } = build(fs.readFileSync(src, "utf8"), existing);
  fs.writeFileSync(destPath, JSON.stringify(out));
  console.log(`+${addedCount} NYSE tickers merged -> ${path.relative(process.cwd(), destPath)} (now ${out.rows.length} companies total)`);
}

module.exports = { build };
