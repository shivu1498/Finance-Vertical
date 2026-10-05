// Index constituents + live 1-day % change, for the Market Breadth panel's
// index-universe filter (Nifty 50 / Next 50 / Midcap 50 / ... / Total
// Market — the same ~21 indices NSE's own live heatmap page lets you pick
// from: https://www.nseindia.com/market-data/live-market-indices/heatmap).
//
// Data source: https://www.nseindia.com/api/equity-stockIndices?index=... —
// the undocumented JSON API behind that heatmap page (and NSE's per-index
// "stocks in this index" pages generally). Same anti-bot layer as the other
// NSE integrations in this app (nse-announcements.js, nse-sector-indices.js):
// a cookie picked up from nseindia.com's homepage has to be replayed on the
// API call, and there's no guarantee NSE keeps allowing this from a server
// IP — if it starts blocking (401/403/429), this fails closed with a clear
// error, and the client falls back to the plain Nifty-50-only breadth it
// already computes locally from live quotes.
//
// This endpoint's exact response shape couldn't be verified against a live
// call (nseindia.com is unreachable from this sandbox), so field access is
// deliberately defensive — several plausible field-name spellings are
// tried for both the stock symbol and its % change, and a row is simply
// skipped (not a crash) if none of them parse. The one thing assumed with
// more confidence is that `data` is an array of per-stock rows, since
// that's the shape every other NSE JSON endpoint in this app uses.

const WWW = "https://www.nseindia.com";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const HEATMAP_PATH = "/market-data/live-market-indices/heatmap";

// slug: used in the UI/URL. label: NSE's own display name, also passed
// verbatim as the `index` query param (NSE's stock-index pages key off
// this exact string). approxSize: rough constituent count, just to flag
// the heavy universes in comments/UI copy — not used for any logic.
const INDEX_UNIVERSES = [
  { slug: "nifty50", label: "NIFTY 50", approxSize: 50 },
  { slug: "niftynext50", label: "NIFTY NEXT 50", approxSize: 50 },
  { slug: "niftymidcap50", label: "NIFTY MIDCAP 50", approxSize: 50 },
  { slug: "niftymidcap100", label: "NIFTY MIDCAP 100", approxSize: 100 },
  { slug: "niftymidcap150", label: "NIFTY MIDCAP 150", approxSize: 150 },
  { slug: "niftysmallcap50", label: "NIFTY SMALLCAP 50", approxSize: 50 },
  { slug: "niftysmallcap100", label: "NIFTY SMALLCAP 100", approxSize: 100 },
  { slug: "niftysmallcap250", label: "NIFTY SMALLCAP 250", approxSize: 250 },
  { slug: "niftymidsmallcap400", label: "NIFTY MIDSMALLCAP 400", approxSize: 400 },
  { slug: "nifty100", label: "NIFTY 100", approxSize: 100 },
  { slug: "nifty200", label: "NIFTY 200", approxSize: 200 },
  { slug: "nifty500multicap502525", label: "NIFTY500 MULTICAP 50:25:25", approxSize: 500 },
  { slug: "niftylargemidcap250", label: "NIFTY LARGEMIDCAP 250", approxSize: 250 },
  { slug: "niftymidcapselect", label: "NIFTY MIDCAP SELECT", approxSize: 25 },
  { slug: "niftytotalmarket", label: "NIFTY TOTAL MARKET", approxSize: 750 },
  { slug: "niftymicrocap250", label: "NIFTY MICROCAP 250", approxSize: 250 },
  { slug: "nifty500", label: "NIFTY 500", approxSize: 500 },
  { slug: "niftyindiafpi150", label: "NIFTY INDIA FPI 150", approxSize: 150 },
  { slug: "nifty500largemidsmallequalcap", label: "NIFTY500 LARGEMIDSMALL EQUAL-CAP WEIGHTED", approxSize: 500 },
  { slug: "niftymidsmallcap4005050", label: "NIFTY MIDSMALLCAP400 50:50", approxSize: 400 },
  { slug: "niftysmallcap500", label: "NIFTY SMALLCAP 500", approxSize: 500 },
];
const UNIVERSE_BY_SLUG = new Map(INDEX_UNIVERSES.map((u) => [u.slug, u]));

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Best-effort extraction of a stock row's symbol and 1D % change, across
// the several field-name spellings NSE's various equity JSON endpoints are
// known to use elsewhere (see nse-sector-indices.js's pct/percentChange,
// nse-announcements.js's sm_name-style fields).
function pickSymbol(row) {
  const s = row?.symbol || row?.symbolName || row?.identifier;
  return typeof s === "string" && s.trim() ? s.trim() : null;
}
function pickPChange(row) {
  const direct = num(row?.pChange ?? row?.perChange ?? row?.percentChange);
  if (direct != null) return direct;
  const last = num(row?.lastPrice ?? row?.ltp ?? row?.close);
  const prev = num(row?.previousClose ?? row?.prevClose);
  return last != null && prev ? ((last - prev) / prev) * 100 : null;
}

// Rows for the index's own aggregate line (some NSE index-constituent
// endpoints prepend one) are excluded by symbol matching the index name.
function parseConstituents(json, label) {
  const rows = Array.isArray(json?.data) ? json.data : null;
  if (!rows) return null;
  const upper = label.toUpperCase();
  const out = [];
  for (const row of rows) {
    const symbol = pickSymbol(row);
    if (!symbol || symbol.toUpperCase() === upper) continue;
    out.push({ symbol, pChange: pickPChange(row) });
  }
  return out;
}

function createNseIndexBreadth({
  fetchImpl = fetch,
  wwwBase = WWW,
  cacheMs = 30_000,
} = {}) {
  let cookieJar = null;
  let cookieAt = 0;
  const COOKIE_TTL = 10 * 60 * 1000;
  const cache = new Map(); // slug -> { at, result }

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

  async function fetchUniverse(slug) {
    const universe = UNIVERSE_BY_SLUG.get(slug);
    if (!universe) throw Object.assign(new Error(`unknown index universe "${slug}"`), { status: 400, code: "unknown_universe" });

    const cached = cache.get(slug);
    if (cached && Date.now() - cached.at < cacheMs) return cached.result;

    const cookie = await primeCookies();
    const url = `${wwwBase}/api/equity-stockIndices?index=${encodeURIComponent(universe.label)}`;
    const res = await fetchImpl(url, {
      headers: {
        "User-Agent": UA,
        Accept: "application/json, text/plain, */*",
        Referer: `${wwwBase}${HEATMAP_PATH}`,
        ...(cookie ? { Cookie: cookie } : {}),
      },
    });
    if (res.status === 401 || res.status === 403) throw Object.assign(new Error("NSE blocked this server's request for index constituents."), { status: 502, code: "blocked" });
    if (res.status === 429) throw Object.assign(new Error("NSE is rate-limiting requests right now. Try again shortly."), { status: 429, code: "rate_limited" });
    if (!res.ok) throw Object.assign(new Error(`NSE responded ${res.status}`), { status: 502, code: "upstream" });
    const json = await res.json().catch(() => null);
    const stocks = parseConstituents(json, universe.label);
    if (!stocks) throw Object.assign(new Error("NSE returned a page this app couldn't read."), { status: 502, code: "unreadable" });

    const result = { asOf: new Date().toISOString(), slug, label: universe.label, stocks };
    cache.set(slug, { at: Date.now(), result });
    return result;
  }

  async function handler(req, res) {
    const slug = (req.query.universe || "nifty50").toString();
    try {
      res.set("Cache-Control", "public, max-age=30");
      res.json(await fetchUniverse(slug));
    } catch (err) {
      res.status(err.status || 502).json({ error: err.code || "nse_error", message: err.message });
    }
  }
  handler.get = fetchUniverse;
  return handler;
}

module.exports = { createNseIndexBreadth, INDEX_UNIVERSES, UNIVERSE_BY_SLUG, parseConstituents, pickSymbol, pickPChange };
