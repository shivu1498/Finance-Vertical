/* Video backgrounds + switcher.
 *
 * Two black-hole loops play at the same time ("Both", the default): the second
 * is screen-blended over the first so each shows through the other. The pill
 * at the bottom-right switches to either video alone or back to the animated
 * canvas (blackhole-bg.js). The choice is remembered per browser.
 *
 * Kept light on purpose: videos are created only when first needed, are muted,
 * pause when the tab is hidden, phones get one video instead of two, and
 * reduced-motion / data-saver users keep the still-or-canvas background.
 */
(function () {
  "use strict";

  var host = document.querySelector(".field-bg");
  if (!host) return;

  var KEY = "stalkingstocks.bgmode";
  var MODES = [["both", "Both"], ["v1", "Hole 1"], ["v2", "Hole 2"], ["canvas", "Animated"]];
  var VIDEOS = {
    v1: { src: "media/bg-hole-1.mp4", poster: "media/bg-hole-1.jpg" },
    v2: { src: "media/bg-hole-2.mp4", poster: "media/bg-hole-2.jpg" }
  };

  var reduce = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  var saveData = !!(navigator.connection && navigator.connection.saveData);
  var small = window.matchMedia ? window.matchMedia("(max-width: 700px)") : { matches: false };

  function read() {
    try {
      var v = localStorage.getItem(KEY);
      for (var i = 0; i < MODES.length; i++) if (MODES[i][0] === v) return v;
    } catch (e) {}
    return "both";
  }
  function save(v) {
    try { localStorage.setItem(KEY, v); } catch (e) {}
  }

  var layer = document.createElement("div");
  layer.className = "bgv";
  layer.setAttribute("aria-hidden", "true");
  var scrim = document.createElement("div");
  scrim.className = "bgv-scrim";
  layer.appendChild(scrim);
  layer.hidden = true;
  host.appendChild(layer);

  var vids = {};
  function ensure(key) {
    if (vids[key]) return vids[key];
    var cfg = VIDEOS[key];
    var v = document.createElement("video");
    v.className = "bgv-v bgv-" + key;
    v.muted = true;
    v.defaultMuted = true;
    v.loop = true;
    v.playsInline = true;
    v.autoplay = true;
    v.preload = "auto";
    v.poster = cfg.poster;
    v.setAttribute("muted", "");
    v.setAttribute("playsinline", "");
    v.setAttribute("disablepictureinpicture", "");
    v.tabIndex = -1;
    v.src = cfg.src;
    layer.insertBefore(v, scrim);
    vids[key] = v;
    return v;
  }

  function play(v) {
    var p = v.play();
    if (p && p.catch) p.catch(function () { /* autoplay blocked: poster stays; retried on first tap */ });
  }

  var mode = read();
  var shown = { v1: false, v2: false };
  var buttons = {};

  function apply() {
    var want = { v1: mode === "both" || mode === "v1", v2: mode === "both" || mode === "v2" };
    if (mode === "both" && small.matches) want.v2 = false; // one video on phones
    if (reduce || saveData) want = { v1: false, v2: false }; // stills/canvas only

    var anyVideo = want.v1 || want.v2;
    layer.hidden = !anyVideo;
    layer.classList.toggle("is-both", want.v1 && want.v2);
    var canvas = host.querySelector(".bh-canvas");
    if (canvas) canvas.style.display = anyVideo ? "none" : "";
    if (window.StalkingCanvasBg) window.StalkingCanvasBg[anyVideo ? "stop" : "start"]();

    ["v1", "v2"].forEach(function (k) {
      shown[k] = want[k];
      if (want[k]) {
        var v = ensure(k);
        v.hidden = false;
        if (!document.hidden) play(v);
      } else if (vids[k]) {
        vids[k].pause();
        vids[k].hidden = true;
      }
    });

    Object.keys(buttons).forEach(function (m) {
      buttons[m].setAttribute("aria-pressed", String(m === mode));
      buttons[m].classList.toggle("active", m === mode);
    });
  }

  // Switcher
  var bar = document.createElement("div");
  bar.className = "bgv-switch";
  bar.setAttribute("role", "group");
  bar.setAttribute("aria-label", "Background");
  var label = document.createElement("span");
  label.className = "bgv-label";
  label.textContent = "Background";
  bar.appendChild(label);
  MODES.forEach(function (m) {
    var b = document.createElement("button");
    b.type = "button";
    b.textContent = m[1];
    b.addEventListener("click", function () {
      mode = m[0];
      save(mode);
      apply();
    });
    buttons[m[0]] = b;
    bar.appendChild(b);
  });
  document.body.appendChild(bar);

  document.addEventListener("visibilitychange", function () {
    ["v1", "v2"].forEach(function (k) {
      if (!vids[k] || !shown[k]) return;
      if (document.hidden) vids[k].pause();
      else play(vids[k]);
    });
  });
  if (small.addEventListener) small.addEventListener("change", apply);

  // Some browsers (low-power mode) block autoplay until a gesture.
  window.addEventListener("pointerdown", function once() {
    window.removeEventListener("pointerdown", once);
    ["v1", "v2"].forEach(function (k) {
      if (vids[k] && shown[k] && vids[k].paused) play(vids[k]);
    });
  }, { passive: true });

  apply();
})();
