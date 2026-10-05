// Announcements tab: scans NSE's live corporate-announcements feed,
// year-to-date, for filings in any of a handful of tracked categories
// (capex/expansion, new order/contract win, product launch, M&A/stake
// acquisition, management change), and checks each hit's industry (as NSE
// itself tags it) against the industry we've already classified it under
// (the same NSE/BSE list the Universe tab uses). Talks to
// GET /api/filings/in/announcements (see nse-announcements.js).
//
// The server scans every category in one pass per chunk — it doesn't filter
// by category itself — so switching the filter chips below just re-slices
// the results already in memory; it never re-hits NSE.
(function () {
  "use strict";
  const root = document.getElementById("an-root");
  if (!root) return;

  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const isActive = () => document.querySelector("#tabs .tab.active")?.dataset.tab === "announcements";

  const CHUNK_DAYS = 7; // keep in sync with nse-announcements.js's maxChunkDays
  // How many chunk requests run at once. A year-to-date scan is dozens of
  // chunks; firing them one at a time (even with a small pacing gap) is
  // what made a full scan feel like it hung. Each chunk is an independent
  // NSE round-trip, so a handful run concurrently instead — enough to cut
  // wall-clock time by roughly this factor, not so many that it looks like
  // a burst of bot traffic to NSE.
  const CONCURRENCY = 4;

  // Fallback category list + colors, used until the server's own metadata
  // arrives with the first chunk (and as the color lookup from then on —
  // color is a display-only concern the server doesn't need to know about).
  const CATEGORY_COLORS = {
    capex: "#ef5350",
    new_order: "#4da3ff",
    product_launch: "#a78bfa",
    ma: "#ffc43d",
    management_change: "#39d2c0",
  };
  const FALLBACK_CATEGORIES = [
    { id: "capex", label: "Capex / Expansion" },
    { id: "new_order", label: "New Order / Contract Win" },
    { id: "product_launch", label: "Product Launch" },
    { id: "ma", label: "M&A / Stake Acquisition" },
    { id: "management_change", label: "Management Change" },
  ];
  const catColor = (id) => CATEGORY_COLORS[id] || "#9aa0a6";

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
    chunkIndex: 0, // count of chunks completed so far (not necessarily contiguous — see CONCURRENCY)
    maxToSeen: null, // latest "to" date among completed chunks, for the progress line
    checked: 0,
    items: [],
    categories: FALLBACK_CATEGORIES,
    activeCats: new Set(), // empty = show all
    asOf: null,
  };

  async function load(force) {
    if (state.status === "loading") return;
    if ((state.status === "ready" || state.status === "partial") && !force) return;
    const my = ++token;

    state.status = "loading";
    state.error = null;
    state.chunks = buildChunks();
    state.chunkIndex = 0;
    state.maxToSeen = null;
    state.checked = 0;
    state.items = [];
    state.asOf = null;
    render();

    let next = 0;
    let stopped = false;

    async function worker() {
      while (!stopped) {
        if (my !== token) return; // superseded by a newer scan or the tab was left
        const i = next++;
        if (i >= state.chunks.length) return;
        const { from, to } = state.chunks[i];
        const toIso = isoDate(to);
        try {
          const res = await fetch(`/api/filings/in/announcements?from=${isoDate(from)}&to=${toIso}`);
          const body = await res.json().catch(() => ({}));
          if (my !== token) return;
          if (!res.ok) throw Object.assign(new Error(body.message || `Request failed (${res.status})`), { code: body.error });
          // A sibling worker's request can still be in flight when another
          // one fails — don't let a late success flip the status back away
          // from "error" (it still merges its data in, since that's real
          // scanned progress worth keeping in the error view).
          state.checked += body.checked || 0;
          if (Array.isArray(body.items) && body.items.length) state.items.push(...body.items);
          if (Array.isArray(body.categories) && body.categories.length) state.categories = body.categories;
          state.asOf = body.asOf || state.asOf;
          state.chunkIndex++;
          if (!state.maxToSeen || toIso > state.maxToSeen) state.maxToSeen = toIso;
          if (!stopped) state.status = state.chunkIndex < state.chunks.length ? "partial" : "ready";
          render();
        } catch (e) {
          if (my !== token) return;
          if (!stopped) {
            stopped = true;
            state.error = e;
            state.status = "error";
          }
          render();
          return;
        }
      }
    }

    const workers = Array.from({ length: Math.min(CONCURRENCY, state.chunks.length || 1) }, () => worker());
    await Promise.all(workers);
  }

  function stat(label, value, cls) {
    return `<div class="cx-stat ${cls || ""}"><b>${esc(value)}</b><span>${esc(label)}</span></div>`;
  }

  // ---- Hand-entered sector figures (capex / demand) ----
  // NSE's filings feed tells us *who* announced *what*, never a rupee
  // figure — so capex/demand numbers are typed in by hand (per the plan:
  // "I'll start giving in future") and kept in this browser's localStorage,
  // keyed by our own industry name. Click a figure in the sector drill-down
  // to edit it.
  const FIGURES_KEY = "stalkingstocks.industryFigures.v1";
  function loadFigures() {
    try { return JSON.parse(localStorage.getItem(FIGURES_KEY) || "{}"); } catch (e) { return {}; }
  }
  function saveFigure(industry, field, value) {
    try {
      const all = loadFigures();
      all[industry] = all[industry] || {};
      if (value) all[industry][field] = value;
      else delete all[industry][field];
      localStorage.setItem(FIGURES_KEY, JSON.stringify(all));
    } catch (e) {}
  }

  // ---- Grouping the currently-filtered items by our own industry tag ----
  function industryGroups(items) {
    const map = new Map();
    for (const it of items) {
      const ind = it.ourIndustry || "Unclassified";
      if (!map.has(ind)) map.set(ind, { industry: ind, items: [], companies: new Set(), confirmed: 0, flaggedOnly: 0, mismatches: 0 });
      const g = map.get(ind);
      g.items.push(it);
      g.companies.add(it.symbol);
      if (it.pdfConfirmed) g.confirmed++;
      else if (it.pdfChecked) g.flaggedOnly++;
      if (it.industryMatch === false) g.mismatches++;
    }
    return Array.from(map.values()).sort((a, b) => b.items.length - a.items.length);
  }

  function activeCatMeta() {
    if (state.activeCats.size !== 1) return null;
    const id = Array.from(state.activeCats)[0];
    return state.categories.find((c) => c.id === id) || null;
  }

  function dotHtml(n, cls, title) {
    return n > 0 ? `<i class="cx-dot ${cls}" title="${esc(title)}">${n > 1 ? `<b>${n}</b>` : ""}</i>` : "";
  }

  function industryCardHtml(g, figures) {
    const f = figures[g.industry] || {};
    return `<button type="button" class="cx-ind-card" data-industry="${esc(g.industry)}">
      <div class="cx-ind-head"><h4>${esc(g.industry)}</h4><span class="cx-ind-n">${g.items.length}</span></div>
      <div class="cx-ind-figure${f.capex ? "" : " placeholder"}">${f.capex ? `₹${esc(f.capex)} cr capex` : "No capex figure yet"}</div>
      <div class="cx-ind-sub">${g.companies.size} ${g.companies.size === 1 ? "company" : "companies"}${f.demand ? ` · ${esc(f.demand)}` : ""}</div>
      <div class="cx-ind-dots">
        ${dotHtml(g.confirmed, "ok", `${g.confirmed} confirmed in the PDF body`)}
        ${dotHtml(g.flaggedOnly, "flag", `${g.flaggedOnly} flagged from NSE's summary only`)}
        ${dotHtml(g.mismatches, "mismatch", `${g.mismatches} industry mismatch`)}
      </div>
    </button>`;
  }

  function industrySectionHtml(items) {
    const groups = industryGroups(items);
    if (!groups.length) return "";
    const figures = loadFigures();
    const cat = activeCatMeta();
    const label = cat ? `${cat.label} by industry` : "By industry";
    const cc = cat ? catColor(cat.id) : "var(--accent)";
    return `<section class="cx-ind-section" style="--cc:${cc}">
      <div class="cx-ind-section-head">
        <h3>${esc(label)}</h3>
        <span class="cx-dim">Capex and demand figures are added by hand — open a sector to fill them in.</span>
      </div>
      <div class="cx-ind-grid">${groups.slice(0, 12).map((g) => industryCardHtml(g, figures)).join("")}</div>
      ${groups.length > 12 ? `<p class="cx-dim cx-ind-more">+${groups.length - 12} more ${groups.length - 12 === 1 ? "industry" : "industries"} with fewer filings</p>` : ""}
    </section>`;
  }

  // ---- Sector drill-down (one industry, Kyro-style decode panel) ----
  let modalIndustry = null;

  function dotForItem(it) {
    if (it.pdfConfirmed) return "ok";
    if (it.pdfChecked) return "flag";
    return "unchecked";
  }
  function dotTitleForItem(it) {
    if (it.pdfConfirmed) return "Confirmed in the PDF body";
    if (it.pdfChecked) return "Flagged from NSE's summary only — PDF didn't confirm it";
    return "PDF not checked";
  }

  function companyRowHtml(it) {
    const name = it.inUniverse ? `<a class="ur-co" href="#universe/IN/${encodeURIComponent(it.symbol)}">${esc(it.company)}</a>` : esc(it.company);
    return `<tr>
      <td><i class="cx-dot ${dotForItem(it)}" title="${esc(dotTitleForItem(it))}"></i></td>
      <td>${name} <span class="ur-tk">${esc(it.symbol)}</span>${it.industryMatch === false ? `<span class="cx-pill mismatch cx-inline-pill">mismatch</span>` : ""}</td>
      <td>${esc(it.desc || it.pdfSnippet || it.summary || "")}</td>
      <td class="cx-dim">${esc(it.filedAt || "")}</td>
      <td>${it.pdfUrl ? `<a class="kc-src" href="${esc(it.pdfUrl)}" target="_blank" rel="noopener noreferrer">Open →</a>` : ""}</td>
    </tr>`;
  }

  function modalHtml() {
    if (!modalIndustry) return "";
    const items = visibleItems().filter((it) => (it.ourIndustry || "Unclassified") === modalIndustry);
    const companies = new Set(items.map((it) => it.symbol));
    const confirmed = items.filter((it) => it.pdfConfirmed).length;
    const figures = loadFigures();
    const f = figures[modalIndustry] || {};
    const cat = activeCatMeta();
    const cc = cat ? catColor(cat.id) : "var(--accent)";
    return `<div class="cx-modal-backdrop" id="cx-modal-backdrop">
      <div class="cx-modal" style="--cc:${cc}" role="dialog" aria-modal="true" aria-label="${esc(modalIndustry)} sector detail">
        <button type="button" class="cx-modal-close" id="cx-modal-close" aria-label="Close">×</button>
        <div class="cx-modal-eyebrow">Sector decode · ${companies.size} listed ${companies.size === 1 ? "company" : "companies"}</div>
        <h2 class="cx-modal-title">${esc(modalIndustry)}</h2>
        <div class="cx-modal-headline">
          <span class="cx-modal-fig" contenteditable="true" data-field="capex" data-industry="${esc(modalIndustry)}" data-placeholder="add a capex figure">${esc(f.capex || "")}</span>
          <span class="cx-modal-fig-label">crore of capex</span>
          <span class="cx-modal-fig alt" contenteditable="true" data-field="demand" data-industry="${esc(modalIndustry)}" data-placeholder="add a demand figure">${esc(f.demand || "")}</span>
        </div>
        <p class="cx-modal-note">Click either figure above to type it in by hand — everything below is pulled live from NSE's filings feed.</p>
        <div class="cx-stats cx-modal-stats">
          ${stat(items.length, "Filings")}
          ${stat(companies.size, "Companies")}
          ${stat(confirmed, "Confirmed in PDF", "good")}
        </div>
        <div class="cx-modal-table-wrap">
          <table class="cx-modal-table">
            <thead><tr><th></th><th>Company</th><th>Filing</th><th>Filed</th><th></th></tr></thead>
            <tbody>${items.map(companyRowHtml).join("")}</tbody>
          </table>
        </div>
      </div>
    </div>`;
  }

  function renderModal() {
    let host = document.getElementById("cx-modal-host");
    if (!host) {
      host = document.createElement("div");
      host.id = "cx-modal-host";
      document.body.appendChild(host);
    }
    host.innerHTML = modalHtml();
  }

  function openModal(industry) { modalIndustry = industry; renderModal(); }
  function closeModal() { if (!modalIndustry) return; modalIndustry = null; renderModal(); }

  function matchPill(it) {
    if (it.industryMatch === true) return `<span class="cx-pill ok">Industry matches</span>`;
    if (it.industryMatch === false) return `<span class="cx-pill mismatch">Industry mismatch</span>`;
    return `<span class="cx-pill unknown">Can't compare</span>`;
  }

  function catBadges(categories) {
    return (categories || [])
      .map((c) => `<span class="cx-cat" style="--cc:${catColor(c.id)}">${esc(c.label)}</span>`)
      .join("");
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
        <div>
          <h3>${link} <span class="ur-tk">${esc(it.symbol)}</span></h3>
          <small class="cx-dim">${esc(it.filedAt || "")}${it.desc ? ` · ${esc(it.desc)}` : ""}</small>
          <div class="cx-cats">${catBadges(it.categories)}</div>
        </div>
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

  function visibleItems() {
    const all = sortedItems();
    if (!state.activeCats.size) return all;
    return all.filter((it) => (it.categories || []).some((c) => state.activeCats.has(c.id)));
  }

  function filterBarHtml(all) {
    const counts = new Map();
    for (const it of all) for (const c of it.categories || []) counts.set(c.id, (counts.get(c.id) || 0) + 1);
    const allActive = !state.activeCats.size;
    const chip = (id, label, count, color) => {
      const active = allActive && id === "all" ? true : state.activeCats.has(id);
      return `<button type="button" class="cx-filter${active ? " active" : ""}" data-cat="${esc(id)}" style="--cc:${color}">${esc(label)}<span class="cx-filter-n">${count}</span></button>`;
    };
    const chips = state.categories.map((c) => chip(c.id, c.label, counts.get(c.id) || 0, catColor(c.id))).join("");
    return `<div class="cx-filters">${chip("all", "All", all.length, "var(--text-main)")}${chips}</div>`;
  }

  function progressHtml() {
    const total = state.chunks.length || 1;
    const pct = Math.round((state.chunkIndex / total) * 100);
    const fromLabel = state.chunks.length ? isoDate(state.chunks[0].from) : "";
    // Several chunks run concurrently (see CONCURRENCY), so completions
    // don't arrive in date order — "through" names the furthest date any
    // completed chunk has reached so far, not strictly a contiguous range.
    return `<section class="card cx-progress">
      <p class="f-empty">Scanning NSE's corporate-filings feed year-to-date, from ${esc(fromLabel)}… (${state.chunkIndex}/${total} windows${state.maxToSeen ? `, up to ${esc(state.maxToSeen)}` : ""})</p>
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
      const all = sortedItems();
      root.innerHTML = `<section class="card sc-fail"><h3 class="sc-h">Couldn't finish the Announcements scan</h3><p>${esc(msg)}</p>${scanned}<button type="button" class="ur-browse ghost" id="cx-retry">Try again</button></section>`
        + (all.length
          ? `${filterBarHtml(all)}<div class="cx-list">${visibleItems().map(card).join("")}</div>`
          : "");
      return;
    }

    const all = sortedItems();
    const items = visibleItems();
    const scanning = state.status === "loading" || state.status === "partial";
    const year = new Date().getFullYear();

    root.innerHTML = `
      <section class="card cx-head">
        <div>
          <h2 class="k-title">Announcements</h2>
          <p class="k-sub">NSE's own live filings feed, scanned year-to-date (${year}) for capex/expansion, new orders, product launches, M&amp;A and management changes — each hit checked against the industry we've already classified the company under.</p>
        </div>
        <button type="button" class="ur-browse ghost" id="cx-refresh" ${scanning ? "disabled" : ""}>${scanning ? "Scanning…" : "Rescan"}</button>
      </section>
      ${scanning ? progressHtml() : ""}
      ${all.length ? filterBarHtml(all) : ""}
      ${items.length ? industrySectionHtml(items) : ""}
      <div class="cx-note"><b>How this works.</b> This walks NSE's corporate-announcements feed from Jan 1 of this year through today, a week at a time (NSE's API has no bulk mode, so a wide range in one request is too large to fetch reliably), checking every filing against all the categories above in one pass — the filter chips just re-slice what's already been scanned, so switching them never re-hits NSE. A hit starts from NSE's own one-line summary of the filing; where possible the actual PDF is fetched and read to confirm the phrase appears in the filing itself (see the "confirmed" badge on each card) — that extraction is best-effort and won't work on every PDF. "Industry mismatch" compares our own NSE/BSE classification (the same one Universe uses) against NSE's own sector tag for that company; the two schemes are named differently on purpose, so this flags real disagreements loosely, not just wording differences.</div>
      ${items.length
        ? `<div class="cx-list">${items.map(card).join("")}</div>`
        : scanning
          ? ""
          : `<section class="card"><p class="f-empty">${all.length ? "No filings match the selected filter." : "No tracked-category filings found year-to-date."}</p></section>`}
      ${state.asOf ? `<p class="cx-asof">${scanning ? "Last updated" : "Updated"} ${new Date(state.asOf).toLocaleTimeString("en-IN")} · <a href="https://www.nseindia.com/companies-listing/corporate-filings-announcements" target="_blank" rel="noopener">NSE corporate filings ↗</a></p>` : ""}`;
  }

  root.addEventListener("click", (e) => {
    if (e.target.closest("#cx-refresh") || e.target.closest("#cx-retry")) { load(true); return; }
    const chip = e.target.closest(".cx-filter");
    if (chip) {
      const id = chip.dataset.cat;
      if (id === "all") state.activeCats.clear();
      else if (state.activeCats.has(id)) state.activeCats.delete(id);
      else state.activeCats.add(id);
      render();
      return;
    }
    const indCard = e.target.closest(".cx-ind-card");
    if (indCard) { openModal(indCard.dataset.industry); }
  });

  // The modal lives outside #an-root (appended to <body>), so its own
  // interactions (close, backdrop click, editing a figure) are handled
  // here at the document level instead of on `root`.
  document.addEventListener("click", (e) => {
    if (e.target.closest("#cx-modal-close")) { closeModal(); return; }
    if (e.target.id === "cx-modal-backdrop") { closeModal(); }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modalIndustry) { closeModal(); return; }
    const fig = e.target.closest(".cx-modal-fig");
    if (fig && e.key === "Enter") { e.preventDefault(); fig.blur(); } // single line: Enter commits instead of inserting a break
  });
  // Select the whole figure on focus so typing replaces it outright —
  // without this, clicking into existing text (or the placeholder, before
  // :empty::before stopped putting literal placeholder text in the content)
  // drops the cursor mid-string and the first keystrokes land inside it.
  document.addEventListener("focusin", (e) => {
    const fig = e.target.closest(".cx-modal-fig");
    if (!fig) return;
    const sel = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(fig);
    sel.removeAllRanges();
    sel.addRange(range);
  });
  document.addEventListener("focusout", (e) => {
    const fig = e.target.closest(".cx-modal-fig");
    if (!fig) return;
    const industry = fig.dataset.industry;
    const field = fig.dataset.field;
    const value = fig.textContent.trim();
    if (fig.textContent !== value) fig.textContent = value; // strip stray whitespace/newlines, in place
    saveFigure(industry, field, value);
    // Deliberately NOT renderModal() here: that would replace the whole
    // modal's DOM mid-interaction, which — if the person is already
    // focusing the *next* field (e.g. tabbing from capex to demand) —
    // detaches the very node that's about to receive their keystrokes.
    // The label's visibility is handled in CSS (:empty + label) instead,
    // so nothing in the modal needs to re-render on blur. The industry
    // grid behind it is a separate DOM tree, so updating it here is safe.
    render();
  });

  document.addEventListener("tabchange", () => {
    if (isActive()) load(false);
    else { token++; closeModal(); } // leaving the tab invalidates any in-flight scan
  });
  if (isActive()) load(false);
})();
