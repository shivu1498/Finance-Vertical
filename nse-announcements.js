// "Announcements" — scans NSE's own corporate-announcements feed for
// filings that fall into any of a handful of tracked categories (capex,
// new orders/contract wins, product launches, M&A/stake deals, management
// changes), and checks whether NSE's own industry tag for that company
// (smIndustry) agrees with the industry we've already classified it under
// (from companies.json / the NSE-BSE company list the Universe tab uses).
//
// This started life as a capex-only scanner ("Capex Watch") and was
// generalized into a multi-category one: every chunk is scanned against
// every category in CATEGORIES in a single pass, and each flagged item
// carries the list of categories it matched. The client (see
// public/announcements-ui.js) is what turns that into filterable chips —
// the server doesn't filter by category itself, since the whole point is
// to let the person flip between category lenses over one scan without
// re-hitting NSE.
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
// week by default): the client walks a year-to-date scan forward chunk by
// chunk (several at a time — see public/announcements-ui.js), which also
// keeps each individual call well inside Vercel's request time limit.
//
// Per-chunk PDF confirmation (see confirmInPdf/build below) runs the capped
// batch of PDF fetches concurrently rather than one at a time — this used
// to be a sequential loop, which was the main reason a full scan was slow,
// since every chunk could pay for up to maxPdfChecks PDF fetches back to
// back. The other big source of slowness was the keyword list itself:
// management_change's original bare "appointment"/"resignation" patterns
// matched nearly every board-meeting-outcome filing (statutory-auditor and
// scrutinizer appointments are routine), inflating both the noise in the
// results and the number of PDF fetches paid for per chunk. It's now
// scoped to director/KMP-level roles specifically.
//
// For the filings that match a category, the PDF itself is fetched and
// read with pdf-text-lite.js (no npm package — see that file for what it
// can and can't parse) to confirm the match actually appears in the filing
// body, not just NSE's one-line summary of it. That confirmation is
// best-effort: a PDF that can't be parsed is not treated as "no match,"
// just as "unconfirmed."

const { extractPdfText } = require("./pdf-text-lite");

const WWW = "https://www.nseindia.com";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

// Each category is a small set of regexes matched against NSE's own
// description/summary text for the prefilter pass, and against the PDF
// body for confirmation. Deliberately loose (best-effort classification of
// free-text filing titles, same spirit as the original capex-only
// version) — a false positive here just means a card that turns out, on
// reading, not to be that interesting; a false negative means a filing
// gets missed, which is the worse failure mode for a watch tool, so these
// lean permissive.
const CATEGORIES = [
  {
    id: "capex",
    label: "Capex / Expansion",
    patterns: [
      { label: "capex", re: /\bcapex\b/i },
      { label: "capacity expansion", re: /\bcapacity\s+expansion\b/i },
      { label: "unit expansion", re: /\bunit\s+expansion\b/i },
    ],
  },
  {
    id: "new_order",
    label: "New Order / Contract Win",
    patterns: [
      { label: "new order", re: /\bnew\s+order\b/i },
      { label: "order win", re: /\b(order|contract)\s+win\b/i },
      { label: "letter of award", re: /\bletter\s+of\s+award\b/i },
      { label: "work order", re: /\bwork\s+order\b/i },
      { label: "purchase order", re: /\bpurchase\s+order\b/i },
      { label: "bags order", re: /\b(?:bags|secures|wins)\s+(?:a\s+|the\s+)?order\b/i },
    ],
  },
  {
    id: "product_launch",
    label: "Product Launch",
    patterns: [
      { label: "product launch", re: /\bproduct\s+launch\b/i },
      { label: "launches product", re: /\blaunch(?:es|ed)?\s+(?:a\s+|its\s+|the\s+|new\s+)*(?:new\s+)?product\b/i },
      { label: "new product", re: /\bnew\s+product\b/i },
      { label: "unveils", re: /\bunveil(?:s|ed)?\b/i },
    ],
  },
  {
    id: "ma",
    label: "M&A / Stake Acquisition",
    patterns: [
      { label: "acquisition", re: /\bacquisition\b/i },
      { label: "acquires", re: /\bacquir(?:e|es|ed|ing)\b/i },
      { label: "stake sale", re: /\bstake\s+(?:sale|purchase|acquisition)\b/i },
      { label: "merger", re: /\bmerger\b/i },
      { label: "amalgamation", re: /\bamalgamation\b/i },
      { label: "joint venture", re: /\bjoint\s+venture\b/i },
    ],
  },
  {
    id: "management_change",
    label: "Management Change",
    // Deliberately scoped to director/KMP-level roles. Bare "appointment"
    // or "resignation" (the original version of this category) matches
    // nearly every board-meeting-outcome filing on NSE — appointment of
    // statutory auditors, scrutinizers, RTAs, and so on are routine and not
    // what anyone means by "management change." That over-broad match was
    // flagging most of a given day's filings, which is both noisy to read
    // and, since every flagged filing gets a PDF-confirmation fetch, the
    // main reason a full year-to-date scan was slow: it drove the PDF-check
    // budget to its cap on almost every chunk. Scoping to director/KMP/
    // CEO/CFO/company-secretary roles cuts the match volume to what's
    // actually a management change.
    patterns: [
      // NSE filings almost always name the person in between — "Appointment
      // of Mr. X as the Chief Financial Officer" — so the role word rarely
      // sits right after "appointment of"/"resignation of". A short lookahead
      // window (not crossing roughly a sentence's worth of text) catches that
      // real phrasing, including the common "X, Director of the Company"
      // comma form, while still excluding "appointment of statutory auditors"
      // and the like, which never mentions a director/KMP role at all.
      { label: "director/KMP appointment", re: /\bappoint(?:ment|ed|s)?\s+of\b[\s\S]{0,60}?\b(?:managing\s+director|whole-?time\s+director|independent\s+director|additional\s+director|director|chief\s+executive\s+officer|ceo|chief\s+financial\s+officer|cfo|company\s+secretary|key\s+managerial\s+personnel|kmp)\b/i },
      { label: "director/KMP resignation", re: /\bresign(?:ation|ed|s)?\s+of\b[\s\S]{0,60}?\b(?:managing\s+director|whole-?time\s+director|independent\s+director|director|chief\s+executive\s+officer|ceo|chief\s+financial\s+officer|cfo|company\s+secretary|key\s+managerial\s+personnel|kmp)\b/i },
      { label: "ceases to be a director/KMP", re: /\bceases?\s+to\s+be\s+(?:a\s+|an\s+)?(?:director|key\s+managerial\s+personnel|kmp)\b/i },
      { label: "redesignation", re: /\bre-?designat\w*\b/i },
      { label: "change in directorate/KMP", re: /\bchange\s+in\s+(?:the\s+)?(?:board|directorate|key\s+managerial\s+personnel)\b/i },
    ],
  },
];

// Backward-compatible flat keyword list — kept for anything that only
// cares about matched labels, not which category they belong to.
const KEYWORDS = CATEGORIES.flatMap((c) => c.patterns);

// Returns [{ id, label, keywords: [label, ...] }] for every category that
// has at least one pattern match in `text`.
function findCategoryMatches(text) {
  const t = String(text || "");
  const hits = [];
  for (const cat of CATEGORIES) {
    const keywords = cat.patterns.filter((p) => p.re.test(t)).map((p) => p.label);
    if (keywords.length) hits.push({ id: cat.id, label: cat.label, keywords });
  }
  return hits;
}

// Flat keyword labels across all matched categories — used for prefiltering
// ("does this filing match anything at all?") and for the simple per-item
// keyword chip list.
function findKeywords(text) {
  const seen = new Set();
  for (const hit of findCategoryMatches(text)) for (const k of hit.keywords) seen.add(k);
  return Array.from(seen);
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

function mergeCategoryHits(a, b) {
  const byId = new Map();
  for (const h of [...a, ...b]) {
    const cur = byId.get(h.id);
    if (!cur) byId.set(h.id, { id: h.id, label: h.label, keywords: [...h.keywords] });
    else cur.keywords = Array.from(new Set([...cur.keywords, ...h.keywords]));
  }
  return Array.from(byId.values());
}

function createNseAnnouncements({
  directory,
  fetchImpl = fetch,
  wwwBase = WWW,
  maxChunkDays = 7,
  maxPrefilter = 2000,
  maxPdfChecks = 15,
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

  async function confirmInPdf(url, prefilterHits) {
    try {
      const res = await fetchImpl(url, { headers: { "User-Agent": UA, Accept: "application/pdf" } });
      if (!res.ok) return { checked: true, confirmed: false, reason: `pdf responded ${res.status}` };
      const buf = Buffer.from(await res.arrayBuffer());
      const text = extractPdfText(buf);
      if (!text) return { checked: true, confirmed: false, reason: "couldn't extract text from this pdf" };
      const found = findCategoryMatches(text);
      if (!found.length) return { checked: true, confirmed: false, text };
      // Snippet around whichever keyword from the original (prefilter) hit
      // we can actually find in the PDF body, falling back to the first
      // confirmed keyword if the prefilter's own label isn't present here.
      const allPdfKeywords = found.flatMap((h) => h.keywords);
      const preferred = prefilterHits.flatMap((h) => h.keywords).find((k) => allPdfKeywords.includes(k)) || allPdfKeywords[0];
      const pattern = CATEGORIES.flatMap((c) => c.patterns).find((p) => p.label === preferred);
      return { checked: true, confirmed: true, categories: found, snippet: pattern ? snippetAround(text, pattern.re) : null };
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
      .map((r) => ({ r, hit: findCategoryMatches(`${r.desc || ""} ${r.attchmntText || ""}`) }))
      .filter((x) => x.hit.length);

    // PDF confirmation is a full fetch + decompress + parse per filing, and
    // was originally run one at a time in this loop — the single biggest
    // reason a chunk (and so the whole year-to-date scan) was slow, since
    // each chunk could pay for up to maxPdfChecks sequential PDF fetches.
    // Confirmation of one filing's PDF is independent of any other's, so
    // run the capped batch concurrently instead of awaiting them in a row.
    let pdfBudget = maxPdfChecks;
    const toConfirm = [];
    for (const entry of prefiltered) {
      if (entry.r.attchmntFile && pdfBudget > 0) { toConfirm.push(entry); pdfBudget--; }
    }
    await Promise.all(toConfirm.map(async (entry) => {
      entry.pdf = await confirmInPdf(entry.r.attchmntFile, entry.hit);
    }));

    const items = [];
    for (const { r, hit, pdf: pdfResult } of prefiltered) {
      const rec = directory ? directory.find(r.symbol) : null;
      const ours = rec ? (rec.industry || rec.group) : null;
      const pdf = pdfResult || { checked: false };
      const categories = mergeCategoryHits(hit, pdf.categories || []);
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
        categories,
        keywords: categories.flatMap((c) => c.keywords),
        pdfConfirmed: pdf.confirmed || false,
        pdfChecked: pdf.checked || false,
        pdfSnippet: pdf.snippet || null,
        pdfUrl: r.attchmntFile || null,
        filedAt: r.an_dt || r.exchdisstime || r.dt || null,
      });
    }
    items.sort((a, b) => String(b.filedAt).localeCompare(String(a.filedAt)));
    return {
      from: isoDate(f),
      to: isoDate(t),
      asOf: new Date().toISOString(),
      checked,
      flagged: items.length,
      categories: CATEGORIES.map((c) => ({ id: c.id, label: c.label })),
      items,
    };
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

module.exports = { createNseAnnouncements, findKeywords, findCategoryMatches, industriesAgree, snippetAround, CATEGORIES, KEYWORDS };
