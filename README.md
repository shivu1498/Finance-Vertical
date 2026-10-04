# StalkingStocks

A simple, live stock market dashboard: a global indices ticker, a
country filter spanning 14 major markets, a sector heatmap, an
advance/decline breadth strip, and a stock treemap — all in a
trypan-blue theme.

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
- **Breadth strip**: advancing vs. declining count across the selected
  country's tracked names.
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

- Scroll with the arrows; your choice is remembered in the browser.
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
