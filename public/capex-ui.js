// Capex Watch tab: scans NSE's live corporate-announcements feed for capex /
// capacity-expansion / unit-expansion filings, and checks the filing
// company's industry (as NSE itself tags it) against the industry we've
// already classified it under (the same NSE/BSE list the Universe tab
// uses). Talks to GET /api/filings/in/expansion (see nse-expansion.js).
(function () {
  "use strict";
  const root = document.getElementById("cx-root");
  if (!root) return;

  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const isActive = () => document.querySelector("#tabs .tab.active")?.dataset.tab === "capex";

  const state = { status: "idle", data: null, error: null };

  async function load(force) {
    if (state.status === "loading") return;
    if (state.status === "ready" && !force) return;
    state.status = "loading";
    render();
    try {
      const res = await fetch("/api/filings/in/expansion");
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw Object.assign(new Error(body.message || `Request failed (${res.status})`), { code: body.error });
      state.data = body;
      state.status = "ready";
    } catch (e) {
      state.error = e;
      state.status = "error";
    }
    render();
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

  function render() {
    if (!isActive()) return;
    if (state.status === "idle" || state.status === "loading") {
      root.innerHTML = `<section class="card"><p class="f-empty">Scanning NSE's live corporate-filings feed…</p></section>`;
      return;
    }
    if (state.status === "error") {
      const msg = (state.error && state.error.message) || "Couldn't reach NSE.";
      root.innerHTML = `<section class="card sc-fail"><h3 class="sc-h">Couldn't load Capex Watch</h3><p>${esc(msg)}</p><button type="button" class="ur-browse ghost" id="cx-retry">Try again</button></section>`;
      return;
    }
    const d = state.data;
    const mismatches = d.items.filter((it) => it.industryMatch === false).length;
    const confirmed = d.items.filter((it) => it.pdfConfirmed).length;
    root.innerHTML = `
      <section class="card cx-head">
        <div>
          <h2 class="k-title">Capex Watch</h2>
          <p class="k-sub">NSE's own live filings feed, scanned for <em>capex</em>, <em>capacity expansion</em> and <em>unit expansion</em> — each hit checked against the industry we've already classified the company under.</p>
        </div>
        <button type="button" class="ur-browse ghost" id="cx-refresh">Refresh</button>
      </section>
      <div class="cx-stats">
        ${stat("Filings checked", d.checked.toLocaleString("en-IN"))}
        ${stat(`Last ${d.windowDays} days`, "Window")}
        ${stat(d.flagged, "Capex / expansion mentions", "accent")}
        ${stat(confirmed, "Confirmed in the PDF body", "good")}
        ${stat(mismatches, "Industry mismatches", mismatches ? "warn" : "")}
      </div>
      <div class="cx-note"><b>How this works.</b> NSE's own feed only ever shows recent filings, so this is a rolling window, not a full history. A hit starts from NSE's own one-line summary of the filing; where possible the actual PDF is fetched and read to confirm the phrase appears in the filing itself (see the "confirmed" badge on each card) — that extraction is best-effort and won't work on every PDF. "Industry mismatch" compares our own NSE/BSE classification (the same one Universe uses) against NSE's own sector tag for that company; the two schemes are named differently on purpose, so this flags real disagreements loosely, not just wording differences.</div>
      ${d.items.length
        ? `<div class="cx-list">${d.items.map(card).join("")}</div>`
        : `<section class="card"><p class="f-empty">No capex / capacity-expansion / unit-expansion filings in the last ${d.windowDays} days.</p></section>`}
      <p class="cx-asof">Updated ${new Date(d.asOf).toLocaleTimeString("en-IN")} · <a href="https://www.nseindia.com/companies-listing/corporate-filings-announcements" target="_blank" rel="noopener">NSE corporate filings ↗</a></p>`;
  }

  root.addEventListener("click", (e) => {
    if (e.target.closest("#cx-refresh") || e.target.closest("#cx-retry")) load(true);
  });

  document.addEventListener("tabchange", () => { if (isActive()) load(false); });
  if (isActive()) load(false);
})();
