import fs from "fs/promises";
import path from "path";

const ETFS = [
  { name: "MSCI World", isin: "IE00B4L5Y983", ticker: "EUNL.DE" },
  { name: "MSCI World Value", isin: "IE00BP3QZB59", ticker: "XDEV.DE" },
  { name: "Emerging Markets", isin: "IE00BKM4GZ66", ticker: "XMME.DE" },
  { name: "Gold", isin: "IE00B4ND3602", ticker: "SGLN.MI" },
  { name: "Government Bond", isin: "IE00B14X4Q57", ticker: "IBGL.AS" },
  { name: "Euro Corporate Bond", isin: "IE00B3F81R35", ticker: "IEAA.L" },
  { name: "Defence Tech", isin: "IE000JCW3DZ3", ticker: "4MMR.DE" },
  { name: "AI & Big Data", isin: "IE00BGV5VN51", ticker: "XAIX.DE" }
];

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

function toUnixSeconds(date) {
  return Math.floor(date.getTime() / 1000);
}

function toIsoDateFromUnix(seconds) {
  if (seconds === null || seconds === undefined) return null;
  const d = new Date(seconds * 1000);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

async function fetchYahooChart(ticker) {
  const now = new Date();
  const start = new Date();
  start.setFullYear(now.getFullYear() - 3);
  start.setDate(start.getDate() - 10);

  const period1 = toUnixSeconds(start);
  const period2 = toUnixSeconds(now);

  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}` +
    `?period1=${period1}&period2=${period2}&interval=1d&includePrePost=false&events=div%2Csplits`;

  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0",
      "Accept": "application/json"
    }
  });

  if (!res.ok) {
    throw new Error(`Yahoo chart HTTP ${res.status}`);
  }

  const data = await res.json();

  const result = data?.chart?.result?.[0];
  const error = data?.chart?.error;

  if (error) {
    throw new Error(error.description || "Yahoo chart error");
  }

  if (!result) {
    throw new Error("No Yahoo chart result");
  }

  const timestamps = result.timestamp || [];
  const quote = result.indicators?.quote?.[0] || {};

  const opens = quote.open || [];
  const highs = quote.high || [];
  const lows = quote.low || [];
  const closes = quote.close || [];
  const volumes = quote.volume || [];

  const points = [];

  for (let i = 0; i < timestamps.length; i++) {
    const close = closes[i];
    if (close === null || close === undefined) continue;

    points.push({
      date: toIsoDateFromUnix(timestamps[i]),
      close: Number(close),
      open: opens[i] ?? null,
      high: highs[i] ?? null,
      low: lows[i] ?? null,
      volume: volumes[i] ?? null
    });
  }

  return points;
}

async function main() {
  const outDir = path.join(process.cwd(), "output");
  await ensureDir(outDir);

  const results = [];

  for (const etf of ETFS) {
    console.log(`Fetching history for ${etf.name} - ${etf.ticker}`);

    try {
      const history = await fetchYahooChart(etf.ticker);

      results.push({
        name: etf.name,
        isin: etf.isin,
        ticker: etf.ticker,
        ok: history.length > 0,
        points: history,
        notes: history.length ? [] : ["No chart data returned"]
      });
    } catch (error) {
      results.push({
        name: etf.name,
        isin: etf.isin,
        ticker: etf.ticker,
        ok: false,
        points: [],
        notes: [error.message]
      });
    }
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    results
  };

  await fs.writeFile(
    path.join(outDir, "price-history.json"),
    JSON.stringify(payload, null, 2),
    "utf8"
  );

  console.log(JSON.stringify(payload, null, 2));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
