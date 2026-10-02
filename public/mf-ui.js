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
      ${sip ? `<p class="mf-d-note">A &#8377;10,000 monthly SIP over the last ${sip.months} months would have put in <b>&#8377;${inr(sip.invested * 10000)}</b> and be worth about <b>&#8377;${inr(sip.value * 10000)}</b> now.</p>` : ""}
      ${dd ? `<p class="mf-d-note">Worst fall (5Y window): <b class="neg">${pct(dd.pct, 1)}</b>, from the peak on ${dmy(dd.peak)} to the low on ${dmy(dd.trough)}.</p>` : ""}

      <h4 class="mf-d-h">Calendar-year returns</h4>
      ${calendarHtml(p)}
      <p class="mf-d-fine muted">${p.inUniverse ? "" : "This fund is not in the screened list, so its percentiles are measured against the screened funds. "}Alpha is this fund's 3Y CAGR minus the peer average; consistency is the share of rolling 1-year windows it beat the peer average. Source: NAV history from mfapi.in. Past performance does not predict future returns; this is not investment advice.</p>`;
  }

  function drawChart() {
    const host = document.getElementById("mf-chart");
    const d = state.detail;
    const p = state.funds[d.code];
    if (!host || !p) return;
    const list = [{ key: "fund", name: shortName(p.fund.name), color: COLORS.fund, pts: fundPts(p) }, { key: "peer", name: "Peer average", color: COLORS.peer, pts: peerPts(p) }];
    if (!list[0].pts.length) { host.innerHTML = '<div class="muted">No chart data.</div>'; return; }
    const series = windowed(list, d.range);
    const { svg, geo } = chartSvg(series);
    host.innerHTML = `${svg}<div class="mf-tip" style="display:none"></div>`;
    wireChart(host, series, geo);
    document.getElementById("mf-legend").innerHTML = series.map((s) => `<span><i style="background:${s.color}"></i>${esc(s.name)} <b>${(s.pts.at(-1)[1] - 100 >= 0 ? "+" : "") + (s.pts.at(-1)[1] - 100).toFixed(1)}%</b></span>`).join("");
  }

  async function openDetail(code, cat) {
    const prevRange = state.detail?.range;
    state.detail = { code, cat, range: prevRange || "5Y" };
    let panel = document.getElementById("mf-detail");
    if (!panel) {
      panel = document.createElement("div");
      panel.id = "mf-detail";
      panel.className = "mf-detail";
      document.body.appendChild(panel);
    }
    panel.innerHTML = `<div class="mf-d-backdrop" data-mf-close></div><div class="mf-d-panel" role="dialog" aria-modal="true" aria-label="Fund details"><div class="mf-d-body"><div class="ticker-loading">Loading fund…</div></div></div>`;
    requestAnimationFrame(() => panel.classList.add("open"));
    document.body.classList.add("mf-lock");
    try {
      const p = await fetchFund(code, cat);
      if (state.detail?.code !== code) return;
      panel.querySelector(".mf-d-body").innerHTML = detailHtml(p);
      drawChart();
    } catch (e) {
      panel.querySelector(".mf-d-body").innerHTML = `<button type="button" class="detail-close" data-mf-close aria-label="Close">&times;</button><p class="mf-state"><b>Could not load this fund.</b><br><span class="muted">${esc(e.message)}</span></p>`;
    }
  }

  function closeDetail() {
    state.detail = null;
    const panel = document.getElementById("mf-detail");
    if (panel) { panel.classList.remove("open"); setTimeout(() => panel.remove(), 220); }
    document.body.classList.remove("mf-lock");
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

  function route() {
    if (!isActive()) return closeDetail();
    const [, cat, code] = location.hash.slice(1).split("/");
    state.cat = CATS.some((c) => c[0] === cat) ? cat : state.cat;
    if (location.hash.slice(1) === "funds") history.replaceState(null, "", `#funds/${state.cat}`);
    render();
    load();
    code && /^\d+$/.test(code) ? openDetail(code, state.cat) : closeDetail();
  }

  // The detail panel lives on <body>, so its clicks are handled here.
  document.addEventListener("click", (e) => {
    if (e.target.closest("[data-mf-close]") && state.detail) location.hash = `funds/${state.cat}`;
    const rangeBtn = e.target.closest("#mf-detail [data-mf-range]");
    if (rangeBtn && state.detail) {
      state.detail.range = rangeBtn.dataset.mfRange;
      document.querySelectorAll("#mf-detail [data-mf-range]").forEach((b) => b.classList.toggle("active", b === rangeBtn));
      drawChart();
    }
  });

  document.addEventListener("keydown", (e) => {
    if (!isActive() || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === "Escape" && state.detail) return void (location.hash = `funds/${state.cat}`);
    if (e.target.matches?.("input, textarea, select")) return;
    if (state.detail && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
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
