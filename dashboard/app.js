const SUMMARY_PERIODS = ["1D", "1M", "3M", "YTD", "1Y", "3Y"];
const CHART_PERIODS = ["1D", "1M", "3M", "YTD", "1Y", "3Y", "ALL"];

const state = {
  justetf: null,
  prices: null,
  selectedIsin: null,
  selectedChartPeriod: "1M"
};

const etfSelect = document.getElementById("etfSelect");
const lastUpdated = document.getElementById("lastUpdated");
const summaryCards = document.getElementById("summaryCards");
const overviewTableBody = document.getElementById("overviewTableBody");
const chartTitle = document.getElementById("chartTitle");
const chartSubtitle = document.getElementById("chartSubtitle");
const priceChart = document.getElementById("priceChart");
const periodButtons = document.getElementById("periodButtons");

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

function formatDateShort(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
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
    start.setMonth(0);
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
  }

  return points.filter(p => new Date(p.date) >= start);
}

function populateEtfSelect() {
  const rows = state.justetf?.results || [];
  etfSelect.innerHTML = "";

  rows.forEach((row, index) => {
    const option = document.createElement("option");
    option.value = row.isin;
    option.textContent = row.name;
    etfSelect.appendChild(option);

    if (index === 0 && !state.selectedIsin) {
      state.selectedIsin = row.isin;
    }
  });

  if (state.selectedIsin) {
    etfSelect.value = state.selectedIsin;
  }
}

function renderSummaryCards() {
  const row = getPerformanceRow(state.selectedIsin);

  if (!row) return;

  summaryCards.innerHTML = "";

  SUMMARY_PERIODS.forEach(period => {
    const value = row.values?.[period] ?? null;

    const card = document.createElement("div");
    card.className = "metric-card card";

    const label = document.createElement("span");
    label.className = "metric-label";
    label.textContent = period;

    const valueEl = document.createElement("span");
    valueEl.className = `metric-value ${getValueClass(value)}`;
    valueEl.textContent = formatPct(value);

    card.appendChild(label);
    card.appendChild(valueEl);
    summaryCards.appendChild(card);
  });
}

function renderOverviewTable() {
  const rows = state.justetf?.results || [];
  overviewTableBody.innerHTML = "";

  rows.forEach(row => {
    const tr = document.createElement("tr");

    const nameTd = document.createElement("td");
    nameTd.className = "table-name";
    nameTd.textContent = row.name;
    tr.appendChild(nameTd);

    SUMMARY_PERIODS.forEach(period => {
      const td = document.createElement("td");
      const value = row.values?.[period] ?? null;
      td.className = getValueClass(value);
      td.textContent = formatPct(value);
      tr.appendChild(td);
    });

    tr.addEventListener("click", () => {
      state.selectedIsin = row.isin;
      etfSelect.value = row.isin;
      renderAll();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });

    overviewTableBody.appendChild(tr);
  });
}

function setActivePeriodButton() {
  const buttons = periodButtons.querySelectorAll(".period-btn");
  buttons.forEach(btn => {
    btn.classList.toggle("active", btn.dataset.period === state.selectedChartPeriod);
  });
}

function buildLinePath(points, width, height, padding) {
  if (!points.length) return { linePath: "", areaPath: "", coords: [], min: 0, max: 0 };

  const values = points.map(p => p.close);
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
    const y = padding.top + (1 - (p.close - min) / (max - min)) * innerHeight;
    return { x, y, ...p };
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

function createSvgElement(tag, attrs = {}) {
  const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
  Object.entries(attrs).forEach(([key, value]) => {
    el.setAttribute(key, String(value));
  });
  return el;
}

function renderChart() {
  const priceRow = getPriceRow(state.selectedIsin);
  const perfRow = getPerformanceRow(state.selectedIsin);

  chartTitle.textContent = perfRow?.name ? `${perfRow.name} price chart` : "Price chart";

  if (!priceRow || !priceRow.points?.length) {
    chartSubtitle.textContent = "No price data available";
    priceChart.innerHTML = "";
    return;
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
  
 const rawPoints =
  state.selectedChartPeriod === "1D"
    ? (priceRow.intraday || [])
    : (priceRow.points || []);

const filtered =
  state.selectedChartPeriod === "1D"
    ? rawPoints
    : getFilteredPoints(rawPoints, state.selectedChartPeriod);

  if (!filtered.length) {
    chartSubtitle.textContent = "No points available for selected period";
    priceChart.innerHTML = "";
    return;
  }

  const first = filtered[0];
  const last = filtered[filtered.length - 1];
  const changePct = first?.close ? ((last.close - first.close) / first.close) * 100 : null;

  chartSubtitle.textContent =
    `${state.selectedChartPeriod} - ${filtered.length} points - ` +
    `Last: ${formatPrice(last.close)} - Change: ${formatPct(changePct)}`;

  const width = 1000;
  const height = 360;
  const padding = { top: 24, right: 70, bottom: 34, left: 60 };

  const { linePath, areaPath, coords, min, max } = buildLinePath(filtered, width, height, padding);

  priceChart.innerHTML = "";

  const yTicks = 4;
  for (let i = 0; i <= yTicks; i++) {
    const y = padding.top + ((height - padding.top - padding.bottom) / yTicks) * i;
    const value = max - ((max - min) / yTicks) * i;

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

    priceChart.appendChild(line);
    priceChart.appendChild(text);
  }

  const xTickIndexes = [];
  if (coords.length === 1) {
    xTickIndexes.push(0);
  } else {
    const desiredTicks = 5;
    for (let i = 0; i < desiredTicks; i++) {
      const idx = Math.round((i / (desiredTicks - 1)) * (coords.length - 1));
      if (!xTickIndexes.includes(idx)) xTickIndexes.push(idx);
    }
  }

  xTickIndexes.forEach(idx => {
    const point = coords[idx];
    const text = createSvgElement("text", {
      x: point.x,
      y: height - 8,
      "text-anchor": "middle",
      class: "axis-label"
    });
    text.textContent = formatAxisLabel(point.date, state.selectedChartPeriod);
    priceChart.appendChild(text);
  });

  const area = createSvgElement("path", {
    d: areaPath,
    class: "chart-area"
  });

  const line = createSvgElement("path", {
    d: linePath,
    class: "chart-line"
  });

  priceChart.appendChild(area);
  priceChart.appendChild(line);

  const lastPoint = coords[coords.length - 1];
  const marker = createSvgElement("circle", {
    cx: lastPoint.x,
    cy: lastPoint.y,
    r: 4
  });
  marker.setAttribute("fill", "#8ab4ff");

  const lastPriceText = createSvgElement("text", {
    x: Math.min(lastPoint.x + 10, width - 120),
    y: Math.max(lastPoint.y - 10, 18),
    class: "chart-last-price"
  });
  lastPriceText.textContent = formatPrice(last.close);

  priceChart.appendChild(marker);
  priceChart.appendChild(lastPriceText);
}

function renderLastUpdated() {
  const dates = [state.justetf?.generatedAt, state.prices?.generatedAt].filter(Boolean);
  const latest = dates.sort().slice(-1)[0];
  lastUpdated.textContent = latest ? `Last updated: ${formatDateTime(latest)}` : "Last updated: N/A";
}

function renderAll() {
  setActivePeriodButton();
  renderLastUpdated();
  renderSummaryCards();
  renderOverviewTable();
  renderChart();
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

etfSelect.addEventListener("change", e => {
  state.selectedIsin = e.target.value;
  renderAll();
});

periodButtons.addEventListener("click", e => {
  const btn = e.target.closest(".period-btn");
  if (!btn) return;

  const period = btn.dataset.period;
  if (!CHART_PERIODS.includes(period)) return;

  state.selectedChartPeriod = period;
  renderAll();
});

loadData().catch(error => {
  console.error(error);

  lastUpdated.textContent = "Failed to load data";
  chartTitle.textContent = "Dashboard error";
  chartSubtitle.textContent = error.message;
  priceChart.innerHTML = "";
});
