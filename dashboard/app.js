const SUMMARY_PERIODS = ["1D", "1M", "3M", "YTD", "1Y", "3Y"];
const CHART_PERIODS = ["1D", "1M", "3M", "YTD", "1Y", "3Y", "ALL"];
const COMPARISON_COLORS = [
  "#7fb4ff",
  "#28d17c",
  "#ff6b6b",
  "#ffbe3b",
  "#b388ff",
  "#4dd0e1",
  "#ff8a65",
  "#90caf9"
];

const OFFICIAL_NAMES = {
  IE00B4L5Y983: "iShares Core MSCI World UCITS ETF USD (Acc)",
  IE00BP3QZB59: "Xtrackers MSCI World Value UCITS ETF 1C",
  IE00BKM4GZ66: "Xtrackers MSCI Emerging Markets UCITS ETF 1C",
  IE00B4ND3602: "iShares Physical Gold ETC",
  IE00B14X4Q57: "iShares Core Global Government Bond UCITS ETF",
  IE00B3F81R35: "iShares Core EUR Corporate Bond UCITS ETF",
  IE000JCW3DZ3: "VanEck Defense UCITS ETF",
  IE00BGV5VN51: "Xtrackers Artificial Intelligence & Big Data UCITS ETF 1C"
};

const state = {
  justetf: null,
  prices: null,
  selectedIsin: null,
  selectedChartPeriod: "1D"
};

const el = {
  lastUpdated: document.getElementById("lastUpdated"),
  periodButtons: document.getElementById("periodButtons"),

  bestTitle: document.getElementById("bestTitle"),
  bestSubtitle: document.getElementById("bestSubtitle"),
  bestValue: document.getElementById("bestValue"),
  bestNote: document.getElementById("bestNote"),

  weakestTitle: document.getElementById("weakestTitle"),
  weakestSubtitle: document.getElementById("weakestSubtitle"),
  weakestValue: document.getElementById("weakestValue"),
  weakestNote: document.getElementById("weakestNote"),

  opportunityTitle: document.getElementById("opportunityTitle"),
  opportunitySubtitle: document.getElementById("opportunitySubtitle"),
  opportunityValue: document.getElementById("opportunityValue"),
  opportunityNote: document.getElementById("opportunityNote"),

  alertTitle: document.getElementById("alertTitle"),
  alertSubtitle: document.getElementById("alertSubtitle"),
  alertValue: document.getElementById("alertValue"),
  alertNote: document.getElementById("alertNote"),

  snapshotGrid: document.getElementById("snapshotGrid"),

  comparisonChart: document.getElementById("comparisonChart"),
  comparisonSubtitle: document.getElementById("comparisonSubtitle"),
  comparisonLegend: document.getElementById("comparisonLegend"),
  rankingBars: document.getElementById("rankingBars"),

  etfSelect: document.getElementById("etfSelect"),
  chartTitle: document.getElementById("chartTitle"),
  chartSubtitle: document.getElementById("chartSubtitle"),
  deepDiveCurrentPrice: document.getElementById("deepDiveCurrentPrice"),
  priceChart: document.getElementById("priceChart"),

  profileShortName: document.getElementById("profileShortName"),
  profileOfficialName: document.getElementById("profileOfficialName"),
  profileIsin: document.getElementById("profileIsin"),
  profileTicker: document.getElementById("profileTicker"),
  profilePeriodTrend: document.getElementById("profilePeriodTrend"),

  signal1D: document.getElementById("signal1D"),
  signal1M: document.getElementById("signal1M"),
  signal3M: document.getElementById("signal3M"),
  signalYTD: document.getElementById("signalYTD"),
  signal1Y: document.getElementById("signal1Y"),
  signal3Y: document.getElementById("signal3Y")
};

function formatPct(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return "N/A";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function formatPrice(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return "N/A";
  return value.toFixed(2);
}

function getValueClass(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return "na";
  if (value > 0) return "pos";
  if (value < 0) return "neg";
  return "";
}

function formatDateTime(value) {
  if (!value) return "N/A";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "N/A";
  return d.toLocaleString("en-GB", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatAxisLabel(value, period) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";

  if (period === "1D") {
    return d.toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "2-digit"
  });
}

function getPerformanceRow(isin) {
  return state.justetf?.results?.find(r => r.isin === isin) || null;
}

function getPriceRow(isin) {
  return state.prices?.results?.find(r => r.isin === isin) || null;
}

function getOfficialName(isin, fallbackName) {
  return OFFICIAL_NAMES[isin] || fallbackName || "N/A";
}

function getCurrentPrice(priceRow) {
  const source = state.selectedChartPeriod === "1D"
    ? (priceRow?.intraday?.length ? priceRow.intraday : priceRow?.points || [])
    : (priceRow?.points?.length ? priceRow.points : priceRow?.intraday || []);

  const last = source[source.length - 1];
  return last?.close ?? null;
}

function getTrendValue(perfRow, period) {
  if (!perfRow) return null;

  const priceRow = getPriceRow(perfRow.isin);

  if (period === "1D") {
    const intradayPoints = priceRow?.intraday || [];
    return calculatePointChange(intradayPoints);
  }

  if (period === "ALL") {
    const points = getDisplayPoints(priceRow, period);
    return calculatePointChange(points);
  }

  return perfRow.values?.[period] ?? null;
}

function getDisplayPoints(priceRow, period) {
  if (!priceRow) return [];

  if (period === "1D") {
    return priceRow.intraday || [];
  }

  const rawPoints = priceRow.points || [];
  return getFilteredPoints(rawPoints, period);
}

function getFilteredPoints(points, period) {
  if (!points?.length) return [];
  if (period === "ALL") return points;

  const lastDate = new Date(points[points.length - 1].date);
  const start = new Date(lastDate);

  if (period === "1M") {
    start.setMonth(start.getMonth() - 1);
  } else if (period === "3M") {
    start.setMonth(start.getMonth() - 3);
  } else if (period === "1Y") {
    start.setFullYear(start.getFullYear() - 1);
  } else if (period === "3Y") {
    start.setFullYear(start.getFullYear() - 3);
  } else if (period === "YTD") {
    start.setMonth(0, 1);
    start.setHours(0, 0, 0, 0);
  }

  return points.filter(p => new Date(p.date) >= start);
}

function calculatePointChange(points) {
  if (!points?.length) return null;
  const first = points[0]?.close;
  const last = points[points.length - 1]?.close;
  if (
    first === null || first === undefined ||
    last === null || last === undefined ||
    first === 0
  ) {
    return null;
  }
  return ((last - first) / first) * 100;
}

function normalizeSeries(points) {
  if (!points?.length) return [];
  const base = points[0]?.close;
  if (!base) return [];

  return points
    .filter(p => p?.close !== null && p?.close !== undefined)
    .map(p => ({
      date: p.date,
      value: (p.close / base) * 100
    }));
}

function populateEtfSelect() {
  const rows = state.justetf?.results || [];
  el.etfSelect.innerHTML = "";

  rows.forEach((row, index) => {
    const option = document.createElement("option");
    option.value = row.isin;
    option.textContent = row.name;
    el.etfSelect.appendChild(option);

    if (index === 0 && !state.selectedIsin) {
      state.selectedIsin = row.isin;
    }
  });

  if (state.selectedIsin) {
    el.etfSelect.value = state.selectedIsin;
  }
}

function renderLastUpdated() {
  const dates = [state.justetf?.generatedAt, state.prices?.generatedAt].filter(Boolean);
  const latest = dates.sort().slice(-1)[0];
  el.lastUpdated.textContent = latest ? formatDateTime(latest) : "N/A";
}

function getRankedRowsForSelectedPeriod() {
  const rows = (state.justetf?.results || []).map(row => ({
    ...row,
    trend: getTrendValue(row, state.selectedChartPeriod)
  }));

  return rows
    .filter(r => r.trend !== null && !Number.isNaN(r.trend))
    .sort((a, b) => b.trend - a.trend);
}

function renderHighlights() {
  const ranked = getRankedRowsForSelectedPeriod();

  if (!ranked.length) return;

  const best = ranked[0];
  const weakest = ranked[ranked.length - 1];

  el.bestTitle.textContent = best.name;
  el.bestSubtitle.textContent = `${state.selectedChartPeriod} leader`;
  el.bestValue.textContent = formatPct(best.trend);
  el.bestValue.className = `highlight-value ${getValueClass(best.trend)}`;
  el.bestNote.textContent = `Best relative strength in the selected period.`;

  el.weakestTitle.textContent = weakest.name;
  el.weakestSubtitle.textContent = `${state.selectedChartPeriod} laggard`;
  el.weakestValue.textContent = formatPct(weakest.trend);
  el.weakestValue.className = `highlight-value ${getValueClass(weakest.trend)}`;
  el.weakestNote.textContent = `Weakest momentum in the selected period.`;

  const opportunity = pickOpportunity();
  el.opportunityTitle.textContent = opportunity.title;
  el.opportunitySubtitle.textContent = opportunity.subtitle;
  el.opportunityValue.textContent = opportunity.value;
  el.opportunityValue.className = `highlight-value ${opportunity.valueClass}`;
  el.opportunityNote.textContent = opportunity.note;

  const alert = pickAlert();
  el.alertTitle.textContent = alert.title;
  el.alertSubtitle.textContent = alert.subtitle;
  el.alertValue.textContent = alert.value;
  el.alertValue.className = `highlight-value ${alert.valueClass}`;
  el.alertNote.textContent = alert.note;
}

function pickOpportunity() {
  const rows = state.justetf?.results || [];

  const candidates = rows
    .map(row => ({
      row,
      m1: row.values?.["1M"] ?? null,
      y1: row.values?.["1Y"] ?? null,
      d1: row.values?.["1D"] ?? null
    }))
    .filter(x => x.m1 !== null && x.y1 !== null)
    .filter(x => x.m1 < 0 && x.y1 > 0)
    .sort((a, b) => a.m1 - b.m1);

  if (candidates.length) {
    const c = candidates[0];
    return {
      title: c.row.name,
      subtitle: "Pullback in positive long-term trend",
      value: formatPct(c.m1),
      valueClass: getValueClass(c.m1),
      note: `1M is weak, but 1Y still stays positive - possible dip candidate.`
    };
  }

  const momentum = rows
    .map(row => ({
      row,
      p1: getTrendValue(row, state.selectedChartPeriod)
    }))
    .filter(x => x.p1 !== null)
    .sort((a, b) => b.p1 - a.p1)[0];

  return {
    title: momentum?.row?.name || "No clear setup",
    subtitle: "Momentum continuation",
    value: formatPct(momentum?.p1 ?? null),
    valueClass: getValueClass(momentum?.p1 ?? null),
    note: `Best period strength among tracked ETFs.`
  };
}

function pickAlert() {
  const rows = state.justetf?.results || [];

  const hardDrop = rows
    .map(row => ({
      row,
      d1: row.values?.["1D"] ?? null,
      m1: row.values?.["1M"] ?? null
    }))
    .filter(x => x.d1 !== null)
    .sort((a, b) => a.d1 - b.d1)[0];

  if (hardDrop && hardDrop.d1 <= -1.5) {
    return {
      title: hardDrop.row.name,
      subtitle: "Short-term weakness",
      value: formatPct(hardDrop.d1),
      valueClass: getValueClass(hardDrop.d1),
      note: `Strong daily downside move - worth monitoring intraday behavior.`
    };
  }

  const persistent = rows
    .map(row => ({
      row,
      m1: row.values?.["1M"] ?? null,
      m3: row.values?.["3M"] ?? null
    }))
    .filter(x => x.m1 !== null && x.m3 !== null && x.m1 < 0 && x.m3 < 0)
    .sort((a, b) => (a.m1 + a.m3) - (b.m1 + b.m3))[0];

  if (persistent) {
    return {
      title: persistent.row.name,
      subtitle: "Persistent weakness",
      value: formatPct(persistent.m1),
      valueClass: getValueClass(persistent.m1),
      note: `Negative on both 1M and 3M - weakness is not only intraday noise.`
    };
  }

  return {
    title: "No major alert",
    subtitle: "Market stress moderate",
    value: "OK",
    valueClass: "",
    note: `No ETF currently triggers a strong warning signal from the simple rules.`
  };
}

function createSvgElement(tag, attrs = {}) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
  Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, String(v)));
  return node;
}

function buildLinePath(points, width, height, padding, valueKey = "close") {
  if (!points.length) {
    return { linePath: "", areaPath: "", coords: [], min: 0, max: 0 };
  }

  const values = points.map(p => p[valueKey]);
  let min = Math.min(...values);
  let max = Math.max(...values);

  if (min === max) {
    min -= 1;
    max += 1;
  }

  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;

  const coords = points.map((p, i) => {
    const x = padding.left + (i / Math.max(points.length - 1, 1)) * innerWidth;
    const y = padding.top + (1 - (p[valueKey] - min) / (max - min)) * innerHeight;
    return { ...p, x, y };
  });

  const linePath = coords
    .map((c, i) => `${i === 0 ? "M" : "L"} ${c.x.toFixed(2)} ${c.y.toFixed(2)}`)
    .join(" ");

  const first = coords[0];
  const last = coords[coords.length - 1];

  const areaPath = [
    linePath,
    `L ${last.x.toFixed(2)} ${(height - padding.bottom).toFixed(2)}`,
    `L ${first.x.toFixed(2)} ${(height - padding.bottom).toFixed(2)}`,
    "Z"
  ].join(" ");

  return { linePath, areaPath, coords, min, max };
}

function renderMiniChart(svg, points, trendValue) {
  svg.innerHTML = "";

  if (!points?.length) return;

  const width = 300;
  const height = 78;
  const padding = { top: 6, right: 4, bottom: 6, left: 4 };

  const { linePath } = buildLinePath(points, width, height, padding, "close");
  if (!linePath) return;

  const line = createSvgElement("path", {
    d: linePath,
    class: "chart-line multi"
  });
  line.setAttribute("stroke", trendValue >= 0 ? "#28d17c" : "#ff6b6b");
  line.setAttribute("stroke-width", "2.2");

  svg.setAttribute("viewBox", "0 0 300 78");
  svg.appendChild(line);
}

function renderSnapshotCards() {
  const rows = state.justetf?.results || [];
  el.snapshotGrid.innerHTML = "";

  rows.forEach(row => {
    const priceRow = getPriceRow(row.isin);
    const displayPoints = getDisplayPoints(priceRow, state.selectedChartPeriod);
    const currentPrice = getCurrentPrice(priceRow);
    const trend = getTrendValue(row, state.selectedChartPeriod);

    const card = document.createElement("article");
    card.className = `snapshot-card card ${row.isin === state.selectedIsin ? "active" : ""}`;

    const head = document.createElement("div");
    head.className = "snapshot-head";
    head.innerHTML = `
      <div>
        <div class="snapshot-name">${row.name}</div>
        <div class="snapshot-official">${getOfficialName(row.isin, row.name)}</div>
      </div>
      <span class="snapshot-ticker">${priceRow?.ticker || "N/A"}</span>
    `;

    const meta = document.createElement("div");
    meta.className = "snapshot-meta";
    meta.innerHTML = `
      <div class="meta-box">
        <span class="meta-box-label">ISIN</span>
        <span class="meta-box-value">${row.isin}</span>
      </div>
      <div class="meta-box">
        <span class="meta-box-label">Selected trend</span>
        <span class="meta-box-value ${getValueClass(trend)}">${formatPct(trend)}</span>
      </div>
    `;

    const priceRowEl = document.createElement("div");
    priceRowEl.className = "snapshot-price-row";
    priceRowEl.innerHTML = `
      <div>
        <div class="snapshot-price">${formatPrice(currentPrice)}</div>
      </div>
      <div>
        <div class="snapshot-trend ${getValueClass(trend)}">${formatPct(trend)}</div>
        <div class="snapshot-trend-sub">${state.selectedChartPeriod} trend</div>
      </div>
    `;

    const miniSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    miniSvg.classList.add("snapshot-mini-chart");

    renderMiniChart(miniSvg, displayPoints, trend ?? 0);

    card.appendChild(head);
    card.appendChild(meta);
    card.appendChild(priceRowEl);
    card.appendChild(miniSvg);

    card.addEventListener("click", () => {
      state.selectedIsin = row.isin;
      el.etfSelect.value = row.isin;
      renderAll();
      window.scrollTo({ top: document.body.scrollHeight * 0.35, behavior: "smooth" });
    });

    el.snapshotGrid.appendChild(card);
  });
}

function renderRanking() {
  const ranked = getRankedRowsForSelectedPeriod();
  el.rankingBars.innerHTML = "";

  if (!ranked.length) return;

  const maxAbs = Math.max(...ranked.map(r => Math.abs(r.trend)), 1);

  ranked.forEach(row => {
    const item = document.createElement("div");
    item.className = "ranking-item";

    const widthPct = Math.max((Math.abs(row.trend) / maxAbs) * 100, 4);

    item.innerHTML = `
      <div class="ranking-top">
        <span class="ranking-name">${row.name}</span>
        <span class="ranking-value ${getValueClass(row.trend)}">${formatPct(row.trend)}</span>
      </div>
      <div class="ranking-track">
        <div
          class="ranking-fill"
          style="width:${widthPct}%; background:${row.trend >= 0 ? "#28d17c" : "#ff6b6b"}"
        ></div>
      </div>
    `;

    el.rankingBars.appendChild(item);
  });
}

function renderComparisonChart() {
  const rows = state.justetf?.results || [];
  const series = rows
    .map((row, index) => {
      const priceRow = getPriceRow(row.isin);
      const displayPoints = getDisplayPoints(priceRow, state.selectedChartPeriod);
      const normalized = normalizeSeries(displayPoints);

      return {
        name: row.name,
        isin: row.isin,
        color: COMPARISON_COLORS[index % COMPARISON_COLORS.length],
        points: normalized
      };
    })
    .filter(s => s.points.length > 1);

  el.comparisonChart.innerHTML = "";
  el.comparisonLegend.innerHTML = "";

  if (!series.length) {
    el.comparisonSubtitle.textContent = "No comparison data available";
    return;
  }

  el.comparisonSubtitle.textContent = `${state.selectedChartPeriod} comparison normalized to 100`;

  const width = 1000;
  const height = 420;
  const padding = { top: 26, right: 30, bottom: 36, left: 54 };

  const allValues = series.flatMap(s => s.points.map(p => p.value));
  let min = Math.min(...allValues);
  let max = Math.max(...allValues);
  if (min === max) {
    min -= 1;
    max += 1;
  }

  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;

  for (let i = 0; i <= 4; i++) {
    const y = padding.top + (innerHeight / 4) * i;
    const value = max - ((max - min) / 4) * i;

    const line = createSvgElement("line", {
      x1: padding.left,
      y1: y,
      x2: width - padding.right,
      y2: y,
      class: "grid-line"
    });
    const text = createSvgElement("text", {
      x: 6,
      y: y + 4,
      class: "axis-label"
    });
    text.textContent = value.toFixed(1);

    el.comparisonChart.appendChild(line);
    el.comparisonChart.appendChild(text);
  }

  const xRef = series[0].points;
  const xIndexes = [];
  const desiredTicks = 5;
  for (let i = 0; i < desiredTicks; i++) {
    const idx = Math.round((i / (desiredTicks - 1)) * (xRef.length - 1));
    if (!xIndexes.includes(idx)) xIndexes.push(idx);
  }

  xIndexes.forEach(idx => {
    const point = xRef[idx];
    if (!point) return;

    const x = padding.left + (idx / Math.max(xRef.length - 1, 1)) * innerWidth;
    const text = createSvgElement("text", {
      x,
      y: height - 8,
      "text-anchor": "middle",
      class: "axis-label"
    });
    text.textContent = formatAxisLabel(point.date, state.selectedChartPeriod);
    el.comparisonChart.appendChild(text);
  });

  series.forEach(seriesItem => {
    const coords = seriesItem.points.map((p, i) => {
      const x = padding.left + (i / Math.max(seriesItem.points.length - 1, 1)) * innerWidth;
      const y = padding.top + (1 - (p.value - min) / (max - min)) * innerHeight;
      return { ...p, x, y };
    });

    const d = coords
      .map((c, i) => `${i === 0 ? "M" : "L"} ${c.x.toFixed(2)} ${c.y.toFixed(2)}`)
      .join(" ");

    const path = createSvgElement("path", {
      d,
      class: "chart-line multi"
    });
    path.setAttribute("stroke", seriesItem.color);
    path.setAttribute("stroke-width", "2.3");

    const last = coords[coords.length - 1];
    const dot = createSvgElement("circle", {
      cx: last.x,
      cy: last.y,
      r: 3.5
    });
    dot.setAttribute("fill", seriesItem.color);

    el.comparisonChart.appendChild(path);
    el.comparisonChart.appendChild(dot);

    const legend = document.createElement("div");
    legend.className = "legend-item";
    legend.innerHTML = `
      <span class="legend-dot" style="background:${seriesItem.color}"></span>
      <span>${seriesItem.name}</span>
    `;
    el.comparisonLegend.appendChild(legend);
  });
}

function renderDeepDiveProfile() {
  const perfRow = getPerformanceRow(state.selectedIsin);
  const priceRow = getPriceRow(state.selectedIsin);

  if (!perfRow) return;

  const currentPrice = getCurrentPrice(priceRow);
  const trend = getTrendValue(perfRow, state.selectedChartPeriod);

  el.profileShortName.textContent = perfRow.name;
  el.profileOfficialName.textContent = getOfficialName(perfRow.isin, perfRow.name);
  el.profileIsin.textContent = perfRow.isin;
  el.profileTicker.textContent = priceRow?.ticker || "N/A";
  el.profilePeriodTrend.textContent = formatPct(trend);
  el.profilePeriodTrend.className = `profile-value ${getValueClass(trend)}`;

  el.signal1D.textContent = formatPct(perfRow.values?.["1D"] ?? null);
  el.signal1M.textContent = formatPct(perfRow.values?.["1M"] ?? null);
  el.signal3M.textContent = formatPct(perfRow.values?.["3M"] ?? null);
  el.signalYTD.textContent = formatPct(perfRow.values?.["YTD"] ?? null);
  el.signal1Y.textContent = formatPct(perfRow.values?.["1Y"] ?? null);
  el.signal3Y.textContent = formatPct(perfRow.values?.["3Y"] ?? null);

  [el.signal1D, el.signal1M, el.signal3M, el.signalYTD, el.signal1Y, el.signal3Y].forEach((node, i) => {
    const period = SUMMARY_PERIODS[i];
    const v = perfRow.values?.[period] ?? null;
    node.className = `signal-value ${getValueClass(v)}`;
  });

  el.deepDiveCurrentPrice.textContent = formatPrice(currentPrice);
}

function renderPriceChart() {
  const perfRow = getPerformanceRow(state.selectedIsin);
  const priceRow = getPriceRow(state.selectedIsin);

  el.priceChart.innerHTML = "";

  if (!perfRow || !priceRow) {
    el.chartTitle.textContent = "Price chart";
    el.chartSubtitle.textContent = "No data available";
    return;
  }

  const filtered = getDisplayPoints(priceRow, state.selectedChartPeriod);

  el.chartTitle.textContent = `${perfRow.name} price chart`;

  if (!filtered.length) {
    el.chartSubtitle.textContent = "No points available for selected period";
    return;
  }

  const trend = calculatePointChange(filtered);
  const last = filtered[filtered.length - 1];

  el.chartSubtitle.textContent =
    `${state.selectedChartPeriod} - ${filtered.length} points - Last: ${formatPrice(last.close)} - Trend: ${formatPct(trend)}`;

  const width = 1000;
  const height = 420;
  const padding = { top: 24, right: 70, bottom: 36, left: 56 };

  const { linePath, areaPath, coords, min, max } = buildLinePath(filtered, width, height, padding, "close");

  for (let i = 0; i <= 4; i++) {
    const y = padding.top + ((height - padding.top - padding.bottom) / 4) * i;
    const value = max - ((max - min) / 4) * i;

    const line = createSvgElement("line", {
      x1: padding.left,
      y1: y,
      x2: width - padding.right,
      y2: y,
      class: "grid-line"
    });

    const text = createSvgElement("text", {
      x: 8,
      y: y + 4,
      class: "axis-label"
    });
    text.textContent = formatPrice(value);

    el.priceChart.appendChild(line);
    el.priceChart.appendChild(text);
  }

  const xTickIndexes = [];
  const desiredTicks = 5;
  for (let i = 0; i < desiredTicks; i++) {
    const idx = Math.round((i / (desiredTicks - 1)) * (coords.length - 1));
    if (!xTickIndexes.includes(idx)) xTickIndexes.push(idx);
  }

  xTickIndexes.forEach(idx => {
    const point = coords[idx];
    if (!point) return;

    const text = createSvgElement("text", {
      x: point.x,
      y: height - 8,
      "text-anchor": "middle",
      class: "axis-label"
    });
    text.textContent = formatAxisLabel(point.date, state.selectedChartPeriod);
    el.priceChart.appendChild(text);
  });

  const area = createSvgElement("path", {
    d: areaPath,
    class: "chart-area"
  });

  const line = createSvgElement("path", {
    d: linePath,
    class: "chart-line"
  });
  line.setAttribute("stroke", trend >= 0 ? "#28d17c" : "#ff6b6b");

  el.priceChart.appendChild(area);
  el.priceChart.appendChild(line);

  const lastPoint = coords[coords.length - 1];
  const marker = createSvgElement("circle", {
    cx: lastPoint.x,
    cy: lastPoint.y,
    r: 4
  });
  marker.setAttribute("fill", trend >= 0 ? "#28d17c" : "#ff6b6b");

  const lastPriceText = createSvgElement("text", {
    x: Math.min(lastPoint.x + 10, width - 120),
    y: Math.max(lastPoint.y - 10, 18),
    class: "chart-last-price"
  });
  lastPriceText.textContent = formatPrice(last.close);

  el.priceChart.appendChild(marker);
  el.priceChart.appendChild(lastPriceText);
}

function setActivePeriodButton() {
  const buttons = el.periodButtons.querySelectorAll(".period-btn");
  buttons.forEach(btn => {
    btn.classList.toggle("active", btn.dataset.period === state.selectedChartPeriod);
  });
}

function renderAll() {
  setActivePeriodButton();
  renderLastUpdated();
  renderHighlights();
  renderSnapshotCards();
  renderComparisonChart();
  renderRanking();
  renderDeepDiveProfile();
  renderPriceChart();
}

async function loadData() {
  const [justetfRes, pricesRes] = await Promise.all([
    fetch("./data/justetf-results.json"),
    fetch("./data/price-history.json")
  ]);

  if (!justetfRes.ok) {
    throw new Error(`Failed to load justetf-results.json (${justetfRes.status})`);
  }
  if (!pricesRes.ok) {
    throw new Error(`Failed to load price-history.json (${pricesRes.status})`);
  }

  state.justetf = await justetfRes.json();
  state.prices = await pricesRes.json();

  if (!state.selectedIsin) {
    state.selectedIsin = state.justetf?.results?.[0]?.isin || null;
  }

  populateEtfSelect();
  renderAll();
}

el.etfSelect.addEventListener("change", e => {
  state.selectedIsin = e.target.value;
  renderAll();
});

el.periodButtons.addEventListener("click", e => {
  const btn = e.target.closest(".period-btn");
  if (!btn) return;

  const period = btn.dataset.period;
  if (!CHART_PERIODS.includes(period)) return;

  state.selectedChartPeriod = period;
  renderAll();
});

loadData().catch(error => {
  console.error(error);
  el.lastUpdated.textContent = "Failed to load data";
  el.chartTitle.textContent = "Dashboard error";
  el.chartSubtitle.textContent = error.message;
  el.comparisonSubtitle.textContent = error.message;
});
