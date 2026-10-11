// Notes & Highlights: a hover-reveal right-side dock. Shows saved
// highlights + a markdown note editor for whatever "report" is currently
// open (today: a Sector Knowledge page). Other screens can opt in later by
// calling window.NotesSidebar.setReport(id, title) and marking their
// content root with [data-report-id].
//
// Storage:
//  - notes share the pre-existing "stalkingstocks.knowledge.notes" key
//    (plain { [sectorId]: text }) so nothing written by the old inline
//    "My notes" box is lost; this panel replaces that box.
//  - highlights are new: "stalkingstocks.sidebar.highlights",
//    { [reportId]: [{id, text, ts}] }.
(function () {
  const dock = document.getElementById("notes-dock");
  const handle = document.getElementById("notes-handle");
  const panel = document.getElementById("notes-panel");
  const body = document.getElementById("np-body");
  const titleEl = document.getElementById("np-title");
  const countReportEl = document.getElementById("np-count-report");
  const countAllEl = document.getElementById("np-count-all");
  const handleCountEl = document.getElementById("notes-handle-count");
  const pinBtn = document.getElementById("np-pin");
  const closeBtn = document.getElementById("np-collapse");
  if (!dock) return;

  const NOTES_KEY = "stalkingstocks.knowledge.notes";
  const HILITE_KEY = "stalkingstocks.sidebar.highlights";

  function readStore(key, fallback) {
    try {
      const v = JSON.parse(localStorage.getItem(key));
      return v ?? fallback;
    } catch {
      return fallback;
    }
  }
  function writeStore(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // storage unavailable: nothing persists this session
    }
  }
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  let activeReport = null; // { id, title }
  let tab = "report"; // "report" | "notebooks"
  let pinned = false;
  let md2html = false; // markdown preview toggle for the note editor

  // ---- note storage (back-compat: keyed by the raw sector id) ----
  function noteKeyFor(reportId) {
    return reportId && reportId.startsWith("sector:") ? reportId.slice(7) : reportId;
  }
  function getNote(reportId) {
    return readStore(NOTES_KEY, {})[noteKeyFor(reportId)] || "";
  }
  function setNote(reportId, text) {
    const notes = readStore(NOTES_KEY, {});
    notes[noteKeyFor(reportId)] = text;
    writeStore(NOTES_KEY, notes);
  }

  // ---- highlights ----
  function getHighlights(reportId) {
    return readStore(HILITE_KEY, {})[reportId] || [];
  }
  function addHighlight(reportId, text) {
    const all = readStore(HILITE_KEY, {});
    const list = all[reportId] || (all[reportId] = []);
    list.unshift({ id: "h" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), text, ts: Date.now() });
    writeStore(HILITE_KEY, all);
  }
  function removeHighlight(reportId, id) {
    const all = readStore(HILITE_KEY, {});
    if (!all[reportId]) return;
    all[reportId] = all[reportId].filter((h) => h.id !== id);
    writeStore(HILITE_KEY, all);
  }

  function reportTitle(id) {
    if (id && id.startsWith("sector:") && typeof K_SECTORS !== "undefined") {
      const sec = K_SECTORS.find((s) => s.id === id.slice(7));
      if (sec) return `${sec.name} – Sector`;
    }
    return id || "";
  }

  // ---- dock open/close ----
  function setOpen(open) {
    dock.classList.toggle("open", open);
    handle.setAttribute("aria-expanded", String(open));
  }
  handle.addEventListener("click", () => {
    pinned = !pinned;
    setOpen(pinned || dock.matches(":hover"));
  });
  dock.addEventListener("mouseenter", () => setOpen(true));
  dock.addEventListener("mouseleave", () => { if (!pinned) setOpen(false); });
  closeBtn.addEventListener("click", () => { pinned = false; setOpen(false); });
  pinBtn.addEventListener("click", () => {
    pinned = !pinned;
    pinBtn.classList.toggle("on", pinned);
    pinBtn.style.color = pinned ? "var(--accent)" : "";
    setOpen(true);
  });

  // ---- public API, called from knowledge-ui.js (and future report screens) ----
  window.NotesSidebar = {
    setReport(id, title) {
      activeReport = { id, title: title || reportTitle(id) };
      renderHeader();
      if (tab === "report") renderBody();
      updateCounts();
    },
    clearReport() {
      activeReport = null;
      renderHeader();
      if (tab === "report") renderBody();
      updateCounts();
    },
  };

  function renderHeader() {
    titleEl.textContent = activeReport ? activeReport.title : "No report open";
    titleEl.title = titleEl.textContent;
  }

  function wordCount(text) {
    const t = text.trim();
    return t ? t.split(/\s+/).length : 0;
  }

  function updateCounts() {
    const reportCount = activeReport ? getHighlights(activeReport.id).length : 0;
    const all = readStore(HILITE_KEY, {});
    const notes = readStore(NOTES_KEY, {});
    const nbIds = new Set([...Object.keys(all).filter((k) => all[k].length), ...Object.keys(notes).filter((k) => notes[k] && notes[k].trim()).map((k) => "sector:" + k)]);
    countReportEl.textContent = reportCount;
    countAllEl.textContent = nbIds.size;
    if (nbIds.size) {
      handleCountEl.hidden = false;
      handleCountEl.textContent = nbIds.size;
    } else {
      handleCountEl.hidden = true;
    }
  }

  // ---- a tiny, self-contained markdown renderer: just enough for what the
  // toolbar below inserts (headings, bold, italic, code, quotes, links,
  // images, lists, a simple table). Not a full spec implementation. ----
  function mdToHtml(src) {
    let html = esc(src);
    html = html.replace(/```([\s\S]*?)```/g, (_, code) => `<pre><code>${code}</code></pre>`);
    html = html
      .replace(/^### (.*)$/gm, "<h4>$1</h4>")
      .replace(/^## (.*)$/gm, "<h3>$1</h3>")
      .replace(/^# (.*)$/gm, "<h2>$1</h2>")
      .replace(/^&gt; (.*)$/gm, "<blockquote>$1</blockquote>")
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^_])_(.+?)_(?!_)/g, "$1<em>$2</em>")
      .replace(/`([^`]+?)`/g, "<code>$1</code>")
      .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img alt="$1" src="$2">')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    html = html.replace(/(?:^|\n)((?:- .*(?:\n|$))+)/g, (m, block) => {
      const items = block.trim().split("\n").map((l) => `<li>${l.replace(/^- /, "")}</li>`).join("");
      return `\n<ul>${items}</ul>`;
    });
    html = html.replace(/(?:^|\n)((?:\d+\. .*(?:\n|$))+)/g, (m, block) => {
      const items = block.trim().split("\n").map((l) => `<li>${l.replace(/^\d+\. /, "")}</li>`).join("");
      return `\n<ol>${items}</ol>`;
    });
    html = html.replace(/\n\|(.+)\|\n\|[ :\-|]+\|\n((?:\|.*\|\n?)*)/g, (m, head, rows) => {
      const ths = head.split("|").map((c) => c.trim()).filter(Boolean).map((c) => `<th>${c}</th>`).join("");
      const trs = rows.trim().split("\n").filter(Boolean).map((r) => {
        const cells = r.split("|").map((c) => c.trim());
        const tds = cells.slice(1, -1).map((c) => `<td>${c}</td>`).join("");
        return `<tr>${tds}</tr>`;
      }).join("");
      return `\n<table><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table>`;
    });
    html = html
      .split("\n\n")
      .map((p) => (p.trim().match(/^<(h2|h3|h4|ul|ol|table|blockquote|pre)/) ? p : `<p>${p.replace(/\n/g, "<br>")}</p>`))
      .join("");
    return html || `<p class="muted">Nothing written yet.</p>`;
  }

  const ICON = {
    quote: '<path d="M7 7h4v4c0 2.2-1.3 3.6-3.6 4"/><path d="M14.5 7h4v4c0 2.2-1.3 3.6-3.6 4"/>',
    code: '<path d="M9 8l-4 4 4 4M15 8l4 4-4 4"/>',
    ul: '<circle cx="4.2" cy="6" r="1.2"/><circle cx="4.2" cy="12" r="1.2"/><circle cx="4.2" cy="18" r="1.2"/><path d="M9 6h11M9 12h11M9 18h11"/>',
    ol: '<rect x="3" y="5" width="2" height="2"/><rect x="3" y="11" width="2" height="2"/><rect x="3" y="17" width="2" height="2"/><path d="M9 6h11M9 12h11M9 18h11"/>',
    link: '<path d="M9 15l6-6"/><path d="M8 13l-2 2a3 3 0 0 0 4 4l3-3"/><path d="M16 11l2-2a3 3 0 0 0-4-4l-3 3"/>',
    table: '<rect x="3" y="4" width="18" height="16" rx="1.5"/><path d="M3 10h18M3 16h18M9 4v16M15 4v16"/>',
    image: '<rect x="3" y="5" width="18" height="14" rx="1.5"/><circle cx="8.5" cy="10" r="1.5"/><path d="M21 16l-5.5-5.5L9 17"/>',
    highlight: '<path d="M4 20l1.2-4L15 6.2a2 2 0 0 1 2.8 0l0 0a2 2 0 0 1 0 2.8L8 18.8 4 20z"/><path d="M13.2 8 16 10.8"/>',
    pencil: '<path d="M4 19.5V6a2 2 0 0 1 2-2h8.5L20 8.5V18a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2.5z"/><path d="M14 4v4.5H18.5"/><path d="M7.5 12h7M7.5 15h5"/>',
  };
  const svg = (d, extra = "") => `<svg viewBox="0 0 24 24" aria-hidden="true" ${extra}>${d}</svg>`;

  function renderReportBody() {
    if (!activeReport) {
      return `<p class="np-empty">Open a sector report to take notes and save highlights here.</p>`;
    }
    const id = activeReport.id;
    const highlights = getHighlights(id);
    const noteText = getNote(id);
    const preview = md2html ? mdToHtml(noteText) : "";
    return `
      <div class="np-section">
        <div class="np-section-head"><span class="np-eyebrow">HIGHLIGHTS</span><span class="np-count-sm">${highlights.length}</span></div>
        ${
          highlights.length
            ? `<ul class="np-highlights">${highlights
                .map(
                  (h) => `<li class="np-highlight" data-hid="${h.id}">
                <span class="np-hi-text">${esc(h.text)}</span>
                <button type="button" class="np-hi-remove" data-remove-h="${h.id}" title="Remove highlight" aria-label="Remove highlight">&#10005;</button>
              </li>`
                )
                .join("")}</ul>`
            : `<p class="np-hint">Select any text in the report and tap <strong>Highlight</strong> in the floating toolbar to save it here.</p>`
        }
      </div>
      <div class="np-section">
        <div class="np-section-head"><span class="np-eyebrow">NOTES</span></div>
        <div class="np-editor">
          <div class="np-toolbar" role="toolbar" aria-label="Formatting">
            <button type="button" data-md="h" title="Heading"><b>H</b></button>
            <button type="button" data-md="b" title="Bold"><b>B</b></button>
            <button type="button" data-md="i" title="Italic"><i>I</i></button>
            <button type="button" data-md="quote" title="Quote">${svg(ICON.quote)}</button>
            <button type="button" data-md="code" title="Inline code">${svg(ICON.code)}</button>
            <span class="np-tb-sep"></span>
            <button type="button" data-md="ul" title="Bullet list">${svg(ICON.ul)}</button>
            <button type="button" data-md="ol" title="Numbered list">${svg(ICON.ol)}</button>
            <button type="button" data-md="link" title="Link">${svg(ICON.link)}</button>
            <button type="button" data-md="table" title="Table">${svg(ICON.table)}</button>
            <button type="button" data-md="image" title="Image">${svg(ICON.image)}</button>
            <button type="button" id="np-md-toggle" class="np-tb-md${md2html ? " on" : ""}" title="Toggle markdown preview">&lt;/&gt; MARKDOWN</button>
          </div>
          <textarea id="np-note-text" class="np-note-text" ${md2html ? "hidden" : ""} placeholder="Write a note about ${esc(activeReport.title)}…">${esc(noteText)}</textarea>
          <div class="np-preview" id="np-preview" ${md2html ? "" : "hidden"}>${preview}</div>
        </div>
        <div class="np-editor-foot">
          <span class="muted">Writing in <strong>this report</strong> &middot; Private &middot; <span id="np-wordcount">${wordCount(noteText)}</span> words &middot; <span id="np-savestate">${noteText ? "saved" : "draft kept"}</span></span>
          <button type="button" class="np-save-btn" id="np-save">SAVE NOTE</button>
        </div>
      </div>`;
  }

  function renderNotebooksBody() {
    const allH = readStore(HILITE_KEY, {});
    const allN = readStore(NOTES_KEY, {});
    const ids = new Set([...Object.keys(allH).filter((k) => allH[k].length), ...Object.keys(allN).filter((k) => allN[k] && allN[k].trim()).map((k) => "sector:" + k)]);
    if (!ids.size) return `<p class="np-empty">Nothing saved yet. Notes and highlights you add to any report show up here.</p>`;
    const rows = [...ids].map((id) => {
      const h = allH[id] || [];
      const noteText = allN[noteKeyFor(id)] || "";
      const snippet = noteText.trim() || (h[0] && h[0].text) || "";
      return `<button type="button" class="np-nb-row" data-open-report="${esc(id)}">
        <span class="np-nb-title">${esc(reportTitle(id))}</span>
        <span class="np-nb-meta">${h.length} highlight${h.length === 1 ? "" : "s"} &middot; ${wordCount(noteText)} word note</span>
        ${snippet ? `<span class="np-nb-snippet">${esc(snippet)}</span>` : ""}
      </button>`;
    });
    return `<div class="np-section"><div class="np-notebooks-list">${rows.join("")}</div></div>`;
  }

  function renderBody() {
    body.innerHTML = tab === "report" ? renderReportBody() : renderNotebooksBody();
  }

  // ---- tabs ----
  document.querySelectorAll(".np-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      tab = btn.dataset.npTab;
      document.querySelectorAll(".np-tab").forEach((b) => {
        b.classList.toggle("active", b === btn);
        b.setAttribute("aria-selected", String(b === btn));
      });
      renderBody();
    });
  });

  // ---- note editor: toolbar + typing + save ----
  function applyToolbarAction(ta, action) {
    const start = ta.selectionStart, end = ta.selectionEnd;
    const val = ta.value;
    const sel = val.slice(start, end);
    let before = val.slice(0, start);
    const after = val.slice(end);
    let out = sel;
    const wrap = (mark) => { out = mark + (sel || "text") + mark; };
    const linePrefix = (prefix) => {
      const lineStart = before.lastIndexOf("\n") + 1;
      before = before.slice(0, lineStart) + prefix + before.slice(lineStart);
    };
    switch (action) {
      case "h": linePrefix("## "); break;
      case "b": wrap("**"); break;
      case "i": wrap("_"); break;
      case "quote": linePrefix("> "); break;
      case "code": wrap("`"); break;
      case "ul": linePrefix("- "); break;
      case "ol": linePrefix("1. "); break;
      case "link": {
        const url = prompt("Link URL:", "https://");
        if (!url) return;
        out = `[${sel || "link text"}](${url})`;
        break;
      }
      case "table":
        out = "\n| Column 1 | Column 2 |\n| --- | --- |\n|  |  |\n";
        break;
      case "image": {
        const url = prompt("Image URL:", "https://");
        if (!url) return;
        out = `![${sel || "alt text"}](${url})`;
        break;
      }
    }
    ta.value = before + out + after;
    ta.focus();
    const pos = before.length + out.length;
    ta.setSelectionRange(pos, pos);
    ta.dispatchEvent(new Event("input", { bubbles: true }));
  }

  let saveTimer;
  body.addEventListener("click", (e) => {
    const mdBtn = e.target.closest("[data-md]");
    if (mdBtn) {
      const ta = document.getElementById("np-note-text");
      if (ta) applyToolbarAction(ta, mdBtn.dataset.md);
      return;
    }
    const toggle = e.target.closest("#np-md-toggle");
    if (toggle) {
      const ta = document.getElementById("np-note-text");
      md2html = !md2html;
      if (ta) {
        const text = ta.value;
        toggle.classList.toggle("on", md2html);
        const preview = document.getElementById("np-preview");
        ta.hidden = md2html;
        preview.hidden = !md2html;
        if (md2html) preview.innerHTML = mdToHtml(text);
      }
      return;
    }
    const saveBtn = e.target.closest("#np-save");
    if (saveBtn && activeReport) {
      const ta = document.getElementById("np-note-text");
      setNote(activeReport.id, ta ? ta.value : "");
      const st = document.getElementById("np-savestate");
      if (st) st.textContent = "saved";
      updateCounts();
      return;
    }
    const removeBtn = e.target.closest("[data-remove-h]");
    if (removeBtn && activeReport) {
      removeHighlight(activeReport.id, removeBtn.dataset.removeH);
      renderBody();
      updateCounts();
      return;
    }
    const nbRow = e.target.closest("[data-open-report]");
    if (nbRow) {
      const id = nbRow.dataset.openReport;
      if (id.startsWith("sector:")) location.hash = `knowledge/${id.slice(7)}`;
      tab = "report";
      setTimeout(() => {
        document.querySelectorAll(".np-tab").forEach((b) => {
          b.classList.toggle("active", b.dataset.npTab === "report");
          b.setAttribute("aria-selected", String(b.dataset.npTab === "report"));
        });
      }, 0);
    }
  });

  body.addEventListener("input", (e) => {
    if (e.target.id !== "np-note-text" || !activeReport) return;
    const wc = document.getElementById("np-wordcount");
    const st = document.getElementById("np-savestate");
    if (wc) wc.textContent = wordCount(e.target.value);
    if (st) st.textContent = "Saving…";
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      setNote(activeReport.id, e.target.value);
      const stEl = document.getElementById("np-savestate");
      if (stEl) stEl.textContent = "saved";
      updateCounts();
    }, 500);
  });

  // ---- select text inside [data-report-id] to save a highlight ----
  let floatBtn = null;
  function removeFloat() {
    if (floatBtn) { floatBtn.remove(); floatBtn = null; }
  }
  document.addEventListener("mouseup", (e) => {
    if (e.target.closest(".np-hi-float")) return;
    const sel = window.getSelection();
    const text = sel && sel.toString().trim();
    if (!text || !activeReport) return removeFloat();
    const anchorEl = sel.anchorNode && (sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement);
    const host = anchorEl && anchorEl.closest("[data-report-id]");
    if (!host || host.dataset.reportId !== activeReport.id) return removeFloat();
    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    removeFloat();
    floatBtn = document.createElement("button");
    floatBtn.type = "button";
    floatBtn.className = "np-hi-float";
    floatBtn.innerHTML = `${svg(ICON.highlight)}<span>Highlight</span>`;
    floatBtn.style.left = `${Math.max(8, rect.left + rect.width / 2 - 55)}px`;
    floatBtn.style.top = `${Math.max(8, rect.top - 40)}px`;
    floatBtn.addEventListener("mousedown", (ev) => ev.preventDefault()); // keep the selection alive
    floatBtn.addEventListener("click", () => {
      addHighlight(activeReport.id, text);
      if (tab === "report") renderBody();
      updateCounts();
      removeFloat();
      window.getSelection()?.removeAllRanges();
    });
    document.body.appendChild(floatBtn);
  });
  document.addEventListener("mousedown", (e) => {
    if (!e.target.closest(".np-hi-float")) removeFloat();
  });

  // ---- keyboard shortcuts, active only while the panel is open ----
  document.addEventListener("keydown", (e) => {
    if (!dock.classList.contains("open") || e.metaKey || e.ctrlKey || e.altKey) return;
    const typing = e.target.matches?.("input, textarea, select, [contenteditable]");
    if (e.key === "Escape") {
      if (typing) { e.target.blur(); return; }
      pinned = false;
      setOpen(false);
      return;
    }
    if (typing) return;
    if (e.key === "n" || e.key === "N") {
      e.preventDefault();
      tab = "report";
      renderBody();
      document.getElementById("np-note-text")?.focus();
    } else if (e.key === "e" || e.key === "E") {
      if (tab === "notebooks") return; // nothing to expand/collapse on that tab
    }
  });

  renderHeader();
  renderBody();
  updateCounts();
})();
