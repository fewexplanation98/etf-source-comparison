import fs from "fs/promises";
import path from "path";
import { chromium } from "playwright";
import config from "../etf.config.json" with { type: "json" };

function pct(num) {
  if (num === null || num === undefined || Number.isNaN(num)) return null;
  return Number(num.toFixed(2));
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
      "3M": null,
      "YTD": null,
      "1Y": null,
      "3Y": null
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
      const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const rx = new RegExp(`${escaped}\\s*:?\\s*([+-]?\\d+(?:[.,]\\d+)?)%`, "i");
      const m = bodyText.match(rx);
      if (m) {
        return Number(m[1].replace(",", "."));
      }
    }

    return null;
  }

  const mapping = [
    { period: "1D", labels: ["1 day", "1D"] },
    { period: "1M", labels: ["1 month", "1M"] },
    { period: "3M", labels: ["3 months", "3M"] },
    { period: "YTD", labels: ["YTD", "year to date"] },
    { period: "1Y", labels: ["1 year", "1Y"] },
    { period: "3Y", labels: ["3 years", "3Y"] }
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

async function main() {
  const outDir = path.join(process.cwd(), "output");
  await ensureDir(outDir);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1600, height: 1400 }
  });

  const justetf = await scrapeJustETF(page, config.justetfUrl);

  await browser.close();

  const payload = {
    generatedAt: new Date().toISOString(),
    etf: {
      name: config.name,
      isin: config.isin
    },
    results: [justetf]
  };

  await fs.writeFile(
    path.join(outDir, "justetf-results.json"),
    JSON.stringify(payload, null, 2),
    "utf8"
  );

  const rows = [
    ["Source", "1D", "5D", "1M", "3M", "YTD", "1Y", "3Y", "Notes"],
    ...payload.results.map(r => [
      r.source,
      r.values["1D"] ?? "",
      r.values["5D"] ?? "",
      r.values["1M"] ?? "",
      r.values["3M"] ?? "",
      r.values["YTD"] ?? "",
      r.values["1Y"] ?? "",
      r.values["3Y"] ?? "",
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
    path.join(outDir, "justetf-results.csv"),
    csv,
    "utf8"
  );

  console.log(JSON.stringify(payload, null, 2));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
