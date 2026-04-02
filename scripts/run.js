import fs from "fs/promises";
import path from "path";
import { chromium } from "playwright";
import yahooFinance from "yahoo-finance2";
import config from "../etf.config.json" with { type: "json" };

function pct(num) {
  if (num === null || num === undefined || Number.isNaN(num)) return null;
  return Number(num.toFixed(2));
}

function round(num, digits = 4) {
  if (num === null || num === undefined || Number.isNaN(num)) return null;
  return Number(num.toFixed(digits));
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

function extractPercentFromTextBlock(text) {
  if (!text) return null;

  const matches = [...text.matchAll(/([+-]?\d+(?:[.,]\d+)?)\s?%/g)];
  if (!matches.length) return null;

  for (const m of matches) {
    const raw = m[1].replace(",", ".");
    const val = Number(raw);
    if (Number.isFinite(val) && Math.abs(val) <= 100) return val;
  }

  return null;
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
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
  await page.waitForTimeout(3000);

  // Try to accept cookie/settings dialogs if present
  const possibleButtons = [
    "Accept",
    "Agree",
    "Save",
    "Close"
  ];

  for (const label of possibleButtons) {
    const btn = page.getByRole("button", { name: new RegExp(`^${label}$`, "i") }).first();
    try {
      if (await btn.isVisible({ timeout: 800 })) {
        await btn.click();
        await page.waitForTimeout(1000);
      }
    } catch {}
  }

  // Scroll to chart area
  try {
    await page.getByText("Chart", { exact: true }).first().scrollIntoViewIfNeeded();
    await page.waitForTimeout(1000);
  } catch {}

  const periods = ["1D", "1M", "YTD"];

  for (const period of periods) {
    try {
      const btn = page.getByRole("button", { name: new RegExp(`^${period}$`, "i") }).first();
      await btn.click({ timeout: 5000 });
      await page.waitForTimeout(2500);

      // Heuristic: read the visible chart container text and take the first percent found
      const chartTexts = await page.locator("body").allTextContents();
      let value = null;

      for (const txt of chartTexts) {
        if (!txt) continue;
        if (txt.includes("Chart") && txt.includes(period)) {
          value = extractPercentFromTextBlock(txt);
          if (value !== null) break;
        }
      }

      // Fallback: whole body
      if (value === null) {
        const bodyText = await page.locator("body").innerText();
        value = extractPercentFromTextBlock(bodyText);
      }

      result.values[period] = pct(value);
      if (value === null) {
        result.notes.push(`Could not confidently extract justETF ${period}`);
      }
    } catch (err) {
      result.notes.push(`justETF ${period} error: ${err.message}`);
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

  const bodyText = await page.locator("body").innerText();

  // Try common labels that may appear on quote pages
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

  // For first version leave 1M and YTD blank unless later we find stable page fields
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
