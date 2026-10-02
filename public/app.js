const REFRESH_MS = 30_000;

let activeCountry = COUNTRIES[0];

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

function renderCountryFilter() {
  const el = document.getElementById("country-filter");
  el.innerHTML = "";
  for (const country of COUNTRIES) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "country-pill" + (country.code === activeCountry.code ? " active" : "");
    btn.innerHTML = `${country.flag} ${country.name}`;
    btn.title = country.exchange;
    btn.addEventListener("click", () => {
      if (activeCountry.code === country.code) return;
      activeCountry = country;
      renderCountryFilter();
      populateSectorFilter();
      refresh();
    });
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
    if (!bySector.has(s.sector)) bySector.set(s.sector, []);
    bySector.get(s.sector).push(q.changePercent);
  }

  const rows = [...bySector.entries()]
    .map(([sector, pcts]) => ({
      sector,
      avg: pcts.reduce((a, b) => a + b, 0) / pcts.length,
      count: pcts.length,
    }))
    .sort((a, b) => b.avg - a.avg);

  document.getElementById("sector-heatmap-sub").textContent = `· derived from ${activeCountry.name} constituents`;

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
      document.getElementById("treemap").scrollIntoView({ behavior: "smooth", block: "start" });
    });
    el.appendChild(tile);
  }
}

function populateSectorFilter() {
  const select = document.getElementById("sector-filter");
  select.innerHTML = '<option value="">All sectors</option>';
  const sectors = [...new Set(activeCountry.stocks.map((s) => s.sector))].sort();
  for (const sector of sectors) {
    const opt = document.createElement("option");
    opt.value = sector;
    opt.textContent = sector;
    select.appendChild(opt);
  }
}

function renderTreemap(map, sectorFilter = "") {
  if (!map) return;
  const el = document.getElementById("treemap");
  el.innerHTML = "";
  const stocks = sectorFilter
    ? activeCountry.stocks.filter((s) => s.sector === sectorFilter)
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

renderClock();
renderCountryFilter();
populateSectorFilter();
document.getElementById("sector-filter").addEventListener("change", (e) => renderTreemap(window.__lastMap, e.target.value));
refresh();
setInterval(refresh, REFRESH_MS);
