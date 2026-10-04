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

  const state = { cat: "large", data: {}, sort: "score", query: "", rating: "", poll: null, funds: {}, detail: null };
  const COLORS = { fund: "#ffd24a", cmp: "#2ecc71", peer: "#9db4e8" };
  const DAY = 86400000, YEAR = 365.25 * DAY;
  const fmtDate = (t) => new Date(t).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  const inr = (n) => Math.round(n).toLocaleString("en-IN");

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const isActive = () => document.querySelector("#tabs .tab.active")?.dataset.tab === "funds";
  const num = (v, d = 2) => (v == null ? "—" : Number(v).toFixed(d));
  const pct = (v, d = 2) => (v == null ? "—" : `${Number(v).toFixed(d)}%`);
  const signed = (v, d = 2) => {
    if (v == null) return "—";
    const s = Number(v).toFixed(d);
    return Number(s) === 0 ? Number(0).toFixed(d) : `${v > 0 ? "+" : ""}${s}`;
  };
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
    const refreshing = (d.state === "building" || d.state === "queued") && d.funds.length > 0;
    if (d.state !== "ready" && !refreshing) {
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
    const banner = refreshing ? `<div class="mf-banner">Refreshing NAV data ${d.progress.done}/${d.progress.total}${d.progress.current ? ` · ${esc(d.progress.current)}` : ""}. Showing the previous results until it finishes.</div>` : "";
    return `${banner}
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

  // The layout is built once; only tabs, body and the sidebar status refresh afterwards,
  // so text typed into the sidebar is never wiped by a poll or a navigation.
  function sideHtml() {
    return `
      <div class="section-title">MF COMMANDS</div>
      <div class="mf-side-h">TOP FUNDS</div>
      ${CATS.map(([k, label]) => `<button type="button" class="mf-cmd" data-mf-cat="${k}"><span>${label}</span><code>/top ${k}cap</code></button>`).join("")}
      <div class="mf-side-h">FUND DETAILS</div>
      <form class="mf-form" id="mf-search-form" autocomplete="off"><input id="mf-search" class="mf-input" placeholder="Fund name…" aria-label="Search any fund" /><button type="submit" class="k-btn primary">Details</button></form>
      <div id="mf-search-out" class="mf-out" aria-live="polite"></div>
      <div class="mf-side-h">COMPARE FUNDS</div>
      <form class="mf-form mf-form-col" id="mf-compare-form"><select id="mf-cmp-a" class="sector-filter" aria-label="Fund A"></select><select id="mf-cmp-b" class="sector-filter" aria-label="Fund B"></select><button type="submit" class="k-btn primary">Compare</button></form>
      <div class="mf-side-h">CUSTOM COMMAND</div>
      <form class="mf-form" id="mf-cmd-form" autocomplete="off"><input id="mf-cmd" class="mf-input" placeholder="/top midcap" aria-label="Command" /><button type="submit" class="k-btn primary">Run</button></form>
      <div id="mf-cmd-out" class="mf-out" aria-live="polite"></div>
      <div class="mf-side-h">REFRESH</div>
      <button type="button" class="mf-cmd" data-mf-refresh><span>&#8635; Refresh NAV cache</span><code>/refresh</code></button>
      <div class="mf-status" id="mf-status"></div>
      <div class="muted mf-note">Portfolio overlap and holdings need a holdings data source (for example a Finnworlds API key), which is not configured here.</div>`;
  }

  function shell() {
    root.innerHTML = `<div class="mf-layout"><div class="mf-main"><div class="mf-tabs" id="mf-tabs" role="tablist"></div><div id="mf-body"></div></div><aside class="mf-side card" id="mf-side">${sideHtml()}</aside></div>`;
  }

  function renderTabs() {
    document.getElementById("mf-tabs").innerHTML = CATS.map(([k, label]) => `<button type="button" role="tab" class="mf-tab${state.cat === k ? " active" : ""}" data-mf-cat="${k}" aria-selected="${state.cat === k}">${label}</button>`).join("") + `<span class="mf-hint muted">Click a fund card for full details</span>`;
  }

  function renderBody() {
    const body = document.getElementById("mf-body");
    const keepQ = document.activeElement?.id === "mf-q";
    body.innerHTML = bodyFor(state.data[state.cat]);
    if (keepQ) {
      const q = document.getElementById("mf-q");
      q.focus();
      q.setSelectionRange(q.value.length, q.value.length);
    }
  }

  function renderSide() {
    const d = state.data[state.cat];
    document.querySelectorAll("#mf-side [data-mf-cat]").forEach((b) => b.classList.toggle("active", b.dataset.mfCat === state.cat));
    const st = d?.state;
    const status = st === "ready" ? `<span class="mf-ok">● up to date</span>` : st === "error" ? `<span class="mf-bad">● error</span>` : `<span class="mf-wait">● building ${d?.progress ? `${d.progress.done}/${d.progress.total}` : "…"}</span>`;
    document.getElementById("mf-status").innerHTML = `${status}<br>Last: ${when(d?.updatedAt)}<br>Next: ${when(d?.nextRefreshAt)}<br>Auto-refreshes every 24h`;
    // compare selects keep the user's choice when the list reloads
    const funds = d?.funds || [];
    for (const [id, fallback] of [["mf-cmp-a", 0], ["mf-cmp-b", 1]]) {
      const sel = document.getElementById(id);
      const keep = sel.value;
      sel.innerHTML = funds.map((f) => `<option value="${f.code}">#${f.rank} ${esc(shortName(f.name))}</option>`).join("") || `<option value="">No funds yet</option>`;
      sel.value = funds.some((f) => f.code === keep) ? keep : funds[fallback]?.code || "";
    }
  }

  function renderAll() {
    if (!document.getElementById("mf-body")) shell();
    renderTabs();
    renderBody();
    renderSide();
  }
  const renderBodyOnly = renderBody;

  // ---------- data loading ----------
  async function load(cat = state.cat) {
    try {
      state.data[cat] = await getJSON(`/api/mf/universe?cat=${cat}`);
    } catch (e) {
      state.data[cat] = { state: "error", error: e.message, label: CATS.find((c) => c[0] === cat)[1], progress: { done: 0, total: 0 }, funds: [], unmatched: [], excluded: [], failed: [] };
    }
    if (cat === state.cat && isActive()) renderAll();
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

  // ---------- detail panel ----------
  async function fetchFund(code, cat) {
    if (!state.funds[code]) state.funds[code] = await getJSON(`/api/mf/fund/${code}?cat=${cat}`);
    return state.funds[code];
  }

  // Fund line as [t, value] points (value rebased to 100 at the fund's own start).
  function fundPts(p) {
    const g = p.peer.grid, c = p.fund.chart;
    return c ? c.v.map((v, k) => [g[c.i0 + k], v]) : [];
  }
  const peerPts = (p) => p.peer.grid.map((t, i) => [t, p.peer.v[i]]).filter((x) => x[1] != null);

  // Crops every series to the same window and rebases each to 100 at that start.
  function windowed(seriesList, range) {
    const lastT = Math.max(...seriesList.map((s) => s.pts.at(-1)[0]));
    const firstT = Math.max(...seriesList.map((s) => s.pts[0][0]));
    const years = { "1Y": 1, "3Y": 3, "5Y": 5 }[range];
    const start = years ? Math.max(firstT, lastT - years * YEAR) : firstT;
    return seriesList.map((s) => {
      const pts = s.pts.filter((p) => p[0] >= start - 3 * DAY);
      const base = pts[0][1];
      return { ...s, pts: pts.map(([t, v]) => [t, (v / base) * 100]) };
    });
  }

  function chartSvg(series) {
    const W = 640, H = 270, m = { l: 44, r: 12, t: 10, b: 26 };
    const all = series.flatMap((s) => s.pts);
    const t0 = Math.min(...all.map((p) => p[0])), t1 = Math.max(...all.map((p) => p[0]));
    let lo = Math.min(...all.map((p) => p[1])), hi = Math.max(...all.map((p) => p[1]));
    const pad = (hi - lo) * 0.08 || 1;
    lo -= pad; hi += pad;
    const x = (t) => m.l + ((t - t0) / (t1 - t0)) * (W - m.l - m.r);
    const y = (v) => H - m.b - ((v - lo) / (hi - lo)) * (H - m.t - m.b);
    const line = (pts) => pts.map((p, i) => `${i ? "L" : "M"}${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join("");
    const yTicks = Array.from({ length: 5 }, (_, i) => lo + ((hi - lo) * i) / 4);
    const xTicks = Array.from({ length: 5 }, (_, i) => t0 + ((t1 - t0) * i) / 4);
    const svg = `<svg class="mf-chart-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="NAV growth chart">
      ${yTicks.map((v) => `<line x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}" class="mf-grid-line"/><text x="${m.l - 6}" y="${y(v) + 4}" class="mf-axis" text-anchor="end">${v.toFixed(0)}</text>`).join("")}
      ${xTicks.map((t, i) => `<text x="${x(t)}" y="${H - 8}" class="mf-axis" text-anchor="${i === 0 ? "start" : i === 4 ? "end" : "middle"}">${new Date(t).toLocaleDateString("en-IN", { month: "short", year: "2-digit" })}</text>`).join("")}
      <line x1="${m.l}" x2="${W - m.r}" y1="${y(100)}" y2="${y(100)}" class="mf-base-line"/>
      ${series.map((s) => `<path d="${line(s.pts)}" fill="none" stroke="${s.color}" stroke-width="${s.key === "peer" ? 1.6 : 2.2}" ${s.key === "peer" ? 'stroke-dasharray="5 4"' : ""} stroke-linejoin="round"/>`).join("")}
      <line class="mf-cross" x1="0" x2="0" y1="${m.t}" y2="${H - m.b}" style="display:none"/>
      ${series.map((s, i) => `<circle class="mf-dotc" data-i="${i}" r="4" fill="${s.color}" stroke="#06143f" stroke-width="1.5" style="display:none"/>`).join("")}
      <rect class="mf-hit" x="${m.l}" y="${m.t}" width="${W - m.l - m.r}" height="${H - m.t - m.b}" fill="transparent"/>
    </svg>`;
    return { svg, geo: { W, H, m, t0, t1, x, y } };
  }

  function wireChart(host, series, geo) {
    const svg = host.querySelector("svg"), hit = host.querySelector(".mf-hit"), cross = host.querySelector(".mf-cross");
    const dots = [...host.querySelectorAll(".mf-dotc")], tip = host.querySelector(".mf-tip");
    const nearest = (pts, t) => {
      let lo = 0, hi = pts.length - 1;
      while (lo < hi) { const mid = (lo + hi) >> 1; pts[mid][0] < t ? (lo = mid + 1) : (hi = mid); }
      return lo > 0 && Math.abs(pts[lo - 1][0] - t) < Math.abs(pts[lo][0] - t) ? pts[lo - 1] : pts[lo];
    };
    const show = (e) => {
      const r = svg.getBoundingClientRect();
      const sx = ((e.clientX - r.left) / r.width) * geo.W;
      const t = geo.t0 + ((sx - geo.m.l) / (geo.W - geo.m.l - geo.m.r)) * (geo.t1 - geo.t0);
      const hits = series.map((s) => nearest(s.pts, t));
      const cx = geo.x(hits[0][0]);
      cross.setAttribute("x1", cx); cross.setAttribute("x2", cx); cross.style.display = "";
      dots.forEach((d, i) => { d.setAttribute("cx", geo.x(hits[i][0])); d.setAttribute("cy", geo.y(hits[i][1])); d.style.display = ""; });
      tip.innerHTML = `<b>${fmtDate(hits[0][0])}</b>` + series.map((s, i) => `<div><i style="background:${s.color}"></i>${esc(s.name)} <b>${(hits[i][1] - 100 >= 0 ? "+" : "") + (hits[i][1] - 100).toFixed(1)}%</b></div>`).join("");
      tip.style.display = "block";
      const px = (cx / geo.W) * r.width;
      tip.style.left = `${px > r.width * 0.6 ? px - tip.offsetWidth - 12 : px + 12}px`;
    };
    hit.addEventListener("mousemove", show);
    hit.addEventListener("mouseleave", () => { cross.style.display = "none"; dots.forEach((d) => (d.style.display = "none")); tip.style.display = "none"; });
  }

  const METRIC_ROWS = [
    ["cagr3", (v) => pct(v)], ["cagr5", (v) => pct(v)], ["sip", (v) => pct(v)], ["sharpe", (v) => num(v)],
    ["maxdd", (v) => pct(v, 1)], ["consistency", (v) => (v == null ? "—" : `${v}% of 1Y windows`)], ["alpha", (v) => `${signed(v)} pp`],
  ];

  function breakdownHtml(p) {
    return p.breakdown.map((b) => {
      const row = METRIC_ROWS.find((r) => r[0] === b.key);
      const hue = b.percentile == null ? 0 : Math.round(b.percentile * 1.2);
      return `<div class="mf-bd" title="${esc(b.label)}: ${b.weight}% of the score">
        <span class="mf-bd-l">${esc(b.label)}<small>${b.weight}%</small></span>
        <span class="mf-bd-bar"><i style="width:${b.percentile ?? 0}%;background:hsl(${hue} 70% 50%)"></i></span>
        <span class="mf-bd-v">${row[1](b.value)}</span>
        <span class="mf-bd-p">${b.percentile == null ? "—" : `P${b.percentile}`}</span>
      </div>`;
    }).join("");
  }

  function calendarHtml(p) {
    const cal = p.fund.calendar || [];
    if (!cal.length) return '<div class="muted">Not enough history.</div>';
    const max = Math.max(...cal.map((c) => Math.abs(c.ret)), 1);
    return `<div class="mf-cal">${cal.map((c) => `<div class="mf-cal-col"><span class="mf-cal-v ${tone(c.ret)}">${signed(c.ret, 1)}%</span><div class="mf-cal-bar"><i class="${c.ret >= 0 ? "up" : "down"}" style="height:${(Math.abs(c.ret) / max) * 100}%"></i></div><span class="mf-cal-y">${c.ytd ? "YTD" : c.year}</span></div>`).join("")}</div>`;
  }

  function detailHtml(p) {
    const f = p.fund, d = state.detail, m = f.metrics;
    const cats = { large: "Large Cap", mid: "Mid Cap", small: "Small Cap" };
    const sip = f.sipDetail;
    const dd = f.drawdown;
    return `
      <div class="mf-d-head">
        <div>
          <div class="mf-d-badges">${f.rating ? `<span class="mf-rating ${f.rating}">${f.rating}</span>` : ""}<span class="mf-d-score">${num(f.score, 1)}/100</span>${f.rank ? `<span class="muted">#${f.rank} in ${cats[p.cat]}</span>` : `<span class="muted">not in the screened ${cats[p.cat]} list</span>`}</div>
          <h3 class="mf-d-name">${esc(shortName(f.name))}</h3>
          <div class="muted mf-d-meta">${esc(f.house || "")}${f.category ? ` · ${esc(f.category)}` : ""}${f.isin ? ` · ${esc(f.isin)}` : ""}</div>
        </div>
        <button type="button" class="detail-close" data-mf-close aria-label="Close details">&times;</button>
      </div>
      <p class="mf-d-verdict">${esc(f.verdict || "")}</p>
      <label class="mf-d-cmp">Compare with <select id="mf-d-cmp" class="sector-filter"><option value="">Choose a fund…</option>${(state.data[p.cat]?.funds || []).filter((x) => x.code !== f.code).map((x) => `<option value="${x.code}">#${x.rank} ${esc(shortName(x.name))}</option>`).join("")}</select></label>
      <div class="mf-d-nav">NAV <b>&#8377;${num(f.nav)}</b> <span class="muted">as of ${dmy(f.navDate)}</span></div>

      <h4 class="mf-d-h">Growth vs peer average
        <span class="k-seg mf-ranges" role="group" aria-label="Chart range">${["1Y", "3Y", "5Y", "Max"].map((r) => `<button type="button" data-mf-range="${r}" class="${d.range === r ? "active" : ""}">${r}</button>`).join("")}</span>
      </h4>
      <div class="mf-chart" id="mf-chart"></div>
      <div class="mf-legend" id="mf-legend"></div>

      <h4 class="mf-d-h">How the score is made <span class="muted">weight · percentile among peers</span></h4>
      <div class="mf-bds">${breakdownHtml(p)}</div>

      <h4 class="mf-d-h">Key numbers</h4>
      <dl class="mf-keys">
        <div><dt>3Y CAGR</dt><dd class="${tone(m.cagr3)}">${pct(m.cagr3)}</dd></div>
        <div><dt>5Y CAGR</dt><dd class="${tone(m.cagr5)}">${pct(m.cagr5)}</dd></div>
        <div><dt>10Y CAGR</dt><dd class="${tone(m.cagr10)}">${pct(m.cagr10)}</dd></div>
        <div><dt>SIP XIRR</dt><dd class="${tone(m.sip)}">${pct(m.sip)}</dd></div>
        <div><dt>Sharpe</dt><dd>${num(m.sharpe)}</dd></div>
        <div><dt>Alpha vs peers</dt><dd class="${tone(m.alpha)}">${signed(m.alpha)} pp</dd></div>
      </dl>
      ${sip ? `<p class="mf-d-note">A &#8377;10,000 monthly SIP over the last ${sip.months} months would have put in <b>${fmtInrCompact(sip.invested * 10000)}</b> and be worth about <b>${fmtInrCompact(sip.value * 10000)}</b> now.</p>` : ""}
      ${dd ? `<p class="mf-d-note">Worst fall (5Y window): <b class="neg">${pct(dd.pct, 1)}</b>, from the peak on ${dmy(dd.peak)} to the low on ${dmy(dd.trough)}.</p>` : ""}

      <h4 class="mf-d-h">Calendar-year returns</h4>
      ${calendarHtml(p)}
      <p class="mf-d-fine muted">${p.inUniverse ? "" : "This fund is not in the screened list, so its percentiles are measured against the screened funds. "}Alpha is this fund's 3Y CAGR minus the peer average; consistency is the share of rolling 1-year windows it beat the peer average. Source: NAV history from mfapi.in. Past performance does not predict future returns; this is not investment advice.</p>`;
  }

  const CMP_ROWS = [
    ["Score", (f) => f.score, (v) => num(v, 1), false],
    ["3Y CAGR", (f) => f.metrics.cagr3, (v) => pct(v), true],
    ["5Y CAGR", (f) => f.metrics.cagr5, (v) => pct(v), true],
    ["10Y CAGR", (f) => f.metrics.cagr10, (v) => pct(v), true],
    ["SIP XIRR", (f) => f.metrics.sip, (v) => pct(v), true],
    ["Sharpe ratio", (f) => f.metrics.sharpe, (v) => num(v), true],
    ["Max drawdown", (f) => f.metrics.maxdd, (v) => pct(v, 1), true],
    ["Consistency", (f) => f.metrics.consistency, (v) => (v == null ? "—" : `${v}%`), true],
    ["Alpha vs peers", (f) => f.metrics.alpha, (v) => (v == null ? "—" : `${signed(v)} pp`), true],
  ];

  function compareHtml(a, b) {
    const fa = a.fund, fb = b.fund;
    let winsA = 0, winsB = 0, counted = 0;
    const rows = CMP_ROWS.map(([label, get, fmt, counts]) => {
      const x = get(fa), y = get(fb);
      const cls = ["", ""];
      if (x != null && y != null && x !== y) {
        const aWins = x > y;
        cls[aWins ? 0 : 1] = "win";
        if (counts) { aWins ? winsA++ : winsB++; }
      }
      if (counts && x != null && y != null) counted++;
      return `<tr><th>${label}</th><td class="${cls[0]}">${fmt(x)}</td><td class="${cls[1]}">${fmt(y)}</td></tr>`;
    }).join("");
    const years = [...new Set([...(fa.calendar || []), ...(fb.calendar || [])].map((c) => c.year))].sort();
    const calOf = (f, y) => f.calendar?.find((c) => c.year === y);
    const calRows = years.map((y) => {
      const x = calOf(fa, y), z = calOf(fb, y);
      const cls = x && z && x.ret !== z.ret ? [x.ret > z.ret ? "win" : "", z.ret > x.ret ? "win" : ""] : ["", ""];
      return `<tr><th>${y === Math.max(...years) ? `${y} YTD` : y}</th><td class="${cls[0]}">${x ? `${signed(x.ret, 1)}%` : "—"}</td><td class="${cls[1]}">${z ? `${signed(z.ret, 1)}%` : "—"}</td></tr>`;
    }).join("");
    const head = (f, color, code) => `<th class="mf-cmp-h"><i style="background:${color}"></i>${esc(shortName(f.name))}<small>${f.rating ? `<span class="mf-rating ${f.rating}">${f.rating}</span> ` : ""}${f.rank ? `#${f.rank}` : "unranked"}</small></th>`;
    const verdict = counted ? (winsA === winsB ? `Level on ${winsA} of ${counted} metrics each.` : `${esc(shortName((winsA > winsB ? fa : fb).name))} is ahead on ${Math.max(winsA, winsB)} of ${counted} metrics.`) : "";
    return `
      <div class="mf-d-head">
        <div><div class="muted mf-d-meta">Comparing two funds</div><h3 class="mf-d-name">${esc(shortName(fa.name))}<br><span class="muted">vs</span> ${esc(shortName(fb.name))}</h3></div>
        <button type="button" class="detail-close" data-mf-close aria-label="Close comparison">&times;</button>
      </div>
      <p class="mf-d-verdict">${verdict} <button type="button" class="k-link" data-mf-uncompare>&larr; Back to ${esc(shortName(fa.name))}</button></p>
      <h4 class="mf-d-h">Growth of 100 <span class="k-seg mf-ranges" role="group" aria-label="Chart range">${["1Y", "3Y", "5Y", "Max"].map((r) => `<button type="button" data-mf-range="${r}" class="${state.detail.range === r ? "active" : ""}">${r}</button>`).join("")}</span></h4>
      <div class="mf-chart" id="mf-chart"></div>
      <div class="mf-legend" id="mf-legend"></div>
      <h4 class="mf-d-h">Side by side <span class="muted">green = better</span></h4>
      <table class="mf-cmp"><thead><tr><th></th>${head(fa, COLORS.fund)}${head(fb, COLORS.cmp)}</tr></thead><tbody>${rows}</tbody></table>
      <h4 class="mf-d-h">Calendar-year returns</h4>
      <table class="mf-cmp"><tbody>${calRows}</tbody></table>
      <p class="mf-d-fine muted">${a.cat === b.cat ? "" : "The funds belong to different categories; the dashed peer line is the first fund's category average. "}Percentiles and scores are each fund's rank among its own category's peers, so compare like with like. Source: NAV history from mfapi.in. Not investment advice.</p>`;
  }

  function drawChart() {
    const host = document.getElementById("mf-chart");
    const d = state.detail;
    const p = state.funds[d.code];
    if (!host || !p) return;
    const list = [{ key: "fund", name: shortName(p.fund.name), color: COLORS.fund, pts: fundPts(p) }];
    const p2 = d.cmp ? state.funds[d.cmp] : null;
    if (p2) list.push({ key: "cmp", name: shortName(p2.fund.name), color: COLORS.cmp, pts: fundPts(p2) });
    list.push({ key: "peer", name: p2 ? "Peer average (first fund's category)" : "Peer average", color: COLORS.peer, pts: peerPts(p) });
    if (list.some((s) => !s.pts.length)) { host.innerHTML = '<div class="muted">No chart data.</div>'; return; }
    const series = windowed(list, d.range);
    const { svg, geo } = chartSvg(series);
    host.innerHTML = `${svg}<div class="mf-tip" style="display:none"></div>`;
    wireChart(host, series, geo);
    document.getElementById("mf-legend").innerHTML = series.map((s) => `<span><i style="background:${s.color}"></i>${esc(s.name)} <b>${(s.pts.at(-1)[1] - 100 >= 0 ? "+" : "") + (s.pts.at(-1)[1] - 100).toFixed(1)}%</b></span>`).join("");
  }

  async function openDetail(code, cat, cmp = null) {
    state.detail = { code, cat, cmp, range: state.detail?.range || "5Y" };
    let panel = document.getElementById("mf-detail");
    if (!panel) {
      panel = document.createElement("div");
      panel.id = "mf-detail";
      panel.className = "mf-detail";
      document.body.appendChild(panel);
    }
    panel.innerHTML = `<div class="mf-d-backdrop" data-mf-close></div><div class="mf-d-panel" role="dialog" aria-modal="true" aria-label="Fund details"><div class="mf-d-body"><div class="ticker-loading">Loading ${cmp ? "funds" : "fund"}…</div></div></div>`;
    requestAnimationFrame(() => panel.classList.add("open"));
    document.body.classList.add("mf-lock");
    const same = () => state.detail && state.detail.code === code && state.detail.cmp === cmp;
    try {
      const [p, p2] = await Promise.all([fetchFund(code, cat), cmp ? fetchFund(cmp, cat) : null]);
      if (!same()) return;
      panel.querySelector(".mf-d-body").innerHTML = cmp ? compareHtml(p, p2) : detailHtml(p);
      drawChart();
    } catch (e) {
      if (!same()) return;
      panel.querySelector(".mf-d-body").innerHTML = `<button type="button" class="detail-close" data-mf-close aria-label="Close">&times;</button><p class="mf-state"><b>Could not load ${cmp ? "these funds" : "this fund"}.</b><br><span class="muted">${esc(e.message)}</span></p>`;
    }
  }

  function closeDetail() {
    state.detail = null;
    const panel = document.getElementById("mf-detail");
    if (panel) { panel.classList.remove("open"); setTimeout(() => panel.remove(), 220); }
    document.body.classList.remove("mf-lock");
  }

  // ---------- sidebar: search, compare, commands ----------
  const $ = (id) => document.getElementById(id);
  const say = (msg, bad = false) => { $("mf-cmd-out").innerHTML = `<span class="${bad ? "neg" : ""}">${esc(msg)}</span>`; };
  const goFund = (code, cat = state.cat, cmp = "") => { location.hash = `funds/${cat}/${code}${cmp ? `/${cmp}` : ""}`; };

  async function runSearch(q) {
    const out = $("mf-search-out");
    if (q.trim().length < 3) { out.innerHTML = '<span class="muted">Type at least 3 characters.</span>'; return []; }
    out.innerHTML = '<span class="muted">Searching…</span>';
    try {
      const { results } = await getJSON(`/api/mf/search?q=${encodeURIComponent(q.trim())}`);
      out.innerHTML = results.length
        ? results.slice(0, 8).map((r) => `<button type="button" class="mf-res" data-mf-open="${r.code}" title="${esc(r.name)}"><span>${esc(r.name)}</span><small>${esc(r.plan)}</small></button>`).join("")
        : '<span class="muted">No funds found.</span>';
      return results;
    } catch (e) {
      out.innerHTML = `<span class="neg">${esc(e.message)}</span>`;
      return [];
    }
  }

  // A fund from the screened lists if the words match, otherwise the best search hit.
  async function resolveFund(name) {
    const words = name.toLowerCase().split(/\s+/).filter(Boolean);
    let best = null;
    for (const [cat, d] of Object.entries(state.data)) {
      for (const f of d?.funds || []) {
        if (words.every((w) => f.name.toLowerCase().includes(w)) && (!best || f.name.length < best.name.length)) best = { code: f.code, cat, name: f.name };
      }
    }
    if (best) return best;
    const { results } = await getJSON(`/api/mf/search?q=${encodeURIComponent(name)}`);
    return results[0] ? { code: results[0].code, cat: state.cat, name: results[0].name } : null;
  }

  async function startRefresh(announce = true) {
    try {
      const r = await getJSON(`/api/mf/refresh?cat=${state.cat}`, { method: "POST" });
      if (announce) say(r.skipped.length ? "This list was refreshed in the last 10 minutes; try again later." : "Refresh started. NAV history is fetched slowly, so it takes a minute or two.");
    } catch (e) {
      if (announce) say(e.message, true);
    }
    load();
  }

  const HELP = "Commands: /top largecap|midcap|smallcap · /fund <name> · /compare <fund A> | <fund B> · /refresh · /help";
  async function runCommand(text) {
    const m = text.trim().match(/^\/?(\w+)\s*(.*)$/);
    if (!m) return say(HELP);
    const [, cmd, arg] = m;
    try {
      switch (cmd.toLowerCase()) {
        case "top": {
          const k = { large: "large", largecap: "large", mid: "mid", midcap: "mid", small: "small", smallcap: "small" }[arg.toLowerCase().replace(/[\s-]/g, "")];
          if (!k) return say("Usage: /top largecap, /top midcap or /top smallcap", true);
          setCat(k);
          return say(`Showing ${CATS.find((c) => c[0] === k)[1]} funds.`);
        }
        case "fund": {
          if (!arg) return say("Usage: /fund <fund name>", true);
          const f = await resolveFund(arg);
          if (!f) return say(`No fund found for "${arg}".`, true);
          say(`Opening ${shortName(f.name)}.`);
          return goFund(f.code, f.cat);
        }
        case "compare": {
          const [x, y] = arg.split(/\s*\|\s*|\s+vs\.?\s+/i);
          if (!x || !y) return say("Usage: /compare <fund A> | <fund B>", true);
          const [a, b] = await Promise.all([resolveFund(x), resolveFund(y)]);
          if (!a || !b) return say(`Could not find ${!a ? `"${x}"` : `"${y}"`}.`, true);
          if (a.code === b.code) return say("Those match the same fund; name two different ones.", true);
          say(`Comparing ${shortName(a.name)} with ${shortName(b.name)}.`);
          return goFund(a.code, a.cat, b.code);
        }
        case "refresh":
          return startRefresh();
        default:
          return say(HELP, cmd.toLowerCase() !== "help");
      }
    } catch (e) {
      say(e.message, true);
    }
  }

  // ---------- events ----------
  root.addEventListener("click", async (e) => {
    const t = e.target;
    const catBtn = t.closest("[data-mf-cat]");
    if (catBtn) return setCat(catBtn.dataset.mfCat);
    if (t.closest("[data-mf-refresh]")) return startRefresh();
    const open = t.closest("[data-mf-open]");
    if (open) return goFund(open.dataset.mfOpen);
    const cardEl = t.closest(".mf-card");
    if (cardEl) {
      location.hash = `funds/${state.cat}/${cardEl.dataset.code}`;
      return;
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
  root.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (e.target.id === "mf-search-form") {
      const results = await runSearch($("mf-search").value);
      if (results.length === 1) goFund(results[0].code);
    } else if (e.target.id === "mf-compare-form") {
      const a = $("mf-cmp-a").value, b = $("mf-cmp-b").value;
      if (!a || !b) return say("Funds are still loading.", true);
      if (a === b) return say("Pick two different funds to compare.", true);
      goFund(a, state.cat, b);
    } else if (e.target.id === "mf-cmd-form") {
      const text = $("mf-cmd").value;
      if (text.trim()) await runCommand(text);
    }
  });

  function route() {
    if (!isActive()) return closeDetail();
    const [, cat, code, cmp] = location.hash.slice(1).split("/");
    const nextCat = CATS.some((c) => c[0] === cat) ? cat : state.cat;
    const catChanged = nextCat !== state.cat;
    state.cat = nextCat;
    if (location.hash.slice(1) === "funds") history.replaceState(null, "", `#funds/${state.cat}`);
    renderAll();
    if (catChanged || !state.data[state.cat] || state.data[state.cat].state !== "ready") load();
    if (code && /^\d+$/.test(code)) openDetail(code, state.cat, cmp && /^\d+$/.test(cmp) ? cmp : null);
    else closeDetail();
  }

  // The detail panel lives on <body>, so its clicks are handled here.
  document.addEventListener("click", (e) => {
    if (e.target.closest("[data-mf-uncompare]") && state.detail) return void goFund(state.detail.code, state.cat);
    if (e.target.closest("[data-mf-close]") && state.detail) location.hash = `funds/${state.cat}`;
    const rangeBtn = e.target.closest("#mf-detail [data-mf-range]");
    if (rangeBtn && state.detail) {
      state.detail.range = rangeBtn.dataset.mfRange;
      document.querySelectorAll("#mf-detail [data-mf-range]").forEach((b) => b.classList.toggle("active", b === rangeBtn));
      drawChart();
    }
  });

  document.addEventListener("change", (e) => {
    if (e.target.id === "mf-d-cmp" && e.target.value && state.detail) goFund(state.detail.code, state.cat, e.target.value);
  });

  document.addEventListener("keydown", (e) => {
    if (!isActive() || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === "Escape" && state.detail) return void (location.hash = `funds/${state.cat}`);
    if (e.target.matches?.("input, textarea, select")) return;
    if (state.detail && !state.detail.cmp && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
      const d = state.data[state.cat];
      if (!d?.funds?.length) return;
      const list = visibleFunds(d);
      const i = list.findIndex((f) => f.code === state.detail.code);
      if (i < 0) return;
      location.hash = `funds/${state.cat}/${list[(i + (e.key === "ArrowRight" ? 1 : -1) + list.length) % list.length].code}`;
    }
  });
  document.addEventListener("keydown", (e) => {
    if ((e.key === "Enter" || e.key === " ") && e.target.classList?.contains("mf-card")) {
      e.preventDefault();
      location.hash = `funds/${state.cat}/${e.target.dataset.code}`;
    }
  });

  document.addEventListener("tabchange", route);
  setInterval(() => isActive() && !document.hidden && state.data[state.cat]?.state === "ready" && load(), 5 * 60 * 1000);
  route();
})();
