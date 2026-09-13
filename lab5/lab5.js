/*
 * Lab 5 Assignment: node-link and adjacency-matrix views of an urban transit network.
 * CSV files are loaded externally, and numeric fields are converted to numbers during loading.
 */

Promise.all([
    d3.csv("../data/lab5_assignment_stations.csv", d => ({
        id: d.id,
        station_name: d.station_name,
        district: d.district,
        daily_passengers: +d.daily_passengers,
        station_type: d.station_type
    })),
    d3.csv("../data/lab5_assignment_routes.csv", d => ({
        source: d.source,
        target: d.target,
        travel_time_min: +d.travel_time_min,
        route_type: d.route_type
    }))
]).then(([stations, routes]) => {
    if (stations.length !== 50 || routes.length !== 50) {
        throw new Error(`Unexpected data size: ${stations.length} stations and ${routes.length} routes.`);
    }

    const districtOrder = ["Central", "North", "South", "East", "West"];
    const stationTypeOrder = ["Local", "Transfer", "Terminal"];
    const routeTypeOrder = ["Metro", "Express", "Shuttle"];

    // Shared color scales keep visual meanings consistent across both views.
    const districtColor = d3.scaleOrdinal()
        .domain(districtOrder)
        .range(["#355f8d", "#2a9d8f", "#e9a23b", "#d65f5f", "#8067ad"]);

    const routeColor = d3.scaleOrdinal()
        .domain(routeTypeOrder)
        .range(["#2878b5", "#e07a30", "#45a56a"]);

    const symbolTypes = {
        Local: d3.symbolCircle,
        Transfer: d3.symbolSquare,
        Terminal: d3.symbolTriangle
    };

    const passengerSize = d3.scaleLinear()
        .domain(d3.extent(stations, d => d.daily_passengers))
        .range([90, 780]);

    const travelWidth = d3.scaleLinear()
        .domain(d3.extent(routes, d => d.travel_time_min))
        .range([1.2, 6]);

    const tooltip = d3.select("#tooltip");
    const endpointId = endpoint => typeof endpoint === "object" ? endpoint.id : endpoint;

    drawNodeLink();
    drawMatrix();

    d3.select("#load-status")
        .text(`Loaded ${stations.length} stations and ${routes.length} direct connections.`);

    /* Assignment Part A: interactive force-directed node-link visualization. */
    function drawNodeLink() {
        // A wider viewport separates the legend from the 50-node network.
        const width = 1250;
        const height = 760;
        const svg = d3.select("#network")
            .append("svg")
            .attr("viewBox", `0 0 ${width} ${height}`)
            .attr("role", "img")
            .attr("aria-label", "Interactive force-directed network of 50 urban transit stations");

        // Draw edges first so nodes always appear above them.
        const link = svg.append("g")
            .attr("class", "routes")
            .selectAll("line")
            .data(routes)
            .join("line")
            .attr("class", "route")
            .attr("stroke", d => routeColor(d.route_type))
            .attr("stroke-width", d => travelWidth(d.travel_time_min))
            .attr("stroke-opacity", 0.72)
            .attr("stroke-linecap", "round");

        // Wrap each station shape and label in one group so they move together.
        const node = svg.append("g")
            .attr("class", "stations")
            .selectAll("g")
            .data(stations)
            .join("g")
            .attr("class", "station-node");

        node.append("path")
            .attr("d", d => d3.symbol()
                .type(symbolTypes[d.station_type])
                .size(passengerSize(d.daily_passengers))())
            .attr("fill", d => districtColor(d.district))
            .attr("stroke", "#fff")
            .attr("stroke-width", 1.8);

        node.append("text")
            .attr("x", d => Math.sqrt(passengerSize(d.daily_passengers)) / 2 + 8)
            .attr("dy", "0.35em")
            .attr("font-size", 9.5)
            .attr("font-weight", 650)
            .attr("fill", "#293548")
            .text(d => d.id);

        // Four forces control link distance, repulsion, centering, and collision.
        const simulation = d3.forceSimulation(stations)
            .force("link", d3.forceLink(routes)
                .id(d => d.id)
                .distance(d => 65 + d.travel_time_min * 3.2)
                .strength(0.72))
            .force("charge", d3.forceManyBody().strength(-125))
            // Shift the horizontal center right to leave a dedicated legend column.
            .force("center", d3.forceCenter((width + 230) / 2, height / 2))
            .force("collision", d3.forceCollide()
                .radius(d => Math.sqrt(passengerSize(d.daily_passengers)) / 2 + 11)
                .iterations(2));

        simulation.on("tick", () => {
            // Keep nodes inside the canvas so labels do not move outside the view.
            stations.forEach(d => {
                d.x = Math.max(325, Math.min(width - 45, d.x));
                d.y = Math.max(25, Math.min(height - 25, d.y));
            });

            link
                .attr("x1", d => d.source.x)
                .attr("y1", d => d.source.y)
                .attr("x2", d => d.target.x)
                .attr("y2", d => d.target.y);

            node.attr("transform", d => `translate(${d.x}, ${d.y})`);
        });

        // Reheat the simulation while dragging and release fixed coordinates afterward.
        node.call(d3.drag()
            .on("start", (event, d) => {
                if (!event.active) simulation.alphaTarget(0.25).restart();
                d.fx = d.x;
                d.fy = d.y;
            })
            .on("drag", (event, d) => {
                d.fx = event.x;
                d.fy = event.y;
            })
            .on("end", (event, d) => {
                if (!event.active) simulation.alphaTarget(0);
                d.fx = null;
                d.fy = null;
            }));

        // Station hover highlights the selected node, its neighbors, and incident edges.
        node
            .on("mouseenter", (event, d) => {
                const neighborIds = new Set([d.id]);
                routes.forEach(route => {
                    const source = endpointId(route.source);
                    const target = endpointId(route.target);
                    if (source === d.id) neighborIds.add(target);
                    if (target === d.id) neighborIds.add(source);
                });

                node.attr("opacity", other => neighborIds.has(other.id) ? 1 : 0.12);
                link.attr("stroke-opacity", route =>
                    endpointId(route.source) === d.id || endpointId(route.target) === d.id ? 1 : 0.06
                );

                const degree = routes.filter(route =>
                    endpointId(route.source) === d.id || endpointId(route.target) === d.id
                ).length;

                showTooltip(event,
                    `<strong>${d.station_name} (${d.id})</strong><br>` +
                    `District: ${d.district}<br>` +
                    `Daily passengers: ${d3.format(",")(d.daily_passengers)}<br>` +
                    `Station type: ${d.station_type}<br>` +
                    `Direct connections: ${degree}`
                );
            })
            .on("mousemove", moveTooltip)
            .on("mouseleave", resetNetwork);

        // Route hover emphasizes only the selected route and its two endpoints.
        link
            .on("mouseenter", (event, d) => {
                const source = endpointId(d.source);
                const target = endpointId(d.target);
                node.attr("opacity", station => station.id === source || station.id === target ? 1 : 0.12);
                link.attr("stroke-opacity", route => route === d ? 1 : 0.08);
                showTooltip(event,
                    `<strong>${source} — ${target}</strong><br>` +
                    `Route type: ${d.route_type}<br>` +
                    `Travel time: ${d.travel_time_min} minutes`
                );
            })
            .on("mousemove", moveTooltip)
            .on("mouseleave", resetNetwork);

        drawNetworkLegend(svg);

        function resetNetwork() {
            node.attr("opacity", 1);
            link.attr("stroke-opacity", 0.72);
            hideTooltip();
        }
    }

    /* The legend explains the visual encodings for all five required variables. */
    function drawNetworkLegend(svg) {
        const legend = svg.append("g")
            .attr("class", "legend")
            .attr("transform", "translate(20, 24)");

        legend.append("rect")
            .attr("x", -10)
            .attr("y", -16)
            .attr("width", 280)
            .attr("height", 450)
            .attr("rx", 8)
            .attr("fill", "white")
            .attr("fill-opacity", 0.9)
            .attr("stroke", "#d8e0e9");

        legend.append("text")
            .attr("font-size", 17)
            .attr("font-weight", 800)
            .text("Visual Encodings");

        legend.append("text")
            .attr("y", 29)
            .attr("font-weight", 750)
            .attr("font-size", 12)
            .text("Color = District");

        const districts = legend.selectAll(".district-key")
            .data(districtOrder)
            .join("g")
            .attr("class", "district-key")
            .attr("transform", (d, i) => `translate(0, ${50 + i * 23})`);
        districts.append("circle").attr("r", 5.5).attr("fill", d => districtColor(d));
        districts.append("text").attr("x", 12).attr("dy", "0.35em").attr("font-size", 11.5).text(d => d);

        legend.append("text")
            .attr("y", 174)
            .attr("font-weight", 750)
            .attr("font-size", 12)
            .text("Shape = Station type");
        const types = legend.selectAll(".station-type-key")
            .data(stationTypeOrder)
            .join("g")
            .attr("class", "station-type-key")
            .attr("transform", (d, i) => `translate(5, ${198 + i * 24})`);
        types.append("path")
            .attr("d", d => d3.symbol().type(symbolTypes[d]).size(80)())
            .attr("fill", "#60758d");
        types.append("text").attr("x", 14).attr("dy", "0.35em").attr("font-size", 11.5).text(d => d);

        legend.append("text")
            .attr("y", 278)
            .attr("font-weight", 750)
            .attr("font-size", 12)
            .text("Area = Daily passengers");

        legend.append("text")
            .attr("y", 302)
            .attr("font-weight", 750)
            .attr("font-size", 12)
            .text("Line width = Travel time");

        legend.append("text")
            .attr("y", 336)
            .attr("font-weight", 750)
            .attr("font-size", 12)
            .text("Color = Route type");
        const routeKeys = legend.selectAll(".route-key")
            .data(routeTypeOrder)
            .join("g")
            .attr("class", "route-key")
            .attr("transform", (d, i) => `translate(0, ${360 + i * 24})`);
        routeKeys.append("line").attr("x2", 24).attr("stroke-width", 4).attr("stroke", d => routeColor(d));
        routeKeys.append("text").attr("x", 31).attr("dy", "0.35em").attr("font-size", 11.5).text(d => d);

    }

    /* Assignment Part B: adjacency matrix ordered by district and station type. */
    function drawMatrix() {
        const sortedStations = [...stations].sort((a, b) =>
            d3.ascending(districtOrder.indexOf(a.district), districtOrder.indexOf(b.district)) ||
            d3.ascending(stationTypeOrder.indexOf(a.station_type), stationTypeOrder.indexOf(b.station_type)) ||
            d3.ascending(+a.id.slice(1), +b.id.slice(1))
        );

        const matrixSize = 690;
        // Reserve a separate column on the right for the matrix legend.
        const margin = { top: 120, right: 225, bottom: 40, left: 120 };
        const totalWidth = matrixSize + margin.left + margin.right;
        const totalHeight = matrixSize + margin.top + margin.bottom;

        const svg = d3.select("#matrix")
            .append("svg")
            .attr("viewBox", `0 0 ${totalWidth} ${totalHeight}`)
            .attr("role", "img")
            .attr("aria-label", "A 50 by 50 transit adjacency matrix ordered by district and station type");

        const group = svg.append("g")
            .attr("transform", `translate(${margin.left}, ${margin.top})`);

        const ids = sortedStations.map(d => d.id);
        const x = d3.scaleBand().domain(ids).range([0, matrixSize]).padding(0.035);
        const y = d3.scaleBand().domain(ids).range([0, matrixSize]).padding(0.035);
        const timeOpacity = d3.scaleLinear()
            .domain(d3.extent(routes, d => d.travel_time_min))
            .range([0.35, 1]);

        // Because the network is undirected, each edge occupies two symmetric cells.
        const lookup = new Map();
        routes.forEach(route => {
            const source = endpointId(route.source);
            const target = endpointId(route.target);
            lookup.set(`${source}|${target}`, route);
            lookup.set(`${target}|${source}`, route);
        });

        const matrixData = sortedStations.flatMap(row =>
            sortedStations.map(col => ({
                row,
                col,
                route: lookup.get(`${row.id}|${col.id}`) || null
            }))
        );

        // Colored strips along the axes repeat the district encoding and mark five blocks.
        group.selectAll(".top-district-strip")
            .data(sortedStations)
            .join("rect")
            .attr("class", "top-district-strip")
            .attr("x", d => x(d.id))
            .attr("y", -9)
            .attr("width", x.bandwidth())
            .attr("height", 5)
            .attr("fill", d => districtColor(d.district));

        group.selectAll(".left-district-strip")
            .data(sortedStations)
            .join("rect")
            .attr("class", "left-district-strip")
            .attr("x", -9)
            .attr("y", d => y(d.id))
            .attr("width", 5)
            .attr("height", y.bandwidth())
            .attr("fill", d => districtColor(d.district));

        const cell = group.selectAll(".matrix-cell")
            .data(matrixData)
            .join("rect")
            .attr("class", "matrix-cell")
            .attr("x", d => x(d.col.id))
            .attr("y", d => y(d.row.id))
            .attr("width", x.bandwidth())
            .attr("height", y.bandwidth())
            .attr("rx", 1)
            .attr("fill", d => d.route ? routeColor(d.route.route_type) : "#edf1f5")
            .attr("fill-opacity", d => d.route ? timeOpacity(d.route.travel_time_min) : 1);

        const columnLabel = group.selectAll(".column-label")
            .data(sortedStations)
            .join("text")
            .attr("class", "matrix-label column-label")
            .attr("x", d => x(d.id) + x.bandwidth() / 2)
            .attr("y", -14)
            .attr("transform", d => {
                const labelX = x(d.id) + x.bandwidth() / 2;
                return `rotate(-60, ${labelX}, -14)`;
            })
            .attr("text-anchor", "start")
            .attr("font-size", 8.5)
            .attr("font-weight", 650)
            .attr("fill", d => districtColor(d.district))
            .text(d => d.id);

        const rowLabel = group.selectAll(".row-label")
            .data(sortedStations)
            .join("text")
            .attr("class", "matrix-label row-label")
            .attr("x", -14)
            .attr("y", d => y(d.id) + y.bandwidth() / 2)
            .attr("dy", "0.33em")
            .attr("text-anchor", "end")
            .attr("font-size", 8.5)
            .attr("font-weight", 650)
            .attr("fill", d => districtColor(d.district))
            .text(d => d.id);

        // Thin separator lines mark district boundaries.
        const boundaries = districtOrder.slice(1).map(district => {
            const first = sortedStations.find(station => station.district === district);
            return first ? x(first.id) : null;
        }).filter(value => value !== null);

        group.selectAll(".vertical-boundary")
            .data(boundaries)
            .join("line")
            .attr("class", "vertical-boundary")
            .attr("x1", d => d - 1.5)
            .attr("x2", d => d - 1.5)
            .attr("y1", 0)
            .attr("y2", matrixSize)
            .attr("stroke", "#8793a2")
            .attr("stroke-width", 1);

        group.selectAll(".horizontal-boundary")
            .data(boundaries)
            .join("line")
            .attr("class", "horizontal-boundary")
            .attr("x1", 0)
            .attr("x2", matrixSize)
            .attr("y1", d => d - 1.5)
            .attr("y2", d => d - 1.5)
            .attr("stroke", "#8793a2")
            .attr("stroke-width", 1);

        cell
            .on("mouseenter", (event, d) => {
                cell.attr("opacity", item =>
                    item.row.id === d.row.id || item.col.id === d.col.id ? 1 : 0.2
                );
                rowLabel.attr("font-size", item => item.id === d.row.id ? 12 : 8.5);
                columnLabel.attr("font-size", item => item.id === d.col.id ? 12 : 8.5);

                const details = d.route
                    ? `Route type: ${d.route.route_type}<br>Travel time: ${d.route.travel_time_min} minutes`
                    : "No direct connection";
                showTooltip(event,
                    `<strong>${d.row.station_name} × ${d.col.station_name}</strong><br>${details}`
                );
            })
            .on("mousemove", moveTooltip)
            .on("mouseleave", () => {
                cell.attr("opacity", 1);
                rowLabel.attr("font-size", 8.5);
                columnLabel.attr("font-size", 8.5);
                hideTooltip();
            });

        drawMatrixLegend(
            svg,
            margin.left + matrixSize + 28,
            margin.top + 8
        );
    }

    function drawMatrixLegend(svg, legendX, legendY) {
        const legend = svg.append("g")
            .attr("class", "legend")
            .attr("transform", `translate(${legendX}, ${legendY})`);

        // The background panel keeps the legend visually separate from the matrix.
        legend.append("rect")
            .attr("x", -12)
            .attr("y", -18)
            .attr("width", 180)
            .attr("height", 140)
            .attr("rx", 8)
            .attr("fill", "white")
            .attr("stroke", "#d8e0e9");

        legend.append("text")
            .attr("font-size", 12)
            .attr("font-weight", 750)
            .text("Cell color = Route type");

        const keys = legend.selectAll(".matrix-route-key")
            .data(routeTypeOrder)
            .join("g")
            .attr("class", "matrix-route-key")
            .attr("transform", (d, i) => `translate(0, ${24 + i * 25})`);
        keys.append("rect")
            .attr("width", 13)
            .attr("height", 13)
            .attr("rx", 2)
            .attr("fill", d => routeColor(d));
        keys.append("text")
            .attr("x", 19)
            .attr("y", 10)
            .attr("font-size", 11)
            .text(d => d);

        legend.append("text")
            .attr("y", 108)
            .attr("font-size", 11)
            .attr("font-weight", 700)
            .text("Opacity = Travel time");
    }

    function showTooltip(event, html) {
        tooltip.style("opacity", 1).html(html);
        moveTooltip(event);
    }

    function moveTooltip(event) {
        tooltip
            .style("left", `${event.pageX + 13}px`)
            .style("top", `${event.pageY + 13}px`);
    }

    function hideTooltip() {
        tooltip.style("opacity", 0);
    }

}).catch(error => {
    console.error("Failed to load the Lab 5 assignment:", error);
    d3.select("#load-status")
        .classed("error", true)
        .text("Loading failed. Start a local server from the project root and check the browser console for details.");
});
