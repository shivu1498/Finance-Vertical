// Sector Knowledge -> Sector: sectors as defined in the uploaded BSE/NSE company
// sheet (the "Industry Group" column of public/companies.json, 59 groups).
//
// Each group is an animated card (hover: icon draws itself, rings pulse, shine
// sweeps). A group opens to its page: linked research sectors (the curated
// pages in knowledge.js), the industries inside it, and its companies with links
// to the Screener-style company pages. A switch keeps the original 20 research
// sectors one tap away. Routes: #knowledge (grid), #knowledge/g-<slug> (group).
(function () {
  "use strict";

  const kRoot = document.getElementById("k-root");
  const kxSwitch = document.getElementById("kx-switch");
  if (!kRoot || !kxSwitch || typeof K_SECTORS === "undefined") return;

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmt = (n) => Number(n).toLocaleString("en-IN");
  const slug = (s) => String(s).toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const MODE_KEY = "stalkingstocks.kg.mode";

  // More line icons (24x24) for groups the research set has none for.
  const EXTRA_ICONS = {
    flask: '<path d="M9 3h6M10 3v6l-5.5 9.5A1.6 1.6 0 0 0 6 21h12a1.6 1.6 0 0 0 1.5-2.5L14 9V3"/><path d="M7.5 15h9"/>',
    gear: '<circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1"/>',
    leaf: '<path d="M5 19c0-8 5-14 15-14 0 10-6 15-14 15"/><path d="M5 19c3-5 6-7 10-9"/>',
    thread: '<path d="M6 3l12 18M18 3L6 21"/><circle cx="12" cy="12" r="2"/>',
    grid: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
    dots: '<circle cx="6" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="18" cy="12" r="1.6"/>',
    plane: '<path d="M21 3L3 11l7 2.5L12.5 21l3-8z"/><path d="M10 13.5L21 3"/>',
  };
  const icon = (k) => K_ICONS[k] || EXTRA_ICONS[k] || EXTRA_ICONS.grid;

  // Sheet group -> [icon, research sectors from knowledge.js that cover it].
  const META = {
    "Banks": ["vault", ["pvt-bank", "bank", "psu-banks"]],
    "Capital Markets": ["chart", ["capital-mkts"]],
    "Finance": ["rupee", ["fin-services"]],
    "Insurance": ["shield", ["fin-services"]],
    "Financial Technology (Fintech)": ["code", ["fin-services"]],
    "Pharmaceuticals & Biotechnology": ["pill", ["pharma"]],
    "Healthcare Services": ["cross", ["healthcare"]],
    "Healthcare Equipment & Supplies": ["cross", ["healthcare"]],
    "IT - Software": ["code", ["it"]],
    "IT - Services": ["code", ["it"]],
    "IT - Hardware": ["tv", ["it"]],
    "Telecom - Services": ["globe", ["services"]],
    "Telecom -  Equipment & Accessories": ["globe", ["services"]],
    "Retailing": ["basket", ["services"]],
    "Commercial Services & Supplies": ["briefcase", ["services"]],
    "Leisure Services": ["briefcase", ["services"]],
    "Transport Services": ["plane", ["services"]],
    "Other Consumer Services": ["briefcase", ["services"]],
    "Engineering Services": ["gear", ["services"]],
    "Automobiles": ["car", ["auto"]],
    "Auto Components": ["car", ["auto"]],
    "Agricultural, Commercial & Construction Vehicles": ["car", ["auto"]],
    "Consumer Durables": ["tv", ["cons-durables"]],
    "Textiles & Apparels": ["thread", []],
    "Food Products": ["basket", ["fmcg"]],
    "Beverages": ["basket", ["fmcg"]],
    "Personal Products": ["basket", ["fmcg"]],
    "Household Products": ["basket", ["fmcg"]],
    "Diversified FMCG": ["basket", ["fmcg"]],
    "Cigarettes & Tobacco Products": ["basket", ["fmcg"]],
    "Agricultural Food & other Products": ["wheat", []],
    "Fertilizers & Agrochemicals": ["wheat", []],
    "Cement & Cement Products": ["building", ["commodities"]],
    "Other Construction Materials": ["building", ["commodities"]],
    "Construction": ["bridge", ["infra"]],
    "Transport Infrastructure": ["bridge", ["infra"]],
    "Aerospace & Defense": ["shield", ["infra"]],
    "Realty": ["building", ["realty"]],
    "Oil": ["drop", ["oil-gas"]],
    "Gas": ["drop", ["oil-gas"]],
    "Petroleum Products": ["drop", ["oil-gas"]],
    "Consumable Fuels": ["bolt", ["energy"]],
    "Power": ["bolt", ["energy"]],
    "Other Utilities": ["bolt", ["energy"]],
    "Ferrous Metals": ["ingot", ["metal"]],
    "Non - Ferrous Metals": ["ingot", ["metal"]],
    "Minerals & Mining": ["ingot", ["metal"]],
    "Diversified Metals": ["ingot", ["metal"]],
    "Metals & Minerals Trading": ["ingot", ["metal"]],
    "Media": ["play", ["media"]],
    "Entertainment": ["play", ["media"]],
    "Printing & Publication": ["play", ["media"]],
    "Chemicals & Petrochemicals": ["flask", []],
    "Industrial Products": ["gear", []],
    "Industrial Manufacturing": ["gear", []],
    "Electrical Equipment": ["bolt", []],
    "Paper, Forest & Jute Products": ["leaf", []],
    "Diversified": ["globe", []],
    "Unclassified": ["dots", []],
  };

  // Stable colour pair per group (research-linked groups reuse their sector hue).
  function hueFor(name, links) {
    const linked = links.map((id) => K_SECTORS.find((s) => s.id === id)).find(Boolean);
    if (linked) return linked.hue;
    let h = 0;
    for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 360;
    return [`hsl(${h} 70% 52%)`, `hsl(${(h + 48) % 360} 62% 28%)`];
  }

  /* ---------- data ---------- */
  const data = { status: "idle", groups: [], bySlug: new Map(), total: 0 };

  async function load() {
    if (data.status !== "idle") return;
    data.status = "loading";
    render();
    try {
      const res = await fetch("companies.json");
      if (!res.ok) throw new Error(String(res.status));
      const d = await res.json();
      const map = new Map();
      for (const [name, nse, bse, isin, ind] of d.rows) {
        const [industry, g] = d.industries[ind] || ["Unclassified", -1];
        const gname = d.groups[g] || "Unclassified";
        if (!map.has(gname)) map.set(gname, { name: gname, slug: slug(gname), rows: [], inds: new Map() });
        const grp = map.get(gname);
        const code = nse || bse;
        grp.rows.push({ name, code, nse, bse, industry, hay: `${name} ${nse} ${bse}`.toLowerCase() });
        grp.inds.set(industry, (grp.inds.get(industry) || 0) + 1);
      }
      data.groups = [...map.values()].map((g) => {
        const meta = META[g.name] || ["grid", []];
        return { ...g, count: g.rows.length, icon: meta[0], links: meta[1], hue: hueFor(g.name, meta[1]) };
      });
      data.groups.sort((a, b) => (a.name === "Unclassified") - (b.name === "Unclassified") || b.count - a.count || a.name.localeCompare(b.name));
      data.bySlug = new Map(data.groups.map((g) => [g.slug, g]));
      data.total = data.groups.reduce((n, g) => n + g.count, 0);
      data.status = "ready";
    } catch {
      data.status = "error";
    }
    render();
  }

  /* ---------- state ---------- */
  const state = { mode: readMode(), q: "", industry: "", cq: "", shown: 100 };
  function readMode() {
    try { return localStorage.getItem(MODE_KEY) === "research" ? "research" : "groups"; } catch { return "groups"; }
  }
  function saveMode(m) { try { localStorage.setItem(MODE_KEY, m); } catch { /* optional */ } }

  /* ---------- containers ---------- */
  const modebar = document.createElement("div");
  modebar.className = "kg-modebar";
  kRoot.parentNode.insertBefore(modebar, kRoot);
  const gRoot = document.createElement("div");
  gRoot.id = "kg-root";
  kRoot.parentNode.insertBefore(gRoot, kRoot);

  const isActive = () => document.querySelector("#tabs .tab.active")?.dataset.tab === "knowledge";
  const kxMode = () => kxSwitch.querySelector("button.active")?.dataset.kx || "sector";
  const subHash = () => location.hash.slice(1).split("/")[1] || "";

  /* ---------- card ---------- */
  function thumb(g) {
    const [c1, c2] = g.hue;
    const id = "kgt-" + g.slug;
    return `<svg class="k-thumb-svg" viewBox="0 0 320 180" preserveAspectRatio="xMidYMid slice" role="img" aria-label="${esc(g.name)}">
      <defs>
        <linearGradient id="g-${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient>
        <radialGradient id="r-${id}" cx="50%" cy="45%" r="55%"><stop offset="0" stop-color="#fff" stop-opacity=".28"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
      </defs>
      <rect width="320" height="180" fill="url(#g-${id})"/>
      <rect width="320" height="180" fill="url(#r-${id})"/>
      <g class="k-rings" fill="none" stroke="#fff" stroke-opacity=".16" stroke-width="1.5"><circle cx="270" cy="30" r="62"/><circle cx="270" cy="30" r="95"/><circle cx="40" cy="170" r="70"/></g>
      <g class="k-dots" fill="#fff" fill-opacity=".16">${Array.from({ length: 14 }, (_, i) => `<circle cx="${20 + (i % 7) * 18}" cy="${20 + Math.floor(i / 7) * 18}" r="1.6"/>`).join("")}</g>
      <g transform="translate(160 90) scale(4.6) translate(-12 -12)"><g class="k-ico" fill="none" stroke="#fff" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round">${icon(g.icon)}</g></g>
    </svg>`;
  }

  function card(g, matches) {
    const n = g.inds.size;
    const chip = matches != null ? `${fmt(matches)} match${matches === 1 ? "" : "es"}` : `${fmt(g.count)} companies`;
    return `<a class="k-card kg-card" href="#knowledge/g-${g.slug}" aria-label="${esc(g.name)}">
      <div class="k-thumb">${thumb(g)}${g.links.length ? `<span class="kg-badge">Research</span>` : ""}</div>
      <div class="k-card-body">
        <div class="k-card-name">${esc(g.name)}</div>
        <div class="k-card-meta"><span class="k-chip muted-chip">${chip}</span><span class="k-chip muted-chip">${n} ${n === 1 ? "industry" : "industries"}</span></div>
      </div>
    </a>`;
  }

  /* ---------- grid view ---------- */
  function filtered() {
    const q = state.q.trim().toLowerCase();
    if (!q) return data.groups.map((g) => ({ g, m: null }));
    const out = [];
    for (const g of data.groups) {
      const nameHit = g.name.toLowerCase().includes(q) || [...g.inds.keys()].some((i) => i.toLowerCase().includes(q));
      const m = g.rows.filter((r) => r.hay.includes(q)).length;
      if (nameHit) out.push({ g, m: null });
      else if (m) out.push({ g, m });
    }
    return out;
  }

  function gridHtml() {
    if (data.status === "loading" || data.status === "idle") return `<section class="card"><p class="f-empty">Loading sectors from the company sheet…</p></section>`;
    if (data.status === "error") return `<section class="card"><p class="f-error">Couldn't load companies.json.</p></section>`;
    const list = filtered();
    return `
      <section class="card k-controls">
        <div class="k-search"><span class="k-search-icon" aria-hidden="true">&#9906;</span>
          <input id="kg-q" type="search" placeholder="Search ${data.groups.length} sectors, industries or companies…" value="${esc(state.q)}" autocomplete="off" aria-label="Search sectors"></div>
        <div class="k-count" id="kg-count">${list.length} of ${data.groups.length} sectors · ${fmt(data.total)} companies</div>
      </section>
      <div class="k-grid kg-grid" id="kg-grid">${list.map((x) => card(x.g, x.m)).join("") || `<p class="f-empty">No sector matches.</p>`}</div>`;
  }

  /* ---------- group page ---------- */
  function groupHtml(g) {
    const q = state.cq.trim().toLowerCase();
    let rows = g.rows;
    if (state.industry) rows = rows.filter((r) => r.industry === state.industry);
    if (q) rows = rows.filter((r) => r.hay.includes(q));
    const page = rows.slice(0, state.shown);
    const inds = [...g.inds].sort((a, b) => b[1] - a[1]);
    const chips = [`<button type="button" class="ur-chip ${state.industry ? "" : "active"}" data-ind="">All <i>${g.count}</i></button>`]
      .concat(inds.map(([n, c]) => `<button type="button" class="ur-chip ${state.industry === n ? "active" : ""}" data-ind="${esc(n)}">${esc(n)} <i>${c}</i></button>`))
      .join("");
    const research = g.links
      .map((id) => K_SECTORS.find((s) => s.id === id))
      .filter(Boolean)
      .map((s) => `<a class="kg-research" href="#knowledge/${s.id}"><b>${esc(s.name)}</b><span>${esc(s.overview.length > 150 ? s.overview.slice(0, 147) + "…" : s.overview)}</span><em>Open research →</em></a>`)
      .join("");
    const trs = page.map((r) => `<tr>
      <td><a class="ur-co" href="#universe/IN/${encodeURIComponent(r.code)}">${esc(r.name)}</a></td>
      <td class="ur-dim"><span class="ur-tk">${esc(r.code)}</span></td>
      <td class="ur-dim">${esc(r.industry)}</td>
      <td class="ur-act"><a class="kc-src" href="#universe/IN/${encodeURIComponent(r.code)}">View</a> <a class="kc-src" href="#chart/${encodeURIComponent(r.nse ? "NSE:" + r.nse.replace(/[&-]/g, "_") : "BSE:" + r.bse)}">Chart</a></td>
    </tr>`).join("");
    return `
      <section class="card kg-hero" style="--c1:${g.hue[0]};--c2:${g.hue[1]}">
        <a class="ur-back" href="#knowledge">← All sectors</a>
        <div class="kg-hero-row">
          <div class="kg-hero-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${icon(g.icon)}</svg></div>
          <div><h2>${esc(g.name)}</h2><p>${fmt(g.count)} companies · ${g.inds.size} ${g.inds.size === 1 ? "industry" : "industries"} · from your BSE/NSE company sheet</p></div>
        </div>
      </section>
      ${research ? `<section class="card"><div class="section-title"><span>RESEARCH <span class="muted">· curated sector knowledge covering this sector</span></span></div><div class="kg-research-grid">${research}</div></section>` : ""}
      <section class="card">
        <div class="section-title"><span>INDUSTRIES</span></div>
        <div class="ur-chips ur-chips-wrap">${chips}</div>
        <div class="ur-find"><input id="kg-cq" type="search" placeholder="Search companies in ${esc(g.name)}…" value="${esc(state.cq)}" autocomplete="off"></div>
        <div class="ur-scroll">
          <table class="ur-table">
            <thead><tr><th>Company</th><th>Ticker</th><th>Industry</th><th></th></tr></thead>
            <tbody>${trs || `<tr><td colspan="4" class="f-empty">No companies match.</td></tr>`}</tbody>
          </table>
        </div>
        <div class="ur-foot">Showing ${fmt(page.length)} of ${fmt(rows.length)}${rows.length > page.length ? ` <button type="button" class="ur-browse ghost" id="kg-more">Show more</button>` : ""}</div>
      </section>`;
  }

  /* ---------- render + visibility ---------- */
  function modebarHtml() {
    const n = data.status === "ready" ? data.groups.length : "59";
    return `<div class="k-seg kg-seg" role="tablist" aria-label="Sector view">
      <button type="button" role="tab" data-kgmode="groups" class="${state.mode === "groups" ? "active" : ""}" aria-selected="${state.mode === "groups"}">Sheet sectors <span>${n}</span></button>
      <button type="button" role="tab" data-kgmode="research" class="${state.mode === "research" ? "active" : ""}" aria-selected="${state.mode === "research"}">Research sectors <span>${K_SECTORS.length}</span></button>
    </div>`;
  }

  function render() {
    modebar.innerHTML = modebarHtml();
    const sub = subHash();
    const g = sub.startsWith("g-") ? data.bySlug.get(sub.slice(2)) : null;
    const focus = document.activeElement && (document.activeElement.id === "kg-q" || document.activeElement.id === "kg-cq") ? document.activeElement.id : null;
    if (sub.startsWith("g-") && data.status === "ready" && !g) gRoot.innerHTML = `<section class="card"><p class="f-error">That sector isn't in the company sheet.</p><p><a class="ur-back" href="#knowledge">← All sectors</a></p></section>`;
    else gRoot.innerHTML = g ? groupHtml(g) : gridHtml();
    if (focus) {
      const el = document.getElementById(focus);
      if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
    }
    sync();
  }

  // Shows exactly one of: my grid / group page, or the original research view.
  function sync() {
    const sectorView = kxMode() === "sector";
    const sub = subHash();
    const researchOpen = !!sub && !sub.startsWith("g-");        // a research sector page
    const showMine = sectorView && (sub.startsWith("g-") || (!researchOpen && state.mode === "groups"));
    modebar.hidden = !sectorView || researchOpen || sub.startsWith("g-");
    gRoot.hidden = !showMine;
    if (sectorView) kRoot.hidden = showMine;
  }

  /* ---------- events ---------- */
  modebar.addEventListener("click", (e) => {
    const b = e.target.closest("[data-kgmode]");
    if (!b) return;
    state.mode = b.dataset.kgmode;
    saveMode(state.mode);
    if (location.hash !== "#knowledge") location.hash = "#knowledge";
    render();
  });

  gRoot.addEventListener("input", (e) => {
    if (e.target.id === "kg-q") {
      state.q = e.target.value;
      const list = filtered();
      document.getElementById("kg-grid").innerHTML = list.map((x) => card(x.g, x.m)).join("") || `<p class="f-empty">No sector matches.</p>`;
      document.getElementById("kg-count").textContent = `${list.length} of ${data.groups.length} sectors · ${fmt(data.total)} companies`;
    }
    if (e.target.id === "kg-cq") { state.cq = e.target.value; state.shown = 100; render(); }
  });
  gRoot.addEventListener("click", (e) => {
    const ind = e.target.closest("[data-ind]");
    if (ind) { state.industry = ind.dataset.ind; state.shown = 100; return render(); }
    if (e.target.closest("#kg-more")) { state.shown += 200; render(); }
  });

  // company-ui flips #k-root's visibility; re-assert ours right after it runs.
  kxSwitch.addEventListener("click", () => setTimeout(sync, 0));

  function route() {
    if (!isActive()) return;
    const sub = subHash();
    if (!sub.startsWith("g-") && state.industry) { state.industry = ""; state.cq = ""; state.shown = 100; }
    load();
    render();
    if (sub.startsWith("g-")) window.scrollTo({ top: 0 });
  }
  document.addEventListener("tabchange", route);
  if (isActive()) { load(); }
  render();
})();
