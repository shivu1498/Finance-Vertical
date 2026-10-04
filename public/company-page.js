// Screener-style company page, opened from the Universe tab (#universe/IN/SYMBOL).
//
// What it shows comes from two places:
//  - companies.json (always): name, NSE/BSE codes, ISIN, industry group.
//  - /api/screener/company/:symbol (needs SCREENER_SESSIONID on the server):
//    price, key ratios, about, pros/cons, peers, quarterly results, profit &
//    loss, balance sheet, cash flows, ratios and shareholding, as read from
//    Screener.in. Without it the page still opens with the first part plus a
//    TradingView chart and a link to the company on Screener.
//
// Exposes window.CompanyPage.open(container, rec) / .close().
(function () {
  "use strict";

  const WIDGET_SRC = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const cache = new Map(); // symbol -> { data } | { error, message }
  let token = 0;           // drops late responses after navigating away

  const SECTIONS = [
    ["sc-chart", "Chart"],
    ["sc-analysis", "Analysis"],
    ["sc-peers", "Peers"],
    ["sc-quarters", "Quarters"],
    ["sc-pl", "Profit & Loss"],
    ["sc-bs", "Balance Sheet"],
    ["sc-cf", "Cash Flow"],
    ["sc-ratios", "Ratios"],
    ["sc-holders", "Investors"],
  ];

  function screenerUrl(rec) {
    return `https://www.screener.in/company/${encodeURIComponent(rec.code)}/consolidated/`;
  }
  const tvSymbol = (rec) => (rec.nse ? `NSE:${rec.nse.replace(/[&-]/g, "_")}` : `BSE:${rec.bse}`);

  /* ---------- tables ---------- */
  function numClass(v) {
    return /^-\s*[₹\d.,]+/.test(v) ? "neg" : "";
  }

  // Rows that are ratios, days or percentages are not rupee amounts.
  const NON_MONEY = /%|days|ratio|cycle|yield|payout|\bno\.? of|turnover|multiple|holders/i;
  const isNum = (v) => /^-?\s*[\d,]+(\.\d+)?$/.test(v);
  const rupee = (v) => (isNum(v) ? (v.trim().startsWith("-") ? "-₹" + v.replace("-", "").trim() : "₹" + v) : v);
  const norm = (s) => (typeof normMoney === "function" ? normMoney(s) : s);

  function statTable(t, opts = {}) {
    if (!t || !t.rows.length) return `<p class="sc-empty">No data on Screener for this section.</p>`;
    // opts.money: amounts get a ₹ and the corner cell says the unit (₹ Cr).
    const head = t.headers.map((h, i) => `<th${i === 0 ? ' class="sc-first"' : ""}>${esc(i === 0 && opts.money && !h ? "₹ Cr" : norm(h))}</th>`).join("");
    const body = t.rows
      .map((r) => {
        const m = opts.money && !NON_MONEY.test(r.name);
        return `<tr class="${r.strong ? "strong" : ""}"><td class="sc-first">${esc(r.name)}</td>${r.values.map((v) => { const x = m ? rupee(v) : v; return `<td class="${numClass(x)}">${esc(x)}</td>`; }).join("")}</tr>`;
      })
      .join("");
    return `<div class="sc-scroll${opts.tight ? " tight" : ""}"><table class="sc-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
  }

  function peersTable(p, rec) {
    if (!p || !p.rows.length) return `<p class="sc-empty">Peer comparison isn't available.</p>`;
    const head = p.headers.map((h, i) => `<th class="${i <= 1 ? "sc-first" : ""}">${esc(norm(h))}</th>`).join("");
    const moneyCol = p.headers.map((h) => /\bRs\./.test(h));
    const body = p.rows
      .map((r) => {
        const me = r.symbol && (r.symbol === rec.nse || r.symbol === rec.bse);
        const cells = r.cells
          .map((c, i) => {
            if (i === 1) {
              return r.symbol
                ? `<td class="sc-first"><a href="#universe/IN/${encodeURIComponent(r.symbol)}">${esc(c)}</a></td>`
                : `<td class="sc-first">${esc(c)}</td>`;
            }
            const x = moneyCol[i] ? rupee(c) : c;
            return `<td class="${i === 0 ? "sc-first" : numClass(x)}">${esc(x)}</td>`;
          })
          .join("");
        return `<tr class="${me ? "me" : ""}${r.symbol ? "" : " median"}">${cells}</tr>`;
      })
      .join("");
    return `<div class="sc-scroll"><table class="sc-table sc-peers"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
  }

  /* ---------- sections ---------- */
  function card(id, title, sub, inner) {
    return `<section class="card sc-card" id="${id}">
      <h3 class="sc-h">${esc(title)}</h3>
      ${sub ? `<p class="sc-sub">${esc(norm(sub))}</p>` : ""}
      ${inner}
    </section>`;
  }

  function ratiosGrid(ratios) {
    if (!ratios.length) return "";
    return `<ul class="sc-ratios">${ratios.map((r) => `<li><span>${esc(norm(r.name))}</span><b>${esc(norm(r.value))}</b></li>`).join("")}</ul>`;
  }

  function rangesHtml(ranges) {
    if (!ranges || !ranges.length) return "";
    return `<div class="sc-ranges">${ranges
      .map((g) => `<div class="sc-range"><h4>${esc(g.title)}</h4>${g.rows.map(([k, v]) => `<div><span>${esc(k)}:</span><b>${esc(v)}</b></div>`).join("")}</div>`)
      .join("")}</div>`;
  }

  function holdersHtml(sh) {
    if (!sh) return `<p class="sc-empty">No shareholding data.</p>`;
    const both = sh.quarterly && sh.yearly;
    return `${both ? `<div class="k-seg sc-seg" role="tablist"><button type="button" class="active" data-shp="q">Quarterly</button><button type="button" data-shp="y">Yearly</button></div>` : ""}
      <div data-shp-pane="q">${statTable(sh.quarterly || sh.yearly)}</div>
      ${both ? `<div data-shp-pane="y" hidden>${statTable(sh.yearly)}</div>` : ""}`;
  }

  function dataSections(d, rec) {
    const t = d.tables || {};
    const basis = (x) => (x && x.basis) || "";
    const analysis =
      d.pros.length || d.cons.length
        ? `<div class="sc-proscons">
            <div class="sc-pros"><h4>Pros</h4><ul>${d.pros.map((x) => `<li>${esc(x)}</li>`).join("") || "<li>—</li>"}</ul></div>
            <div class="sc-cons"><h4>Cons</h4><ul>${d.cons.map((x) => `<li>${esc(x)}</li>`).join("") || "<li>—</li>"}</ul></div>
          </div><p class="sc-note">The pros and cons are machine generated by Screener.</p>`
        : `<p class="sc-empty">No pros or cons listed.</p>`;
    const crumbs = d.path && d.path.length ? `<p class="sc-crumbs">${d.path.map(esc).join(" › ")}</p>` : "";
    return `
      ${card("sc-analysis", "Pros & Cons", "", analysis)}
      ${card("sc-peers", "Peer comparison", "", crumbs + peersTable(d.peers, rec))}
      ${card("sc-quarters", "Quarterly Results", basis(t.quarters), statTable(t.quarters, { money: true }))}
      ${card("sc-pl", "Profit & Loss", basis(t.profitLoss), statTable(t.profitLoss, { money: true }) + rangesHtml(d.ranges))}
      ${card("sc-bs", "Balance Sheet", basis(t.balanceSheet), statTable(t.balanceSheet, { money: true }))}
      ${card("sc-cf", "Cash Flows", basis(t.cashFlow), statTable(t.cashFlow, { money: true }))}
      ${card("sc-ratios", "Ratios", basis(t.ratios), statTable(t.ratios))}
      ${card("sc-holders", "Shareholding Pattern", "Percentage holding", holdersHtml(t.shareholding))}`;
  }

  function failureCard(err, rec) {
    const notConfigured = err.error === "not_configured";
    const msg = notConfigured
      ? `Screener data isn't switched on for this site yet. Add your logged-in Screener cookie as <code>SCREENER_SESSIONID</code> in the server settings (see the README), then reload. Until then you can open this company on Screener directly.`
      : esc(err.message || "Couldn't load Screener data right now.");
    return `<section class="card sc-card sc-fail">
      <h3 class="sc-h">${notConfigured ? "Screener data not connected" : "Couldn't load Screener data"}</h3>
      <p>${msg}</p>
      <p><a class="ur-browse" href="${esc(screenerUrl(rec))}" target="_blank" rel="noopener">Open on Screener ↗</a></p>
    </section>`;
  }

  function loadingCard() {
    return `<section class="card sc-card"><p class="sc-empty">Loading from Screener… the first view of a company takes a few seconds.</p></section>`;
  }

  /* ---------- header ---------- */
  function header(rec, d) {
    const name = (d && d.name) || rec.name;
    const price = d && d.price ? `<span class="sc-price">${esc(d.price)}</span>` : "";
    const ch = d && d.change ? `<span class="sc-chg ${d.change.pct < 0 ? "dn" : "up"}">${d.change.pct > 0 ? "+" : ""}${esc(d.change.pct)}%</span>` : "";
    const links = [];
    if (d && d.links && d.links.website) links.push(`<a href="${esc(d.links.website.href)}" target="_blank" rel="noopener noreferrer">${esc(d.links.website.label)} ↗</a>`);
    if (rec.bse) links.push(`<span>BSE: ${esc(rec.bse)}</span>`);
    if (rec.nse) links.push(`<span>NSE: ${esc(rec.nse)}</span>`);
    return `<section class="card sc-head">
      <div class="sc-title">
        <h2>${esc(name)}</h2>
        <div class="sc-pricebox">${price}${ch}</div>
      </div>
      <div class="sc-links">${links.join("")}</div>
      <div class="sc-tags">
        <span class="sc-tag">${esc(rec.group)}</span><span class="sc-tag alt">${esc(rec.industry)}</span>${rec.isin ? `<span class="sc-tag dim">${esc(rec.isin)}</span>` : ""}
      </div>
      <div class="sc-actions">
        <a class="ur-browse ghost" href="#chart/${encodeURIComponent(tvSymbol(rec))}">Full chart</a>
        <a class="ur-browse ghost" href="${esc(screenerUrl(rec))}" target="_blank" rel="noopener">Screener ↗</a>
      </div>
    </section>`;
  }

  function subnav() {
    return `<nav class="sc-nav" aria-label="Sections">${SECTIONS.map(([id, label]) => `<a href="#" data-sc="${id}">${esc(label)}</a>`).join("")}</nav>`;
  }

  function chartCard(rec) {
    return `<section class="card sc-card" id="sc-chart"><div class="sc-chartbox" id="sc-chartbox"></div></section>`;
  }

  function mountChart(box, rec) {
    if (!box) return;
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
      autosize: true,
      symbol: tvSymbol(rec),
      interval: "D",
      timezone: "Asia/Kolkata",
      theme: "dark",
      style: "1",
      locale: "en",
      backgroundColor: "#0e0e10",
      gridColor: "rgba(255, 255, 255, 0.06)",
      allow_symbol_change: false,
      withdateranges: true,
      hide_side_toolbar: true,
      save_image: false,
      calendar: false,
      support_host: "https://www.tradingview.com",
    });
    script.onerror = () => {
      box.innerHTML = `<div class="ch-fail">TradingView couldn't be loaded. <a href="https://www.tradingview.com/chart/?symbol=${encodeURIComponent(tvSymbol(rec))}" target="_blank" rel="noopener noreferrer">Open the chart on tradingview.com ↗</a></div>`;
    };
    wrap.append(inner, script);
    box.append(wrap);
  }

  /* ---------- open ---------- */
  async function fetchData(sym) {
    if (cache.has(sym)) return cache.get(sym);
    let out;
    try {
      const res = await fetch(`/api/screener/company/${encodeURIComponent(sym)}`);
      const body = await res.json().catch(() => ({}));
      out = res.ok ? { data: body } : { error: body.error || "error", message: body.message || body.error || `Request failed (${res.status})` };
    } catch (e) {
      out = { error: "network", message: "Couldn't reach the server." };
    }
    if (!out.error) cache.set(sym, out); // failures are retried on the next visit
    return out;
  }

  function open(container, rec) {
    const my = ++token;
    let chartNode = null;
    const render = (dataOut) => {
      const d = dataOut && dataOut.data;
      const left = d
        ? `<div class="sc-top">
            <section class="card sc-card sc-ratiocard"><h3 class="sc-h">Key ratios</h3>${ratiosGrid(d.ratios)}</section>
            <section class="card sc-card sc-about"><h3 class="sc-h">About</h3>
              <p>${esc(d.about) || "—"}</p>
              ${d.keyPoints.length ? `<h4>Key points</h4>${d.keyPoints.map((k) => `<p class="sc-kp">${esc(k)}</p>`).join("")}` : ""}
            </section>
          </div>`
        : "";
      const rest = !dataOut ? loadingCard() : d ? dataSections(d, rec) : failureCard(dataOut, rec);
      container.innerHTML = `${header(rec, d)}${subnav()}${left}${chartCard(rec)}${rest}`;
      const slot = container.querySelector("#sc-chartbox");
      if (chartNode) slot.replaceWith(chartNode); // keep the live chart across re-renders
      else { mountChart(slot, rec); chartNode = slot; }
    };

    render(null);
    fetchData(rec.code).then((out) => {
      if (my !== token) return;
      const y = window.scrollY;
      render(out);
      window.scrollTo({ top: y });
    });

    container.onclick = (e) => {
      const nav = e.target.closest("[data-sc]");
      if (nav) {
        e.preventDefault();
        const el = container.querySelector("#" + nav.dataset.sc);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
      const sh = e.target.closest("[data-shp]");
      if (sh) {
        const want = sh.dataset.shp;
        container.querySelectorAll("[data-shp]").forEach((b) => b.classList.toggle("active", b === sh));
        container.querySelectorAll("[data-shp-pane]").forEach((p) => (p.hidden = p.dataset.shpPane !== want));
      }
    };
  }

  function close(container) {
    token++;
    if (container) {
      container.onclick = null;
      container.innerHTML = "";
    }
  }

  window.CompanyPage = { open, close };
})();
