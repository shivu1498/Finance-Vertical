// Universe tab: every market the dashboard tracks, grouped by region, with a
// coverage table (market, exchange, currency, companies, index, annual reports)
// and a Browse view per market. India browses the full NSE/BSE company list
// (companies.json) grouped by industry; every other market browses its tracked
// basket grouped by sector. The Annual Reports lookup lives under the second
// switch (filings-ui.js).
(function () {
  const root = document.getElementById("ur-root");
  const reportsBox = document.getElementById("ur-reports");
  const sw = document.getElementById("ur-switch");
  if (!root || !reportsBox || !sw || typeof COUNTRIES === "undefined") return;

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmt = (n) => Number(n).toLocaleString("en-US");
  const isActive = () => document.querySelector("#tabs .tab.active")?.dataset.tab === "universe";

  const META = {
    IN: { region: "Asia-Pacific", cur: "INR", reports: "NSE feed (recent)", lvl: "partial" },
    US: { region: "Americas", cur: "USD", reports: "SEC EDGAR (full)", lvl: "full" },
    GB: { region: "Europe", cur: "GBP" },
    DE: { region: "Europe", cur: "EUR" },
    FR: { region: "Europe", cur: "EUR" },
    JP: { region: "Asia-Pacific", cur: "JPY" },
    HK: { region: "Asia-Pacific", cur: "HKD" },
    CN: { region: "Asia-Pacific", cur: "CNY" },
    CA: { region: "Americas", cur: "CAD" },
    AU: { region: "Asia-Pacific", cur: "AUD" },
    SG: { region: "Asia-Pacific", cur: "SGD" },
    KR: { region: "Asia-Pacific", cur: "KRW" },
    BR: { region: "Americas", cur: "BRL" },
    CH: { region: "Europe", cur: "CHF" },
  };
  const REGIONS = ["Asia-Pacific", "Americas", "Europe"];

  // Yahoo suffix -> TradingView exchange prefix, for the Chart links.
  const TV = { L: "LSE", DE: "XETR", PA: "EURONEXT", T: "TSE", HK: "HKEX", SS: "SSE", SZ: "SZSE", TO: "TSX", AX: "ASX", SI: "SGX", KS: "KRX", SA: "BMFBOVESPA", SW: "SIX" };
  function chartSymbol(sym) {
    const m = /^(.+)\.([A-Z]+)$/.exec(sym);
    if (m && TV[m[2]]) return `${TV[m[2]]}:${m[1]}`;
    return sym;
  }

  const state = {
    view: "markets",
    region: "All",
    sort: "name",
    market: null,        // null = coverage table, else a country code
    group: "",           // sector / industry-group filter inside Browse
    q: "",
    shown: 100,
  };

  /* ---------- India universe (companies.json) ---------- */
  const dir = { status: "idle", rows: [], groups: [] };
  async function loadDir() {
    if (dir.status !== "idle") return;
    dir.status = "loading";
    try {
      const res = await fetch("companies.json");
      if (!res.ok) throw new Error(String(res.status));
      const d = await res.json();
      const counts = new Map();
      for (const [name, nse, bse, isin, ind] of d.rows) {
        const [industry, g] = d.industries[ind] || ["Unclassified", -1];
        const group = d.groups[g] || "Unclassified";
        dir.rows.push({ name, nse, bse, group, industry, code: nse || bse, hay: `${name} ${nse} ${bse}`.toLowerCase() });
        counts.set(group, (counts.get(group) || 0) + 1);
      }
      dir.groups = [...counts].sort((a, b) => b[1] - a[1]);
      dir.industryCount = d.industries.length;
      dir.status = "ready";
    } catch {
      dir.status = "error";
    }
    render();
  }

  function trackedCount(c) { return c.stocks.length; }
  function listedIndia() { return dir.status === "ready" ? dir.rows.length : null; }

  /* ---------- markets view ---------- */
  function statsHtml() {
    const tracked = COUNTRIES.reduce((n, c) => n + trackedCount(c), 0);
    const listed = listedIndia();
    const companies = listed != null ? tracked - trackedCount(COUNTRIES[0]) + listed : tracked;
    const cell = (v, l) => `<div class="ur-stat"><b>${v}</b><span>${l}</span></div>`;
    return `<div class="ur-stats">
      ${cell(COUNTRIES.length, "Markets")}
      ${cell(fmt(companies), "Companies")}
      ${cell(dir.status === "ready" ? dir.groups.length : "—", "India industry groups")}
      ${cell(2, "Report sources")}
    </div>`;
  }

  function rowsFor() {
    let list = COUNTRIES.slice();
    if (state.region !== "All") list = list.filter((c) => META[c.code].region === state.region);
    const cnt = (c) => (c.code === "IN" && listedIndia() != null ? listedIndia() : trackedCount(c));
    if (state.sort === "name") list.sort((a, b) => a.name.localeCompare(b.name));
    else if (state.sort === "companies") list.sort((a, b) => cnt(b) - cnt(a));
    return list;
  }

  function coverageRow(c) {
    const m = META[c.code];
    const listed = c.code === "IN" ? listedIndia() : null;
    const comp = listed != null
      ? `${fmt(listed)}<small>${trackedCount(c)} on the heatmap</small>`
      : `${trackedCount(c)}<small>tracked basket</small>`;
    const rep = m.reports
      ? `<span class="ur-badge ${m.lvl}">${esc(m.reports)}</span>`
      : `<span class="ur-badge none">Not available</span>`;
    return `<tr>
      <td><span class="ur-mkt"><span class="ur-flag">${c.flag}</span><span><b>${esc(c.name)}</b><small>${c.code}</small></span></span></td>
      <td class="ur-dim">${esc(c.exchange)}</td>
      <td class="ur-cur">${m.cur}</td>
      <td class="ur-num">${comp}</td>
      <td class="ur-dim">${esc(c.indexLabel)}</td>
      <td>${rep}</td>
      <td class="ur-act"><button type="button" class="ur-browse" data-market="${c.code}">Browse</button></td>
    </tr>`;
  }

  function marketsHtml() {
    const chips = ["All", ...REGIONS]
      .map((r) => {
        const n = r === "All" ? COUNTRIES.length : COUNTRIES.filter((c) => META[c.code].region === r).length;
        return `<button type="button" class="ur-chip ${state.region === r ? "active" : ""}" data-region="${r}">${r} <i>${n}</i></button>`;
      })
      .join("");
    const list = rowsFor();
    return `
      ${statsHtml()}
      <div class="ur-note"><b>Data quality.</b> India lists the full NSE/BSE company universe with the official industry classification. Every other market shows a tracked basket of its largest listings. Annual reports are available for the US (SEC EDGAR, complete) and India (NSE feed, recent filings only). Other exchanges restrict automated access to filings.</div>
      <section class="card">
        <div class="section-title"><span>MARKET COVERAGE <span class="muted">· click a market to browse companies</span></span>
          <select id="ur-sort" class="sector-filter" aria-label="Sort markets">
            <option value="name" ${state.sort === "name" ? "selected" : ""}>Sort: name</option>
            <option value="companies" ${state.sort === "companies" ? "selected" : ""}>Sort: most companies</option>
            <option value="region" ${state.sort === "region" ? "selected" : ""}>Sort: default</option>
          </select>
        </div>
        <div class="ur-chips">${chips}</div>
        <div class="ur-scroll">
          <table class="ur-table">
            <thead><tr><th>Market</th><th>Exchange</th><th>Currency</th><th class="ur-num">Companies</th><th>Index</th><th>Annual reports</th><th></th></tr></thead>
            <tbody>${list.map(coverageRow).join("")}</tbody>
          </table>
        </div>
      </section>`;
  }

  /* ---------- browse view ---------- */
  function browseData(c) {
    if (c.code === "IN" && dir.status === "ready") {
      return {
        groups: dir.groups,
        rows: dir.rows.map((r) => ({ name: r.name, code: r.code, sub: r.industry, group: r.group, hay: r.hay, chart: r.nse ? `NSE:${r.nse.replace(/[&-]/g, "_")}` : `BSE:${r.bse}`, extra: r.bse && r.nse ? `BSE ${r.bse}` : "" })),
        label: "Industry group",
      };
    }
    const counts = new Map();
    const rows = c.stocks.map((s) => {
      counts.set(s.sector, (counts.get(s.sector) || 0) + 1);
      return { name: s.name, code: s.symbol.replace(/\.[A-Z]+$/, ""), sub: s.sector, group: s.sector, hay: `${s.name} ${s.symbol}`.toLowerCase(), chart: chartSymbol(s.symbol), extra: "" };
    });
    return { groups: [...counts].sort((a, b) => b[1] - a[1]), rows, label: "Sector" };
  }

  function browseHtml(c) {
    const m = META[c.code];
    if (c.code === "IN" && dir.status === "loading") return `<section class="card"><p class="f-empty">Loading the NSE/BSE company list…</p></section>`;
    if (c.code === "IN" && dir.status === "error") return `<section class="card"><p class="f-error">Couldn't load companies.json.</p></section>`;
    const d = browseData(c);
    const q = state.q.trim().toLowerCase();
    let rows = d.rows;
    if (state.group) rows = rows.filter((r) => r.group === state.group);
    if (q) rows = rows.filter((r) => r.hay.includes(q));
    const total = rows.length;
    const page = rows.slice(0, state.shown);
    const chips = [`<button type="button" class="ur-chip ${state.group ? "" : "active"}" data-group="">All <i>${d.rows.length}</i></button>`]
      .concat(d.groups.map(([g, n]) => `<button type="button" class="ur-chip ${state.group === g ? "active" : ""}" data-group="${esc(g)}">${esc(g)} <i>${n}</i></button>`))
      .join("");
    const trs = page.map((r) => `<tr>
      <td><b>${esc(r.name)}</b></td>
      <td class="ur-dim"><span class="ur-tk">${esc(r.code)}</span>${r.extra ? ` <small>${esc(r.extra)}</small>` : ""}</td>
      <td class="ur-dim">${esc(r.sub)}</td>
      <td class="ur-act"><a class="kc-src" href="#chart/${encodeURIComponent(r.chart)}">Chart</a></td>
    </tr>`).join("");
    const reportsBtn = m.reports ? `<button type="button" class="ur-browse ghost" data-reports="${c.code}">Annual reports →</button>` : "";
    return `
      <section class="card">
        <div class="section-title">
          <span><button type="button" class="ur-back" id="ur-back">← All markets</button></span>
          ${reportsBtn}
        </div>
        <div class="ur-bhead">
          <span class="ur-flag big">${c.flag}</span>
          <div><h3>${esc(c.name)}</h3><p>${esc(c.exchange)} · ${m.cur} · ${esc(c.indexLabel)} · ${fmt(d.rows.length)} companies${c.code === "IN" ? " (full NSE/BSE list)" : " (tracked basket)"}</p></div>
        </div>
        <div class="ur-find"><input id="ur-q" type="search" placeholder="Search ${esc(c.name)} companies by name or ticker…" value="${esc(state.q)}" autocomplete="off"></div>
        <div class="ur-subhead">${esc(d.label)}</div>
        <div class="ur-chips ur-chips-wrap">${chips}</div>
        <div class="ur-scroll">
          <table class="ur-table">
            <thead><tr><th>Company</th><th>Ticker</th><th>${c.code === "IN" ? "Industry" : "Sector"}</th><th></th></tr></thead>
            <tbody>${trs || `<tr><td colspan="4" class="f-empty">No companies match.</td></tr>`}</tbody>
          </table>
        </div>
        <div class="ur-foot">Showing ${fmt(page.length)} of ${fmt(total)}${total > page.length ? ` <button type="button" class="ur-browse ghost" id="ur-more">Show more</button>` : ""}</div>
      </section>`;
  }

  /* ---------- render + events ---------- */
  function render() {
    if (state.view === "reports") return;
    const c = state.market ? COUNTRIES.find((x) => x.code === state.market) : null;
    const focus = document.activeElement && document.activeElement.id === "ur-q";
    root.innerHTML = c ? browseHtml(c) : marketsHtml();
    if (focus) {
      const el = document.getElementById("ur-q");
      if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
    }
  }

  function setView(v) {
    state.view = v;
    sw.querySelectorAll("button").forEach((b) => {
      const on = b.dataset.ur === v;
      b.classList.toggle("active", on);
      b.setAttribute("aria-selected", String(on));
    });
    root.hidden = v !== "markets";
    reportsBox.hidden = v !== "reports";
    if (v === "reports") document.dispatchEvent(new CustomEvent("universe-view"));
    else render();
  }

  function openMarket(code) {
    state.market = code;
    state.group = "";
    state.q = "";
    state.shown = 100;
    if (code === "IN") loadDir();
    render();
    window.scrollTo({ top: 0 });
  }

  sw.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-ur]");
    if (b) setView(b.dataset.ur);
  });

  root.addEventListener("click", (e) => {
    const t = e.target;
    const br = t.closest("[data-market]");
    if (br) return openMarket(br.dataset.market);
    const rg = t.closest("[data-region]");
    if (rg) { state.region = rg.dataset.region; return render(); }
    const gr = t.closest("[data-group]");
    if (gr) { state.group = gr.dataset.group; state.shown = 100; return render(); }
    if (t.closest("#ur-back")) { state.market = null; return render(); }
    if (t.closest("#ur-more")) { state.shown += 200; return render(); }
    const rp = t.closest("[data-reports]");
    if (rp) {
      setView("reports");
      const btn = document.querySelector(`#f-root .f-mbtn[data-market="${rp.dataset.reports}"]`);
      if (btn) btn.click();
    }
  });
  root.addEventListener("change", (e) => {
    if (e.target.id === "ur-sort") { state.sort = e.target.value; render(); }
  });
  root.addEventListener("input", (e) => {
    if (e.target.id === "ur-q") { state.q = e.target.value; state.shown = 100; render(); }
  });

  document.addEventListener("tabchange", () => {
    if (!isActive()) return;
    loadDir();
    if (state.view === "markets") render();
  });
  if (isActive()) loadDir();
  render();
})();
