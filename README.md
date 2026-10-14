# StalkingStocks

A simple, live stock market dashboard: a global indices ticker, a
country filter spanning 14 major markets, a sector heatmap, an
advance/decline breadth strip, and a stock treemap.

**Theme:** a swatch button in the top bar opens a menu of four named
color themes, picked from a dropdown rather than a single toggle:

- **Light · Library** (default) — a warm-paper, bordered-card "research
  library" look (Fraunces for headings, a mono eyebrow label above
  section titles, a terracotta accent).
- **Dark · Global Trade Map** — a deep purple/blue gradient background
  with a twinkling constellation and a slowly spinning Earth, orange
  accent, Fredoka headings.
- **Matte Black** — a flat black backdrop with an orange accent/hover,
  restoring the site's original pre-cosmic look.
- **Trypan Blue** — a navy/indigo backdrop with a grey accent/hover and
  Playfair Display headings, restoring the site's very first theme.

The choice is saved per browser (`localStorage`, key
`stalkingstocks.theme`); `theme.js` drives the dropdown's open/close/
selection behavior and an inline head script applies the saved theme
before first paint (no flash on reload). The actual color tokens for
all four themes live in the `:root` / `:root[data-theme="dark"]` /
`:root[data-theme="matte"]` / `:root[data-theme="trypan"]` blocks at
the top of `style.css`.

Data comes from Yahoo Finance's free, unauthenticated chart endpoint
(`query1.finance.yahoo.com`). A small Node/Express server proxies the
requests (the browser can't call Yahoo directly due to CORS) and caches
each symbol for 15 seconds.

## Run it

**One-click (after the first `npm install`):**
- Windows: double-click `start.bat`
- Mac/Linux: double-click `start.sh` (or run `./start.sh` in a terminal)

It installs dependencies on first run, starts the server, and opens your
default browser to the dashboard automatically.

**Manual:**
```bash
npm install
npm start
```
Then open http://localhost:3000.

The server binds to `127.0.0.1` (localhost) only — it's reachable from
this machine alone, not from other devices on your network.

**Optional: launch on startup / from your desktop**
Right-click `start.bat` → *Create shortcut*, then drag that shortcut to
your Desktop (or to `shell:startup` via Windows Run, to launch it every
time you log in).

## What's covered

- **Ticker strip**: Nifty 50, Sensex, S&P 500, Dow Jones, Nasdaq, Crude Oil (WTI),
  Hang Seng, FTSE 100 — always visible regardless of selected country.
- **Country filter**: 14 markets — India, United States, United Kingdom,
  Germany, France, Japan, Hong Kong, China, Canada, Australia, Singapore,
  South Korea, Brazil, Switzerland. Picking one swaps the index, sector
  heatmap, breadth strip, and treemap below to that market's listings.
- **Sector heatmap**: the selected country's constituents grouped into
  sectors (`public/data.js`), average % change per sector. Click a tile
  to filter the treemap below.
- **Breadth panel**: advancing vs. declining count across the selected
  country's tracked names. For India, a dropdown selects any of ~21 NSE
  index universes (Nifty 50 through Nifty Total Market) and the panel
  compares advance/decline across six lookback windows at once (1D/1W/
  20D/50D/100D/200D, in trading sessions — see "India Market Breadth"
  below). Every other country keeps the single today's-A/D figure this
  always showed.
- **Stock treemap**: each tracked stock in the selected country, colored
  by day change intensity. Filterable by sector via the dropdown.

Refreshes every 30 seconds.

## Top ticker (asset classes)

The header ticker is filtered by four asset classes, each with a dropdown:

| Class | Dropdown options | Instruments |
|---|---|---|
| Equity | India, US, Asia, Europe | Nifty 50, Sensex, Bank Nifty, S&P 500, DJIA, Nasdaq, Russell 2000, VIX, Hang Seng, Nikkei, FTSE, DAX, CAC |
| Cash | Dollar, Euro | Dollar Index, USD/INR, USD/JPY, EUR/USD, EUR/INR, EUR/GBP |
| Commodity | Gold, Silver, Crude Oil | Gold, Silver, WTI, Brent (futures, USD) |
| Bond | Treasury yields, Bond ETFs | US 3M/5Y/10Y/30Y yields (change in basis points), TLT, AGG, LQD, HYG |

- Scrolls as a continuous marquee (never stops; pauses on hover to read a
  figure) — your asset-class choice is remembered in the browser.
- Only the visible instruments are fetched, every 30 seconds.
- Edit the list in `ASSET_CLASSES` and `TICKERS` in `public/data.js`.
- The symbols are Yahoo Finance tickers. They could not be tested live from the
  build sandbox, so an instrument that doesn't resolve shows "—". Indian
  government bond yields have no reliable free Yahoo symbol, so the bond class
  is US Treasuries and bond ETFs.
- Day changes are measured against the previous session's close. An earlier
  version used Yahoo's `chartPreviousClose`, which is the close from before the
  5-day window, so changes were roughly a week's move. `quotes.js` now parses
  this using the bar timestamps (tests in `test/quotes.test.js` and
  `test/server-quotes.test.js`). `YAHOO_BASE` overrides the Yahoo host for testing.

## Mutual Funds tab

Ranks Large, Mid and Small Cap equity funds against their peers, using NAV
history from [mfapi.in](https://www.mfapi.in/) (free, no API key).

- **Universe:** a curated list of about 20 funds per category in
  `mf-universe.js` (Direct Plan, Growth). Funds that can't be found are listed
  in the page footnote instead of being guessed.
- **Metrics** (computed in `mf-metrics.js`): 3Y/5Y/10Y CAGR, 5Y monthly-SIP
  XIRR, 3Y Sharpe ratio (risk-free rate 6.5%), 5Y max drawdown, consistency
  (share of rolling 1Y windows that beat the peer average) and alpha (3Y CAGR
  minus the peer average).
- **Score:** each metric becomes a percentile among the screened peers, then a
  weighted average (3Y 20, 5Y 20, SIP 10, Sharpe 15, drawdown 15, consistency
  10, alpha 10). 70+ is BUY, 50-70 HOLD, below 50 AVOID. These labels are a
  mechanical screen of past performance, relative to the screened list only.
  They are not advice.
- **UI:** ranked cards, filter/sort, a detail panel (score breakdown,
  interactive chart against the peer average, calendar-year returns), compare
  two funds, search any fund on mfapi.in, and a command line (`/top`, `/fund`,
  `/compare A | B`, `/refresh`, `/help`).
- **Polite by design:** one request at a time, 1.5s apart, retried on 429/5xx,
  clicks jump the queue, results cached in `data/mf-cache.json` and refreshed
  every 24h (manual refresh at most every 10 minutes).
- **Settings (env vars):** `MFAPI_BASE`, `MFAPI_GAP_MS`, `MF_CACHE`,
  `MF_DISABLE=1`.
- `npm test` runs the metrics tests and backend tests against a local mock of
  mfapi.in (`test/mock-mfapi.js`).

Limits to know about:
- The response shapes follow mfapi.in's documented `/mf/search` and
  `/mf/{code}` endpoints. They were verified against the mock only, because the
  build sandbox couldn't reach mfapi.in. If a field differs, the tab shows an
  error state rather than wrong numbers; tell me and I'll adjust.
- Not used: finvesto.in, Finnworlds, multibagg and AmitEMV/MutualFundsTracker
  (the last is just a front end for the author's private API). Portfolio
  overlap and fund holdings need a holdings source such as a Finnworlds API
  key, which isn't configured.

## Industries tab (NSE industry classification)

`public/industry-data.js` holds NSE Indices' *Industry Classification
Structure* (July 2023), extracted from the official PDF: 12 macro-economic
sectors > 22 sectors > 59 industries > 197 basic industries, with NSE's
definition for each basic industry. `public/industry.js` builds the tree.

- Explorer with a tile per macro-economic sector, search across names and
  definitions (matches highlighted), a "tracked stocks only" filter, and
  expand/collapse. Links like `#industries/IN050102002` open a node.
- The 48 Nifty 50 stocks are classified to a basic industry (`STOCK_BASIC`
  in `industry.js`), so every level shows the average live move of the stocks
  beneath it. That mapping is mine, based on the PDF's definitions, so
  check it against NSE before relying on it.
- Each Sector Knowledge page lists where its sector sits in the structure
  (`KNOWLEDGE_NSE`), and the NSE nodes link back to that research.
- **Group by** (Markets tab, India): the heatmap and the Stocks treemap can be
  grouped by the original labels or by NSE macro-economic sector, sector or
  industry.
- The PDF was parsed from word coordinates and checked: every code sits under
  its parent, names are unique per level, and every definition is present.

## Indices tab

Catalogue of 150 NSE indices from niftyindices.com across four families:
Broad Based (22), Sectoral (27), Strategy (50) and Thematic (51), in
`public/indices.js`.

- Search (multi-word), family filter, style tags (factor, equal weight,
  leveraged/inverse, ESG, corporate group...), sorting, and live-only mode.
- 23 indices have live prices via Yahoo Finance symbols (Nifty 50, Bank,
  IT, Auto, Pharma and so on). Those symbols could not be tested from the
  build sandbox, so one that does not resolve just shows "unavailable".
  The rest show "No free live feed".
- Sectoral and a few thematic indices link to the matching Sector
  Knowledge page. Every tile links to its official family page.
- The source printouts were truncated (their footers read "1/3", "2/3" with
  the last pages missing), so some indices may be absent. To add one, append
  its name to the right list in `INDEX_NAMES`; optionally add a Yahoo symbol
  to `INDEX_LIVE` or a sector id to `INDEX_RESEARCH`.

## Sector Knowledge tab

Curated research for 20 Indian sectors (`public/knowledge.js`): overview,
key drivers, risks, metrics to track and how the sector makes money,
shown as a thumbnail gallery with a focus page per sector.

- **Live:** each thumbnail shows the day's move, averaged over the sector's
  Nifty 50 stocks. Stock tiles on a sector page open Screener fundamentals.
- **What-if:** toggle Rates up / Crude up / Rupee weaker / Good monsoon /
  Global risk-off and the thumbnails re-rank by estimated impact. The
  sensitivities are hand-set rules of thumb for exploring, not forecasts.
- **Search, sort, favorites, notes:** search across sector text and stock
  names, four sort modes, a favorites filter, and per-sector notes. Favorites
  and notes are saved in your browser (localStorage) only.
- **Keys:** `/` search, `1`-`5` scenarios, left/right arrows to switch sector,
  `Esc` to go back. Links like `#knowledge/auto` open a sector directly.
- To edit or add a sector, change its entry in `public/knowledge.js`.
  This content is general industry knowledge, not investment advice.

## Indian stock fundamentals from Screener.in (optional)

Click any stock tile while **India** is selected to see Market Cap, P/E,
ROCE, etc. from Screener.in. Screener has no public API, so the server
reads the company page using **your own logged-in session cookie**.

1. Log in to screener.in in your browser.
2. DevTools (F12) -> Application -> Cookies -> `screener.in` -> copy the
   value of `sessionid`.
3. Copy `.env.example` to `.env` and paste it: `SCREENER_SESSIONID=...`
4. Restart the app.

Notes:
- Treat the cookie like a password. `.env` is git-ignored; never commit it.
- Screener's terms restrict automated access, so this is intended for
  light personal use. The server fetches one page at a time, at least
  1.5s apart, and caches each company for 6 hours.
- It parses Screener's HTML, so it can break if their markup changes.
- Without a cookie the feature stays off and the panel says so.
- Prices, heatmap and breadth for India still come from Yahoo.

## Company pages in the Universe tab (Screener-style)

**Universe -> India** lists the full NSE/BSE company list (`public/companies.json`)
by industry group, with a search bar (name or ticker). Click any company to
open a page laid out like Screener.in: price, key ratios, about, a TradingView
chart, pros and cons, peer comparison, quarterly results, profit and loss,
balance sheet, cash flows, ratios and shareholding. Deep links look like
`#universe/IN/ABBOTINDIA`.

The figures come from Screener.in through `GET /api/screener/company/:symbol`
(`screener.js` + `screener-page.js`). It uses the same `SCREENER_SESSIONID`
setup as above, and the same rules: one request at a time, 1.5s apart, cached
for 6 hours. Only companies in `companies.json` are served, so the endpoint
can't be used to relay arbitrary Screener pages. Without the cookie the page
still opens with the company's industry, codes, chart and a link to Screener.

On Vercel, add `SCREENER_SESSIONID` under Project Settings -> Environment
Variables and redeploy. Anyone who can open your site can then trigger these
requests with your session, so keep that in mind before sharing the URL.

## US companies from Finviz

In **Universe**, the search bar also finds any SEC-listed US company, and the
United States basket links to a company page for each ticker (`#universe/US/AAPL`).
The page shows the price, the Finviz snapshot (about 70 metrics), about, analyst
ratings, news and insider trades, a TradingView chart, and the company's 10-K /
20-F filings from SEC EDGAR.

Finviz has no free API, so `finviz.js` reads the public quote page for one
ticker at a time (no cookie needed): one request at a time, 1.5s apart,
cached for 10 minutes. Finviz's terms limit automated access, so keep it to
personal use. If Finviz answers 403 or 429 (it blocks some hosting IPs), the page
says so and still shows the chart, the SEC filings and a link to Finviz. The
parser follows Finviz's markup and may need updating if it changes. Tests use a
hand-built fixture (`test/fixtures/finviz-quote.html`), not a capture.

## Adding a new section (tab)

The page is organised as tabs under one roof. **Markets** holds the
country picker, index, breadth and sector heatmap; **Stocks** holds the
treemap and fundamentals panel; **Sector Knowledge** holds the research gallery. To attach another section:

1. In `public/index.html`, add a link inside `#tabs`:
   `<a class="tab" data-tab="news" href="#news">News</a>`
2. Add a panel inside `<main>`:
   `<div class="tab-panel" data-panel="news" hidden> ... </div>`
3. Put its code in `public/app.js` (or a new script). Switching,
   highlighting and `#news` deep links work automatically; call
   `showTab("news")` to jump there from code.

## Notes / extending it

- Every country's data comes through the *same* backend endpoint
  (`/api/quotes` → Yahoo's free chart API) — there's no per-exchange
  integration to maintain. Yahoo covers most major exchanges via ticker
  suffixes; see the comment at the top of `public/data.js` for the
  suffix reference (`.L` London, `.DE` Frankfurt, `.HK` Hong Kong, etc.).
- The Markets tab's country index shows 1D/1W/1M/3M/6M/1Y change all at
  once (`1D +0.60% | 1W -1.85% | 1M -2.30% | …`), each colored by its own
  sign — not a toggle, nothing to click. It's a second, separate endpoint,
  `/api/quotes/periods?symbol=` (`quotes.js`'s `parsePeriods`) — a 2-year
  daily-bar fetch for just that one index symbol, so the cheap 5-day
  `/api/quotes` fetch used everywhere else (ticker tape, sector heatmap,
  breadth) doesn't pay for history almost nothing there needs. 1D reuses
  the existing session-aware previous-close logic; the longer windows just
  find the closest trading day on or before "N calendar days ago". Fetched
  once per index symbol and cached client-side for 5 minutes.
- The Markets tab's Sector Heatmap (India, "classic" grouping) prefers
  NSE's own live "SECTORAL INDICES" — a real % change and a real P/E per
  sector — over the constituent-average fallback used everywhere else.
  Served from `/api/indices/in/sectors` (`nse-sector-indices.js`, same
  cookie-priming pattern as the Announcements feed), fuzzy-matched against
  a fixed set of sector labels since NSE's exact index-name spelling isn't
  something this could be verified against live. Falls back to the
  stock-average heatmap (no P/E, no tile for sectors with no Nifty 50
  constituent) if the live fetch fails, hasn't resolved yet, or the
  country/grouping isn't India-classic.
- To add another country: append an entry to `COUNTRIES` in
  `public/data.js` with its index symbol and a stock list — no backend
  changes needed, as long as Yahoo lists that exchange.
- Most of the smaller/regional exchanges (e.g. Armenia, Banja Luka,
  Malta) don't publish free real-time data anywhere, from any provider —
  this covers the major, liquid markets where free data actually exists.
- Swap in a different free provider (e.g. [Twelve Data](https://twelvedata.com/),
  [Finnhub](https://finnhub.io/), [Alpha Vantage](https://www.alphavantage.co/))
  by editing `fetchQuote` in `server.js` — useful if Yahoo's endpoint
  rate-limits or changes shape.
- The constituent lists and sector mappings in `public/data.js` are
  maintained by hand — update them if index constituents change.
- This is informational only — not investment advice.

## Company list and industry classification

The Company view (Sector Knowledge tab) searches `public/companies.json`, built from a
BSE/NSE company-list CSV (Name, BSE Code, NSE Code, ISIN Code, Industry Group, Industry):

```
node scripts/import-companies.js path/to/bse-nse-company-list.csv
```

Rows with neither an NSE nor a BSE code are skipped. Re-run the script with a newer CSV to refresh
the list (new listings, renamed tickers); commit the regenerated `public/companies.json`.

### Tijori Knowledge Base links

`/api/tijori/resolve` now also returns `knowledge` (groups of title / author / outbound URL) read from the verified Tijori company page, cached 24h per ticker. The Company view shows it inline for any company; Grasim's curated list in `public/company-knowledge.js` still takes precedence. If Tijori blocks our server the card falls back to the "Knowledge Base on Tijori" link.

## US company list (Universe → United States)

`public/us-stocks.json` is built from a Dhan "All US Stocks" CSV:

    node scripts/import-us-stocks.js path/to/Dhan_-_US_All_Us_Stocks.csv

The CSV has no ticker column, so tickers come from the table at the top of the script (names it doesn't know show without a page link). Market cap is treated as $ millions and displayed as $ Tn / Bn / Mn.

## Australian company list (Universe → Australia)

`public/au-stocks.json` is built from an ASX-listed-companies export (Code,
Company, Sector, Market Cap, Weight(%)):

    node scripts/import-au-stocks.js path/to/asx-listed-companies.csv

Every row already carries its own ASX code, so (unlike the US import) there's
no name-to-ticker table to maintain. The export's date is kept as `asOf` and
shown on the page, since market cap and weight are a snapshot, not live.

To add a plain NYSE ticker list (name + symbol only, e.g. NYSE's own
"ACT Symbol,Company Name" export) on top of the richer Dhan data:

    node scripts/import-nyse-listed.js path/to/nyse-listed.csv

Existing tickers (and their Dhan figures) are kept; new ones are added with
only a name/ticker/exchange — the UI fills their Price/Change live from
Yahoo Finance and shows "—" for the Dhan-only columns (Volume, Market cap,
P/E, returns, ROE, ROCE).

## Announcements (new tab)

Scans NSE's own live corporate-announcements feed
(`nseindia.com/api/corporate-announcements`), year-to-date (Jan 1 of the
current year through today), for filings that fall into any of five
tracked categories, cross-checks each hit's NSE-tagged industry
(`smIndustry`) against the industry we've already classified that company
under (the same NSE/BSE list Universe uses), and — best-effort, using
`pdf-text-lite.js` (no npm dependency, just Node's built-in `zlib`) —
fetches and reads the actual filing PDF to confirm the match appears in
the body, not just NSE's headline.

Started as a capex-only "Capex Watch" tab; generalized to scan for all of:

- **Capex / Expansion** — "capex", "capacity expansion", "unit expansion".
- **New Order / Contract Win** — new order, order/contract win, letter of
  award, work order, purchase order, "bags/secures/wins an order".
- **Product Launch** — product launch, new product, "launches a new
  product", "unveils".
- **M&A / Stake Acquisition** — acquisition, acquire(s)/acquiring, stake
  sale/purchase, merger, amalgamation, joint venture.
- **Management Change** — appointment, resignation, "ceases to be",
  redesignation, change in the board/directorate/KMP.

A filing can match more than one category (e.g. a capex update that also
mentions a new CFO appointment) and is tagged with all of them. The
keyword lists are in `CATEGORIES` in `nse-announcements.js` and are
deliberately loose — a false positive just means a card that isn't that
interesting on closer reading, a false negative means a filing gets missed
entirely, and the latter is the worse failure mode for a watch tool.

- `nse-announcements.js` — fetch + cookie priming + keyword prefilter
  (checked against **every** category in one pass) + industry
  cross-reference + PDF confirmation for **one date-range chunk**.
  `GET /api/filings/in/announcements?from=YYYY-MM-DD&to=YYYY-MM-DD`. NSE's
  API has no pagination, and asking it for a ~9-month range in one call
  returns a response too large to handle reliably (hit a 48MB
  response-size cap in testing) — so the server always clamps the range to
  `maxChunkDays` (a week by default), whatever `from`/`to` it's given. A
  chunk fully in the past is cached for 12h (it never changes); a chunk
  that includes today is cached for only 10 minutes. The server never
  filters by category itself — it always scans for all five and returns
  every flagged item tagged with the categories it matched, plus a
  `categories: [{id, label}]` list for the client to build filter chips
  from, so switching filters client-side never re-hits NSE. Within a chunk,
  PDF confirmation for the (capped) batch of flagged filings runs
  concurrently, not one fetch at a time — that used to be the main reason a
  chunk was slow, since every chunk could pay for up to `maxPdfChecks` PDF
  fetches back to back.
- `pdf-text-lite.js` — minimal Flate-stream text extractor. Handles the
  common case (a text-based, FlateDecode-compressed PDF); gives up quietly
  on scanned PDFs or unusual encodings rather than guessing.
- `public/announcements-ui.js` — the tab itself. Walks Jan 1 → today in
  `CHUNK_DAYS`-sized windows, `CONCURRENCY` of them in flight at once
  (currently 4 — enough to meaningfully cut wall-clock time on a year's
  worth of chunks without firing them all at once), accumulating
  checked/flagged counts and items (each carrying its matched categories)
  into a running display as each chunk comes back, so the scan shows live
  progress rather than appearing to hang. `CHUNK_DAYS` here must stay in
  sync with `maxChunkDays` on the server. Because chunks can finish out of
  request order, the progress line shows the furthest date reached so far
  rather than assuming a contiguous front. A row of filter chips ("All" +
  one per category, each showing a live count) lets the person narrow the
  list to one or more categories — purely a client-side re-slice of
  whatever's already been scanned. If a chunk fails partway through (NSE
  blocks/rate-limits), in-flight sibling chunks are still allowed to finish
  and merge their data in, but can't flip the status back away from
  "error" — only the results gathered so far are kept on screen
  alongside the error.

Above the filing list sits a "\<category\> by industry" grid — title and
accent color follow whichever filter chip is active (so selecting "Capex /
Expansion" shows capex grouped by industry; "All" shows every tracked
category together). Each card rolls up filing/company counts and status
dots (confirmed in the PDF body / flagged from NSE's summary only /
industry mismatch) for that industry, purely from data the scan already
has. Clicking a card opens a sector drill-down modal — one big headline
capex figure and a smaller demand figure, a mini stats row, and a
company-by-company table with the same status dots. NSE's feed never gives
a rupee capex or demand figure, so both headline numbers are typed in by
hand (click to edit) and persisted in this browser's `localStorage`
(`stalkingstocks.industryFigures.v1`, keyed by industry) rather than
fetched from anywhere — there's no server-side store or external API call
behind them yet.

A full year-to-date scan is dozens of NSE round-trips (about one per week
of the year so far, 4 running at a time), so it still takes noticeably
longer than scanning a single short window — that's expected, and the
progress bar is what tells the difference between "still working" and
"stuck."

NSE's feed is a rolling recent window at the API level (each chunk request
only reaches back as far as `from`/`to` ask), and NSE's anti-bot layer may
start blocking this from a server IP at any time — unverified against the
live site from this sandbox (no outbound access to nseindia.com here); if
it starts failing, the tab shows a clear error (plus whatever it had
already scanned) instead of breaking.

## The Memo (new tab)

Started as a small local editorial section (short dated notes on how to
read the rest of the site) and was then repurposed into a real data
dashboard, the first of several planned in the spirit of a site like
tipsheet.markets: a reading shown against its own history, not a tip.
Every number here is computed in this codebase from data this app
already pulls, not copied from any other site.

**Live now: Trend & momentum.**
- `trend-india.js` — for Nifty 50, Nifty Bank and BSE Sensex (Yahoo
  symbols `^NSEI`, `^NSEBANK`, `^BSESN`, already used elsewhere in this
  app — see `public/data.js` — so this reuses symbols already known to
  work rather than guessing new ones), fetches the full available daily
  history in one call (`range=max` on the same Yahoo chart endpoint
  `fetchQuote`/`fetchPeriods` in `app.js` already use — see
  `quotes.js`'s `parseLongSeries`) and computes a 0-100 trend score: the
  share of 8 signals (price vs. its 20/50/100/200-day average, and vs.
  its own close that many sessions back) pointing up. An uptrend starts
  the first time the score reaches 70, a downtrend the first time it
  falls to 30, each lasting until the opposite threshold — same rule
  tipsheet describes, reimplemented independently against this app's own
  (simpler, 8- not 24-signal) score. Also computes drawdown from the
  running all-time high, percentile-of-own-history for both readings,
  and calendar-period returns (1M/3M/6M/1Y). Pure computation logic
  (`computeTrendSeries`) is unit-tested in `test/trend-india.test.js`
  against synthetic rising/falling/flat price series, independent of any
  network call.
- `public/trend-ui.js` — market switcher, a headline score card with a
  "usual range" bar (shaded 25th-75th-percentile band + a marker for
  today, the same device tipsheet uses, drawn fresh here), a price-history
  chart, a drawdown-from-high reading, and a returns table. Same
  `#mo-root`/`tabchange`-driven mount point the editorial version used.
- Honest limits, stated on the page itself: Yahoo's history for these
  symbols runs to roughly 2007, far short of the 20+ years a site like
  tipsheet draws on, so "usual range" here describes a shorter and more
  recent period. The 8-signal score is a simplification, not a
  reproduction of anyone else's exact methodology.

**Planned next, in rough priority order** (see the session notes for the
full reasoning): Valuation (Nifty P/E — needs NSE's historical
`indicesHistory` endpoint, not yet confirmed against a live response from
this sandbox) and Breadth-over-time, both NSE- or Yahoo-sourced and
plausible soon; Flows (DII/FII) and Mutual Fund/SIP data next, since
AMFI's NAV feed is already wired in via `mf.js`; India macro (CPI/GDP)
and RBI data after that, pending a clean public endpoint. **Likely out of
reach without a paid feed:** ownership/promoter-pledge breakdowns (NSE's
public filings only cover this per-company, not aggregated — PRIME
Database, which tipsheet credits for this, is a commercial data vendor)
and a full systematic-models/portfolio-backtest library (tipsheet's own
is many weeks of dedicated quant engineering on its own).

## Fear & Greed (new tab)

A single composite 0-100 reading, in the spirit of the "fear & greed" style
page tipsheet.markets publishes (a big score + word label, a 0-100 scale
with five zones, a week/month/year-ago comparison, a component breakdown,
and score-history charts) — but computed independently, from this app's own
pipeline and its own disclosed method, not scraped from their page or
copying their (undisclosed) methodology.

- `fear-greed-india.js` — fetches full-history daily closes for the Nifty 50
  (`^NSEI`) and a gold ETF (`GOLDBEES.NS`, Nippon India ETF Gold BeES) via
  the same Yahoo `range=max` call `trend-india.js` already uses. `.NS`-suffixed
  Yahoo symbols are the same convention the breadth engine already fetches
  at scale (`app.js`'s `/api/breadth` route), so this isn't a new, unverified
  kind of symbol — just a new one, not yet confirmed against a live response
  from this sandbox (no outbound network here right now — see the sandbox
  note elsewhere in this file). Computes four signals, each ranked as a
  percentile against its own history, then averaged: momentum (price vs. its
  125-day average), realised volatility (21-day, annualised — a rough
  stand-in for India VIX, which this app has no source for yet, inverted so
  calmer reads greedier), safe-haven demand (Nifty's trailing-20-day return
  minus gold's), and distance from the highest close to date. Zones: Extreme
  Fear 0-20, Fear 20-40, Neutral 40-60, Greed 60-80, Extreme Greed 80-100 —
  clean round bands, not a copy of tipsheet's own (unpublished) thresholds.
  Pure computation logic (`computeFearGreedSeries`) is unit-tested in
  `test/fear-greed-india.test.js` against synthetic series (flat, a recent
  breakout, a recent crash), independent of any network call.
- `public/fg-ui.js` — the score gauge (five colour-banded zones + marker),
  week/month/year-ago comparison tiles, a component breakdown table, two
  score-history charts (full history, thinned, and the last ~2 years at
  daily resolution), and the method disclaimer. Mounts on `#fg-root`, same
  `tabchange`-driven pattern as every other tab.
- Honest limits, stated on the page itself: this is a simpler 4-signal
  method, not a reproduction of tipsheet's or CNN's exact (larger,
  undisclosed) models, and GOLDBEES.NS's own listing history caps how far
  back the composite's "own history" can reach.

## India Market Breadth (index-universe filter)

The Markets tab's Breadth panel, for India, compares advance/decline
across six lookback windows (1D/1W/20D/50D/100D/200D, counted in trading
sessions — the usual moving-average convention, not calendar days) for any
of ~21 NSE index universes: Nifty 50, Next 50, Midcap 50/100/150,
Smallcap 50/100/250/500, Midsmallcap 400 (plain and 50:50), Nifty 100/200/
500, the 500 Multicap and LargeMidSmall Equal-Cap strategy indices,
Largemidcap 250, Midcap Select, Total Market, Microcap 250, and India
FPI 150 — the same list NSE's own live heatmap page offers
(`nseindia.com/market-data/live-market-indices/heatmap`).

- `nse-index-breadth.js` — fetches that universe's constituent list and
  each stock's live 1-day % change from NSE's `equity-stockIndices` API
  (same cookie-priming anti-bot pattern as `nse-announcements.js`). This
  endpoint's exact response shape couldn't be verified live (no outbound
  access to nseindia.com from this sandbox), so field access is
  deliberately defensive — several plausible field-name spellings are
  tried, and a row is skipped, not a crash, if none match.
- `breadth.js` — the 1W/20D/50D/100D/200D figures need actual price
  history per stock, not just today's change, so this fetches each
  constituent's 2-year daily bars from Yahoo (the same chart endpoint
  `/api/quotes` and `/api/quotes/periods` already use) and derives a sign
  at each lookback (`parseBreadthSigns` in `quotes.js`). The largest
  universes run to 500-750 stocks, which is both too slow and too much for
  Yahoo's free endpoint to fetch one request at a time inside a single
  serverless invocation, so this is built around two things instead of a
  naive per-request fetch loop:
  1. A per-symbol cache **shared across every universe**, not scoped to
     one request. NSE's broader indices are strict supersets of its
     narrower ones (a Nifty 50 stock is also in Nifty 100, 200, 500, Total
     Market, ...), so a stock's bars fetched for one universe are already
     warm for every other universe containing it.
  2. A wall-clock time budget (concurrency-capped fetches stop launching
     new work once it elapses, rather than blowing past Vercel's function
     time limit). Whatever didn't finish is left out of the tally, and the
     response carries `coverage: { checked, total, timedOut }` so the UI
     can show "based on 420/500 stocks so far" rather than silently
     present a partial read as complete — coverage on a huge universe
     climbs toward complete over a few requests rather than stalling the
     same way every time, since (1) means each request only pays for
     whatever's still missing.
- `GET /api/breadth/in?universe=<slug>` — the combined result (1D from
  NSE's own pChange, the rest from the above). `GET
  /api/breadth/in/universes` — the slug/label list, for the dropdown.
- The client (`public/app.js`) lazy-loads per universe, caches briefly,
  and falls back to the plain locally-computed Nifty-50-only A/D figure
  (from quotes already on screen) if the live fetch fails or a non-default
  universe hasn't loaded yet — never shows one universe's numbers under a
  different universe's label.
