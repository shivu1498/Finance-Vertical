// Knowledge tab: Sector / Company switch, plus the Company view.
// The Sector view (knowledge-ui.js) is untouched; this file only toggles
// between #k-root (sector) and #kc-root (company).
//
// Company view: search by ticker or company name (companies.json, imported
// from the BSE/NSE company-list CSV), see the company's industry group and
// industry, and let /api/tijori/resolve find its verified Tijori Finance page.
// If we have a curated link list for that ticker (company-knowledge.js) it is
// shown inline; otherwise the list is read live from the company's Tijori page
// (resolve returns it as `knowledge`) and shown the same way, falling back to
// the Tijori Knowledge Base link if Tijori can't be read from our server. A
// "Browse by industry" panel lists the whole universe by that classification.
(function () {
  const sectorRoot = document.getElementById("k-root");
  const root = document.getElementById("kc-root");
  const sw = document.getElementById("kx-switch");
  const title = document.getElementById("kx-title");
  const sub = document.getElementById("kx-sub");
  if (!sectorRoot || !root || !sw || typeof K_COMPANIES === "undefined") return;

  const VIEW_KEY = "stalkingstocks.knowledge.view";
  const COPY = {
    sector: ["Sector Specific Knowledge", "Curated sector research, one sub-tab per sector. Pick a thumbnail to dive in."],
    company: ["Company Knowledge", "Search any listed company by ticker or name, see its industry, and jump to its Tijori Finance knowledge base."],
  };
  const state = {
    view: "sector",
    ticker: K_COMPANIES[0].ticker || null,
    lookup: { status: "idle", data: null }, // idle | loading | done | error
    query: "",
  };
  // Company universe + industry classification, loaded lazily from companies.json.
  const dir = { status: "idle", rows: [], byCode: new Map(), groups: [] };
  const browse = { open: false, group: null, industry: null, shown: 120 };
  const sugg = { items: [], active: -1 };
  let seq = 0;
  let built = false;

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function readView() {
    try {
      return localStorage.getItem(VIEW_KEY) === "company" ? "company" : "sector";
    } catch {
      return "sector";
    }
  }
  function saveView(v) {
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      // storage unavailable: the choice just won't persist
    }
  }

  function normalize(raw) {
    const t = String(raw || "").trim().toUpperCase().replace(/^(NSE|BSE):/, "").replace(/\.(NS|BO)$/, "");
    return /^[A-Z0-9&-]{1,20}$/.test(t) ? t : null;
  }

  function host(url) {
    try {
      return new URL(url).hostname.replace(/^www\./, "");
    } catch {
      return "";
    }
  }
  const KIND = [
    [/youtube\.com|youtu\.be/, "Video"],
    [/(^|\.)(x|twitter)\.com$/, "Thread"],
    [/valuepickr\.com/, "Forum"],
  ];
  function kind(url) {
    const h = host(url);
    for (const [re, label] of KIND) if (re.test(h)) return label;
    return "Article";
  }

  function curated() {
    return K_COMPANIES.find((c) => c.ticker && c.ticker === state.ticker) || null;
  }

  /* ---------- company universe (companies.json) ---------- */
  async function loadDir() {
    if (dir.status !== "idle") return;
    dir.status = "loading";
    renderBrowse();
    try {
      const res = await fetch("companies.json");
      if (!res.ok) throw new Error(`companies.json ${res.status}`);
      const d = await res.json();
      const groups = new Map();
      for (const [name, nse, bse, isin, ind] of d.rows) {
        const [industry, g] = d.industries[ind] || ["Unclassified", -1];
        const group = d.groups[g] || "Unclassified";
        const rec = { name, nse, bse, isin, group, industry, code: nse || bse, nameL: name.toLowerCase(), codeL: (nse || bse).toLowerCase() };
        dir.rows.push(rec);
        if (nse) dir.byCode.set(nse, rec);
        if (bse) dir.byCode.set(bse, rec);
        if (!groups.has(group)) groups.set(group, { name: group, count: 0, inds: new Map() });
        const gr = groups.get(group);
        gr.count++;
        gr.inds.set(industry, (gr.inds.get(industry) || 0) + 1);
      }
      dir.groups = [...groups.values()].sort((a, b) => a.name.localeCompare(b.name));
      dir.status = "ready";
    } catch {
      dir.status = "error";
    }
    renderBrowse();
    renderOut();
  }

  // Ticker prefix beats name prefix beats "contains", best 8.
  function search(q) {
    const t = q.trim().toLowerCase();
    if (!t || dir.status !== "ready") return [];
    const scored = [];
    for (const r of dir.rows) {
      let sc = 0;
      if (r.codeL === t || (r.bse && r.bse === t)) sc = 100;
      else if (r.codeL.startsWith(t)) sc = 80;
      else if (r.nameL.startsWith(t)) sc = 70;
      else if (r.nameL.includes(" " + t)) sc = 55;
      else if (r.nameL.includes(t)) sc = 40;
      else if (t.length >= 3 && r.codeL.includes(t)) sc = 30;
      if (sc) scored.push([sc, r]);
    }
    scored.sort((a, b) => b[0] - a[0] || a[1].name.localeCompare(b[1].name));
    return scored.slice(0, 8).map((x) => x[1]);
  }

  function renderSugg() {
    const box = document.getElementById("kc-sugg");
    if (!box) return;
    if (!sugg.items.length) {
      box.hidden = true;
      box.innerHTML = "";
      return;
    }
    box.hidden = false;
    box.innerHTML = sugg.items
      .map(
        (r, i) => `<li role="option" class="kc-sg ${i === sugg.active ? "active" : ""}" data-pick="${esc(r.code)}" aria-selected="${i === sugg.active}">
          <span class="kc-sg-code">${esc(r.code)}</span>
          <span class="kc-sg-name">${esc(r.name)}</span>
          <span class="kc-sg-ind">${esc(r.industry)}</span>
        </li>`
      )
      .join("");
  }

  function pick(code) {
    const input = document.getElementById("kc-ticker");
    if (input) input.value = code;
    sugg.items = [];
    sugg.active = -1;
    renderSugg();
    lookup(code);
  }

  /* ---------- lookup ---------- */
  async function lookup(raw) {
    const t = normalize(raw);
    if (!t) {
      state.ticker = null;
      state.lookup = { status: "error", data: null, message: "That doesn't look like a ticker. Try GRASIM, RELIANCE or M&M." };
      renderOut();
      return;
    }
    state.ticker = t;
    state.query = "";
    const mine = ++seq;
    state.lookup = { status: "loading", data: null };
    renderOut();
    try {
      const ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
      const timer = ctl ? setTimeout(() => ctl.abort(), 28000) : null;
      const res = await fetch(`/api/tijori/resolve?ticker=${encodeURIComponent(t)}`, ctl ? { signal: ctl.signal } : undefined);
      if (timer) clearTimeout(timer);
      if (!res.ok) throw new Error(`lookup failed (${res.status})`);
      const data = await res.json();
      if (mine !== seq) return; // a newer search replaced this one
      state.lookup = { status: "done", data };
    } catch (err) {
      if (mine !== seq) return;
      state.lookup = { status: "error", data: null, message: "Couldn't reach the lookup service right now." };
    }
    renderOut();
  }

  /* ---------- rendering ---------- */
  function badge(l) {
    if (l.status === "loading") return `<span class="kc-badge wait">Looking up ${esc(state.ticker)}…</span>`;
    if (l.status === "error") return `<span class="kc-badge bad">${esc(l.message || "Lookup failed")}</span>`;
    if (l.status !== "done") return "";
    const s = l.data.tijori.status;
    if (s === "verified") return `<span class="kc-badge ok">&#10003; Found on Tijori Finance</span>`;
    if (s === "unverified") return `<span class="kc-badge wait" title="Tijori couldn't be checked from our server, so this link is a best guess">Link not checked</span>`;
    if (s === "not_found") return `<span class="kc-badge bad">Not found on Tijori Finance</span>`;
    return `<span class="kc-badge bad">Ticker not found</span>`;
  }

  function connectCard() {
    if (!state.ticker && state.lookup.status !== "error") return "";
    const l = state.lookup;
    const d = l.status === "done" ? l.data : null;
    const c = curated();
    const rec = state.ticker ? dir.byCode.get(state.ticker) : null;
    // Show the legal name when we have it; the list's short name otherwise.
    const name = (d && (d.legalName || d.name)) || (rec && rec.name) || (c && c.name) || "";
    const group = (rec && rec.group) || (d && d.industryGroup) || "";
    const industry = (rec && rec.industry) || (d && d.industry) || "";
    const nse = (rec && rec.nse) || (d && d.listed && d.listed.nse) || "";
    const bse = (rec && rec.bse) || (d && d.listed && d.listed.bse) || "";
    const isin = (rec && rec.isin) || (d && d.listed && d.listed.isin) || "";
    const tijoriUrl = d && d.tijori.url ? d.tijori.url : l.status === "error" && c ? c.source : null;
    const screenerUrl = d ? d.screenerUrl : state.ticker ? `https://www.screener.in/company/${encodeURIComponent(state.ticker)}/consolidated/` : null;
    const via = d && d.nameSource && d.nameSource !== "list" ? `<span class="kc-via">name via ${d.nameSource === "screener" ? "Screener.in" : "Yahoo Finance"}</span>` : "";
    const ids = [nse && `NSE ${nse}`, bse && `BSE ${bse}`, isin && `ISIN ${isin}`].filter(Boolean).join(" · ");
    const cls = group
      ? `<div class="kc-class">
          <span class="kc-class-label">Industry</span>
          <button type="button" class="kc-tag" data-bgroup="${esc(group)}" title="Browse everything in ${esc(group)}">${esc(group)}</button>
          ${industry && industry !== group ? `<span class="kc-arrow" aria-hidden="true">&rsaquo;</span><button type="button" class="kc-tag alt" data-bgroup="${esc(group)}" data-bind="${esc(industry)}" title="Browse everything in ${esc(industry)}">${esc(industry)}</button>` : ""}
        </div>`
      : "";

    return `<section class="card kc-connect">
      <div class="kc-main">
        <div class="kc-flow">
          <span class="kc-ticker">${esc(state.ticker || "—")}</span>
          <span class="kc-arrow" aria-hidden="true">&rarr;</span>
          <span class="kc-cname">${name ? esc(name) : "&nbsp;"}</span>
          ${via}
        </div>
        ${ids ? `<div class="kc-ids">${esc(ids)}</div>` : ""}
        ${cls}
      </div>
      <div class="kc-actions">
        ${badge(l)}
        ${tijoriUrl ? `<a class="kc-src" href="${esc(tijoriUrl)}" target="_blank" rel="noopener noreferrer">Knowledge Base on Tijori &#8599;</a>` : ""}
        ${screenerUrl ? `<a class="kc-src" href="${esc(screenerUrl)}" target="_blank" rel="noopener noreferrer">Screener.in &#8599;</a>` : ""}
      </div>
    </section>`;
  }

  function linkRow(c, l) {
    const href = l.url || c.source;
    const by = l.by ? ` <span class="kc-by">&ndash; ${esc(l.by)}</span>` : "";
    const note = l.url ? "" : ` <span class="kc-note" title="Original link could not be confirmed; opens the Tijori page">via Tijori</span>`;
    return `<li class="kc-item">
      <span class="kc-kind">${kind(href)}</span>
      <a class="kc-link" href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(l.title)}</a>${by}${note}
    </li>`;
  }

  function listCard(c) {
    const q = state.query.trim().toLowerCase();
    const total = c.groups.reduce((n, g) => n + g.links.length, 0);
    const groups = c.groups
      .map((g) => {
        const links = g.links.filter((l) => !q || `${l.title} ${l.by} ${g.title}`.toLowerCase().includes(q));
        if (!links.length) return "";
        return `<section class="kc-group">
          <h3 class="kc-group-title">${esc(g.title)}</h3>
          <ul class="kc-list">${links.map((l) => linkRow(c, l)).join("")}</ul>
        </section>`;
      })
      .join("");
    return `<section class="card kc-card">
      <div class="kc-head">
        <div>
          <h2 class="kc-name">${esc(c.name)}</h2>
          <div class="kc-meta">${esc(c.sector)}</div>
        </div>
        <label class="k-search kc-search">
          <span class="k-search-icon" aria-hidden="true">&#9906;</span>
          <input id="kc-search" type="search" placeholder="Filter ${total} links…" autocomplete="off" value="${esc(state.query)}" aria-label="Filter company links" />
        </label>
      </div>
      <h2 class="kc-section">Discussions &amp; Analysis</h2>
      ${groups || `<p class="kc-empty">No links match “${esc(state.query)}”.</p>`}
      <p class="kc-foot">${c.live ? "Read live from" : "Curated from"} Tijori Finance's knowledge base. Links open the original author's content; we don't host or republish it.</p>
    </section>`;
  }

  // Live list read from the company's Tijori page by /api/tijori/resolve.
  function liveCompany() {
    const l = state.lookup;
    if (l.status !== "done" || !l.data.knowledge) return null;
    const d = l.data;
    return {
      name: d.legalName || d.name || state.ticker,
      sector: d.industryGroup || "",
      source: d.tijori.url,
      live: true,
      groups: d.knowledge.groups.map((g) => ({ title: g.title || "Links", links: g.links })),
    };
  }

  function noListNote() {
    const l = state.lookup;
    if (l.status !== "done" || curated() || liveCompany()) return "";
    const s = l.data.tijori.status;
    if (s === "verified" || s === "unverified") {
      return `<section class="card kc-card"><p class="kc-empty">We couldn't read this company's link list from Tijori just now. Use <b>Knowledge Base on Tijori</b> above to read it on Tijori Finance.</p></section>`;
    }
    return "";
  }

  function renderOut() {
    const out = document.getElementById("kc-out");
    if (!out) return;
    const c = curated();
    const live = c ? null : liveCompany();
    out.innerHTML = connectCard() + (c ? listCard(c) : live ? listCard(live) : noListNote());
  }

  /* ---------- browse by industry ---------- */
  function renderBrowse() {
    const box = document.getElementById("kc-browse");
    if (!box) return;
    let body = "";
    if (dir.status === "loading" || dir.status === "idle") {
      body = `<p class="kc-empty">Loading the company list…</p>`;
    } else if (dir.status === "error") {
      body = `<p class="kc-empty">Couldn't load the company list (companies.json).</p>`;
    } else if (browse.open) {
      const g = browse.group ? dir.groups.find((x) => x.name === browse.group) : null;
      if (!g) {
        body = `<div class="kc-gchips">${dir.groups
          .map((x) => `<button type="button" class="kc-chip" data-bgroup="${esc(x.name)}">${esc(x.name)} <span class="kc-count">${x.count}</span></button>`)
          .join("")}</div>`;
      } else {
        const inds = [...g.inds.entries()].sort((a, b) => b[1] - a[1]);
        const rows = dir.rows.filter((r) => r.group === g.name && (!browse.industry || r.industry === browse.industry));
        const shown = rows.slice(0, browse.shown);
        body = `
          <div class="kc-crumb">
            <button type="button" class="kc-back" data-bback="1">&larr; All industry groups</button>
            <strong>${esc(g.name)}</strong>
          </div>
          <div class="kc-gchips">
            <button type="button" class="kc-chip ${browse.industry ? "" : "active"}" data-bgroup="${esc(g.name)}">All <span class="kc-count">${g.count}</span></button>
            ${inds
              .map(([n, c]) => `<button type="button" class="kc-chip ${browse.industry === n ? "active" : ""}" data-bgroup="${esc(g.name)}" data-bind="${esc(n)}">${esc(n)} <span class="kc-count">${c}</span></button>`)
              .join("")}
          </div>
          <ul class="kc-clist">${shown
            .map(
              (r) => `<li><button type="button" class="kc-crow" data-pick="${esc(r.code)}">
                <span class="kc-sg-code">${esc(r.code)}</span>
                <span class="kc-sg-name">${esc(r.name)}</span>
                ${browse.industry ? "" : `<span class="kc-sg-ind">${esc(r.industry)}</span>`}
              </button></li>`
            )
            .join("")}</ul>
          ${rows.length > shown.length ? `<button type="button" class="kc-more" data-bmore="1">Show more (${rows.length - shown.length} left)</button>` : ""}`;
      }
    }
    box.innerHTML = `<section class="card kc-browse">
      <button type="button" class="kc-toggle" data-btoggle="1" aria-expanded="${browse.open}">
        <span class="section-title kc-toggle-title">BROWSE BY INDUSTRY <span class="muted">· ${dir.status === "ready" ? `${dir.rows.length.toLocaleString("en-IN")} companies in ${dir.groups.length} groups` : "company list"}</span></span>
        <span class="kc-chev" aria-hidden="true">${browse.open ? "&#9662;" : "&#9656;"}</span>
      </button>
      ${browse.open || dir.status !== "ready" ? body : ""}
    </section>`;
  }

  function openBrowse(group, industry) {
    browse.open = true;
    browse.group = group || null;
    browse.industry = industry || null;
    browse.shown = 120;
    renderBrowse();
  }

  function build() {
    const chips = K_COMPANIES.filter((c) => c.ticker)
      .map((c) => `<button type="button" class="kc-chip" data-ticker="${esc(c.ticker)}">${esc(c.name)}</button>`)
      .join("");
    root.innerHTML = `
      <section class="card kc-tools">
        <form class="kc-form" id="kc-form" autocomplete="off">
          <div class="kc-combo">
            <label class="k-search kc-ticker-in">
              <span class="k-search-icon" aria-hidden="true">&#9906;</span>
              <input id="kc-ticker" type="text" role="combobox" aria-expanded="false" aria-controls="kc-sugg" placeholder="Ticker or company name, e.g. GRASIM, Reliance, M&amp;M" spellcheck="false" aria-label="Ticker or company name" value="${esc(state.ticker || "")}" />
            </label>
            <ul id="kc-sugg" class="kc-sugg" role="listbox" hidden></ul>
          </div>
          <button type="submit" class="kc-go">Find company</button>
        </form>
        <div class="kc-chips" role="group" aria-label="Companies with curated links">${chips}</div>
      </section>
      <div id="kc-out"></div>
      <div id="kc-browse"></div>`;
    built = true;
    renderBrowse();
    loadDir();
  }

  /* ---------- view switching ---------- */
  function setView(v, persist) {
    state.view = v;
    if (persist) saveView(v);
    sectorRoot.hidden = v !== "sector";
    root.hidden = v !== "company";
    title.textContent = COPY[v][0];
    sub.textContent = COPY[v][1];
    sw.querySelectorAll("button[data-kx]").forEach((b) => {
      const on = b.dataset.kx === v;
      b.classList.toggle("active", on);
      b.setAttribute("aria-selected", String(on));
    });
    if (v === "company") {
      if (!built) build();
      if (state.lookup.status === "idle" && state.ticker) lookup(state.ticker);
      else renderOut();
    }
  }

  sw.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-kx]");
    if (b) setView(b.dataset.kx, true);
  });

  root.addEventListener("submit", (e) => {
    if (e.target.id !== "kc-form") return;
    e.preventDefault();
    const input = document.getElementById("kc-ticker");
    const v = input.value;
    // Exact ticker wins; otherwise treat the text as a company name.
    const exact = dir.byCode.get(normalize(v) || "");
    const best = !exact && dir.status === "ready" ? search(v)[0] : null;
    const chosen = sugg.active >= 0 && sugg.items[sugg.active] ? sugg.items[sugg.active] : exact || best;
    if (chosen) {
      input.value = chosen.code;
      pick(chosen.code);
    } else {
      sugg.items = [];
      renderSugg();
      lookup(v);
    }
  });

  root.addEventListener("click", (e) => {
    const t = e.target;
    const chip = t.closest("[data-ticker]");
    if (chip) {
      pick(chip.dataset.ticker);
      return;
    }
    const pk = t.closest("[data-pick]");
    if (pk) {
      pick(pk.dataset.pick);
      const out = document.getElementById("kc-out");
      if (out && out.scrollIntoView) out.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    if (t.closest("[data-btoggle]")) {
      browse.open = !browse.open;
      if (browse.open && dir.status === "idle") loadDir();
      renderBrowse();
      return;
    }
    const bg = t.closest("[data-bgroup]");
    if (bg) {
      openBrowse(bg.dataset.bgroup, bg.dataset.bind || null);
      const box = document.getElementById("kc-browse");
      if (box && box.scrollIntoView && bg.closest(".kc-connect")) box.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    if (t.closest("[data-bback]")) {
      openBrowse(null, null);
      return;
    }
    if (t.closest("[data-bmore]")) {
      browse.shown += 200;
      renderBrowse();
    }
  });

  root.addEventListener("input", (e) => {
    if (e.target.id === "kc-ticker") {
      sugg.items = search(e.target.value);
      sugg.active = -1;
      e.target.setAttribute("aria-expanded", String(sugg.items.length > 0));
      renderSugg();
      return;
    }
    if (e.target.id !== "kc-search") return;
    state.query = e.target.value;
    const pos = e.target.selectionStart;
    renderOut();
    const el = document.getElementById("kc-search");
    if (el) {
      el.focus();
      try {
        el.setSelectionRange(pos, pos);
      } catch {
        // some input types don't support selection ranges
      }
    }
  });

  root.addEventListener("keydown", (e) => {
    if (e.target.id !== "kc-ticker" || !sugg.items.length) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const n = sugg.items.length;
      let a = sugg.active + (e.key === "ArrowDown" ? 1 : -1);
      if (a >= n) a = -1;
      else if (a < -1) a = n - 1;
      sugg.active = a;
      renderSugg();
    } else if (e.key === "Escape") {
      sugg.items = [];
      sugg.active = -1;
      renderSugg();
    }
  });

  document.addEventListener("click", (e) => {
    if (!e.target.closest || e.target.closest(".kc-combo")) return;
    if (sugg.items.length) {
      sugg.items = [];
      sugg.active = -1;
      renderSugg();
    }
  });

  setView(readView(), false);
})();
