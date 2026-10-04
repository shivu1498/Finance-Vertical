/* Matte black background with red rays that flash through once a second.
 *
 * Every 1000 ms a few thin red rays streak across the screen and a faint red
 * wash ignites the page for a moment, then fades back to matte black.
 * Colours cycle red, trypan blue, green; each ray briefly tints the UI too.
 * Exposes window.StalkingRedRays = {start, stop}; video-bg.js decides when.
 *
 * Gentle on purpose: one flash per second (well under the 3 Hz photosensitivity
 * limit), a low-opacity wash, paused when the tab is hidden, and off entirely
 * for people who prefer reduced motion.
 */
(function () {
  "use strict";

  var host = document.querySelector(".field-bg");
  if (!host) return;

  var PERIOD = 1000;      // ms between flashes
  var RAY_MS = 560;       // how long a ray takes to cross the screen
  var WASH_PEAK = 1;   // peak opacity of the wash layer

  // Each flash is one colour, cycling red -> trypan blue -> green. While a ray
  // passes, the page's accent, text and borders take that colour for a blink.
  var PALETTE = [
    { rgb: "255,45,30",  hot: "255,200,170", head: "255,90,70",   accent: "#ff4d43", tint: "#ffb3ab", dim: "#ff8f85", border: "rgba(255,77,67,.55)" },
    { rgb: "30,95,255",  hot: "190,215,255", head: "90,140,255",  accent: "#4d86ff", tint: "#b8cfff", dim: "#8fb4ff", border: "rgba(77,134,255,.55)" },
    { rgb: "20,225,100", hot: "190,255,215", head: "70,240,140",  accent: "#2ee476", tint: "#b4ffd2", dim: "#7dffaa", border: "rgba(46,228,118,.55)" }
  ];
  var BLINK_MS = 140;     // how long the page elements wear the ray's colour
  var root = document.documentElement;
  var colorIdx = -1, pal = PALETTE[0], tinted = false;

  var reduce = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  var canvas = document.createElement("canvas");
  canvas.className = "rr-canvas";
  canvas.setAttribute("aria-hidden", "true");
  canvas.hidden = true;
  document.body.appendChild(canvas); // above the cards so rays visibly cross the page
  var ctx = canvas.getContext && canvas.getContext("2d");

  var wash = document.createElement("div");
  wash.className = "rr-wash";
  wash.setAttribute("aria-hidden", "true");
  document.body.appendChild(wash);

  var w = 0, h = 0, dpr = 1;
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  var rays = [];
  var flashAt = 0;
  var running = false;
  var raf = 0;
  var nextFlash = 0;

  function rand(a, b) { return a + Math.random() * (b - a); }

  // A ray enters from a random edge point and crosses the screen at an angle.
  function spawn(now) {
    var n = 2 + Math.floor(Math.random() * 3); // 2-4 rays
    var diag = Math.sqrt(w * w + h * h);
    var cx = rand(0.2, 0.8) * w, cy = rand(0.15, 0.7) * h;
    flashAt = now;
    colorIdx = (colorIdx + 1) % PALETTE.length;
    pal = PALETTE[colorIdx];
    wash.style.setProperty("--rr-rgb", pal.rgb);
    root.style.setProperty("--rr-accent", pal.accent);
    root.style.setProperty("--rr-tint", pal.tint);
    root.style.setProperty("--rr-dim", pal.dim);
    root.style.setProperty("--rr-border", pal.border);
    wash.style.setProperty("--rr-x", (cx / w * 100).toFixed(1) + "%");
    wash.style.setProperty("--rr-y", (cy / h * 100).toFixed(1) + "%");
    for (var i = 0; i < n; i++) {
      var a = rand(-0.55, 0.55) + (Math.random() < 0.5 ? 0.35 : Math.PI - 0.35); // mostly diagonal
      var dx = Math.cos(a), dy = Math.sin(a);
      // start behind the centre point so the ray passes through the screen
      var back = diag * 0.6;
      rays.push({
        t0: now + i * rand(20, 90),
        x: cx + rand(-0.18, 0.18) * w - dx * back,
        y: cy + rand(-0.18, 0.18) * h - dy * back,
        dx: dx, dy: dy,
        len: diag * 1.2,
        tail: diag * rand(0.28, 0.5),
        width: rand(1.6, 3.6),
        hot: Math.random() < 0.35
      });
    }
  }

  function draw(now) {
    if (!running) return;
    if (now >= nextFlash) {
      spawn(now);
      nextFlash = now + PERIOD;
    }

    ctx.clearRect(0, 0, w, h);
    ctx.globalCompositeOperation = "lighter";

    var live = [];
    for (var i = 0; i < rays.length; i++) {
      var r = rays[i];
      var p = (now - r.t0) / RAY_MS;
      if (p < 0) { live.push(r); continue; }
      if (p > 1.25) continue;
      live.push(r);
      var e = 1 - Math.pow(1 - Math.min(p, 1), 2);          // ease-out head position
      var hx = r.x + r.dx * r.len * e, hy = r.y + r.dy * r.len * e;
      var tx = hx - r.dx * r.tail, ty = hy - r.dy * r.tail;
      var fade = p < 0.15 ? p / 0.15 : p < 0.35 ? 1 : Math.max(0, 1 - (p - 0.35) / 0.9);

      var g = ctx.createLinearGradient(tx, ty, hx, hy);
      g.addColorStop(0, "rgba(" + pal.rgb + ",0)");
      g.addColorStop(0.75, "rgba(" + pal.rgb + "," + (0.85 * fade).toFixed(3) + ")");
      g.addColorStop(1, "rgba(" + (r.hot ? pal.hot : pal.head) + "," + fade.toFixed(3) + ")");
      ctx.strokeStyle = g;
      ctx.lineCap = "round";
      ctx.shadowColor = "rgba(" + pal.rgb + "," + (0.9 * fade).toFixed(3) + ")";
      ctx.shadowBlur = 22;
      ctx.lineWidth = r.width;
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(hx, hy);
      ctx.stroke();
    }
    rays = live;
    ctx.shadowBlur = 0;

    // The ignite: wash jumps up fast, then decays back to black.
    var s = (now - flashAt) / 1000;
    var k = s < 0.06 ? s / 0.06 : Math.exp(-(s - 0.06) * 6.5);
    wash.style.opacity = (WASH_PEAK * Math.max(0, k)).toFixed(3);

    var on = now - flashAt < BLINK_MS;
    if (on !== tinted) { tinted = on; root.classList.toggle("rr-blink", on); }

    raf = requestAnimationFrame(draw);
  }

  function start() {
    if (reduce || !ctx || running) return;
    running = true;
    canvas.hidden = false;
    resize();
    nextFlash = performance.now() + 150;
    raf = requestAnimationFrame(draw);
  }

  function stop() {
    running = false;
    cancelAnimationFrame(raf);
    rays = [];
    canvas.hidden = true;
    wash.style.opacity = "0";
    tinted = false;
    root.classList.remove("rr-blink");
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  window.addEventListener("resize", function () { if (running) resize(); });
  document.addEventListener("visibilitychange", function () {
    if (!running) return;
    if (document.hidden) { cancelAnimationFrame(raf); tinted = false; root.classList.remove("rr-blink"); }
    else { nextFlash = performance.now() + 100; raf = requestAnimationFrame(draw); }
  });

  window.StalkingRedRays = { start: start, stop: stop };
})();
