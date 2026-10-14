// Fear & Greed tab: one composite 0-100 reading built in the spirit of the
// "fear & greed" style page tipsheet.markets publishes — a big score + word
// label, a 0-100 scale with five zones, a week/month/year-ago comparison, a
// component breakdown table, and score-history charts — but computed
// independently from this app's own data (/api/fear-greed/in ->
// fear-greed-india.js), with its own disclosed four-signal method, not
// copied from their numbers or their undisclosed model. The site's top
// ticker strip is a separate, unrelated feature and isn't touched here.
(function () {
  "use strict";
  const root = document.getElementById("fg-root");
  if (!root) return;

  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmtDate = (iso) => new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  const fmtSigned = (v, d = 1, suffix = "%") => (v == null ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(d)}${suffix}`);
  const zoneCls = (zone) => {
    if (zone === "Extreme Fear" || zone === "Fear") return "down";
    if (zone === "Extreme Greed" || zone === "Greed") return "up";
    return "flat";
  };

  const ZONES = [
    { key: "fear2", label: "Extreme Fear", from: 0, to: 20 },
    { key: "fear1", label: "Fear", from: 20, to: 40 },
    { key: "neutral", label: "Neutral", from: 40, to: 60 },
    { key: "greed1", label: "Greed", from: 60, to: 80 },
    { key: "greed2", label: "Extreme Greed", from: 80, to: 100 },
  ];

  const state = { status: "idle", data: null, error: null };

  function gauge(score) {
    const pos = score == null ? 50 : Math.min(100, Math.max(0, score));
    return `<div class="fg-gauge">
      <div class="fg-gauge-track">
        ${ZONES.map((z) => `<div class="fg-gauge-seg fg-${z.key}" style="flex:${z.to - z.from}"></div>`).join("")}
        ${score != null ? `<div class="fg-gauge-marker" style="left:${pos}%"></div>` : ""}
      </div>
      <div class="fg-gauge-labels">${ZONES.map((z) => `<span>${esc(z.label)}</span>`).join("")}</div>
      <div class="fg-gauge-scale"><span>0</span><span>100</span></div>
    </div>`;
  }

  // Fixed 0-100 y-domain line chart (unlike trend-ui.js's priceChart, whose
  // y-domain fits the data) with shaded bands for the two extreme zones, so
  // the chart reads on the same scale as the gauge above it.
  function scoreChart(points, { months = true } = {}) {
    if (!points.length) return "";
    const W = 640, H = 220, m = { l: 34, r: 12, t: 10, b: 24 };
    const t0 = points[0].t, t1 = points.at(-1).t;
    const x = (t) => m.l + ((t - t0) / (t1 - t0 || 1)) * (W - m.l - m.r);
    const y = (v) => H - m.b - (v / 100) * (H - m.t - m.b);
    const line = points.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(p.score).toFixed(1)}`).join("");
    const yTicks = [0, 20, 40, 60, 80, 100];
    const xTicks = [points[0], points[Math.floor(points.length / 2)], points.at(-1)];
    const dfmt = months ? { month: "short", year: "2-digit" } : { day: "2-digit", month: "short" };
    return `<svg class="fg-chart-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Fear and greed score history">
      <rect x="${m.l}" width="${W - m.l - m.r}" y="${y(100)}" height="${y(80) - y(100)}" class="fg-band fg-band-greed"/>
      <rect x="${m.l}" width="${W - m.l - m.r}" y="${y(20)}" height="${y(0) - y(20)}" class="fg-band fg-band-fear"/>
      ${yTicks.map((v) => `<line x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}" class="tr-grid"/><text x="${m.l - 6}" y="${y(v) + 4}" class="tr-axis" text-anchor="end">${v}</text>`).join("")}
      ${xTicks.map((p, i) => `<text x="${x(p.t)}" y="${H - 6}" class="tr-axis" text-anchor="${i === 0 ? "start" : i === 2 ? "end" : "middle"}">${new Date(p.t * 1000).toLocaleDateString("en-IN", dfmt)}</text>`).join("")}
      <path d="${line}" fill="none" class="fg-line"/>
    </svg>`;
  }

  function content() {
    if (state.status === "loading") return `<div class="card fg-loading">Loading today's reading…</div>`;
    if (state.status === "error") return `<div class="card fg-error">Couldn't load the Fear &amp; Greed Index right now (${esc(state.error)}). <button type="button" class="k-btn" data-act="retry">Try again</button></div>`;
    const d = state.data;
    if (!d) return "";

    const zone = d.latest.zone;
    const cmps = [d.comparisons.week, d.comparisons.month, d.comparisons.year];

    return `
      <section class="card fg-hero">
        <div class="fg-hero-top">
          <span class="eyebrow">India Fear &amp; Greed Index &middot; data to ${fmtDate(d.asOf)}</span>
        </div>
        <div class="fg-score-row">
          <div class="fg-score-num ${zoneCls(zone)}">${d.latest.score == null ? "—" : d.latest.score}<span class="fg-score-max">/100</span></div>
          <div class="fg-score-sub">
            <span class="k-chip ${zoneCls(zone)}">${esc(zone || "Not enough history")}</span>
            <p class="k-p">The average of four signals (below), each ranked against its own history since ${fmtDate(d.since)}.</p>
          </div>
        </div>
        ${gauge(d.latest.score)}
        <div class="fg-compare">
          ${cmps.map((c) => `<div class="fg-compare-item"><span class="fg-compare-label">${esc(c.label)}</span><span class="fg-compare-val ${zoneCls(c.zone)}">${c.score == null ? "—" : c.score}</span><span class="fg-compare-zone">${esc(c.zone || "")}</span></div>`).join("")}
        </div>
      </section>

      <section class="card fg-components">
        <div class="section-title">WHAT'S DRIVING IT <span class="muted">· today</span></div>
        <table class="fg-table">
          <thead><tr><th>Signal</th><th>Today</th><th>Percentile</th><th>Of 100 points</th></tr></thead>
          <tbody>
            ${d.components.map((c) => `<tr>
              <td><span class="fg-sig-name">${esc(c.label)}</span><span class="fg-sig-desc">${esc(c.description)}</span></td>
              <td class="fg-sig-val">${c.value == null ? "—" : fmtSigned(c.value)}</td>
              <td class="fg-sig-val">${c.percentile == null ? "—" : c.percentile + "th"}</td>
              <td class="fg-sig-val">${c.contribution == null ? "—" : c.contribution}</td>
            </tr>`).join("")}
          </tbody>
        </table>
      </section>

      <section class="card fg-chart-card">
        <div class="section-title">SCORE HISTORY <span class="muted">· ${fmtDate(d.since)} to ${fmtDate(d.asOf)}</span></div>
        ${scoreChart(d.chartLong)}
      </section>

      <section class="card fg-chart-card">
        <div class="section-title">LAST TWO YEARS <span class="muted">·</span></div>
        ${scoreChart(d.chartRecent, { months: true })}
      </section>

      <section class="card fg-method muted">
        <p class="k-p">Computed from ${d.bars.toLocaleString("en-IN")} daily closes of the Nifty 50 and a gold ETF (GOLDBEES.NS), both from Yahoo Finance. Four signals — momentum vs. the 125-day average, 21-day realised volatility (a rough stand-in for India VIX), one-month equities-vs-gold return, and distance from the highest close to date — each ranked as a percentile against its own history, then averaged. A simpler, disclosed method, built independently of tipsheet.markets' own (undisclosed) model — not investment advice.</p>
      </section>`;
  }

  function render() {
    root.innerHTML = content();
  }

  async function load() {
    state.status = "loading";
    state.data = null;
    render();
    try {
      const res = await fetch("/api/fear-greed/in");
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error((json && json.message) || `server responded ${res.status}`);
      state.data = json;
      state.status = "ready";
    } catch (e) {
      state.status = "error";
      state.error = e.message;
    }
    if (isActive()) render();
  }

  root.addEventListener("click", (e) => {
    if (e.target.closest("[data-act=retry]")) return load();
  });

  const isActive = () => document.querySelector("#tabs .tab.active")?.dataset.tab === "feargreed";

  function route() {
    if (!isActive()) return;
    if (!state.data && state.status !== "loading") load();
    else render();
  }

  document.addEventListener("tabchange", route);
  route();
})();
