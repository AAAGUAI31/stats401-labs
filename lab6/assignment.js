// Lab 6 Assignment: two treemaps of the same GDP hierarchy.

const statusColors = d3.scaleOrdinal()
  .domain(["Increase", "Unchanged", "Decrease"])
  .range(["#16875b", "#7b8494", "#d14b4b"]);

const tooltip = d3.select("#tooltip");
const money = d3.format(",.0f");

// Build one shared status legend for both visualizations.
d3.select("#legend")
  .selectAll(".legend-item")
  .data(statusColors.domain())
  .join("span")
  .attr("class", "legend-item")
  .html(status => `<span class="swatch" style="background:${statusColors(status)}"></span>${status}`);

d3.json("../data/lab6_assignment_gdp.json")
  .then(data => {
    const summaryRoot = d3.hierarchy(data).sum(d => d.gdp || 0);
    d3.select("#country-count").text(summaryRoot.leaves().length);
    d3.select("#total-gdp").text(`$${money(summaryRoot.value)}B`);

    drawTreemap("#treemap-squarify", data, d3.treemapSquarify);
    drawTreemap("#treemap-slicedice", data, d3.treemapSliceDice);
  })
  .catch(error => {
    console.error(error);
    d3.select("#treemap-squarify").html(
      '<p class="error">The GDP JSON could not be loaded. Run convert_assignment.py and open this page through a local server.</p>'
    );
  });

function drawTreemap(container, data, tileMethod) {
  const width = 700;
  const height = 590;

  // A separate hierarchy is required because each tiling method writes different coordinates.
  const root = d3.hierarchy(data)
    .sum(d => d.gdp || 0)
    .sort((a, b) => b.value - a.value);

  d3.treemap()
    .tile(tileMethod)
    .size([width, height])
    .paddingOuter(3)
    .paddingTop(node => node.depth === 1 ? 23 : node.depth === 2 ? 16 : 0)
    .paddingInner(2)(root);

  const svg = d3.select(container)
    .append("svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("role", "img")
    .attr("aria-label", "Treemap of global GDP by continent, area, and country");

  // Leaf rectangles encode country GDP with area and GDP status with color.
  const leaves = svg.append("g")
    .selectAll("g")
    .data(root.leaves())
    .join("g")
    .attr("transform", d => `translate(${d.x0},${d.y0})`);

  leaves.append("rect")
    .attr("class", "leaf")
    .attr("width", d => Math.max(0, d.x1 - d.x0))
    .attr("height", d => Math.max(0, d.y1 - d.y0))
    .attr("fill", d => statusColors(d.data.status))
    .attr("stroke", "rgba(255,255,255,.8)");

  // Country names are shown only when the rectangle has enough room.
  leaves.append("text")
    .attr("class", "country-label")
    .attr("x", 6)
    .attr("y", 16)
    .style("display", d => fitsLabel(d, d.data.name) ? null : "none")
    .text(d => d.data.name);

  // GDP value is placed on a second line in larger rectangles.
  leaves.append("text")
    .attr("class", "country-label country-value")
    .attr("x", 6)
    .attr("y", 31)
    .style("display", d => (d.x1 - d.x0 > 68 && d.y1 - d.y0 > 40) ? null : "none")
    .text(d => `$${money(d.data.gdp)}B`);

  leaves
    .on("mouseenter", function () {
      d3.select(this).raise();
    })
    .on("mousemove", (event, d) => {
      const area = d.parent.data.name;
      const continent = d.parent.parent.data.name;
      tooltip
        .style("opacity", 1)
        .style("left", `${event.clientX + 14}px`)
        .style("top", `${event.clientY + 14}px`)
        .html(
          `<strong>${d.data.name}</strong><br>` +
          `<span class="muted">${continent} · ${area}</span><br>` +
          `GDP: $${money(d.data.gdp)} billion<br>` +
          `Status: ${d.data.status}`
        );
    })
    .on("mouseleave", () => tooltip.style("opacity", 0));

  // Area outlines and labels reveal the middle level of the hierarchy.
  const areas = svg.append("g")
    .selectAll("g")
    .data(root.descendants().filter(d => d.depth === 2))
    .join("g");

  areas.append("rect")
    .attr("x", d => d.x0)
    .attr("y", d => d.y0)
    .attr("width", d => d.x1 - d.x0)
    .attr("height", d => d.y1 - d.y0)
    .attr("fill", "none")
    .attr("stroke", "rgba(19,31,48,.5)")
    .attr("stroke-width", 1.2)
    .attr("pointer-events", "none");

  areas.append("text")
    .attr("class", "area-label")
    .attr("x", d => d.x0 + 4)
    .attr("y", d => d.y0 + 12)
    .style("display", d => (d.x1 - d.x0 > 65 && d.y1 - d.y0 > 30) ? null : "none")
    .text(d => d.data.name);

  // Stronger continent boundaries and labels expose the top hierarchy level.
  const continents = svg.append("g")
    .selectAll("g")
    .data(root.children)
    .join("g");

  continents.append("rect")
    .attr("x", d => d.x0)
    .attr("y", d => d.y0)
    .attr("width", d => d.x1 - d.x0)
    .attr("height", d => d.y1 - d.y0)
    .attr("fill", "none")
    .attr("stroke", "#17202f")
    .attr("stroke-width", 2)
    .attr("pointer-events", "none");

  continents.append("text")
    .attr("class", "continent-label")
    .attr("x", d => d.x0 + 6)
    .attr("y", d => d.y0 + 16)
    .style("display", d => (d.x1 - d.x0 > 74 && d.y1 - d.y0 > 35) ? null : "none")
    .text(d => d.data.name);
}

function fitsLabel(node, label) {
  const width = node.x1 - node.x0;
  const height = node.y1 - node.y0;
  return width > Math.max(46, label.length * 6.3) && height > 25;
}
