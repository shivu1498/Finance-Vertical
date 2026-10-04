// Annual Reports view (inside the Universe tab): SEC EDGAR (US) search + filings, NSE (India) recent
// feed + search. Talks to /api/filings/* (see filings.js).
(function () {
  const root = document.getElementById("f-root");
  if (!root) return;

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const isActive = () =>
    document.querySelector("#tabs .tab.active")?.dataset.tab === "universe" &&
    document.getElementById("ur-reports")?.hidden === false;

  async function getJSON(url) {
    const res = await fetch(url);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
    return body;
  }

  const state = { market: "IN", loaded: false, coverage: null };

  function coverageHtml(cov) {
    if (!cov) return "";
    const card = (m) => `
      <div class="f-cov-card">
        <div class="f-cov-top">
          <span class="f-cov-flag">${m.code}</span>
          <strong>${esc(m.label)}</strong>
          <span class="f-cov-kind">${esc(m.kind)}</span>
        </div>
        <div class="f-cov-src"><a href="${esc(m.sourceUrl)}" target="_blank" rel="noopener">${esc(m.source)}</a></div>
        <p class="f-cov-note">${esc(m.note)}</p>
      </div>`;
    return `
      <div class="f-coverage">${cov.markets.map(card).join("")}</div>
      <p class="f-excluded"><strong>Not available:</strong> ${cov.excluded.map(esc).join(", ")} — ${esc(cov.excludedReason)}</p>`;
  }

  function filingRow(f) {
    const dateStr = f.filingDate || "—";
    const tag = f.form ? `<span class="f-form">${esc(f.form)}</span>` : "";
    return `
      <tr>
        <td><span class="f-mkt">${esc(f.market)}</span></td>
        <td>${esc(f.company)}${f.ticker ? ` <span class="f-ticker">${esc(f.ticker)}</span>` : ""}</td>
        <td>${tag}</td>
        <td>${esc(dateStr)}</td>
        <td><a href="${esc(f.url)}" target="_blank" rel="noopener">View &rarr;</a></td>
      </tr>`;
  }

  function filingsTable(rows, emptyMsg) {
    if (!rows.length) return `<p class="f-empty">${esc(emptyMsg)}</p>`;
    return `
      <table class="f-table">
        <thead><tr><th>Mkt</th><th>Company</th><th>Type</th><th>Filed</th><th></th></tr></thead>
        <tbody>${rows.map(filingRow).join("")}</tbody>
      </table>`;
  }

  function shell() {
    return `
      <div id="f-coverage-mount">${coverageHtml(state.coverage)}</div>
      <div class="f-search">
        <div class="f-market-toggle" role="tablist">
          <button type="button" class="f-mbtn ${state.market === "IN" ? "active" : ""}" data-market="IN">India (NSE)</button>
          <button type="button" class="f-mbtn ${state.market === "US" ? "active" : ""}" data-market="US">United States (SEC)</button>
        </div>
        <form id="f-search-form">
          <input id="f-q" type="text" placeholder="${state.market === "US" ? "Ticker or company name (e.g. AAPL)" : "Company name"}" autocomplete="off">
          <button type="submit">Search</button>
        </form>
      </div>
      <div id="f-results">${filingsTable([], "Loading…")}</div>`;
  }

  async function loadCoverage() {
    try {
      state.coverage = await getJSON("/api/filings/coverage");
      const mount = document.getElementById("f-coverage-mount");
      if (mount) mount.innerHTML = coverageHtml(state.coverage);
    } catch (e) {
      // Non-critical — the search still works without the coverage summary.
    }
  }

  async function loadDefault() {
    const results = document.getElementById("f-results");
    results.innerHTML = filingsTable([], "Loading recent filings…");
    try {
      if (state.market === "IN") {
        const { filings } = await getJSON("/api/filings/in/recent");
        results.innerHTML = filingsTable(filings.slice(0, 40), "No recent filings found.");
      } else {
        results.innerHTML = `<p class="f-empty">Search by ticker or company name above — SEC EDGAR has no single "recent across every company" feed, so this starts from a search.</p>`;
      }
    } catch (e) {
      results.innerHTML = `<p class="f-error">${esc(e.message)}</p>`;
    }
  }

  async function runSearch(q) {
    const results = document.getElementById("f-results");
    if (!q) return loadDefault();
    results.innerHTML = filingsTable([], "Searching…");
    try {
      if (state.market === "IN") {
        const { filings } = await getJSON(`/api/filings/in/search?q=${encodeURIComponent(q)}`);
        results.innerHTML = filingsTable(filings, `No India filings matched "${q}".`);
      } else {
        const { results: companies } = await getJSON(`/api/filings/us/search?q=${encodeURIComponent(q)}`);
        if (!companies.length) {
          results.innerHTML = `<p class="f-empty">No US-listed company matched "${esc(q)}".</p>`;
          return;
        }
        if (companies.length === 1) {
          const { filings } = await getJSON(`/api/filings/us/${encodeURIComponent(companies[0].ticker)}`);
          results.innerHTML = filingsTable(filings, `${companies[0].title} has no 10-K/20-F in SEC EDGAR's recent filings window.`);
          return;
        }
        // Multiple matches: let the person pick one.
        results.innerHTML = `
          <ul class="f-picks">
            ${companies.slice(0, 15).map((c) => `<li><button type="button" class="f-pick" data-ticker="${esc(c.ticker)}">${esc(c.ticker)} — ${esc(c.title)}</button></li>`).join("")}
          </ul>`;
      }
    } catch (e) {
      results.innerHTML = `<p class="f-error">${esc(e.message)}</p>`;
    }
  }

  root.addEventListener("click", async (e) => {
    const mbtn = e.target.closest(".f-mbtn");
    if (mbtn) {
      state.market = mbtn.dataset.market;
      root.querySelectorAll(".f-mbtn").forEach((b) => b.classList.toggle("active", b === mbtn));
      document.getElementById("f-q").placeholder = state.market === "US" ? "Ticker or company name (e.g. AAPL)" : "Company name";
      document.getElementById("f-q").value = "";
      loadDefault();
      return;
    }
    const pick = e.target.closest(".f-pick");
    if (pick) {
      const results = document.getElementById("f-results");
      results.innerHTML = filingsTable([], "Loading…");
      try {
        const { filings } = await getJSON(`/api/filings/us/${encodeURIComponent(pick.dataset.ticker)}`);
        results.innerHTML = filingsTable(filings, "No 10-K/20-F found in the recent filings window.");
      } catch (err) {
        results.innerHTML = `<p class="f-error">${esc(err.message)}</p>`;
      }
    }
  });

  root.addEventListener("submit", (e) => {
    if (e.target.id !== "f-search-form") return;
    e.preventDefault();
    runSearch(document.getElementById("f-q").value.trim());
  });

  function route() {
    if (!isActive()) return;
    if (state.loaded) return;
    state.loaded = true;
    root.innerHTML = shell();
    loadCoverage();
    loadDefault();
  }

  document.addEventListener("tabchange", route);
  document.addEventListener("universe-view", route);
  route();
})();
