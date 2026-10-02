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
  return prefix + n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function fmtPct(n) {
  if (n == null || Number.isNaN(n)) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
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

function renderTicker(map) {
  const strip = document.getElementById("ticker-strip");
  strip.innerHTML = "";
  for (const idx of INDICES) {
    const q = map.get(idx.symbol);
    const pct = q && !q.error ? q.changePercent : null;
    const item = document.createElement("div");
    item.className = `ticker-item ${changeClass(pct)}`;
    item.innerHTML = `
      <span class="ticker-label">${idx.label}</span>
      <span class="ticker-price">${q && !q.error ? fmtPrice(q.price, idx.prefix) : "—"}</span>
      <span class="ticker-pct">${pct != null ? fmtPct(pct) : "—"}</span>
    `;
    strip.appendChild(item);
  }
}

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
    btn.innerHTML = `${country.flag} ${country.name}`;
    btn.title = country.exchange;
    btn.addEventListener("click", () => setCountry(country.code));
    el.appendChild(btn);
  }
}

function renderCountryIndex(map) {
  const el = document.getElementById("country-index");
  const q = map.get(activeCountry.indexSymbol);
  if (!q || q.error) {
    el.innerHTML = `<span class="muted">${activeCountry.indexLabel} — data unavailable</span>`;
    return;
  }
  el.innerHTML = `
    <span class="country-index-label">${activeCountry.flag} ${activeCountry.indexLabel} <span class="muted">(${activeCountry.exchange})</span></span>
    <span class="country-index-price">${fmtPrice(q.price)}</span>
    <span class="country-index-pct ${changeClass(q.changePercent)}">${fmtPct(q.changePercent)}</span>
  `;
}

function renderSectorHeatmap(map) {
  const bySector = new Map();
  for (const s of activeCountry.stocks) {
    const q = map.get(s.symbol);
    if (!q || q.error) continue;
    const g = groupOf(s);
    if (!bySector.has(g)) bySector.set(g, []);
    bySector.get(g).push(q.changePercent);
  }

  const rows = [...bySector.entries()]
    .map(([sector, pcts]) => ({
      sector,
      avg: pcts.reduce((a, b) => a + b, 0) / pcts.length,
      count: pcts.length,
    }))
    .sort((a, b) => b.avg - a.avg);

  const modeLabel = { classic: "", mes: " · grouped by NSE macro-economic sector", sec: " · grouped by NSE sector", ind: " · grouped by NSE industry" }[activeCountry.code === "IN" ? groupMode : "classic"];
  document.getElementById("sector-heatmap-sub").textContent = `· derived from ${activeCountry.name} constituents${modeLabel}`;
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
    tile.innerHTML = `
      <div class="sector-name">${row.sector}</div>
      <div class="sector-pct">${fmtPct(row.avg)}</div>
      <div class="sector-count">${row.count} stk</div>
    `;
    tile.addEventListener("click", () => {
      document.getElementById("sector-filter").value = row.sector;
      renderTreemap(window.__lastMap, row.sector);
      showTab("stocks");
    });
    el.appendChild(tile);
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
  document.getElementById("treemap-sub").textContent = `· ${activeCountry.flag} ${activeCountry.name}${sectorFilter ? " · " + sectorFilter : ""}`;
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
      <div class="stock-price">${q && !q.error ? fmtPrice(q.price) : "—"}</div>
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
      .map((r) => `<div class="ratio"><div class="ratio-name">${escapeHtml(r.name)}</div><div class="ratio-value">${escapeHtml(r.value)}</div></div>`)
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
    const allSymbols = [...new Set([...INDICES.map((i) => i.symbol), ...countrySymbols])];
    const { map, updatedAt } = await fetchQuotes(allSymbols);
    window.__lastMap = map;

    renderTicker(map);
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
