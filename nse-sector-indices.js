// Sector Heatmap (India) — live data from NSE's own "SECTORAL INDICES"
// group, which is the actual thing people mean by "Nifty Bank", "Nifty IT",
// "Nifty PSU Bank" and so on. The app's own Sector Heatmap tiles were, until
// this module existed, derived locally by averaging the % change of Nifty 50
// constituents grouped by our own sector label (see groupOf/renderSectorHeatmap
// in public/app.js) — a reasonable fallback, but it can only ever produce a
// tile for a sector that has a Nifty 50 constituent, so sectors like Capital
// Markets, Media, Realty or MNC (no/too-few Nifty 50 names) never showed up,
// and there was no P/E figure at all since that isn't derivable from price
// changes. NSE's own sectoral indices carry both a real % change and a real
// P/E for the sector as a whole, which is what this module fetches.
//
// Data source: https://www.nseindia.com/api/allIndices — NSE's own
// (undocumented, free, no key) JSON API, the same one that backs the
// "Live Market" indices watch pages. Same anti-bot layer as the
// corporate-announcements feed (see nse-announcements.js): a cookie picked
// up from nseindia.com's homepage has to be replayed on the API call, and
// there's no guarantee NSE keeps allowing this from a server IP — if it
// starts blocking (401/403/429), this fails closed with a clear error, and
// the client (public/app.js) falls back to the derived-from-constituents
// heatmap rather than showing nothing.
//
// allIndices lumps every index NSE publishes — broad market (Nifty 50,
// Nifty 500...), sectoral, thematic, strategy — into one flat list, each
// row tagged with a `key` like "BROAD MARKET INDICES" or "SECTORAL INDICES".
// This module only looks at the sectoral group, and inside it matches rows
// to our fixed, known set of sector labels by a normalized/fuzzy test rather
// than an exact string, since the exact index-name spelling NSE uses
// (" NIFTY BANK" vs "NIFTY BANK" vs trailing-whitespace quirks seen on this
// API historically) isn't something this sandbox can verify against a live
// response. A sector whose test doesn't match anything is simply left out of
// the result — never a crash — and the order below matters: more specific
// labels (PSU Bank, Private Bank) are tested before the generic "Bank"
// catch-all so a PSU Bank row never gets claimed by the Bank pattern first.

const WWW = "https://www.nseindia.com";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

// label: shown on the tile and used to line up with data.js's `sector`
// field for Nifty 50 constituents (see public/data.js + the two renames
// that keep "Cons Durables"/"Metal" consistent with these labels).
// test(normalizedName): normalizedName has "NIFTY" stripped, "INDEX"
// stripped, and everything but A-Z removed — see normalize() below.
const SECTORS = [
  { label: "Capital Mkts", test: (n) => n.includes("CAPITALMARKET") || n.includes("CAPITALMKT") },
  { label: "FMCG", test: (n) => n === "FMCG" },
  { label: "Cons Durables", test: (n) => n.includes("CONSUMERDURABLE") || n.includes("CONSRDURBL") },
  { label: "Infra", test: (n) => n.includes("INFRA") },
  { label: "PSU Banks", test: (n) => n.includes("PSUBANK") },
  { label: "Pvt Bank", test: (n) => n.includes("PRIVATEBANK") || n.includes("PVTBANK") },
  { label: "Media", test: (n) => n === "MEDIA" },
  { label: "Energy", test: (n) => n === "ENERGY" },
  { label: "Commodities", test: (n) => n.includes("COMMODIT") },
  { label: "Realty", test: (n) => n.includes("REALTY") },
  { label: "Bank", test: (n) => n === "BANK" },
  { label: "Fin Services", test: (n) => n.includes("FINANCIALSERVICE") || n.includes("FINSERV") },
  { label: "Services", test: (n) => n.includes("SERVICESSECTOR") || n.includes("SERVSECTOR") },
  { label: "Oil & Gas", test: (n) => n.includes("OILGAS") },
  { label: "Metal", test: (n) => n === "METAL" },
  { label: "Auto", test: (n) => n === "AUTO" },
  { label: "MNC", test: (n) => n === "MNC" },
  { label: "IT", test: (n) => n === "IT" },
  { label: "Pharma", test: (n) => n === "PHARMA" },
  { label: "Healthcare", test: (n) => n.includes("HEALTHCARE") },
];

function normalize(name) {
  return String(name || "")
    .toUpperCase()
    .replace(/^NIFTY\s*/, "")
    .replace(/\bINDEX\b/g, "")
    .replace(/[^A-Z]/g, "");
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Only rows tagged as a sectoral index are eligible — allIndices also
// returns broad-market and thematic/strategy indices under the same flat
// list, and those share enough naming (e.g. "NIFTY100 ...") to risk a false
// match if not excluded up front.
function isSectoral(row) {
  const key = String(row?.key || row?.indexType || "").toUpperCase();
  return key.includes("SECTOR");
}

// Assigns each NSE sectoral-index row to at most one of our target labels,
// first match wins, each row used at most once. A label with no matching
// row is simply omitted from the result.
function pickSectors(rows) {
  const used = new Set();
  const out = [];
  for (const def of SECTORS) {
    let hit = null;
    for (let i = 0; i < rows.length; i++) {
      if (used.has(i)) continue;
      const name = normalize(rows[i].index || rows[i].indexSymbol || rows[i].indexName);
      if (def.test(name)) { hit = rows[i]; used.add(i); break; }
    }
    if (hit) {
      out.push({
        label: def.label,
        name: hit.index || hit.indexSymbol || hit.indexName || def.label,
        pct: num(hit.percentChange ?? hit.perChange),
        pe: num(hit.pe),
      });
    }
  }
  return out;
}

function createNseSectorIndices({
  fetchImpl = fetch,
  wwwBase = WWW,
  cacheMs = 30_000,
} = {}) {
  let cookieJar = null; // "name=value; name2=value2"
  let cookieAt = 0;
  const COOKIE_TTL = 10 * 60 * 1000;
  let cached = null;
  let cachedAt = 0;

  async function primeCookies() {
    if (cookieJar && Date.now() - cookieAt < COOKIE_TTL) return cookieJar;
    const res = await fetchImpl(`${wwwBase}/`, {
      headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml", "Accept-Language": "en-US,en;q=0.9" },
    });
    const set = typeof res.headers?.getSetCookie === "function" ? res.headers.getSetCookie() : res.headers?.raw?.()["set-cookie"] || [];
    const jar = (Array.isArray(set) ? set : set ? [set] : []).map((c) => c.split(";")[0]).join("; ");
    cookieJar = jar || null;
    cookieAt = Date.now();
    return cookieJar;
  }

  async function fetchSectors() {
    if (cached && Date.now() - cachedAt < cacheMs) return cached;
    const cookie = await primeCookies();
    const res = await fetchImpl(`${wwwBase}/api/allIndices`, {
      headers: {
        "User-Agent": UA,
        Accept: "application/json, text/plain, */*",
        Referer: `${wwwBase}/market-data/live-equity-market`,
        ...(cookie ? { Cookie: cookie } : {}),
      },
    });
    if (res.status === 401 || res.status === 403) throw Object.assign(new Error("NSE blocked this server's request for sector indices."), { status: 502, code: "blocked" });
    if (res.status === 429) throw Object.assign(new Error("NSE is rate-limiting requests right now. Try again shortly."), { status: 429, code: "rate_limited" });
    if (!res.ok) throw Object.assign(new Error(`NSE responded ${res.status}`), { status: 502, code: "upstream" });
    const json = await res.json().catch(() => null);
    const rows = Array.isArray(json?.data) ? json.data : null;
    if (!rows) throw Object.assign(new Error("NSE returned a page this app couldn't read."), { status: 502, code: "unreadable" });

    const sectoral = rows.filter(isSectoral);
    // Fall back to matching across every row if nothing was tagged as
    // sectoral — a defensive path in case NSE's `key` field is spelled or
    // shaped differently than expected, since this can't be checked live.
    const sectors = pickSectors(sectoral.length ? sectoral : rows);
    const result = { asOf: new Date().toISOString(), sectors };
    cached = result;
    cachedAt = Date.now();
    return result;
  }

  async function handler(req, res) {
    try {
      res.set("Cache-Control", "public, max-age=30");
      res.json(await fetchSectors());
    } catch (err) {
      res.status(err.status || 502).json({ error: err.code || "nse_error", message: err.message });
    }
  }
  handler.get = fetchSectors;
  return handler;
}

module.exports = { createNseSectorIndices, normalize, pickSectors, isSectoral, SECTORS };
