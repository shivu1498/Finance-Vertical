// Best-effort plain-text extraction from a PDF, using only Node's built-in
// zlib — no pdf-parsing package. It decompresses each FlateDecode content
// stream (the common case for an office-suite-generated PDF, which is what
// most Indian regulatory filings are) and pulls text out of the PDF text-
// showing operators (Tj / TJ). It does not handle scanned/image PDFs, other
// stream filters, or CID/Type0 fonts with custom encodings — on any of
// those it just returns less text (or none), never throws. Callers should
// treat a thin or empty result as "couldn't confirm from the PDF," not as
// "the PDF says no."

function decodePdfString(s) {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c !== "\\") { out += c; continue; }
    const n = s[i + 1];
    if (n === "n") { out += "\n"; i++; }
    else if (n === "r") { out += "\r"; i++; }
    else if (n === "t") { out += "\t"; i++; }
    else if (n === "(" || n === ")" || n === "\\") { out += n; i++; }
    else if (n >= "0" && n <= "7") {
      const m = /^[0-7]{1,3}/.exec(s.slice(i + 1, i + 4));
      out += String.fromCharCode(parseInt(m[0], 8));
      i += m[0].length;
    } else if (n === "\n" || n === "\r") { i++; } // line continuation: drop it
    else { out += n; i++; }
  }
  return out;
}

// Pulls readable text out of one decompressed content stream.
function textFromContentStream(s) {
  let out = "";
  for (const m of s.matchAll(/\(((?:[^()\\]|\\.)*)\)\s*Tj/g)) out += decodePdfString(m[1]) + " ";
  // A TJ array interleaves strings with kerning numbers: [(Wo)-2(rd) -250 (Next)] TJ.
  // A small number is just letter-spacing (no gap); a large negative one is a
  // real word gap, so insert a space there rather than gluing words together.
  for (const m of s.matchAll(/\[((?:[^\[\]\\]|\\.)*)\]\s*TJ/g)) {
    for (const tok of m[1].matchAll(/\(((?:[^()\\]|\\.)*)\)|(-?\d+(?:\.\d+)?)/g)) {
      if (tok[1] !== undefined) out += decodePdfString(tok[1]);
      else if (Number(tok[2]) < -150) out += " ";
    }
    out += " ";
  }
  return out;
}

// buf: a Buffer of the raw PDF file. Returns a plain-text best-effort string.
function extractPdfText(buf, { maxStreams = 500, maxBytes = 15_000_000 } = {}) {
  if (!Buffer.isBuffer(buf) || !buf.length || buf.length > maxBytes) return "";
  const zlib = require("zlib");
  const str = buf.toString("latin1"); // 1 char == 1 byte, so slices map back to the Buffer exactly
  const re = /<<([^>]*?)>>\s*stream\r?\n/g;
  let out = "";
  let n = 0;
  let m;
  while (n < maxStreams && (m = re.exec(str))) {
    n++;
    const dict = m[1];
    const start = m.index + m[0].length;
    const end = str.indexOf("endstream", start);
    if (end < 0) continue;
    // "endstream" is usually preceded by a line break that isn't part of the data.
    let dataEnd = end;
    if (str[dataEnd - 1] === "\n") dataEnd--;
    if (str[dataEnd - 1] === "\r") dataEnd--;
    re.lastIndex = end;
    if (!/FlateDecode/.test(dict)) continue; // the common case; others are skipped
    try {
      const raw = zlib.inflateSync(Buffer.from(str.slice(start, dataEnd), "latin1"));
      out += textFromContentStream(raw.toString("latin1")) + "\n";
    } catch {
      // not valid flate data (or an image/font stream mislabeled) — skip it
    }
  }
  return out.replace(/[ \t]+/g, " ").trim();
}

module.exports = { extractPdfText, textFromContentStream, decodePdfString };
