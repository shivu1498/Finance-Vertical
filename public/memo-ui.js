// The Memo tab UI. Depends on memo.js (MEMOS) and, loosely, on app.js's
// #tabs/tabchange wiring and NotesSidebar (both optional — this tab works
// without either). List view with a tag filter, a focus view per entry
// with prev/next and a "Copy link" action, same shape as Sector Knowledge.
(function () {
  const root = document.getElementById("mo-root");
  if (!root) return;

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmtDate = (iso) => new Date(iso + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

  const BY_DATE_DESC = [...MEMOS].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const byId = (id) => MEMOS.find((m) => m.id === id);
  const allTags = [...new Set(MEMOS.flatMap((m) => m.tags))];

  const state = { memoId: null, tag: null };

  function block(b) {
    if (b.p) return `<p class="k-p">${esc(b.p)}</p>`;
    if (b.ul) return `<ul class="k-list">${b.ul.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>`;
    return "";
  }

  function tagChips(active, onAttr) {
    return `<div class="mo-tags" role="group" aria-label="Filter by topic">
      <button type="button" class="k-btn${active ? "" : " on"}" data-${onAttr}="">All</button>
      ${allTags.map((t) => `<button type="button" class="k-btn${active === t ? " on" : ""}" data-${onAttr}="${esc(t)}">${esc(t)}</button>`).join("")}
    </div>`;
  }

  function renderList() {
    const items = state.tag ? BY_DATE_DESC.filter((m) => m.tags.includes(state.tag)) : BY_DATE_DESC;
    return `
      ${tagChips(state.tag, "mo-filter")}
      <div class="mo-list">
        ${items
          .map(
            (m) => `<article class="card mo-item" tabindex="0" role="button" data-go="${m.id}" aria-label="${esc(m.title)}">
              <div class="mo-item-meta"><span class="eyebrow" style="margin:0">${fmtDate(m.date)}</span>${m.tags.map((t) => `<span class="k-chip muted-chip">${esc(t)}</span>`).join("")}</div>
              <h3 class="mo-item-title">${esc(m.title)}</h3>
              <p class="k-p mo-item-dek">${esc(m.dek)}</p>
            </article>`
          )
          .join("")}
        ${items.length ? "" : `<div class="mo-empty card">No notes under that topic yet.</div>`}
      </div>`;
  }

  function renderFocus(m) {
    const i = BY_DATE_DESC.indexOf(m);
    const prev = BY_DATE_DESC[(i + 1) % BY_DATE_DESC.length]; // older
    const next = BY_DATE_DESC[(i - 1 + BY_DATE_DESC.length) % BY_DATE_DESC.length]; // newer
    return `
      <div data-report-id="memo:${m.id}">
        <section class="card mo-hero">
          <div class="k-hero-top">
            <button type="button" class="k-link" data-go="">&larr; All notes</button>
            <div class="k-nav">
              <button type="button" class="k-btn" data-go="${prev.id}" title="Older: ${esc(prev.title)}">&lsaquo; Older</button>
              <button type="button" class="k-btn" data-go="${next.id}" title="Newer: ${esc(next.title)}">Newer &rsaquo;</button>
            </div>
          </div>
          <span class="eyebrow">${fmtDate(m.date)}</span>
          <h3 class="k-hero-name">${esc(m.title)}</h3>
          <div class="mo-tags">${m.tags.map((t) => `<span class="k-chip muted-chip">${esc(t)}</span>`).join("")}</div>
          <p class="k-p mo-item-dek">${esc(m.dek)}</p>
          <div class="k-actions">
            <button type="button" class="k-btn" data-act="copy">Copy link</button>
            <span class="k-toast muted" id="mo-toast" aria-live="polite"></span>
          </div>
        </section>
        <section class="card mo-body">
          ${m.body.map(block).join("")}
        </section>
      </div>`;
  }

  function render() {
    const m = state.memoId && byId(state.memoId);
    root.innerHTML = m ? renderFocus(m) : renderList();
    if (m) {
      window.NotesSidebar?.setReport(`memo:${m.id}`, `${m.title} – The Memo`);
    } else {
      window.NotesSidebar?.clearReport();
    }
  }

  function go(id) {
    location.hash = id ? `memo/${id}` : "memo";
  }

  let toastTimer;
  function toast(msg) {
    const el = document.getElementById("mo-toast");
    if (!el) return;
    el.textContent = msg;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (el.textContent = ""), 2200);
  }

  root.addEventListener("click", (e) => {
    const filterBtn = e.target.closest("[data-mo-filter]");
    if (filterBtn) {
      state.tag = filterBtn.dataset.moFilter || null;
      return render();
    }
    const goEl = e.target.closest("[data-go]");
    if (goEl) return go(goEl.dataset.go);
    if (e.target.closest("[data-act=copy]")) {
      const url = `${location.origin}${location.pathname}#memo/${state.memoId}`;
      navigator.clipboard?.writeText(url).then(() => toast("Link copied")).catch(() => toast(url));
      return;
    }
  });
  root.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const item = e.target.closest("[data-go]");
    if (!item) return;
    e.preventDefault();
    go(item.dataset.go);
  });

  const isActive = () => document.querySelector("#tabs .tab.active")?.dataset.tab === "memo";

  function route() {
    if (!isActive()) return;
    const sub = location.hash.slice(1).split("/")[1];
    state.memoId = MEMOS.some((m) => m.id === sub) ? sub : null;
    render();
  }

  document.addEventListener("tabchange", route);
  route();
})();
