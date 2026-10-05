// Capex Watch tab: scans NSE's live corporate-announcements feed, year-to-date,
// for capex / capacity-expansion / unit-expansion filings, and checks the
// filing company's industry (as NSE itself tags it) against the industry
// we've already classified it under (the same NSE/BSE list the Universe tab
// uses). Talks to GET /api/filings/in/expansion?from=YYYY-MM-DD&to=YYYY-MM-DD
// (see nse-expansion.js).
//
// NSE's API has no pagination, so the server only ever answers one short
// date-range "chunk" per call (CHUNK_DAYS, matching the server's own
// maxChunkDays default). A year-to-date scan is Jan 1 -> today, which can be
// dozens of chunks, so this walks them one at a time, pacing each request a
// little and accumulating stats/items into a running display as they come
// in, rather than waiting for the whole scan before showing anything.
(function () {
  "use strict";
  const root = document.getElementById("cx-root");
  if (!root) return;

  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const isActive = () => document.querySelector("#tabs .tab.active")?.dataset.tab === "capex";

  const CHUNK_DAYS = 7; // keep in sync with nse-expansion.js's maxChunkDays
  const PACE_MS = 250; // small gap between chunk requests so we don't hammer NSE

  function pad2(n) { return String(n).padStart(2, "0"); }
  function isoDate(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
  function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
  function addDays(d, n) { return new Date(d.getTime() + n * 86_400_000); }

  function buildChunks() {
    const today = startOfDay(new Date());
    const jan1 = new Date(today.getFullYear(), 0, 1);
    const chunks = [];
    let from = jan1;
    while (from <= today) {
      let to = addDays(from, CHUNK_DAYS - 1);
      if (to > today) to = today;
      chunks.push({ from, to });
      from = addDays(to, 1);
    }
    return chunks;
  }

  // token guards against a stale scan still firing/rendering after the
  // user leaves the tab (or hits refresh) mid-scan.
  let token = 0;

  const state = {
    status: "idle", // idle | loading | partial | ready | error
    error: null,
    chunks: [],
    chunkIndex: 0,
    checked: 0,
    items: [],
    asOf: null,
  };

  function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

  async function load(force) {
    if (state.status === "loading") return;
    if ((state.status === "ready" || state.status === "partial") && !force) return;
    const my = ++token;

    state.status = "loading";
    state.error = null;
    state.chunks = buildChunks();
    state.chunkIndex = 0;
    state.checked = 0;
    state.items = [];
    state.asOf = null;
    render();

    for (let i = 0; i < state.chunks.length; i++) {
      if (my !== token) return; // superseded by a newer scan or the tab was left
      const { from, to } = state.chunks[i];
      try {
        const res = await fetch(`/api/filings/in/expansion?from=${isoDate(from)}&to=${isoDate(to)}`);
        const body = await res.json().catch(() => ({}));
        if (my !== token) return;
        if (!res.ok) throw Object.assign(new Error(body.message || `Request failed (${res.status})`), { code: body.error });
        state.checked += body.checked || 0;
        if (Array.isArray(body.items) && body.items.length) state.items.push(...body.items);
        state.asOf = body.asOf || state.asOf;
        state.chunkIndex = i + 1;
        state.status = state.chunkIndex < state.chunks.length ? "partial" : "ready";
        render();
      } catch (e) {
        if (my !== token) return;
        state.error = e;
        state.status = "error";
        render();
        return;
      }
      if (i < state.chunks.length - 1) await sleep(PACE_MS);
    }
  }

  function stat(label, value, cls) {
    return `<div class="cx-stat ${cls || ""}"><b>${esc(value)}</b><span>${esc(label)}</span></div>`;
  }

  function matchPill(it) {
    if (it.industryMatch === true) return `<span class="cx-pill ok">Industry matches</span>`;
    if (it.industryMatch === false) return `<span class="cx-pill mismatch">Industry mismatch</span>`;
    return `<span class="cx-pill unknown">Can't compare</span>`;
  }

  function keywordHtml(snippet, keywords) {
    if (!snippet) return "";
    let html = esc(snippet);
    for (const k of keywords || []) {
      const re = new RegExp(`(${k.replace(/\s+/g, "\\s+")})`, "ig");
      html = html.replace(re, "<mark>$1</mark>");
    }
    return html;
  }

  function card(it) {
    const kws = (it.keywords || []).map((k) => `<span class="cx-kw">${esc(k)}</span>`).join("");
    const pdfBadge = it.pdfConfirmed
      ? `<span class="cx-pdf ok">✓ confirmed in the PDF body</span>`
      : it.pdfChecked
        ? `<span class="cx-pdf no">PDF text didn't confirm it — flagged from NSE's own summary only</span>`
        : `<span class="cx-pdf no">PDF not checked</span>`;
    const link = it.inUniverse ? `<a class="ur-co" href="#universe/IN/${encodeURIComponent(it.symbol)}">${esc(it.company)}</a>` : `<b>${esc(it.company)}</b>`;
    return `<article class="cx-card">
      <div class="cx-card-head">
        <div><h3>${link} <span class="ur-tk">${esc(it.symbol)}</span></h3><small class="cx-dim">${esc(it.filedAt || "")}${it.desc ? ` · ${esc(it.desc)}` : ""}</small></div>
        ${matchPill(it)}
      </div>
      <div class="cx-industries">
        <div><span>Our classification</span><b>${esc(it.ourIndustry || "—")}</b></div>
        <div><span>NSE's own tag</span><b>${esc(it.nseIndustry || "—")}</b></div>
      </div>
      ${it.pdfSnippet ? `<p class="cx-snippet">${keywordHtml(it.pdfSnippet, it.keywords)}</p>` : it.summary ? `<p class="cx-snippet">${keywordHtml(it.summary, it.keywords)}</p>` : ""}
      <div class="cx-card-foot">
        <div class="cx-kws">${kws}</div>
        ${pdfBadge}
        ${it.pdfUrl ? `<a class="kc-src" href="${esc(it.pdfUrl)}" target="_blank" rel="noopener noreferrer">Open filing →</a>` : ""}
      </div>
    </article>`;
  }

  function sortedItems() {
    return state.items.slice().sort((a, b) => String(b.filedAt).localeCompare(String(a.filedAt)));
  }

  function progressHtml() {
    const total = state.chunks.length || 1;
    const pct = Math.round((state.chunkIndex / total) * 100);
    const last = state.chunks[state.chunkIndex - 1];
    const fromLabel = state.chunks.length ? isoDate(state.chunks[0].from) : "";
    return `<section class="card cx-progress">
      <p class="f-empty">Scanning NSE's corporate-filings feed year-to-date, from ${esc(fromLabel)}… (${state.chunkIndex}/${total} windows${last ? `, through ${esc(isoDate(last.to))}` : ""})</p>
      <div class="cx-bar"><div class="cx-bar-fill" style="width:${pct}%"></div></div>
      <p class="cx-dim">${state.checked.toLocaleString("en-IN")} filings checked so far · ${state.items.length} flagged</p>
    </section>`;
  }

  function render() {
    if (!isActive()) return;
    if (state.status === "idle" || (state.status === "loading" && !state.chunks.length)) {
      root.innerHTML = `<section class="card"><p class="f-empty">Scanning NSE's live corporate-filings feed…</p></section>`;
      return;
    }
    if (state.status === "error") {
      const msg = (state.error && state.error.message) || "Couldn't reach NSE.";
      const scanned = state.chunkIndex
        ? `<p class="cx-dim">Managed to scan ${state.chunkIndex}/${state.chunks.length} windows (${state.checked.toLocaleString("en-IN")} filings, ${state.items.length} flagged) before this happened.${state.items.length ? " Results so far are shown below." : ""}</p>`
        : "";
      root.innerHTML = `<section class="card sc-fail"><h3 class="sc-h">Couldn't finish the Capex Watch scan</h3><p>${esc(msg)}</p>${scanned}<button type="button" class="ur-browse ghost" id="cx-retry">Try again</button></section>`
        + (state.items.length
          ? `<div class="cx-list">${sortedItems().map(card).join("")}</div>`
          : "");
      return;
    }

    const items = sortedItems();
    const mismatches = items.filter((it) => it.industryMatch === false).length;
    const confirmed = items.filter((it) => it.pdfConfirmed).length;
    const scanning = state.status === "loading" || state.status === "partial";
    const year = new Date().getFullYear();

    root.innerHTML = `
      <section class="card cx-head">
        <div>
          <h2 class="k-title">Capex Watch</h2>
          <p class="k-sub">NSE's own live filings feed, scanned year-to-date (${year}) for <em>capex</em>, <em>capacity expansion</em> and <em>unit expansion</em> — each hit checked against the industry we've already classified the company under.</p>
        </div>
        <button type="button" class="ur-browse ghost" id="cx-refresh" ${scanning ? "disabled" : ""}>${scanning ? "Scanning…" : "Rescan"}</button>
      </section>
      ${scanning ? progressHtml() : ""}
      <div class="cx-stats">
        ${stat(state.checked.toLocaleString("en-IN"), "Filings checked")}
        ${stat(`Jan 1 – today`, "Window")}
        ${stat(items.length, "Capex / expansion mentions", "accent")}
        ${stat(confirmed, "Confirmed in the PDF body", "good")}
        ${stat(mismatches, "Industry mismatches", mismatches ? "warn" : "")}
      </div>
      <div class="cx-note"><b>How this works.</b> This walks NSE's corporate-announcements feed from Jan 1 of this year through today, a week at a time (NSE's API has no bulk mode, so a wide range in one request is too large to fetch reliably). A hit starts from NSE's own one-line summary of the filing; where possible the actual PDF is fetched and read to confirm the phrase appears in the filing itself (see the "confirmed" badge on each card) — that extraction is best-effort and won't work on every PDF. "Industry mismatch" compares our own NSE/BSE classification (the same one Universe uses) against NSE's own sector tag for that company; the two schemes are named differently on purpose, so this flags real disagreements loosely, not just wording differences.</div>
      ${items.length
        ? `<div class="cx-list">${items.map(card).join("")}</div>`
        : scanning
          ? ""
          : `<section class="card"><p class="f-empty">No capex / capacity-expansion / unit-expansion filings found year-to-date.</p></section>`}
      ${state.asOf ? `<p class="cx-asof">${scanning ? "Last updated" : "Updated"} ${new Date(state.asOf).toLocaleTimeString("en-IN")} · <a href="https://www.nseindia.com/companies-listing/corporate-filings-announcements" target="_blank" rel="noopener">NSE corporate filings ↗</a></p>` : ""}`;
  }

  root.addEventListener("click", (e) => {
    if (e.target.closest("#cx-refresh") || e.target.closest("#cx-retry")) load(true);
  });

  document.addEventListener("tabchange", () => {
    if (isActive()) load(false);
    else token++; // leaving the tab invalidates any in-flight scan
  });
  if (isActive()) load(false);
})();
