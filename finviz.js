// US company data from Finviz (https://finviz.com), for American tickers.
//
// Finviz has no free public API, so this reads the quote page HTML for one
// ticker at a time, only when someone opens that company. It is deliberately
// light: one request at a time, >=1.5s apart, 10-minute cache, and it never
// crawls lists. Finviz's terms limit automated access, so keep this to personal
// use; if Finviz answers 403/429 (it does block some hosting IPs) the page says
// so and links straight to Finviz instead.
//
// The parser is written defensively (every part optional) and will need updating
// if Finviz changes its markup.

const { text, parseTable } = require("./screener-page");

const CACHE_MS = 10 * 60 * 1000;
const MIN_GAP_MS = 1500;
const TICKER_RE = /^[A-Z0-9][A-Z0-9.\-]{0,9}$/;

function classTokens(tag) {
  const m = tag.match(/class="([^"]*)"/);
  return m ? m[1].split(/\s+/) : [];
}

// Label/value pairs from the snapshot table ("P/E", "Market Cap", ...).
function parseSnapshot(html) {
  const out = [];
  let label = null;
  for (const td of html.matchAll(/<td([^>]*)>([\s\S]*?)<\/td>/gi)) {
    const toks = classTokens(td[1]);
    if (toks.includes("snapshot-td2-cp")) label = text(td[2]);
    else if (toks.includes("snapshot-td2") && label != null) {
      out.push({ label, value: text(td[2]) });
      label = null;
    }
  }
  return out;
}

function tableByClass(html, cls) {
  const re = new RegExp(`<table[^>]*class="[^"]*${cls}[^"]*"[^>]*>[\\s\\S]*?<\\/table>`, "i");
  const m = html.match(re);
  return m ? m[0] : null;
}

function parseNews(html) {
  const tbl = html.match(/<table[^>]*id="news-table"[^>]*>([\s\S]*?)<\/table>/i);
  if (!tbl) return [];
  const items = [];
  let lastDay = "";
  for (const tr of tbl[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const a = tr[1].match(/<a[^>]*class="[^"]*tab-link-news[^"]*"[^>]*>([\s\S]*?)<\/a>/i);
    if (!a) continue;
    const href = (a[0].match(/href="([^"]+)"/i) || [])[1];
    if (!href) continue;
    let when = text((tr[1].match(/<td[^>]*>([\s\S]*?)<\/td>/i) || [])[1]);
    if (/^\d{1,2}:\d\d\s?[AP]M$/i.test(when)) when = `${lastDay} ${when}`.trim();
    else lastDay = when.split(" ")[0];
    const src = tr[1].match(/<span[^>]*>\s*\(([^)]*)\)\s*<\/span>/i);
    items.push({ date: when, title: text(a[1]), url: href, source: src ? src[1].trim() : "" });
    if (items.length >= 20) break;
  }
  return items;
}

function parseQuote(html) {
  const snapshot = parseSnapshot(html);
  const snap = (k) => (snapshot.find((s) => s.label === k) || {}).value || null;

  const company =
    (html.match(/<h2[^>]*quote-header_ticker-wrapper_company[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i) || [])[1] ||
    (html.match(/<title>\s*[A-Z0-9.\-]+\s*(?:Stock Price[^|<]*\|\s*)?([^<|]+?)\s*(?:\||<)/i) || [])[1] ||
    "";
  const link = (kind) => {
    const m = html.match(new RegExp(`<a[^>]*href="[^"]*[?&]f=${kind}_[^"]*"[^>]*>([\\s\\S]*?)<\\/a>`, "i"));
    return m ? text(m[1]) : null;
  };
  const desc = html.match(/<(?:div|td)[^>]*class="[^"]*(?:quote_profile-bio|fullview-profile)[^"]*"[^>]*>([\s\S]*?)<\/(?:div|td)>/i);
  const ratingsHtml = tableByClass(html, "js-table-ratings");
  const insiderHtml = tableByClass(html, "insider-trading-table");
  const ratings = ratingsHtml ? parseTable(ratingsHtml) : null;
  const insiders = insiderHtml ? parseTable(insiderHtml) : null;

  return {
    name: company ? text(company) : null,
    price: snap("Price"),
    change: snap("Change"),
    sector: link("sec"),
    industry: link("ind"),
    country: link("geo"),
    exchange: link("exch"),
    description: desc ? text(desc[1]) : "",
    snapshot,
    news: parseNews(html),
    ratings: ratings && ratings.rows.length ? { rows: ratings.rows.slice(0, 12).map((r) => r.cells) } : null,
    insiders: insiders && insiders.rows.length ? { headers: insiders.headers, rows: insiders.rows.slice(0, 12).map((r) => r.cells) } : null,
  };
}

function createFinviz({ baseUrl = "https://finviz.com", minGapMs = MIN_GAP_MS } = {}) {
  const cache = new Map();
  let queue = Promise.resolve();
  let lastAt = 0;

  async function load(ticker) {
    const fv = ticker.replace(/\./g, "-");
    const url = `${baseUrl}/quote.ashx?t=${encodeURIComponent(fv)}&p=d`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    if (res.status === 404) throw Object.assign(new Error(`Finviz has no page for ${ticker}`), { status: 404, code: "no_such_ticker" });
    if (res.status === 429) throw Object.assign(new Error("Finviz is rate limiting requests right now. Try again in a minute."), { status: 429, code: "rate_limited" });
    if (res.status === 403) throw Object.assign(new Error("Finviz blocked this server's request."), { status: 502, code: "blocked" });
    if (!res.ok) throw Object.assign(new Error(`Finviz responded ${res.status}`), { status: 502, code: "upstream" });
    const parsed = parseQuote(await res.text());
    if (!parsed.snapshot.length) throw Object.assign(new Error("Finviz returned a page this app couldn't read."), { status: 502, code: "unreadable" });
    return { ticker, url: `${baseUrl}/quote.ashx?t=${encodeURIComponent(fv)}`, ...parsed, fetchedAt: new Date().toISOString() };
  }

  function enqueue(task) {
    const run = queue.then(async () => {
      const wait = lastAt + minGapMs - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      try {
        return await task();
      } finally {
        lastAt = Date.now();
      }
    });
    queue = run.catch(() => {});
    return run;
  }

  async function get(ticker) {
    const hit = cache.get(ticker);
    if (hit && Date.now() - hit.ts < CACHE_MS) return hit.data;
    const data = await enqueue(() => load(ticker));
    cache.set(ticker, { data, ts: Date.now() });
    return data;
  }

  // GET /api/finviz/:ticker
  async function handler(req, res) {
    const ticker = String(req.params.ticker || "").toUpperCase();
    if (!TICKER_RE.test(ticker)) return res.status(400).json({ error: "invalid_ticker", message: "That doesn't look like a US ticker." });
    try {
      res.set("Cache-Control", "public, max-age=120");
      res.json(await get(ticker));
    } catch (e) {
      res.status(e.status || 502).json({ error: e.code || "finviz_error", message: e.message });
    }
  }
  handler.get = get;
  return handler;
}

module.exports = { createFinviz, parseQuote, parseSnapshot, parseNews };
