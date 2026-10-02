// Industries tab UI: explorer for the NSE industry classification.
// Depends on industry.js and app.js globals.
(function () {
  const root = document.getElementById("ind-root");
  const NIFTY_SYMBOLS = NIFTY50.map((s) => s.symbol);
  const MES_COLORS = ["#c58a2b", "#a855f7", "#f59e0b", "#22c55e", "#2f6fe0", "#10b981", "#ef4444", "#6366f1", "#7c5cff", "#06b6d4", "#facc15", "#8b95a7"];

  const state = { mes: "", query: "", trackedOnly: false, quotes: new Map(), open: new Set(), openAll: false, focus: "" };

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const isActive = () => document.querySelector("#tabs .tab.active")?.dataset.tab === "industries";
  const terms = () => state.query.toLowerCase().split(/\s+/).filter(Boolean);

  // Reverse of KNOWLEDGE_NSE: classification node code -> Sector Knowledge ids.
  const knowledgeByNode = new Map();
  for (const [id, links] of Object.entries(KNOWLEDGE_NSE)) {
    for (const [level, name] of links) {
      const node = NSE_IND.byName[level].get(name);
      if (!knowledgeByNode.has(node.code)) knowledgeByNode.set(node.code, []);
      knowledgeByNode.get(node.code).push(id);
    }
  }

  function hl(text) {
    const t = terms();
    if (!t.length) return esc(text);
    const re = new RegExp("(" + t.map(escRe).join("|") + ")", "gi");
    return text.split(re).map((part, i) => (i % 2 ? `<mark>${esc(part)}</mark>` : esc(part))).join("");
  }

  function avgPct(code) {
    const pcts = (NSE_STOCKS_BY_NODE.get(code) || [])
      .map((s) => state.quotes.get(s.symbol))
      .filter((q) => q && !q.error)
      .map((q) => q.changePercent);
    return pcts.length ? pcts.reduce((a, b) => a + b, 0) / pcts.length : null;
  }
  const aggChip = (code) => {
    const n = (NSE_STOCKS_BY_NODE.get(code) || []).length;
    if (!n) return "";
    const p = avgPct(code);
    return `<span class="k-chip ${p == null ? "flat" : changeClass(p)} ind-agg" data-agg="${code}" title="Average move of ${n} tracked stock${n > 1 ? "s" : ""}">${p == null ? "—" : fmtPct(p)} · ${n} stk</span>`;
  };

  function stockChip(s) {
    const q = state.quotes.get(s.symbol);
    const pct = q && !q.error ? q.changePercent : null;
    return `<button type="button" class="ind-stock ${changeClass(pct)}" data-sym="${esc(s.symbol)}" title="Open ${esc(s.name)} fundamentals">${esc(s.name)} <span class="ind-stock-pct">${pct != null ? fmtPct(pct) : ""}</span></button>`;
  }

  const researchLinks = (code) =>
    (knowledgeByNode.get(code) || [])
      .map((id) => `<a class="ind-research" href="#knowledge/${id}">${esc(K_SECTORS.find((s) => s.id === id).name)} research &rarr;</a>`)
      .join("");

  function basicHit(basic) {
    const t = terms();
    if (state.trackedOnly && !(NSE_STOCKS_BY_NODE.get(basic.code) || []).length) return false;
    if (!t.length) return true;
    const hay = `${NSE_IND.path(basic).map((n) => n.name).join(" ")} ${basic.definition} ${basic.code}`.toLowerCase();
    return t.every((x) => hay.includes(x));
  }

  function renderBasic(b) {
    const stocks = NSE_STOCKS_BY_NODE.get(b.code) || [];
    const open = state.openAll || state.open.has(b.code) || (terms().length && state.autoOpen) || state.focus === b.code;
    return `<details class="ind-basic" id="n-${b.code}" data-code="${b.code}"${open ? " open" : ""}>
      <summary><span class="ind-bname">${hl(b.name)}</span><span class="ind-code">${b.code}</span>${stocks.length ? `<span class="ind-sum-stocks">${stocks.map(stockChip).join("")}</span>` : ""}</summary>
      <div class="ind-def">${hl(b.definition)}</div>
      ${researchLinks(b.code) ? `<div class="ind-links">${researchLinks(b.code)}</div>` : ""}
    </details>`;
  }

  function render() {
    state.autoOpen = terms().length > 0 && terms().join(" ").length >= 3;
    const mesList = NSE_IND.lists.mes;
    const strip = mesList
      .map((m, i) => {
        const secs = m.children.length;
        const inds = m.children.reduce((a, s) => a + s.children.length, 0);
        const n = (NSE_STOCKS_BY_NODE.get(m.code) || []).length;
        return `<button type="button" class="ind-mes${state.mes === m.code ? " active" : ""}" data-mes="${m.code}" style="--c:${MES_COLORS[i % MES_COLORS.length]}">
          <span class="ind-mes-name">${esc(m.name)}</span>
          <span class="ind-mes-meta">${secs} sector${secs > 1 ? "s" : ""} · ${inds} industr${inds > 1 ? "ies" : "y"}</span>
          <span class="ind-mes-live">${aggChip(m.code) || '<span class="k-chip muted-chip">no tracked stocks</span>'}</span>
        </button>`;
      })
      .join("");

    let shownBasics = 0;
    const blocks = mesList
      .filter((m) => !state.mes || m.code === state.mes)
      .map((m) => {
        const secHtml = m.children
          .map((sec) => {
            const indHtml = sec.children
              .map((ind) => {
                const basics = ind.children.filter(basicHit);
                if (!basics.length) return "";
                shownBasics += basics.length;
                return `<div class="ind-ind" id="n-${ind.code}">
                  <div class="ind-ind-head"><span class="ind-iname">${hl(ind.name)}</span><span class="ind-code">${ind.code}</span>${aggChip(ind.code)}${researchLinks(ind.code)}</div>
                  ${basics.map(renderBasic).join("")}
                </div>`;
              })
              .join("");
            if (!indHtml) return "";
            return `<section class="card ind-sec" id="n-${sec.code}">
              <div class="ind-sec-head"><h4>${hl(sec.name)}</h4><span class="ind-code">${sec.code}</span>${aggChip(sec.code)}${researchLinks(sec.code)}</div>
              ${indHtml}
            </section>`;
          })
          .join("");
        if (!secHtml) return "";
        return `<div class="ind-mes-block" id="n-${m.code}" style="--c:${MES_COLORS[mesList.indexOf(m) % MES_COLORS.length]}">
          <h3 class="ind-mes-title">${hl(m.name)} <span class="ind-code">${m.code}</span> ${aggChip(m.code)}</h3>
          ${secHtml}
        </div>`;
      })
      .join("");

    const keep = root.querySelector("#ind-search");
    const hadFocus = keep && document.activeElement === keep;
    const toolbar = root.querySelector(".k-tools") ? null : `
      <section class="card k-tools">
        <div class="k-tools-row">
          <label class="k-search">
            <span class="k-search-icon" aria-hidden="true">&#9906;</span>
            <input id="ind-search" type="search" placeholder="Search names and definitions, e.g. tractors, hospital, refinery, BPO…" autocomplete="off" aria-label="Search industries" />
            <kbd>/</kbd>
          </label>
          <button type="button" class="k-btn" data-tracked aria-pressed="false">Tracked stocks only</button>
          <button type="button" class="k-btn" data-expand>Expand all</button>
          <button type="button" class="k-btn" data-collapse>Collapse all</button>
        </div>
        <div class="k-hint muted">Click a macro-economic sector to focus it. Open a basic industry to read NSE's definition and see the tracked stocks classified there. Stock classification is my mapping of the Nifty 50 onto this structure, so verify against NSE before relying on it.</div>
      </section>
      <div class="ind-strip" id="ind-strip"></div>
      <div class="k-count muted" id="ind-count"></div>
      <div id="ind-body"></div>`;
    if (toolbar) root.innerHTML = toolbar;
    document.getElementById("ind-strip").innerHTML = `<button type="button" class="ind-mes ind-all${state.mes === "" ? " active" : ""}" data-mes=""><span class="ind-mes-name">All sectors</span><span class="ind-mes-meta">${mesList.length} macro-economic sectors</span><span class="ind-mes-live"><span class="k-chip muted-chip">${NSE_IND.lists.bas.length} basic industries</span></span></button>${strip}`;
    document.getElementById("ind-body").innerHTML = blocks || `<div class="k-empty card">No classification entries match. Try a different word, or clear the filters.</div>`;
    document.getElementById("ind-count").textContent = `${shownBasics} of ${NSE_IND.lists.bas.length} basic industries shown`;
    const trackedBtn = root.querySelector("[data-tracked]");
    trackedBtn.classList.toggle("on", state.trackedOnly);
    trackedBtn.setAttribute("aria-pressed", state.trackedOnly);
    if (hadFocus) keep.focus();
  }

  // Quote refreshes patch the numbers in place so open items and scroll stay put.
  function patchLive() {
    for (const el of root.querySelectorAll("[data-agg]")) {
      const code = el.dataset.agg;
      const n = (NSE_STOCKS_BY_NODE.get(code) || []).length;
      const p = avgPct(code);
      el.className = `k-chip ${p == null ? "flat" : changeClass(p)} ind-agg`;
      el.textContent = `${p == null ? "—" : fmtPct(p)} · ${n} stk`;
    }
    for (const el of root.querySelectorAll(".ind-stock")) {
      const q = state.quotes.get(el.dataset.sym);
      const pct = q && !q.error ? q.changePercent : null;
      el.className = `ind-stock ${changeClass(pct)}`;
      el.querySelector(".ind-stock-pct").textContent = pct != null ? fmtPct(pct) : "";
    }
  }

  root.addEventListener("click", (e) => {
    const t = e.target;
    const mesBtn = t.closest("[data-mes]");
    const stock = t.closest(".ind-stock");
    if (stock) {
      e.preventDefault();
      const s = NIFTY50.find((x) => x.symbol === stock.dataset.sym);
      if (s) openStockFundamentals(s);
    } else if (mesBtn) {
      state.mes = mesBtn.dataset.mes;
      render();
    } else if (t.closest("[data-tracked]")) {
      state.trackedOnly = !state.trackedOnly;
      render();
    } else if (t.closest("[data-expand]")) {
      state.openAll = true;
      root.querySelectorAll(".ind-basic").forEach((d) => (d.open = true));
    } else if (t.closest("[data-collapse]")) {
      state.openAll = false;
      state.open.clear();
      state.focus = "";
      root.querySelectorAll(".ind-basic").forEach((d) => (d.open = false));
    }
  });

  root.addEventListener("toggle", (e) => {
    const d = e.target.closest?.(".ind-basic");
    if (!d) return;
    d.open ? state.open.add(d.dataset.code) : (state.open.delete(d.dataset.code), (state.openAll = false));
  }, true);

  root.addEventListener("input", (e) => {
    if (e.target.id !== "ind-search") return;
    state.query = e.target.value;
    render();
  });

  document.addEventListener("keydown", (e) => {
    if (!isActive() || e.metaKey || e.ctrlKey || e.altKey) return;
    const search = document.getElementById("ind-search");
    if (e.key === "Escape" && e.target === search) {
      if (search.value) {
        search.value = "";
        state.query = "";
        render();
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
      const { map } = await fetchQuotes(NIFTY_SYMBOLS);
      state.quotes = map;
      if (isActive()) patchLive();
    } catch (err) {
      console.error("industry quotes failed", err);
    } finally {
      loading = false;
    }
  }

  // "#industries/IN0501": focus that node (its macro-economic sector is selected).
  function route() {
    if (!isActive()) return;
    const code = location.hash.slice(1).split("/")[1];
    const node = code && NSE_IND.byCode.get(code);
    state.focus = node && node.level === "bas" ? node.code : "";
    if (node) state.mes = NSE_IND.path(node)[0].code;
    render();
    loadQuotes();
    if (node) {
      const el = document.getElementById(`n-${node.code}`);
      if (el) {
        el.scrollIntoView({ block: "center" });
        el.classList.add("ind-flash");
      }
    }
  }

  document.addEventListener("tabchange", route);
  setInterval(() => isActive() && !document.hidden && loadQuotes(), 30_000);
  route();
})();
