// The Memo tab: trend & momentum, computed from this app's own data.
// Replaces the earlier "short editorial notes" version of this tab (see
// README's "The Memo" section for that history) with a real dashboard in
// the spirit of the kind of page tipsheet.markets publishes — a 0-100
// trend score, an uptrend/downtrend state, and today's reading shown
// against its own percentile history — but sourced from this app's own
// pipeline (Yahoo Finance, via /api/trend/in/:slug -> trend-india.js) and
// computed with this app's own (simpler, disclosed) method, not copied
// from tipsheet's numbers or methodology.
(function () {
  "use strict";
  const root = document.getElementById("mo-root");
  if (!root) return;

  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmtDate = (iso) => new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  const fmtPct = (v, d = 1) => (v == null ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(d)}%`);

  const MARKETS = [
    { slug: "nifty-50", label: "Nifty 50" },
    { slug: "nifty-bank", label: "Nifty Bank" },
    { slug: "sensex", label: "BSE Sensex" },
  ];

  const state = { slug: "nifty-50", data: null, status: "idle", error: null };
  const cache = new Map(); // slug -> data

  function marketTabs() {
    return `<div class="k-seg tr-switch" role="tablist" aria-label="Market">
      ${MARKETS.map((m) => `<button type="button" role="tab" class="${m.slug === state.slug ? "active" : ""}" aria-selected="${m.slug === state.slug}" data-market="${m.slug}">${esc(m.label)}</button>`).join("")}
    </div>`;
  }

  // A horizontal "usual range" bar: a shaded band from the 25th to 75th
  // percentile of the market's own history, a marker for today's reading,
  // against the full min-max span — the same device tipsheet.markets uses
  // for "is this reading usual, or not," reimplemented against this app's
  // own numbers.
  function rangeBar(value, range, fmt) {
    if (value == null || range.min == null || range.max == null) return `<div class="tr-range muted">Not enough history yet to show a usual range.</div>`;
    const W = 100;
    const scale = (v) => range.max === range.min ? 50 : ((v - range.min) / (range.max - range.min)) * W;
    const bandX = scale(range.p25), bandW = Math.max(0, scale(range.p75) - scale(range.p25));
    const markerX = Math.min(W, Math.max(0, scale(value)));
    return `<div class="tr-range">
      <svg viewBox="0 0 100 14" preserveAspectRatio="none" class="tr-range-svg">
        <rect x="0" y="5" width="100" height="4" rx="2" class="tr-range-track"/>
        <rect x="${bandX.toFixed(1)}" y="5" width="${bandW.toFixed(1)}" height="4" rx="2" class="tr-range-band"/>
        <circle cx="${markerX.toFixed(1)}" cy="7" r="3.2" class="tr-range-dot"/>
      </svg>
      <div class="tr-range-labels"><span>${fmt(range.min)}</span><span class="tr-range-now">${fmt(value)} today</span><span>${fmt(range.max)}</span></div>
    </div>`;
  }

  function priceChart(points) {
    if (!points.length) return "";
    const W = 640, H = 220, m = { l: 48, r: 12, t: 10, b: 24 };
    const closes = points.map((p) => p.close);
    const lo0 = Math.min(...closes), hi0 = Math.max(...closes);
    const pad = (hi0 - lo0) * 0.06 || 1;
    const lo = lo0 - pad, hi = hi0 + pad;
    const t0 = points[0].t, t1 = points.at(-1).t;
    const x = (t) => m.l + ((t - t0) / (t1 - t0 || 1)) * (W - m.l - m.r);
    const y = (v) => H - m.b - ((v - lo) / (hi - lo || 1)) * (H - m.t - m.b);
    const line = points.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(p.close).toFixed(1)}`).join("");
    const yTicks = Array.from({ length: 4 }, (_, i) => lo + ((hi - lo) * i) / 3);
    const xTicks = [points[0], points[Math.floor(points.length / 2)], points.at(-1)];
    return `<svg class="tr-chart-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Price history">
      ${yTicks.map((v) => `<line x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}" class="tr-grid"/><text x="${m.l - 6}" y="${y(v) + 4}" class="tr-axis" text-anchor="end">${v.toFixed(0)}</text>`).join("")}
      ${xTicks.map((p, i) => `<text x="${x(p.t)}" y="${H - 6}" class="tr-axis" text-anchor="${i === 0 ? "start" : i === 2 ? "end" : "middle"}">${new Date(p.t * 1000).toLocaleDateString("en-IN", { month: "short", year: "2-digit" })}</text>`).join("")}
      <path d="${line}" fill="none" class="tr-line"/>
    </svg>`;
  }

  function stateLabel(st) {
    if (st === "up") return { text: "Uptrend", cls: "up" };
    if (st === "down") return { text: "Downtrend", cls: "down" };
    return { text: "Not yet established", cls: "flat" };
  }

  function content() {
    if (state.status === "loading") return `${marketTabs()}<div class="card tr-loading">Loading trend history…</div>`;
    if (state.status === "error") return `${marketTabs()}<div class="card tr-error">Couldn't load this market's trend right now (${esc(state.error)}). <button type="button" class="k-btn" data-act="retry">Try again</button></div>`;
    const d = state.data;
    if (!d) return marketTabs();

    const st = stateLabel(d.latest.state);
    const RETURNS = [["1M", "1 month"], ["3M", "3 months"], ["6M", "6 months"], ["1Y", "1 year"]];

    return `
      ${marketTabs()}
      <section class="card tr-hero">
        <div class="tr-hero-top">
          <span class="eyebrow">${esc(d.label)} &middot; data to ${fmtDate(d.asOf)}</span>
          <span class="k-chip ${st.cls === "up" ? "up" : st.cls === "down" ? "down" : "flat"}">${st.text}${d.latest.stateSince ? " since " + fmtDate(d.latest.stateSince) : ""}</span>
        </div>
        <div class="tr-score-row">
          <div class="tr-score-num">${d.latest.score == null ? "—" : d.latest.score}<span class="tr-score-max">/100</span></div>
          <div class="tr-score-sub">
            <p class="k-p">Trend score: the share of 8 signals (price vs. its 20/50/100/200-day average, and vs. its close that many sessions ago) pointing up.</p>
            ${d.latest.scorePercentile != null ? `<p class="k-p muted">Higher than ${d.latest.scorePercentile}% of this market's own history since ${fmtDate(d.since)}.</p>` : ""}
          </div>
        </div>
        ${rangeBar(d.latest.score, d.usualRange.score, (v) => v.toFixed(0))}
      </section>

      <section class="card tr-chart-card">
        <div class="section-title">PRICE HISTORY <span class="muted">· ${fmtDate(d.since)} to ${fmtDate(d.asOf)}</span></div>
        ${priceChart(d.chart)}
      </section>

      <section class="card">
        <div class="section-title">HOW FAR BELOW ITS HIGH <span class="muted">·</span></div>
        <p class="k-p">${d.latest.offHigh == null ? "Not enough history yet." : d.latest.offHigh === 0 ? "At a new high today." : `${Math.abs(d.latest.offHigh).toFixed(1)}% below its highest close so far.`}</p>
        ${rangeBar(d.latest.offHigh, d.usualRange.offHigh, (v) => `${v.toFixed(0)}%`)}
      </section>

      <section class="card">
        <div class="section-title">RETURNS <span class="muted">·</span></div>
        <table class="tr-returns">
          <thead><tr>${RETURNS.map(([, lbl]) => `<th>${lbl}</th>`).join("")}</tr></thead>
          <tbody><tr>${RETURNS.map(([k]) => `<td class="${d.returns[k] > 0 ? "up" : d.returns[k] < 0 ? "down" : ""}">${fmtPct(d.returns[k])}</td>`).join("")}</tr></tbody>
        </table>
      </section>

      <section class="card tr-method muted">
        <p class="k-p">Computed from ${d.bars.toLocaleString("en-IN")} daily closes (Yahoo Finance), ${fmtDate(d.since)} to today — shorter than the 20+ years a site like tipsheet.markets draws on, and a simpler 8-signal score rather than their 24. Not investment advice.</p>
      </section>`;
  }

  function render() {
    root.innerHTML = content();
  }

  async function load(slug) {
    state.slug = slug;
    if (cache.has(slug)) {
      state.data = cache.get(slug);
      state.status = "ready";
      render();
      return;
    }
    state.status = "loading";
    state.data = null;
    render();
    try {
      const res = await fetch(`/api/trend/in/${encodeURIComponent(slug)}`);
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error((json && json.message) || `server responded ${res.status}`);
      cache.set(slug, json);
      state.data = json;
      state.status = "ready";
    } catch (e) {
      state.status = "error";
      state.error = e.message;
    }
    if (isActive()) render();
  }

  root.addEventListener("click", (e) => {
    const marketBtn = e.target.closest("[data-market]");
    if (marketBtn) return load(marketBtn.dataset.market);
    if (e.target.closest("[data-act=retry]")) return load(state.slug);
  });

  const isActive = () => document.querySelector("#tabs .tab.active")?.dataset.tab === "memo";

  function route() {
    if (!isActive()) return;
    if (!state.data && state.status !== "loading") load(state.slug);
    else render();
  }

  document.addEventListener("tabchange", route);
  route();
})();
