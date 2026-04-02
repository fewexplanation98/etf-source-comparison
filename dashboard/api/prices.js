const ETFS = [
  { name: "MSCI World", isin: "IE00B4L5Y983", ticker: "EUNL.DE" },
  { name: "MSCI World Value", isin: "IE00BP3QZB59", ticker: "XDEV.DE" },
  { name: "Emerging Markets", isin: "IE00BKM4GZ66", ticker: "XMME.DE" },
  { name: "Gold", isin: "IE00B4ND3602", ticker: "SGLN.MI" },
  { name: "Government Bond", isin: "IE00B14X4Q57", ticker: "IBGL.AS" },
  { name: "Euro Corporate Bond", isin: "IE00B3F81R35", ticker: "IEAC.L" },
  { name: "Defence Tech", isin: "IE000JCW3DZ3", ticker: "4MMR.DE" },
  { name: "AI & Big Data", isin: "IE00BGV5VN51", ticker: "XAIX.DE" }
];

export const maxDuration = 60;

function toUnixSeconds(date) {
  return Math.floor(date.getTime() / 1000);
}

function toIso(seconds) {
  if (seconds == null) return null;
  const d = new Date(seconds * 1000);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function mapResult(result) {
  const timestamps = result?.timestamp || [];
  const q = result?.indicators?.quote?.[0] || {};

  const points = [];

  for (let i = 0; i < timestamps.length; i++) {
    if (q.close?.[i] == null) continue;

    points.push({
      date: toIso(timestamps[i]),
      close: Number(q.close[i]),
      open: q.open?.[i] ?? null,
      high: q.high?.[i] ?? null,
      low: q.low?.[i] ?? null,
      volume: q.volume?.[i] ?? null
    });
  }

  return points;
}

async function fetchYahoo(url, label) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0",
      "Accept": "application/json"
    }
  });

  if (!res.ok) {
    throw new Error(`${label} HTTP ${res.status}`);
  }

  const data = await res.json();
  const result = data?.chart?.result?.[0];
  const error = data?.chart?.error;

  if (error) {
    throw new Error(error.description || `${label} error`);
  }

  if (!result) {
    throw new Error(`No ${label} result`);
  }

  return result;
}

async function fetchDaily(ticker) {
  const now = new Date();
  const start = new Date();
  start.setFullYear(now.getFullYear() - 3);

  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}` +
    `?period1=${toUnixSeconds(start)}&period2=${toUnixSeconds(now)}&interval=1d`;

  const result = await fetchYahoo(url, "daily");
  return mapResult(result);
}

async function fetchIntraday(ticker) {
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}` +
    `?range=1d&interval=5m`;

  const result = await fetchYahoo(url, "intraday");
  return mapResult(result);
}

async function fetchETF(etf) {
  const [dailyRes, intraRes] = await Promise.allSettled([
    fetchDaily(etf.ticker),
    fetchIntraday(etf.ticker)
  ]);

  return {
    name: etf.name,
    isin: etf.isin,
    ticker: etf.ticker,
    ok:
      (dailyRes.status === "fulfilled" && dailyRes.value.length) ||
      (intraRes.status === "fulfilled" && intraRes.value.length),
    points: dailyRes.status === "fulfilled" ? dailyRes.value : [],
    intraday: intraRes.status === "fulfilled" ? intraRes.value : [],
    notes: [
      ...(dailyRes.status === "rejected" ? [`Daily: ${dailyRes.reason.message}`] : []),
      ...(intraRes.status === "rejected" ? [`Intraday: ${intraRes.reason.message}`] : [])
    ]
  };
}

export default {
  async fetch(request) {
    try {
      const results = await Promise.all(ETFS.map(fetchETF));

      return new Response(
        JSON.stringify({
          generatedAt: new Date().toISOString(),
          results
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
            "cache-control": "s-maxage=300, stale-while-revalidate=600"
          }
        }
      );
    } catch (error) {
      console.error("PRICES_API_ERROR", error);

      return new Response(
        JSON.stringify({ error: error.message || "Unexpected error" }),
        {
          status: 500,
          headers: { "content-type": "application/json" }
        }
      );
    }
  }
};
