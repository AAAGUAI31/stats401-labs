const dimensions = [
  { key: "housing", label: "Housing", header: ["Housing"] },
  { key: "income", label: "Income and wealth", header: ["Income"] },
  { key: "jobs", label: "Work and job quality", header: ["Jobs"] },
  { key: "community", label: "Social connections", header: ["Social"] },
  { key: "education", label: "Knowledge and skills", header: ["Skills"] },
  { key: "environment", label: "Environmental quality", header: ["Environ."] },
  { key: "civic", label: "Civic engagement", header: ["Civic"] },
  { key: "health", label: "Health", header: ["Health"] },
  { key: "satisfaction", label: "Subjective well-being", header: ["Well-being"] },
  { key: "safety", label: "Safety", header: ["Safety"] },
  { key: "balance", label: "Work-life balance", header: ["Work-life"] }
];

const state = {
  data: [],
  sortKey: "overall",
  selectedCountry: "Finland",
  weights: Object.fromEntries(dimensions.map(dimension => [dimension.key, 5]))
};

const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const transitionDuration = prefersReducedMotion ? 0 : 480;
const formatScore = d3.format(".1f");
const colorScale = d3.scaleSequential(d3.interpolateYlGnBu).domain([0, 10]);
const tooltip = d3.select("#tooltip");

const heatmapLayout = {
  width: 1080,
  headerHeight: 86,
  rowHeight: 30,
  left: 176,
  cellWidth: 70,
  overallGap: 15,
  overallWidth: 88
};

let heatmapSvg;
let rowLayer;
let headerLayer;

function weightedScore(country) {
  const weightTotal = d3.sum(dimensions, dimension => state.weights[dimension.key]);
  if (weightTotal === 0) return null;
  return d3.sum(dimensions, dimension => country[dimension.key] * state.weights[dimension.key]) / weightTotal;
}

function selectedCountryData() {
  return state.data.find(country => country.country === state.selectedCountry) || state.data[0];
}

function sortedCountries() {
  const countries = state.data.slice();
  if (state.sortKey === "overall") {
    const hasWeights = d3.sum(Object.values(state.weights)) > 0;
    if (!hasWeights) return countries.sort((a, b) => d3.ascending(a.country, b.country));
    return countries.sort((a, b) => d3.descending(weightedScore(a), weightedScore(b)) || d3.ascending(a.country, b.country));
  }
  return countries.sort((a, b) => d3.descending(a[state.sortKey], b[state.sortKey]) || d3.ascending(a.country, b.country));
}

function setupPriorityControls() {
  const controls = d3.select("#priority-controls")
    .selectAll("div.priority-control")
    .data(dimensions)
    .join("div")
    .attr("class", "priority-control");

  controls.append("label")
    .attr("for", dimension => `weight-${dimension.key}`)
    .text(dimension => dimension.label);

  controls.append("output")
    .attr("class", "priority-value")
    .attr("for", dimension => `weight-${dimension.key}`)
    .attr("id", dimension => `weight-value-${dimension.key}`)
    .text("5");

  controls.append("input")
    .attr("id", dimension => `weight-${dimension.key}`)
    .attr("type", "range")
    .attr("min", 0)
    .attr("max", 10)
    .attr("step", 1)
    .attr("value", 5)
    .attr("aria-label", dimension => `${dimension.label} priority`)
    .on("input", function (event, dimension) {
      state.weights[dimension.key] = +this.value;
      d3.select(`#weight-value-${dimension.key}`).text(this.value);
      updateHeatmap();
      updateDetailChart();
    });

  d3.select("#reset-weights").on("click", () => {
    dimensions.forEach(dimension => { state.weights[dimension.key] = 5; });
    d3.selectAll(".priority-control input").property("value", 5);
    d3.selectAll(".priority-value").text("5");
    updateHeatmap();
    updateDetailChart();
  });
}

function setupSortControl() {
  const options = [{ key: "overall", label: "Weighted overall" }, ...dimensions];
  d3.select("#sort-select")
    .selectAll("option")
    .data(options)
    .join("option")
    .attr("value", option => option.key)
    .text(option => option.label);

  d3.select("#sort-select")
    .property("value", state.sortKey)
    .on("change", function () {
      state.sortKey = this.value;
      updateHeatmap();
    });
}

function drawLegend() {
  const width = 230;
  const height = 30;
  const svg = d3.select("#heatmap-legend")
    .append("svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("role", "img")
    .attr("aria-label", "Color scale from 0, lower performance, to 10, higher performance");

  const gradientId = "heatmap-color-gradient";
  const gradient = svg.append("defs")
    .append("linearGradient")
    .attr("id", gradientId)
    .attr("x1", "0%")
    .attr("x2", "100%");

  gradient.selectAll("stop")
    .data(d3.range(0, 1.01, 0.1))
    .join("stop")
    .attr("offset", stop => `${stop * 100}%`)
    .attr("stop-color", stop => colorScale(stop * 10));

  svg.append("rect")
    .attr("x", 16)
    .attr("y", 3)
    .attr("width", width - 32)
    .attr("height", 11)
    .attr("rx", 5.5)
    .attr("fill", `url(#${gradientId})`);

  svg.append("text").attr("x", 16).attr("y", 27).attr("fill", "#5d6a7d").attr("font-size", 10).text("0");
  svg.append("text").attr("x", width - 16).attr("y", 27).attr("text-anchor", "end").attr("fill", "#5d6a7d").attr("font-size", 10).text("10");
}

function setupHeatmap() {
  const height = heatmapLayout.headerHeight + state.data.length * heatmapLayout.rowHeight + 8;
  heatmapSvg = d3.select("#heatmap")
    .append("svg")
    .attr("viewBox", `0 0 ${heatmapLayout.width} ${height}`)
    .attr("role", "img")
    .attr("aria-labelledby", "heatmap-svg-title heatmap-svg-description");

  heatmapSvg.append("title").attr("id", "heatmap-svg-title").text("OECD country well-being heatmap");
  heatmapSvg.append("desc").attr("id", "heatmap-svg-description").text("Thirty-eight countries are shown in rows and eleven well-being dimensions in columns. Darker cells represent higher normalized scores on a zero-to-ten scale.");

  headerLayer = heatmapSvg.append("g").attr("class", "heatmap-headers");
  rowLayer = heatmapSvg.append("g").attr("class", "heatmap-rows");

  headerLayer.append("text").attr("class", "rank-label").attr("x", 16).attr("y", 75).text("#");
  headerLayer.append("text").attr("class", "country-label").attr("x", 38).attr("y", 75).text("Country");

  const headers = headerLayer.selectAll("g.dimension-header")
    .data(dimensions)
    .join("g")
    .attr("class", "dimension-header")
    .attr("transform", (dimension, index) => `translate(${heatmapLayout.left + index * heatmapLayout.cellWidth + heatmapLayout.cellWidth / 2},0)`);

  headers.append("circle")
    .attr("class", "active-column-marker")
    .attr("cy", 14)
    .attr("r", 3.5)
    .attr("opacity", 0);

  headers.append("text")
    .attr("class", "column-label")
    .attr("y", 58)
    .text(dimension => dimension.header[0]);

  const overallX = heatmapLayout.left + dimensions.length * heatmapLayout.cellWidth + heatmapLayout.overallGap;
  headerLayer.append("line")
    .attr("class", "overall-divider")
    .attr("x1", overallX - 8)
    .attr("x2", overallX - 8)
    .attr("y1", 15)
    .attr("y2", 80);

  const overallHeader = headerLayer.append("g")
    .attr("class", "overall-header-group")
    .attr("transform", `translate(${overallX + heatmapLayout.overallWidth / 2},0)`);
  overallHeader.append("circle").attr("class", "active-column-marker overall-marker").attr("cy", 14).attr("r", 3.5).attr("opacity", 0);
  overallHeader.append("text").attr("class", "overall-header").attr("y", 50).text("Weighted");
  overallHeader.append("text").attr("class", "overall-header").attr("y", 65).text("overall");

  updateHeatmap();
}

function showTooltip(event, cell) {
  tooltip
    .attr("aria-hidden", "false")
    .style("opacity", 1)
    .html(`<strong>${cell.country}</strong><span>${cell.label}: ${formatScore(cell.value)} / 10</span>`);
  moveTooltip(event);
}

function moveTooltip(event) {
  const pad = 14;
  const node = tooltip.node();
  let x = event.clientX + pad;
  let y = event.clientY + pad;
  if (node) {
    const bounds = node.getBoundingClientRect();
    if (x + bounds.width > window.innerWidth - 8) x = event.clientX - bounds.width - pad;
    if (y + bounds.height > window.innerHeight - 8) y = event.clientY - bounds.height - pad;
  }
  tooltip.style("left", `${Math.max(8, x)}px`).style("top", `${Math.max(8, y)}px`);
}

function showFocusedTooltip(event, cell) {
  const bounds = event.currentTarget.getBoundingClientRect();
  showTooltip({ clientX: bounds.left + bounds.width / 2, clientY: bounds.top + bounds.height / 2 }, cell);
}

function hideTooltip() {
  tooltip.attr("aria-hidden", "true").style("opacity", 0);
}

function selectCountry(countryName) {
  state.selectedCountry = countryName;
  rowLayer.selectAll("g.country-row").classed("is-selected", country => country.country === state.selectedCountry);
  updateDetailChart();
}

function updateHeatmap() {
  if (!state.data.length || !rowLayer) return;
  const sorted = sortedCountries();
  const overallX = heatmapLayout.left + dimensions.length * heatmapLayout.cellWidth + heatmapLayout.overallGap;
  const overallValid = d3.sum(Object.values(state.weights)) > 0;

  headerLayer.selectAll("g.dimension-header")
    .select("text")
    .classed("is-active", dimension => dimension.key === state.sortKey);
  headerLayer.selectAll("g.dimension-header")
    .select("circle")
    .attr("opacity", dimension => dimension.key === state.sortKey ? 1 : 0);
  headerLayer.selectAll(".overall-header")
    .classed("is-active", state.sortKey === "overall");
  headerLayer.select(".overall-marker").attr("opacity", state.sortKey === "overall" ? 1 : 0);

  const rows = rowLayer.selectAll("g.country-row")
    .data(sorted, country => country.country)
    .join(enter => {
      const row = enter.append("g")
        .attr("class", "country-row")
        .attr("tabindex", 0)
        .attr("role", "button")
        .attr("transform", (country, index) => `translate(0,${heatmapLayout.headerHeight + index * heatmapLayout.rowHeight})`)
        .on("click", (event, country) => selectCountry(country.country))
        .on("keydown", (event, country) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            selectCountry(country.country);
          }
        });

      row.append("rect")
        .attr("class", "row-background")
        .attr("x", 4)
        .attr("y", 0)
        .attr("width", heatmapLayout.width - 8)
        .attr("height", heatmapLayout.rowHeight - 2)
        .attr("rx", 4);
      row.append("text").attr("class", "rank-label").attr("x", 16).attr("y", 19);
      row.append("text").attr("class", "country-label").attr("x", 38).attr("y", 19);
      row.append("line")
        .attr("class", "overall-divider")
        .attr("x1", overallX - 8)
        .attr("x2", overallX - 8)
        .attr("y1", 1)
        .attr("y2", heatmapLayout.rowHeight - 3);
      row.append("text")
        .attr("class", "overall-label")
        .attr("x", overallX + heatmapLayout.overallWidth / 2)
        .attr("y", 19);
      return row;
    });

  rows.order()
    .classed("is-selected", country => country.country === state.selectedCountry)
    .attr("aria-label", country => {
      const overall = weightedScore(country);
      return `${country.country}. Weighted overall ${overall === null ? "not available" : `${formatScore(overall)} out of 10`}. Select to view details.`;
    });

  rows.select(".rank-label").text((country, index) => index + 1);
  rows.select(".country-label").text(country => country.country);
  rows.select(".overall-label").text(country => {
    const score = weightedScore(country);
    return score === null ? "N/A" : formatScore(score);
  });

  rows.transition("row-order")
    .duration(transitionDuration)
    .attr("transform", (country, index) => `translate(0,${heatmapLayout.headerHeight + index * heatmapLayout.rowHeight})`);

  rows.each(function (country) {
    const cells = dimensions.map((dimension, index) => ({
      country: country.country,
      key: dimension.key,
      label: dimension.label,
      value: country[dimension.key],
      index
    }));

    d3.select(this).selectAll("rect.heat-cell")
      .data(cells, cell => cell.key)
      .join("rect")
      .attr("class", "heat-cell")
      .attr("tabindex", 0)
      .attr("role", "img")
      .attr("aria-label", cell => `${cell.country}, ${cell.label}: ${formatScore(cell.value)} out of 10`)
      .attr("x", cell => heatmapLayout.left + cell.index * heatmapLayout.cellWidth + 1)
      .attr("y", 1)
      .attr("width", heatmapLayout.cellWidth - 2)
      .attr("height", heatmapLayout.rowHeight - 3)
      .attr("rx", 3)
      .attr("fill", cell => colorScale(cell.value))
      .on("mouseenter", showTooltip)
      .on("mousemove", moveTooltip)
      .on("mouseleave", hideTooltip)
      .on("focus", showFocusedTooltip)
      .on("blur", hideTooltip)
      .on("click", (event, cell) => {
        event.stopPropagation();
        selectCountry(cell.country);
      });
  });

  const status = d3.select("#heatmap-status");
  if (!overallValid) {
    status.classed("is-warning", true).text("Set at least one priority above zero. Overall scores are unavailable, so countries are shown alphabetically.");
  } else {
    const sortLabel = state.sortKey === "overall"
      ? "preference-weighted overall score"
      : dimensions.find(dimension => dimension.key === state.sortKey).label;
    status.classed("is-warning", false).text(`Sorted by ${sortLabel}, highest to lowest · ${state.data.length} countries · ${dimensions.length} dimensions`);
  }
}

function setupDetailChart() {
  const width = 1000;
  const height = 505;
  const margin = { top: 18, right: 72, bottom: 55, left: 178 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
  const x = d3.scaleLinear().domain([0, 10]).range([0, innerWidth]);
  const y = d3.scaleBand().domain(dimensions.map(dimension => dimension.key)).range([0, innerHeight]).padding(0.35);

  const svg = d3.select("#detail-chart")
    .append("svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("role", "img")
    .attr("aria-labelledby", "detail-svg-title detail-svg-description");
  svg.append("title").attr("id", "detail-svg-title").text("Selected country well-being profile");
  svg.append("desc").attr("id", "detail-svg-description").text("A horizontal dot plot comparing eleven normalized well-being scores on the same zero-to-ten scale.");

  const plot = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);
  plot.append("g")
    .attr("class", "detail-grid")
    .attr("transform", `translate(0,${innerHeight})`)
    .call(d3.axisBottom(x).ticks(6).tickSize(-innerHeight).tickFormat(""));
  plot.append("g")
    .attr("class", "detail-axis")
    .attr("transform", `translate(0,${innerHeight})`)
    .call(d3.axisBottom(x).ticks(6).tickSizeOuter(0));
  plot.append("text")
    .attr("class", "axis-title")
    .attr("x", innerWidth / 2)
    .attr("y", innerHeight + 43)
    .text("Normalized country performance score (0–10)");

  plot.selectAll("text.detail-y-label")
    .data(dimensions)
    .join("text")
    .attr("class", "detail-y-label")
    .attr("x", -14)
    .attr("y", dimension => y(dimension.key) + y.bandwidth() / 2)
    .text(dimension => dimension.label);

  const marks = plot.selectAll("g.detail-mark")
    .data(dimensions, dimension => dimension.key)
    .join("g")
    .attr("class", "detail-mark");
  marks.append("line").attr("class", "detail-stem").attr("x1", x(0));
  marks.append("circle").attr("class", "detail-dot").attr("r", 6).attr("tabindex", 0);
  marks.append("text").attr("class", "detail-value");

  updateDetailChart();
}

function updateDetailChart() {
  if (!state.data.length) return;
  const country = selectedCountryData();
  const width = 1000;
  const height = 505;
  const margin = { top: 18, right: 72, bottom: 55, left: 178 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
  const x = d3.scaleLinear().domain([0, 10]).range([0, innerWidth]);
  const y = d3.scaleBand().domain(dimensions.map(dimension => dimension.key)).range([0, innerHeight]).padding(0.35);
  const values = dimensions.map(dimension => ({ ...dimension, value: country[dimension.key] }));
  const strongest = d3.greatest(values, value => value.value);
  const weakest = d3.least(values, value => value.value);
  const overall = weightedScore(country);

  d3.select("#detail-heading").text(country.country);
  d3.select("#detail-overall").text(overall === null ? "N/A" : formatScore(overall));
  d3.select("#detail-summary").text(`${strongest.label} is the highest score (${formatScore(strongest.value)}), while ${weakest.label} is the lowest (${formatScore(weakest.value)}).`);

  const svg = d3.select("#detail-chart svg")
    .attr("aria-label", `${country.country} profile. Highest: ${strongest.label}, ${formatScore(strongest.value)}. Lowest: ${weakest.label}, ${formatScore(weakest.value)}.`);

  const marks = svg.selectAll("g.detail-mark").data(values, value => value.key);
  marks.select("line")
    .attr("y1", value => y(value.key) + y.bandwidth() / 2)
    .attr("y2", value => y(value.key) + y.bandwidth() / 2)
    .transition("detail")
    .duration(transitionDuration)
    .attr("x2", value => x(value.value));
  marks.select("circle")
    .attr("cy", value => y(value.key) + y.bandwidth() / 2)
    .attr("aria-label", value => `${value.label}: ${formatScore(value.value)} out of 10`)
    .transition("detail")
    .duration(transitionDuration)
    .attr("cx", value => x(value.value));
  marks.select("text")
    .attr("y", value => y(value.key) + y.bandwidth() / 2)
    .text(value => formatScore(value.value))
    .transition("detail")
    .duration(transitionDuration)
    .attr("x", value => Math.min(innerWidth + 44, x(value.value) + 12));
}

function updateReportWordCount() {
  const reportText = document.getElementById("report-copy").innerText;
  const words = reportText.match(/\b[\w’'-]+\b/g) || [];
  document.getElementById("report-word-count").textContent = `${words.length} words`;
}

async function initialize() {
  setupPriorityControls();
  setupSortControl();
  drawLegend();
  updateReportWordCount();

  try {
    state.data = await d3.csv("oecd-bli-2026.csv", row => {
      const country = { country: row.country };
      dimensions.forEach(dimension => { country[dimension.key] = +row[dimension.key]; });
      return country;
    });
    setupHeatmap();
    setupDetailChart();
  } catch (error) {
    console.error("Unable to load OECD Better Life Index data.", error);
    d3.select("#heatmap").html('<p class="error-message">The data could not be loaded. Open this page through a local web server or GitHub Pages.</p>');
    d3.select("#heatmap-status").text("Data load failed.").classed("is-warning", true);
  }
}

initialize();
