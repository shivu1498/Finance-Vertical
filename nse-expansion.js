// "Capex Watch" — scans NSE's own corporate-announcements feed for filings
// that mention capex / capacity expansion / unit expansion, and checks
// whether NSE's own industry tag for that company (smIndustry) agrees with
// the industry we've already classified it under (from companies.json /
// the NSE-BSE company list the Universe tab uses).
//
// Data source: https://www.nseindia.com/api/corporate-announcements — NSE's
// own (undocumented, free, no key) JSON API behind the "Corporate Filings"
// page. NSE's anti-bot layer wants a browser-like session: a cookie picked
// up from nseindia.com's homepage, replayed on the API call. There's no
// guarantee NSE keeps allowing this from a server IP; if it starts
// blocking (401/403/429), this fails closed with a clear error, same as
// the Screener and Finviz integrations.
//
// A year-to-date scan is thousands of filings, and NSE's own API has no
// pagination — ask it for a ~9-month range in one call and it tries to hand
// back a response in the tens of MB, which blew straight through a 48MB
// response-size cap in testing. So this module deliberately only ever
// answers for one short date range per call (clamped to maxChunkDays, a
// week by default): the client is the one that walks a year-to-date scan
// forward one chunk at a time (see public/capex-ui.js), which also keeps
// each call well inside Vercel's request time limit.
//
// For the filings that mention the keywords, the PDF itself is fetched and
// read with pdf-text-lite.js (no npm package — see that file for what it
// can and can't parse) to confirm the keyword actually appears in the
// filing body, not just NSE's one-line summary of it. That confirmation is
// best-effort: a PDF that can't be parsed is not treated as "no match,"
// just as "unconfirmed."

const { extractPdfText } = require("./pdf-text-lite");

const WWW = "https://www.nseindia.com";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const KEYWORDS = [
  { label: "capex", re: /\bcapex\b/i },
  { label: "capacity expansion", re: /\bcapacity\s+expansion\b/i },
  { label: "unit expansion", re: /\bunit\s+expansion\b/i },
];

function findKeywords(text) {
  const t = String(text || "");
  return KEYWORDS.filter((k) => k.re.test(t)).map((k) => k.label);
}

function snippetAround(text, re, pad = 140) {
  const m = re.exec(text);
  if (!m) return null;
  const from = Math.max(0, m.index - pad);
  const to = Math.min(text.length, m.index + m[0].length + pad);
  return (from > 0 ? "…" : "") + text.slice(from, to).trim() + (to < text.length ? "…" : "");
}

// Loose match: does our classified industry/group share a word with NSE's
// own smIndustry tag? The two taxonomies don't use identical names (ours is
// the NSE/BSE "industry group" sheet; smIndustry is NSE's own broader
// sector tag), so this is deliberately forgiving — it's meant to catch
// real mismatches, not differences in how two valid schemes name a sector.
function industriesAgree(ours, nse) {
  if (!ours || !nse) return null; // can't compare — one side missing
  const norm = (s) => new Set(String(s).toLowerCase().replace(/[&/,-]/g, " ").split(/\s+/).filter((w) => w.length > 2));
  const a = norm(ours), b = norm(nse);
  for (const w of a) if (b.has(w)) return true;
  return false;
}

function pad2(n) { return String(n).padStart(2, "0"); }
function ddmmyyyy(d) { return `${pad2(d.getDate())}-${pad2(d.getMonth() + 1)}-${d.getFullYear()}`; }
function isoDate(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function parseIso(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || "").trim());
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

function createNseExpansion({
  directory,
  fetchImpl = fetch,
  wwwBase = WWW,
  maxChunkDays = 7,
  maxPrefilter = 2000,
  maxPdfChecks = 10,
  pastCacheMs = 12 * 60 * 60 * 1000, // a chunk fully in the past never changes
  todayCacheMs = 10 * 60 * 1000,     // a chunk that includes today still gets new filings
} = {}) {
  const cache = new Map(); // "from|to" -> { at, ttl, result }
  let cookieJar = null; // "name=value; name2=value2"
  let cookieAt = 0;
  const COOKIE_TTL = 10 * 60 * 1000;

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

  async function fetchAnnouncements({ from, to }) {
    const cookie = await primeCookies();
    const url = `${wwwBase}/api/corporate-announcements?index=equities&from_date=${ddmmyyyy(from)}&to_date=${ddmmyyyy(to)}`;
    const res = await fetchImpl(url, {
      headers: {
        "User-Agent": UA,
        Accept: "application/json, text/plain, */*",
        Referer: `${wwwBase}/companies-listing/corporate-filings-announcements`,
        ...(cookie ? { Cookie: cookie } : {}),
      },
    });
    if (res.status === 401 || res.status === 403) throw Object.assign(new Error("NSE blocked this server's request for corporate announcements."), { status: 502, code: "blocked" });
    if (res.status === 429) throw Object.assign(new Error("NSE is rate-limiting requests right now. Try again shortly."), { status: 429, code: "rate_limited" });
    if (!res.ok) throw Object.assign(new Error(`NSE responded ${res.status}`), { status: 502, code: "upstream" });
    const json = await res.json().catch(() => null);
    if (!Array.isArray(json)) throw Object.assign(new Error("NSE returned a page this app couldn't read."), { status: 502, code: "unreadable" });
    return json;
  }

  async function confirmInPdf(url) {
    try {
      const res = await fetchImpl(url, { headers: { "User-Agent": UA, Accept: "application/pdf" } });
      if (!res.ok) return { checked: true, confirmed: false, reason: `pdf responded ${res.status}` };
      const buf = Buffer.from(await res.arrayBuffer());
      const text = extractPdfText(buf);
      if (!text) return { checked: true, confirmed: false, reason: "couldn't extract text from this pdf" };
      const found = findKeywords(text);
      if (!found.length) return { checked: true, confirmed: false, text };
      return { checked: true, confirmed: true, keywords: found, snippet: snippetAround(text, KEYWORDS.find((k) => k.label === found[0]).re) };
    } catch (e) {
      return { checked: true, confirmed: false, reason: e.message };
    }
  }

  // Builds one chunk. `from`/`to` are Dates (inclusive, day granularity);
  // the range is silently clamped to maxChunkDays so a misbehaving caller
  // can't trigger the oversized-response problem this module exists to avoid.
  async function build(from, to) {
    let f = startOfDay(from), t = startOfDay(to);
    if (t < f) [f, t] = [t, f];
    const maxEnd = new Date(f.getTime() + (maxChunkDays - 1) * 86_400_000);
    if (t > maxEnd) t = maxEnd;

    const raw = await fetchAnnouncements({ from: f, to: t });
    const checked = raw.length;
    const prefiltered = raw
      .slice(0, maxPrefilter)
      .map((r) => ({ r, hit: findKeywords(`${r.desc || ""} ${r.attchmntText || ""}`) }))
      .filter((x) => x.hit.length);

    const items = [];
    let pdfChecks = 0;
    for (const { r, hit } of prefiltered) {
      const rec = directory ? directory.find(r.symbol) : null;
      const ours = rec ? (rec.industry || rec.group) : null;
      let pdf = { checked: false };
      if (r.attchmntFile && pdfChecks < maxPdfChecks) {
        pdf = await confirmInPdf(r.attchmntFile);
        pdfChecks++;
      }
      items.push({
        symbol: r.symbol,
        company: r.sm_name,
        ourIndustry: ours,
        ourGroup: rec ? rec.group : null,
        inUniverse: !!rec,
        nseIndustry: r.smIndustry || null,
        industryMatch: industriesAgree(ours, r.smIndustry),
        desc: r.desc || null,
        summary: r.attchmntText || null,
        keywords: Array.from(new Set([...hit, ...(pdf.keywords || [])])),
        pdfConfirmed: pdf.confirmed || false,
        pdfChecked: pdf.checked || false,
        pdfSnippet: pdf.snippet || null,
        pdfUrl: r.attchmntFile || null,
        filedAt: r.an_dt || r.exchdisstime || r.dt || null,
      });
    }
    items.sort((a, b) => String(b.filedAt).localeCompare(String(a.filedAt)));
    return { from: isoDate(f), to: isoDate(t), asOf: new Date().toISOString(), checked, flagged: items.length, items };
  }

  async function get(from, to) {
    const key = `${isoDate(startOfDay(from))}|${isoDate(startOfDay(to))}`;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < hit.ttl) return hit.result;
    const result = await build(from, to);
    const chunkIsPast = startOfDay(to) < startOfDay(new Date());
    cache.set(key, { at: Date.now(), ttl: chunkIsPast ? pastCacheMs : todayCacheMs, result });
    return result;
  }

  async function handler(req, res) {
    const today = startOfDay(new Date());
    const to = parseIso(req.query.to) || today;
    const from = parseIso(req.query.from) || to;
    try {
      res.set("Cache-Control", "public, max-age=120");
      res.json(await get(from, to));
    } catch (e) {
      res.status(e.status || 502).json({ error: e.code || "nse_error", message: e.message });
    }
  }
  handler.get = get;
  handler.build = build;
  handler.maxChunkDays = maxChunkDays;
  return handler;
}

module.exports = { createNseExpansion, findKeywords, industriesAgree, snippetAround, KEYWORDS };
