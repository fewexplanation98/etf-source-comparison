import fs from 'fs/promises';

async function loadEtfs() {
  const raw = await fs.readFile('./etfs.json', 'utf-8');
  return JSON.parse(raw);
}

function extractPeriodValue(html, labels) {
  const compact = html.replace(/\s+/g, ' ');

  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`${escaped}\\s*:?\\s*([-+]?\\d+[.,]?\\d*)%`, 'i');
    const match = compact.match(regex);

    if (match?.[1]) {
      const value = Number(match[1].replace(',', '.'));
      if (Number.isFinite(value)) return value;
    }
  }

  return null;
}

async function fetchJustEtfValues(isin) {
  const url = `https://www.justetf.com/en/etf-profile.html?isin=${encodeURIComponent(isin)}`;

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0',
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-US,en;q=0.9'
    }
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${isin}`);
  }

  const html = await response.text();

  const oneDay = extractPeriodValue(html, ['1 day', '1d']);
  const oneMonth = extractPeriodValue(html, ['1 month', '1m']);
  const ytd = extractPeriodValue(html, ['YTD']);

  return {
    isin,
    oneDay,
    oneMonth,
    ytd
  };
}

function printTable(rows) {
  const headers = ['ETF', 'ISIN', '1D', '1M', 'YTD'];
  const lines = [headers.join('\t')];

  for (const row of rows) {
    lines.push([
      row.label,
      row.isin,
      row.oneDay ?? 'n/a',
      row.oneMonth ?? 'n/a',
      row.ytd ?? 'n/a'
    ].join('\t'));
  }

  console.log(lines.join('\n'));
}

async function main() {
  try {
    const etfs = await loadEtfs();
    const results = [];

    for (const etf of etfs) {
      console.log(`Fetching justETF data for ${etf.label} (${etf.isin})...`);

      try {
        const values = await fetchJustEtfValues(etf.isin);
        results.push({
          label: etf.label,
          isin: etf.isin,
          oneDay: values.oneDay,
          oneMonth: values.oneMonth,
          ytd: values.ytd
        });
      } catch (error) {
        results.push({
          label: etf.label,
          isin: etf.isin,
          oneDay: null,
          oneMonth: null,
          ytd: null,
          error: String(error)
        });
      }
    }

    console.log('\nRESULTS\n');
    printTable(results);

    await fs.writeFile('./justetf-results.json', JSON.stringify(results, null, 2), 'utf-8');
    console.log('\nSaved: justetf-results.json');
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

main();
