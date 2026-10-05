// Unit tests for nse-announcements.js. No real network: fetchImpl is mocked.
const zlib = require("zlib");
const { createNseAnnouncements, findKeywords, findCategoryMatches, industriesAgree, CATEGORIES } = require("../nse-announcements");
const { createDirectory } = require("../companies");
const { extractPdfText } = require("../pdf-text-lite");

let fails = 0;
const check = (n, ok, x = "") => { if (!ok) fails++; console.log((ok ? "PASS " : "FAIL ") + n + (x ? "  -> " + x : "")); };

// ---- pure helpers: category matching across all five tracked categories ----
check("findKeywords: capex", findKeywords("Board approved capex for FY27").includes("capex"));
check("findKeywords: capacity expansion", findKeywords("intimation of Capacity Expansion at the Dahej unit").includes("capacity expansion"));
check("findKeywords: unit expansion", findKeywords("Unit Expansion update").includes("unit expansion"));
check("findKeywords: none", findKeywords("Outcome of Board Meeting").length === 0);
check("findKeywords: 'capex' doesn't false-positive on unrelated text", findKeywords("The company capexplained its results").length === 0);

check("findCategoryMatches: new order", findCategoryMatches("Company bags a new order worth Rs 200 crore").some((c) => c.id === "new_order"));
check("findCategoryMatches: letter of award", findCategoryMatches("Receipt of Letter of Award from NHAI").some((c) => c.id === "new_order"));
check("findCategoryMatches: product launch", findCategoryMatches("Company launches new product in the diagnostics segment").some((c) => c.id === "product_launch"));
check("findCategoryMatches: M&A", findCategoryMatches("Board approves acquisition of 51% stake in XYZ Ltd").some((c) => c.id === "ma"));
check("findCategoryMatches: management change", findCategoryMatches("Resignation of Independent Director").some((c) => c.id === "management_change"));
check("findCategoryMatches: management change, appointment phrasing", findCategoryMatches("Appointment of Mr. X as Managing Director").some((c) => c.id === "management_change"));
check("findCategoryMatches: management change, ceases to be KMP", findCategoryMatches("Intimation that Mr. Y ceases to be a Key Managerial Personnel").some((c) => c.id === "management_change"));
check("findCategoryMatches: a filing can match more than one category", (() => {
  const hits = findCategoryMatches("Capacity expansion plan approved; also appointment of new CFO");
  return hits.some((c) => c.id === "capex") && hits.some((c) => c.id === "management_change");
})());

// management_change used to match bare "appointment"/"resignation", which
// flagged nearly every board-meeting-outcome filing (auditor/scrutinizer
// appointments are routine, not a management change) and was the main
// reason a full scan was slow — every flagged filing pays for a PDF fetch.
// It's now scoped to director/KMP-level roles specifically.
check("findCategoryMatches: 'appointment of statutory auditors' is NOT a management change", findCategoryMatches("Appointment of Statutory Auditors for FY27").every((c) => c.id !== "management_change"));
check("findCategoryMatches: 're-appointment of auditors' is NOT a management change", findCategoryMatches("Re-appointment of M/s ABC & Co as Statutory Auditors").every((c) => c.id !== "management_change"));
check("findCategoryMatches: 'resignation of auditor' is NOT a management change", findCategoryMatches("Resignation of Auditor").every((c) => c.id !== "management_change"));
check("findCategoryMatches: 'appointment of scrutinizer' is NOT a management change", findCategoryMatches("Appointment of Scrutinizer for e-voting").every((c) => c.id !== "management_change"));
check("CATEGORIES: exposes id+label for all five tracked categories", CATEGORIES.length === 5 && CATEGORIES.every((c) => c.id && c.label));

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
  const h = createNseAnnouncements({ directory: dir, fetchImpl, wwwBase: "https://nseindia.com" });
  const out = await h.get(day, day);
  check("get(): one flagged item", out.flagged === 1, JSON.stringify(out));
  check("get(): exposes category metadata for the client's filter chips", out.categories.some((c) => c.id === "capex"));
  const it = out.items[0];
  check("item: company from directory", it.inUniverse === true);
  check("item: our industry resolved", it.ourIndustry === "Specialty Chemicals");
  check("item: nse industry from feed", it.nseIndustry === "Chemicals");
  check("item: industries agree (both mention chemicals)", it.industryMatch === true);
  check("item: tagged with the capex category", it.categories.some((c) => c.id === "capex"));
  check("item: keyword found in desc prefilter", it.keywords.includes("capacity expansion"));
  check("item: pdf confirmed the keyword in the body", it.pdfConfirmed === true);
  check("item: cookie was primed before the api call", fetchImpl.calls[0].endsWith("nseindia.com/"));

  // cache: a second get() within cacheMs should not refetch
  const before = fetchImpl.calls.length;
  await h.get(day, day);
  check("get(): cached (no extra fetch calls)", fetchImpl.calls.length === before);

  // a filing that matches two categories at once (new order + management change)
  const fetchImplMulti = mockFetch([
    [/nseindia\.com\/$/, async () => ({ ok: true, status: 200, headers: { getSetCookie: () => [] } })],
    [/corporate-announcements/, async () => ({ ok: true, status: 200, json: async () => ([
      { ...annRow({ desc: "Receipt of new order worth Rs 50 crore; appointment of new CFO" }), symbol: "INFY", sm_name: "Infosys Limited", attchmntFile: null },
    ]) })],
  ]);
  const hMulti = createNseAnnouncements({ directory: dir, fetchImpl: fetchImplMulti, wwwBase: "https://nseindia.com" });
  const outMulti = await hMulti.get(day, day);
  const itMulti = outMulti.items[0];
  const multiIds = itMulti.categories.map((c) => c.id);
  check("multi-category: tagged with both new_order and management_change", multiIds.includes("new_order") && multiIds.includes("management_change"), JSON.stringify(multiIds));

  // industry mismatch case
  const fetchImpl2 = mockFetch([
    [/nseindia\.com\/$/, async () => ({ ok: true, status: 200, headers: { getSetCookie: () => [] } })],
    [/corporate-announcements/, async () => ({ ok: true, status: 200, json: async () => ([
      { ...annRow({ desc: "Capex plan" }), symbol: "INFY", sm_name: "Infosys Limited", smIndustry: "Metals", attchmntFile: null },
    ]) })],
  ]);
  const h2 = createNseAnnouncements({ directory: dir, fetchImpl: fetchImpl2, wwwBase: "https://nseindia.com" });
  const out2 = await h2.get(day, day);
  check("mismatch: flagged despite no PDF link", out2.items[0].industryMatch === false, JSON.stringify(out2.items[0]));
  check("mismatch: pdf not checked when no url", out2.items[0].pdfChecked === false);

  // blocked upstream
  const fetchImpl3 = mockFetch([
    [/nseindia\.com\/$/, async () => ({ ok: true, status: 200, headers: {} })],
    [/corporate-announcements/, async () => ({ ok: false, status: 403, json: async () => ({}) })],
  ]);
  const h3 = createNseAnnouncements({ directory: dir, fetchImpl: fetchImpl3, wwwBase: "https://nseindia.com" });
  let errCode = null;
  try { await h3.get(day, day); } catch (e) { errCode = e.code; }
  check("blocked: surfaces a 'blocked' error", errCode === "blocked");

  // chunking: a range wider than maxChunkDays gets clamped
  const h4 = createNseAnnouncements({ directory: dir, fetchImpl, wwwBase: "https://nseindia.com", maxChunkDays: 7 });
  const wide = await h4.get(day, new Date(2026, 9, 31));
  check("chunking: wide range clamped to maxChunkDays", wide.to === "2026-10-10", JSON.stringify({ from: wide.from, to: wide.to }));

  // PDF confirmation used to run one filing at a time, which was the main
  // reason a chunk (and so a full scan) was slow. Confirm several flagged
  // filings in one chunk actually get their PDFs fetched concurrently, not
  // one after another, by tracking how many PDF fetches are in flight at
  // once.
  let inFlight = 0, maxInFlight = 0;
  const pdfBuf2 = makePdf("capacity expansion of the plant");
  const fetchImplConcurrent = mockFetch([
    [/nseindia\.com\/$/, async () => ({ ok: true, status: 200, headers: { getSetCookie: () => [] } })],
    [/corporate-announcements/, async () => ({ ok: true, status: 200, json: async () => ([
      annRow({ symbol: "A", sm_name: "A Ltd", desc: "Capacity Expansion A", attchmntFile: "https://x/a.pdf" }),
      annRow({ symbol: "B", sm_name: "B Ltd", desc: "Capacity Expansion B", attchmntFile: "https://x/b.pdf" }),
      annRow({ symbol: "C", sm_name: "C Ltd", desc: "Capacity Expansion C", attchmntFile: "https://x/c.pdf" }),
    ]) })],
    [/[abc]\.pdf/, async () => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 30)); // hold the "fetch" open so concurrent ones overlap
      inFlight--;
      return { ok: true, status: 200, arrayBuffer: async () => pdfBuf2.buffer.slice(pdfBuf2.byteOffset, pdfBuf2.byteOffset + pdfBuf2.byteLength) };
    }],
  ]);
  const h5 = createNseAnnouncements({ directory: dir, fetchImpl: fetchImplConcurrent, wwwBase: "https://nseindia.com", maxPdfChecks: 10 });
  const outConcurrent = await h5.get(day, day);
  check("pdf confirmation: all 3 filings got checked", outConcurrent.items.every((it) => it.pdfChecked), JSON.stringify(outConcurrent.items.map((it) => it.pdfChecked)));
  check("pdf confirmation: fetched concurrently, not one at a time", maxInFlight > 1, `maxInFlight=${maxInFlight}`);

  console.log(fails === 0 ? "\nall passed" : `\n${fails} FAILED`);
  process.exit(fails === 0 ? 0 : 1);
})();
