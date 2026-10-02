// Backend tests for the mutual-fund screener. Starts the mfapi.in mock itself.
const fs = require("fs"), path = require("path"), os = require("os"), { spawn } = require("child_process");
const express = require("express");
const { createMf } = require("../mf");
const M = require("../mf-metrics");
let fails = 0;
const check = (n, ok, x = "") => { if (!ok) fails++; console.log((ok ? "PASS " : "FAIL ") + n + (x ? "  -> " + x : "")); };
const j = async (url, opts) => (await fetch(url, opts)).json();
const tmp = path.join(os.tmpdir(), "mf-test-" + Date.now() + ".json");
const mocks = [];
function startMock(port, extra = {}) {
  const p = spawn(process.execPath, [path.join(__dirname, "mock-mfapi.js")], { env: { ...process.env, PORT: String(port), ...extra }, stdio: "ignore" });
  mocks.push(p);
  return new Promise(async (resolve) => { for (let i = 0; i < 50; i++) { try { await fetch(`http://127.0.0.1:${port}/_log`); return resolve(); } catch { await new Promise((r) => setTimeout(r, 100)); } } resolve(); });
}
process.on("exit", () => mocks.forEach((p) => p.kill()));
(async () => {
  await startMock(4100);
  const mf = createMf({ baseUrl: "http://127.0.0.1:4100", gapMs: 0, cacheFile: tmp, log: () => {} });
  const app = express(); app.use("/api/mf", mf.router);
  const srv = app.listen(0, "127.0.0.1"); await new Promise((r) => srv.once("listening", r)); const base = `http://127.0.0.1:${srv.address().port}/api/mf`;
  const before = (await j("http://127.0.0.1:4100/_log")).hits;

  check("before any build: category is empty", (await j(base + "/universe?cat=large")).state === "empty");
  check("bad category rejected", (await fetch(base + "/universe?cat=zzz")).status === 400);
  const t0 = Date.now();
  for (const c of ["large", "mid", "small"]) await mf.build(c);
  console.log(`built 3 categories in ${((Date.now() - t0) / 1000).toFixed(1)}s using ${(await j("http://127.0.0.1:4100/_log")).hits - before} requests`);

  for (const cat of ["large", "mid", "small"]) {
    const u = await j(`${base}/universe?cat=${cat}`);
    const f = u.funds;
    check(`[${cat}] ready with a ranked list`, u.state === "ready" && f.length >= 14, f.length + " funds");
    check(`[${cat}] only Direct Plan - Growth schemes chosen (no Regular / IDCW / Large&Mid / Index decoys)`, f.every((x) => /Direct Plan - Growth/.test(x.name) && !/Regular|IDCW|Large & Mid|Index/.test(x.name)), f.filter((x) => !/Direct Plan - Growth/.test(x.name)).map((x) => x.name).join(","));
    check(`[${cat}] missing funds reported as unmatched (2 expected)`, u.unmatched.length === 2, u.unmatched.join(" | "));
    check(`[${cat}] renamed funds found through their alternate phrase`, u.funds.length + u.unmatched.length + u.excluded.length === 20, `${u.funds.length}+${u.unmatched.length}+${u.excluded.length}`);
    check(`[${cat}] short-history fund excluded with a reason`, u.excluded.length === 1 && /3 years/.test(u.excluded[0].reason), JSON.stringify(u.excluded));
    check(`[${cat}] sorted by score desc, ranks 1..n`, f.every((x, i) => x.rank === i + 1 && (i === 0 || f[i - 1].score >= x.score)));
    check(`[${cat}] scores in 0..100 and ratings follow thresholds`, f.every((x) => x.score >= 0 && x.score <= 100 && x.rating === M.rate(x.score)));
    const dist = f.reduce((a, x) => ((a[x.rating] = (a[x.rating] || 0) + 1), a), {});
    check(`[${cat}] ratings are spread, not all one label`, Object.keys(dist).length >= 2, JSON.stringify(dist));
    check(`[${cat}] every fund has all headline metrics`, f.every((x) => ["cagr3", "cagr5", "sip", "sharpe", "maxdd", "consistency", "alpha"].every((k) => x.metrics[k] != null)));
    check(`[${cat}] max drawdown is negative, consistency 0..100`, f.every((x) => x.metrics.maxdd < 0 && x.metrics.consistency >= 0 && x.metrics.consistency <= 100));
    check(`[${cat}] alpha is relative to peers: mean alpha ~ 0`, Math.abs(f.reduce((a, x) => a + x.metrics.alpha, 0) / f.length) < 0.6, (f.reduce((a, x) => a + x.metrics.alpha, 0) / f.length).toFixed(3));
    check(`[${cat}] verdict text present`, f.every((x) => typeof x.verdict === "string" && x.verdict.length > 10));
  }

  // independent recomputation of one fund's CAGR straight from the mock's raw rows
  const top = (await j(`${base}/universe?cat=large`)).funds[0];
  const raw = await j(`http://127.0.0.1:4100/mf/${top.code}`);
  const rows = raw.data.map((r) => { const [d, m, y] = r.date.split("-"); return [Date.UTC(+y, +m - 1, +d), parseFloat(r.nav)]; }).sort((a, b) => a[0] - b[0]);
  const endT = rows.at(-1)[0], i3 = rows.findLastIndex((r) => r[0] <= endT - 3 * 365.25 * 864e5);
  const indep = (Math.pow(rows.at(-1)[1] / rows[i3][1], 365.25 * 864e5 / (endT - rows[i3][0])) - 1) * 100;
  check("top fund's 3Y CAGR matches an independent calculation from raw rows", Math.abs(indep - top.metrics.cagr3) < 0.05, `${indep.toFixed(2)} vs ${top.metrics.cagr3}`);
  check("top fund's NAV and date equal the latest raw row", Math.abs(top.nav - rows.at(-1)[1]) < 1e-3 && top.navDate === new Date(endT).toISOString().slice(0, 10), `${top.nav} ${top.navDate}`);

  // detail endpoint: in-universe fund has chart + calendar + breakdown
  const d = await j(`${base}/fund/${top.code}?cat=large`);
  check("detail: in-universe fund with chart, calendar and weighted breakdown", d.inUniverse && d.fund.chart.v.length > 100 && d.fund.calendar.length >= 4 && d.breakdown.length === 7 && d.breakdown.reduce((a, b) => a + b.weight, 0) === 100);
  check("detail: peer line aligns with the grid", d.peer.grid.length === d.peer.v.length && d.fund.chart.i0 + d.fund.chart.v.length === d.peer.grid.length);

  // on-demand fund that is not in the screened universe (a Regular plan variant), scored against peers
  const reg = (await j(`${base}/search?q=${encodeURIComponent("Nippon India Small Cap")}`)).results;
  check("search returns plans ranked Direct Growth first", reg[0].plan === "Direct Growth" && reg.some((r) => r.plan === "Regular Growth"), reg.map((r) => r.plan).join(","));
  const regCode = reg.find((r) => r.plan === "Regular Growth").code;
  const od = await j(`${base}/fund/${regCode}?cat=small`);
  check("on-demand fund scored vs the category peers", od.inUniverse === false && od.cat === "small" && od.fund.score != null && od.fund.rating, `score ${od.fund.score} ${od.fund.rating}`);
  check("search validates input length", (await fetch(base + "/search?q=ab")).status === 400);
  check("fund code validated", (await fetch(base + "/fund/abc")).status === 400);

  // refresh throttling
  const rf = await j(base + "/refresh?cat=large", { method: "POST" });
  check("manual refresh throttled right after a build", rf.skipped.includes("large") && rf.started.length === 0, JSON.stringify(rf));

  // persistence: a new instance loads the cache on start() without touching the network
  const hits1 = (await j("http://127.0.0.1:4100/_log")).hits;
  const mf2 = createMf({ baseUrl: "http://127.0.0.1:4100", gapMs: 0, cacheFile: tmp, log: () => {} });
  const app2 = express(); app2.use("/api/mf", mf2.router); const s2 = app2.listen(0, "127.0.0.1"); await new Promise((r) => s2.once("listening", r));
  mf2.start();
  const u2 = await j(`http://127.0.0.1:${s2.address().port}/api/mf/universe?cat=mid`);
  check("fresh cache is loaded by start() and no rebuild is triggered", u2.state === "ready" && u2.funds.length > 10 && (await j("http://127.0.0.1:4100/_log")).hits === hits1, `${u2.state}, ${u2.funds.length} funds, requests since: ${(await j("http://127.0.0.1:4100/_log")).hits - hits1}`);
  check("cache keeps resolved scheme codes", Object.keys(JSON.parse(fs.readFileSync(tmp, "utf8")).codes).length >= 50);
  s2.close();

  // network failure: an unreachable API gives a clear error state, and keeps nothing half-built
  const mf3 = createMf({ baseUrl: "http://127.0.0.1:1", gapMs: 0, cacheFile: tmp + ".none", log: () => {} });
  await mf3.build("large");
  check("unreachable mfapi -> clear error state, no partial data", mf3.status.large.state === "error" && /reach mfapi/.test(mf3.status.large.error) && !mf3.state.categories.large, mf3.status.large.error);

  srv.close();
  await resilience();
  console.log(fails ? `\n${fails} FAILED` : "\nall passed");
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

async function resilience() {
  // 1) rate-limit recovery: a mock that answers 429 + Retry-After on every 6th request
  await startMock(4101, { FLAKY: "1" });
  const t0 = Date.now();
  const mf = createMf({ baseUrl: "http://127.0.0.1:4101", gapMs: 0, cacheFile: path.join(os.tmpdir(), "mf-flaky-" + Date.now()), log: () => {} });
  await mf.build("small");
  const log = await j("http://127.0.0.1:4101/_log");
  const rateLimited = Math.floor(log.hits / 6);
  check("build completes despite 429 rate-limit responses", mf.status.small.state === "idle" && mf.state.categories.small?.funds.length >= 14, `${mf.state.categories.small?.funds.length} funds, ~${rateLimited} throttled responses retried, ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  // 2) priority: a user's fund click must not wait behind a long background build
  const cache = path.join(os.tmpdir(), "mf-prio-" + Date.now());
  const warm = createMf({ baseUrl: "http://127.0.0.1:4100", gapMs: 0, cacheFile: cache, log: () => {} });
  await warm.build("mid");                                   // gives the peer data that on-demand scoring needs
  const mf2 = createMf({ baseUrl: "http://127.0.0.1:4100", gapMs: 150, cacheFile: cache, log: () => {} });
  mf2.state.categories = warm.state.categories; mf2.state.codes = warm.state.codes;
  const app = express(); app.use("/api/mf", mf2.router); const srv = app.listen(0, "127.0.0.1"); await new Promise((r) => srv.once("listening", r));
  const base = `http://127.0.0.1:${srv.address().port}/api/mf`;
  const regular = (await j("http://127.0.0.1:4100/mf/search?q=Axis%20Midcap")).find((r) => /Regular/.test(r.schemeName)).schemeCode;
  const s = Date.now();
  const buildP = mf2.build("mid").then(() => Date.now() - s);          // ~40 spaced requests: several seconds
  await new Promise((r) => setTimeout(r, 400));
  const t1 = Date.now();
  const fund = await j(`${base}/fund/${regular}?cat=mid`);
  const fundMs = Date.now() - t1;
  const buildMs = await buildP;
  check("fund details answered while a background build runs", fund.fund && fund.fund.score != null, `${fundMs}ms`);
  check("the click jumped the queue (answered long before the build finished)", fundMs < buildMs / 2, `fund ${fundMs}ms vs build ${buildMs}ms`);
  srv.close();
}
