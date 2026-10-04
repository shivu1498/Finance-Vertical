/* Builds the intro's rows, letters and counter, and removes the overlay.
 * Markup lives in index.html (#splash); all timing is in splash.css. */
(function () {
  "use strict";
  var el = document.getElementById("splash");
  if (!el) return;

  // Decorative screener-style rows: real tickers, skeleton bars (no figures).
  var T = ["RELIANCE", "TCS", "HDFCBANK", "INFY", "ICICIBANK", "SBIN", "ITC", "LT", "SUNPHARMA", "TITAN", "ABBOTINDIA", "MARUTI", "AXISBANK", "ONGC"];
  var table = el.querySelector(".sp-table");
  if (table) {
    var h = "";
    for (var i = 0; i < T.length; i++) {
      var bars = "";
      for (var j = 0; j < 5; j++) bars += '<i style="width:' + (35 + ((i * 17 + j * 29) % 60)) + '%"></i>';
      h += '<div class="sp-row" style="--i:' + i + '"><b>' + T[i] + "</b>" + bars + "</div>";
    }
    table.innerHTML = h;
  }

  // Wordmark letters, so each can flip up in 3D on its own beat.
  var n = 0;
  el.querySelectorAll("[data-letters]").forEach(function (w) {
    var out = "";
    w.getAttribute("data-letters").split("").forEach(function (ch) {
      out += '<span class="sp-l" style="--i:' + n++ + '">' + ch + "</span>";
    });
    w.innerHTML = out;
  });

  // "Scanning N companies" counter, tied to the beam's run (1.0 s -> 3.5 s).
  var counter = el.querySelector("[data-count]");
  var TOTAL = 3933, start = performance.now() + 1000, DUR = 2500;
  function tick(now) {
    if (!el.isConnected) return;
    var p = Math.min(Math.max((now - start) / DUR, 0), 1);
    if (counter) counter.textContent = Math.round(TOTAL * (1 - Math.pow(1 - p, 2))).toLocaleString("en-IN");
    if (p < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  function remove() { if (el.parentNode) el.parentNode.removeChild(el); }
  el.addEventListener("animationend", function (e) { if (e.animationName === "sp-out" && e.target === el) remove(); });
  setTimeout(remove, 5800); // failsafe
  el.addEventListener("click", function () { el.classList.add("sp-skip"); });
  window.addEventListener("keydown", function once() { window.removeEventListener("keydown", once); el.classList.add("sp-skip"); });
})();
