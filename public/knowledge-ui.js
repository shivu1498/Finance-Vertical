// Sector Knowledge tab UI. Depends on knowledge.js, data.js and app.js globals.
(function () {
  const root = document.getElementById("k-root");
  const FAV_KEY = "stalkingstocks.knowledge.favs";

  const state = {
    sectorId: null,
    quotes: new Map(),
    favs: new Set(readStore(FAV_KEY, [])),
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

  function render() {
    root.innerHTML = renderGrid();
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
    const c = e.target.closest(".k-card");
    if (c) go(c.dataset.id);
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
      if (isActive()) render();
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
