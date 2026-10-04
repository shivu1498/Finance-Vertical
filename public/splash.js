/* Builds the intro's number bunches, letters and tagline words, and removes the
 * overlay. Markup lives in index.html (#splash); all timing is in splash.css.
 * The numbers are decorative (random, not market data). */
(function () {
  "use strict";
  var el = document.getElementById("splash");
  if (!el) return;

  // Small seeded generator so the layout is the same every load.
  var seed = 7;
  function rnd() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }
  function pick(a) { return a[Math.floor(rnd() * a.length)]; }
  function fix(n, d) { return n.toFixed(d); }
  function commas(n) { return Math.round(n).toLocaleString("en-IN"); }

  // Each bunch is a themed cluster on a small grid (so numbers never overlap):
  // [x%, y%, width%, columns, rows, colour, number maker]. Top and bottom rows
  // plus two narrow side bunches keep the middle clear for the wordmark.
  var BUNCHES = [
    [1, 3, 30, 2, 4, "g", function () { return "+" + fix(1 + rnd() * 28, 1) + "%"; }],
    [35, 2, 30, 2, 4, "w", function () { return "\u20B9" + commas(100 + rnd() * 3900) + "." + (10 + Math.floor(rnd() * 89)); }],
    [69, 3, 30, 2, 4, "r", function () { return "\u2212" + fix(0.2 + rnd() * 6, 1) + "%"; }],
    [0, 35, 15, 1, 5, "b", function () { return fix(8 + rnd() * 40, 1) + "x"; }],
    [86, 35, 14, 1, 5, "w", function () { return commas(20000 + rnd() * 62000); }],
    [1, 68, 30, 2, 4, "r", function () { return "\u20B9" + commas(50 + rnd() * 9000) + " Cr"; }],
    [35, 70, 30, 2, 4, "g", function () { return "+" + fix(0.3 + rnd() * 9, 2) + "%"; }],
    [69, 68, 30, 2, 4, "b", function () { return pick(["1.2M", "48.6K", "3.4M", "912K", "7.8M", "260K", "5.1M"]); }],
  ];
  var holder = el.querySelector(".sp-nums");
  if (holder) {
    var h = "";
    BUNCHES.forEach(function (b, bi) {
      var items = "", cols = b[3], rows = b[4], slots = cols * rows, count = Math.min(slots - 1, 7);
      for (var i = 0; i < count; i++) {
        var col = i % cols, row = Math.floor(i / cols);
        var x = (col / cols) * 100 + rnd() * (50 / cols), y = (row / rows) * 100 + rnd() * 6;
        var size = 0.8 + rnd() * 0.6 + (i === 0 ? 0.45 : 0);
        var d = 0.1 + bi * 0.27 + i * 0.07 + rnd() * 0.12;
        items +=
          '<span class="sp-n c-' + b[5] + '" style="left:' + fix(x, 1) + "%;top:" + fix(y, 1) + "%;font-size:" + fix(size, 2) + "rem;--d:" + fix(d, 2) + "s;--rot:" + fix(rnd() * 12 - 6, 1) + 'deg;--fl:' + fix(rnd() * 10 + 5, 0) + "px;--fd:" + fix(rnd() * 1.4, 2) + 's">' + b[6]() + "</span>";
      }
      h += '<div class="sp-bunch" style="left:' + b[0] + "%;top:" + b[1] + "%;width:" + b[2] + "%;height:" + (rows * 6.2) + '%">' + items + "</div>";
    });
    holder.innerHTML = h;
  }

  // Wordmark letters, so each can bounce in on its own beat.
  var n = 0;
  el.querySelectorAll("[data-letters]").forEach(function (w) {
    var out = "";
    w.getAttribute("data-letters").split("").forEach(function (ch) {
      out += '<span class="sp-l" style="--i:' + n + ";--rot:" + (n % 2 ? 1 : -1) * (8 + (n * 7) % 14) + 'deg">' + ch + "</span>";
      n++;
    });
    w.innerHTML = out;
  });

  // Tagline: one word at a time. "Alpha" gets its own colour.
  var tag = el.querySelector("[data-words]");
  if (tag) {
    tag.innerHTML = tag.getAttribute("data-words").split(" ").map(function (wd, i) {
      return '<span class="sp-tw' + (wd === "Alpha" ? " alpha" : "") + '" style="--i:' + i + '">' + wd + "</span>";
    }).join(" ");
  }

  function remove() { if (el.parentNode) el.parentNode.removeChild(el); }
  el.addEventListener("animationend", function (e) { if (e.animationName === "sp-out" && e.target === el) remove(); });
  setTimeout(remove, 5800); // failsafe
  el.addEventListener("click", function () { el.classList.add("sp-skip"); });
  window.addEventListener("keydown", function once() { window.removeEventListener("keydown", once); el.classList.add("sp-skip"); });
})();
