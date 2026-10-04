// Unit tests for tijori.js. No network and no express needed: fetch is mocked.
const { createResolver, normalizeTicker, slugCandidates, pageMatches, parseKnowledgeBase } = require("../tijori");
const { createDirectory } = require("../companies");
const { build, parseCsv } = require("../scripts/import-companies");

let fails = 0;
const check = (n, ok, x = "") => {
  if (!ok) fails++;
  console.log((ok ? "PASS " : "FAIL ") + n + (x ? "  -> " + x : ""));
};
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ---- pure helpers ----
check("normalizeTicker strips suffix/prefix and case", normalizeTicker(" nse:grasim.ns ") === "GRASIM");
check("normalizeTicker keeps & and -", normalizeTicker("m&m") === "M&M" && normalizeTicker("bajaj-auto") === "BAJAJ-AUTO");
check("normalizeTicker rejects junk", normalizeTicker("../etc") === null && normalizeTicker("") === null && normalizeTicker("A".repeat(30)) === null);

check("slug: Grasim", slugCandidates("Grasim Industries Ltd")[0] === "grasim-industries-limited");
check("slug: Ltd. with dot", slugCandidates("Reliance Industries Ltd.")[0] === "reliance-industries-limited");
check("slug: & is dropped first (Tijori style)", slugCandidates("Mahindra & Mahindra Limited")[0] === "mahindra-mahindra-limited");
check("slug: & as 'and' is the second guess", slugCandidates("Larsen & Toubro Limited")[1] === "larsen-and-toubro-limited");
check("slug: adds -limited when missing", slugCandidates("Bajaj Auto").includes("bajaj-auto-limited"));
check("slug: empty name -> none", eq(slugCandidates(""), []));

const page = (body) => `<html><head><title>x</title></head><body>${body}</body></html>`;
check("pageMatches: ticker + name", pageMatches(page("<h1>Grasim Industries Ltd.</h1><span>GRASIM</span>"), "GRASIM", "Grasim Industries Limited"));
check("pageMatches: ticker as part of a longer word does not count", !pageMatches(page("Grasim Industries GRASIMX"), "GRASIM", "Grasim Industries Limited"));
check("pageMatches: &amp; ticker (M&M)", pageMatches(page("Mahindra &amp; Mahindra <b>M&amp;M</b>"), "M&M", "Mahindra & Mahindra Limited"));
check("pageMatches: home page without the company fails", !pageMatches(page("Tijori dashboard TCS ITC"), "GRASIM", "Grasim Industries Limited"));

// ---- resolver with a mock fetch ----
function mockFetch(routes) {
  const calls = [];
  const fn = async (url) => {
    calls.push(url);
    for (const [prefix, handler] of routes) {
      if (url.startsWith(prefix)) return handler(url);
    }
    return { ok: false, status: 404, url, text: async () => "", json: async () => ({}) };
  };
  fn.calls = calls;
  return fn;
}
const yahoo = (longName) => ({ ok: true, status: 200, json: async () => ({ chart: { result: [{ meta: { longName } }] } }) });
const htmlRes = (url, body, finalUrl) => ({ ok: true, status: 200, url: finalUrl || url, text: async () => body });

(async () => {
  // verified
  let f = mockFetch([
    ["https://y/v8/finance/chart/GRASIM.NS", () => yahoo("Grasim Industries Limited")],
    ["https://t/company/grasim-industries-limited/", (u) => htmlRes(u, page("<h1>Grasim Industries Ltd.</h1> GRASIM"))],
  ]);
  let r = await createResolver({ fetchImpl: f, yahooBase: "https://y", tijoriBase: "https://t" }).resolve("grasim");
  check("verified: status + url", r.tijori.status === "verified" && r.tijori.url === "https://t/company/grasim-industries-limited/#knowledgebase", r.tijori.url);
  check("verified: name from yahoo", r.name === "Grasim Industries Limited" && r.nameSource === "yahoo");
  check("verified: screener link built from ticker", r.screenerUrl === "https://www.screener.in/company/GRASIM/consolidated/");

  // Tijori serves its home page for unknown slugs (redirect to /) -> miss, then second guess matches
  f = mockFetch([
    ["https://y/v8/finance/chart/M%26M.NS", () => yahoo("Mahindra & Mahindra Limited")],
    ["https://t/company/mahindra-mahindra-limited/", (u) => htmlRes(u, page("home"), "https://t/")],
    ["https://t/company/mahindra-and-mahindra-limited/", (u) => htmlRes(u, page("Mahindra &amp; Mahindra M&amp;M"))],
  ]);
  r = await createResolver({ fetchImpl: f, yahooBase: "https://y", tijoriBase: "https://t" }).resolve("M&M");
  check("redirect-to-home is a miss; next candidate can still verify", r.tijori.status === "verified" && r.tijori.slug === "mahindra-and-mahindra-limited", r.tijori.slug);

  // same-URL soft 404 (home page content, no company) -> not_found
  f = mockFetch([
    ["https://y/v8/finance/chart/ZZZ.NS", () => yahoo("Zed Zed Limited")],
    ["https://t/company/", (u) => htmlRes(u, page("Tijori dashboard TCS ITC"))],
  ]);
  r = await createResolver({ fetchImpl: f, yahooBase: "https://y", tijoriBase: "https://t" }).resolve("ZZZ");
  check("soft 404 -> not_found, no link offered", r.tijori.status === "not_found" && !r.tijori.url);

  // Tijori blocks us -> unverified best guess, not a false 'verified'
  f = mockFetch([
    ["https://y/v8/finance/chart/GRASIM.NS", () => yahoo("Grasim Industries Limited")],
    ["https://t/company/", () => ({ ok: false, status: 403, text: async () => "" })],
  ]);
  r = await createResolver({ fetchImpl: f, yahooBase: "https://y", tijoriBase: "https://t" }).resolve("GRASIM");
  check("403 from Tijori -> unverified guess", r.tijori.status === "unverified" && /grasim-industries-limited/.test(r.tijori.url));

  // unknown to Yahoo -> no_name
  f = mockFetch([]);
  r = await createResolver({ fetchImpl: f, yahooBase: "https://y", tijoriBase: "https://t" }).resolve("NOPE");
  check("unknown ticker -> no_name", r.tijori.status === "no_name" && r.name === null);

  // Screener preferred over Yahoo when configured; failing Screener falls back to Yahoo
  f = mockFetch([["https://t/company/grasim-industries-limited/", (u) => htmlRes(u, page("Grasim Industries GRASIM"))]]);
  r = await createResolver({
    fetchImpl: f, yahooBase: "https://y", tijoriBase: "https://t",
    screenerLookup: async () => ({ companyName: "Grasim Industries Ltd", url: "https://www.screener.in/company/GRASIM/consolidated/" }),
  }).resolve("GRASIM");
  check("screener name preferred (no yahoo call)", r.nameSource === "screener" && !f.calls.some((u) => u.startsWith("https://y")) && r.tijori.status === "verified");
  f = mockFetch([
    ["https://y/v8/finance/chart/GRASIM.NS", () => yahoo("Grasim Industries Limited")],
    ["https://t/company/grasim-industries-limited/", (u) => htmlRes(u, page("Grasim Industries GRASIM"))],
  ]);
  r = await createResolver({
    fetchImpl: f, yahooBase: "https://y", tijoriBase: "https://t",
    screenerLookup: async () => { throw new Error("Screener session expired or invalid"); },
  }).resolve("GRASIM");
  check("screener failure falls back to yahoo", r.nameSource === "yahoo" && r.tijori.status === "verified");

  // cache + validation
  f = mockFetch([
    ["https://y/v8/finance/chart/GRASIM.NS", () => yahoo("Grasim Industries Limited")],
    ["https://t/company/grasim-industries-limited/", (u) => htmlRes(u, page("Grasim Industries GRASIM"))],
  ]);
  const res = createResolver({ fetchImpl: f, yahooBase: "https://y", tijoriBase: "https://t" });
  await res.resolve("GRASIM");
  const n = f.calls.length;
  await res.resolve("grasim.ns");
  check("verified results are cached", f.calls.length === n);
  let status = 0;
  try { await res.resolve("../x"); } catch (e) { status = e.status; }
  check("invalid ticker -> 400", status === 400);

  // ---- company list: importer + directory + resolver ----
  const csv = [
    "Name,BSE Code,NSE Code,ISIN Code,Industry Group,Industry",
    "Grasim Inds,500300,GRASIM,INE047A01021,Cement & Cement Products,Cement & Cement Products",
    '"Tata Motors, CV",544569,TMCV,INE1TAE01010,"Agricultural, Commercial & Construction Vehicles",Commercial Vehicles',
    "7Seas Enter.,540874,,INE454F01010,Entertainment,Digital Entertainment",
    "Nothing Co,,,INE000000001,Finance,Other",
    "Blank Ind,111111,BLANK,INE000000002,,",
    "Dupe,500300,GRASIM,INE047A01021,Cement & Cement Products,Cement & Cement Products",
  ].join("\r\n");
  check("csv parser keeps quoted commas", parseCsv(csv)[2][0] === "Tata Motors, CV" && parseCsv(csv)[2][4].includes("Commercial Vehicles") === false && parseCsv(csv)[2][4].startsWith("Agricultural, Commercial"));
  const built = build(csv);
  check("importer drops rows without a ticker and duplicate ISINs", built.data.rows.length === 4 && built.dropped === 1 && built.dupes === 1, `${built.data.rows.length} rows, dropped ${built.dropped}, dupes ${built.dupes}`);
  const dir = createDirectory(built.data);
  const g = dir.find("grasim");
  check("directory: NSE lookup is case-insensitive, carries industry", g && g.name === "Grasim Inds" && g.group === "Cement & Cement Products" && g.industry === "Cement & Cement Products");
  check("directory: BSE code lookup (BSE-only company)", dir.find("540874") && dir.find("540874").nse === null && dir.find("540874").industry === "Digital Entertainment");
  check("directory: blank industry -> Unclassified", dir.find("BLANK").group === "Unclassified" && dir.find("BLANK").industry === "Unclassified");
  check("directory: unknown -> null", dir.find("NOPE") === null);

  // Resolver with directory: legal name (Yahoo) drives the slug; list supplies the industry
  f = mockFetch([
    ["https://y/v8/finance/chart/GRASIM.NS", () => yahoo("Grasim Industries Limited")],
    ["https://t/company/grasim-industries-limited/", (u) => htmlRes(u, page("Grasim Industries GRASIM"))],
  ]);
  r = await createResolver({ fetchImpl: f, yahooBase: "https://y", tijoriBase: "https://t", directory: dir }).resolve("GRASIM");
  check("resolver+list: slug from legal name, list name + industry returned", r.tijori.status === "verified" && r.name === "Grasim Inds" && r.legalName === "Grasim Industries Limited" && r.industryGroup === "Cement & Cement Products");

  // BSE-only: identified and verified by BSE code
  f = mockFetch([
    ["https://y/v8/finance/chart/540874.BO", () => yahoo("7Seas Entertainment Limited")],
    ["https://t/company/7seas-entertainment-limited/", (u) => htmlRes(u, page("7Seas Entertainment BSE: 540874"))],
  ]);
  r = await createResolver({ fetchImpl: f, yahooBase: "https://y", tijoriBase: "https://t", directory: dir }).resolve("540874");
  check("BSE-only company verifies on its BSE code", r.tijori.status === "verified" && r.industry === "Digital Entertainment", r.tijori.status);

  // Names all fail -> fall back to the list's short name instead of giving up
  f = mockFetch([["https://t/company/grasim-inds-limited/", (u) => htmlRes(u, page("Grasim GRASIM"))]]);
  r = await createResolver({ fetchImpl: f, yahooBase: "https://y", tijoriBase: "https://t", directory: dir }).resolve("GRASIM");
  check("falls back to the list name when Screener/Yahoo have none", r.nameSource === "list" && r.tijori.status === "verified" && r.industry === "Cement & Cement Products");

  // ---- Knowledge Base parsing (markup shaped like Tijori's company page) ----
  const KB = page(`
    <nav><a href="#kb">Discussions &amp; Analysis</a> <p>Promo</p> <a href="https://promo.example/x">Promo link</a> <a href="https://www.tijorifinance.com/">Home</a> <a href="https://twitter.com/tijori">Tijori on X</a></nav>
    <h1>Grasim Industries Ltd.</h1> NSE: GRASIM
    <section id="knowledgebase">
      <h2>Knowledge Base</h2>
      <h3>Discussions &amp; Analysis</h3>
      <div class="kb-group">
        <div class="kb-title">Grasim Industries Ltd.</div>
        <div class="kb-link"><a href="https://x.com/zerodhamarkets/status/1" target="_blank">Grasim &lt;&gt; Spring Energy Analysis</a> - Zerodha Markets</div>
        <div class="kb-link"><a href="https://www.youtube.com/watch?v=e6FqC4pWy8I"><img src="/static/yt.svg"></a><a href="https://www.youtube.com/watch?v=e6FqC4pWy8I">Nikhil Kamath x Kumar Birla | People by WTF</a> <span>- Nikhil Kamath</span></div>
        <div class="kb-link"><a href="http://forum.valuepickr.com/t/grasim/6649">View the discussion on ValuePickr</a></div>
      </div>
      <div class="kb-group">
        <p>Cement</p>
        <ul>
          <li><a href='https://soic.in/blog/cement'>Is Cement the Hidden Hero of India&#39;s Growth Story?</a></li>
          <li>- SOIC</li>
          <li><a href="https://www.youtube.com/watch?v=Slt7IxMSt5E">The Basics: Cement Sector</a> &ndash; Omkara Capital</li>
          <li><a href="/company/acc-limited/">ACC (internal link, ignored)</a></li>
          <li><a href="javascript:void(0)">Show more</a></li>
        </ul>
      </div>
      <div class="kb-group"><h4>Empty group</h4></div>
      <button>Submit your Links</button>
      <div class="modal">Submit a link <a href="https://evil.example/after-the-section">after</a></div>
    </section>
    <footer><a href="https://www.youtube.com/c/tijori">Tijori YouTube</a></footer>`);
  const kb = parseKnowledgeBase(KB, { tijoriBase: "https://www.tijorifinance.com" });
  check("kb: groups in page order, empty group dropped", eq(kb.map((g) => g.title), ["Grasim Industries Ltd.", "Cement"]), JSON.stringify(kb.map((g) => g.title)));
  check("kb: title, author and url of a plain row", eq(kb[0].links[0], { title: "Grasim <> Spring Energy Analysis", by: "Zerodha Markets", url: "https://x.com/zerodhamarkets/status/1" }), JSON.stringify(kb[0].links[0]));
  check("kb: icon + title anchors to one url count once, author in a span", kb[0].links.length === 3 && kb[0].links[1].title === "Nikhil Kamath x Kumar Birla | People by WTF" && kb[0].links[1].by === "Nikhil Kamath", JSON.stringify(kb[0].links[1]));
  check("kb: row without author", kb[0].links[2].by === "" && kb[0].links[2].url === "http://forum.valuepickr.com/t/grasim/6649");
  check("kb: author in its own element attaches to the previous link", kb[1].links[0].by === "SOIC" && kb[1].links[0].title === "Is Cement the Hidden Hero of India's Growth Story?", JSON.stringify(kb[1].links[0]));
  check("kb: en dash author", kb[1].links[1].by === "Omkara Capital");
  check("kb: internal, javascript and post-section links are skipped", kb[1].links.length === 2 && !JSON.stringify(kb).includes("evil.example") && !JSON.stringify(kb).includes("tijori"), JSON.stringify(kb[1].links));
  check("kb: page without a knowledge base -> []", eq(parseKnowledgeBase(page("Grasim GRASIM <a href='https://x.com/a'>x</a>")), []));

  f = mockFetch([
    ["https://y/v8/finance/chart/GRASIM.NS", () => yahoo("Grasim Industries Limited")],
    ["https://t/company/grasim-industries-limited/", (u) => htmlRes(u, KB)],
  ]);
  r = await createResolver({ fetchImpl: f, yahooBase: "https://y", tijoriBase: "https://t", now: () => 0 }).resolve("GRASIM");
  check("resolver: verified page carries its knowledge base", r.knowledge && r.knowledge.count === 5 && r.knowledge.groups[1].title === "Cement" && r.knowledge.fetchedAt === "1970-01-01T00:00:00.000Z", JSON.stringify(r.knowledge));
  f = mockFetch([
    ["https://y/v8/finance/chart/GRASIM.NS", () => yahoo("Grasim Industries Limited")],
    ["https://t/company/grasim-industries-limited/", (u) => htmlRes(u, page("Grasim GRASIM"))],
  ]);
  r = await createResolver({ fetchImpl: f, yahooBase: "https://y", tijoriBase: "https://t" }).resolve("GRASIM");
  check("resolver: verified page without a knowledge base -> knowledge null", r.tijori.status === "verified" && r.knowledge === null);

  console.log(fails ? `\n${fails} FAILED` : "\nall passed");
  process.exit(fails ? 1 : 0);
})();
