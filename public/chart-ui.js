// Chart tab: a TradingView chart with our own search bar.
//
// Search covers the imported company list (companies.json: NSE/BSE tickers and
// names), a few index/commodity/crypto presets, and any raw TradingView symbol
// ("NASDAQ:AAPL"). Picking one re-mounts TradingView's free Advanced Chart
// widget (embed-widget-advanced-chart.js) for that symbol. The widget itself
// also has TradingView's own symbol search, timeframes, drawing tools, etc.
// Deep links: #chart/NSE%3AGRASIM
(function () {
  const root = document.getElementById("ch-root");
  if (!root) return;

  const LAST_KEY = "stalkingstocks.chart.symbol";
  const DEFAULT_SYMBOL = "NSE:NIFTY";
  const WIDGET_SRC = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";

  // name, TradingView symbol
  const PRESETS = [
    ["Nifty 50", "NSE:NIFTY"],
    ["Sensex", "BSE:SENSEX"],
    ["Bank Nifty", "NSE:BANKNIFTY"],
    ["S&P 500", "SP:SPX"],
    ["Nasdaq 100", "NASDAQ:NDX"],
    ["Dow Jones", "DJ:DJI"],
    ["Gold", "TVC:GOLD"],
    ["Brent Crude Oil", "TVC:UKOIL"],
    ["USD / INR", "FX_IDC:USDINR"],
    ["Bitcoin", "BITSTAMP:BTCUSD"],
    ["Apple", "NASDAQ:AAPL"],
    ["Microsoft", "NASDAQ:MSFT"],
    ["Nvidia", "NASDAQ:NVDA"],
    ["Tesla", "NASDAQ:TSLA"],
  ];
  const CHIPS = ["NSE:NIFTY", "BSE:SENSEX", "NSE:BANKNIFTY", "SP:SPX", "NASDAQ:NDX", "TVC:GOLD", "FX_IDC:USDINR", "BITSTAMP:BTCUSD"];

  const state = { symbol: null, mounted: null, built: false };
  const dir = { status: "idle", rows: [] };
  const sugg = { items: [], active: -1 };

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const isActive = () => {
    const panel = root.closest(".tab-panel");
    return !!panel && !panel.hidden;
  };

  function readLast() {
    try {
      return localStorage.getItem(LAST_KEY);
    } catch {
      return null;
    }
  }
  function saveLast(sym) {
    try {
      localStorage.setItem(LAST_KEY, sym);
    } catch {
      // storage unavailable: the last symbol just won't be remembered
    }
  }

  // TradingView writes & and - in NSE tickers as "_" (M&M -> M_M, BAJAJ-AUTO -> BAJAJ_AUTO).
  function tvSymbolFor(rec) {
    if (rec.nse) return `NSE:${rec.nse.replace(/[&-]/g, "_")}`;
    return `BSE:${rec.bse}`;
  }

  function labelFor(sym) {
    const p = PRESETS.find((x) => x[1] === sym);
    if (p) return p[0];
    const r = dir.rows.find((x) => tvSymbolFor(x) === sym);
    return r ? r.name : "";
  }

  /* ---------- company list ---------- */
  async function loadDir() {
    if (dir.status !== "idle") return;
    dir.status = "loading";
    try {
      const res = await fetch("companies.json");
      if (!res.ok) throw new Error(String(res.status));
      const d = await res.json();
      for (const [name, nse, bse, isin, ind] of d.rows) {
        const [industry] = d.industries[ind] || ["Unclassified"];
        dir.rows.push({ name, nse, bse, industry, code: nse || bse, nameL: name.toLowerCase(), codeL: (nse || bse).toLowerCase() });
      }
      dir.status = "ready";
    } catch {
      dir.status = "error";
    }
    renderStatus();
  }

  // Presets first when they match well, then companies; ticker beats name.
  function search(q) {
    const t = q.trim().toLowerCase();
    if (!t) return [];
    const scored = [];
    for (const [name, symbol] of PRESETS) {
      const n = name.toLowerCase();
      const code = symbol.toLowerCase();
      let sc = 0;
      if (n === t || code === t) sc = 105;
      else if (n.startsWith(t)) sc = 85;
      else if (n.includes(t) || code.includes(t)) sc = 45;
      if (sc) scored.push([sc, { name, symbol, tag: symbol.split(":")[0] }]);
    }
    for (const r of dir.rows) {
      let sc = 0;
      if (r.codeL === t || r.bse === t) sc = 100;
      else if (r.codeL.startsWith(t)) sc = 80;
      else if (r.nameL.startsWith(t)) sc = 70;
      else if (r.nameL.includes(" " + t)) sc = 55;
      else if (r.nameL.includes(t)) sc = 40;
      if (sc) scored.push([sc, { name: r.name, symbol: tvSymbolFor(r), tag: r.industry }]);
    }
    scored.sort((a, b) => b[0] - a[0] || a[1].name.localeCompare(b[1].name));
    return scored.slice(0, 8).map((x) => x[1]);
  }

  /* ---------- TradingView widget ---------- */
  function mount(symbol) {
    const box = document.getElementById("ch-widget");
    if (!box) return;
    state.mounted = symbol;
    box.innerHTML = "";

    const wrap = document.createElement("div");
    wrap.className = "tradingview-widget-container";
    wrap.style.cssText = "height:100%;width:100%";
    const inner = document.createElement("div");
    inner.className = "tradingview-widget-container__widget";
    inner.style.cssText = "height:100%;width:100%";
    const script = document.createElement("script");
    script.type = "text/javascript";
    script.src = WIDGET_SRC;
    script.async = true;
    script.textContent = JSON.stringify({
      autosize: true,
      symbol,
      interval: "D",
      timezone: "Asia/Kolkata",
      theme: "dark",
      style: "1",
      locale: "en",
      backgroundColor: "#071446",
      gridColor: "rgba(143, 180, 255, 0.08)",
      allow_symbol_change: true,
      withdateranges: true,
      hide_side_toolbar: false,
      save_image: true,
      calendar: false,
      support_host: "https://www.tradingview.com",
    });
    script.onerror = () => {
      box.innerHTML = `<div class="ch-fail">TradingView couldn't be loaded (an ad blocker or network setting may be blocking it).
        <a href="${esc(tvUrl(symbol))}" target="_blank" rel="noopener noreferrer">Open ${esc(symbol)} on tradingview.com &#8599;</a></div>`;
    };
    wrap.append(inner, script);
    box.append(wrap);
    renderStatus();
  }

  const tvUrl = (sym) => `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(sym)}`;

  function setSymbol(sym) {
    state.symbol = sym;
    saveLast(sym);
    const want = `#chart/${encodeURIComponent(sym)}`;
    if (location.hash !== want) history.replaceState(null, "", want);
    if (isActive()) mount(sym);
    const input = document.getElementById("ch-q");
    if (input) input.value = "";
    sugg.items = [];
    sugg.active = -1;
    renderSugg();
  }

  /* ---------- rendering ---------- */
  function renderStatus() {
    const el = document.getElementById("ch-now");
    if (!el || !state.symbol) return;
    const name = labelFor(state.symbol);
    el.innerHTML = `<span class="kc-ticker">${esc(state.symbol)}</span>${name ? `<span class="ch-name">${esc(name)}</span>` : ""}
      <a class="kc-src" href="${esc(tvUrl(state.symbol))}" target="_blank" rel="noopener noreferrer">Open on TradingView &#8599;</a>`;
  }

  function renderSugg() {
    const box = document.getElementById("ch-sugg");
    if (!box) return;
    const q = (document.getElementById("ch-q") || {}).value || "";
    if (!sugg.items.length && !q.trim()) {
      box.hidden = true;
      box.innerHTML = "";
      return;
    }
    const raw = q.trim();
    const rows = sugg.items.map(
      (r, i) => `<li role="option" class="kc-sg ${i === sugg.active ? "active" : ""}" data-sym="${esc(r.symbol)}" aria-selected="${i === sugg.active}">
        <span class="kc-sg-code ch-sg-code">${esc(r.symbol)}</span><span class="kc-sg-name">${esc(r.name)}</span><span class="kc-sg-ind">${esc(r.tag)}</span>
      </li>`
    );
    if (raw) {
      const asSym = raw.includes(":") ? raw.toUpperCase() : raw.toUpperCase();
      rows.push(`<li role="option" class="kc-sg ch-raw" data-sym="${esc(asSym)}"><span class="kc-sg-code ch-sg-code">${esc(asSym)}</span><span class="kc-sg-name">Use as a TradingView symbol</span></li>`);
    }
    box.hidden = false;
    box.innerHTML = rows.join("");
  }

  function build() {
    const chips = CHIPS.map((s) => `<button type="button" class="kc-chip" data-sym="${esc(s)}">${esc(labelFor(s) || s)}</button>`).join("");
    root.innerHTML = `
      <section class="card kc-tools ch-tools">
        <form class="kc-form" id="ch-form" autocomplete="off">
          <div class="kc-combo">
            <label class="k-search kc-ticker-in">
              <span class="k-search-icon" aria-hidden="true">&#9906;</span>
              <input id="ch-q" type="text" role="combobox" aria-controls="ch-sugg" placeholder="Search a company or ticker, e.g. Grasim, TCS, NASDAQ:AAPL" spellcheck="false" aria-label="Search chart symbol" />
            </label>
            <ul id="ch-sugg" class="kc-sugg" role="listbox" hidden></ul>
          </div>
          <button type="submit" class="kc-go">Show chart</button>
        </form>
        <div class="kc-chips" role="group" aria-label="Quick picks">${chips}</div>
      </section>
      <section class="card ch-card">
        <div class="ch-now" id="ch-now"></div>
        <div class="ch-widget" id="ch-widget"></div>
        <p class="kc-foot">Charts by <a class="i-src" href="https://www.tradingview.com/" target="_blank" rel="noopener noreferrer">TradingView</a>. Prices may be delayed and some exchanges need a TradingView subscription for real-time data. Not investment advice.</p>
      </section>`;
    state.built = true;
    renderStatus();
    loadDir();
  }

  /* ---------- routing ---------- */
  function symbolFromHash() {
    const part = location.hash.slice(1).split("/")[1];
    if (!part) return null;
    try {
      return decodeURIComponent(part).toUpperCase();
    } catch {
      return null;
    }
  }

  function route() {
    if (!isActive()) return;
    if (!state.built) build();
    const sym = symbolFromHash() || state.symbol || readLast() || DEFAULT_SYMBOL;
    state.symbol = sym;
    if (state.mounted !== sym) mount(sym);
    else renderStatus();
  }

  root.addEventListener("submit", (e) => {
    if (e.target.id !== "ch-form") return;
    e.preventDefault();
    const q = document.getElementById("ch-q").value.trim();
    if (!q) return;
    const picked = sugg.active >= 0 ? sugg.items[sugg.active] : null;
    if (picked) return setSymbol(picked.symbol);
    if (q.includes(":")) return setSymbol(q.toUpperCase());
    const hit = search(q)[0];
    setSymbol(hit ? hit.symbol : q.toUpperCase());
  });

  root.addEventListener("input", (e) => {
    if (e.target.id !== "ch-q") return;
    sugg.items = search(e.target.value);
    sugg.active = -1;
    renderSugg();
  });

  root.addEventListener("keydown", (e) => {
    if (e.target.id !== "ch-q") return;
    const n = sugg.items.length;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (!n) return;
      e.preventDefault();
      let a = sugg.active + (e.key === "ArrowDown" ? 1 : -1);
      if (a >= n) a = -1;
      else if (a < -1) a = n - 1;
      sugg.active = a;
      renderSugg();
    } else if (e.key === "Escape") {
      sugg.items = [];
      sugg.active = -1;
      renderSugg();
    }
  });

  root.addEventListener("click", (e) => {
    const el = e.target.closest("[data-sym]");
    if (el) setSymbol(el.dataset.sym);
  });

  document.addEventListener("click", (e) => {
    if (!e.target.closest || e.target.closest(".kc-combo")) return;
    if (sugg.items.length) {
      sugg.items = [];
      sugg.active = -1;
      renderSugg();
    }
  });

  document.addEventListener("tabchange", route);
  route();
})();
