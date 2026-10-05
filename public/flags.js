// Self-hosted flag icons (inline SVG), so the Markets country pills and the
// Universe table don't depend on the OS/browser's emoji font. Flag emoji
// (the two-letter "regional indicator symbol" pairs, e.g. U+1F1EE U+1F1F3
// for India) render fine on macOS/iOS and most Linux desktops, but a lot of
// Windows configurations never combine them into a flag glyph at all — the
// person just sees two blank boxes or nothing. Plain SVG sidesteps that
// entirely: same pixels on every OS, no font dependency.
//
// These are simplified, UI-icon-scale renderings (~20x14px in practice) —
// proportions and fine detail (exact star counts, the Korean trigrams, the
// Union Jack's counter-changed diagonals) are approximated for legibility
// at that size, not reproduced to vexillological spec. Flags are generic
// government symbols, drawn here from scratch, not copied from anyone
// else's artwork.
(function (global) {
  "use strict";

  function starPoints(cx, cy, rOuter, rInner, rotateDeg) {
    const pts = [];
    const start = ((rotateDeg == null ? -90 : rotateDeg) * Math.PI) / 180;
    const step = Math.PI / 5;
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? rOuter : rInner;
      const a = start + i * step;
      pts.push(`${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`);
    }
    return pts.join(" ");
  }
  function star(cx, cy, r, fill, rotateDeg) {
    return `<polygon points="${starPoints(cx, cy, r, r * 0.382, rotateDeg)}" fill="${fill}"/>`;
  }

  // Simplified Union Jack, sized to an arbitrary w x h box — reused at full
  // size for GB and scaled down into Australia's canton.
  function jack(w, h) {
    return `
      <rect width="${w}" height="${h}" fill="#012169"/>
      <path d="M0 0 L${w} ${h} M${w} 0 L0 ${h}" stroke="#fff" stroke-width="${(h * 0.3).toFixed(2)}"/>
      <path d="M0 0 L${w} ${h} M${w} 0 L0 ${h}" stroke="#C8102E" stroke-width="${(h * 0.11).toFixed(2)}"/>
      <path d="M${w / 2} 0 V${h} M0 ${h / 2} H${w}" stroke="#fff" stroke-width="${(h * 0.36).toFixed(2)}"/>
      <path d="M${w / 2} 0 V${h} M0 ${h / 2} H${w}" stroke="#C8102E" stroke-width="${(h * 0.15).toFixed(2)}"/>
    `;
  }

  const W = 60, H = 40; // shared viewBox for every 3:2 flag

  function indiaChakra(cx, cy, r) {
    let spokes = "";
    for (let i = 0; i < 12; i++) {
      const a = (i * 30 * Math.PI) / 180;
      spokes += `<line x1="${(cx + r * 0.15 * Math.cos(a)).toFixed(2)}" y1="${(cy + r * 0.15 * Math.sin(a)).toFixed(2)}" x2="${(cx + r * Math.cos(a)).toFixed(2)}" y2="${(cy + r * Math.sin(a)).toFixed(2)}" stroke="#00008B" stroke-width="0.5"/>`;
    }
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#00008B" stroke-width="1"/>${spokes}`;
  }

  function usStars() {
    let out = "";
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 5; col++) {
        const cx = ((W * 0.44) / 5) * (col + 0.5);
        const cy = (((H * 7) / 13) / 4) * (row + 0.5);
        out += star(cx, cy, H * 0.045, "#fff");
      }
    }
    return out;
  }

  function usStripes() {
    let out = "";
    for (let i = 0; i < 13; i++) {
      if (i % 2 === 0) out += `<rect y="${(i * H) / 13}" width="${W}" height="${H / 13}" fill="#B22234"/>`;
    }
    return out;
  }

  function hkPetals() {
    let out = "";
    for (let i = 0; i < 5; i++) {
      const a = ((i * 72 - 90) * Math.PI) / 180;
      const cx = W / 2 + H * 0.17 * Math.cos(a), cy = H / 2 + H * 0.17 * Math.sin(a);
      out += `<ellipse cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" rx="${(H * 0.11).toFixed(2)}" ry="${(H * 0.19).toFixed(2)}" fill="#fff" transform="rotate(${(i * 72).toFixed(0)} ${cx.toFixed(2)} ${cy.toFixed(2)})"/>`;
    }
    return out;
  }

  function cnStars() {
    return (
      star(W * 0.14, H * 0.2, H * 0.17, "#FFDE00") +
      star(W * 0.28, H * 0.09, H * 0.05, "#FFDE00", -70) +
      star(W * 0.34, H * 0.18, H * 0.05, "#FFDE00", -20) +
      star(W * 0.33, H * 0.3, H * 0.05, "#FFDE00", 20) +
      star(W * 0.27, H * 0.38, H * 0.05, "#FFDE00", 70)
    );
  }

  function auStars() {
    return (
      star(W * 0.5, H * 0.74, H * 0.09, "#fff") +
      star(W * 0.76, H * 0.22, H * 0.06, "#fff") +
      star(W * 0.84, H * 0.44, H * 0.05, "#fff") +
      star(W * 0.78, H * 0.66, H * 0.06, "#fff") +
      star(W * 0.67, H * 0.55, H * 0.04, "#fff")
    );
  }

  function sgStars() {
    let out = "";
    for (let i = 0; i < 5; i++) out += star(W * (0.3 + i * 0.065), H * 0.26, H * 0.045, "#fff");
    return out;
  }

  function krTaegeuk(cx, cy, r) {
    const rr = r / 2;
    return `
      <path d="M${cx},${cy - r} A${rr},${rr} 0 0,1 ${cx},${cy} A${rr},${rr} 0 0,0 ${cx},${cy + r} A${r},${r} 0 0,0 ${cx},${cy - r} Z" fill="#C60C30"/>
      <path d="M${cx},${cy - r} A${rr},${rr} 0 0,0 ${cx},${cy} A${rr},${rr} 0 0,1 ${cx},${cy + r} A${r},${r} 0 0,1 ${cx},${cy - r} Z" fill="#003478"/>
    `;
  }

  const FLAGS = {
    IN: {
      vb: `0 0 ${W} ${H}`,
      inner: `
        <rect width="${W}" height="${H / 3}" fill="#FF9933"/>
        <rect y="${H / 3}" width="${W}" height="${H / 3}" fill="#fff"/>
        <rect y="${(2 * H) / 3}" width="${W}" height="${H / 3}" fill="#138808"/>
        ${indiaChakra(W / 2, H / 2, H * 0.14)}
      `,
    },
    US: {
      vb: `0 0 ${W} ${H}`,
      inner: `
        <rect width="${W}" height="${H}" fill="#fff"/>
        ${usStripes()}
        <rect width="${W * 0.44}" height="${(H * 7) / 13}" fill="#3C3B6E"/>
        ${usStars()}
      `,
    },
    GB: { vb: `0 0 ${W} ${H}`, inner: jack(W, H) },
    DE: {
      vb: `0 0 ${W} ${H}`,
      inner: `
        <rect width="${W}" height="${H / 3}" fill="#000"/>
        <rect y="${H / 3}" width="${W}" height="${H / 3}" fill="#DD0000"/>
        <rect y="${(2 * H) / 3}" width="${W}" height="${H / 3}" fill="#FFCE00"/>
      `,
    },
    FR: {
      vb: `0 0 ${W} ${H}`,
      inner: `
        <rect width="${W / 3}" height="${H}" fill="#0055A4"/>
        <rect x="${W / 3}" width="${W / 3}" height="${H}" fill="#fff"/>
        <rect x="${(2 * W) / 3}" width="${W / 3}" height="${H}" fill="#EF4135"/>
      `,
    },
    JP: {
      vb: `0 0 ${W} ${H}`,
      inner: `
        <rect width="${W}" height="${H}" fill="#fff"/>
        <circle cx="${W / 2}" cy="${H / 2}" r="${H * 0.3}" fill="#BC002D"/>
      `,
    },
    HK: { vb: `0 0 ${W} ${H}`, inner: `<rect width="${W}" height="${H}" fill="#DE2910"/>${hkPetals()}` },
    CN: { vb: `0 0 ${W} ${H}`, inner: `<rect width="${W}" height="${H}" fill="#DE2910"/>${cnStars()}` },
    CA: {
      vb: `0 0 ${W} ${H}`,
      inner: `
        <rect width="${W}" height="${H}" fill="#fff"/>
        <rect width="${W * 0.25}" height="${H}" fill="#FF0000"/>
        <rect x="${W * 0.75}" width="${W * 0.25}" height="${H}" fill="#FF0000"/>
        <path d="M30,8 L32,17 L39,15 L36,21 L41,23 L35,25 L36,32 L30,28 L24,32 L25,25 L19,23 L24,21 L21,15 L28,17 Z" fill="#FF0000"/>
      `,
    },
    AU: {
      vb: `0 0 ${W} ${H}`,
      inner: `<rect width="${W}" height="${H}" fill="#00247d"/><g>${jack(W * 0.5, H * 0.5)}</g>${auStars()}`,
    },
    SG: {
      vb: `0 0 ${W} ${H}`,
      inner: `
        <rect width="${W}" height="${H / 2}" fill="#EF3340"/>
        <rect y="${H / 2}" width="${W}" height="${H / 2}" fill="#fff"/>
        <circle cx="${W * 0.18}" cy="${H * 0.26}" r="${H * 0.16}" fill="#fff"/>
        <circle cx="${W * 0.23}" cy="${H * 0.26}" r="${H * 0.13}" fill="#EF3340"/>
        ${sgStars()}
      `,
    },
    KR: {
      vb: `0 0 ${W} ${H}`,
      inner: `
        <rect width="${W}" height="${H}" fill="#fff"/>
        ${krTaegeuk(W / 2, H / 2, H * 0.26)}
        <g stroke="#000" stroke-width="0.8">
          <line x1="${W * 0.12}" y1="${H * 0.18}" x2="${W * 0.26}" y2="${H * 0.18}"/>
          <line x1="${W * 0.12}" y1="${H * 0.23}" x2="${W * 0.26}" y2="${H * 0.23}"/>
          <line x1="${W * 0.12}" y1="${H * 0.28}" x2="${W * 0.26}" y2="${H * 0.28}"/>
          <line x1="${W * 0.74}" y1="${H * 0.72}" x2="${W * 0.88}" y2="${H * 0.72}"/>
          <line x1="${W * 0.74}" y1="${H * 0.77}" x2="${W * 0.88}" y2="${H * 0.77}"/>
          <line x1="${W * 0.74}" y1="${H * 0.82}" x2="${W * 0.88}" y2="${H * 0.82}"/>
        </g>
      `,
    },
    BR: {
      vb: `0 0 ${W} ${H}`,
      inner: `
        <rect width="${W}" height="${H}" fill="#009739"/>
        <polygon points="${W / 2},${H * 0.1} ${W * 0.92},${H / 2} ${W / 2},${H * 0.9} ${W * 0.08},${H / 2}" fill="#FEDD00"/>
        <circle cx="${W / 2}" cy="${H / 2}" r="${H * 0.16}" fill="#002776"/>
      `,
    },
    CH: {
      vb: `0 0 ${H} ${H}`,
      inner: `
        <rect width="${H}" height="${H}" fill="#D52B1E"/>
        <rect x="${H * 0.42}" y="${H * 0.18}" width="${H * 0.16}" height="${H * 0.64}" fill="#fff"/>
        <rect x="${H * 0.18}" y="${H * 0.42}" width="${H * 0.64}" height="${H * 0.16}" fill="#fff"/>
      `,
    },
  };

  function flagSvg(code, className) {
    const f = FLAGS[code];
    if (!f) return "";
    return `<svg class="flag-icon${className ? " " + className : ""}" viewBox="${f.vb}" aria-hidden="true" focusable="false">${f.inner}</svg>`;
  }

  global.FLAGS = { svg: flagSvg, codes: Object.keys(FLAGS) };
})(window);
