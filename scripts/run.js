import fs from "fs/promises";
import path from "path";
import { chromium } from "playwright";
import yahooFinance from "yahoo-finance2";
import config from "../etf.config.json" with { type: "json" };

function pct(num) {
  if (num === null || num === undefined || Number.isNaN(num)) return null;
  return Number(num.toFixed(2));
}

function calcPct(current, base) {
  if (
    current === null || current === undefined ||
    base === null || base === undefined ||
    Number.isNaN(current) || Number.isNaN(base) || base === 0
  ) {
    return null;
  }
  return ((current - base) / base) * 100;
}

function parseLocalizedNumber(text) {
  if (!text) return null;
  const cleaned = text
    .replace(/\s/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function safeClickCookieButtons(page) {
  const selectors = [
    /accept/i,
    /agree/i,
    /consent/i,
    /save/i,
    /close/i,
    /allow/i,
    /ok/i
  ];

  for (const rx of selectors) {
    try {
      const btn = page.getByRole("button", { name: rx }).first();
      if (await btn.isVisible({ timeout: 1200 })) {
        await btn.click({ force: true });
        await page.waitForTimeout(1500);
        return true;
      }
    } catch {}
  }

  return false;
}

async function scrapeJustETF(page, url) {
  const result = {
    source: "justETF",
    values: {
      "1D": null,
      "1M": null,
      "YTD": null
    },
    notes: []
  };

  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(5000);

  await safeClickCookieButtons(page);

  try {
    const chartTitle = page.getByText(/chart/i).first();
    await chartTitle.scrollIntoViewIfNeeded();
    await page.waitForTimeout(1500);
  } catch {
    result.notes.push("Could not scroll to Chart section");
  }

  await page.screenshot({
    path: "output/justetf-debug-before.png",
    fullPage: true
  });

  async function clickPeriod(period) {
    const candidates = [
      page.getByRole("button", { name: new RegExp(`^${period}$`, "i") }).first(),
      page.getByText(new RegExp(`^${period}$`, "i")).first(),
      page.locator(`text="${period}"`).first(),
      page.locator(`button:has-text("${period}")`).first(),
      page.locator(`[role="button"]:has-text("${period}")`).first(),
      page.locator(`a:has-text("${period}")`).first()
    ];

    for (const candidate of candidates) {
      try {
        if (await candidate.isVisible({ timeout: 1500 })) {
          await candidate.scrollIntoViewIfNeeded();
          await page.waitForTimeout(500);
          await candidate.click({ force: true, timeout: 5000 });
          await page.waitForTimeout(3000);
          return true;
        }
      } catch {}
    }

    return false;
  }

  async function extractVisibleLabelValue(labels = []) {
    const bodyText = await page.locator("body").innerText();

    for (const label of labels) {
      const rx = new RegExp(`${label}\\s*:?\\s*([+-]?\\d+(?:[.,]\\d+)?)%`, "i");
      const m = bodyText.match(rx);
      if (m) {
        return Number(m[1].replace(",", "."));
      }
    }

    return null;
  }

  const mapping = [
    { period: "1D", labels: ["1 day"] },
    { period: "1M", labels: ["1 month"] },
    { period: "YTD", labels: ["YTD"] }
  ];

  for (const item of mapping) {
    const clicked = await clickPeriod(item.period);

    if (!clicked) {
      result.notes.push(`Could not click justETF period ${item.period}`);
      continue;
    }

    await page.screenshot({
      path: `output/justetf-${item.period}.png`,
      fullPage: true
    });

    const value = await extractVisibleLabelValue(item.labels);

    if (value === null) {
      result.notes.push(`Could not extract justETF value for ${item.period}`);
    } else {
      result.values[item.period] = pct(value);
    }
  }

  return result;
}

async function scrapeLS(page, url) {
  const result = {
    source: "L&S",
    values: {
      "1D": null,
      "1M": null,
      "YTD": null
    },
    raw: {
      priceNow: null,
      previousClose: null
    },
    notes: []
  };

  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(5000);

  await page.screenshot({
    path: "output/ls-debug.png",
    fullPage: true
  });

  const bodyText = await page.locator("body").innerText();

  const patterns = [
    { key: "priceNow", regex: /(?:Last|Price|Current price|Bid|Ask)\s*[:\n ]\s*([0-9][0-9.,]*)/i },
    { key: "previousClose", regex: /(?:Previous close|Close|Closing price)\s*[:\n ]\s*([0-9][0-9.,]*)/i }
  ];

  for (const p of patterns) {
    const m = bodyText.match(p.regex);
    if (m) {
      result.raw[p.key] = parseLocalizedNumber(m[1]);
    }
  }

  result.values["1D"] = pct(calcPct(result.raw.priceNow, result.raw.previousClose));

  if (result.raw.priceNow === null) {
    result.notes.push("Could not extract L&S current price");
  }
  if (result.raw.previousClose === null) {
    result.notes.push("Could not extract L&S previous close");
  }
  if (result.values["1D"] === null) {
    result.notes.push("Could not calculate L&S 1D");
  }

  result.notes.push("L&S 1M/YTD not implemented yet in first pass");

  return result;
}

function findNearestBeforeDate(rows, targetDate) {
  const eligible = rows.filter(r => new Date(r.date) <= targetDate);
  if (!eligible.length) return null;
  return eligible[eligible.length - 1];
}

async function fetchYahooData(ticker) {
  const result = {
    source: "Yahoo",
    values: {
      "1D": null,
      "1M": null,
      "YTD": null
    },
    raw: {
      currentPrice: null,
      previousClose: null,
      price1MBase: null,
      priceYtdBase: null,
      latestHistoricalClose: null
    },
    notes: []
  };

  try {
    const quote = await yahooFinance.quote(ticker);

    result.raw.currentPrice = quote.regularMarketPrice ?? null;
    result.raw.previousClose = quote.regularMarketPreviousClose ?? quote.previousClose ?? null;
    result.values["1D"] = pct(calcPct(result.raw.currentPrice, result.raw.previousClose));

    const today = new Date();
    const monthAgo = new Date(today);
    monthAgo.setMonth(monthAgo.getMonth() - 1);

    const yearStart = new Date(today.getFullYear(), 0, 1);

    const history = await yahooFinance.historical(ticker, {
      period1: new Date(today.getFullYear() - 1, 11, 1),
      period2: today,
      interval: "1d"
    });

    const clean = history
      .filter(r => r.close !== null && r.close !== undefined)
      .sort((a, b) => new Date(a.date) - new Date(b.date));

    if (!clean.length) {
      result.notes.push("Yahoo historical series empty");
      return result;
    }

    const latest = clean[clean.length - 1];
    const monthBase = findNearestBeforeDate(clean, monthAgo);
    const ytdBase = findNearestBeforeDate(clean, yearStart);

    result.raw.latestHistoricalClose = latest.close ?? null;
    result.raw.price1MBase = monthBase?.close ?? null;
    result.raw.priceYtdBase = ytdBase?.close ?? null;

    result.values["1M"] = pct(calcPct(result.raw.latestHistoricalClose, result.raw.price1MBase));
    result.values["YTD"] = pct(calcPct(result.raw.latestHistoricalClose, result.raw.priceYtdBase));
  } catch (err) {
    result.notes.push(`Yahoo error: ${err.message}`);
  }

  return result;
}

async function main() {
  const outDir = path.join(process.cwd(), "output");
  await ensureDir(outDir);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1600, height: 1400 }
  });

  const justetf = await scrapeJustETF(page, config.justetfUrl);
  const ls = await scrapeLS(page, config.lsUrl);
  const yahoo = await fetchYahooData(config.yahooTicker);

  await browser.close();

  const payload = {
    generatedAt: new Date().toISOString(),
    etf: {
      name: config.name,
      isin: config.isin,
      yahooTicker: config.yahooTicker
    },
    results: [justetf, ls, yahoo]
  };

  await fs.writeFile(
    path.join(outDir, "msci-world-results.json"),
    JSON.stringify(payload, null, 2),
    "utf8"
  );

  const rows = [
    ["Source", "1D", "1M", "YTD", "Notes"],
    ...payload.results.map(r => [
      r.source,
      r.values["1D"] ?? "",
      r.values["1M"] ?? "",
      r.values["YTD"] ?? "",
      (r.notes || []).join(" | ")
    ])
  ];

  const csv = rows
    .map(row =>
      row
        .map(cell => `"${String(cell).replace(/"/g, '""')}"`)
        .join(",")
    )
    .join("\n");

  await fs.writeFile(
    path.join(outDir, "msci-world-results.csv"),
    csv,
    "utf8"
  );

  console.log(JSON.stringify(payload, null, 2));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
