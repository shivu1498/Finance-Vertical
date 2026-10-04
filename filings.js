// Annual-report filings lookup.
//
// Only two markets are offered here, because they're the only ones with a
// free, public, no-login data source:
//
//  - United States: SEC EDGAR's own JSON API (data.sec.gov). Official,
//    documented, no API key. https://www.sec.gov/search-filings/edgar-application-programming-interfaces
//  - India: NSE's own published RSS feed of Annual Report (XBRL) filings
//    (nsearchives.nseindia.com). Official, no API key, but it's a rolling
//    feed of recent filings only — not a searchable historical archive, and
//    there's no per-company lookup, just "what's come in recently".
//
// Every other major exchange (Bursa Malaysia, PSE, SET, IDX, HOSE/HNX, SGX,
// ...) either requires a paid data vendor or actively restricts automated
// access to its filing portal. Rather than scrape around that, those markets
// are simply left out — see README for the full reasoning.

const SEC_BASE = process.env.SEC_BASE || "https://data.sec.gov";
const SEC_WWW = process.env.SEC_WWW || "https://www.sec.gov";
const NSE_RSS = process.env.NSE_ANNUAL_REPORTS_RSS || "https://nsearchives.nseindia.com/content/RSS/Annual_Reports_XBRL.xml";

// SEC's fair-access policy asks every client to identify itself with a
// descriptive User-Agent (app name + a contact). Set SEC_CONTACT in .env to
// put your own email in it; it still works without one, just less politely.
const SEC_UA = `StalkingStocks/1.0 (${process.env.SEC_CONTACT || "no-contact-set; see README"})`;

const ANNUAL_FORMS = new Set(["10-K", "10-K/A", "20-F", "20-F/A"]);
const DAY_MS = 86_400_000;

function createFilings({
  log = (...a) => console.log("[filings]", ...a),
} = {}) {
  // ---------- SEC EDGAR (US) ----------
  let tickerMap = null; // Map<TICKER, {cik, ticker, title}>
  let tickerMapAt = 0;
  const TICKER_MAP_TTL = 24 * 60 * 60 * 1000;

  async function loadTickerMap() {
    if (tickerMap && Date.now() - tickerMapAt < TICKER_MAP_TTL) return tickerMap;
    const res = await fetch(`${SEC_WWW}/files/company_tickers.json`, {
      headers: { "User-Agent": SEC_UA, Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`SEC company_tickers.json responded ${res.status}`);
    const json = await res.json();
    const map = new Map();
    for (const row of Object.values(json)) {
      if (!row || !row.ticker) continue;
      map.set(String(row.ticker).toUpperCase(), {
        cik: String(row.cik_str),
        ticker: row.ticker,
        title: row.title,
      });
    }
    tickerMap = map;
    tickerMapAt = Date.now();
    return map;
  }

  const padCik = (cik) => String(cik).padStart(10, "0");

  const submissionsCache = new Map(); // cik -> { at, value }
  const SUBMISSIONS_TTL = 15 * 60 * 1000;

  async function fetchSubmissions(cik) {
    const hit = submissionsCache.get(cik);
    if (hit && Date.now() - hit.at < SUBMISSIONS_TTL) return hit.value;
    const res = await fetch(`${SEC_BASE}/submissions/CIK${padCik(cik)}.json`, {
      headers: { "User-Agent": SEC_UA, Accept: "application/json" },
    });
    if (res.status === 404) throw Object.assign(new Error("No SEC filer found for that CIK"), { status: 404 });
    if (!res.ok) throw new Error(`SEC submissions API responded ${res.status}`);
    const json = await res.json();
    submissionsCache.set(cik, { at: Date.now(), value: json });
    return json;
  }

  function annualFilingsFrom(json) {
    const r = json.filings?.recent;
    if (!r?.form) return [];
    const cikNum = String(Number(json.cik)); // strip leading zeros for the Archives URL
    const out = [];
    for (let i = 0; i < r.form.length; i++) {
      if (!ANNUAL_FORMS.has(r.form[i])) continue;
      const accNoDashes = r.accessionNumber[i].replace(/-/g, "");
      out.push({
        market: "US",
        company: json.name,
        ticker: json.tickers?.[0] || null,
        form: r.form[i],
        filingDate: r.filingDate[i],
        reportDate: r.reportDate?.[i] || null,
        url: r.primaryDocument?.[i]
          ? `${SEC_WWW}/Archives/edgar/data/${cikNum}/${accNoDashes}/${r.primaryDocument[i]}`
          : `${SEC_WWW}/cgi-bin/browse-edgar?action=getcompany&CIK=${json.cik}&type=10-K`,
      });
    }
    return out;
  }

  async function usSearch(q) {
    const map = await loadTickerMap();
    const needle = q.trim().toUpperCase();
    const out = [];
    for (const row of map.values()) {
      if (row.ticker.toUpperCase().includes(needle) || row.title.toUpperCase().includes(needle)) {
        out.push(row);
        if (out.length >= 25) break;
      }
    }
    // Exact ticker matches first.
    out.sort((a, b) => (a.ticker.toUpperCase() === needle ? -1 : 0) - (b.ticker.toUpperCase() === needle ? -1 : 0));
    return out;
  }

  async function usFilings(identifier) {
    let cik;
    if (/^\d+$/.test(identifier)) {
      cik = identifier;
    } else {
      const map = await loadTickerMap();
      const row = map.get(identifier.toUpperCase());
      if (!row) throw Object.assign(new Error(`No SEC-listed company found for "${identifier}"`), { status: 404 });
      cik = row.cik;
    }
    const json = await fetchSubmissions(cik);
    return { market: "US", company: json.name, ticker: json.tickers?.[0] || null, cik: json.cik, filings: annualFilingsFrom(json) };
  }

  // ---------- NSE Annual Reports RSS (India) ----------
  // <item><title>Company Name</title><link>...xbrl file...</link>
  //   <description>AS ON DATE : DD-MON-YY</description></item>
  let nseCache = null; // { at, items }
  const NSE_TTL = 15 * 60 * 1000;

  function parseNseRss(xml) {
    const items = [];
    const itemRe = /<item>([\s\S]*?)<\/item>/g;
    let m;
    while ((m = itemRe.exec(xml))) {
      const body = m[1];
      const title = (body.match(/<title>([\s\S]*?)<\/title>/) || [])[1];
      const link = (body.match(/<link>([\s\S]*?)<\/link>/) || [])[1];
      const desc = (body.match(/<description>([\s\S]*?)<\/description>/) || [])[1] || "";
      if (!title || !link) continue;
      const dateMatch = desc.match(/(\d{2}-[A-Z]{3}-\d{2,4})/i);
      items.push({
        market: "IN",
        company: title.replace(/<!\[CDATA\[|\]\]>/g, "").trim(),
        filingDate: dateMatch ? dateMatch[1] : null,
        url: link.trim(),
      });
    }
    return items;
  }

  async function loadNseRecent() {
    if (nseCache && Date.now() - nseCache.at < NSE_TTL) return nseCache.items;
    const res = await fetch(NSE_RSS, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        Accept: "application/rss+xml, application/xml, text/xml",
      },
    });
    if (!res.ok) throw new Error(`NSE RSS feed responded ${res.status}`);
    const items = parseNseRss(await res.text());
    nseCache = { at: Date.now(), items };
    log(`loaded ${items.length} recent India annual-report filings from NSE`);
    return items;
  }

  async function inSearch(q) {
    const items = await loadNseRecent();
    const needle = q.trim().toLowerCase();
    return items.filter((it) => it.company.toLowerCase().includes(needle)).slice(0, 50);
  }

  // ---------- HTTP ----------
  const express = require("express");
  const router = express.Router();
  const fail = (res, e) => res.status(e.status || 502).json({ error: e.message || "request failed" });

  router.get("/coverage", (req, res) => {
    res.json({
      markets: [
        {
          code: "US",
          label: "United States",
          source: "SEC EDGAR",
          sourceUrl: "https://www.sec.gov/search-filings/edgar-application-programming-interfaces",
          kind: "api",
          note: "Official, documented, free, no key. Full historical annual-report filings (10-K / 20-F) by company.",
        },
        {
          code: "IN",
          label: "India (NSE)",
          source: "NSE Annual Reports XBRL RSS",
          sourceUrl: NSE_RSS,
          kind: "feed",
          note: "Official, free, no key — but a rolling feed of recently-submitted filings only, not a searchable archive. No per-company lookup.",
        },
      ],
      excluded: [
        "Malaysia (Bursa)", "Philippines (PSE)", "Thailand (SET)",
        "Indonesia (IDX)", "Vietnam (HOSE/HNX)", "Singapore (SGX)",
      ],
      excludedReason: "No free, public, documented filing API; several of these exchanges' own terms restrict automated access to their disclosure portals.",
    });
  });

  router.get("/us/search", async (req, res) => {
    const q = String(req.query.q || "").trim();
    if (q.length < 1) return res.status(400).json({ error: "q is required" });
    try { res.json({ results: await usSearch(q) }); } catch (e) { fail(res, e); }
  });

  router.get("/us/:identifier", async (req, res) => {
    try { res.json(await usFilings(req.params.identifier)); } catch (e) { fail(res, e); }
  });

  router.get("/in/recent", async (req, res) => {
    try { res.json({ market: "IN", filings: await loadNseRecent() }); } catch (e) { fail(res, e); }
  });

  router.get("/in/search", async (req, res) => {
    const q = String(req.query.q || "").trim();
    if (q.length < 1) return res.status(400).json({ error: "q is required" });
    try { res.json({ market: "IN", filings: await inSearch(q) }); } catch (e) { fail(res, e); }
  });

  return { router, usSearch, usFilings, inSearch, loadNseRecent };
}

module.exports = { createFilings };
