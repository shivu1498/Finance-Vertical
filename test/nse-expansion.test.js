// Unit tests for nse-expansion.js. No real network: fetchImpl is mocked.
const zlib = require("zlib");
const { createNseExpansion, findKeywords, industriesAgree, KEYWORDS } = require("../nse-expansion");
const { createDirectory } = require("../companies");
const { extractPdfText } = require("../pdf-text-lite");

let fails = 0;
const check = (n, ok, x = "") => { if (!ok) fails++; console.log((ok ? "PASS " : "FAIL ") + n + (x ? "  -> " + x : "")); };

// ---- pure helpers ----
check("findKeywords: capex", findKeywords("Board approved capex for FY27").includes("capex"));
check("findKeywords: capacity expansion", findKeywords("intimation of Capacity Expansion at the Dahej unit").includes("capacity expansion"));
check("findKeywords: unit expansion", findKeywords("Unit Expansion update").includes("unit expansion"));
check("findKeywords: none", findKeywords("Outcome of Board Meeting").length === 0);
check("findKeywords: 'capex' doesn't false-positive on unrelated text", findKeywords("The company capexplained its results").length === 0);

check("industriesAgree: shared word", industriesAgree("Chemicals", "Chemicals & Petrochemicals") === true);
check("industriesAgree: no overlap", industriesAgree("Textiles", "Information Technology") === false);
check("industriesAgree: missing side -> null", industriesAgree(null, "Chemicals") === null && industriesAgree("Chemicals", null) === null);

// ---- PDF confirmation, with a synthetic Flate PDF (see pdf-text-lite.js) ----
function makePdf(text) {
  const content = `BT /F1 12 Tf 72 700 Td (${text}) Tj ET`;
  const z = zlib.deflateSync(Buffer.from(content, "latin1"));
  const head = `%PDF-1.4\n1 0 obj<< >>endobj\n4 0 obj\n<< /Length ${z.length} /Filter /FlateDecode >>\nstream\n`;
  return Buffer.concat([Buffer.from(head, "latin1"), z, Buffer.from("\nendstream\nendobj\n%%EOF", "latin1")]);
}
check("sanity: extractPdfText round-trips a synthetic PDF", extractPdfText(makePdf("hello capacity expansion world")).includes("capacity expansion"));

// ---- directory cross-reference ----
const dir = createDirectory({
  v: 1,
  groups: ["Chemicals", "Information Technology"],
  industries: [["Specialty Chemicals", 0], ["IT Services", 1]],
  rows: [
    ["Deepak Nitrite Ltd", "DEEPAKNTR", "506401", "INE288B01029", 0],
    ["Infosys Ltd", "INFY", "500209", "INE009A01021", 1],
  ],
});

function mockFetch(routes) {
  const calls = [];
  const f = async (url, opts) => {
    calls.push(url);
    for (const [pat, respond] of routes) if (pat.test(url)) return respond(url, opts);
    throw new Error("unexpected fetch: " + url);
  };
  f.calls = calls;
  return f;
}

const annRow = (over) => ({
  an_dt: "04-Oct-2026 10:00:00", desc: "General Updates", attchmntText: "", smIndustry: "Chemicals",
  sm_name: "Deepak Nitrite Limited", symbol: "DEEPAKNTR", attchmntFile: "https://x/deepak.pdf", ...over,
});

(async () => {
  // homepage (cookie) -> ok with Set-Cookie; api -> one matching row (desc mentions capacity expansion);
  // pdf fetch -> a synthetic PDF confirming "capacity expansion" in the body.
  const pdfBuf = makePdf("The Board approved capacity expansion of the Nandesari unit.");
  const fetchImpl = mockFetch([
    [/nseindia\.com\/$/, async () => ({ ok: true, status: 200, headers: { getSetCookie: () => ["nsit=abc123; Path=/"] } })],
    [/corporate-announcements/, async () => ({ ok: true, status: 200, json: async () => ([annRow({ desc: "Capacity Expansion update" })]) })],
    [/deepak\.pdf/, async () => ({ ok: true, status: 200, arrayBuffer: async () => pdfBuf.buffer.slice(pdfBuf.byteOffset, pdfBuf.byteOffset + pdfBuf.byteLength) })],
  ]);

  const day = new Date(2026, 9, 4); // 04-Oct-2026, matching annRow's an_dt
  const h = createNseExpansion({ directory: dir, fetchImpl, wwwBase: "https://nseindia.com" });
  const out = await h.get(day, day);
  check("get(): one flagged item", out.flagged === 1, JSON.stringify(out));
  const it = out.items[0];
  check("item: company from directory", it.inUniverse === true);
  check("item: our industry resolved", it.ourIndustry === "Specialty Chemicals");
  check("item: nse industry from feed", it.nseIndustry === "Chemicals");
  check("item: industries agree (both mention chemicals)", it.industryMatch === true);
  check("item: keyword found in desc prefilter", it.keywords.includes("capacity expansion"));
  check("item: pdf confirmed the keyword in the body", it.pdfConfirmed === true);
  check("item: cookie was primed before the api call", fetchImpl.calls[0].endsWith("nseindia.com/"));

  // cache: a second get() within cacheMs should not refetch
  const before = fetchImpl.calls.length;
  await h.get(day, day);
  check("get(): cached (no extra fetch calls)", fetchImpl.calls.length === before);

  // industry mismatch case
  const fetchImpl2 = mockFetch([
    [/nseindia\.com\/$/, async () => ({ ok: true, status: 200, headers: { getSetCookie: () => [] } })],
    [/corporate-announcements/, async () => ({ ok: true, status: 200, json: async () => ([
      { ...annRow({ desc: "Capex plan" }), symbol: "INFY", sm_name: "Infosys Limited", smIndustry: "Metals", attchmntFile: null },
    ]) })],
  ]);
  const h2 = createNseExpansion({ directory: dir, fetchImpl: fetchImpl2, wwwBase: "https://nseindia.com" });
  const out2 = await h2.get(day, day);
  check("mismatch: flagged despite no PDF link", out2.items[0].industryMatch === false, JSON.stringify(out2.items[0]));
  check("mismatch: pdf not checked when no url", out2.items[0].pdfChecked === false);

  // blocked upstream
  const fetchImpl3 = mockFetch([
    [/nseindia\.com\/$/, async () => ({ ok: true, status: 200, headers: {} })],
    [/corporate-announcements/, async () => ({ ok: false, status: 403, json: async () => ({}) })],
  ]);
  const h3 = createNseExpansion({ directory: dir, fetchImpl: fetchImpl3, wwwBase: "https://nseindia.com" });
  let errCode = null;
  try { await h3.get(day, day); } catch (e) { errCode = e.code; }
  check("blocked: surfaces a 'blocked' error", errCode === "blocked");

  // chunking: a range wider than maxChunkDays gets clamped
  const h4 = createNseExpansion({ directory: dir, fetchImpl, wwwBase: "https://nseindia.com", maxChunkDays: 7 });
  const wide = await h4.get(day, new Date(2026, 9, 31));
  check("chunking: wide range clamped to maxChunkDays", wide.to === "2026-10-10", JSON.stringify({ from: wide.from, to: wide.to }));

  console.log(fails === 0 ? "\nall passed" : `\n${fails} FAILED`);
  process.exit(fails === 0 ? 0 : 1);
})();
