// Universe tab: every market the dashboard tracks, grouped by region, with a
// coverage table (market, exchange, currency, companies, index, annual reports)
// and a Browse view per market. India browses the full NSE/BSE company list
// (companies.json) grouped by industry; every other market browses its tracked
// basket grouped by sector. Clicking an Indian company opens a Screener-style
// company page (company-page.js). Routes: #universe, #universe/IN (browse),
// #universe/IN/SYMBOL (company). US tickers open a Finviz-backed company page
// (us-company-page.js) at #universe/US/TICKER; the search bar also finds any
// SEC-listed US company. The Annual Reports lookup lives under the
// second switch (filings-ui.js).
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
    market: null,        // null = coverage table, else a country code (from the hash)
    company: null,       // NSE ticker / BSE code / US ticker when a company page is open
    companyMkt: null,    // "IN" or "US" for that company page
    group: "",           // sector / industry-group filter inside Browse
    q: "",
    shown: 100,
  };

  /* ---------- India universe (companies.json) ---------- */
  const dir = { status: "idle", rows: [], groups: [], byCode: new Map() };
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
        const rec = { name, nse, bse, isin, group, industry, code: nse || bse, nameL: name.toLowerCase(), codeL: (nse || bse).toLowerCase(), hay: `${name} ${nse} ${bse}`.toLowerCase() };
        dir.rows.push(rec);
        if (nse) dir.byCode.set(nse.toUpperCase(), rec);
        if (bse) dir.byCode.set(String(bse), rec);
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

  /* ---------- US universe (us-stocks.json, from the Dhan US list) ---------- */
  const usd = { status: "idle", rows: [] };
  async function loadUs() {
    if (usd.status !== "idle") return;
    usd.status = "loading";
    try {
      const res = await fetch("us-stocks.json");
      if (!res.ok) throw new Error(String(res.status));
      usd.rows = (await res.json()).rows.map((r) => ({ ...r, hay: `${r.n} ${r.t || ""}`.toLowerCase() }));
      usd.status = "ready";
    } catch {
      usd.status = "error";
    }
    render();
  }
  const listedUs = () => (usd.status === "ready" ? usd.rows.length : null);

  // Live prices via the shared /api/quotes (Yahoo Finance) endpoint. Only the
  // page currently on screen is fetched, and only when that set changes; a
  // "." in the ticker becomes "-" (Yahoo's convention, e.g. BRK.B -> BRK-B).
  const usQuotes = new Map(); // ticker -> { price, pct, ok }
  let usQuoteKey = "", usQuoteTimer = 0;
  const usYahooSym = (t) => t.replace(/\./g, "-");

  function currentUsTickers() {
    return [...root.querySelectorAll(".ur-us tbody tr td.ur-sticky small.ur-tk")].map((el) => el.textContent.trim());
  }

  async function syncUsQuotes(tickers, force) {
    const key = tickers.join(",");
    if (!force && key === usQuoteKey) return;
    usQuoteKey = key;
    if (!tickers.length || typeof fetchQuotes !== "function") return;
    try {
      const { map } = await fetchQuotes(tickers.map(usYahooSym));
      tickers.forEach((t) => {
        const q = map.get(usYahooSym(t));
        usQuotes.set(t, q && !q.error && Number.isFinite(q.price) ? { price: q.price, pct: q.changePercent, ok: true } : { ok: false });
      });
    } catch {
      tickers.forEach((t) => { if (!usQuotes.has(t)) usQuotes.set(t, { ok: false }); });
    }
    if (state.market === "US" && !state.company && isActive()) {
      const y = window.scrollY;
      render();
      window.scrollTo({ top: y });
    }
  }

  // $ for currency; Tn / Bn / Mn for trillions / billions / millions.
  const dec = (n, d) => Number(n).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
  const usdPrice = (n) => (n == null ? "—" : `$${dec(n, 2)}`);
  const usdCap = (mn) => {            // market cap arrives in $ millions
    if (mn == null) return "—";
    if (mn >= 1e6) return `$${dec(mn / 1e6, 2)} Tn`;
    if (mn >= 1e3) return `$${dec(mn / 1e3, 2)} Bn`;
    return `$${dec(mn, 2)} Mn`;
  };
  const shares = (n) => {             // share volume
    if (n == null) return "—";
    if (n >= 1e9) return `${dec(n / 1e9, 2)} Bn`;
    if (n >= 1e6) return `${dec(n / 1e6, 2)} Mn`;
    if (n >= 1e3) return `${dec(n / 1e3, 1)} K`;
    return dec(n, 0);
  };
  const pctCell = (n, signed) => (n == null ? `<span class="ur-dim">—</span>` : `<span class="${n < 0 ? "neg" : n > 0 ? "pos" : ""}">${signed && n > 0 ? "+" : ""}${dec(n, 2)}%</span>`);
  const plain = (n) => (n == null ? `<span class="ur-dim">—</span>` : dec(n, 2));

  const US_COLS = [
    ["vol", "Volume", (r) => shares(r.vol)],
    ["mc", "Market cap", (r) => usdCap(r.mc)],
    ["pe", "P/E", (r) => plain(r.pe)],
    ["ipe", "Industry P/E", (r) => plain(r.ipe)],
    ["hi", "52W high", (r) => usdPrice(r.hi)],
    ["r1m", "1M", (r) => pctCell(r.r1m, true)],
    ["r3m", "3M", (r) => pctCell(r.r3m, true)],
    ["r1y", "1Y", (r) => pctCell(r.r1y, true)],
    ["r3y", "3Y", (r) => pctCell(r.r3y, true)],
    ["r5y", "5Y", (r) => pctCell(r.r5y, true)],
    ["roe", "ROE", (r) => pctCell(r.roe)],
    ["roce", "ROCE", (r) => pctCell(r.roce)],
  ];
  const usSort = { key: "mc", dir: -1 };

  function usBrowseHtml(c) {
    if (usd.status === "idle" || usd.status === "loading") return `<section class="card"><p class="f-empty">Loading the US company list…</p></section>`;
    if (usd.status === "error") return `<section class="card"><p class="f-error">Couldn't load us-stocks.json.</p></section>`;
    const q = state.q.trim().toLowerCase();
    const filtered = usd.rows.filter((r) => !q || r.hay.includes(q));
    const total = filtered.length;
    const k = usSort.key;
    const sorted = filtered.slice().sort((a, b) => {
      const x = k === "n" ? a.n : a[k], y = k === "n" ? b.n : b[k];
      if (x == null && y == null) return 0;
      if (x == null) return 1;
      if (y == null) return -1;
      return (typeof x === "string" ? x.localeCompare(y) : x - y) * usSort.dir;
    });
    const page = sorted.slice(0, state.shown);
    const th = (key, label, cls) => `<th class="${cls || ""} ur-sortable ${usSort.key === key ? "sorted" : ""}" data-sort="${key}">${label}${usSort.key === key ? (usSort.dir < 0 ? " ▼" : " ▲") : ""}</th>`;
    const trs = page.map((r) => {
      const name = r.t ? `<a class="ur-co" href="#universe/US/${encodeURIComponent(r.t)}">${esc(r.n)}</a>` : `<b>${esc(r.n)}</b>`;
      const tick = r.t ? `<small class="ur-tk">${esc(r.t)}</small>` : `<small class="ur-dim">no ticker</small>`;
      const chart = r.t ? `<a class="kc-src" href="#chart/${encodeURIComponent(`${r.x || "NASDAQ"}:${r.t.replace(/-/g, ".")}`)}">Chart</a>` : "";
      const lq = usQuotes.get(r.t);
      const price = lq === undefined ? `<span class="ur-dim">…</span>` : lq.ok ? usdPrice(lq.price) : `<span class="ur-dim">—</span>`;
      const chg = lq === undefined ? "" : lq.ok ? pctCell(lq.pct, true) : "";
      return `<tr><td class="ur-sticky">${name}${tick}</td><td class="ur-num">${price}</td><td class="ur-num">${chg}</td>${US_COLS.map(([, , f]) => `<td class="ur-num">${f(r)}</td>`).join("")}<td class="ur-act">${chart}</td></tr>`;
    }).join("");
    return `
      <section class="card">
        <div class="section-title">
          <span><button type="button" class="ur-back" id="ur-back">← All markets</button></span>
          <button type="button" class="ur-browse ghost" data-reports="US">Annual reports →</button>
        </div>
        <div class="ur-bhead">
          <span class="ur-flag big">${FLAGS.svg(c.code)}</span>
          <div><h3>${esc(c.name)}</h3><p>${esc(c.exchange)} · USD ($) · ${fmt(usd.rows.length)} companies · market cap in $ Tn / Bn / Mn</p></div>
        </div>
        <div class="ur-note"><b>Mixed freshness.</b> Price and change are live (Yahoo Finance, ~15s cache) for every company. Volume, market cap, P/E, 52W high, returns, ROE and ROCE are from the Dhan US list and are only filled in for its ${usd.rows.filter((r) => r.mc != null).length} companies — every other ticker (the full NYSE list) shows "—" for those. Click a company for its Finviz page.</div>
        ${searchBar()}
        <div class="ur-find"><input id="ur-q" type="search" placeholder="Search US companies by name or ticker…" value="${esc(state.q)}" autocomplete="off"></div>
        <div class="ur-scroll">
          <table class="ur-table ur-us">
            <thead><tr>${th("n", "Company", "ur-sticky")}<th class="ur-num">Price</th><th class="ur-num">Change</th>${US_COLS.map(([key, label]) => th(key, label, "ur-num")).join("")}<th></th></tr></thead>
            <tbody>${trs || `<tr><td colspan="${US_COLS.length + 4}" class="f-empty">No companies match.</td></tr>`}</tbody>
          </table>
        </div>
        <div class="ur-foot">Showing ${fmt(page.length)} of ${fmt(total)}${total > page.length ? ` <button type="button" class="ur-browse ghost" id="ur-more">Show more</button>` : ""} · click a column to sort.</div>
      </section>`;
  }

  /* ---------- Australia universe (au-stocks.json, ASX listed companies) ---------- */
  const aud = { status: "idle", rows: [], sectors: [], asOf: null };
  async function loadAu() {
    if (aud.status !== "idle") return;
    aud.status = "loading";
    try {
      const res = await fetch("au-stocks.json");
      if (!res.ok) throw new Error(String(res.status));
      const d = await res.json();
      aud.rows = d.rows.map((r) => ({ ...r, hay: `${r.n} ${r.t}`.toLowerCase() }));
      aud.sectors = d.sectors || [];
      aud.asOf = d.asOf || null;
      aud.status = "ready";
    } catch {
      aud.status = "error";
    }
    render();
  }
  const listedAu = () => (aud.status === "ready" ? aud.rows.length : null);

  // Live prices via the shared /api/quotes (Yahoo Finance) endpoint, keyed by
  // plain ASX code ("BHP"); the Yahoo symbol is the code plus ".AX". Only the
  // page currently on screen is fetched, and only when that set changes.
  const auQuotes = new Map(); // ticker -> { price, pct, ok }
  let auQuoteKey = "", auQuoteTimer = 0;

  async function syncAuQuotes(tickers, force) {
    const key = tickers.join(",");
    if (!force && key === auQuoteKey) return;
    auQuoteKey = key;
    if (!tickers.length || typeof fetchQuotes !== "function") return;
    try {
      const { map } = await fetchQuotes(tickers.map((t) => `${t}.AX`));
      tickers.forEach((t) => {
        const q = map.get(`${t}.AX`);
        auQuotes.set(t, q && !q.error && Number.isFinite(q.price) ? { price: q.price, pct: q.changePercent, ok: true } : { ok: false });
      });
    } catch {
      tickers.forEach((t) => { if (!auQuotes.has(t)) auQuotes.set(t, { ok: false }); });
    }
    if (state.market === "AU" && !state.company && isActive()) {
      const y = window.scrollY;
      render();
      window.scrollTo({ top: y });
    }
  }

  const audCap = (v) => {
    if (v == null) return "—";
    if (v >= 1e12) return `$${dec(v / 1e12, 2)} Tn`;
    if (v >= 1e9) return `$${dec(v / 1e9, 2)} Bn`;
    if (v >= 1e6) return `$${dec(v / 1e6, 2)} Mn`;
    return `$${dec(v, 0)}`;
  };
  let auSort = { key: "mc", dir: -1 }, auGroup = "";

  function auBrowseHtml(c) {
    if (aud.status === "idle" || aud.status === "loading") return `<section class="card"><p class="f-empty">Loading the ASX company list…</p></section>`;
    if (aud.status === "error") return `<section class="card"><p class="f-error">Couldn't load au-stocks.json.</p></section>`;
    const q = state.q.trim().toLowerCase();
    let rows = aud.rows;
    if (auGroup) rows = rows.filter((r) => r.sector === auGroup);
    if (q) rows = rows.filter((r) => r.hay.includes(q));
    const total = rows.length;
    const k = auSort.key;
    const sorted = rows.slice().sort((a, b) => {
      const x = a[k], y = b[k];
      if (x == null && y == null) return 0;
      if (x == null) return 1;
      if (y == null) return -1;
      return (typeof x === "string" ? x.localeCompare(y) : x - y) * auSort.dir;
    });
    const page = sorted.slice(0, state.shown);
    const th = (key, label, cls) => `<th class="${cls || ""} ur-sortable ${auSort.key === key ? "sorted" : ""}" data-asort="${key}">${label}${auSort.key === key ? (auSort.dir < 0 ? " ▼" : " ▲") : ""}</th>`;
    const secCounts = new Map();
    aud.rows.forEach((r) => secCounts.set(r.sector, (secCounts.get(r.sector) || 0) + 1));
    const chips = [`<button type="button" class="ur-chip ${auGroup ? "" : "active"}" data-asector="">All <i>${fmt(aud.rows.length)}</i></button>`]
      .concat(aud.sectors.map((s) => `<button type="button" class="ur-chip ${auGroup === s ? "active" : ""}" data-asector="${esc(s)}">${esc(s)} <i>${secCounts.get(s) || 0}</i></button>`))
      .join("");
    const trs = page.map((r) => {
      const q = auQuotes.get(r.t);
      const price = q === undefined ? `<span class="ur-dim">…</span>` : q.ok ? `$${dec(q.price, q.price < 10 ? 3 : 2)}` : `<span class="ur-dim">—</span>`;
      const chg = q === undefined ? "" : q.ok ? pctCell(q.pct, true) : "";
      return `<tr>
      <td class="ur-sticky"><b>${esc(r.n)}</b><small class="ur-tk">${esc(r.t)}</small></td>
      <td class="ur-num">${price}</td>
      <td class="ur-num">${chg}</td>
      <td class="ur-dim">${esc(r.sector)}</td>
      <td class="ur-num">${audCap(r.mc)}</td>
      <td class="ur-num">${r.w == null ? "—" : `<em class="pc">${dec(r.w, 3)}%</em>`}</td>
      <td class="ur-act"><a class="kc-src" href="#chart/${encodeURIComponent(`ASX:${r.t}`)}">Chart</a></td>
    </tr>`;
    }).join("");
    return `
      <section class="card">
        <div class="section-title"><span><button type="button" class="ur-back" id="ur-back">← All markets</button></span></div>
        <div class="ur-bhead">
          <span class="ur-flag big">${FLAGS.svg(c.code)}</span>
          <div><h3>${esc(c.name)}</h3><p>${esc(c.exchange)} · AUD ($) · ${fmt(aud.rows.length)} companies (full ASX list)</p></div>
        </div>
        <div class="ur-note"><b>Mixed freshness.</b> Price and change are live (Yahoo Finance, ~15s cache). Market cap and index weight are from an ASX export dated ${esc(aud.asOf || "unknown")} and are not live. No per-company page or SEC/annual-report lookup is available for Australia yet; "Chart" opens the live TradingView chart.</div>
        <div class="ur-find"><input id="ur-q" type="search" placeholder="Search ASX companies by name or ticker…" value="${esc(state.q)}" autocomplete="off"></div>
        <div class="ur-subhead">Sector</div>
        <div class="ur-chips ur-chips-wrap">${chips}</div>
        <div class="ur-scroll">
          <table class="ur-table ur-au">
            <thead><tr>${th("n", "Company", "ur-sticky")}<th class="ur-num">Price</th><th class="ur-num">Change</th>${th("sector", "Sector")}${th("mc", "Market cap", "ur-num")}${th("w", "Index weight", "ur-num")}<th></th></tr></thead>
            <tbody>${trs || `<tr><td colspan="7" class="f-empty">No companies match.</td></tr>`}</tbody>
          </table>
        </div>
        <div class="ur-foot">Showing ${fmt(page.length)} of ${fmt(total)}${total > page.length ? ` <button type="button" class="ur-browse ghost" id="ur-more">Show more</button>` : ""}</div>
      </section>`;
  }

  // Name/ticker search over the India universe: ticker prefix > name prefix > contains.
  function searchIndia(q) {
    const t = q.trim().toLowerCase();
    if (!t || dir.status !== "ready") return [];
    const scored = [];
    for (const r of dir.rows) {
      let sc = 0;
      if (r.codeL === t) sc = 100;
      else if (r.codeL.startsWith(t)) sc = 80;
      else if (r.nameL.startsWith(t)) sc = 70;
      else if (r.nameL.includes(t) || r.hay.includes(t)) sc = 40;
      if (sc) scored.push([sc, r]);
    }
    scored.sort((a, b) => b[0] - a[0] || a[1].name.localeCompare(b[1].name));
    return scored.slice(0, 8).map((x) => x[1]);
  }
  const gresHtml = (india, us, loading) => {
    const rows =
      india.map((r) => `<a class="ur-gr" href="#universe/IN/${encodeURIComponent(r.code)}"><b>${esc(r.name)}</b><span class="ur-tk">${esc(r.code)}</span><small>🇮🇳 ${esc(r.industry)}</small></a>`).join("") +
      us.map((r) => `<a class="ur-gr" href="#universe/US/${encodeURIComponent(r.ticker)}"><b>${esc(r.title)}</b><span class="ur-tk">${esc(r.ticker)}</span><small>🇺🇸 United States</small></a>`).join("");
    return rows || `<div class="ur-gr none">${loading ? "Searching…" : "No match"}</div>`;
  };
  const searchBar = () => `<div class="ur-gsearch">
      <input id="ur-gsearch" type="search" placeholder="Search any Indian or US company by name or ticker…" autocomplete="off" aria-label="Search companies">
      <div class="ur-gres" id="ur-gres" hidden></div>
    </div>`;

  function trackedCount(c) { return c.code === "US" && listedUs() != null ? listedUs() : c.code === "AU" && listedAu() != null ? listedAu() : c.stocks.length; }
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
      : c.code === "US" && listedUs() != null ? `${trackedCount(c)}<small>Dhan US list</small>`
      : c.code === "AU" && listedAu() != null ? `${trackedCount(c)}<small>Full ASX list</small>`
      : `${trackedCount(c)}<small>tracked basket</small>`;
    const rep = m.reports
      ? `<span class="ur-badge ${m.lvl}">${esc(m.reports)}</span>`
      : `<span class="ur-badge none">Not available</span>`;
    return `<tr>
      <td><span class="ur-mkt"><span class="ur-flag">${FLAGS.svg(c.code)}</span><span><b>${esc(c.name)}</b><small>${c.code}</small></span></span></td>
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
      ${searchBar()}
      ${statsHtml()}
      <div class="ur-note"><b>Data quality.</b> India lists the full NSE/BSE company universe with the official industry classification. Every other market shows a tracked basket of its largest listings. Indian companies open Screener-style pages; any US ticker opens a Finviz-backed page. Annual reports are available for the US (SEC EDGAR, complete) and India (NSE feed, recent filings only). Other exchanges restrict automated access to filings.</div>
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
    if (c.code === "US") return usBrowseHtml(c);
    if (c.code === "AU") return auBrowseHtml(c);
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
      <td>${c.code === "IN" || c.code === "US" ? `<a class="ur-co" href="#universe/${c.code}/${encodeURIComponent(r.code)}">${esc(r.name)}</a>` : `<b>${esc(r.name)}</b>`}</td>
      <td class="ur-dim"><span class="ur-tk">${esc(r.code)}</span>${r.extra ? ` <small>${esc(r.extra)}</small>` : ""}</td>
      <td class="ur-dim">${esc(r.sub)}</td>
      <td class="ur-act">${c.code === "IN" || c.code === "US" ? `<a class="kc-src" href="#universe/${c.code}/${encodeURIComponent(r.code)}">View</a> ` : ""}<a class="kc-src" href="#chart/${encodeURIComponent(r.chart)}">Chart</a></td>
    </tr>`).join("");
    const reportsBtn = m.reports ? `<button type="button" class="ur-browse ghost" data-reports="${c.code}">Annual reports →</button>` : "";
    return `
      <section class="card">
        <div class="section-title">
          <span><button type="button" class="ur-back" id="ur-back">← All markets</button></span>
          ${reportsBtn}
        </div>
        <div class="ur-bhead">
          <span class="ur-flag big">${FLAGS.svg(c.code)}</span>
          <div><h3>${esc(c.name)}</h3><p>${esc(c.exchange)} · ${m.cur} · ${esc(c.indexLabel)} · ${fmt(d.rows.length)} companies${c.code === "IN" ? " (full NSE/BSE list)" : " (tracked basket)"}</p></div>
        </div>
        ${c.code === "IN" || c.code === "US" ? searchBar() : ""}
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
  function currentAuTickers() {
    return [...root.querySelectorAll(".ur-au tbody tr td.ur-sticky small.ur-tk")].map((el) => el.textContent.trim());
  }

  function render() {
    if (state.view === "reports") return;
    const c = state.market ? COUNTRIES.find((x) => x.code === state.market) : null;
    if (state.company) return renderCompany();
    if (window.CompanyPage) window.CompanyPage.close(document.getElementById("ur-company"));
    if (window.UsCompanyPage) window.UsCompanyPage.close(document.getElementById("ur-company"));
    const focus = document.activeElement && document.activeElement.id === "ur-q";
    root.innerHTML = c ? browseHtml(c) : marketsHtml();
    if (focus) {
      const el = document.getElementById("ur-q");
      if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
    }
    if (c && c.code === "AU") {
      syncAuQuotes(currentAuTickers());
      if (!auQuoteTimer) {
        auQuoteTimer = setInterval(() => {
          if (state.market === "AU" && !state.company && isActive()) syncAuQuotes(currentAuTickers(), true);
        }, 15000);
      }
    }
    if (c && c.code === "US") {
      syncUsQuotes(currentUsTickers());
      if (!usQuoteTimer) {
        usQuoteTimer = setInterval(() => {
          if (state.market === "US" && !state.company && isActive()) syncUsQuotes(currentUsTickers(), true);
        }, 15000);
      }
    }
  }

  function renderUsCompany() {
    const us = COUNTRIES.find((c) => c.code === "US");
    const t = String(state.company).toUpperCase();
    const hint = us && us.stocks.find((x) => x.symbol.toUpperCase() === t);
    root.innerHTML = `<div class="ur-crumb"><a class="ur-back" href="#universe/US">← United States</a><span>/</span><span>${esc(t)}</span></div>
      ${searchBar()}<div id="ur-company"></div>`;
    document.title = `${t} · StalkingStocks`;
    window.UsCompanyPage.open(document.getElementById("ur-company"), t, hint ? hint.name : "");
  }

  function renderCompany() {
    if (state.companyMkt === "US") return renderUsCompany();
    if (dir.status === "idle" || dir.status === "loading") {
      root.innerHTML = `<section class="card"><p class="f-empty">Loading the company list…</p></section>`;
      loadDir();
      return;
    }
    const rec = dir.byCode.get(String(state.company).toUpperCase());
    if (!rec) {
      root.innerHTML = `<section class="card"><p class="f-error">“${esc(state.company)}” isn't in the company list.</p><p><a class="ur-back" href="#universe/IN">← Back to India</a></p></section>`;
      return;
    }
    root.innerHTML = `<div class="ur-crumb"><a class="ur-back" href="#universe/IN">← India</a><span>/</span><span>${esc(rec.group)}</span></div>
      ${searchBar()}<div id="ur-company"></div>`;
    document.title = `${rec.name} · StalkingStocks`;
    window.CompanyPage.open(document.getElementById("ur-company"), rec);
  }

  let usTimer = 0, usSeq = 0;

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
    state.group = "";
    state.q = "";
    state.shown = 100;
    auGroup = "";
    if (code === "IN") loadDir();
    if (code === "US") loadUs();
    if (code === "AU") loadAu();
    location.hash = `#universe/${code}`; // route() renders via tabchange
  }

  // The hash is the source of truth: #universe[/MARKET[/SYMBOL]].
  function route() {
    if (!isActive()) return;
    const [, market, sym] = location.hash.slice(1).split("/");
    const valid = market && COUNTRIES.some((c) => c.code === market) ? market : null;
    let company = null;
    if ((valid === "IN" || valid === "US") && sym) {
      try { company = decodeURIComponent(sym); } catch { company = null; }
    }
    if (valid !== state.market || company !== state.company) { state.group = ""; state.q = ""; state.shown = 100; auGroup = ""; }
    state.market = valid;
    state.company = company;
    state.companyMkt = company ? valid : null;
    if (!state.company) document.title = "StalkingStocks";
    if ((valid || company) && state.view === "reports") setView("markets");
    else if (state.view === "markets") render();
    if (valid === "IN") loadDir();
    if (valid === "US") loadUs();
    if (valid === "AU") loadAu();
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
    const so = t.closest("[data-sort]");
    if (so) {
      const key = so.dataset.sort;
      if (usSort.key === key) usSort.dir *= -1; else { usSort.key = key; usSort.dir = key === "n" ? 1 : -1; }
      return render();
    }
    const aso = t.closest("[data-asort]");
    if (aso) {
      const key = aso.dataset.asort;
      if (auSort.key === key) auSort.dir *= -1; else { auSort.key = key; auSort.dir = key === "n" || key === "sector" ? 1 : -1; }
      return render();
    }
    const ag = t.closest("[data-asector]");
    if (ag) { auGroup = ag.dataset.asector; state.shown = 100; return render(); }
    if (t.closest("#ur-back")) { location.hash = "#universe"; return; }
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
    if (e.target.id === "ur-gsearch") {
      loadDir();
      const box = document.getElementById("ur-gres");
      const q = e.target.value.trim();
      box.hidden = !q;
      clearTimeout(usTimer);
      if (!q) return;
      const paint = (us, loading) => {
        const b = document.getElementById("ur-gres");
        if (b && !b.hidden) b.innerHTML = gresHtml(dir.status === "ready" ? searchIndia(q).slice(0, 6) : [], us, loading || dir.status !== "ready");
      };
      paint([], true);
      // US companies: SEC's ticker list (also what the annual-report search uses).
      usTimer = setTimeout(async () => {
        const seq = ++usSeq;
        try {
          const res = await fetch(`/api/filings/us/search?q=${encodeURIComponent(q)}`);
          const body = await res.json();
          if (seq === usSeq) paint((body.results || []).slice(0, 6), false);
        } catch {
          if (seq === usSeq) paint([], false);
        }
      }, 220);
    }
  });
  root.addEventListener("keydown", (e) => {
    if (e.target.id !== "ur-gsearch") return;
    if (e.key === "Enter") {
      const first = document.querySelector("#ur-gres a.ur-gr");
      if (first) location.hash = first.getAttribute("href");
    } else if (e.key === "Escape") {
      document.getElementById("ur-gres").hidden = true;
    }
  });
  document.addEventListener("click", (e) => {
    const res = document.getElementById("ur-gres");
    if (res && !res.hidden && !e.target.closest(".ur-gsearch")) res.hidden = true;
  });

  document.addEventListener("tabchange", () => {
    if (!isActive()) return;
    loadDir();
    loadUs();
    loadAu();
    route();
  });
  if (isActive()) { loadDir(); loadUs(); loadAu(); route(); }
  render();
})();
