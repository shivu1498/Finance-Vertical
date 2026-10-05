const REFRESH_MS = 30_000;

let activeCountry = COUNTRIES[0];

// How India's stocks are grouped in the heatmap, filter and treemap:
// "classic" (my original labels) or a level of NSE's industry classification.
let groupMode = "classic";
const GROUP_LEVEL = { mes: 0, sec: 1, ind: 2 };

function groupOf(stock) {
  if (activeCountry.code !== "IN" || groupMode === "classic") return stock.sector;
  const basic = NSE_IND.byName.bas.get(STOCK_BASIC[stock.name]);
  return basic ? NSE_IND.path(basic)[GROUP_LEVEL[groupMode]].name : "Unclassified";
}

function fmtPrice(n, prefix = "") {
  if (n == null || Number.isNaN(n)) return "—";
  // Rupee amounts use Indian digit grouping (12,34,567.50).
  if (prefix === "₹") return prefix + n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
  return prefix + n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

// ₹ for Indian listings (Yahoo .NS / .BO), nothing for other markets.
function currencyPrefix(symbol) {
  return /\.(NS|BO)$/i.test(String(symbol || "")) ? "₹" : "";
}

// Rupee amount in Indian units: ₹ 1.25 Cr, ₹ 4.5 Lk, ₹ 12,345.
function fmtInrCompact(n) {
  if (n == null || Number.isNaN(Number(n))) return "—";
  const v = Number(n);
  const a = Math.abs(v);
  const trim = (x) => String(Number(x.toFixed(2)));
  if (a >= 1e7) return `₹ ${trim(v / 1e7)} Cr`;
  if (a >= 1e5) return `₹ ${trim(v / 1e5)} Lk`;
  return `₹ ${Math.round(v).toLocaleString("en-IN")}`;
}

// Screener writes "Rs. 1,234 Cr." / "Crores" / "Lakhs"; show the short forms.
function normMoney(s) {
  return String(s == null ? "" : s)
    .replace(/\bRs\.?\s?(?=Cr|[\d])/g, "₹ ")
    .replace(/\bRs\.?(?![A-Za-z])/g, "₹")
    .replace(/\bCrores?\b\.?/gi, "Cr")
    .replace(/\bCr\./g, "Cr")
    .replace(/\b(Lakhs?|Lacs?)\b\.?/gi, "Lk");
}

function fmtPct(n) {
  if (n == null || Number.isNaN(n)) return "—";
  const s = n.toFixed(2);
  if (Number(s) === 0) return "0.00%";
  return `${n > 0 ? "+" : ""}${s}%`;
}

function changeClass(pct) {
  if (pct == null || Number.isNaN(pct)) return "flat";
  return pct > 0 ? "up" : pct < 0 ? "down" : "flat";
}

// Heat intensity 0..1 based on |%change|, capped at 3% like a typical
// sector-heatmap scale.
function heat(pct) {
  return Math.min(Math.abs(pct ?? 0) / 3, 1);
}

async function fetchQuotes(symbols) {
  const res = await fetch(`/api/quotes?symbols=${encodeURIComponent(symbols.join(","))}`);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  const json = await res.json();
  const map = new Map();
  for (const q of json.quotes) map.set(q.symbol, q);
  return { map, updatedAt: json.updatedAt };
}

function renderClock() {
  const el = document.getElementById("clock");
  const tick = () => {
    el.textContent = new Date().toLocaleTimeString("en-IN", { hour12: false });
  };
  tick();
  setInterval(tick, 1000);
}

// ---- Top ticker: asset-class filter + scrollable strip ----
const ASSET_KEY = "stalkingstocks.asset";
let assetFilter = loadAssetFilter();
const tickerQuotes = new Map();

function loadAssetFilter() {
  try {
    const v = JSON.parse(localStorage.getItem(ASSET_KEY));
    const cls = ASSET_CLASSES.find((c) => c.id === v?.cls);
    if (cls) return { cls: cls.id, sub: cls.subs.some((s) => s[0] === v.sub) ? v.sub : "" };
  } catch {
    // no saved filter, or storage unavailable
  }
  return { cls: "", sub: "" };
}

function saveAssetFilter() {
  try {
    localStorage.setItem(ASSET_KEY, JSON.stringify(assetFilter));
  } catch {
    // the filter just won't persist
  }
}

const visibleTickers = () =>
  TICKERS.filter((t) => (!assetFilter.cls || t.cls === assetFilter.cls) && (!assetFilter.sub || t.sub === assetFilter.sub));

function renderAssetFilter() {
  const chip = (cls, label, active, extra = "") =>
    `<button type="button" class="asset-chip${active ? " active" : ""}" data-asset-cls="${cls}" ${extra}>${label}${extra ? ' <span class="chev" aria-hidden="true">&#9662;</span>' : ""}</button>`;
  const all = chip("", "All", assetFilter.cls === "");
  const classes = ASSET_CLASSES.map((c) => {
    const active = assetFilter.cls === c.id;
    const subLabel = active && assetFilter.sub ? ` &middot; ${c.subs.find((s) => s[0] === assetFilter.sub)[1]}` : "";
    const items = [["", `All ${c.label.toLowerCase()}`], ...c.subs]
      .map(([id, label]) => `<button type="button" role="menuitem" data-asset-cls="${c.id}" data-asset-sub="${id}" class="${active && assetFilter.sub === id ? "on" : ""}">${label}</button>`)
      .join("");
    return `<div class="asset-chip-wrap">${chip(c.id, `${c.label}${subLabel}`, active, 'aria-haspopup="menu" aria-expanded="false" data-asset-toggle')}<div class="asset-menu" role="menu" aria-label="${c.label} filter" hidden>${items}</div></div>`;
  }).join("");
  document.getElementById("asset-filter").innerHTML = all + classes;
}

function closeAssetMenus(except = null) {
  for (const wrap of document.querySelectorAll(".asset-chip-wrap")) {
    if (wrap === except) continue;
    wrap.querySelector(".asset-menu").hidden = true;
    wrap.querySelector("[data-asset-toggle]").setAttribute("aria-expanded", "false");
  }
}

function setAssetFilter(cls, sub = "") {
  assetFilter = { cls, sub };
  saveAssetFilter();
  renderAssetFilter();
  renderTicker();
  refreshTicker();
}

// Yahoo has quoted the yield indices both as the yield (4.28) and as 10x (42.8); a
// real yield above 20% is implausible here, so treat such values as 10x.
function tickerQuote(t) {
  const q = tickerQuotes.get(t.symbol);
  if (!q || q.error) return null;
  const scale = t.kind === "yield" && q.price > 20 ? 10 : 1;
  const price = q.price / scale;
  const prev = q.prevClose == null ? null : q.prevClose / scale;
  return { price, change: prev == null ? 0 : price - prev, pct: q.changePercent, prev };
}

// Pixels/second the marquee moves at — picked so a figure is readable in
// passing, not so slow it looks stalled.
const TICKER_PX_PER_SEC = 55;

function renderTicker() {
  const strip = document.getElementById("ticker-strip");
  const list = visibleTickers();
  const itemsHtml = list
    .map((t) => {
      const q = tickerQuote(t);
      const dp = t.dp ?? 2;
      // a move that rounds to zero in the displayed unit reads as flat
      const shown = !q ? 0 : t.kind === "yield" ? Number((q.change * 100).toFixed(1)) : Number(q.pct.toFixed(2));
      const dir = q ? changeClass(shown) : "flat";
      const val = !q ? "—" : t.kind === "yield" ? `${q.price.toFixed(3)}%` : `${t.prefix || ""}${q.price.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;
      const move = !q ? "" : t.kind === "yield" ? `${shown > 0 ? "+" : ""}${shown.toFixed(1)} bp` : fmtPct(q.pct);
      const arrow = !q || dir === "flat" ? "" : dir === "up" ? "&uarr;" : "&darr;";
      const tip = q ? `${t.name} (${t.symbol}) · previous close ${q.prev == null ? "n/a" : q.prev.toLocaleString("en-US", { maximumFractionDigits: 4 })}` : `${t.name} (${t.symbol}) · price unavailable`;
      return `<div class="tk ${dir}${q ? "" : " na"}" role="listitem" title="${tip.replace(/"/g, "&quot;")}"><span class="tk-name">${t.label}</span><span class="tk-val">${val}</span><span class="tk-pct">${move}</span><span class="tk-arrow">${arrow}</span></div>`;
    })
    .join("");

  if (!itemsHtml) {
    strip.innerHTML = "";
    return;
  }

  // Two back-to-back copies of the same items: animating the track from
  // translateX(0) to translateX(-50%) moves exactly one copy's width, so
  // the point where it loops back to the start is invisible — the strip
  // just keeps running, like a train.
  strip.innerHTML = `<div class="ticker-track">${itemsHtml}${itemsHtml}</div>`;
  const track = strip.firstElementChild;
  const singleWidth = track.scrollWidth / 2;
  const duration = singleWidth > 0 ? singleWidth / TICKER_PX_PER_SEC : 40;
  track.style.setProperty("--ticker-dur", `${duration}s`);
}

async function refreshTicker() {
  const symbols = visibleTickers().map((t) => t.symbol);
  try {
    const { map } = await fetchQuotes(symbols);
    for (const [k, v] of map) tickerQuotes.set(k, v);
    renderTicker();
  } catch (err) {
    console.error("ticker refresh failed", err);
  }
}

document.getElementById("asset-filter").addEventListener("click", (e) => {
  const toggle = e.target.closest("[data-asset-toggle]");
  const item = e.target.closest(".asset-menu button");
  if (item) {
    closeAssetMenus();
    return setAssetFilter(item.dataset.assetCls, item.dataset.assetSub);
  }
  if (toggle) {
    const wrap = toggle.closest(".asset-chip-wrap");
    const menu = wrap.querySelector(".asset-menu");
    closeAssetMenus(wrap);
    menu.hidden = !menu.hidden;
    toggle.setAttribute("aria-expanded", String(!menu.hidden));
    if (!menu.hidden) menu.querySelector("button").focus({ preventScroll: true });
    return;
  }
  const chip = e.target.closest("[data-asset-cls]");
  if (chip) setAssetFilter(chip.dataset.assetCls);
});
document.addEventListener("click", (e) => {
  if (!e.target.closest(".asset-chip-wrap")) closeAssetMenus();
});
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  const open = [...document.querySelectorAll(".asset-menu")].find((m) => !m.hidden);
  if (!open) return;
  closeAssetMenus();
  open.parentElement.querySelector("[data-asset-toggle]").focus();
});
function setCountry(code) {
  const country = COUNTRIES.find((c) => c.code === code);
  if (!country || country.code === activeCountry.code) return;
  activeCountry = country;
  document.getElementById("detail-card").hidden = true;
  renderCountryFilter();
  populateSectorFilter();
  refresh();
}

// Used by other tabs: open the Stocks tab for an Indian sector or stock.
function openSectorInStocks(sectorName) {
  setCountry("IN");
  if (groupMode !== "classic") {
    // the caller passes a classic label, so rebuild the filter options for that grouping
    groupMode = "classic";
    document.getElementById("group-mode").value = "classic";
    populateSectorFilter();
    if (window.__lastMap) renderSectorHeatmap(window.__lastMap);
  }
  const select = document.getElementById("sector-filter");
  select.value = sectorName;
  renderTreemap(window.__lastMap, select.value);
  showTab("stocks");
}

function openStockFundamentals(stock) {
  setCountry("IN");
  showTab("stocks");
  showFundamentals(stock);
}

function renderCountryFilter() {
  const el = document.getElementById("country-filter");
  el.innerHTML = "";
  for (const country of COUNTRIES) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "country-pill" + (country.code === activeCountry.code ? " active" : "");
    btn.innerHTML = `${FLAGS.svg(country.code)} ${country.name}`;
    btn.title = country.exchange;
    btn.addEventListener("click", () => setCountry(country.code));
    el.appendChild(btn);
  }
}

// ---- Country index: price is live every refresh tick (REFRESH_MS); the
// 1W/1M/3M/6M/1Y figures come from a separate, heavier fetch (2y of daily
// bars) that only needs to happen once per symbol, cached client-side on
// top of the server's own cache. All six periods are shown at once (no
// toggle/selection) — 1D is the always-live one, the rest fill in once
// that fetch resolves. ----
const indexPeriodsCache = new Map(); // indexSymbol -> { data, ts }
const INDEX_PERIODS_TTL = 5 * 60_000;
const INDEX_PERIOD_IDS = ["1D", "1W", "1M", "3M", "6M", "1Y"];

async function ensureIndexPeriods(symbol) {
  const cached = indexPeriodsCache.get(symbol);
  if (cached && Date.now() - cached.ts < INDEX_PERIODS_TTL) return cached.data;
  const res = await fetch(`/api/quotes/periods?symbol=${encodeURIComponent(symbol)}`);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  const data = await res.json();
  indexPeriodsCache.set(symbol, { data, ts: Date.now() });
  return data;
}

function renderCountryIndex(map) {
  const el = document.getElementById("country-index");
  const q = map.get(activeCountry.indexSymbol);
  if (!q || q.error) {
    el.innerHTML = `<span class="muted">${activeCountry.indexLabel} — data unavailable</span>`;
    return;
  }

  const symbol = activeCountry.indexSymbol;
  const cached = indexPeriodsCache.get(symbol);
  const periods = cached ? cached.data.periods : null;
  const row = INDEX_PERIOD_IDS.map((id) => {
    // 1D always has a live figure from the regular quote, even before the
    // periods fetch resolves; the rest show "…" until it does.
    const pct = id === "1D" ? q.changePercent : periods ? periods[id] : null;
    return `<span class="ci-period ${changeClass(pct)}"><b>${id}</b> ${pct == null ? "…" : fmtPct(pct)}</span>`;
  }).join(`<span class="ci-period-sep">|</span>`);

  el.innerHTML = `
    <span class="country-index-label">${FLAGS.svg(activeCountry.code)} ${activeCountry.indexLabel} <span class="muted">(${activeCountry.exchange})</span></span>
    <span class="country-index-price">${fmtPrice(q.price)}</span>
    <div class="ci-periods">${row}</div>
  `;

  if (!periods) {
    ensureIndexPeriods(symbol)
      .then(() => { if (activeCountry.indexSymbol === symbol && window.__lastMap) renderCountryIndex(window.__lastMap); })
      .catch(() => {}); // 1D still shows live; the rest just stay "…" until the next render retries
  }
}

// ---- Sector Heatmap (India, classic grouping): NSE's own live "SECTORAL
// INDICES" — a real % change and a real P/E per sector — replace the
// constituent-average approach for India's classic grouping whenever
// they're available, since they cover sectors with no/too-few Nifty 50
// names (Capital Mkts, Media, Realty, MNC) and carry a P/E the averaging
// approach has no way to produce. Lazy-loaded once, cached client-side; the
// heatmap quietly falls back to the derived-from-constituents approach if
// the fetch fails, hasn't resolved yet, or the country/grouping isn't
// India-classic. See nse-sector-indices.js for the server side. ----
const SECTOR_INDEX_TTL = 60_000;
let sectorIndexState = { data: null, ts: 0, promise: null };

function ensureSectorIndices() {
  if (sectorIndexState.data && Date.now() - sectorIndexState.ts < SECTOR_INDEX_TTL) return Promise.resolve(sectorIndexState.data);
  if (sectorIndexState.promise) return sectorIndexState.promise;
  const promise = fetch("/api/indices/in/sectors")
    .then((res) => { if (!res.ok) throw new Error(`API error ${res.status}`); return res.json(); })
    .then((data) => { sectorIndexState = { data, ts: Date.now(), promise: null }; return data; })
    .catch((err) => { sectorIndexState.promise = null; throw err; });
  sectorIndexState.promise = promise;
  return promise;
}

function renderSectorHeatmap(map) {
  const liveEligible = activeCountry.code === "IN" && groupMode === "classic";
  const live = liveEligible && sectorIndexState.data ? sectorIndexState.data.sectors : null;
  const useLive = !!(live && live.length);

  let rows;
  if (useLive) {
    const filterOptions = new Set([...document.getElementById("sector-filter").options].map((o) => o.value));
    rows = live
      .filter((s) => s.pct != null)
      .map((s) => ({ sector: s.label, avg: s.pct, pe: s.pe, hasFilter: filterOptions.has(s.label) }))
      .sort((a, b) => b.avg - a.avg);
  } else {
    const bySector = new Map();
    for (const s of activeCountry.stocks) {
      const q = map.get(s.symbol);
      if (!q || q.error) continue;
      const g = groupOf(s);
      if (!bySector.has(g)) bySector.set(g, []);
      bySector.get(g).push(q.changePercent);
    }
    rows = [...bySector.entries()]
      .map(([sector, pcts]) => ({
        sector,
        avg: pcts.reduce((a, b) => a + b, 0) / pcts.length,
        count: pcts.length,
        hasFilter: true,
      }))
      .sort((a, b) => b.avg - a.avg);
  }

  const modeLabel = { classic: "", mes: " · grouped by NSE macro-economic sector", sec: " · grouped by NSE sector", ind: " · grouped by NSE industry" }[activeCountry.code === "IN" ? groupMode : "classic"];
  document.getElementById("sector-heatmap-sub").textContent = useLive
    ? "· NSE sectoral indices (live)"
    : `· derived from ${activeCountry.name} constituents${modeLabel}`;
  const groupSel = document.getElementById("group-mode");
  groupSel.hidden = activeCountry.code !== "IN";
  groupSel.value = groupMode;

  const el = document.getElementById("sector-heatmap");
  el.innerHTML = "";
  for (const row of rows) {
    const tile = document.createElement("div");
    const cls = changeClass(row.avg);
    tile.className = `sector-tile ${cls}`;
    tile.style.setProperty("--heat", heat(row.avg).toFixed(2));
    const metric = row.pe != null ? `PE ${row.pe.toFixed(1)}` : row.count != null ? `${row.count} stk` : "";
    tile.innerHTML = `
      <div class="sector-name">${row.sector}</div>
      <div class="sector-pct">${fmtPct(row.avg)}</div>
      <div class="sector-count">${metric}</div>
    `;
    tile.addEventListener("click", () => {
      document.getElementById("sector-filter").value = row.hasFilter ? row.sector : "";
      renderTreemap(window.__lastMap, row.hasFilter ? row.sector : "");
      showTab("stocks");
    });
    el.appendChild(tile);
  }

  if (liveEligible && !sectorIndexState.data) {
    ensureSectorIndices()
      .then(() => { if (activeCountry.code === "IN" && groupMode === "classic" && window.__lastMap) renderSectorHeatmap(window.__lastMap); })
      .catch(() => {}); // stays on the derived heatmap if this never resolves
  }
}

function populateSectorFilter() {
  const select = document.getElementById("sector-filter");
  select.innerHTML = '<option value="">All sectors</option>';
  const sectors = [...new Set(activeCountry.stocks.map(groupOf))].sort();
  for (const sector of sectors) {
    const opt = document.createElement("option");
    opt.value = sector;
    opt.textContent = sector;
    select.appendChild(opt);
  }
}

function renderTreemap(map, sectorFilter = "") {
  if (!map) return;
  document.getElementById("treemap-sub").innerHTML = `· ${FLAGS.svg(activeCountry.code)} ${activeCountry.name}${sectorFilter ? " · " + sectorFilter : ""}`;
  const el = document.getElementById("treemap");
  el.innerHTML = "";
  const stocks = sectorFilter
    ? activeCountry.stocks.filter((s) => groupOf(s) === sectorFilter)
    : activeCountry.stocks;

  for (const s of stocks) {
    const q = map.get(s.symbol);
    const pct = q && !q.error ? q.changePercent : null;
    const tile = document.createElement("div");
    tile.className = `stock-tile ${changeClass(pct)}`;
    tile.style.setProperty("--heat", heat(pct).toFixed(2));
    tile.innerHTML = `
      <div class="stock-name">${s.name}</div>
      <div class="stock-price">${q && !q.error ? fmtPrice(q.price, currencyPrefix(s.symbol)) : "—"}</div>
      <div class="stock-pct">${pct != null ? fmtPct(pct) : "n/a"}</div>
    `;
    if (activeCountry.code === "IN") {
      tile.classList.add("clickable");
      tile.title = "Click for Screener.in fundamentals";
      tile.addEventListener("click", () => showFundamentals(s));
    }
    el.appendChild(tile);
  }
}

function renderBreadth(map) {
  document.getElementById("breadth-title-text").textContent = `${activeCountry.name.toUpperCase()} BREADTH`;
  let adv = 0,
    dec = 0;
  for (const s of activeCountry.stocks) {
    const q = map.get(s.symbol);
    if (!q || q.error) continue;
    if (q.changePercent > 0) adv++;
    else if (q.changePercent < 0) dec++;
  }
  const total = adv + dec || 1;
  document.getElementById("adv-count").textContent = `${adv} ▲`;
  document.getElementById("dec-count").textContent = `▼ ${dec}`;
  document.getElementById("ad-ratio").textContent = `A/D ${(adv / (dec || 1)).toFixed(2)}`;
  document.getElementById("breadth-fill").style.width = `${(adv / total) * 100}%`;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

async function showFundamentals(stock) {
  const card = document.getElementById("detail-card");
  const body = document.getElementById("detail-body");
  document.getElementById("detail-title").textContent = `${stock.name} · FUNDAMENTALS (SCREENER.IN)`;
  card.hidden = false;
  body.innerHTML = '<div class="ticker-loading">Loading from Screener.in…</div>';
  card.scrollIntoView({ behavior: "smooth", block: "nearest" });

  try {
    const res = await fetch(`/api/screener/${encodeURIComponent(stock.symbol.replace(/\.NS$/, ""))}`);
    const json = await res.json();
    if (!res.ok) {
      body.innerHTML = `<div class="muted">${escapeHtml(json.message || json.error || "Request failed")}</div>`;
      return;
    }
    const items = json.ratios
      .map((r) => `<div class="ratio"><div class="ratio-name">${escapeHtml(r.name)}</div><div class="ratio-value">${escapeHtml(normMoney(r.value))}</div></div>`)
      .join("");
    body.innerHTML = `
      <div class="detail-company">${escapeHtml(json.companyName || stock.name)}</div>
      <div class="ratio-grid">${items}</div>
      <a class="detail-link" href="${escapeHtml(json.url)}" target="_blank" rel="noopener">Open on Screener.in &rarr;</a>
    `;
  } catch (err) {
    body.innerHTML = '<div class="muted">Could not reach the server.</div>';
  }
}

async function refresh() {
  try {
    const countrySymbols = [activeCountry.indexSymbol, ...new Set(activeCountry.stocks.map((s) => s.symbol))];
    const allSymbols = [...new Set(countrySymbols)];
    const { map, updatedAt } = await fetchQuotes(allSymbols);
    window.__lastMap = map;

    renderCountryIndex(map);
    renderSectorHeatmap(map);
    renderTreemap(map, document.getElementById("sector-filter").value);
    renderBreadth(map);

    const stamp = new Date(updatedAt).toLocaleTimeString("en-IN", { hour12: false });
    document.getElementById("footer-updated").textContent = stamp;
    document.getElementById("breadth-updated").textContent = `· ${stamp}`;
  } catch (err) {
    console.error("refresh failed", err);
    document.getElementById("footer-updated").textContent = "error — retrying…";
  }
}

document.getElementById("detail-close").addEventListener("click", () => {
  document.getElementById("detail-card").hidden = true;
});

// ---- Tabs: every <a data-tab> in #tabs shows the matching [data-panel] ----
// Hashes look like "#tab" or "#tab/sub" (sub is handled by the tab's own code).
function showTab(raw) {
  let [name] = String(raw || "").split("/");
  if (name === "filings") name = "universe"; // old Annual Reports links
  const tabs = [...document.querySelectorAll("#tabs .tab")];
  if (!tabs.some((t) => t.dataset.tab === name)) name = tabs[0].dataset.tab;
  for (const t of tabs) t.classList.toggle("active", t.dataset.tab === name);
  for (const p of document.querySelectorAll(".tab-panel")) p.hidden = p.dataset.panel !== name;
  if (location.hash.slice(1).split("/")[0] !== name) history.replaceState(null, "", `#${name}`);
  window.scrollTo({ top: 0 });
  document.dispatchEvent(new CustomEvent("tabchange", { detail: { name } }));
}
for (const t of document.querySelectorAll("#tabs .tab")) {
  t.addEventListener("click", (e) => {
    e.preventDefault();
    showTab(t.dataset.tab);
  });
}
window.addEventListener("hashchange", () => showTab(location.hash.slice(1)));
showTab(location.hash.slice(1));

renderClock();
renderAssetFilter();
renderTicker();
refreshTicker();
setInterval(refreshTicker, REFRESH_MS);
renderCountryFilter();
populateSectorFilter();
document.getElementById("sector-filter").addEventListener("change", (e) => renderTreemap(window.__lastMap, e.target.value));
document.getElementById("group-mode").addEventListener("change", (e) => {
  groupMode = e.target.value;
  populateSectorFilter();
  document.getElementById("sector-filter").value = "";
  renderSectorHeatmap(window.__lastMap);
  renderTreemap(window.__lastMap, "");
});
refresh();
setInterval(refresh, REFRESH_MS);
