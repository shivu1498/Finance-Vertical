/* Animated black hole backdrop.
 *
 * Procedural canvas rendering (no image assets), so it stays sharp on any
 * screen up to 4K. A spiral accretion disk of ~2.4k particles orbits a black
 * event horizon with a glowing photon ring, over a slowly rotating starfield,
 * with a few lit rocks drifting through. It mounts inside the existing
 * .field-bg element; if canvas is unavailable the CSS gradient stays as-is.
 */
(function () {
  "use strict";

  var host = document.querySelector(".field-bg");
  if (!host) return;

  var canvas = document.createElement("canvas");
  canvas.className = "bh-canvas";
  var ctx = canvas.getContext("2d");
  if (!ctx) return;
  host.appendChild(canvas);

  var bloom = document.createElement("canvas");
  var bctx = bloom.getContext("2d");
  if (bctx) bctx.imageSmoothingQuality = "high";

  var reduceMotion = !!(
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );

  var TAU = Math.PI * 2;
  var TILT = -0.2; // disk rotation on screen
  var SQUASH = 0.74; // disk inclination (1 = face-on)
  var COS_T = Math.cos(TILT);
  var SIN_T = Math.sin(TILT);

  // Seeded PRNG so every resize rebuilds the same scene.
  var seed = 20240611;
  function rnd() {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  }

  var W = 0, H = 0, dpr = 1;
  var cx = 0, cy = 0, R = 150, unit = 1;
  var ox = 0, oy = 0, tox = 0, toy = 0; // pointer parallax (smoothed)
  var baseGrad = null;
  var stars = [], parts = [], rocks = [];
  var buckets = [], bucketStyle = [];
  var starRadius = 0;
  var quality = 1;

  /* ---------- colour ramp: cyan at the horizon -> blue -> magenta outside ---------- */
  var NB = 16, NA = 3;
  var R_IN = 1.1, R_OUT = 3.7;
  var HUE_STOPS = [[0, 182], [0.25, 202], [0.5, 234], [0.75, 284], [1, 326]];
  var ALPHAS = [0.26, 0.52, 0.88];

  function hueAt(t) {
    for (var i = 1; i < HUE_STOPS.length; i++) {
      if (t <= HUE_STOPS[i][0]) {
        var a = HUE_STOPS[i - 1], b = HUE_STOPS[i];
        return a[1] + ((t - a[0]) / (b[0] - a[0])) * (b[1] - a[1]);
      }
    }
    return HUE_STOPS[HUE_STOPS.length - 1][1];
  }

  function buildBucketStyles() {
    bucketStyle.length = 0;
    for (var hb = 0; hb < NB; hb++) {
      var t = (hb + 0.5) / NB;
      for (var al = 0; al < NA; al++) {
        var light = 74 - t * 20;
        var alpha = ALPHAS[al] * (1 - t * 0.35);
        bucketStyle.push({
          color: "hsla(" + hueAt(t).toFixed(1) + ",100%," + light.toFixed(1) + "%," + alpha.toFixed(3) + ")",
          t: t
        });
      }
    }
  }
  buildBucketStyles();

  /* ---------- scene construction ---------- */
  function buildParticles(count) {
    seed = 777;
    parts.length = 0;
    buckets.length = 0;
    for (var b = 0; b < NB * NA; b++) buckets.push([]);
    for (var i = 0; i < count; i++) {
      var t = Math.pow(rnd(), 1.6); // denser toward the hole
      var r = R_IN + (R_OUT - R_IN) * t;
      var hb = Math.min(NB - 1, Math.floor(t * NB));
      var u = rnd();
      var al = u < 0.5 ? 0 : u < 0.82 ? 1 : 2;
      var omega = 0.34 * Math.pow(r, -1.5); // Keplerian: inner gas spins faster
      var p = {
        r: r,
        a: rnd() * TAU,
        w: omega,
        len: 0.05 + omega * 0.9 + rnd() * 0.08,
        b: hb * NA + al
      };
      parts.push(p);
      buckets[p.b].push(p);
    }
  }

  function buildStars() {
    seed = 4242;
    stars.length = 0;
    var area = W * H;
    var discRatio = (Math.PI * starRadius * starRadius) / Math.max(1, area);
    var n = Math.min(1800, Math.round((area / 5200) * discRatio));
    for (var i = 0; i < n; i++) {
      var rad = Math.sqrt(rnd()) * starRadius;
      var ang = rnd() * TAU;
      var big = rnd() > 0.93;
      stars.push({
        x: Math.cos(ang) * rad,
        y: Math.sin(ang) * rad,
        s: (big ? 1.3 + rnd() * 1.1 : 0.45 + rnd() * 0.75),
        a: 0.35 + rnd() * 0.65,
        sp: 0.6 + rnd() * 2.2,
        ph: rnd() * TAU,
        c: rnd() < 0.7 ? 0 : rnd() < 0.5 ? 1 : 2
      });
    }
  }

  function buildRocks() {
    seed = 99;
    rocks.length = 0;
    for (var i = 0; i < 14; i++) {
      var r = 1.45 + rnd() * 2.5;
      var big = rnd() * rnd();
      rocks.push({
        r: r,
        a: rnd() * TAU,
        w: 0.26 * Math.pow(r, -1.5),
        s: 2.5 + big * 15
      });
    }
  }

  function layout() {
    W = window.innerWidth || document.documentElement.clientWidth || 1280;
    H = window.innerHeight || document.documentElement.clientHeight || 720;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    while (W * H * dpr * dpr > 9.5e6 && dpr > 1) dpr = Math.max(1, dpr - 0.25);

    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    if (bctx) {
      bloom.width = Math.max(2, Math.ceil(canvas.width / 8));
      bloom.height = Math.max(2, Math.ceil(canvas.height / 8));
    }

    var landscape = W >= H * 0.9;
    R = landscape ? Math.min(W, H) * 0.155 : W * 0.19;
    cx = W * (landscape ? 0.66 : 0.5);
    cy = H * (landscape ? 0.5 : 0.58);
    unit = R / 170;

    var far = Math.max(
      Math.hypot(cx, cy), Math.hypot(W - cx, cy),
      Math.hypot(cx, H - cy), Math.hypot(W - cx, H - cy)
    );
    starRadius = far + 40;

    baseGrad = ctx.createRadialGradient(cx, cy, R * 0.5, cx, cy, far);
    baseGrad.addColorStop(0, "#071242");
    baseGrad.addColorStop(0.45, "#040b2c");
    baseGrad.addColorStop(1, "#01030f");

    buildParticles(W < 700 ? 1300 : 2400);
    buildStars();
    buildRocks();
  }

  /* ---------- drawing ---------- */
  var STAR_COLORS = ["#ffffff", "#bcd4ff", "#ffc8ec"];

  function drawStars(t) {
    ctx.save();
    ctx.translate(cx * 0.985 + ox * 0.3, cy * 0.985 + oy * 0.3);
    ctx.rotate(t * 0.0035);
    for (var c = 0; c < 3; c++) {
      ctx.fillStyle = STAR_COLORS[c];
      for (var i = 0; i < stars.length; i++) {
        var s = stars[i];
        if (s.c !== c) continue;
        ctx.globalAlpha = s.a * (0.65 + 0.35 * Math.sin(t * s.sp + s.ph));
        ctx.fillRect(s.x, s.y, s.s, s.s);
      }
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  function drawNebula(x, y) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    var g = ctx.createRadialGradient(x, y, R * 0.9, x, y, R * 4.6);
    g.addColorStop(0, "rgba(60,110,255,0.20)");
    g.addColorStop(0.35, "rgba(120,60,230,0.10)");
    g.addColorStop(0.7, "rgba(200,50,170,0.04)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  // Wide, soft luminous arcs that sweep around the hole at Keplerian speed.
  // They give the disk its flowing, painted look under the fine particles.
  var BANDS = 11;
  function drawBands(t) {
    if (!ctx.createConicGradient) return;
    for (var k = 0; k < BANDS; k++) {
      var f = k / (BANDS - 1);
      var r = R * (1.14 + f * 2.3);
      var hue = hueAt(f);
      var spin = t * 0.34 * Math.pow(1.14 + f * 2.3, -1.5) + k * 1.9;
      var g = ctx.createConicGradient(spin, 0, 0);
      var peak = 0.16 * (1 - f * 0.45);
      g.addColorStop(0, "hsla(" + hue.toFixed(0) + ",100%,62%,0)");
      g.addColorStop(0.35, "hsla(" + hue.toFixed(0) + ",100%,64%," + (peak * 0.4).toFixed(3) + ")");
      g.addColorStop(0.55, "hsla(" + hue.toFixed(0) + ",100%,68%," + peak.toFixed(3) + ")");
      g.addColorStop(0.8, "hsla(" + hue.toFixed(0) + ",100%,62%," + (peak * 0.25).toFixed(3) + ")");
      g.addColorStop(1, "hsla(" + hue.toFixed(0) + ",100%,62%,0)");
      ctx.strokeStyle = g;
      ctx.lineWidth = R * (0.12 + f * 0.1);
      ctx.beginPath();
      ctx.arc(0, 0, r * (1 + 0.03 * Math.sin(t * 0.12 + k)), 0, TAU);
      ctx.stroke();
    }
  }

  function drawDisk(x, y, t) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(TILT);
    ctx.scale(1, SQUASH);
    ctx.globalCompositeOperation = "lighter";
    drawBands(t);
    ctx.lineCap = "round";
    for (var b = 0; b < buckets.length; b++) {
      var list = buckets[b];
      if (!list.length) continue;
      var st = bucketStyle[b];
      ctx.strokeStyle = st.color;
      ctx.lineWidth = (1 + st.t * 2.2) * unit;
      var n = Math.ceil(list.length * quality);
      ctx.beginPath();
      for (var i = 0; i < n; i++) {
        var p = list[i];
        // wobble the radius with angle so the gas forms spiral bands
        var rr = R * p.r * (1 + 0.035 * Math.sin(2 * p.a + p.r * 2.6 + t * 0.1));
        var a1 = p.a, a0 = a1 - p.len;
        ctx.moveTo(Math.cos(a0) * rr, Math.sin(a0) * rr);
        ctx.arc(0, 0, rr, a0, a1);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  function rockPos(k, x, y) {
    var rr = R * k.r;
    var px = Math.cos(k.a) * rr;
    var py = Math.sin(k.a) * rr * SQUASH;
    return { x: x + px * COS_T - py * SIN_T, y: y + px * SIN_T + py * COS_T };
  }

  function drawRocks(x, y, front) {
    for (var i = 0; i < rocks.length; i++) {
      var k = rocks[i];
      var isFront = Math.sin(k.a) >= 0;
      if (isFront !== front) continue;
      var p = rockPos(k, x, y);
      var s = k.s * unit * (1 + 0.22 * Math.sin(k.a));
      var dx = x - p.x, dy = y - p.y;
      var d = Math.hypot(dx, dy) || 1;
      var g = ctx.createRadialGradient(
        p.x + (dx / d) * s * 0.55, p.y + (dy / d) * s * 0.55, 0,
        p.x, p.y, s
      );
      g.addColorStop(0, "rgba(150,230,255,0.95)");
      g.addColorStop(0.45, "rgba(40,70,190,0.85)");
      g.addColorStop(1, "rgba(3,6,26,1)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x, p.y, s, 0, TAU);
      ctx.fill();
    }
  }

  function drawHole(x, y, t) {
    // soft light just outside the horizon
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    var halo = ctx.createRadialGradient(x, y, R * 0.98, x, y, R * 1.9);
    halo.addColorStop(0, "rgba(120,225,255,0.50)");
    halo.addColorStop(0.35, "rgba(70,100,255,0.20)");
    halo.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(x, y, R * 1.9, 0, TAU);
    ctx.fill();
    ctx.restore();

    // event horizon
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.arc(x, y, R, 0, TAU);
    ctx.fill();

    // photon ring, brightest side slowly rotating
    ctx.save();
    ctx.translate(x, y);
    ctx.globalCompositeOperation = "lighter";
    var g;
    if (ctx.createConicGradient) {
      g = ctx.createConicGradient(t * 0.22, 0, 0);
      g.addColorStop(0, "rgba(255,255,255,0.98)");
      g.addColorStop(0.18, "rgba(120,235,255,0.92)");
      g.addColorStop(0.45, "rgba(80,120,255,0.72)");
      g.addColorStop(0.7, "rgba(255,90,205,0.82)");
      g.addColorStop(0.9, "rgba(120,235,255,0.92)");
      g.addColorStop(1, "rgba(255,255,255,0.98)");
    } else {
      g = ctx.createLinearGradient(-R, -R, R, R);
      g.addColorStop(0, "rgba(255,255,255,0.95)");
      g.addColorStop(0.5, "rgba(90,150,255,0.8)");
      g.addColorStop(1, "rgba(255,90,205,0.85)");
    }
    ctx.strokeStyle = g;
    ctx.lineWidth = Math.max(2, R * 0.03);
    ctx.beginPath();
    ctx.arc(0, 0, R * 1.012, 0, TAU);
    ctx.stroke();
    ctx.lineWidth = Math.max(1, R * 0.012);
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    ctx.arc(0, 0, R * 1.07, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }

  function applyBloom() {
    if (!bctx) return;
    bctx.globalCompositeOperation = "copy";
    bctx.drawImage(canvas, 0, 0, canvas.width, canvas.height, 0, 0, bloom.width, bloom.height);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = 0.42;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(bloom, 0, 0, bloom.width, bloom.height, 0, 0, canvas.width, canvas.height);
    ctx.restore();
  }

  function render(t) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.fillStyle = baseGrad;
    ctx.fillRect(0, 0, W, H);

    var x = cx + ox, y = cy + oy;
    drawStars(t);
    drawNebula(x, y);
    drawDisk(x, y, t);
    drawRocks(x, y, false); // behind the hole
    drawHole(x, y, t);
    applyBloom();
    drawRocks(x, y, true); // in front
  }

  /* ---------- animation loop ---------- */
  var last = 0, t = 0, frames = 0, acc = 0, raf = 0;

  function step(dt) {
    t += dt;
    for (var i = 0; i < parts.length; i++) parts[i].a += parts[i].w * dt;
    for (var j = 0; j < rocks.length; j++) rocks[j].a += rocks[j].w * dt;
    ox += (tox - ox) * Math.min(1, dt * 2.5);
    oy += (toy - oy) * Math.min(1, dt * 2.5);
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    var dt = last ? Math.min(0.05, (now - last) / 1000) : 0.016;
    last = now;
    step(dt);
    render(t);

    // back off particle count once if the device can't keep up
    acc += dt;
    if (++frames === 90) {
      if (acc / frames > 0.026 && quality > 0.4) quality = Math.max(0.4, quality * 0.7);
      frames = 0;
      acc = 0;
    }
  }

  function start() {
    if (raf) return;
    last = 0;
    raf = requestAnimationFrame(frame);
  }

  var resizeTimer = 0;
  window.addEventListener("resize", function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      layout();
      if (reduceMotion) render(t);
    }, 120);
  });

  layout();
  if (reduceMotion) {
    t = 6;
    render(t);
  } else {
    window.addEventListener("pointermove", function (e) {
      tox = (e.clientX / W - 0.5) * -26;
      toy = (e.clientY / H - 0.5) * -18;
    }, { passive: true });
    start();
  }
})();
