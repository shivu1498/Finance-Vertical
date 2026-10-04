// Parser + handler tests for the Finviz integration. The fixture is a hand-built
// reconstruction of Finviz's markup, not a capture of the live site.
const fs = require("fs");
const path = require("path");
const { createFinviz, parseQuote } = require("../finviz");

let failed = 0;
const check = (name, ok) => { if (!ok) failed++; console.log(`${ok ? "ok  " : "FAIL"} ${name}`); };
const html = fs.readFileSync(path.join(__dirname, "fixtures", "finviz-quote.html"), "utf8");

(async () => {
  const q = parseQuote(html);
  check("name from header", q.name === "Apple Inc.");
  check("snapshot pairs", q.snapshot.length === 6 && q.snapshot[1].label === "P/E" && q.snapshot[1].value === "34.12");
  check("label cell isn't mistaken for a value", q.snapshot[0].label === "Index" && q.snapshot[0].value === "NDX, S&P 500");
  check("price + change", q.price === "229.87" && q.change === "-1.20%");
  check("sector / industry / country / exchange", q.sector === "Technology" && q.industry === "Consumer Electronics" && q.country === "USA" && q.exchange === "NASDAQ");
  check("description", q.description.startsWith("Apple Inc. designs"));
  check("news: 2 items, link + source", q.news.length === 2 && q.news[0].url === "https://example.com/a" && q.news[0].source === "Reuters");
  check("news: time-only rows inherit the day", q.news[1].date === "Oct-04-26 05:30AM");
  check("ratings rows", q.ratings && q.ratings.rows.length === 2 && q.ratings.rows[0][2] === "Morgan Stanley");
  check("insider rows + headers", q.insiders && q.insiders.headers[0] === "Insider Trading" && q.insiders.rows[0][3] === "Sale");
  check("empty page is safe", parseQuote("<html></html>").snapshot.length === 0);

  const calls = [];
  const realFetch = global.fetch;
  let status = 200;
  global.fetch = async (url) => { calls.push(url); return { ok: status === 200, status, text: async () => html }; };
  const run = async (h, t) => { const o = {}; await h({ params: { ticker: t } }, { status(c) { o.code = c; return this; }, set() {}, json(b) { o.body = b; return this; } }); return o; };
  const h = createFinviz({ minGapMs: 1 });
  let r = await run(h, "aapl");
  check("handler ok", !r.code && r.body.name === "Apple Inc." && r.body.url.endsWith("quote.ashx?t=AAPL"));
  await run(h, "AAPL");
  check("cached second call", calls.length === 1);
  r = await run(h, "BRK.B");
  check("BRK.B is requested as BRK-B", calls[1].includes("t=BRK-B"));
  r = await run(h, "bad ticker!");
  check("invalid ticker 400", r.code === 400);
  status = 429; r = await run(createFinviz({ minGapMs: 1 }), "MSFT");
  check("429 -> rate_limited", r.code === 429 && r.body.error === "rate_limited");
  status = 403; r = await run(createFinviz({ minGapMs: 1 }), "MSFT");
  check("403 -> blocked", r.code === 502 && r.body.error === "blocked");
  status = 404; r = await run(createFinviz({ minGapMs: 1 }), "ZZZZ");
  check("404 -> no_such_ticker", r.code === 404 && r.body.error === "no_such_ticker");
  global.fetch = realFetch;
  console.log(failed ? `\n${failed} failed` : "\nall passed");
  process.exit(failed ? 1 : 0);
})();
