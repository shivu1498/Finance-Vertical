// Mutual-fund screener backend. Pulls NAV history from mfapi.in (free, no key),
// scores a curated universe of Large/Mid/Small Cap funds against each other, and
// serves the results. Slow and cached by design: one request at a time, spaced
// out, results kept on disk and refreshed every 24h.
const fs = require("fs");
const path = require("path");
const M = require("./mf-metrics");
const { CATEGORIES } = require("./mf-universe");

const { DAY, YEAR } = M;
const STALE_MS = 24 * 60 * 60 * 1000;
const MIN_MANUAL_REFRESH_MS = 10 * 60 * 1000;
const HIST_TTL_MS = 6 * 60 * 60 * 1000;
const METRIC_KEYS = ["cagr3", "cagr5", "sip", "sharpe", "maxdd", "consistency", "alpha"];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const round = (x, d = 2) => (x == null || Number.isNaN(x) ? null : Math.round(x * 10 ** d) / 10 ** d);

// Names are compared as token sets, with "Mid Cap"/"Midcap"/"Mid-Cap" treated alike.
function tokens(s) {
  return String(s)
    .toLowerCase()
    .replace(/\b(large|mid|small)[\s-]*cap\b/g, "$1cap")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function planOf(name) {
  const t = new Set(tokens(name));
  const growth = t.has("growth");
  const payout = ["idcw", "dividend", "bonus", "payout", "reinvestment"].some((w) => t.has(w));
  if (t.has("direct")) return growth && !payout ? "Direct Growth" : "Direct Other";
  if (t.has("regular")) return growth && !payout ? "Regular Growth" : "Regular Other";
  return growth && !payout ? "Growth" : "Other";
}

function detectCategory(meta) {
  const t = new Set(tokens(meta?.scheme_category || ""));
  if (t.has("largecap") && !t.has("midcap")) return "large";
  if (t.has("midcap") && !t.has("largecap")) return "mid";
  if (t.has("smallcap")) return "small";
  return null;
}

function createMf({
  baseUrl = process.env.MFAPI_BASE || "https://api.mfapi.in",
  gapMs = Number(process.env.MFAPI_GAP_MS ?? 1500),
  cacheFile = process.env.MF_CACHE || path.join(__dirname, "data", "mf-cache.json"),
  log = (...a) => console.log("[mf]", ...a),
} = {}) {
  // ---------- request queue (priority, spaced, retried) ----------
  const jobs = [];
  let seq = 0, pumping = false, lastAt = 0;

  async function attempt(p) {
    let lastErr;
    for (let i = 0; i < 4; i++) {
      const wait = lastAt + gapMs - Date.now();
      if (wait > 0) await sleep(wait);
      lastAt = Date.now();
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 25_000);
      try {
        const res = await fetch(baseUrl + p, { signal: ctrl.signal, headers: { Accept: "application/json", "User-Agent": "StalkingStocks/1.0" } });
        if (res.status === 429 || res.status >= 500) {
          lastErr = new Error(`mfapi.in responded ${res.status}`);
          await sleep((Number(res.headers.get("retry-after")) || 3 * (i + 1)) * 1000);
          continue;
        }
        if (!res.ok) throw Object.assign(new Error(`mfapi.in responded ${res.status}`), { fatal: true });
        return await res.json();
      } catch (e) {
        if (e.fatal) throw e;
        lastErr = e.name === "AbortError" ? new Error("mfapi.in timed out") : e;
        await sleep(1000 * (i + 1));
      } finally {
        clearTimeout(timer);
      }
    }
    throw lastErr || new Error("request failed");
  }

  async function pump() {
    if (pumping) return;
    pumping = true;
    while (jobs.length) {
      const j = jobs.shift();
      try { j.resolve(await attempt(j.p)); } catch (e) { j.reject(e); }
    }
    pumping = false;
  }
  function api(p, priority = 0) {
    return new Promise((resolve, reject) => {
      jobs.push({ p, priority, resolve, reject, seq: ++seq });
      jobs.sort((a, b) => b.priority - a.priority || a.seq - b.seq);
      pump();
    });
  }

  // ---------- mfapi.in access ----------
  async function search(q, priority = 0) {
    const json = await api(`/mf/search?q=${encodeURIComponent(q)}`, priority);
    if (!Array.isArray(json)) throw new Error("unexpected search response from mfapi.in");
    return json.filter((r) => r && r.schemeCode != null && r.schemeName).map((r) => ({ code: String(r.schemeCode), name: String(r.schemeName) }));
  }

  const histCache = new Map();
  async function history(code, priority = 0) {
    const hit = histCache.get(code);
    if (hit && Date.now() - hit.at < HIST_TTL_MS) return hit.value;
    const json = await api(`/mf/${encodeURIComponent(code)}`, priority);
    if (!json || !Array.isArray(json.data) || !json.data.length) throw new Error("no NAV data from mfapi.in");
    const series = M.toSeries(json.data);
    if (series.t.length < 30) throw new Error("too little NAV data");
    const value = { meta: json.meta || {}, series };
    histCache.set(code, { at: Date.now(), value });
    return value;
  }

  // Direct Plan - Growth scheme whose name contains the phrase and none of the excluded words.
  async function resolve(catKey, phrases, state) {
    const cat = CATEGORIES[catKey];
    for (const phrase of phrases) {
      const cacheKey = `${catKey}:${phrase}`;
      if (state.codes[cacheKey]) return state.codes[cacheKey];
      const want = tokens(phrase);
      // The API does substring search, so try the phrase as written, then the common
      // spellings of "Mid Cap" ("Mid-Cap", "Midcap"), then shorter prefixes of the name.
      const words = phrase.split(/\s+/);
      const spell = (sep) => phrase.replace(/\b(large|mid|small)[\s-]*cap\b/gi, (_, w) => `${w}${sep}cap`);
      const attempts = [phrase, spell("-"), spell(" "), spell(""), words.slice(0, 3).join(" "), words.slice(0, 2).join(" ")].filter((q, i, a) => q && a.indexOf(q) === i);
      for (const q of attempts) {
        const results = await search(q);
        const matches = results.filter((r) => {
          const t = new Set(tokens(r.name));
          return want.every((w) => t.has(w)) && !cat.exclude.some((x) => t.has(x) && !want.includes(x)) && planOf(r.name) === "Direct Growth";
        });
        if (matches.length) {
          matches.sort((a, b) => a.name.length - b.name.length);
          state.codes[cacheKey] = matches[0].code;
          return matches[0].code;
        }
      }
    }
    return null;
  }

  // ---------- analysis ----------
  function basics(s) {
    const dd = M.maxDrawdown(s, 5);
    const sp = M.sip(s, 60);
    return {
      cagr3: M.cagr(s, 3), cagr5: M.cagr(s, 5), cagr10: M.cagr(s, 10),
      sip: sp ? sp.xirr : null, sharpe: M.sharpe(s, 3), maxdd: dd ? dd.pct : null,
      consistency: null, alpha: null, _dd: dd, _sip: sp,
    };
  }

  function buildPeer(rows, gridEnd) {
    const nonNull = (a) => a.filter((x) => x != null);
    const roll1y = [];
    for (let k = 0; k < 60; k++) {
      const t = gridEnd - k * 30.4375 * DAY;
      const rets = nonNull(rows.map((r) => M.periodReturn(r.s, t, 1)));
      if (rets.length >= 3) roll1y.push([Math.round(t), M.mean(rets)]);
    }
    const W = rows.filter((r) => (r.s.t.at(-1) - r.s.t[0]) / YEAR >= 5).length >= 3 ? 5 : 3;
    const grid = [];
    for (let t = gridEnd - W * YEAR; t < gridEnd; t += 7 * DAY) grid.push(Math.round(t));
    grid.push(gridEnd);
    const members = rows.filter((r) => M.navAt(r.s, grid[0]) != null);
    const v = grid.map((t) => {
      const xs = nonNull(members.map((r) => { const a = M.navAt(r.s, grid[0]); const b = M.navAt(r.s, t); return a && b ? (b / a) * 100 : null; }));
      return xs.length ? round(M.mean(xs)) : null;
    });
    return {
      cagr3: M.mean(nonNull(rows.map((r) => r.m.cagr3))),
      cagr5: rows.some((r) => r.m.cagr5 != null) ? M.mean(nonNull(rows.map((r) => r.m.cagr5))) : null,
      roll1y, grid, v,
    };
  }

  function relativeMetrics(m, s, peer) {
    if (m.cagr3 != null && peer.cagr3 != null) m.alpha = m.cagr3 - peer.cagr3;
    let wins = 0, total = 0;
    for (const [t, pr] of peer.roll1y) {
      const r = M.periodReturn(s, t, 1);
      if (r == null) continue;
      total++;
      if (r > pr) wins++;
    }
    if (total >= 12) m.consistency = Math.round((wins / total) * 100);
  }

  function fundChart(s, peer) {
    const g = peer.grid;
    const i0 = g.findIndex((t) => M.navAt(s, t) != null);
    if (i0 < 0) return null;
    const base = M.navAt(s, g[i0]);
    let prev = 100;
    const v = [];
    for (let i = i0; i < g.length; i++) {
      const x = M.navAt(s, g[i]);
      prev = x != null ? (x / base) * 100 : prev;
      v.push(round(prev));
    }
    return { i0, v };
  }

  // Turns metrics into the final fund record (percentiles, score, rating, verdict).
  function finish(base, m, dist) {
    const pcts = {};
    for (const k of METRIC_KEYS) pcts[k] = m[k] != null && dist[k]?.length ? M.percentile(m[k], dist[k]) : null;
    const sc = M.score(pcts);
    const rating = sc == null ? null : M.rate(sc);
    const dd = m._dd;
    return {
      ...base,
      metrics: Object.fromEntries([...METRIC_KEYS, "cagr10"].map((k) => [k, round(m[k], k === "sharpe" ? 2 : 2)])),
      pcts: Object.fromEntries(METRIC_KEYS.map((k) => [k, round(pcts[k], 0)])),
      score: round(sc, 1), rating,
      verdict: rating ? M.verdict(rating, pcts) : null,
      drawdown: dd ? { pct: round(dd.pct), peak: new Date(dd.peakT).toISOString().slice(0, 10), trough: new Date(dd.troughT).toISOString().slice(0, 10) } : null,
      sipDetail: m._sip ? { invested: m._sip.invested, value: round(m._sip.value, 3), months: m._sip.months } : null,
    };
  }

  function describe(code, meta, s) {
    const lastT = s.t.at(-1);
    return {
      code, name: meta.scheme_name || `Scheme ${code}`, house: meta.fund_house || null,
      category: meta.scheme_category || null, isin: meta.isin_growth || meta.isin_div_reinvestment || null,
      nav: round(s.v.at(-1), 4), navDate: new Date(lastT).toISOString().slice(0, 10),
      calendar: M.calendarReturns(s, 6).map((c) => ({ ...c, ret: round(c.ret) })),
    };
  }

  function analyze(loaded) {
    const gridEnd = Math.max(...loaded.map((f) => f.series.t.at(-1)));
    const all = loaded.map((f) => ({ f, s: f.series, m: basics(f.series) }));
    const rows = all.filter((r) => r.m.cagr3 != null);
    const excluded = all.filter((r) => r.m.cagr3 == null).map((r) => ({ name: r.f.meta.scheme_name || r.f.code, reason: "less than 3 years of NAV history" }));
    const peer = buildPeer(rows, gridEnd);
    for (const r of rows) relativeMetrics(r.m, r.s, peer);
    const dist = {};
    for (const k of METRIC_KEYS) dist[k] = rows.map((r) => r.m[k]).filter((x) => x != null).sort((a, b) => a - b);
    const funds = rows
      .map((r) => ({ ...finish({ ...describe(r.f.code, r.f.meta, r.s), chart: fundChart(r.s, peer) }, r.m, dist) }))
      .filter((f) => f.score != null)
      .sort((a, b) => b.score - a.score)
      .map((f, i) => ({ ...f, rank: i + 1 }));
    return { funds, excluded, peer: { cagr3: round(peer.cagr3), cagr5: round(peer.cagr5), grid: peer.grid, v: peer.v, roll1y: peer.roll1y.map(([t, r]) => [t, round(r, 4)]) }, dist };
  }

  // ---------- state, cache, builds ----------
  const state = { version: 1, categories: {}, codes: {} };
  const status = Object.fromEntries(Object.keys(CATEGORIES).map((k) => [k, { state: "idle", done: 0, total: CATEGORIES[k].funds.length, current: null, error: null }]));

  function load() {
    try {
      const j = JSON.parse(fs.readFileSync(cacheFile, "utf8"));
      if (j && j.version === 1) { state.categories = j.categories || {}; state.codes = j.codes || {}; }
    } catch {
      // no usable cache yet
    }
  }
  function save() {
    try {
      fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
      const tmp = `${cacheFile}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(state));
      fs.renameSync(tmp, cacheFile);
    } catch (e) {
      log("could not save cache:", e.message);
    }
  }

  let chain = Promise.resolve();
  function queueBuild(catKey) {
    if (status[catKey].state === "building" || status[catKey].state === "queued") return false;
    status[catKey].state = "queued";
    chain = chain.then(() => build(catKey)).catch(() => {});
    return true;
  }

  async function build(catKey) {
    const cat = CATEGORIES[catKey];
    const st = status[catKey];
    Object.assign(st, { state: "building", done: 0, total: cat.funds.length, current: null, error: null });
    const loaded = [], unmatched = [], failed = [];
    let consecutiveNetFails = 0;
    for (const phrases of cat.funds) {
      st.current = phrases[0];
      try {
        const code = await resolve(catKey, phrases, state);
        if (!code) unmatched.push(phrases[0]);
        else loaded.push({ code, ...(await history(code)) });
        consecutiveNetFails = 0;
      } catch (e) {
        failed.push({ name: phrases[0], error: e.message });
        consecutiveNetFails++;
        if (consecutiveNetFails >= 3 && !loaded.length) {
          Object.assign(st, { state: "error", error: `Could not reach mfapi.in (${e.message})` });
          return;
        }
      }
      st.done++;
    }
    if (loaded.length < 5) {
      Object.assign(st, { state: "error", error: `Only ${loaded.length} funds could be loaded, which is too few to rank` });
      return;
    }
    const result = analyze(loaded);
    state.categories[catKey] = { updatedAt: Date.now(), unmatched, failed, excluded: result.excluded, funds: result.funds, peer: result.peer, dist: result.dist };
    save();
    Object.assign(st, { state: "idle", current: null });
    log(`${catKey}: ranked ${result.funds.length} funds (${unmatched.length} unmatched, ${failed.length} failed)`);
  }

  const staleOrMissing = (k) => !state.categories[k] || Date.now() - state.categories[k].updatedAt > STALE_MS;
  const nextRefreshAt = () => {
    const times = Object.keys(CATEGORIES).map((k) => state.categories[k]?.updatedAt).filter(Boolean);
    return times.length ? Math.min(...times) + STALE_MS : null;
  };

  function start() {
    load();
    const kick = () => Object.keys(CATEGORIES).forEach((k) => staleOrMissing(k) && queueBuild(k));
    kick();
    setInterval(kick, 60 * 60 * 1000).unref();
  }

  // ---------- HTTP ----------
  const strip = ({ chart, calendar, ...rest }) => rest;
  function universePayload(catKey) {
    const d = state.categories[catKey];
    const st = status[catKey];
    return {
      cat: catKey, label: CATEGORIES[catKey].label,
      state: st.state === "idle" ? (d ? "ready" : "empty") : st.state,
      progress: { done: st.done, total: st.total, current: st.current },
      error: st.error, updatedAt: d?.updatedAt || null, nextRefreshAt: nextRefreshAt(),
      funds: d ? d.funds.map(strip) : [], unmatched: d?.unmatched || [], failed: d?.failed || [], excluded: d?.excluded || [],
      peer: d ? { cagr3: d.peer.cagr3, cagr5: d.peer.cagr5 } : null,
    };
  }

  const breakdown = (f) => M.WEIGHTS && Object.entries(M.WEIGHTS).map(([k, w]) => ({ key: k, label: M.LABELS[k], weight: w, value: f.metrics[k], percentile: f.pcts[k] }));

  async function fundPayload(code, hintCat) {
    for (const [catKey, d] of Object.entries(state.categories)) {
      const f = d.funds.find((x) => x.code === code);
      if (f) return { fund: f, inUniverse: true, cat: catKey, peer: { grid: d.peer.grid, v: d.peer.v, cagr3: d.peer.cagr3, cagr5: d.peer.cagr5 }, breakdown: breakdown(f) };
    }
    const { meta, series } = await history(code, 10);
    const catKey = detectCategory(meta) || hintCat;
    const d = state.categories[catKey];
    if (!d) throw Object.assign(new Error("Peer data for that category is still being built. Try again shortly."), { status: 409 });
    const m = basics(series);
    relativeMetrics(m, series, { cagr3: d.peer.cagr3, roll1y: d.peer.roll1y });
    const fund = finish({ ...describe(code, meta, series), chart: fundChart(series, d.peer) }, m, d.dist);
    return { fund, inUniverse: false, cat: catKey, peer: { grid: d.peer.grid, v: d.peer.v, cagr3: d.peer.cagr3, cagr5: d.peer.cagr5 }, breakdown: breakdown(fund) };
  }

  const express = require("express");
  const router = express.Router();
  const fail = (res, e) => res.status(e.status || 502).json({ error: e.message || "request failed" });
  const validCat = (c) => (CATEGORIES[c] ? c : null);

  router.get("/status", (req, res) => {
    res.json({ categories: Object.fromEntries(Object.keys(CATEGORIES).map((k) => [k, { ...status[k], updatedAt: state.categories[k]?.updatedAt || null }])), nextRefreshAt: nextRefreshAt(), now: Date.now() });
  });
  router.get("/universe", (req, res) => {
    const c = validCat(req.query.cat);
    return c ? res.json(universePayload(c)) : res.status(400).json({ error: "cat must be large, mid or small" });
  });
  router.get("/search", async (req, res) => {
    const q = String(req.query.q || "").trim();
    if (q.length < 3) return res.status(400).json({ error: "type at least 3 characters" });
    try {
      const rank = { "Direct Growth": 0, Growth: 1, "Regular Growth": 2 };
      const results = (await search(q, 10)).map((r) => ({ ...r, plan: planOf(r.name) }));
      results.sort((a, b) => (rank[a.plan] ?? 3) - (rank[b.plan] ?? 3) || a.name.length - b.name.length);
      res.json({ results: results.slice(0, 25) });
    } catch (e) { fail(res, e); }
  });
  router.get("/fund/:code", async (req, res) => {
    if (!/^\d{3,9}$/.test(req.params.code)) return res.status(400).json({ error: "invalid scheme code" });
    try { res.json(await fundPayload(req.params.code, validCat(req.query.cat) || "large")); } catch (e) { fail(res, e); }
  });
  router.post("/refresh", (req, res) => {
    const targets = validCat(req.query.cat) ? [req.query.cat] : Object.keys(CATEGORIES);
    const started = [], skipped = [];
    for (const k of targets) {
      const age = state.categories[k] ? Date.now() - state.categories[k].updatedAt : Infinity;
      if (age < MIN_MANUAL_REFRESH_MS) skipped.push(k);
      else if (queueBuild(k)) started.push(k);
    }
    res.json({ started, skipped, note: skipped.length ? "Recently refreshed categories are skipped for 10 minutes." : undefined });
  });

  return { router, start, search, history, analyze, build, state, status, planOf, tokens, detectCategory };
}

module.exports = { createMf, planOf, tokens, detectCategory };
