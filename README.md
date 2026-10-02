# Sunflower Markets

A simple, live stock market dashboard: global/India indices ticker, a
Nifty 50 sector heatmap, an advance/decline breadth strip, and a stock
treemap — all in a sunflower-field theme.

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
  Hang Seng, FTSE 100.
- **Sector heatmap**: Nifty 50 constituents grouped into sectors
  (`public/data.js`), average % change per sector. Click a tile to filter
  the treemap below.
- **Breadth strip**: advancing vs. declining count across the tracked
  Nifty 50 names.
- **Stock treemap**: each Nifty 50 stock, colored by day change intensity.

Refreshes every 30 seconds.

## Notes / extending it

- The Nifty 50 constituent list and sector mapping in `public/data.js` is
  maintained by hand — update it if index constituents change.
- Swap in a different free provider (e.g. [Twelve Data](https://twelvedata.com/),
  [Finnhub](https://finnhub.io/), [Alpha Vantage](https://www.alphavantage.co/))
  by editing `fetchQuote` in `server.js` — useful if Yahoo's endpoint
  rate-limits or changes shape.
- For BSE- or Nasdaq-listed symbols, use Yahoo's suffix conventions
  (`.BO` for BSE, no suffix for US tickers, e.g. `AAPL`).
- This is informational only — not investment advice.
