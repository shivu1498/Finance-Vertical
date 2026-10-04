/* Shows every percentage figure in italics, across the whole site.
 *
 * Walks text nodes and wraps things like "+1.25%", "44.8 %" or "-3%" in
 * <em class="pc">. A MutationObserver re-applies it whenever the page updates
 * (live quotes, tab changes, company pages), batched into one pass per frame.
 * Skipped: inputs, selects/options, scripts, SVG text and embedded widgets,
 * where markup can't go or the text isn't ours.
 */
(function () {
  "use strict";

  var RE = /[+\-−]?\d[\d,]*(?:\.\d+)?\s?%/g;
  var SKIP = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, OPTION: 1, SELECT: 1, INPUT: 1, NOSCRIPT: 1, TITLE: 1, CODE: 1, EM: 0 };

  function skip(node) {
    for (var el = node.parentNode; el && el !== document.body; el = el.parentNode) {
      if (el.nodeType !== 1) continue;
      if (SKIP[el.tagName]) return true;
      if (el.namespaceURI === "http://www.w3.org/2000/svg") return true;
      if (el.classList && (el.classList.contains("pc") || el.classList.contains("tradingview-widget-container"))) return true;
    }
    return false;
  }

  function wrapText(node) {
    var t = node.nodeValue;
    if (!t || t.indexOf("%") < 0 || skip(node)) return;
    RE.lastIndex = 0;
    var m, last = 0, frag = null;
    while ((m = RE.exec(t))) {
      if (!frag) frag = document.createDocumentFragment();
      if (m.index > last) frag.appendChild(document.createTextNode(t.slice(last, m.index)));
      var em = document.createElement("em");
      em.className = "pc";
      em.textContent = m[0];
      frag.appendChild(em);
      last = m.index + m[0].length;
    }
    if (!frag) return;
    if (last < t.length) frag.appendChild(document.createTextNode(t.slice(last)));
    node.parentNode.replaceChild(frag, node);
  }

  function walk(root) {
    if (root.nodeType === 3) return wrapText(root);
    if (root.nodeType !== 1 || SKIP[root.tagName]) return;
    var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    var list = [], n;
    while ((n = w.nextNode())) if (n.nodeValue && n.nodeValue.indexOf("%") >= 0) list.push(n);
    for (var i = 0; i < list.length; i++) wrapText(list[i]);
  }

  var pending = new Set();
  var scheduled = false;
  var obs = new MutationObserver(function (records) {
    for (var i = 0; i < records.length; i++) {
      var r = records[i];
      if (r.type === "characterData") pending.add(r.target);
      else for (var j = 0; j < r.addedNodes.length; j++) pending.add(r.addedNodes[j]);
    }
    if (!scheduled) {
      scheduled = true;
      requestAnimationFrame(flush);
    }
  });

  function flush() {
    scheduled = false;
    obs.disconnect(); // our own edits shouldn't re-trigger us
    pending.forEach(function (n) { if (n.isConnected) walk(n); });
    pending.clear();
    obs.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  function start() {
    walk(document.body);
    obs.observe(document.body, { childList: true, subtree: true, characterData: true });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
