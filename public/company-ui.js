// Knowledge tab: Sector / Company switch, plus the Company view.
// The Sector view (knowledge-ui.js) is untouched; this file only toggles
// between #k-root (sector) and #kc-root (company). Depends on company-knowledge.js.
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
    company: ["Company Knowledge", "Reading lists per company: videos, threads and reports on the business and its industries."],
  };
  const state = { view: "sector", companyId: K_COMPANIES[0].id, query: "" };

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function readView() {
    try {
      const v = localStorage.getItem(VIEW_KEY);
      return v === "company" ? "company" : "sector";
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

  function company() {
    return K_COMPANIES.find((c) => c.id === state.companyId) || K_COMPANIES[0];
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

  function renderCompany() {
    const c = company();
    const q = state.query.trim().toLowerCase();
    let shown = 0;
    const groups = c.groups
      .map((g) => {
        const links = g.links.filter((l) => !q || `${l.title} ${l.by} ${g.title}`.toLowerCase().includes(q));
        shown += links.length;
        if (!links.length) return "";
        return `<section class="kc-group">
          <h3 class="kc-group-title">${esc(g.title)}</h3>
          <ul class="kc-list">${links.map((l) => linkRow(c, l)).join("")}</ul>
        </section>`;
      })
      .join("");
    const total = c.groups.reduce((n, g) => n + g.links.length, 0);

    const chips = K_COMPANIES.map(
      (x) => `<button type="button" class="kc-chip ${x.id === c.id ? "active" : ""}" data-company="${esc(x.id)}">${esc(x.name)}</button>`
    ).join("");

    root.innerHTML = `
      <section class="card kc-tools">
        <div class="kc-chips" role="group" aria-label="Company">${chips}</div>
        <label class="k-search kc-search">
          <span class="k-search-icon" aria-hidden="true">&#9906;</span>
          <input id="kc-search" type="search" placeholder="Filter ${total} links…" autocomplete="off" value="${esc(state.query)}" aria-label="Filter company links" />
        </label>
      </section>
      <section class="card kc-card">
        <div class="kc-head">
          <div>
            <h2 class="kc-name">${esc(c.name)}</h2>
            <div class="kc-meta">${esc(c.sector)}</div>
          </div>
          <a class="kc-src" href="${esc(c.source)}" target="_blank" rel="noopener noreferrer">View on Tijori Finance &#8599;</a>
        </div>
        <h2 class="kc-section">Discussions &amp; Analysis</h2>
        ${groups || `<p class="kc-empty">No links match “${esc(state.query)}”.</p>`}
        <p class="kc-foot">Curated from Tijori Finance's knowledge base. Links open the original author's content; we don't host or republish it.</p>
      </section>`;
  }

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
    if (v === "company") renderCompany();
  }

  sw.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-kx]");
    if (b) setView(b.dataset.kx, true);
  });

  root.addEventListener("click", (e) => {
    const chip = e.target.closest("[data-company]");
    if (chip) {
      state.companyId = chip.dataset.company;
      state.query = "";
      renderCompany();
    }
  });

  root.addEventListener("input", (e) => {
    if (e.target.id !== "kc-search") return;
    state.query = e.target.value;
    const pos = e.target.selectionStart;
    renderCompany();
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
