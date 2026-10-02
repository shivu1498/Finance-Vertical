// Optional Screener.in integration for Indian stocks.
//
// Screener.in has no public API, so this reads the company page HTML using
// your own logged-in session cookie. It is deliberately slow and heavily
// cached (one request at a time, >=1.5s apart, 6h cache) to stay polite.
// It will break if Screener changes its page markup.

const CACHE_MS = 6 * 60 * 60 * 1000;
const MIN_GAP_MS = 1500;
const SYMBOL_RE = /^[A-Z0-9&-]{1,20}$/;

function stripTags(html) {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&#8377;|&#x20b9;/gi, "₹")
    .replace(/\s+/g, " ")
    .trim();
}

// Pulls the "top ratios" list (Market Cap, Stock P/E, ROCE, ...) and the
// company name out of a Screener company page.
function parseCompanyPage(html) {
  const ul = html.match(/<ul[^>]*id="top-ratios"[^>]*>([\s\S]*?)<\/ul>/);
  if (!ul) return null;

  const ratios = [];
  const liRe = /<li[^>]*>([\s\S]*?)<\/li>/g;
  let m;
  while ((m = liRe.exec(ul[1]))) {
    const nameMatch = m[1].match(/<span[^>]*class="name"[^>]*>([\s\S]*?)<\/span>/);
    if (!nameMatch) continue;
    const name = stripTags(nameMatch[1]);
    const value = stripTags(m[1].slice(m[1].indexOf(nameMatch[0]) + nameMatch[0].length));
    if (name && value) ratios.push({ name, value });
  }

  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
  return { companyName: h1 ? stripTags(h1[1]) : null, ratios };
}

function createScreenerHandler({ baseUrl = "https://www.screener.in", sessionId } = {}) {
  const cache = new Map();
  let queue = Promise.resolve();
  let lastRequestAt = 0;

  async function fetchPage(url) {
    const headers = {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      Accept: "text/html",
    };
    if (sessionId) headers.Cookie = `sessionid=${sessionId}`;
    return fetch(url, { headers });
  }

  async function load(symbol) {
    const base = `${baseUrl}/company/${encodeURIComponent(symbol)}`;
    // Most large caps report consolidated numbers; fall back to standalone.
    for (const url of [`${base}/consolidated/`, `${base}/`]) {
      const res = await fetchPage(url);
      if (res.url.includes("/login")) {
        const err = new Error("Screener session expired or invalid");
        err.status = 401;
        throw err;
      }
      if (res.status === 404) continue;
      if (!res.ok) {
        const err = new Error(`Screener responded ${res.status}`);
        err.status = 502;
        throw err;
      }
      const parsed = parseCompanyPage(await res.text());
      if (parsed && parsed.ratios.length) return { symbol, url, ...parsed };
    }
    const err = new Error(`No Screener data found for ${symbol}`);
    err.status = 404;
    throw err;
  }

  // One request at a time, spaced out.
  function enqueue(symbol) {
    const run = queue.then(async () => {
      const wait = lastRequestAt + MIN_GAP_MS - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      try {
        return await load(symbol);
      } finally {
        lastRequestAt = Date.now();
      }
    });
    queue = run.catch(() => {});
    return run;
  }

  return async function handler(req, res) {
    const symbol = (req.params.symbol || "").toUpperCase();
    if (!SYMBOL_RE.test(symbol)) return res.status(400).json({ error: "invalid symbol" });
    if (!sessionId) {
      return res.status(503).json({
        error: "not_configured",
        message: "Set SCREENER_SESSIONID in .env to enable Screener.in data.",
      });
    }

    const cached = cache.get(symbol);
    if (cached && Date.now() - cached.ts < CACHE_MS) return res.json(cached.data);

    try {
      const data = await enqueue(symbol);
      cache.set(symbol, { data, ts: Date.now() });
      res.json(data);
    } catch (err) {
      res.status(err.status || 502).json({ error: "screener_error", message: err.message });
    }
  };
}

module.exports = { createScreenerHandler, parseCompanyPage };
