// Index returns table — the site's own rendering of every NSE index across
// every return window, with a 52-week sparkline per row.
//
// Deliberately NOT an embedded spreadsheet. The same numbers reach a Google
// Sheet through /api/sheets/indices.csv, but that is a working surface; this
// is the product. Data comes from /api/indices/all (nse-all-indices.js).
//
// Coverage is uneven and shown honestly: NSE publishes 1D/1M/1Y for every
// index, while the longer windows and the sparkline need daily history,
// which Yahoo carries for only a minority of them. Missing cells render as a
// dash, never as a zero.
(function () {
  "use strict";
  const root = document.getElementById("ix-returns");
  if (!root) return;

  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // The windows the table shows, in order. The feed carries more (15D, 9M,
  // 12M, 2Y, 7Y); those stay in the CSV for spreadsheet work rather than
  // crowding a screen.
  const COLS = ["1D", "1W", "1M", "3M", "6M", "YTD", "1Y", "3Y", "5Y", "10Y"];

  // How wide a move has to be before a cell reaches full colour. A 2% day is
  // extreme; 2% over ten years is noise. One flat scale would wash the long
  // columns solid.
  const SATURATE = { "1D": 2, "1W": 4, "1M": 7, "3M": 12, "6M": 18, YTD: 25, "1Y": 25, "3Y": 45, "5Y": 70, "10Y": 120 };

  const FAMILY = [
    [/SECTOR/, "Sector"],
    [/THEMATIC/, "Theme"],
    [/STRATEGY/, "Strategy"],
    [/BROAD/, "Broad"],
    [/DERIVATIVE/, "Derivatives"],
    [/FIXED INCOME/, "Bonds"],
  ];
  const familyOf = (group) => (FAMILY.find(([re]) => re.test(String(group).toUpperCase())) || [, "Other"])[1];

  // NSE sends names shouted ("NIFTY MIDSMALL HEALTHCARE"). Title-casing reads
  // far better in a dense table, but initialisms must survive it — "Nifty It"
  // and "Nifty Psu Bank" would look broken.
  const KEEP_CAPS = new Set(["IT", "PSU", "FMCG", "IPO", "ESG", "MNC", "REITS", "PSE", "CPSE", "EV", "SME", "TR", "PR", "USD", "G-SEC", "MAATR", "FPI", "MQVLV", "SIF", "ETF", "NBFC", "VIX"]);
  function titleCase(name) {
    return String(name).split(/\s+/).map((w) => {
      const up = w.toUpperCase();
      if (KEEP_CAPS.has(up)) return up;
      if (!/[A-Za-z]/.test(w)) return w;           // "50:25:25", "400", "25/50"
      return up.charAt(0) + up.slice(1).toLowerCase();
    }).join(" ");
  }

  const state = { status: "idle", data: null, error: null, sort: "1Y", dir: -1, family: "all", query: "" };

  function pill(v, col) {
    if (v == null) return '<td class="ix-na">&ndash;</td>';
    const cap = SATURATE[col] || 20;
    const t = Math.max(-1, Math.min(1, v / cap));
    // Blue for gains, red for losses, white at zero — the convention this
    // kind of returns grid uses, and distinct from the site's green/red
    // up-down colouring so the two are never confused.
    const a = Math.abs(t) * 0.8;
    const bg = t >= 0 ? `rgba(70,120,190,${a.toFixed(3)})` : `rgba(200,80,60,${a.toFixed(3)})`;
    const sign = v > 0 ? "+" : "";
    return `<td class="ix-num" style="background:${bg}">${sign}${v.toFixed(1)}%</td>`;
  }

  function spark(points) {
    if (!points || points.length < 2) return '<span class="ix-nospark">&ndash;</span>';
    const W = 70, H = 22, pad = 2;
    const lo = Math.min(...points), hi = Math.max(...points);
    const x = (i) => pad + (i / (points.length - 1)) * (W - pad * 2);
    const y = (v) => H - pad - ((v - lo) / (hi - lo || 1)) * (H - pad * 2);
    const d = points.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
    const up = points[points.length - 1] >= points[0];
    const mid = y((hi + lo) / 2);
    return `<svg class="ix-spark" viewBox="0 0 ${W} ${H}" role="img" aria-label="52-week trend">
      <line x1="${pad}" x2="${W - pad}" y1="${mid.toFixed(1)}" y2="${mid.toFixed(1)}" class="ix-spark-mid"/>
      <path d="${d}" class="ix-spark-line"/>
      <circle cx="${x(points.length - 1).toFixed(1)}" cy="${y(points[points.length - 1]).toFixed(1)}" r="2.1" class="ix-spark-dot ${up ? "up" : "down"}"/>
    </svg>`;
  }

  function visibleRows() {
    const q = state.query.trim().toLowerCase();
    let rows = state.data.indices.filter((r) => familyOf(r.group) !== "Bonds");
    if (state.family !== "all") rows = rows.filter((r) => familyOf(r.group) === state.family);
    if (q) rows = rows.filter((r) => r.name.toLowerCase().includes(q));
    const key = state.sort;
    return rows.sort((a, b) => {
      if (key === "name") return a.name.localeCompare(b.name) * state.dir;
      const av = a.periods[key], bv = b.periods[key];
      // Rows with no figure for the sorted column always sink, whichever way
      // the sort runs — otherwise nulls would top a descending sort.
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      return (av - bv) * state.dir;
    });
  }

  function content() {
    if (state.status === "loading") return '<section class="card ix-loading">Loading index returns…</section>';
    if (state.status === "error") {
      return `<section class="card ix-error">Couldn't load index returns (${esc(state.error)}).
        <button type="button" class="k-btn" data-act="retry">Try again</button></section>`;
    }
    const d = state.data;
    if (!d) return "";
    const rows = visibleRows();
    const families = ["all", "Broad", "Sector", "Theme", "Strategy", "Derivatives"];
    const arrow = (k) => (state.sort === k ? `<i class="ix-arrow">${state.dir === -1 ? "▾" : "▴"}</i>` : "");

    return `
      <section class="card ix-wrap">
        <div class="ix-top">
          <div>
            <div class="section-title">INDEX RETURNS <span class="muted">· ${rows.length} of ${d.count}</span></div>
            <p class="k-p muted ix-sub">Every NSE index, across every window. Longer periods and the 52-week line need daily history, which exists for ${d.coverage ? d.coverage.covered.length : 0} of them — the rest show a dash rather than a guess.</p>
          </div>
          <label class="k-search ix-search">
            <input id="ix-q" type="text" placeholder="Search an index…" spellcheck="false" aria-label="Search indices" value="${esc(state.query)}" />
          </label>
        </div>
        <div class="k-seg ix-fam" role="tablist" aria-label="Index family">
          ${families.map((f) => `<button type="button" role="tab" class="${f === state.family ? "active" : ""}" aria-selected="${f === state.family}" data-fam="${f}">${f === "all" ? "All" : f}</button>`).join("")}
        </div>
        <div class="ix-scroll">
          <table class="ix-table">
            <thead><tr>
              <th class="ix-th-name" data-sort="name">Index ${arrow("name")}</th>
              <th class="ix-th-spark">52 weeks</th>
              <th class="ix-th-fam">Family</th>
              ${COLS.map((c) => `<th class="ix-th-num" data-sort="${c}">${c} ${arrow(c)}</th>`).join("")}
            </tr></thead>
            <tbody>
              ${rows.map((r) => `<tr>
                <td class="ix-name" title="${esc(r.name)}">${esc(titleCase(r.name))}</td>
                <td class="ix-sparkcell">${spark(r.spark)}</td>
                <td class="ix-fam-cell">${familyOf(r.group)}</td>
                ${COLS.map((c) => pill(r.periods[c], c)).join("")}
              </tr>`).join("")}
            </tbody>
          </table>
        </div>
        <p class="k-p muted ix-foot">Live from NSE${d.asOf ? " · " + esc(d.asOf) : ""}. Long-window figures and sparklines computed from daily history (Yahoo Finance). Not investment advice.</p>
      </section>`;
  }

  function render() {
    const focused = document.activeElement && document.activeElement.id === "ix-q";
    const caret = focused ? document.activeElement.selectionStart : null;
    root.innerHTML = content();
    if (focused) {
      const el = document.getElementById("ix-q");
      if (el) { el.focus(); try { el.setSelectionRange(caret, caret); } catch {} }
    }
  }

  async function load() {
    state.status = "loading";
    render();
    try {
      const res = await fetch("/api/indices/all");
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
    const fam = e.target.closest("[data-fam]");
    if (fam) { state.family = fam.dataset.fam; return render(); }
    const th = e.target.closest("[data-sort]");
    if (th) {
      const k = th.dataset.sort;
      if (state.sort === k) state.dir = -state.dir;
      else { state.sort = k; state.dir = k === "name" ? 1 : -1; }
      return render();
    }
    if (e.target.closest("[data-act=retry]")) return load();
  });

  root.addEventListener("input", (e) => {
    if (e.target.id === "ix-q") { state.query = e.target.value; render(); }
  });

  const isActive = () => document.querySelector("#tabs .tab.active")?.dataset.tab === "indices";

  function route() {
    if (!isActive()) return;
    if (!state.data && state.status !== "loading") load();
  }

  document.addEventListener("tabchange", route);
  route();
})();
