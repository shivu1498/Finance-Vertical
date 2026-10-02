// Sector Knowledge tab UI. Depends on knowledge.js, data.js and app.js globals.
(function () {
  const root = document.getElementById("k-root");
  const FAV_KEY = "stalkingstocks.knowledge.favs";

  const NOTES_KEY = "stalkingstocks.knowledge.notes";
  const SECTIONS = [
    ["drivers", "Key drivers"],
    ["risks", "Risks to watch"],
    ["metrics", "Metrics to track"],
    ["model", "How it makes money"],
    ["stocks", "Tracked stocks (live)"],
    ["notes", "My notes"],
  ];

  const state = {
    sectorId: null,
    quotes: new Map(),
    favs: new Set(readStore(FAV_KEY, [])),
    notes: readStore(NOTES_KEY, {}),
    open: new Set(readStore("stalkingstocks.knowledge.open", ["drivers", "risks", "stocks"])),
  };

  function readStore(key, fallback) {
    try {
      const v = JSON.parse(localStorage.getItem(key));
      return v ?? fallback;
    } catch {
      return fallback;
    }
  }
  function writeStore(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // storage unavailable: favorites just won't persist
    }
  }

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function sectorStocks(sec) {
    const list = NIFTY50.filter((s) => sec.dataSectors.includes(s.sector));
    for (const sym of sec.extraSymbols || []) {
      const s = NIFTY50.find((x) => x.symbol === sym);
      if (s && !list.includes(s)) list.push(s);
    }
    return list;
  }

  function perf(sec) {
    const pcts = sectorStocks(sec)
      .map((s) => state.quotes.get(s.symbol))
      .filter((q) => q && !q.error)
      .map((q) => q.changePercent);
    return pcts.length ? pcts.reduce((a, b) => a + b, 0) / pcts.length : null;
  }

  // Generated thumbnail: sector gradient, soft rings, and a line icon.
  function thumb(sec, id = sec.id) {
    const [c1, c2] = sec.hue;
    return `<svg class="k-thumb-svg" viewBox="0 0 320 180" preserveAspectRatio="xMidYMid slice" role="img" aria-label="${esc(sec.name)}">
      <defs>
        <linearGradient id="kg-${id}" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/>
        </linearGradient>
        <radialGradient id="kr-${id}" cx="50%" cy="45%" r="55%">
          <stop offset="0" stop-color="#fff" stop-opacity=".28"/><stop offset="1" stop-color="#fff" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <rect width="320" height="180" fill="url(#kg-${id})"/>
      <rect width="320" height="180" fill="url(#kr-${id})"/>
      <g fill="none" stroke="#fff" stroke-opacity=".14" stroke-width="1.5">
        <circle cx="270" cy="30" r="62"/><circle cx="270" cy="30" r="95"/><circle cx="40" cy="170" r="70"/>
      </g>
      <g fill="#fff" fill-opacity=".16">
        ${Array.from({ length: 14 }, (_, i) => `<circle cx="${20 + (i % 7) * 18}" cy="${20 + Math.floor(i / 7) * 18}" r="1.6"/>`).join("")}
      </g>
      <g transform="translate(160 90) scale(4.6) translate(-12 -12)" fill="none" stroke="#fff" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round">
        ${K_ICONS[sec.icon]}
      </g>
    </svg>`;
  }

  function perfChip(sec) {
    const p = perf(sec);
    if (p == null) return `<span class="k-chip flat" title="Live data appears once quotes load">— today</span>`;
    return `<span class="k-chip ${changeClass(p)}">${fmtPct(p)} today</span>`;
  }

  function card(sec) {
    const fav = state.favs.has(sec.id);
    const n = sectorStocks(sec).length;
    return `<article class="k-card" tabindex="0" data-id="${sec.id}" aria-label="${esc(sec.name)}">
      <div class="k-thumb">${thumb(sec, "c-" + sec.id)}
        <button type="button" class="k-fav${fav ? " on" : ""}" data-fav="${sec.id}" aria-pressed="${fav}" title="${fav ? "Remove from favorites" : "Add to favorites"}">${fav ? "★" : "☆"}</button>
      </div>
      <div class="k-card-body">
        <div class="k-card-name">${esc(sec.name)}</div>
        <div class="k-card-meta">${perfChip(sec)}<span class="k-chip muted-chip">${n ? n + " tracked" : "research only"}</span></div>
      </div>
    </article>`;
  }

  function renderGrid() {
    return `<div class="k-grid" id="k-grid">${K_SECTORS.map(card).join("")}</div>`;
  }

  const bySectorId = (id) => K_SECTORS.find((s) => s.id === id);

  function stockTiles(sec) {
    const list = sectorStocks(sec);
    if (!list.length) {
      return `<div class="muted">No Nifty 50 constituents map to this sector, so there is no live price here. The research above still applies.</div>`;
    }
    return `<div class="k-stocks">${list
      .map((s) => {
        const q = state.quotes.get(s.symbol);
        const pct = q && !q.error ? q.changePercent : null;
        return `<button type="button" class="k-stock stock-tile ${changeClass(pct)}" style="--heat:${heat(pct).toFixed(2)}" data-stock="${esc(s.symbol)}" title="Open ${esc(s.name)} fundamentals">
          <div class="stock-name">${esc(s.name)}</div>
          <div class="stock-price">${q && !q.error ? fmtPrice(q.price) : "—"}</div>
          <div class="stock-pct">${pct != null ? fmtPct(pct) : "n/a"}</div>
        </button>`;
      })
      .join("")}</div>`;
  }

  const list = (items) => `<ul class="k-list">${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>`;

  function section(key, title, inner) {
    return `<details class="k-acc" data-key="${key}"${state.open.has(key) ? " open" : ""}>
      <summary>${title}</summary><div class="k-acc-body">${inner}</div></details>`;
  }

  function renderFocus(sec) {
    const i = K_SECTORS.indexOf(sec);
    const prev = K_SECTORS[(i - 1 + K_SECTORS.length) % K_SECTORS.length];
    const next = K_SECTORS[(i + 1) % K_SECTORS.length];
    const fav = state.favs.has(sec.id);
    const inner = {
      drivers: list(sec.drivers),
      risks: list(sec.risks),
      metrics: list(sec.metrics),
      model: `<p class="k-p">${esc(sec.model)}</p>`,
      stocks: `<div id="k-live-stocks">${stockTiles(sec)}</div>`,
      notes: `<textarea id="k-notes" class="k-notes" rows="5" placeholder="Your own research notes for ${esc(sec.name)}: thesis, stocks to look at, things to verify. Saved in this browser only."></textarea>
        <div class="k-saved muted" id="k-saved">Notes save automatically in this browser.</div>`,
    };
    return `
      <div class="k-strip" role="tablist" aria-label="Sectors">
        ${K_SECTORS.map((s) => `<button type="button" role="tab" class="k-subtab${s.id === sec.id ? " active" : ""}" aria-selected="${s.id === sec.id}" data-go="${s.id}">${esc(s.name)}</button>`).join("")}
      </div>
      <section class="card k-hero">
        <div class="k-hero-thumb">${thumb(sec, "h-" + sec.id)}</div>
        <div class="k-hero-main">
          <div class="k-hero-top">
            <button type="button" class="k-link" data-go="">&larr; All sectors</button>
            <div class="k-nav">
              <button type="button" class="k-btn" data-go="${prev.id}" title="Previous: ${esc(prev.name)} (&larr;)">&lsaquo; ${esc(prev.name)}</button>
              <button type="button" class="k-btn" data-go="${next.id}" title="Next: ${esc(next.name)} (&rarr;)">${esc(next.name)} &rsaquo;</button>
            </div>
          </div>
          <h3 class="k-hero-name">${esc(sec.name)} <span id="k-live-chip">${perfChip(sec)}</span></h3>
          <p class="k-p">${esc(sec.overview)}</p>
          <div class="k-actions">
            <button type="button" class="k-btn${fav ? " on" : ""}" data-act="fav">${fav ? "★ Favorited" : "☆ Favorite"}</button>
            ${sec.dataSectors.length && sectorStocks(sec).length ? `<button type="button" class="k-btn primary" data-act="stocks">View in Stocks tab</button>` : ""}
            <button type="button" class="k-btn" data-act="copy">Copy link</button>
            <span class="k-toast muted" id="k-toast" aria-live="polite"></span>
          </div>
        </div>
      </section>
      <div class="k-toolbar">
        <button type="button" class="k-btn" data-act="expand">Expand all</button>
        <button type="button" class="k-btn" data-act="collapse">Collapse all</button>
      </div>
      <section class="card k-accs">
        ${SECTIONS.map(([key, title]) => section(key, title, inner[key])).join("")}
      </section>`;
  }

  function render() {
    const sec = state.sectorId && bySectorId(state.sectorId);
    root.innerHTML = sec ? renderFocus(sec) : renderGrid();
    if (sec) {
      const ta = document.getElementById("k-notes");
      if (ta) ta.value = state.notes[sec.id] || "";
    }
  }

  // Quote refresh must not rebuild the page (it would wipe notes mid-typing).
  function updateLive() {
    const sec = state.sectorId && bySectorId(state.sectorId);
    if (!sec) return render();
    const stocks = document.getElementById("k-live-stocks");
    const chip = document.getElementById("k-live-chip");
    if (stocks) stocks.innerHTML = stockTiles(sec);
    if (chip) chip.innerHTML = perfChip(sec);
  }

  let toastTimer;
  function toast(msg) {
    const el = document.getElementById("k-toast");
    if (!el) return;
    el.textContent = msg;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (el.textContent = ""), 2200);
  }

  function setAllSections(open) {
    state.open = new Set(open ? SECTIONS.map(([k]) => k) : []);
    writeStore("stalkingstocks.knowledge.open", [...state.open]);
    root.querySelectorAll(".k-acc").forEach((d) => (d.open = open));
  }

  function go(id) {
    location.hash = id ? `knowledge/${id}` : "knowledge";
  }

  root.addEventListener("click", (e) => {
    const favBtn = e.target.closest("[data-fav]");
    if (favBtn) {
      e.stopPropagation();
      const id = favBtn.dataset.fav;
      state.favs.has(id) ? state.favs.delete(id) : state.favs.add(id);
      writeStore(FAV_KEY, [...state.favs]);
      render();
      return;
    }
    const goBtn = e.target.closest("[data-go]");
    if (goBtn) return go(goBtn.dataset.go);

    const stockBtn = e.target.closest("[data-stock]");
    if (stockBtn) {
      const s = NIFTY50.find((x) => x.symbol === stockBtn.dataset.stock);
      if (s) openStockFundamentals(s);
      return;
    }

    const act = e.target.closest("[data-act]");
    if (act) {
      const sec = bySectorId(state.sectorId);
      switch (act.dataset.act) {
        case "fav":
          state.favs.has(sec.id) ? state.favs.delete(sec.id) : state.favs.add(sec.id);
          writeStore(FAV_KEY, [...state.favs]);
          render();
          break;
        case "stocks": {
          const name = sec.dataSectors.find((d) => NIFTY50.some((s) => s.sector === d));
          if (name) openSectorInStocks(name);
          break;
        }
        case "copy":
          navigator.clipboard
            ?.writeText(location.href)
            .then(() => toast("Link copied"), () => toast("Copy not allowed here"));
          break;
        case "expand":
          setAllSections(true);
          break;
        case "collapse":
          setAllSections(false);
          break;
      }
      return;
    }

    const c = e.target.closest(".k-card");
    if (c) go(c.dataset.id);
  });

  // <details> fires "toggle" without bubbling, so listen in the capture phase.
  root.addEventListener(
    "toggle",
    (e) => {
      const d = e.target.closest?.(".k-acc");
      if (!d) return;
      d.open ? state.open.add(d.dataset.key) : state.open.delete(d.dataset.key);
      writeStore("stalkingstocks.knowledge.open", [...state.open]);
    },
    true
  );

  let notesTimer;
  root.addEventListener("input", (e) => {
    if (e.target.id !== "k-notes") return;
    state.notes[state.sectorId] = e.target.value;
    document.getElementById("k-saved").textContent = "Saving…";
    clearTimeout(notesTimer);
    notesTimer = setTimeout(() => {
      writeStore(NOTES_KEY, state.notes);
      const el = document.getElementById("k-saved");
      if (el) el.textContent = "Saved ✓ (this browser only)";
    }, 400);
  });
  root.addEventListener("keydown", (e) => {
    if ((e.key === "Enter" || e.key === " ") && e.target.classList.contains("k-card")) {
      e.preventDefault();
      go(e.target.dataset.id);
    }
  });

  let loading = false;
  async function loadQuotes() {
    if (loading) return;
    loading = true;
    try {
      const { map } = await fetchQuotes([...new Set(NIFTY50.map((s) => s.symbol))]);
      state.quotes = map;
      if (isActive()) updateLive();
    } catch (err) {
      console.error("knowledge quotes failed", err);
    } finally {
      loading = false;
    }
  }

  const isActive = () => document.querySelector("#tabs .tab.active")?.dataset.tab === "knowledge";

  function route() {
    if (!isActive()) return;
    const sub = location.hash.slice(1).split("/")[1];
    state.sectorId = K_SECTORS.some((s) => s.id === sub) ? sub : null;
    render();
    loadQuotes();
  }

  document.addEventListener("tabchange", route);
  setInterval(() => isActive() && !document.hidden && loadQuotes(), 30_000);
  route();
})();
