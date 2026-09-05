const DATA_URL = "../data/lab4_sentiment_by_author.csv";
const SENTIMENTS = ["Negative", "Neutral", "Positive"];
const AUTHORS = ["Customer", "Support"];
const COLORS = { Negative: "#d95d55", Neutral: "#738399", Positive: "#1d9a78" };
const formatCount = d3.format(",");
const formatPercent = d3.format(".1%");
const formatScore = d3.format("+.3f");

function parseRow(row) {
    return {
        authorType: row.author_type,
        sentiment: row.sentiment,
        count: +row.count,
        share: +row.share,
        averageScore: +row.average_score
    };
}

function groupedRows(data) {
    return AUTHORS.map(authorType => {
        const matches = data.filter(row => row.authorType === authorType);
        const lookup = new Map(matches.map(row => [row.sentiment, row]));
        return {
            authorType,
            total: d3.sum(matches, row => row.count),
            values: SENTIMENTS.map(sentiment => lookup.get(sentiment) || {
                authorType, sentiment, count: 0, share: 0, averageScore: 0
            })
        };
    });
}

function renderLegend() {
    d3.select(".sentiment-legend").selectAll("span")
        .data(SENTIMENTS).join("span")
        .html(sentiment => `<i style="background:${COLORS[sentiment]}"></i>${sentiment}`);
}

function updateSummary(groups) {
    const totals = new Map(groups.map(group => [group.authorType, group.total]));
    d3.select("#clean-count").text(formatCount(d3.sum(groups, group => group.total)));
    d3.select("#customer-count").text(formatCount(totals.get("Customer") || 0));
    d3.select("#support-count").text(formatCount(totals.get("Support") || 0));
}

function groupAverage(group) {
    return d3.sum(group.values, row => row.averageScore * row.count) / group.total;
}

function updateAnalysis(groups) {
    const summaries = groups.map(group => ({
        author: group.authorType,
        leading: d3.greatest(group.values, row => row.share),
        average: groupAverage(group)
    }));
    const customer = summaries.find(item => item.author === "Customer");
    const support = summaries.find(item => item.author === "Support");
    const comparison = support.average >= customer.average ? "higher" : "lower";
    d3.select("#observed-pattern").text(
        `${customer.leading.sentiment} is the largest customer category ` +
        `(${formatPercent(customer.leading.share)}), while ${support.leading.sentiment} is ` +
        `largest among support replies (${formatPercent(support.leading.share)}). ` +
        `Support has a ${comparison} mean sentiment score (${formatScore(support.average)}) ` +
        `than customers (${formatScore(customer.average)}).`
    );
}

function renderChart(groups) {
    const container = d3.select("#sentiment-chart");
    container.selectAll("*").remove();
    const availableWidth = Math.max(320, container.node().clientWidth || 760);
    const margin = { top: 30, right: 24, bottom: 54, left: availableWidth < 560 ? 86 : 116 };
    const innerWidth = availableWidth - margin.left - margin.right;
    const innerHeight = 220;
    const height = innerHeight + margin.top + margin.bottom;
    const svg = container.append("svg")
        .attr("viewBox", `0 0 ${availableWidth} ${height}`)
        .attr("role", "img")
        .attr("aria-labelledby", "sentiment-svg-title sentiment-svg-description");

    svg.append("title").attr("id", "sentiment-svg-title")
        .text("Predicted sentiment distribution by author type");
    svg.append("desc").attr("id", "sentiment-svg-description")
        .text("Two horizontal stacked bars compare negative, neutral, and positive sentiment shares for customer and support tweets.");

    const plot = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);
    const x = d3.scaleLinear().domain([0, 1]).range([0, innerWidth]);
    const y = d3.scaleBand().domain(AUTHORS).range([0, innerHeight]).padding(0.36);
    plot.append("g").attr("class", "lab4-grid")
        .call(d3.axisBottom(x).ticks(5).tickSize(innerHeight).tickFormat(""));
    plot.append("g").attr("class", "lab4-y-axis")
        .call(d3.axisLeft(y).tickSize(0)).call(group => group.select(".domain").remove());
    plot.append("g").attr("class", "lab4-x-axis").attr("transform", `translate(0,${innerHeight})`)
        .call(d3.axisBottom(x).ticks(5).tickFormat(d3.format(".0%")))
        .call(group => group.select(".domain").remove());

    const tooltip = d3.select("#lab4-tooltip");
    groups.forEach(group => {
        let start = 0;
        group.values.forEach(row => {
            const end = start + row.share;
            const segment = plot.append("rect").datum(row)
                .attr("class", "sentiment-segment").attr("x", x(start))
                .attr("y", y(group.authorType)).attr("width", Math.max(0, x(end) - x(start)))
                .attr("height", y.bandwidth()).attr("fill", COLORS[row.sentiment])
                .attr("tabindex", 0)
                .attr("aria-label", `${group.authorType}, ${row.sentiment}: ${formatPercent(row.share)}, ${formatCount(row.count)} tweets`);

            if (row.share >= 0.085) {
                plot.append("text").attr("class", "segment-label")
                    .attr("x", x((start + end) / 2)).attr("y", y(group.authorType) + y.bandwidth() / 2)
                    .text(formatPercent(row.share));
            }

            function showTooltip(event) {
                tooltip.attr("aria-hidden", "false").style("opacity", 1)
                    .html(`<strong>${row.authorType} · ${row.sentiment}</strong>` +
                        `<span>${formatCount(row.count)} tweets · ${formatPercent(row.share)}</span>` +
                        `<span>Mean score in segment: ${formatScore(row.averageScore)}</span>`);
                const box = event.currentTarget.getBoundingClientRect();
                const left = event.type === "focus" ? box.left : event.clientX + 14;
                const top = event.type === "focus" ? box.bottom + 8 : event.clientY - 24;
                tooltip.style("left", `${left}px`).style("top", `${top}px`);
            }
            function hideTooltip() {
                tooltip.attr("aria-hidden", "true").style("opacity", 0);
            }
            segment.on("mouseenter focus", showTooltip).on("mousemove", showTooltip)
                .on("mouseleave blur", hideTooltip);
            start = end;
        });
    });

    svg.append("text").attr("class", "lab4-axis-title")
        .attr("x", margin.left + innerWidth / 2).attr("y", height - 5)
        .attr("text-anchor", "middle").text("Share of tweets within author group");
}

let chartData = null;
let resizeTimer = null;
renderLegend();
d3.csv(DATA_URL, parseRow).then(data => {
    if (!data.length) throw new Error("The aggregate CSV is empty.");
    chartData = groupedRows(data);
    updateSummary(chartData);
    updateAnalysis(chartData);
    renderChart(chartData);
    d3.select("#chart-status").text("Hover or focus a segment for counts and model scores.");
}).catch(error => {
    console.error(error);
    d3.select("#chart-status").classed("error", true)
        .text("The processed sentiment data could not be loaded. Run clean_tweets.py, then reload this page.");
});

window.addEventListener("resize", () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => { if (chartData) renderChart(chartData); }, 160);
});
