/* Background switcher.
 *
 * Default is "Matte": flat matte black with a coloured ray flashing once a
 * second (red-rays.js). "Hole 1" and "Hole 2" play one black-hole video each.
 * The choice is remembered per browser.
 *
 * Kept light on purpose: videos are created only when first needed, are muted,
 * pause when the tab is hidden, and reduced-motion / data-saver users get
 * plain matte black instead of video.
 */
(function () {
  "use strict";

  var host = document.querySelector(".field-bg");
  if (!host) return;

  var KEY = "stalkingstocks.bgmode2";
  var MODES = [["matte", "Matte"], ["v1", "Hole 1"], ["v2", "Hole 2"]];
  var VIDEOS = {
    v1: { src: "media/bg-hole-1.mp4", poster: "media/bg-hole-1.jpg" },
    v2: { src: "media/bg-hole-2.mp4", poster: "media/bg-hole-2.jpg" }
  };

  var reduce = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  var saveData = !!(navigator.connection && navigator.connection.saveData);

  function read() {
    try {
      var v = localStorage.getItem(KEY);
      for (var i = 0; i < MODES.length; i++) if (MODES[i][0] === v) return v;
    } catch (e) {}
    return "matte";
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
    var matte = mode === "matte";
    var want = { v1: mode === "v1", v2: mode === "v2" };
    if (reduce || saveData) want = { v1: false, v2: false }; // stills/canvas only

    var anyVideo = want.v1 || want.v2;
    layer.hidden = !anyVideo;
    if (window.StalkingRedRays) window.StalkingRedRays[matte ? "start" : "stop"]();

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

  // Some browsers (low-power mode) block autoplay until a gesture.
  window.addEventListener("pointerdown", function once() {
    window.removeEventListener("pointerdown", once);
    ["v1", "v2"].forEach(function (k) {
      if (vids[k] && shown[k] && vids[k].paused) play(vids[k]);
    });
  }, { passive: true });

  apply();
})();
