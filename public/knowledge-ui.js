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
    ["nse", "NSE industry classification"],
    ["react", "How it reacts (what-if)"],
    ["stocks", "Tracked stocks (live)"],
    ["notes", "My notes"],
  ];

  const state = {
    sectorId: null,
    quotes: new Map(),
    favs: new Set(readStore(FAV_KEY, [])),
    notes: readStore(NOTES_KEY, {}),
    open: new Set(readStore("stalkingstocks.knowledge.open", ["drivers", "risks", "react", "stocks"])),
    query: "",
    sort: "default",
    favOnly: false,
    scn: new Set(),
  };
  let focusSearchAfterRender = false;

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

  function impact(sec) {
    const parts = K_SCENARIOS.filter((s) => state.scn.has(s.id)).map((s) => ({ label: s.short, v: sec.sens[s.id] }));
    return { score: parts.reduce((a, p) => a + p.v, 0), parts };
  }

  function impactBadge(sec) {
    if (!state.scn.size) return "";
    const { score, parts } = impact(sec);
    const cls = score > 0 ? "up" : score < 0 ? "down" : "flat";
    const txt = score > 0 ? `▲ +${score}` : score < 0 ? `▼ ${score}` : "● 0";
    const tip = parts.map((p) => `${p.label}: ${p.v > 0 ? "+" : ""}${p.v}`).join("  ·  ");
    return `<span class="k-impact ${cls}" title="${esc(tip)}">${txt}</span>`;
  }

  function card(sec) {
    const n = sectorStocks(sec).length;
    return `<article class="k-card" tabindex="0" data-id="${sec.id}" aria-label="${esc(sec.name)}">
      <div class="k-thumb">${thumb(sec, "c-" + sec.id)}
        <button type="button" class="k-fav" data-fav="${sec.id}"></button>
        <span class="k-impact-slot"></span>
      </div>
      <div class="k-card-body">
        <div class="k-card-name">${esc(sec.name)}</div>
        <div class="k-card-meta"><span class="k-perf"></span><span class="k-chip muted-chip">${n ? n + " tracked" : "research only"}</span></div>
      </div>
    </article>`;
  }

  function renderGrid() {
    return `
      <section class="card k-tools">
        <div class="k-tools-row">
          <label class="k-search">
            <span class="k-search-icon" aria-hidden="true">&#9906;</span>
            <input id="k-search" type="search" placeholder="Search sectors, stocks, drivers, risks…" autocomplete="off" aria-label="Search sectors" />
            <kbd>/</kbd>
          </label>
          <div class="k-seg" role="group" aria-label="Sort sectors">
            <button type="button" data-sort="default">Default</button>
            <button type="button" data-sort="az">A–Z</button>
            <button type="button" data-sort="perf">Today's move</button>
            <button type="button" data-sort="impact">Scenario impact</button>
          </div>
          <button type="button" class="k-btn" data-favonly aria-pressed="false">☆ Favorites</button>
        </div>
        <div class="k-tools-row k-scn-row">
          <span class="k-scn-label">What if…</span>
          ${K_SCENARIOS.map((s, i) => `<button type="button" class="k-scn" data-scn="${s.id}" aria-pressed="false"><kbd>${i + 1}</kbd> ${s.label}</button>`).join("")}
          <button type="button" class="k-link" data-act="scn-reset">Clear</button>
        </div>
        <div class="k-summary" id="k-summary" aria-live="polite"></div>
        <div class="k-hint muted">Sensitivities are rule-of-thumb tendencies for exploring ideas, not forecasts. Keys: <kbd>/</kbd> search · <kbd>1</kbd>–<kbd>5</kbd> scenarios · <kbd>&larr;</kbd> <kbd>&rarr;</kbd> switch sector · <kbd>Esc</kbd> back</div>
      </section>
      <div class="k-count muted" id="k-count"></div>
      <div class="k-grid" id="k-grid">${K_SECTORS.map(card).join("")}</div>
      <div class="k-empty card" id="k-empty" hidden>No sectors match. Try a different word, or clear the filters.</div>`;
  }

  const hayCache = new Map();
  function haystack(sec) {
    if (!hayCache.has(sec.id)) {
      hayCache.set(
        sec.id,
        [sec.name, sec.overview, sec.model, ...sec.drivers, ...sec.risks, ...sec.metrics, ...sectorStocks(sec).map((s) => s.name)].join(" ").toLowerCase()
      );
    }
    return hayCache.get(sec.id);
  }

  function matches(sec) {
    if (state.favOnly && !state.favs.has(sec.id)) return false;
    const terms = state.query.toLowerCase().split(/\s+/).filter(Boolean);
    return terms.every((t) => haystack(sec).includes(t));
  }

  function sorted(list) {
    const order = new Map(K_SECTORS.map((s, i) => [s.id, i]));
    const byDefault = (a, b) => order.get(a.id) - order.get(b.id);
    const cmp = {
      default: byDefault,
      az: (a, b) => a.name.localeCompare(b.name),
      perf: (a, b) => (perf(b) ?? -Infinity) - (perf(a) ?? -Infinity) || byDefault(a, b),
      impact: (a, b) => impact(b).score - impact(a).score || byDefault(a, b),
    }[state.sort];
    return [...list].sort(cmp);
  }

  function updateSummary() {
    const el = document.getElementById("k-summary");
    if (!el) return;
    if (!state.scn.size) {
      el.innerHTML = "";
      return;
    }
    const ranked = K_SECTORS.map((s) => ({ s, score: impact(s).score })).sort((a, b) => b.score - a.score);
    const fmt = (x) => `<b>${esc(x.s.name)}</b> ${x.score > 0 ? "+" : ""}${x.score}`;
    const helped = ranked.filter((x) => x.score > 0).slice(0, 3);
    const hurt = ranked.filter((x) => x.score < 0).slice(-3).reverse();
    const names = K_SCENARIOS.filter((s) => state.scn.has(s.id)).map((s) => s.label.toLowerCase()).join(" + ");
    el.innerHTML = `If <b>${esc(names)}</b>:
      <span class="up">helped ▲ ${helped.length ? helped.map(fmt).join(", ") : "none"}</span>
      <span class="down">hurt ▼ ${hurt.length ? hurt.map(fmt).join(", ") : "none"}</span>`;
  }

  // Patches the toolbar/cards in place (keeps search focus) and animates reordering.
  function updateGrid(animate = true) {
    const grid = document.getElementById("k-grid");
    if (!grid) return;
    const cards = new Map([...grid.querySelectorAll(".k-card")].map((el) => [el.dataset.id, el]));
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const before = new Map();
    const wasVisible = new Set();
    for (const [id, el] of cards) {
      if (!el.hidden) {
        before.set(id, el.getBoundingClientRect());
        wasVisible.add(id);
      }
    }

    const visible = sorted(K_SECTORS.filter(matches));
    const visibleIds = new Set(visible.map((s) => s.id));
    for (const sec of [...visible, ...K_SECTORS.filter((s) => !visibleIds.has(s.id))]) {
      const el = cards.get(sec.id);
      el.hidden = !visibleIds.has(sec.id);
      grid.appendChild(el);
      const fav = state.favs.has(sec.id);
      const btn = el.querySelector(".k-fav");
      btn.classList.toggle("on", fav);
      btn.textContent = fav ? "★" : "☆";
      btn.setAttribute("aria-pressed", fav);
      btn.title = fav ? "Remove from favorites" : "Add to favorites";
      el.querySelector(".k-perf").innerHTML = perfChip(sec);
      el.querySelector(".k-impact-slot").innerHTML = impactBadge(sec);
    }

    if (animate && !reduce) {
      for (const sec of visible) {
        const el = cards.get(sec.id);
        const from = before.get(sec.id);
        if (from) {
          const to = el.getBoundingClientRect();
          const dx = from.left - to.left;
          const dy = from.top - to.top;
          if (dx || dy) {
            el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], { duration: 380, easing: "cubic-bezier(.2,.8,.2,1)" });
          }
        } else {
          el.animate([{ opacity: 0, transform: "scale(.92)" }, { opacity: 1, transform: "none" }], { duration: 260, easing: "ease-out" });
        }
      }
    }

    for (const b of root.querySelectorAll("[data-sort]")) b.classList.toggle("active", b.dataset.sort === state.sort);
    for (const b of root.querySelectorAll("[data-scn]")) {
      const on = state.scn.has(b.dataset.scn);
      b.classList.toggle("on", on);
      b.setAttribute("aria-pressed", on);
    }
    const favBtn = root.querySelector("[data-favonly]");
    favBtn.classList.toggle("on", state.favOnly);
    favBtn.setAttribute("aria-pressed", state.favOnly);
    favBtn.textContent = state.favOnly ? "★ Favorites only" : "☆ Favorites";

    document.getElementById("k-count").textContent = `${visible.length} of ${K_SECTORS.length} sectors`;
    document.getElementById("k-empty").hidden = visible.length > 0;
    updateSummary();
  }

  function reactRows(sec) {
    const rows = K_SCENARIOS.map((s) => {
      const v = sec.sens[s.id];
      const on = state.scn.has(s.id);
      const cls = v > 0 ? "up" : v < 0 ? "down" : "flat";
      const side = v >= 0 ? "left:50%" : "right:50%";
      return `<button type="button" class="k-react-row${on ? " on" : ""}" data-scn="${s.id}" aria-pressed="${on}" title="Click to switch this scenario ${on ? "off" : "on"}">
        <span class="k-react-label">${s.label}</span>
        <span class="k-react-bar"><span class="k-react-fill ${cls}" style="${side};width:${(Math.abs(v) / 2) * 50}%"></span></span>
        <span class="k-react-val ${cls}">${v > 0 ? "+" : ""}${v}</span>
      </button>`;
    }).join("");
    return `<p class="k-p muted">Click a row to turn a scenario on or off. Bars show this sector's usual tendency: right and green helps, left and red hurts. A rule of thumb, not a forecast.</p>
      ${rows}
      <div class="k-react-total">Combined impact of the active scenarios: ${state.scn.size ? impactBadge(sec) : '<span class="muted">none selected</span>'}</div>`;
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

  function nseSection(sec) {
    const links = KNOWLEDGE_NSE[sec.id];
    if (!links) {
      return `<p class="k-p muted">This is a cross-cutting group rather than a single industry, so it has no direct entry in NSE's classification.</p>`;
    }
    const items = links.map(([level, name]) => {
      const node = NSE_IND.byName[level].get(name);
      const trail = NSE_IND.path(node).map((n) => esc(n.name)).join(" &rsaquo; ");
      const n = (NSE_STOCKS_BY_NODE.get(node.code) || []).length;
      return `<li><a href="#industries/${node.code}">${esc(node.name)}</a> <span class="ind-code">${node.code}</span><br><span class="muted">${trail}${n ? ` · ${n} tracked stock${n > 1 ? "s" : ""}` : ""}</span></li>`;
    });
    return `<p class="k-p muted">Where this sector sits in NSE's official industry structure:</p><ul class="k-list">${items.join("")}</ul>`;
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
      nse: nseSection(sec),
      react: `<div id="k-react">${reactRows(sec)}</div>`,
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
          <h3 class="k-hero-name">${esc(sec.name)} <span id="k-live-chip">${perfChip(sec)}</span> <span id="k-hero-impact">${impactBadge(sec)}</span></h3>
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
    } else {
      document.getElementById("k-search").value = state.query;
      updateGrid(false);
      if (focusSearchAfterRender) document.getElementById("k-search").focus();
    }
    focusSearchAfterRender = false;
  }

  function toggleScenario(id) {
    state.scn.has(id) ? state.scn.delete(id) : state.scn.add(id);
    if (state.scn.size && state.sort === "default") state.sort = "impact";
    const sec = state.sectorId && bySectorId(state.sectorId);
    if (!sec) return updateGrid();
    const react = document.getElementById("k-react");
    const hero = document.getElementById("k-hero-impact");
    if (react) react.innerHTML = reactRows(sec);
    if (hero) hero.innerHTML = impactBadge(sec);
  }

  // Quote refresh must not rebuild the page (it would wipe notes mid-typing).
  function updateLive() {
    const sec = state.sectorId && bySectorId(state.sectorId);
    if (!sec) return updateGrid(false);
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
      updateGrid(false);
      return;
    }
    const scnBtn = e.target.closest("[data-scn]");
    if (scnBtn) return toggleScenario(scnBtn.dataset.scn);

    const sortBtn = e.target.closest("[data-sort]");
    if (sortBtn) {
      state.sort = sortBtn.dataset.sort;
      return updateGrid();
    }
    if (e.target.closest("[data-favonly]")) {
      state.favOnly = !state.favOnly;
      return updateGrid();
    }
    if (e.target.closest("[data-act=scn-reset]")) {
      state.scn.clear();
      if (state.sort === "impact") state.sort = "default";
      return updateGrid();
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
    if (e.target.id === "k-search") {
      state.query = e.target.value;
      return updateGrid();
    }
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

  document.addEventListener("keydown", (e) => {
    if (!isActive() || e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target;
    const typing = t.matches?.("input, textarea, select");

    if (e.key === "Escape") {
      if (t.id === "k-search" && t.value) {
        t.value = "";
        state.query = "";
        updateGrid();
      } else if (typing) {
        t.blur();
      } else if (state.sectorId) {
        go("");
      }
      return;
    }
    if (typing) return;

    if (e.key === "/") {
      e.preventDefault();
      if (state.sectorId) {
        focusSearchAfterRender = true;
        go("");
      } else {
        document.getElementById("k-search")?.focus();
      }
    } else if (/^[1-5]$/.test(e.key)) {
      toggleScenario(K_SCENARIOS[Number(e.key) - 1].id);
    } else if (state.sectorId && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
      const i = K_SECTORS.findIndex((s) => s.id === state.sectorId);
      const step = e.key === "ArrowRight" ? 1 : -1;
      go(K_SECTORS[(i + step + K_SECTORS.length) % K_SECTORS.length].id);
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
