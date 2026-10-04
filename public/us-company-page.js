// US company page, opened from the Universe tab (#universe/US/TICKER).
//
// Data: Finviz (via /api/finviz/:ticker) for the price, ~70-metric snapshot,
// about, analyst ratings, news and insider trades; SEC EDGAR (via
// /api/filings/us/:ticker) for annual reports; TradingView for the chart. If
// Finviz can't be read (rate limit, block), the chart, annual reports and
// a link out to Finviz still work.
//
// Exposes window.UsCompanyPage.open(container, ticker, nameHint) / .close().
(function () {
  "use strict";

  const WIDGET_SRC = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const TV_EXCH = { NASDAQ: "NASDAQ", NYSE: "NYSE", AMEX: "AMEX", "NYSE ARCA": "AMEX" };
  const DOLLAR = new Set(["Price", "Target Price", "Prev Close", "Open", "High", "Low"]);
  const SECTIONS = [
    ["us-chart", "Chart"], ["us-snap", "Snapshot"], ["us-about", "About"], ["us-ratings", "Analysts"],
    ["us-news", "News"], ["us-insiders", "Insiders"], ["us-reports", "Annual Reports"],
  ];

  const cache = new Map();
  let token = 0;

  const finvizUrl = (t) => `https://finviz.com/quote.ashx?t=${encodeURIComponent(t.replace(/\./g, "-"))}`;
  const tvSymbol = (t, exch) => {
    const sym = t.replace(/-/g, ".");
    return TV_EXCH[String(exch || "").toUpperCase()] ? `${TV_EXCH[String(exch).toUpperCase()]}:${sym}` : sym;
  };
  const tone = (v) => (/^-/.test(String(v).trim()) ? "neg" : /^\+/.test(String(v).trim()) ? "pos" : "");

  async function getJSON(url) {
    try {
      const res = await fetch(url);
      const body = await res.json().catch(() => ({}));
      return res.ok ? { data: body } : { error: body.error || "error", message: body.message || `Request failed (${res.status})` };
    } catch {
      return { error: "network", message: "Couldn't reach the server." };
    }
  }

  function snapshotHtml(snap) {
    if (!snap || !snap.length) return `<p class="sc-empty">No snapshot data.</p>`;
    return `<div class="us-snap">${snap
      .map((s) => `<div class="us-kv"><span>${esc(s.label)}</span><b class="${tone(s.value)}">${esc(DOLLAR.has(s.label) && /^[\d.,]+$/.test(s.value) ? "$" + s.value : s.value)}</b></div>`)
      .join("")}</div>`;
  }

  function plainTable(headers, rows) {
    const head = headers && headers.length ? `<thead><tr>${headers.map((h, i) => `<th class="${i === 0 ? "sc-first" : ""}">${esc(h)}</th>`).join("")}</tr></thead>` : "";
    return `<div class="sc-scroll"><table class="sc-table">${head}<tbody>${rows
      .map((r) => `<tr>${r.map((c, i) => `<td class="${i === 0 ? "sc-first" : tone(c) === "neg" ? "neg" : ""}">${esc(c)}</td>`).join("")}</tr>`)
      .join("")}</tbody></table></div>`;
  }

  function card(id, title, sub, inner) {
    return `<section class="card sc-card" id="${id}"><h3 class="sc-h">${esc(title)}</h3>${sub ? `<p class="sc-sub">${esc(sub)}</p>` : ""}${inner}</section>`;
  }

  function newsHtml(news) {
    if (!news || !news.length) return `<p class="sc-empty">No recent news.</p>`;
    return `<ul class="us-news">${news
      .map((n) => `<li><span class="us-when">${esc(n.date)}</span><a href="${esc(n.url)}" target="_blank" rel="noopener noreferrer">${esc(n.title)}</a>${n.source ? `<small>${esc(n.source)}</small>` : ""}</li>`)
      .join("")}</ul>`;
  }

  function reportsHtml(out) {
    if (!out) return `<p class="sc-empty">Loading from SEC EDGAR…</p>`;
    if (out.error) return `<p class="sc-empty">${esc(out.message)}</p>`;
    const list = out.data.filings || [];
    if (!list.length) return `<p class="sc-empty">No 10-K or 20-F in SEC EDGAR's recent filings window.</p>`;
    return `<div class="sc-scroll"><table class="sc-table"><thead><tr><th class="sc-first">Form</th><th>Filed</th><th>Period</th><th></th></tr></thead><tbody>${list
      .slice(0, 12)
      .map((f) => `<tr><td class="sc-first">${esc(f.form)}</td><td>${esc(f.filingDate || "—")}</td><td>${esc(f.reportDate || "—")}</td><td><a class="kc-src" href="${esc(f.url)}" target="_blank" rel="noopener noreferrer">View →</a></td></tr>`)
      .join("")}</tbody></table></div>`;
  }

  function header(t, d, nameHint) {
    const name = (d && d.name) || nameHint || t;
    const price = d && d.price ? `<span class="sc-price">$${esc(d.price)}</span>` : "";
    const ch = d && d.change ? `<span class="sc-chg ${/^-/.test(d.change) ? "dn" : "up"}">${esc(d.change)}</span>` : "";
    const tags = d ? [d.sector, d.industry, d.country, d.exchange].filter(Boolean) : [];
    return `<section class="card sc-head">
      <div class="sc-title"><h2>${esc(name)} <span class="us-tick">${esc(t)}</span></h2><div class="sc-pricebox">${price}${ch}</div></div>
      ${tags.length ? `<div class="sc-tags">${tags.map((x, i) => `<span class="sc-tag${i ? " alt" : ""}">${esc(x)}</span>`).join("")}</div>` : ""}
      <div class="sc-actions">
        <a class="ur-browse ghost" href="#chart/${encodeURIComponent(tvSymbol(t, d && d.exchange))}">Full chart</a>
        <a class="ur-browse ghost" href="${finvizUrl(t)}" target="_blank" rel="noopener">Finviz ↗</a>
      </div>
    </section>`;
  }

  function mountChart(box, sym) {
    const wrap = document.createElement("div");
    wrap.className = "tradingview-widget-container";
    wrap.style.cssText = "height:100%;width:100%";
    const inner = document.createElement("div");
    inner.className = "tradingview-widget-container__widget";
    inner.style.cssText = "height:100%;width:100%";
    const script = document.createElement("script");
    script.async = true;
    script.src = WIDGET_SRC;
    script.textContent = JSON.stringify({
      autosize: true, symbol: sym, interval: "D", timezone: "America/New_York", theme: "dark", style: "1", locale: "en",
      backgroundColor: "#0e0e10", gridColor: "rgba(255, 255, 255, 0.06)", allow_symbol_change: false, withdateranges: true,
      hide_side_toolbar: true, save_image: false, calendar: false, support_host: "https://www.tradingview.com",
    });
    script.onerror = () => {
      box.innerHTML = `<div class="ch-fail">TradingView couldn't be loaded. <a href="https://www.tradingview.com/chart/?symbol=${encodeURIComponent(sym)}" target="_blank" rel="noopener noreferrer">Open the chart on tradingview.com ↗</a></div>`;
    };
    wrap.append(inner, script);
    box.append(wrap);
  }

  function open(container, ticker, nameHint) {
    const my = ++token;
    const t = String(ticker).toUpperCase();
    let fv = cache.get("fv:" + t) || null;
    let sec = cache.get("sec:" + t) || null;
    let chartNode = null;
    let chartSym = null;

    const render = () => {
      const d = fv && fv.data;
      const sections = [];
      if (!fv) sections.push(`<section class="card sc-card"><p class="sc-empty">Loading from Finviz… the first view of a company takes a few seconds.</p></section>`);
      else if (fv.error) {
        sections.push(`<section class="card sc-card sc-fail"><h3 class="sc-h">Couldn't load Finviz data</h3><p>${esc(fv.message)}</p><p><a class="ur-browse" href="${finvizUrl(t)}" target="_blank" rel="noopener">Open on Finviz ↗</a></p></section>`);
      } else {
        sections.push(card("us-snap", "Snapshot", "Key statistics from Finviz", snapshotHtml(d.snapshot)));
        sections.push(card("us-about", "About", [d.sector, d.industry].filter(Boolean).join(" · "), `<p class="us-about">${esc(d.description) || "No description available."}</p>`));
        if (d.ratings) sections.push(card("us-ratings", "Analyst ratings", "Latest rating changes", plainTable(["Date", "Action", "Analyst", "Rating", "Price target"], d.ratings.rows)));
        sections.push(card("us-news", "News", "", newsHtml(d.news)));
        if (d.insiders) sections.push(card("us-insiders", "Insider trading", "", plainTable(d.insiders.headers, d.insiders.rows)));
      }
      sections.push(card("us-reports", "Annual Reports", "10-K and 20-F filings from SEC EDGAR", reportsHtml(sec)));

      container.innerHTML = `${header(t, d, nameHint)}
        <nav class="sc-nav" aria-label="Sections">${SECTIONS.map(([id, l]) => `<a href="#" data-sc="${id}">${esc(l)}</a>`).join("")}</nav>
        <section class="card sc-card" id="us-chart"><div class="sc-chartbox" id="us-chartbox"></div></section>${sections.join("")}`;

      const slot = container.querySelector("#us-chartbox");
      const want = tvSymbol(t, d && d.exchange);
      if (chartNode && chartSym === want) slot.replaceWith(chartNode); // keep the chart across re-renders
      else { mountChart(slot, want); chartNode = slot; chartSym = want; }
    };

    render();
    const finish = (key, out, set) => {
      if (!out.error) cache.set(key, out);
      set(out);
      if (my !== token) return;
      const y = window.scrollY;
      render();
      window.scrollTo({ top: y });
    };
    if (!fv) getJSON(`/api/finviz/${encodeURIComponent(t)}`).then((o) => finish("fv:" + t, o, (x) => (fv = x)));
    if (!sec) getJSON(`/api/filings/us/${encodeURIComponent(t)}`).then((o) => finish("sec:" + t, o, (x) => (sec = x)));

    container.onclick = (e) => {
      const nav = e.target.closest("[data-sc]");
      if (!nav) return;
      e.preventDefault();
      const el = container.querySelector("#" + nav.dataset.sc);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    };
  }

  function close(container) {
    token++;
    if (container) { container.onclick = null; container.innerHTML = ""; }
  }

  window.UsCompanyPage = { open, close };
})();
