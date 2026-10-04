// Connects an NSE ticker to its company page on Tijori Finance.
//
//   ticker -> company name -> Tijori slug -> verified Tijori page URL
//
// The company name comes from Screener.in when SCREENER_SESSIONID is set (it
// has no public API, see screener.js), otherwise from Yahoo Finance, which is
// already used for quotes. Tijori page URLs are
//   https://www.tijorifinance.com/company/<name-slug>/
// where the slug is the company's legal name ("Grasim Industries Ltd." ->
// grasim-industries-limited, "Mahindra & Mahindra Ltd." ->
// mahindra-mahindra-limited). Tijori answers an unknown slug with its home
// page rather than a 404, so a candidate only counts as a match when it stays
// on /company/... AND the page mentions both the ticker and the company name.
//
// Nothing here copies Tijori's content; it only finds and verifies the link.

const TIJORI_BASE = process.env.TIJORI_BASE || "https://www.tijorifinance.com";
const YAHOO_BASE = process.env.YAHOO_BASE || "https://query1.finance.yahoo.com";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const TICKER_RE = /^[A-Z0-9&-]{1,20}$/;
const HIT_TTL = 24 * 60 * 60 * 1000;
const MISS_TTL = 10 * 60 * 1000;
const MAX_CANDIDATES = 3;
const TIMEOUT_MS = 7000;

// "grasim.ns", "NSE:GRASIM", " Grasim " -> "GRASIM"; anything odd -> null.
function normalizeTicker(raw) {
  let t = String(raw || "").trim().toUpperCase();
  t = t.replace(/^(NSE|BSE):/, "").replace(/\.(NS|BO)$/, "");
  return TICKER_RE.test(t) ? t : null;
}

// Likely Tijori slugs for a legal company name, best guess first.
function slugCandidates(name) {
  const tokens = String(name || "")
    .toLowerCase()
    .replace(/&/g, " & ")
    .replace(/[^a-z0-9&]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .map((t) => (t === "ltd" ? "limited" : t));
  if (!tokens.length) return [];

  const join = (list) => list.join("-");
  const noAmp = tokens.filter((t) => t !== "&");
  const withAnd = tokens.map((t) => (t === "&" ? "and" : t));
  const out = [join(noAmp), join(withAnd)];
  if (noAmp[noAmp.length - 1] !== "limited") out.push(join([...noAmp, "limited"]));
  return [...new Set(out)].filter(Boolean).slice(0, MAX_CANDIDATES);
}

// The page counts as the company's page only if it names the ticker as a whole
// word and also contains the company's first name word.
function pageMatches(html, ticker, name) {
  const text = html.replace(/&amp;/g, "&");
  const escTicker = ticker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const tickerRe = new RegExp(`(^|[^A-Za-z0-9&-])${escTicker}([^A-Za-z0-9&-]|$)`);
  const core = String(name || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)[0];
  return tickerRe.test(text) && (!core || text.toLowerCase().includes(core));
}

function withTimeout(ms) {
  return typeof AbortSignal !== "undefined" && AbortSignal.timeout ? AbortSignal.timeout(ms) : undefined;
}

function createResolver({
  fetchImpl = (...a) => fetch(...a),
  screenerLookup = null,
  tijoriBase = TIJORI_BASE,
  yahooBase = YAHOO_BASE,
  now = () => Date.now(),
} = {}) {
  const cache = new Map(); // ticker -> { data, exp }

  async function nameFromScreener(ticker) {
    if (!screenerLookup) return null;
    try {
      const d = await screenerLookup(ticker);
      if (d && d.companyName) return { name: d.companyName, source: "screener", screenerUrl: d.url || null };
    } catch {
      // not configured / session expired / not listed: fall through to Yahoo
    }
    return null;
  }

  async function nameFromYahoo(ticker) {
    for (const suffix of [".NS", ".BO"]) {
      try {
        const res = await fetchImpl(
          `${yahooBase}/v8/finance/chart/${encodeURIComponent(ticker + suffix)}?interval=1d&range=1d`,
          { headers: { "User-Agent": UA, Accept: "application/json" }, signal: withTimeout(TIMEOUT_MS) }
        );
        if (!res.ok) continue;
        const meta = (await res.json())?.chart?.result?.[0]?.meta || {};
        const name = meta.longName || meta.shortName;
        if (name) return { name, source: "yahoo", screenerUrl: null };
      } catch {
        // try the next exchange suffix
      }
    }
    return null;
  }

  // "ok" = confirmed company page, "miss" = not this company, "error" = couldn't tell
  async function probe(slug, ticker, name) {
    const url = `${tijoriBase}/company/${slug}/`;
    try {
      const res = await fetchImpl(url, {
        headers: { "User-Agent": UA, Accept: "text/html" },
        redirect: "follow",
        signal: withTimeout(TIMEOUT_MS),
      });
      if (res.status === 404) return { state: "miss", url };
      if (!res.ok) return { state: "error", url };
      let path = "";
      try {
        path = new URL(res.url || url).pathname;
      } catch {
        path = new URL(url).pathname;
      }
      if (!path.startsWith("/company/")) return { state: "miss", url };
      return { state: pageMatches(await res.text(), ticker, name) ? "ok" : "miss", url };
    } catch {
      return { state: "error", url };
    }
  }

  async function compute(ticker) {
    const screenerPage = `https://www.screener.in/company/${encodeURIComponent(ticker)}/consolidated/`;
    const named = (await nameFromScreener(ticker)) || (await nameFromYahoo(ticker));
    if (!named) {
      return { ticker, name: null, nameSource: null, screenerUrl: screenerPage, tijori: { status: "no_name" } };
    }

    const base = { ticker, name: named.name, nameSource: named.source, screenerUrl: named.screenerUrl || screenerPage };
    const candidates = slugCandidates(named.name);
    let firstGuess = null;
    let sawError = false;
    for (const slug of candidates) {
      const r = await probe(slug, ticker, named.name);
      firstGuess = firstGuess || { slug, url: r.url };
      if (r.state === "ok") {
        return { ...base, tijori: { status: "verified", slug, url: `${r.url}#knowledgebase` } };
      }
      if (r.state === "error") sawError = true;
    }
    if (sawError && firstGuess) {
      // Tijori couldn't be checked (blocked/timeout): offer the best guess, flagged.
      return { ...base, tijori: { status: "unverified", slug: firstGuess.slug, url: `${firstGuess.url}#knowledgebase` } };
    }
    return { ...base, tijori: { status: "not_found" } };
  }

  async function resolve(rawTicker) {
    const ticker = normalizeTicker(rawTicker);
    if (!ticker) {
      const err = new Error("invalid ticker");
      err.status = 400;
      throw err;
    }
    const hit = cache.get(ticker);
    if (hit && hit.exp > now()) return hit.data;

    const data = await compute(ticker);
    const durable = data.tijori.status === "verified";
    cache.set(ticker, { data, exp: now() + (durable ? HIT_TTL : MISS_TTL) });
    return data;
  }

  return { resolve };
}

// Lazy-require express so the pure helpers above can be unit-tested without it.
function createRouter(resolver) {
  const router = require("express").Router();
  router.get("/resolve", async (req, res) => {
    try {
      const data = await resolver.resolve(req.query.ticker);
      if (data.tijori.status === "verified") {
        res.set("Cache-Control", "public, s-maxage=86400, stale-while-revalidate=604800");
      }
      res.json(data);
    } catch (err) {
      res.status(err.status || 502).json({ error: "tijori_error", message: err.message });
    }
  });
  return router;
}

module.exports = { createResolver, createRouter, normalizeTicker, slugCandidates, pageMatches };
