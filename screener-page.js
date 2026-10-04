// Parser for a full Screener.in company page (and its peers fragment).
//
// Screener has no public API, so this reads the HTML the site serves. It is
// written defensively: every part is optional, and a part that can't be found
// comes back empty instead of failing the whole page. It will need updating if
// Screener changes its markup. Used only by screener.js, with the person's own
// logged-in session cookie.

const decode = (s) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&#8377;|&#x20b9;/gi, "₹")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'");

// Plain text of an HTML fragment (buttons/scripts/styles dropped).
function text(html) {
  return decode(
    String(html || "")
      .replace(/<(script|style|button)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<[^>]*>/g, " ")
  )
    .replace(/\s+/g, " ")
    .trim();
}

function section(html, id) {
  const i = html.indexOf(`<section id="${id}"`);
  if (i < 0) return null;
  const j = html.indexOf("</section>", i);
  return html.slice(i, j < 0 ? undefined : j);
}

// First <table> (optionally the Nth) in a fragment -> { headers, rows }.
// A row is { name, values[], strong, href }.
function parseTable(html, nth = 0) {
  const tables = [...String(html || "").matchAll(/<table[^>]*>([\s\S]*?)<\/table>/gi)].filter((m) => !/ranges-table/.test(m[0].slice(0, 200)));
  const t = tables[nth];
  if (!t) return null;
  const headers = [];
  const rows = [];
  for (const tr of t[1].matchAll(/<tr([^>]*)>([\s\S]*?)<\/tr>/gi)) {
    const attrs = tr[1];
    const inner = tr[2];
    if (/<th[\s>]/i.test(inner) && !/<td[\s>]/i.test(inner)) {
      if (!headers.length) for (const th of inner.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/gi)) headers.push(text(th[1]));
      continue;
    }
    const tds = [...inner.matchAll(/<td([^>]*)>([\s\S]*?)<\/td>/gi)];
    if (!tds.length) continue;
    const hrefCell = tds.find((c) => /<a[^>]*href="/i.test(c[2]));
    const href = hrefCell ? (hrefCell[2].match(/<a[^>]*href="([^"]+)"/i) || [])[1] : null;
    rows.push({
      name: text(tds[0][2]),
      values: tds.slice(1).map((c) => text(c[2])),
      cells: tds.map((c) => text(c[2])),
      strong: /\bstrong\b/.test(attrs),
      href: href || null,
    });
  }
  if (!headers.length && !rows.length) return null;
  return { headers, rows };
}

// "Compounded Sales Growth: 10 Years / 5 Years / 3 Years / TTM" blocks.
function parseRanges(html) {
  const out = [];
  for (const t of String(html || "").matchAll(/<table[^>]*ranges-table[^>]*>([\s\S]*?)<\/table>/gi)) {
    const title = text((t[1].match(/<th[^>]*>([\s\S]*?)<\/th>/i) || [])[1]);
    const rows = [...t[1].matchAll(/<tr[^>]*>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/gi)].map((r) => [text(r[1]).replace(/:$/, ""), text(r[2])]);
    if (title && rows.length) out.push({ title, rows });
  }
  return out;
}

function listItems(html) {
  return [...String(html || "").matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)].map((m) => text(m[1])).filter(Boolean);
}

// The "Consolidated Figures in Rs. Crores" line under a section title.
function basis(sec) {
  if (!sec) return "";
  const p = sec.match(/<p[^>]*class="[^"]*\bsub\b[^"]*"[^>]*>([\s\S]*?)<\/p>/i);
  return p ? text(p[1].replace(/<a[\s\S]*?<\/a>/gi, "")).replace(/\s*\/\s*$/, "") : "";
}

function parseTopRatios(html) {
  const ul = html.match(/<ul[^>]*id="top-ratios"[^>]*>([\s\S]*?)<\/ul>/);
  const ratios = [];
  if (!ul) return ratios;
  for (const li of ul[1].matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)) {
    const nm = li[1].match(/<span[^>]*class="name"[^>]*>([\s\S]*?)<\/span>/);
    if (!nm) continue;
    const name = text(nm[1]);
    const value = text(li[1].slice(li[1].indexOf(nm[0]) + nm[0].length));
    if (name && value) ratios.push({ name, value });
  }
  return ratios;
}

function parseHeader(html) {
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
  const links = { website: null, bse: null, nse: null };
  const box = html.match(/<div[^>]*class="[^"]*company-links[^"]*"[^>]*>([\s\S]*?)<\/div>/);
  if (box) {
    for (const a of box[1].matchAll(/<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)) {
      const t = text(a[2]);
      if (/^BSE:/i.test(t)) links.bse = t.replace(/^BSE:\s*/i, "");
      else if (/^NSE:/i.test(t)) links.nse = t.replace(/^NSE:\s*/i, "");
      else if (!links.website && /^https?:/i.test(a[1])) links.website = { href: a[1], label: t };
    }
  }
  // Day change sits next to the price in the header: class "up" / "down".
  const topAt = html.indexOf('id="top"');
  const near = html.slice(topAt < 0 ? 0 : topAt, (topAt < 0 ? 0 : topAt) + 8000);
  const ch = near.match(/class="[^"]*\b(up|down)\b[^"]*"[^>]*>\s*([-+]?[\d.,]+)\s*%/);
  return {
    name: h1 ? text(h1[1]) : null,
    links,
    change: ch ? { pct: Number(ch[2].replace(/,/g, "")) * (ch[1] === "down" && !/^-/.test(ch[2]) ? -1 : 1) } : null,
  };
}

function parseAbout(html) {
  const profile = html.match(/<div[^>]*class="[^"]*company-profile[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/) ||
    html.match(/<div[^>]*class="[^"]*company-profile[^"]*"[^>]*>([\s\S]*)/);
  const scope = profile ? profile[1] : "";
  const about = (scope.match(/<div[^>]*class="[^"]*\babout\b[^"]*"[^>]*>([\s\S]*?)<\/div>/) || [])[1];
  const key = scope.match(/<div[^>]*class="[^"]*commentary[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/) ||
    scope.match(/<div[^>]*class="[^"]*commentary[^"]*"[^>]*>([\s\S]*?)<\/div>/);
  return {
    about: about ? text(about).replace(/\[\d+\]/g, "") : "",
    keyPoints: key ? [...key[1].matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)].map((p) => text(p[1]).replace(/\[\d+\]/g, "")).filter(Boolean) : [],
  };
}

function parseProsCons(html) {
  const pick = (cls) => {
    const m = html.match(new RegExp(`<div[^>]*class="[^"]*\\b${cls}\\b[^"]*"[^>]*>([\\s\\S]*?)</div>`));
    return m ? listItems(m[1]) : [];
  };
  return { pros: pick("pros"), cons: pick("cons") };
}

function parseShareholding(sec) {
  if (!sec) return null;
  const q = sec.match(/<div[^>]*id="quarterly-shp"[^>]*>([\s\S]*?)(?=<div[^>]*id="yearly-shp"|$)/);
  const y = sec.match(/<div[^>]*id="yearly-shp"[^>]*>([\s\S]*)/);
  const quarterly = parseTable(q ? q[1] : sec);
  const yearly = y ? parseTable(y[1]) : null;
  return quarterly || yearly ? { quarterly, yearly } : null;
}

// Whole company page -> structured data. `html` is the company page itself.
function parseFullPage(html) {
  const ratios = parseTopRatios(html);
  const head = parseHeader(html);
  const priceRatio = ratios.find((r) => /^current price/i.test(r.name));
  const wid = (html.match(/data-warehouse-id="(\d+)"/) || [])[1] || null;
  const analysis = section(html, "analysis");
  const pl = section(html, "profit-loss");
  const peersSec = section(html, "peers");
  const path = peersSec ? [...peersSec.matchAll(/<a[^>]*href="\/market\/[^"]*"[^>]*>([\s\S]*?)<\/a>/g)].map((m) => text(m[1])).filter(Boolean) : [];

  const tbl = (id) => {
    const sec = section(html, id);
    const t = sec ? parseTable(sec) : null;
    return t ? { ...t, basis: basis(sec) } : null;
  };

  return {
    ...head,
    price: priceRatio ? priceRatio.value : null,
    ratios,
    ...parseAbout(html),
    ...parseProsCons(analysis || html),
    warehouseId: wid,
    path,
    tables: {
      quarters: tbl("quarters"),
      profitLoss: tbl("profit-loss"),
      balanceSheet: tbl("balance-sheet"),
      cashFlow: tbl("cash-flow"),
      ratios: tbl("ratios"),
      shareholding: parseShareholding(section(html, "shareholding")),
    },
    ranges: parseRanges(pl || ""),
  };
}

// Peers come from a separate ajax fragment: a single data table.
function parsePeers(html) {
  const t = parseTable(html);
  if (!t) return null;
  const rows = t.rows.map((r) => {
    const sym = r.href ? (r.href.match(/\/company\/([^/]+)\//) || [])[1] || null : null;
    // Columns are S.No., Name, then figures; the Median footer has no S.No.
    return { ...r, name: r.cells[1] || r.cells[0] || "", symbol: sym ? decodeURIComponent(sym) : null };
  });
  return { headers: t.headers, rows };
}

module.exports = { parseFullPage, parsePeers, parseTable, parseRanges, text };
