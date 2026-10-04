// Server-side view of public/companies.json (built by scripts/import-companies.js
// from a BSE/NSE company-list CSV): ticker/BSE code -> name + industry.

function createDirectory(data) {
  const byNse = new Map();
  const byBse = new Map();
  if (data && Array.isArray(data.rows)) {
    for (const [name, nse, bse, isin, ind] of data.rows) {
      const [industry, g] = data.industries[ind] || ["Unclassified", -1];
      const rec = { name, nse: nse || null, bse: bse || null, isin: isin || null, industry, group: data.groups[g] || "Unclassified" };
      if (nse) byNse.set(nse, rec);
      if (bse) byBse.set(bse, rec);
    }
  }
  return {
    size: byNse.size + byBse.size,
    // Accepts an NSE ticker ("GRASIM") or a BSE scrip code ("500300").
    find(code) {
      const c = String(code || "").trim().toUpperCase();
      return byNse.get(c) || byBse.get(c) || null;
    },
  };
}

function loadDefault() {
  try {
    return createDirectory(require("./public/companies.json"));
  } catch {
    return createDirectory(null); // list missing: lookups just won't carry industry
  }
}

module.exports = { createDirectory, loadDefault };
