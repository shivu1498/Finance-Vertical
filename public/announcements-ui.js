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
    const mismatches = items.filter((it) => it.industryMatch === false).length;
    const confirmed = items.filter((it) => it.pdfConfirmed).length;
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
      <div class="cx-stats">
        ${stat(state.checked.toLocaleString("en-IN"), "Filings checked")}
        ${stat(`Jan 1 – today`, "Window")}
        ${stat(all.length, "Flagged, all categories", "accent")}
        ${stat(confirmed, "Confirmed in the PDF body (shown)", "good")}
        ${stat(mismatches, "Industry mismatches (shown)", mismatches ? "warn" : "")}
      </div>
      ${all.length ? filterBarHtml(all) : ""}
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
    }
  });

  document.addEventListener("tabchange", () => {
    if (isActive()) load(false);
    else token++; // leaving the tab invalidates any in-flight scan
  });
  if (isActive()) load(false);
})();
