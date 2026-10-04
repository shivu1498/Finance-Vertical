// Knowledge tab: Sector / Company switch, plus the Company view.
// The Sector view (knowledge-ui.js) is untouched; this file only toggles
// between #k-root (sector) and #kc-root (company).
//
// Company view: type an NSE ticker -> /api/tijori/resolve finds the company
// (Screener.in if configured, else Yahoo) and its verified Tijori Finance page.
// If we have a curated link list for that ticker (company-knowledge.js) it is
// shown inline; otherwise the Tijori Knowledge Base is one click away.
(function () {
  const sectorRoot = document.getElementById("k-root");
  const root = document.getElementById("kc-root");
  const sw = document.getElementById("kx-switch");
  const title = document.getElementById("kx-title");
  const sub = document.getElementById("kx-sub");
  if (!sectorRoot || !root || !sw || typeof K_COMPANIES === "undefined") return;

  const VIEW_KEY = "stalkingstocks.knowledge.view";
  const COPY = {
    sector: ["Sector Specific Knowledge", "Curated sector research, one sub-tab per sector. Pick a thumbnail to dive in."],
    company: ["Company Knowledge", "Search an NSE ticker to find the company on Tijori Finance and read its curated links."],
  };
  const state = {
    view: "sector",
    ticker: K_COMPANIES[0].ticker || null,
    lookup: { status: "idle", data: null }, // idle | loading | done | error
    query: "",
  };
  let seq = 0;
  let built = false;

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function readView() {
    try {
      return localStorage.getItem(VIEW_KEY) === "company" ? "company" : "sector";
    } catch {
      return "sector";
    }
  }
  function saveView(v) {
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      // storage unavailable: the choice just won't persist
    }
  }

  function normalize(raw) {
    const t = String(raw || "").trim().toUpperCase().replace(/^(NSE|BSE):/, "").replace(/\.(NS|BO)$/, "");
    return /^[A-Z0-9&-]{1,20}$/.test(t) ? t : null;
  }

  function host(url) {
    try {
      return new URL(url).hostname.replace(/^www\./, "");
    } catch {
      return "";
    }
  }
  const KIND = [
    [/youtube\.com|youtu\.be/, "Video"],
    [/(^|\.)(x|twitter)\.com$/, "Thread"],
    [/valuepickr\.com/, "Forum"],
  ];
  function kind(url) {
    const h = host(url);
    for (const [re, label] of KIND) if (re.test(h)) return label;
    return "Article";
  }

  function curated() {
    return K_COMPANIES.find((c) => c.ticker && c.ticker === state.ticker) || null;
  }

  /* ---------- lookup ---------- */
  async function lookup(raw) {
    const t = normalize(raw);
    if (!t) {
      state.ticker = null;
      state.lookup = { status: "error", data: null, message: "That doesn't look like a ticker. Try GRASIM, RELIANCE or M&M." };
      renderOut();
      return;
    }
    state.ticker = t;
    state.query = "";
    const mine = ++seq;
    state.lookup = { status: "loading", data: null };
    renderOut();
    try {
      const ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
      const timer = ctl ? setTimeout(() => ctl.abort(), 28000) : null;
      const res = await fetch(`/api/tijori/resolve?ticker=${encodeURIComponent(t)}`, ctl ? { signal: ctl.signal } : undefined);
      if (timer) clearTimeout(timer);
      if (!res.ok) throw new Error(`lookup failed (${res.status})`);
      const data = await res.json();
      if (mine !== seq) return; // a newer search replaced this one
      state.lookup = { status: "done", data };
    } catch (err) {
      if (mine !== seq) return;
      state.lookup = { status: "error", data: null, message: "Couldn't reach the lookup service right now." };
    }
    renderOut();
  }

  /* ---------- rendering ---------- */
  function badge(l) {
    if (l.status === "loading") return `<span class="kc-badge wait">Looking up ${esc(state.ticker)}…</span>`;
    if (l.status === "error") return `<span class="kc-badge bad">${esc(l.message || "Lookup failed")}</span>`;
    if (l.status !== "done") return "";
    const s = l.data.tijori.status;
    if (s === "verified") return `<span class="kc-badge ok">&#10003; Found on Tijori Finance</span>`;
    if (s === "unverified") return `<span class="kc-badge wait" title="Tijori couldn't be checked from our server, so this link is a best guess">Link not checked</span>`;
    if (s === "not_found") return `<span class="kc-badge bad">Not found on Tijori Finance</span>`;
    return `<span class="kc-badge bad">Ticker not found</span>`;
  }

  function connectCard() {
    if (!state.ticker && state.lookup.status !== "error") return "";
    const l = state.lookup;
    const d = l.status === "done" ? l.data : null;
    const c = curated();
    // Fall back to the curated entry's own links if the lookup service is down.
    const name = d && d.name ? d.name : c ? c.name : "";
    const tijoriUrl = d && d.tijori.url ? d.tijori.url : l.status === "error" && c ? c.source : null;
    const screenerUrl = d ? d.screenerUrl : state.ticker ? `https://www.screener.in/company/${encodeURIComponent(state.ticker)}/consolidated/` : null;
    const via = d && d.nameSource ? `<span class="kc-via">name via ${d.nameSource === "screener" ? "Screener.in" : "Yahoo Finance"}</span>` : "";

    return `<section class="card kc-connect">
      <div class="kc-flow">
        <span class="kc-ticker">${esc(state.ticker || "—")}</span>
        <span class="kc-arrow" aria-hidden="true">&rarr;</span>
        <span class="kc-cname">${name ? esc(name) : "&nbsp;"}</span>
        ${via}
      </div>
      <div class="kc-actions">
        ${badge(l)}
        ${tijoriUrl ? `<a class="kc-src" href="${esc(tijoriUrl)}" target="_blank" rel="noopener noreferrer">Knowledge Base on Tijori &#8599;</a>` : ""}
        ${screenerUrl ? `<a class="kc-src" href="${esc(screenerUrl)}" target="_blank" rel="noopener noreferrer">Screener.in &#8599;</a>` : ""}
      </div>
    </section>`;
  }

  function linkRow(c, l) {
    const href = l.url || c.source;
    const by = l.by ? ` <span class="kc-by">&ndash; ${esc(l.by)}</span>` : "";
    const note = l.url ? "" : ` <span class="kc-note" title="Original link could not be confirmed; opens the Tijori page">via Tijori</span>`;
    return `<li class="kc-item">
      <span class="kc-kind">${kind(href)}</span>
      <a class="kc-link" href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(l.title)}</a>${by}${note}
    </li>`;
  }

  function listCard(c) {
    const q = state.query.trim().toLowerCase();
    const total = c.groups.reduce((n, g) => n + g.links.length, 0);
    const groups = c.groups
      .map((g) => {
        const links = g.links.filter((l) => !q || `${l.title} ${l.by} ${g.title}`.toLowerCase().includes(q));
        if (!links.length) return "";
        return `<section class="kc-group">
          <h3 class="kc-group-title">${esc(g.title)}</h3>
          <ul class="kc-list">${links.map((l) => linkRow(c, l)).join("")}</ul>
        </section>`;
      })
      .join("");
    return `<section class="card kc-card">
      <div class="kc-head">
        <div>
          <h2 class="kc-name">${esc(c.name)}</h2>
          <div class="kc-meta">${esc(c.sector)}</div>
        </div>
        <label class="k-search kc-search">
          <span class="k-search-icon" aria-hidden="true">&#9906;</span>
          <input id="kc-search" type="search" placeholder="Filter ${total} links…" autocomplete="off" value="${esc(state.query)}" aria-label="Filter company links" />
        </label>
      </div>
      <h2 class="kc-section">Discussions &amp; Analysis</h2>
      ${groups || `<p class="kc-empty">No links match “${esc(state.query)}”.</p>`}
      <p class="kc-foot">Curated from Tijori Finance's knowledge base. Links open the original author's content; we don't host or republish it.</p>
    </section>`;
  }

  function noListNote() {
    const l = state.lookup;
    if (l.status !== "done" || curated()) return "";
    const s = l.data.tijori.status;
    if (s === "verified" || s === "unverified") {
      return `<section class="card kc-card"><p class="kc-empty">We haven't copied this company's link list into the app yet. Use <b>Knowledge Base on Tijori</b> above to read it on Tijori Finance.</p></section>`;
    }
    return "";
  }

  function renderOut() {
    const out = document.getElementById("kc-out");
    if (!out) return;
    const c = curated();
    out.innerHTML = connectCard() + (c ? listCard(c) : noListNote());
  }

  function build() {
    const symbols = typeof NIFTY50 !== "undefined" ? NIFTY50.map((s) => s.symbol.replace(/\.NS$/, "")) : [];
    const chips = K_COMPANIES.filter((c) => c.ticker)
      .map((c) => `<button type="button" class="kc-chip" data-ticker="${esc(c.ticker)}">${esc(c.name)}</button>`)
      .join("");
    root.innerHTML = `
      <section class="card kc-tools">
        <form class="kc-form" id="kc-form" autocomplete="off">
          <label class="k-search kc-ticker-in">
            <span class="k-search-icon" aria-hidden="true">&#9906;</span>
            <input id="kc-ticker" type="text" list="kc-tickers" placeholder="NSE ticker, e.g. GRASIM, RELIANCE, M&amp;M" spellcheck="false" autocapitalize="characters" aria-label="NSE ticker" value="${esc(state.ticker || "")}" />
            <datalist id="kc-tickers">${symbols.map((s) => `<option value="${esc(s)}"></option>`).join("")}</datalist>
          </label>
          <button type="submit" class="kc-go">Find company</button>
        </form>
        <div class="kc-chips" role="group" aria-label="Companies with curated links">${chips}</div>
      </section>
      <div id="kc-out"></div>`;
    built = true;
  }

  /* ---------- view switching ---------- */
  function setView(v, persist) {
    state.view = v;
    if (persist) saveView(v);
    sectorRoot.hidden = v !== "sector";
    root.hidden = v !== "company";
    title.textContent = COPY[v][0];
    sub.textContent = COPY[v][1];
    sw.querySelectorAll("button[data-kx]").forEach((b) => {
      const on = b.dataset.kx === v;
      b.classList.toggle("active", on);
      b.setAttribute("aria-selected", String(on));
    });
    if (v === "company") {
      if (!built) build();
      if (state.lookup.status === "idle" && state.ticker) lookup(state.ticker);
      else renderOut();
    }
  }

  sw.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-kx]");
    if (b) setView(b.dataset.kx, true);
  });

  root.addEventListener("submit", (e) => {
    if (e.target.id !== "kc-form") return;
    e.preventDefault();
    const input = document.getElementById("kc-ticker");
    lookup(input.value);
  });

  root.addEventListener("click", (e) => {
    const chip = e.target.closest("[data-ticker]");
    if (!chip) return;
    const input = document.getElementById("kc-ticker");
    if (input) input.value = chip.dataset.ticker;
    lookup(chip.dataset.ticker);
  });

  root.addEventListener("input", (e) => {
    if (e.target.id !== "kc-search") return;
    state.query = e.target.value;
    const pos = e.target.selectionStart;
    renderOut();
    const el = document.getElementById("kc-search");
    if (el) {
      el.focus();
      try {
        el.setSelectionRange(pos, pos);
      } catch {
        // some input types don't support selection ranges
      }
    }
  });

  setView(readView(), false);
})();
