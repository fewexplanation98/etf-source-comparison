// justetf-periods-test.js
// Step 1: test JustETF performance extraction for all your ETFs by ISIN
// Output: console table + JSON file with 1D / 5D / 1M / 3M / YTD / 1Y / 3Y

const fs = require('fs');
const { chromium } = require('playwright');

// Put your ISINs here
const ISINS = [
  // 'IE00B4L5Y983',
  // 'IE00BK5BQT80',
];

const PERIOD_LABELS = {
  '1D': ['1 day', '1D', '1 day %', '1 giorno'],
  '5D': ['5 days', '5D', '5 days %', '5 giorni'],
  '1M': ['1 month', '1M', '1 month %', '1 mese'],
  '3M': ['3 months', '3M', '3 months %', '3 mesi'],
  'YTD': ['YTD', 'year to date'],
  '1Y': ['1 year', '1Y', '1 anno'],
  '3Y': ['3 years', '3Y', '3 anni'],
};

function normalizeSpaces(str) {
  return str.replace(/\s+/g, ' ').trim();
}

function parsePct(text) {
  if (!text) return null;
  const cleaned = text
    .replace(/\u2212/g, '-')
    .replace(/,/g, '.')
    .replace(/[^0-9+\-\.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const matches = cleaned.match(/[+\-]?\d+(?:\.\d+)?/g);
  if (!matches || !matches.length) return null;

  const value = Number(matches[matches.length - 1]);
  return Number.isFinite(value) ? value : null;
}

async function acceptCookiesIfNeeded(page) {
  const possibleButtons = [
    'button:has-text("Accept")',
    'button:has-text("Accept all")',
    'button:has-text("I agree")',
    'button:has-text("OK")',
    'button:has-text("Alle akzeptieren")',
    'button:has-text("Akzeptieren")',
  ];

  for (const selector of possibleButtons) {
    const btn = page.locator(selector).first();
    try {
      if (await btn.isVisible({ timeout: 1200 })) {
        await btn.click({ timeout: 1200 });
        await page.waitForTimeout(800);
        return;
      }
    } catch (_) {}
  }
}

async function grabWholeText(page) {
  return await page.evaluate(() => document.body.innerText || '');
}

function extractFromTextBlock(text) {
  const normalized = normalizeSpaces(text);
  const result = {};

  for (const [period, labels] of Object.entries(PERIOD_LABELS)) {
    let found = null;

    for (const label of labels) {
      const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

      const patterns = [
        new RegExp(`${escaped}\\s*([+\-−]?\\d+[\\.,]?\\d*\\s*%)`, 'i'),
        new RegExp(`([+\-−]?\\d+[\\.,]?\\d*\\s*%)\\s*${escaped}`, 'i'),
        new RegExp(`${escaped}[^+\-\d]{0,30}([+\-−]?\\d+[\\.,]?\\d*\\s*%)`, 'i'),
      ];

      for (const pattern of patterns) {
        const match = normalized.match(pattern);
        if (match?.[1]) {
          found = parsePct(match[1]);
          if (found !== null) break;
        }
      }
      if (found !== null) break;
    }

    result[period] = found;
  }

  return result;
}

async function extractUsingDom(page) {
  return await page.evaluate((periodLabels) => {
    function normalizeSpaces(str) {
      return str.replace(/\s+/g, ' ').trim();
    }

    function parsePct(text) {
      if (!text) return null;
      const cleaned = text
        .replace(/\u2212/g, '-')
        .replace(/,/g, '.')
        .replace(/[^0-9+\-\.]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      const matches = cleaned.match(/[+\-]?\d+(?:\.\d+)?/g);
      if (!matches || !matches.length) return null;
      const value = Number(matches[matches.length - 1]);
      return Number.isFinite(value) ? value : null;
    }

    const all = Array.from(document.querySelectorAll('body *'))
      .map(el => normalizeSpaces(el.textContent || ''))
      .filter(Boolean)
      .filter(txt => txt.length < 120);

    const out = {};

    for (const [period, labels] of Object.entries(periodLabels)) {
      let value = null;

      for (const label of labels) {
        const i = all.findIndex(txt => txt.toLowerCase() === label.toLowerCase());
        if (i >= 0) {
          const next = all.slice(i + 1, i + 6);
          for (const candidate of next) {
            if (candidate.includes('%')) {
              value = parsePct(candidate);
              if (value !== null) break;
            }
          }
        }
        if (value !== null) break;
      }

      out[period] = value;
    }

    return out;
  }, PERIOD_LABELS);
}

async function scrapeJustEtfByIsin(browser, isin) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 2200 } });

  try {
    const url = `https://www.justetf.com/en/etf-profile.html?isin=${isin}`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(2500);
    await acceptCookiesIfNeeded(page);
    await page.waitForTimeout(1500);

    const domResult = await extractUsingDom(page);
    const text = await grabWholeText(page);
    const textResult = extractFromTextBlock(text);

    const merged = {};
    for (const key of Object.keys(PERIOD_LABELS)) {
      merged[key] = domResult[key] ?? textResult[key] ?? null;
    }

    const hasEnoughData = Object.values(merged).filter(v => v !== null).length >= 4;

    return {
      isin,
      url,
      source: 'justETF',
      ok: hasEnoughData,
      ...merged,
    };
  } catch (error) {
    return {
      isin,
      source: 'justETF',
      ok: false,
      error: error.message,
      '1D': null,
      '5D': null,
      '1M': null,
      '3M': null,
      YTD: null,
      '1Y': null,
      '3Y': null,
    };
  } finally {
    await page.close();
  }
}

async function main() {
  if (!ISINS.length) {
    console.log('Add your ISINs first in the ISINS array.');
    return;
  }

  const browser = await chromium.launch({ headless: true });

  try {
    const results = [];

    for (const isin of ISINS) {
      console.log(`Checking ${isin}...`);
      const row = await scrapeJustEtfByIsin(browser, isin);
      results.push(row);
    }

    console.table(
      results.map(r => ({
        isin: r.isin,
        ok: r.ok,
        '1D': r['1D'],
        '5D': r['5D'],
        '1M': r['1M'],
        '3M': r['3M'],
        YTD: r.YTD,
        '1Y': r['1Y'],
        '3Y': r['3Y'],
      }))
    );

    fs.writeFileSync('justetf-periods-output.json', JSON.stringify(results, null, 2));
    console.log('\nSaved: justetf-periods-output.json');
  } finally {
    await browser.close();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
