import fs from "fs/promises";
import path from "path";
import YahooFinance from "yahoo-finance2";

const yahooFinance = new YahooFinance();

const ETFS = [
  { name: "MSCI World", isin: "IE00B4L5Y983", ticker: "EUNL.DE" },
  { name: "MSCI World Value", isin: "IE00BP3QZB59", ticker: "IWVL.DE" },
  { name: "Emerging Markets", isin: "IE00BKM4GZ66", ticker: "EIMI.DE" },
  { name: "Gold", isin: "IE00B4ND3602", ticker: "SGLN.DE" },
  { name: "Government Bond", isin: "IE00B14X4Q57", ticker: "IBGL.AS" },
  { name: "Euro Corporate Bond", isin: "IE00B3F81R35", ticker: "IEAC.AS" },
  { name: "Defence Tech", isin: "IE000JCW3DZ3", ticker: "DFEN.MI" },
  { name: "AI & Big Data", isin: "IE00BGV5VN51", ticker: "XAIX.MI" }
];

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

function toIsoDate(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

async function fetchHistory(ticker) {
  const now = new Date();
  const start = new Date();
  start.setFullYear(now.getFullYear() - 3);
  start.setDate(start.getDate() - 10);

  const rows = await yahooFinance.historical(ticker, {
    period1: start,
    period2: now,
    interval: "1d"
  });

  return rows
    .filter(r => r?.date && r?.close !== null && r?.close !== undefined)
    .map(r => ({
      date: toIsoDate(r.date),
      close: Number(r.close),
      open: r.open ?? null,
      high: r.high ?? null,
      low: r.low ?? null,
      volume: r.volume ?? null
    }))
    .sort((a, b) => new Date(a.date) - new Date(b.date));
}

async function main() {
  const outDir = path.join(process.cwd(), "output");
  await ensureDir(outDir);

  const results = [];

  for (const etf of ETFS) {
    console.log(`Fetching history for ${etf.name} - ${etf.ticker}`);

    try {
      const history = await fetchHistory(etf.ticker);

      results.push({
        name: etf.name,
        isin: etf.isin,
        ticker: etf.ticker,
        ok: history.length > 0,
        points: history,
        notes: history.length ? [] : ["No historical data returned"]
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
