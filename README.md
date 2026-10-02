# StalkingStocks

A simple, live stock market dashboard: a global indices ticker, a
country filter spanning 14 major markets, a sector heatmap, an
advance/decline breadth strip, and a stock treemap — all in a
sunflower-field theme.

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
