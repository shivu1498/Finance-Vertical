// StalkingStocks — simple stock dashboard server.
// Proxies Yahoo Finance's public chart endpoint (free, no API key) so the
// browser never hits a foreign origin directly (avoids CORS + hides nothing
// sensitive, since Yahoo's endpoint is unauthenticated).
const express = require("express");
const path = require("path");
const fs = require("fs");
const { exec } = require("child_process");
const { createScreenerHandler } = require("./screener");

// Minimal .env loader so the Screener session cookie never lives in code.
try {
  for (const line of fs.readFileSync(path.join(__dirname, ".env"), "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch {
  // no .env file: Screener integration simply stays disabled
}

const app = express();
const PORT = process.env.PORT || 3000;
// Bind to localhost only: this server is reachable from this machine alone,
// never from other devices on the network.
const HOST = process.env.HOST || "127.0.0.1";

// symbol -> { data, ts }
const cache = new Map();
const CACHE_MS = 15_000;

async function fetchQuote(symbol) {
  const cached = cache.get(symbol);
  if (cached && Date.now() - cached.ts < CACHE_MS) return cached.data;

  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    symbol
  )}?interval=1d&range=5d`;

  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      Accept: "application/json",
    },
  });

  if (!res.ok) throw new Error(`upstream ${res.status} for ${symbol}`);
  const json = await res.json();
  const result = json?.chart?.result?.[0];
  if (!result) throw new Error(`no data for ${symbol}`);

  const meta = result.meta;
  const price = meta.regularMarketPrice;
  const prevClose = meta.chartPreviousClose ?? meta.previousClose;
  const change = price - prevClose;
  const changePercent = prevClose ? (change / prevClose) * 100 : 0;

  const data = {
    symbol,
    price,
    prevClose,
    change,
    changePercent,
    currency: meta.currency,
    marketState: meta.marketState,
    name: meta.symbol,
  };

  cache.set(symbol, { data, ts: Date.now() });
  return data;
}

app.use(express.static(path.join(__dirname, "public")));

app.get("/api/quotes", async (req, res) => {
  const raw = (req.query.symbols || "").toString();
  const symbols = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (symbols.length === 0) {
    return res.status(400).json({ error: "symbols query param required" });
  }

  const results = await Promise.allSettled(symbols.map(fetchQuote));

  const quotes = results.map((r, i) =>
    r.status === "fulfilled"
      ? r.value
      : { symbol: symbols[i], error: true, message: r.reason?.message }
  );

  res.json({ quotes, updatedAt: new Date().toISOString() });
});

app.get(
  "/api/screener/:symbol",
  createScreenerHandler({ sessionId: process.env.SCREENER_SESSIONID })
);

function openBrowser(url) {
  const platform = process.platform;
  const cmd =
    platform === "win32" ? `start "" "${url}"` : platform === "darwin" ? `open "${url}"` : `xdg-open "${url}"`;
  exec(cmd, (err) => {
    if (err) console.log(`Open ${url} in your browser manually.`);
  });
}

app.listen(PORT, HOST, () => {
  const url = `http://localhost:${PORT}`;
  console.log(`StalkingStocks running at ${url} (this PC only)`);
  if (process.env.NO_OPEN !== "1") openBrowser(url);
});
