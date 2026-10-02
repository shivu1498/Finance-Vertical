// Mutual Funds tab: ranked Large/Mid/Small Cap fund cards, details, compare, commands.
// Talks to /api/mf/* (see mf.js). Depends on app.js helpers (showTab).
(function () {
  const root = document.getElementById("mf-root");
  const CATS = [["large", "Large Cap"], ["mid", "Mid Cap"], ["small", "Small Cap"]];
  const SORTS = {
    score: ["Score", (f) => f.score, 1],
    cagr3: ["3Y CAGR", (f) => f.metrics.cagr3, 1],
    cagr5: ["5Y CAGR", (f) => f.metrics.cagr5, 1],
    sip: ["SIP XIRR", (f) => f.metrics.sip, 1],
    sharpe: ["Sharpe", (f) => f.metrics.sharpe, 1],
    maxdd: ["Max drawdown (mildest)", (f) => f.metrics.maxdd, 1],
    consistency: ["Consistency", (f) => f.metrics.consistency, 1],
    alpha: ["Alpha", (f) => f.metrics.alpha, 1],
    name: ["Name A–Z", (f) => f.name, -1],
  };

  const state = { cat: "large", data: {}, sort: "score", query: "", rating: "", poll: null };

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const isActive = () => document.querySelector("#tabs .tab.active")?.dataset.tab === "funds";
  const num = (v, d = 2) => (v == null ? "—" : Number(v).toFixed(d));
  const pct = (v, d = 2) => (v == null ? "—" : `${Number(v).toFixed(d)}%`);
  const signed = (v, d = 2) => (v == null ? "—" : `${v > 0 ? "+" : ""}${Number(v).toFixed(d)}`);
  const dmy = (iso) => (iso ? iso.split("-").reverse().join("-") : "—");
  const when = (ms) => (ms ? new Date(ms).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "—");
  const shortName = (n) => n.replace(/\s*-?\s*Direct Plan\s*-?\s*Growth( Option)?/i, "").replace(/\s*-\s*Direct\b.*$/i, "").trim();
  const tone = (v, good = 0, bad = 0) => (v == null ? "" : v > good ? "pos" : v < bad ? "neg" : "");

  async function getJSON(url, opts) {
    const res = await fetch(url, opts);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
    return body;
  }

  // ---------- list view ----------
  function metric(label, value, cls = "") {
    return `<div class="mf-m"><dt>${label}</dt><dd class="${cls}">${value}</dd></div>`;
  }

  function card(f) {
    const m = f.metrics;
    return `<article class="mf-card ${f.rating.toLowerCase()}" tabindex="0" data-code="${f.code}" aria-label="${esc(shortName(f.name))}">
      <div class="mf-card-top">
        <span class="mf-dot"></span><span class="mf-rank">#${f.rank}</span>
        <span class="mf-rating ${f.rating}">${f.rating}</span>
        <span class="mf-score">${num(f.score, 1)}/100</span>
      </div>
      <h3 class="mf-name">${esc(shortName(f.name))}</h3>
      <div class="mf-bar"><div style="width:${Math.max(2, f.score)}%"></div></div>
      <p class="mf-verdict">${esc(f.verdict || "")}</p>
      <dl class="mf-metrics">
        ${metric("3Y CAGR", pct(m.cagr3), tone(m.cagr3))}
        ${metric("5Y CAGR", pct(m.cagr5), tone(m.cagr5))}
        ${metric("SIP XIRR", pct(m.sip), tone(m.sip))}
        ${metric("SHARPE", num(m.sharpe))}
        ${metric("MAX DD", pct(m.maxdd, 1), "neg")}
        ${metric("CONSISTENCY", m.consistency == null ? "—" : m.consistency, m.consistency >= 60 ? "pos" : m.consistency <= 40 ? "neg" : "")}
        ${metric("ALPHA", signed(m.alpha, 1), tone(m.alpha))}
        ${m.cagr10 != null ? metric("10Y CAGR", pct(m.cagr10), tone(m.cagr10)) : ""}
      </dl>
      <div class="mf-nav"><span>NAV &#8377;${num(f.nav)}</span><span>${dmy(f.navDate)}</span></div>
    </article>`;
  }

  function visibleFunds(d) {
    const q = state.query.toLowerCase().split(/\s+/).filter(Boolean);
    let list = d.funds.filter((f) => (!state.rating || f.rating === state.rating) && q.every((t) => f.name.toLowerCase().includes(t)));
    const [, key, dir] = SORTS[state.sort];
    list = [...list].sort((a, b) => {
      const x = key(a), y = key(b);
      if (x == null && y == null) return 0;
      if (x == null) return 1;
      if (y == null) return -1;
      return dir === -1 ? String(x).localeCompare(String(y)) : y - x;
    });
    return list;
  }

  function bodyFor(d) {
    if (!d) return `<div class="mf-state card"><div class="ticker-loading">Loading…</div></div>`;
    if (d.state === "error") {
      return `<div class="mf-state card"><b>Could not build this list.</b><p class="muted">${esc(d.error || "Unknown error")}</p><button type="button" class="k-btn primary" data-mf-refresh>Try again</button></div>`;
    }
    if (d.state !== "ready") {
      const { done, total, current } = d.progress;
      const pctDone = total ? Math.round((done / total) * 100) : 0;
      const msg = d.state === "empty" ? "Waiting for the first build to start…" : `Analysing funds ${done}/${total}${current ? ` · ${esc(current)}` : ""}`;
      return `<div class="mf-state card"><b>Building the ${esc(d.label)} ranking</b>
        <p class="muted">${msg}. NAV history is fetched slowly and politely from mfapi.in, then cached for 24 hours.</p>
        <div class="mf-progress"><div style="width:${pctDone}%"></div></div>
        ${d.state === "empty" ? `<button type="button" class="k-btn primary" data-mf-refresh>Start now</button>` : ""}</div>`;
    }
    const list = visibleFunds(d);
    const counts = { BUY: 0, HOLD: 0, AVOID: 0 };
    d.funds.forEach((f) => counts[f.rating]++);
    return `
      <div class="mf-filters">
        <input id="mf-q" class="mf-input" type="search" placeholder="Filter funds by name…" value="${esc(state.query)}" aria-label="Filter funds" />
        <label class="mf-sort">Sort <select id="mf-sort" class="sector-filter">${Object.entries(SORTS).map(([k, [label]]) => `<option value="${k}"${state.sort === k ? " selected" : ""}>${label}</option>`).join("")}</select></label>
        <div class="k-seg" role="group" aria-label="Rating">
          <button type="button" data-mf-rating="" class="${state.rating === "" ? "active" : ""}">All ${d.funds.length}</button>
          ${["BUY", "HOLD", "AVOID"].map((r) => `<button type="button" data-mf-rating="${r}" class="${state.rating === r ? "active" : ""}">${r} ${counts[r]}</button>`).join("")}
        </div>
      </div>
      <div class="mf-grid">${list.length ? list.map(card).join("") : `<div class="k-empty card">No funds match.</div>`}</div>
      ${footnote(d)}`;
  }

  function footnote(d) {
    const bits = [`${d.funds.length} funds ranked against each other · peer average 3Y CAGR ${pct(d.peer?.cagr3)}`];
    if (d.unmatched.length) bits.push(`${d.unmatched.length} not found on mfapi.in: ${esc(d.unmatched.join(", "))}`);
    if (d.excluded.length) bits.push(`${d.excluded.length} left out (under 3 years of history): ${esc(d.excluded.map((x) => shortName(x.name)).join(", "))}`);
    if (d.failed.length) bits.push(`${d.failed.length} failed to load: ${esc(d.failed.map((x) => x.name).join(", "))}`);
    return `<div class="mf-foot muted">${bits.join(" · ")}</div>`;
  }

  function sidebar(d) {
    const st = d?.state;
    const status = st === "ready" ? `<span class="mf-ok">● up to date</span>` : st === "error" ? `<span class="mf-bad">● error</span>` : `<span class="mf-wait">● building…</span>`;
    return `<aside class="mf-side card">
      <div class="section-title">MF COMMANDS</div>
      <div class="mf-side-h">TOP FUNDS</div>
      ${CATS.map(([k, label]) => `<button type="button" class="mf-cmd${state.cat === k ? " active" : ""}" data-mf-cat="${k}"><span>${label}</span><code>/top ${k}cap</code></button>`).join("")}
      <div class="mf-side-h">REFRESH</div>
      <button type="button" class="mf-cmd" data-mf-refresh><span>&#8635; Refresh NAV cache</span><code>/refresh</code></button>
      <div class="mf-status">${status}<br>Last: ${when(d?.updatedAt)}<br>Next: ${when(d?.nextRefreshAt)}<br>Auto-refreshes every 24h</div>
      <div class="mf-side-h">MORE</div>
      <div class="muted mf-note">Fund details, compare and the command line arrive in the next step. Portfolio overlap and holdings need a holdings data source (e.g. a Finnworlds API key), which is not configured here.</div>
    </aside>`;
  }

  function render() {
    const d = state.data[state.cat];
    root.innerHTML = `
      <div class="mf-layout">
        <div class="mf-main">
          <div class="mf-tabs" role="tablist">${CATS.map(([k, label]) => `<button type="button" role="tab" class="mf-tab${state.cat === k ? " active" : ""}" data-mf-cat="${k}" aria-selected="${state.cat === k}">${label}</button>`).join("")}<span class="mf-hint muted">Click a fund card for full details</span></div>
          <div id="mf-body">${bodyFor(d)}</div>
        </div>
        ${sidebar(d)}
      </div>`;
  }

  function renderBodyOnly() {
    const body = document.getElementById("mf-body");
    if (!body) return render();
    const keepQ = document.activeElement?.id === "mf-q";
    body.innerHTML = bodyFor(state.data[state.cat]);
    if (keepQ) {
      const q = document.getElementById("mf-q");
      q.focus();
      q.setSelectionRange(q.value.length, q.value.length);
    }
  }

  // ---------- data loading ----------
  async function load(cat = state.cat) {
    try {
      state.data[cat] = await getJSON(`/api/mf/universe?cat=${cat}`);
    } catch (e) {
      state.data[cat] = { state: "error", error: e.message, label: CATS.find((c) => c[0] === cat)[1], progress: { done: 0, total: 0 }, funds: [], unmatched: [], excluded: [], failed: [] };
    }
    if (cat === state.cat && isActive()) render();
    schedulePoll();
  }

  function schedulePoll() {
    clearTimeout(state.poll);
    const d = state.data[state.cat];
    if (isActive() && d && (d.state === "building" || d.state === "queued" || d.state === "empty")) {
      state.poll = setTimeout(() => load(), 2000);
    }
  }

  function setCat(cat) {
    location.hash = `funds/${cat}`;
  }

  // ---------- events ----------
  root.addEventListener("click", async (e) => {
    const t = e.target;
    const catBtn = t.closest("[data-mf-cat]");
    if (catBtn) return setCat(catBtn.dataset.mfCat);
    if (t.closest("[data-mf-refresh]")) {
      try {
        await getJSON(`/api/mf/refresh?cat=${state.cat}`, { method: "POST" });
      } catch {
        // the status poll below shows the outcome
      }
      return load();
    }
    const rating = t.closest("[data-mf-rating]");
    if (rating) {
      state.rating = rating.dataset.mfRating;
      return renderBodyOnly();
    }
  });
  root.addEventListener("input", (e) => {
    if (e.target.id === "mf-q") {
      state.query = e.target.value;
      renderBodyOnly();
    }
  });
  root.addEventListener("change", (e) => {
    if (e.target.id === "mf-sort") {
      state.sort = e.target.value;
      renderBodyOnly();
    }
  });

  function route() {
    if (!isActive()) return;
    const [, cat] = location.hash.slice(1).split("/");
    state.cat = CATS.some((c) => c[0] === cat) ? cat : state.cat;
    if (location.hash.slice(1) === "funds") history.replaceState(null, "", `#funds/${state.cat}`);
    render();
    load();
  }

  document.addEventListener("tabchange", route);
  setInterval(() => isActive() && !document.hidden && state.data[state.cat]?.state === "ready" && load(), 5 * 60 * 1000);
  route();
})();
