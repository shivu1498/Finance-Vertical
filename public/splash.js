/* Builds the intro's scattered numbers, 3D "100", letters and tagline words,
 * drives the counters, and removes the overlay. Markup lives in index.html
 * (#splash); nearly all timing is in splash.css (the counting here is
 * scheduled to match). The numbers are decorative, not market data. */
(function () {
  "use strict";
  var el = document.getElementById("splash");
  if (!el) return;

  var T0 = performance.now();
  var seed = 11;
  function rnd() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }
  function pick(a) { return a[Math.floor(rnd() * a.length)]; }
  function fx(n, d) { return n.toFixed(d); }
  function commas(n) { return Math.round(n).toLocaleString("en-IN"); }

  // colour class -> [text, numeric value] makers
  var MAKE = {
    g: function () { var v = 1 + rnd() * 28; return ["+" + fx(v, 1) + "%", v]; },
    r: function () { var v = 0.2 + rnd() * 7; return ["−" + fx(v, 1) + "%", v]; },
    b: function () { var v = 8 + rnd() * 40; return [fx(v, 1) + "x", v]; },
    w: function () { var v = 100 + rnd() * 3900; return ["₹" + commas(v), v]; },
    a: function () { var v = 40 + rnd() * 9000; return ["₹" + commas(v) + " Cr", v]; },
    v: function () { var v = 1 + rnd() * 90; return [pick(["1.2M", "48.6K", "3.4M", "912K", "7.8M", "260K"]), v]; },
    c: function () { var v = 20000 + rnd() * 62000; return [commas(v), v]; },
  };
  var KEYS = ["g", "r", "b", "w", "a", "v", "c", "g", "r", "b"];

  // ---- scattered numbers: an 8x8 jittered grid in 3D space ----
  var holder = el.querySelector(".sp-nums");
  var items = [];
  if (holder) {
    var COLS = 9, ROWS = 7, html = "";
    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        var k = pick(KEYS), m = MAKE[k]();
        var x = ((c + 0.15 + rnd() * 0.7) / COLS) * 100;
        var y = ((r + 0.15 + rnd() * 0.7) / ROWS) * 96 + 1;
        var z = Math.round(-650 + rnd() * 850);
        var depth = (z + 650) / 850; // 0 far .. 1 near
        var size = 0.85 + depth * 1.15 + rnd() * 0.3;
        var pop = 0.1 + rnd() * 1.35, gd = rnd() * 0.18;
        var o = 0.38 + depth * 0.55;
        html +=
          '<span class="sp-n" style="left:' + fx(x, 1) + "%;top:" + fx(y, 1) + "%;--z:" + z + "px;--dx:" + fx(50 - x, 1) + "vw;--dy:" + fx(46 - y, 1) + "vh;--cd:" + fx(rnd() * 0.22, 2) + 's">' +
          '<b class="c-' + k + '" style="font-size:' + fx(size, 2) + "rem;--d:" + fx(pop, 2) + "s;--o:" + fx(o, 2) + ";--hit:" + fx(1.3 + (x / 100) * 1.2, 2) + "s;--gd:" + fx(gd, 2) + "s;--fl:" + fx(6 + rnd() * 12, 0) + "px;--fd:" + fx(rnd() * 1.4, 2) + 's">' + m[0] + "</b></span>";
        items.push({ v: m[1], gd: gd, node: null });
      }
    }
    holder.innerHTML = html;
    var bs = holder.querySelectorAll("b");
    for (var i = 0; i < bs.length; i++) items[i].node = bs[i];
  }

  // ---- the big 3D "100": stacked layers give real depth when it spins ----
  var h3d = el.querySelector(".sp-h3d");
  if (h3d) {
    var layers = "";
    for (var q = 13; q >= 0; q--) layers += '<span class="hl' + (q === 0 ? " front" : "") + '" style="--k:' + q + '">100</span>';
    h3d.innerHTML = layers;
  }

  // ---- wordmark letters + tagline words ----
  var n = 0;
  el.querySelectorAll("[data-letters]").forEach(function (w) {
    var out = "";
    w.getAttribute("data-letters").split("").forEach(function (ch) {
      out += '<span class="sp-l" style="--i:' + n + ";--ry:" + (n % 2 ? 1 : -1) * (25 + ((n * 13) % 30)) + 'deg">' + ch + "</span>";
      n++;
    });
    w.innerHTML = out;
  });
  var tag = el.querySelector("[data-words]");
  if (tag) {
    tag.innerHTML = tag.getAttribute("data-words").split(" ").map(function (wd, i) {
      return '<span class="sp-tw' + (wd === "Alpha" ? " alpha" : "") + '" style="--i:' + i + '">' + wd + "</span>";
    }).join(" ");
  }

  // ---- counters (times in ms from page start; match splash.css) ----
  var counter = el.querySelector("[data-count]");
  var SCAN_AT = 1300, SCAN_DUR = 1300, CONV_AT = 2600, CONV_DUR = 850, TOTAL = 3933;
  function ease(p) { return 1 - Math.pow(1 - p, 3); }
  function tick(now) {
    if (!el.isConnected) return;
    var t = now - T0;
    if (counter) {
      var p = Math.min(Math.max((t - SCAN_AT) / SCAN_DUR, 0), 1);
      counter.textContent = Math.round(TOTAL * ease(p)).toLocaleString("en-IN");
    }
    if (t >= CONV_AT) {
      for (var i = 0; i < items.length; i++) {
        var it = items[i];
        var q = Math.min(Math.max((t - CONV_AT - it.gd * 1000) / CONV_DUR, 0), 1);
        if (q <= 0) continue;
        it.node.textContent = q >= 1 ? "100" : Math.round(it.v + (100 - it.v) * ease(q)).toLocaleString("en-IN");
      }
    }
    if (t < CONV_AT + CONV_DUR + 400) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  function remove() { if (el.parentNode) el.parentNode.removeChild(el); }
  el.addEventListener("animationend", function (e) { if (e.animationName === "sp-out" && e.target === el) remove(); });
  setTimeout(remove, 8000); // failsafe
  el.addEventListener("click", function () { el.classList.add("sp-skip"); });
  window.addEventListener("keydown", function once() { window.removeEventListener("keydown", once); el.classList.add("sp-skip"); });
})();
