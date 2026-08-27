// Lab 2（Task 4–12）：用一个散点图同时编码四个学生变量。
const width = 800;
const height = 500;

// 留出坐标轴标签和右侧图例的空间。
const margin = { top: 40, right: 190, bottom: 70, left: 70 };

// Task 11：页面中唯一的提示框，悬停数据点时更新其内容和位置。
const tooltip = d3.select("#tooltip");
const errorMessage = d3.select("#chart-error");

// Task 4：加载 CSV，并把数值列从字符串转换为数字。
d3.csv("../data/students_multivariate.csv", d => ({
    name: d.name,
    study_hours: +d.study_hours,
    score: +d.score,
    major: d.major,
    year: d.year
}))
    .then(data => {
        // Task 6：建立 SVG 画布，之后所有坐标轴、点和图例都附加在这里。
        const svg = d3.select("#chart")
            .append("svg")
            .attr("class", "chart-svg")
            .attr("viewBox", `0 0 ${width} ${height}`)
            .attr("role", "img")
            .attr("aria-label", "学习时长、考试成绩、专业和年级的多变量散点图");

        // Task 5：连续比例尺将数据值映射为 SVG 像素位置。
        const xScale = d3.scaleLinear()
            .domain(d3.extent(data, d => d.study_hours))
            .nice()
            .range([margin.left, width - margin.right]);

        // SVG 的 y 值向下增大，因此这里将范围反转，让高分显示在上方。
        const yScale = d3.scaleLinear()
            .domain(d3.extent(data, d => d.score))
            .nice()
            .range([height - margin.bottom, margin.top]);

        // Task 8：专业是类别变量，用颜色区分。
        const majors = Array.from(new Set(data.map(d => d.major)));
        const colorScale = d3.scaleOrdinal().domain(majors).range(d3.schemeTableau10);

        // Task 9：年级有明确顺序，用不同半径编码。
        const sizeScale = d3.scaleOrdinal()
            .domain(["Freshman", "Sophomore", "Junior", "Senior"])
            .range([5, 7, 9, 11]);

        // Task 6：添加 x、y 坐标轴及其文字标签。
        svg.append("g")
            .attr("class", "axis")
            .attr("transform", `translate(0, ${height - margin.bottom})`)
            .call(d3.axisBottom(xScale));  
            // 添加坐标轴 刻度

        svg.append("g")
            .attr("class", "axis")
            .attr("transform", `translate(${margin.left}, 0)`)
            .call(d3.axisLeft(yScale));

        svg.append("text")
            .attr("class", "axis-label")
            .attr("x", (margin.left + width - margin.right) / 2)
            .attr("y", height - 20)
            .attr("text-anchor", "middle")
            .text("Study Hours");

        svg.append("text")
            .attr("class", "axis-label")
            .attr("transform", "rotate(-90)")
            .attr("x", -height / 2)
            .attr("y", 20)
            .attr("text-anchor", "middle")
            .text("Exam Score");

        // Task 7–9：每个圆点代表一名学生；位置、颜色、大小分别编码三个通道。
        svg.selectAll(".student-point")
            .data(data)
            .join("circle")
            .attr("class", "student-point")
            .attr("cx", d => xScale(d.study_hours))
            .attr("cy", d => yScale(d.score))
            .attr("r", d => sizeScale(d.year))
            .attr("fill", d => colorScale(d.major))
            .attr("opacity", 0.82)
            .on("mouseover", function (event, d) {
                // Task 11：显示不适合直接写在图上的精确数值。
                d3.select(this).attr("stroke", "#111827").attr("stroke-width", 2);
                tooltip.style("opacity", 1).html(`<strong>${d.name}</strong><br>Study Hours: ${d.study_hours}<br>Score: ${d.score}<br>Major: ${d.major}<br>Year: ${d.year}`);
            })
            .on("mousemove", event => {
                tooltip.style("left", `${event.pageX + 12}px`).style("top", `${event.pageY + 12}px`);
            })
            .on("mouseout", function () {
                d3.select(this).attr("stroke", null);
                tooltip.style("opacity", 0);
            });

        // Task 10：图例解释“颜色 = 专业”的视觉编码。
        const legend = svg.append("g")
            .attr("class", "legend")
            .attr("transform", `translate(${width - margin.right + 28}, 65)`);

        legend.append("text").attr("class", "legend-title").text("Major");

        const legendItems = legend.selectAll(".legend-item")
            .data(majors)
            .join("g")
            .attr("class", "legend-item")
            .attr("transform", (d, i) => `translate(0, ${24 + i * 28})`);

        legendItems.append("circle").attr("r", 6).attr("fill", d => colorScale(d));
        legendItems.append("text").attr("x", 12).attr("y", 4).text(d => d);
    })
    .catch(error => {
        // 网络或 CSV 路径出错时，在页面中给出明确提示，方便排查。
        console.error("无法加载 students_multivariate.csv:", error);
        errorMessage.text("Chart data could not be loaded. Please run the page through a local server or GitHub Pages.").attr("hidden", null);
    });
