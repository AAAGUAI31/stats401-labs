const state = {
  dataset: null,
  passages: [],
  passageById: new Map(),
  query: "",
  section: "all",
  topic: "all",
  selected: null,
  neighborIds: new Set(),
  matrixSelection: null,
  matrixScope: "18"
};

const topicColor = d3.scaleOrdinal(d3.schemeTableau10);
const tooltip = d3.select("#tooltip");
let mapSvg;
let mapPoints;
let zoomBehavior;
let matrixCells;
let matrixRows = [];

d3.json("assignment-data.json")
  .then(dataset => {
    state.dataset = dataset;
    state.passages = dataset.passages.map(d => ({
      ...d,
      page: +d.page,
      word_count: +d.word_count,
      cluster: +d.cluster,
      x: +d.x,
      y: +d.y,
      section_similarity: +d.section_similarity,
      embedding: d.embedding.map(Number)
    }));
    state.passageById = new Map(state.passages.map(d => [d.passage_id, d]));

    const topics = dataset.topic_summary.map(d => d.cluster_name);
    const sections = dataset.section_summary.map(d => d.section);
    topicColor.domain(topics);

    renderMetadata(dataset.metadata);
    drawHorizontalBars("#term-chart", dataset.top_terms, "term", "count", "#476fd1", 640, 390);
    drawHorizontalBars("#section-chart", dataset.section_summary.slice(0, 12), "section", "count", "#16856b", 760, 390);
    buildControls(sections, topics);
    drawSemanticMap();
    drawLegend(dataset.topic_summary);
    drawMatrix();
    updateViews();
  })
  .catch(error => {
    d3.select("#semantic-map").html(
      `<div class="error"><strong>Could not load assignment-data.json.</strong><br>${escapeHtml(error.message)}<br>Open this page through a local HTTP server rather than file://.</div>`
    );
    d3.select("#map-status").attr("class", "map-status empty").text("Dataset loading failed.");
  });

function renderMetadata(metadata) {
  d3.select("#pdf-pages").text(d3.format(",")(metadata.pdf_pages));
  d3.select("#raw-passages").text(d3.format(",")(metadata.raw_passages));
  d3.select("#clean-passages").text(d3.format(",")(metadata.clean_passages));
  d3.select("#average-words").text(`${d3.format(".1f")(metadata.average_passage_words)} words`);
  d3.select("#formal-sections").text(d3.format(",")(metadata.formal_sections));
}

function drawHorizontalBars(selector, data, labelKey, valueKey, color, width, height) {
  const margin = { top: 12, right: 50, bottom: 35, left: labelKey === "section" ? 275 : 110 };
  const svg = d3.select(selector).append("svg").attr("viewBox", `0 0 ${width} ${height}`);
  const y = d3.scaleBand()
    .domain(data.map(d => d[labelKey]))
    .range([margin.top, height - margin.bottom])
    .padding(0.22);
  const x = d3.scaleLinear()
    .domain([0, d3.max(data, d => d[valueKey])]).nice()
    .range([margin.left, width - margin.right]);

  svg.append("g")
    .attr("class", "grid")
    .attr("transform", `translate(0,${height - margin.bottom})`)
    .call(d3.axisBottom(x).ticks(5).tickSize(-(height - margin.top - margin.bottom)).tickFormat(""));

  svg.selectAll("rect.bar")
    .data(data)
    .join("rect")
    .attr("class", "bar")
    .attr("x", margin.left)
    .attr("y", d => y(d[labelKey]))
    .attr("width", d => x(d[valueKey]) - margin.left)
    .attr("height", y.bandwidth())
    .attr("rx", 3)
    .attr("fill", color)
    .on("mouseenter", (event, d) => {
      tooltip.style("opacity", 1).html(`<strong>${escapeHtml(d[labelKey])}</strong><br>${d3.format(",")(d[valueKey])} passages / occurrences`);
      moveTooltip(event);
    })
    .on("mousemove", moveTooltip)
    .on("mouseleave", hideTooltip);

  svg.selectAll("text.value")
    .data(data)
    .join("text")
    .attr("class", "value")
    .attr("x", d => x(d[valueKey]) + 6)
    .attr("y", d => y(d[labelKey]) + y.bandwidth() / 2 + 4)
    .attr("fill", "#526078")
    .attr("font-size", 11)
    .text(d => d3.format(",")(d[valueKey]));

  svg.append("g")
    .attr("class", "axis")
    .attr("transform", `translate(${margin.left},0)`)
    .call(d3.axisLeft(y).tickSize(0).tickFormat(label => (
      labelKey === "section" && label.length > 42 ? `${label.slice(0, 41)}…` : label
    )))
    .call(g => g.select(".domain").remove());

  svg.append("g")
    .attr("class", "axis")
    .attr("transform", `translate(0,${height - margin.bottom})`)
    .call(d3.axisBottom(x).ticks(5));
}

function buildControls(sections, topics) {
  d3.select("#section-filter").selectAll("option.section")
    .data([...sections].sort(d3.ascending))
    .join("option").attr("class", "section").attr("value", d => d).text(d => d);

  d3.select("#topic-filter").selectAll("option.topic")
    .data(topics)
    .join("option").attr("class", "topic").attr("value", d => d).text(d => d);

  d3.select("#search").on("input", function () {
    state.query = this.value.toLowerCase().trim();
    updateViews();
  });
  d3.select("#section-filter").on("change", function () {
    state.section = this.value;
    updateViews();
  });
  d3.select("#topic-filter").on("change", function () {
    state.topic = this.value;
    updateViews();
  });
  d3.select("#matrix-scope").on("change", function () {
    state.matrixScope = this.value;
    drawMatrix();
    updateViews();
  });
  d3.select("#reset-zoom").on("click", () => {
    mapSvg.transition().duration(450).call(zoomBehavior.transform, d3.zoomIdentity);
  });
  d3.select("#clear-all").on("click", clearAll);
}

function drawSemanticMap() {
  const width = 1040;
  const height = 620;
  const margin = { top: 35, right: 28, bottom: 57, left: 66 };
  const x = d3.scaleLinear().domain(d3.extent(state.passages, d => d.x)).nice().range([margin.left, width - margin.right]);
  const y = d3.scaleLinear().domain(d3.extent(state.passages, d => d.y)).nice().range([height - margin.bottom, margin.top]);
  const radius = d3.scaleSqrt().domain(d3.extent(state.passages, d => d.word_count)).range([2.5, 8.5]);

  mapSvg = d3.select("#semantic-map").append("svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("role", "img")
    .attr("aria-label", "Semantic map of 1,015 DKU bulletin passages");

  mapSvg.append("rect")
    .attr("x", margin.left).attr("y", margin.top)
    .attr("width", width - margin.left - margin.right)
    .attr("height", height - margin.top - margin.bottom)
    .attr("fill", "#fbfdff").attr("stroke", "#dbe3ee");

  const xAxis = mapSvg.append("g").attr("class", "axis").attr("transform", `translate(0,${height - margin.bottom})`).call(d3.axisBottom(x).ticks(7));
  const yAxis = mapSvg.append("g").attr("class", "axis").attr("transform", `translate(${margin.left},0)`).call(d3.axisLeft(y).ticks(7));

  mapSvg.append("text").attr("x", width / 2).attr("y", height - 15).attr("text-anchor", "middle").attr("fill", "#64748b").attr("font-size", 12).text("PCA component 1");
  mapSvg.append("text").attr("transform", `translate(18,${height / 2}) rotate(-90)`).attr("text-anchor", "middle").attr("fill", "#64748b").attr("font-size", 12).text("PCA component 2");

  mapSvg.append("defs").append("clipPath").attr("id", "assignment-map-clip").append("rect")
    .attr("x", margin.left).attr("y", margin.top)
    .attr("width", width - margin.left - margin.right).attr("height", height - margin.top - margin.bottom);

  const layer = mapSvg.append("g").attr("clip-path", "url(#assignment-map-clip)");
  mapPoints = layer.selectAll("circle.passage-point")
    .data(state.passages, d => d.passage_id)
    .join("circle")
    .attr("class", "passage-point")
    .attr("cx", d => x(d.x)).attr("cy", d => y(d.y))
    .attr("r", d => radius(d.word_count))
    .attr("fill", d => topicColor(d.cluster_name))
    .attr("fill-opacity", .72).attr("stroke", "#fff").attr("stroke-width", .75)
    .style("cursor", "pointer")
    .on("mouseenter", showPointTooltip).on("mousemove", moveTooltip).on("mouseleave", hideTooltip)
    .on("click", (event, d) => { event.stopPropagation(); selectPassage(d); });

  zoomBehavior = d3.zoom()
    .scaleExtent([.75, 10])
    .extent([[margin.left, margin.top], [width - margin.right, height - margin.bottom]])
    .translateExtent([[0, 0], [width, height]])
    .on("zoom", event => {
      const tx = event.transform.rescaleX(x);
      const ty = event.transform.rescaleY(y);
      xAxis.call(d3.axisBottom(tx).ticks(7));
      yAxis.call(d3.axisLeft(ty).ticks(7));
      mapPoints.attr("cx", d => tx(d.x)).attr("cy", d => ty(d.y));
    });

  mapSvg.call(zoomBehavior).on("dblclick.zoom", null);
  mapSvg.on("click", () => {
    state.selected = null;
    state.neighborIds.clear();
    showDefaultDetail();
    updateViews();
  });
}

function drawLegend(topicSummary) {
  d3.select("#topic-legend").selectAll("span.legend-item")
    .data(topicSummary)
    .join("span")
    .attr("class", "legend-item")
    .attr("title", d => `Characteristic terms: ${d.top_terms.slice(0, 6).join(", ")}`)
    .html(d => `<span class="swatch" style="background:${topicColor(d.cluster_name)}"></span>${escapeHtml(d.cluster_name)} (${d.count})`);
}

function drawMatrix() {
  if (!state.dataset) return;
  const topics = state.dataset.topic_summary.map(d => d.cluster_name);
  matrixRows = state.matrixScope === "all"
    ? state.dataset.section_summary.map(d => d.section)
    : state.dataset.section_summary.slice(0, 18).map(d => d.section);

  const counts = d3.rollup(state.passages, rows => rows.length, d => d.section, d => d.cluster_name);
  const sectionTotals = d3.rollup(state.passages, rows => rows.length, d => d.section);
  const cells = d3.cross(matrixRows, topics).map(([section, topic]) => ({
    section,
    topic,
    count: counts.get(section)?.get(topic) || 0,
    proportion: (counts.get(section)?.get(topic) || 0) / (sectionTotals.get(section) || 1)
  }));

  const width = 1200;
  const margin = { top: 185, right: 30, bottom: 32, left: 355 };
  const rowHeight = 29;
  const height = margin.top + matrixRows.length * rowHeight + margin.bottom;
  const x = d3.scaleBand().domain(topics).range([margin.left, width - margin.right]).padding(.07);
  const y = d3.scaleBand().domain(matrixRows).range([margin.top, height - margin.bottom]).padding(.07);
  const color = d3.scaleSequential().domain([0, d3.max(cells, d => d.count) || 1]).interpolator(d3.interpolateBlues);

  d3.select("#matrix").selectAll("*").remove();
  const svg = d3.select("#matrix").append("svg").attr("viewBox", `0 0 ${width} ${height}`)
    .attr("role", "img").attr("aria-label", "Topic by formal bulletin section matrix");

  svg.append("g").attr("class", "axis").attr("transform", `translate(0,${margin.top})`)
    .call(d3.axisTop(x).tickSize(0))
    .call(g => g.selectAll("text").attr("text-anchor", "start").attr("transform", "rotate(-43)").attr("dx", 8).attr("dy", -2));
  svg.append("g").attr("class", "axis").attr("transform", `translate(${margin.left},0)`)
    .call(d3.axisLeft(y).tickSize(0)).call(g => g.select(".domain").remove());

  matrixCells = svg.append("g").selectAll("rect.matrix-cell")
    .data(cells, d => `${d.section}|${d.topic}`)
    .join("rect").attr("class", "matrix-cell")
    .attr("x", d => x(d.topic)).attr("y", d => y(d.section))
    .attr("width", x.bandwidth()).attr("height", y.bandwidth()).attr("rx", 3)
    .attr("fill", d => d.count ? color(d.count) : "#eef2f7")
    .attr("stroke", "#fff").attr("stroke-width", 1.5)
    .on("mouseenter", (event, d) => {
      tooltip.style("opacity", 1).html(
        `<strong>${escapeHtml(d.section)}</strong><br>${escapeHtml(d.topic)}<br>`
        + `${d.count} passages · ${d3.format(".1%")(d.proportion)} of section`
      );
      moveTooltip(event);
    })
    .on("mousemove", moveTooltip).on("mouseleave", hideTooltip)
    .on("click", (event, d) => { event.stopPropagation(); selectMatrixCell(d); });

  svg.append("g").selectAll("text.matrix-count").data(cells).join("text")
    .attr("class", "matrix-count").attr("x", d => x(d.topic) + x.bandwidth() / 2)
    .attr("y", d => y(d.section) + y.bandwidth() / 2 + 4).attr("text-anchor", "middle")
    .attr("font-size", 10).attr("font-weight", 750).attr("pointer-events", "none")
    .attr("fill", d => d.count > 12 ? "white" : "#475569").text(d => d.count || "");
}

function matchesFilters(d) {
  const text = `${d.text_clean} ${d.chapter} ${d.section} ${d.subsection} ${d.cluster_name}`.toLowerCase();
  return (state.query === "" || text.includes(state.query))
    && (state.section === "all" || d.section === state.section)
    && (state.topic === "all" || d.cluster_name === state.topic);
}

function matchesMatrix(d) {
  return !state.matrixSelection
    || (d.section === state.matrixSelection.section && d.cluster_name === state.matrixSelection.topic);
}

function updateViews() {
  if (!mapPoints || !matrixCells) return;
  const visible = state.passages.filter(d => matchesFilters(d) && matchesMatrix(d));
  const visibleIds = new Set(visible.map(d => d.passage_id));

  mapPoints
    .attr("opacity", d => {
      if (!visibleIds.has(d.passage_id)) return .035;
      if (!state.selected) return .82;
      if (d.passage_id === state.selected.passage_id) return 1;
      return state.neighborIds.has(d.passage_id) ? .95 : .12;
    })
    .attr("stroke", d => {
      if (state.selected?.passage_id === d.passage_id) return "#111827";
      if (state.neighborIds.has(d.passage_id)) return "#f59e0b";
      return "#fff";
    })
    .attr("stroke-width", d => state.selected?.passage_id === d.passage_id ? 3.2 : state.neighborIds.has(d.passage_id) ? 2.3 : .75);

  matrixCells
    .attr("stroke", d => {
      const pointCell = state.selected && state.selected.section === d.section && state.selected.cluster_name === d.topic;
      const selectedCell = state.matrixSelection && state.matrixSelection.section === d.section && state.matrixSelection.topic === d.topic;
      return pointCell || selectedCell ? "#f59e0b" : "#fff";
    })
    .attr("stroke-width", d => {
      const active = (state.selected && state.selected.section === d.section && state.selected.cluster_name === d.topic)
        || (state.matrixSelection && state.matrixSelection.section === d.section && state.matrixSelection.topic === d.topic);
      return active ? 4 : 1.5;
    })
    .attr("opacity", d => {
      const sectionMatch = state.section === "all" || d.section === state.section;
      const topicMatch = state.topic === "all" || d.topic === state.topic;
      return sectionMatch && topicMatch ? 1 : .22;
    });

  d3.select("#map-status")
    .attr("class", visible.length ? "map-status" : "map-status empty")
    .text(visible.length ? `${d3.format(",")(visible.length)} of ${d3.format(",")(state.passages.length)} passages highlighted.` : "No passage matches all current conditions.");

  if (state.matrixSelection) {
    d3.select("#matrix-status").text(`${state.matrixSelection.section} × ${state.matrixSelection.topic}: ${visible.length} passage(s) after filters.`);
  } else if (state.selected) {
    const inScope = matrixRows.includes(state.selected.section);
    d3.select("#matrix-status").text(inScope
      ? `Orange outline: ${state.selected.section} × ${state.selected.cluster_name}.`
      : `Selected point belongs to ${state.selected.section}; choose “All 80 sections” to reveal its cell.`);
  } else {
    d3.select("#matrix-status").text(`${matrixRows.length} formal sections shown. Click a cell to coordinate with the map.`);
  }
}

function selectPassage(passage) {
  state.selected = passage;
  state.matrixSelection = null;
  state.neighborIds = new Set(passage.neighbors.map(d => d.passage_id));
  renderPassageDetail(passage);
  updateViews();
}

function selectMatrixCell(cell) {
  const same = state.matrixSelection && state.matrixSelection.section === cell.section && state.matrixSelection.topic === cell.topic;
  state.matrixSelection = same ? null : cell;
  state.selected = null;
  state.neighborIds.clear();

  if (state.matrixSelection) {
    const rows = state.passages.filter(matchesMatrix);
    d3.select("#detail-panel").html(`
      <h3>Matrix selection</h3><dl><dt>Section</dt><dd>${escapeHtml(cell.section)}</dd><dt>Topic</dt><dd>${escapeHtml(cell.topic)}</dd><dt>Passages</dt><dd>${rows.length}</dd></dl>
      <p>Matching points are highlighted in the semantic map. Click the cell again to remove this coordinated selection.</p>
      <ol class="neighbor-list">${rows.slice(0, 12).map(d => `<li>${escapeHtml(d.passage_id)} · p. ${d.page} · ${escapeHtml(d.subsection)}</li>`).join("")}</ol>
    `);
  } else {
    showDefaultDetail();
  }
  updateViews();
}

function renderPassageDetail(passage) {
  const neighbors = passage.neighbors.map(item => ({ ...state.passageById.get(item.passage_id), similarity: item.similarity }));
  d3.select("#detail-panel").html(`
    <h3>${escapeHtml(passage.passage_id)} · ${escapeHtml(passage.cluster_name)}</h3>
    <dl><dt>Chapter</dt><dd>${escapeHtml(passage.chapter)}</dd><dt>Section</dt><dd>${escapeHtml(passage.section)}</dd><dt>Subsection</dt><dd>${escapeHtml(passage.subsection)}</dd><dt>PDF page</dt><dd>${passage.page}</dd><dt>Length</dt><dd>${passage.word_count} words</dd><dt>Section fit</dt><dd>${d3.format(".3f")(passage.section_similarity)}</dd></dl>
    <div class="passage">${escapeHtml(passage.text)}</div>
    <h3 style="margin-top:16px">Five nearest semantic passages</h3>
    <ol class="neighbor-list">${neighbors.map(d => `<li><strong>${escapeHtml(d.passage_id)}</strong> · ${escapeHtml(d.section)} · ${d3.format(".3f")(d.similarity)}</li>`).join("")}</ol>
  `);
}

function clearAll() {
  state.query = "";
  state.section = "all";
  state.topic = "all";
  state.selected = null;
  state.neighborIds.clear();
  state.matrixSelection = null;
  d3.select("#search").property("value", "");
  d3.select("#section-filter").property("value", "all");
  d3.select("#topic-filter").property("value", "all");
  showDefaultDetail();
  updateViews();
}

function showDefaultDetail() {
  d3.select("#detail-panel").html("<h3>Passage details</h3><p>Click a point to inspect its chapter, section, page, full text, and five nearest passages in the original 16-dimensional semantic space.</p>");
}

function showPointTooltip(event, d) {
  tooltip.style("opacity", 1).html(`<strong>${escapeHtml(d.passage_id)} · ${escapeHtml(d.cluster_name)}</strong><br>${escapeHtml(d.section)}<br>PDF page ${d.page} · ${d.word_count} words`);
  moveTooltip(event);
}

function moveTooltip(event) {
  tooltip.style("left", `${event.clientX + 14}px`).style("top", `${event.clientY + 14}px`);
}

function hideTooltip() { tooltip.style("opacity", 0); }

function escapeHtml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}
