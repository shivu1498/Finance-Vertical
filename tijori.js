// Connects an NSE ticker to its company page on Tijori Finance.
//
//   ticker -> company name -> Tijori slug (from Tijori's search) -> verified page URL
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
// From the verified page we also read the Knowledge Base link list (titles,
// authors and outbound URLs only, see parseKnowledgeBase) so the app can show
// it inline; results are cached for a day per ticker.

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
function pageMatches(html, tickers, name) {
  const text = html.replace(/&amp;/g, "&");
  const ids = [].concat(tickers).filter(Boolean);
  const hasId = ids.some((id) => {
    const esc = String(id).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^A-Za-z0-9&-])${esc}([^A-Za-z0-9&-]|$)`).test(text);
  });
  const core = String(name || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)[0];
  return hasId && (!core || text.toLowerCase().includes(core));
}

// ---- Knowledge Base links ----
//
// The company page is server-rendered. Its Knowledge Base section reads, in
// document order:
//   Discussions & Analysis
//   <group title>                       e.g. "Cement"
//   <a href="https://...">Title</a> - Author
//   ...
//   Submit your Links                   (end of section)
// We don't depend on Tijori's class names: the section is cut out between
// those markers and split into blocks at block-level tags. A block with an
// outbound link is a link row (the rest of its text is the author); a short
// block of plain text is a group title. Only titles, authors and URLs are
// kept, and every link points at the original author's content.

const MAX_KB_LINKS = 400;
const BLOCK_TAGS = new Set(
  "div p li ul ol h1 h2 h3 h4 h5 h6 section article header footer nav br hr tr td th table tbody thead dl dt dd button form label aside main figure".split(" ")
);
const SKIP_TITLES = /^(knowledge\s*base|discussions\s*&\s*analysis|discussions and analysis|submit.*|show (more|less)|view (more|all)|load more)$/i;

function decodeEntities(s) {
  return String(s)
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&ndash;/g, "–")
    .replace(/&mdash;/g, "—")
    .replace(/&amp;/g, "&");
}
const clean = (s) => decodeEntities(s).replace(/\s+/g, " ").trim();

// The Knowledge Base slice of the page, or "" when the page has none.
function kbSlice(html) {
  const src = String(html || "");
  const anchor = Math.max(src.search(/id=["']knowledge-?base["']/i), 0);
  const endAt = src.slice(anchor).search(/Submit\s+(your\s+links|a\s+link)/i);
  const end = endAt >= 0 ? anchor + endAt : Math.min(src.length, anchor + 300000);
  // The last "Discussions & Analysis" before the end marker, so a nav tab
  // with the same words earlier on the page doesn't widen the slice.
  const re = /Discussions\s*(&amp;|&|and)\s*Analysis/gi;
  let start = -1;
  let m;
  while ((m = re.exec(src)) && m.index < end) start = m.index;
  if (start < 0 || start >= end) return "";
  return src.slice(start, end);
}

function outbound(href, tijoriHost) {
  try {
    const u = new URL(decodeEntities(href));
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (tijoriHost && u.hostname.replace(/^www\./, "") === tijoriHost) return null;
    return u.toString();
  } catch {
    return null;
  }
}

function parseKnowledgeBase(html, { tijoriBase = TIJORI_BASE } = {}) {
  let tijoriHost = "";
  try {
    tijoriHost = new URL(tijoriBase).hostname.replace(/^www\./, "");
  } catch {
    // relative/odd base: only scheme filtering applies
  }
  const slice = kbSlice(html)
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|svg|noscript|template)\b[\s\S]*?<\/\1>/gi, " ");
  if (!slice) return [];

  const blocks = [];
  let cur = { text: "", anchors: [] };
  let anchor = null;
  const flush = () => {
    if (anchor) cur.anchors.push(anchor), (anchor = null);
    if (cur.text.trim() || cur.anchors.length) blocks.push(cur);
    cur = { text: "", anchors: [] };
  };

  const tagRe = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g;
  let last = 0;
  let m;
  while ((m = tagRe.exec(slice))) {
    const text = slice.slice(last, m.index);
    cur.text += text;
    if (anchor) anchor.text += text;
    last = tagRe.lastIndex;
    const [, close, rawTag, attrs] = m;
    const tag = rawTag.toLowerCase();
    if (tag === "a") {
      if (close) {
        if (anchor) cur.anchors.push(anchor);
        anchor = null;
      } else {
        if (anchor) cur.anchors.push(anchor);
        const href = /\bhref\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(attrs);
        anchor = { href: href ? href[2] ?? href[3] ?? href[4] : "", text: "" };
      }
    } else if (BLOCK_TAGS.has(tag)) {
      flush();
    }
  }
  cur.text += slice.slice(last);
  flush();

  const groups = [];
  let group = null;
  let lastLink = null;
  let total = 0;
  const seen = new Set();
  for (const b of blocks) {
    const text = clean(b.text);
    const links = b.anchors
      .map((a) => ({ url: outbound(a.href, tijoriHost), title: clean(a.text) }))
      .filter((a) => a.url);
    if (links.length) {
      // Several anchors to one URL (icon + title) count once; keep the longest title.
      const byUrl = new Map();
      for (const l of links) if (!byUrl.has(l.url) || l.title.length > byUrl.get(l.url).title.length) byUrl.set(l.url, l);
      const uniq = [...byUrl.values()].filter((l) => l.title);
      let by = "";
      if (uniq.length === 1) {
        by = text.replace(uniq[0].title, "").replace(/^[\s\-–—|:•·]+/, "").replace(/^by\s+/i, "").trim();
      }
      for (const l of uniq) {
        if (total >= MAX_KB_LINKS) break;
        if (!group) groups.push((group = { title: "", links: [] }));
        const key = `${group.title}\n${l.url}`;
        if (seen.has(key)) continue;
        seen.add(key);
        lastLink = { title: l.title, by: uniq.length === 1 ? by : "", url: l.url };
        group.links.push(lastLink);
        total++;
      }
      continue;
    }
    if (!text) continue;
    // "- Author" split into its own element: attach to the previous link.
    if (/^[\-–—]\s*\S/.test(text) && lastLink && !lastLink.by) {
      lastLink.by = text.replace(/^[\-–—]\s*/, "");
      continue;
    }
    if (text.length > 80 || SKIP_TITLES.test(text)) continue;
    group = { title: text, links: [] };
    groups.push(group);
    lastLink = null;
  }
  return groups.filter((g) => g.links.length);
}

// ---- Tijori's own company search ----
//
// The search bar on tijorifinance.com calls
//   GET /api/v1/ind/company_search/?q=<text>   (public, no login)
// and gets a JSON array of { name, slug, type }. Slugs can't always be derived
// from names ("SML Mahindra Ltd." -> sml-isuzu-limited), so the slug is taken
// from here first and the name-derived guesses are only a fallback. Only
// type "companies" counts; delisted entries and rights issues are "InActive".
// Searching by NSE ticker finds nothing, but names and BSE codes work.

const normName = (n) =>
  decodeEntities(n)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\bltd\b/g, "limited")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

// Which search result is the company? An exact (normalised) name match wins;
// otherwise a lone result is accepted only for a precise query (BSE code).
function pickSearchResult(results, wantNames, { loneOk = false } = {}) {
  const live = (Array.isArray(results) ? results : []).filter((r) => r && r.type === "companies" && r.slug && /^[a-z0-9-]+$/.test(r.slug));
  const wants = [].concat(wantNames).filter(Boolean).map(normName);
  const exact = live.find((r) => wants.includes(normName(r.name)));
  if (exact) return exact;
  return loneOk && live.length === 1 ? live[0] : null;
}

function withTimeout(ms) {
  return typeof AbortSignal !== "undefined" && AbortSignal.timeout ? AbortSignal.timeout(ms) : undefined;
}

function createResolver({
  fetchImpl = (...a) => fetch(...a),
  screenerLookup = null,
  directory = null, // companies.js directory: adds listed name + industry
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

  async function nameFromYahoo(symbols) {
    for (const symbol of symbols) {
      try {
        const res = await fetchImpl(
          `${yahooBase}/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`,
          { headers: { "User-Agent": UA, Accept: "application/json" }, signal: withTimeout(TIMEOUT_MS) }
        );
        if (!res.ok) continue;
        const meta = (await res.json())?.chart?.result?.[0]?.meta || {};
        const name = meta.longName || meta.shortName;
        if (name) return { name, source: "yahoo", screenerUrl: null };
      } catch {
        // try the next symbol
      }
    }
    return null;
  }

  // "ok" = confirmed company page, "miss" = not this company, "error" = couldn't tell
  async function probe(slug, ids, name) {
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
      const html = await res.text();
      return pageMatches(html, ids, name) ? { state: "ok", url, html } : { state: "miss", url };
    } catch {
      return { state: "error", url };
    }
  }

  // -> { slug } | { slug: null } | { error: true }
  async function searchSlug(query, wantNames, opts) {
    try {
      const res = await fetchImpl(`${tijoriBase}/api/v1/ind/company_search/?q=${encodeURIComponent(query)}`, {
        headers: { "User-Agent": UA, Accept: "application/json" },
        signal: withTimeout(TIMEOUT_MS),
      });
      if (!res.ok) return res.status === 404 ? { slug: null } : { error: true };
      const hit = pickSearchResult(JSON.parse(await res.text()), wantNames, opts);
      return { slug: hit ? hit.slug : null };
    } catch {
      return { error: true };
    }
  }

  async function compute(ticker) {
    const rec = directory ? directory.find(ticker) : null;
    const code = rec ? rec.nse || rec.bse : ticker;
    const ids = rec ? [rec.nse, rec.bse].filter(Boolean) : [ticker];
    const screenerPage = `https://www.screener.in/company/${encodeURIComponent(code)}/consolidated/`;
    const symbols = rec
      ? [rec.nse && `${rec.nse}.NS`, rec.bse && `${rec.bse}.BO`, rec.nse && `${rec.nse}.BO`].filter(Boolean)
      : [`${ticker}.NS`, `${ticker}.BO`];

    // Legal names (Screener, Yahoo) make the right slugs; the list's short
    // names ("Grasim Inds") are the last resort.
    const named =
      (await nameFromScreener(code)) ||
      (await nameFromYahoo(symbols)) ||
      (rec ? { name: rec.name, source: "list", screenerUrl: null } : null);

    const base = {
      ticker,
      name: rec ? rec.name : named ? named.name : null,
      legalName: named ? named.name : null,
      nameSource: named ? named.source : null,
      industryGroup: rec ? rec.group : null,
      industry: rec ? rec.industry : null,
      listed: rec ? { nse: rec.nse, bse: rec.bse, isin: rec.isin } : null,
      screenerUrl: (named && named.screenerUrl) || screenerPage,
    };
    if (!named) return { ...base, tijori: { status: "no_name" } };

    let firstGuess = null;
    let sawError = false;

    // Tijori's search first (BSE code is the precise query; then the legal
    // name; then the list's short name), then slugs guessed from the name.
    const slugs = [];
    const names = [named.name, rec && rec.name];
    const queries = [rec && rec.bse ? [rec.bse, { loneOk: true }] : null, [named.name, {}], rec && rec.name && rec.name !== named.name ? [rec.name, {}] : null].filter(Boolean);
    for (const [q, opts] of queries) {
      const found = await searchSlug(q, names, opts);
      if (found.error) sawError = true;
      else if (found.slug && !slugs.includes(found.slug)) slugs.push(found.slug);
    }
    for (const g of slugCandidates(named.name)) if (!slugs.includes(g)) slugs.push(g);

    for (const slug of slugs.slice(0, MAX_CANDIDATES + 2)) {
      const r = await probe(slug, ids, named.name);
      firstGuess = firstGuess || { slug, url: r.url };
      if (r.state === "ok") {
        let groups = [];
        try {
          groups = parseKnowledgeBase(r.html, { tijoriBase });
        } catch {
          // odd markup: still a verified link, just no inline list
        }
        const count = groups.reduce((n, g) => n + g.links.length, 0);
        return {
          ...base,
          tijori: { status: "verified", slug, url: `${r.url}#knowledgebase` },
          knowledge: count ? { groups, count, fetchedAt: new Date(now()).toISOString() } : null,
        };
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

module.exports = { createResolver, createRouter, normalizeTicker, slugCandidates, pageMatches, parseKnowledgeBase, pickSearchResult };
