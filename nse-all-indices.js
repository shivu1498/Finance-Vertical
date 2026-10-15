// Every NSE index, as CSV — a bridge built specifically so Google Sheets
// can reach NSE data.
//
// WHY THIS EXISTS. Google Sheets' IMPORTHTML/IMPORTXML/IMPORTDATA cannot
// read https://www.nseindia.com/market-data/live-market-indices for two
// independent reasons:
//   1. That page is a JavaScript app. The served HTML contains no table at
//      all, so IMPORTHTML has nothing to find even on a clean fetch.
//   2. NSE's JSON API behind it (/api/allIndices) sits behind the same
//      anti-bot layer every other NSE integration in this app deals with
//      (see nse-sector-indices.js, nse-announcements.js): a cookie picked
//      up from the homepage has to be replayed on the API call. Google's
//      import functions send a plain, cookie-less request from a Google IP
//      and get 401/403 back.
// This server already does the cookie priming. So the working path is
// Sheets -> this app -> NSE, with this endpoint handing back plain CSV that
// IMPORTDATA eats directly. See the README for the sheet-side formulas.
//
// Data source: https://www.nseindia.com/api/allIndices — the same
// undocumented JSON API nse-sector-indices.js already uses, and the one
// backing NSE's own live-indices pages. That module narrows the response to
// ~22 mapped sector labels for the heatmap; this one deliberately keeps
// EVERY row (broad market, sectoral, thematic, strategy), because the point
// of a spreadsheet export is to let the sheet do the filtering.
//
// Field access is defensive in the same way as the rest of this app's NSE
// code: nseindia.com is unreachable from the dev sandbox, so the exact
// response shape can't be verified live. Several plausible spellings are
// tried per field and anything unparseable becomes an empty cell rather
// than a crash.

const WWW = "https://www.nseindia.com";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

// [csvHeader, [field spellings to try, in order]]
const FIELDS = [
  ["Index", ["index", "indexSymbol", "indexName"]],
  ["Group", ["key", "indexType"]],
  ["Last", ["last", "lastPrice", "indexValue"]],
  ["Change", ["variation", "change"]],
  ["Change %", ["percentChange", "perChange", "pChange"]],
  ["Open", ["open"]],
  ["High", ["high", "dayHigh"]],
  ["Low", ["low", "dayLow"]],
  ["Prev Close", ["previousClose", "prevClose", "previousDay"]],
  ["52W High", ["yearHigh", "high52"]],
  ["52W Low", ["yearLow", "low52"]],
  ["30D %", ["perChange30d", "percentChange30d"]],
  ["365D %", ["perChange365d", "percentChange365d"]],
  ["P/E", ["pe"]],
  ["P/B", ["pb"]],
  ["Div Yield", ["dy", "divYield"]],
  ["Advances", ["advances"]],
  ["Declines", ["declines"]],
  ["Unchanged", ["unchanged"]],
];

// NSE returns some numbers as strings ("22.54") and some as the literal
// "-" or "" when a figure doesn't apply to that index. Both become blank.
function num(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim().replace(/,/g, "");
  if (!s || s === "-" || s === "NA") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function text(v) {
  if (v === null || v === undefined) return "";
  const s = String(v).trim();
  return s === "-" ? "" : s;
}

function pick(row, keys) {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== null && String(row[k]).trim() !== "") return row[k];
  }
  return null;
}

// 1-week % isn't a field NSE sends directly, but `oneWeekAgo` usually is,
// so it's derived where both ends are present and left blank otherwise.
function weekPct(row) {
  const last = num(pick(row, ["last", "lastPrice", "indexValue"]));
  const base = num(pick(row, ["oneWeekAgo", "weekAgo"]));
  if (last === null || base === null || base === 0) return null;
  return ((last - base) / base) * 100;
}

function csvCell(v) {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function toCsv(rows) {
  const header = FIELDS.map((f) => f[0]).concat(["7D %", "As Of"]);
  const lines = [header.map(csvCell).join(",")];
  for (const r of rows) {
    const cells = FIELDS.map(([label, keys]) => {
      const raw = pick(r.raw, keys);
      // Index and Group stay text; everything else is numeric or blank.
      if (label === "Index" || label === "Group") return text(raw);
      const n = num(raw);
      return n === null ? "" : Math.round(n * 10000) / 10000;
    });
    cells.push(r.weekPct === null ? "" : Math.round(r.weekPct * 10000) / 10000);
    cells.push(r.asOf);
    lines.push(cells.map(csvCell).join(","));
  }
  return lines.join("\n");
}

function createNseAllIndices({ fetchImpl = fetch, wwwBase = WWW, cacheMs = 60_000 } = {}) {
  let cookieJar = null;
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

  async function fetchAll() {
    if (cached && Date.now() - cachedAt < cacheMs) return cached;
    const cookie = await primeCookies();
    const res = await fetchImpl(`${wwwBase}/api/allIndices`, {
      headers: {
        "User-Agent": UA,
        Accept: "application/json, text/plain, */*",
        Referer: `${wwwBase}/market-data/live-market-indices`,
        ...(cookie ? { Cookie: cookie } : {}),
      },
    });
    if (res.status === 401 || res.status === 403) throw Object.assign(new Error("NSE blocked this server's request for indices."), { status: 502, code: "blocked" });
    if (res.status === 429) throw Object.assign(new Error("NSE is rate-limiting requests right now. Try again shortly."), { status: 429, code: "rate_limited" });
    if (!res.ok) throw Object.assign(new Error(`NSE responded ${res.status}`), { status: 502, code: "upstream" });
    const json = await res.json().catch(() => null);
    const raw = Array.isArray(json?.data) ? json.data : null;
    if (!raw) throw Object.assign(new Error("NSE returned a payload this app couldn't read."), { status: 502, code: "unreadable" });

    const asOf = text(json.timestamp) || new Date().toISOString();
    const rows = raw
      .filter((r) => text(pick(r, ["index", "indexSymbol", "indexName"])) !== "")
      .map((r) => ({ raw: r, weekPct: weekPct(r), asOf }));

    const result = { asOf, count: rows.length, rows };
    cached = result;
    cachedAt = Date.now();
    return result;
  }

  // CSV handler — the one Google Sheets' IMPORTDATA points at. Any query
  // string (?d=20261015, used sheet-side to force a daily refresh) is
  // ignored here on purpose; it only has to make the URL unique.
  async function handler(req, res) {
    try {
      const { rows } = await fetchAll();
      res.set("Content-Type", "text/csv; charset=utf-8");
      res.set("Cache-Control", "public, max-age=60");
      res.set("Access-Control-Allow-Origin", "*");
      res.send(toCsv(rows));
    } catch (err) {
      // CSV-shaped error so a sheet shows a readable cell, not a parse failure.
      res.status(err.status || 502);
      res.set("Content-Type", "text/csv; charset=utf-8");
      res.send(`Error,Message\n${csvCell(err.code || "nse_error")},${csvCell(err.message)}`);
    }
  }
  handler.get = fetchAll;
  handler.json = async function jsonHandler(req, res) {
    try {
      const { asOf, count, rows } = await fetchAll();
      res.set("Cache-Control", "public, max-age=60");
      res.json({ asOf, count, indices: rows.map((r) => ({ ...r.raw, weekPct: r.weekPct })) });
    } catch (err) {
      res.status(err.status || 502).json({ error: err.code || "nse_error", message: err.message });
    }
  };
  return handler;
}

module.exports = { createNseAllIndices, toCsv, csvCell, num, text, pick, weekPct, FIELDS };
