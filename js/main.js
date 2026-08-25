
// 检查是否引入成功 可以看F12的console :)
console.log("Hello STATS 401!");
console.log("D3 version:", d3.version);

const message = d3.select("#message");

if (!message.empty()) {
    message.text("This text was changed using D3!");
}



async function drawStudentScores() {
    const chart = d3.select("#chart");

    if (chart.empty()) {
        return;
    }

    try {
        const data = await d3.csv("../data/students.csv", d => ({
            name: d.name,
            score: +d.score
        }));

        const width = 800;
        const height = 420;
        const margin = { top: 30, right: 20, bottom: 80, left: 20 };
        const innerWidth = width - margin.left - margin.right;
        const innerHeight = height - margin.top - margin.bottom;

        const x = d3.scaleBand()
            .domain(data.map(d => d.name))
            .range([0, innerWidth])
            .padding(0.25);

        const y = d3.scaleLinear()
            .domain([0, 100])
            .range([innerHeight, 0]);

        const svg = chart.append("svg")
            .attr("class", "chart-svg")
            .attr("viewBox", `0 0 ${width} ${height}`)
            .attr("role", "img")
            .attr("aria-label", "Bar chart of student scores");

        const plot = svg.append("g")
            .attr("transform", `translate(${margin.left},${margin.top})`);

        plot.selectAll("rect")
            .data(data)
            .join("rect")
            .attr("class", "bar")
            .attr("x", d => x(d.name))
            .attr("y", d => y(d.score))
            .attr("width", x.bandwidth())
            .attr("height", d => innerHeight - y(d.score));

        plot.selectAll(".score-label")
            .data(data)
            .join("text")
            .attr("class", "score-label")
            .attr("x", d => x(d.name) + x.bandwidth() / 2)
            .attr("y", innerHeight + 24)
            .attr("text-anchor", "middle")
            .text(d => d.score);

        plot.selectAll(".name-label")
            .data(data)
            .join("text")
            .attr("class", "name-label")
            .attr("x", d => x(d.name) + x.bandwidth() / 2)
            .attr("y", innerHeight + 48)
            .attr("text-anchor", "middle")
            .text(d => d.name);
    } catch (error) {
        console.error("Could not load student data:", error);
        chart.append("p")
            .attr("class", "error")
            .text("The data could not be loaded. Run this site through a local web server.");
    }
}

drawStudentScores();
