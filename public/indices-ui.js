// Indices tab UI. Depends on indices.js and app.js globals.
(function () {
  const root = document.getElementById("i-root");
  const FAMILY_ORDER = ["broad", "sectoral", "strategy", "thematic"];
  const LIVE_SYMBOLS = [...new Set(NSE_INDICES.filter((i) => i.symbol).map((i) => i.symbol))];

  const state = { family: "all", tag: "", query: "", liveOnly: false, sort: "catalogue", quotes: new Map() };

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const isActive = () => document.querySelector("#tabs .tab.active")?.dataset.tab === "indices";
  const quoteOf = (idx) => (idx.symbol ? state.quotes.get(idx.symbol) : null);
  const pctOf = (idx) => {
    const q = quoteOf(idx);
    return q && !q.error ? q.changePercent : null;
  };

  const familyCount = (f) => NSE_INDICES.filter((i) => f === "all" || i.family === f).length;
  const allTags = () => {
    const counts = new Map();
    for (const i of NSE_INDICES) for (const t of i.tags) counts.set(t, (counts.get(t) || 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  };

  function renderShell() {
    root.innerHTML = `
      <section class="card k-tools">
        <div class="k-tools-row">
          <label class="k-search">
            <span class="k-search-icon" aria-hidden="true">&#9906;</span>
            <input id="i-search" type="search" placeholder="Search ${NSE_INDICES.length} indices, e.g. momentum, defence, bank, Tata…" autocomplete="off" aria-label="Search indices" />
            <kbd>/</kbd>
          </label>
          <div class="k-seg" role="group" aria-label="Sort indices">
            <button type="button" data-isort="catalogue">Catalogue</button>
            <button type="button" data-isort="az">A–Z</button>
            <button type="button" data-isort="move">Today's move</button>
          </div>
          <button type="button" class="k-btn" data-ilive aria-pressed="false">Live prices only</button>
        </div>
        <div class="k-tools-row">
          <div class="k-seg" role="group" aria-label="Index family">
            <button type="button" data-ifam="all">All <span class="i-n">${familyCount("all")}</span></button>
            ${FAMILY_ORDER.map((f) => `<button type="button" data-ifam="${f}">${INDEX_FAMILIES[f].label} <span class="i-n">${familyCount(f)}</span></button>`).join("")}
          </div>
        </div>
        <div class="k-tools-row i-tags">
          <span class="k-scn-label">Style</span>
          ${allTags().map(([t, n]) => `<button type="button" class="k-scn" data-itag="${esc(t)}" aria-pressed="false">${esc(t)} <span class="i-n">${n}</span></button>`).join("")}
          <button type="button" class="k-link" data-iclear>Clear filters</button>
        </div>
        <div class="k-hint muted">Prices show only for indices Yahoo Finance carries. Every tile links to the official family page on niftyindices.com. Keys: <kbd>/</kbd> search · <kbd>Esc</kbd> clear</div>
      </section>
      <section class="card i-blurb" id="i-blurb" hidden></section>
      <div class="k-count muted" id="i-count"></div>
      <div id="i-body"></div>
      <div class="k-empty card" id="i-empty" hidden>No indices match. Try a different word, or clear the filters.</div>`;
  }

  function matches(i) {
    if (state.family !== "all" && i.family !== state.family) return false;
    if (state.tag && !i.tags.includes(state.tag)) return false;
    if (state.liveOnly && !i.symbol) return false;
    const hay = `${i.name} ${INDEX_FAMILIES[i.family].label} ${i.tags.join(" ")}`.toLowerCase();
    return state.query
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean)
      .every((t) => hay.includes(t));
  }

  function tile(i) {
    const q = quoteOf(i);
    const pct = pctOf(i);
    const fam = INDEX_FAMILIES[i.family];
    let quote;
    if (!i.symbol) quote = `<div class="i-nolive">No free live feed</div>`;
    else if (!q) quote = `<div class="i-nolive">Loading…</div>`;
    else if (q.error) quote = `<div class="i-nolive">Live price unavailable</div>`;
    else quote = `<div class="i-quote"><span class="i-price">${fmtPrice(q.price)}</span><span class="i-pct">${fmtPct(pct)}</span></div>`;
    return `<article class="i-tile ${pct != null ? changeClass(pct) : "flat"}${i.symbol ? " has-live" : ""}" style="--heat:${heat(pct).toFixed(2)}">
      <div class="i-tile-top"><span class="i-fam fam-${i.family}">${esc(fam.label)}</span>${i.symbol ? '<span class="i-live">● live</span>' : ""}</div>
      <div class="i-name">${esc(i.name)}</div>
      ${quote}
      <div class="i-tags">${i.tags.map((t) => `<span class="k-chip muted-chip">${esc(t)}</span>`).join("")}</div>
      <div class="i-links">
        <a href="${fam.url}" target="_blank" rel="noopener">niftyindices.com &#8599;</a>
        ${i.research ? `<a class="i-research" href="#knowledge/${i.research}">Sector research &rarr;</a>` : ""}
      </div>
    </article>`;
  }

  function sorted(list) {
    if (state.sort === "az") return [...list].sort((a, b) => a.name.localeCompare(b.name));
    if (state.sort === "move") {
      return [...list].sort((a, b) => (pctOf(b) ?? -Infinity) - (pctOf(a) ?? -Infinity));
    }
    return list;
  }

  function update() {
    const list = sorted(NSE_INDICES.filter(matches));
    const body = document.getElementById("i-body");

    if (state.sort === "catalogue") {
      body.innerHTML = FAMILY_ORDER.map((f) => {
        const items = list.filter((i) => i.family === f);
        if (!items.length) return "";
        return `<h3 class="i-group">${INDEX_FAMILIES[f].label} <span class="muted">· ${items.length}</span></h3>
          <div class="i-grid">${items.map(tile).join("")}</div>`;
      }).join("");
    } else {
      body.innerHTML = `<div class="i-grid">${list.map(tile).join("")}</div>`;
    }

    const live = list.filter((i) => i.symbol).length;
    document.getElementById("i-count").textContent = `${list.length} of ${NSE_INDICES.length} indices · ${live} with live prices`;
    document.getElementById("i-empty").hidden = list.length > 0;

    for (const b of root.querySelectorAll("[data-ifam]")) b.classList.toggle("active", b.dataset.ifam === state.family);
    for (const b of root.querySelectorAll("[data-isort]")) b.classList.toggle("active", b.dataset.isort === state.sort);
    for (const b of root.querySelectorAll("[data-itag]")) {
      const on = b.dataset.itag === state.tag;
      b.classList.toggle("on", on);
      b.setAttribute("aria-pressed", on);
    }
    const liveBtn = root.querySelector("[data-ilive]");
    liveBtn.classList.toggle("on", state.liveOnly);
    liveBtn.setAttribute("aria-pressed", state.liveOnly);

    const blurb = document.getElementById("i-blurb");
    const fam = INDEX_FAMILIES[state.family];
    blurb.hidden = !fam;
    if (fam) {
      blurb.innerHTML = `<b>${esc(fam.label)} indices.</b> ${esc(fam.blurb)} <a href="${fam.url}" target="_blank" rel="noopener">Open on niftyindices.com &#8599;</a>`;
    }
  }

  root.addEventListener("click", (e) => {
    const t = e.target;
    const fam = t.closest("[data-ifam]");
    if (fam) state.family = fam.dataset.ifam;
    else if (t.closest("[data-isort]")) state.sort = t.closest("[data-isort]").dataset.isort;
    else if (t.closest("[data-itag]")) {
      const tag = t.closest("[data-itag]").dataset.itag;
      state.tag = state.tag === tag ? "" : tag;
    } else if (t.closest("[data-ilive]")) state.liveOnly = !state.liveOnly;
    else if (t.closest("[data-iclear]")) {
      Object.assign(state, { family: "all", tag: "", query: "", liveOnly: false });
      document.getElementById("i-search").value = "";
    } else return;
    update();
  });

  root.addEventListener("input", (e) => {
    if (e.target.id !== "i-search") return;
    state.query = e.target.value;
    update();
  });

  document.addEventListener("keydown", (e) => {
    if (!isActive() || e.metaKey || e.ctrlKey || e.altKey) return;
    const search = document.getElementById("i-search");
    if (e.key === "Escape" && e.target === search) {
      if (search.value) {
        search.value = "";
        state.query = "";
        update();
      } else search.blur();
    } else if (e.key === "/" && !e.target.matches?.("input, textarea, select")) {
      e.preventDefault();
      search?.focus();
    }
  });

  let loading = false;
  async function loadQuotes() {
    if (loading) return;
    loading = true;
    try {
      const { map } = await fetchQuotes(LIVE_SYMBOLS);
      state.quotes = map;
      if (isActive()) update();
    } catch (err) {
      console.error("index quotes failed", err);
    } finally {
      loading = false;
    }
  }

  document.addEventListener("tabchange", () => {
    if (!isActive()) return;
    if (!root.firstChild) {
      renderShell();
      update();
    }
    loadQuotes();
  });
  setInterval(() => isActive() && !document.hidden && loadQuotes(), 30_000);
  if (isActive()) {
    renderShell();
    update();
    loadQuotes();
  }
})();
