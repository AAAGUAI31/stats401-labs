// Assignment 2：用散点图表示城市数据中的四个变量。
const width = 900;
const height = 560;

// 右侧预留足够空间放置颜色图例和大小图例。
const margin = { top: 40, right: 230, bottom: 75, left: 80 };

const tooltip = d3.select("#tooltip");
const errorMessage = d3.select("#chart-error");

// 使用 d3.csv，并将 population、temp_c 转换为数字。
d3.csv("../data/cities_multivariate.csv", d => ({
    city: d.city,
    population: +d.population,
    temp_c: +d.temp_c,
    development_level: d.development_level,
    region: d.region
}))
    .then(data => {
        const svg = d3.select("#chart")
            .append("svg")
            .attr("class", "chart-svg assignment-chart")
            .attr("viewBox", `0 0 ${width} ${height}`)
            .attr("role", "img")
            .attr("aria-label", "Scatterplot of city population and temperature, colored by region and sized by development level");

        // population（ratio）映射到横轴位置。
        const xScale = d3.scaleLinear()
            .domain([0, d3.max(data, d => d.population)])
            .nice()
            .range([margin.left, width - margin.right]);

        // temp_c（interval）映射到纵轴位置；SVG 的纵坐标范围需要反转。底下300几 上面是 40几
        const yScale = d3.scaleLinear()
            .domain(d3.extent(data, d => d.temp_c))
            .nice()
            .range([height - margin.bottom, margin.top]);

        // region（nominal）只表示类别，因此使用无顺序含义的离散颜色。
        const regions = ["North", "South", "East", "West"];
        const colorScale = d3.scaleOrdinal()
            .domain(regions)
            .range(["#3b82f6", "#ef4444", "#10b981", "#f59e0b"]);

        // development_level（ordinal）有 Low < Medium < High 的自然顺序。
        const developmentLevels = ["Low", "Medium", "High"];
        const sizeScale = d3.scaleOrdinal()
            .domain(developmentLevels)
            .range([7, 11, 15]);

        // 添加浅色网格线，帮助读者沿坐标轴比较位置。
        svg.append("g")
            .attr("class", "grid")
            .attr("transform", `translate(0, ${height - margin.bottom})`)
            .call(d3.axisBottom(xScale).tickSize(-(height - margin.top - margin.bottom)).tickFormat(""));

        svg.append("g")
            .attr("class", "grid")
            .attr("transform", `translate(${margin.left}, 0)`)
            .call(d3.axisLeft(yScale).tickSize(-(width - margin.left - margin.right)).tickFormat(""));

        // 添加两条数值坐标轴。
        svg.append("g")
            .attr("class", "axis")
            .attr("transform", `translate(0, ${height - margin.bottom})`)
            .call(d3.axisBottom(xScale).ticks(7));

        svg.append("g")
            .attr("class", "axis")
            .attr("transform", `translate(${margin.left}, 0)`)
            .call(d3.axisLeft(yScale));

        svg.append("text")
            .attr("class", "axis-label")
            .attr("x", (margin.left + width - margin.right) / 2)
            .attr("y", height - 22)
            .attr("text-anchor", "middle")
            .text("Population (millions)");

        svg.append("text")
            .attr("class", "axis-label")
            .attr("transform", "rotate(-90)")
            .attr("x", -(margin.top + height - margin.bottom) / 2)  //旋转之后 高度变化 是颠倒的 所以是x 控制 垂直高度
            .attr("y", 24)
            .attr("text-anchor", "middle")
            .text("Average Temperature (°C)");

        // 每个圆点代表一座城市，并同时编码四个必需变量。
        svg.selectAll(".city-point")
            .data(data)  //针对所有数据
            .join("circle")   //新建 圆圈
            .attr("class", "city-point")
            .attr("cx", d => xScale(d.population))
            .attr("cy", d => yScale(d.temp_c))
            .attr("r", d => sizeScale(d.development_level))
            .attr("fill", d => colorScale(d.region))
            .attr("fill-opacity", 0.78)
            .attr("stroke", "#ffffff")
            .attr("stroke-width", 1.5)
            .on("mouseover", function (event, d) {
                d3.select(this)
                    .attr("fill-opacity", 1)
                    .attr("stroke", "#111827")
                    .attr("stroke-width", 2.5);

                // tooltip 使读者可以识别城市并查看四个变量的精确值。
                tooltip
                    .style("opacity", 1)
                    .html(`<strong>${d.city}</strong><br>
                        Population: ${d.population} million<br>
                        Temperature: ${d.temp_c} °C<br>
                        Development: ${d.development_level}<br>
                        Region: ${d.region}`);
            })
            .on("mousemove", event => {
                tooltip
                    .style("left", `${event.pageX + 12}px`)
                    .style("top", `${event.pageY + 12}px`);
            })
            .on("mouseout", function () {
                d3.select(this)
                    .attr("fill-opacity", 0.78)
                    .attr("stroke", "#ffffff")
                    .attr("stroke-width", 1.5);
                tooltip.style("opacity", 0);
            });

        // 颜色图例：解释 region 与颜色的对应关系。
        const regionLegend = svg.append("g")
            .attr("class", "legend")
            .attr("transform", `translate(${width - margin.right + 45}, 60)`);

        regionLegend.append("text")
            .attr("class", "legend-title")
            .text("Region (color)");

        const regionItems = regionLegend.selectAll(".region-item")
            .data(regions)
            .join("g")
            .attr("class", "legend-item region-item")
            .attr("transform", (d, i) => `translate(0, ${30 + i * 30})`);

        regionItems.append("circle")
            .attr("r", 7)
            .attr("fill", d => colorScale(d));

        regionItems.append("text")
            .attr("x", 15)
            .attr("y", 4)
            .text(d => d);

        // 大小图例：解释 development level 与圆点半径的对应关系。
        const sizeLegend = svg.append("g")
            .attr("class", "legend")
            .attr("transform", `translate(${width - margin.right + 45}, 245)`);

        sizeLegend.append("text")
            .attr("class", "legend-title")
            .text("Development (size)");

        const sizeItems = sizeLegend.selectAll(".size-item")
            .data(developmentLevels)
            .join("g")
            .attr("class", "legend-item size-item")
            .attr("transform", (d, i) => `translate(15, ${40 + i * 48})`);

        sizeItems.append("circle")
            .attr("r", d => sizeScale(d))
            .attr("fill", "#94a3b8")
            .attr("fill-opacity", 0.75);

        sizeItems.append("text")
            .attr("x", 25)
            .attr("y", 4)
            .text(d => d);
    })
    .catch(error => {
        console.error("Unable to load cities_multivariate.csv:", error);
        errorMessage
            .text("The city data could not be loaded. Please open this page through a local server or GitHub Pages.")
            .attr("hidden", null);
    });
