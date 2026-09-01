const dataPath = "../data/lab3_moto_data_2023_2025.csv";
const columns = ["year", "name", "rating", "category", "engine", "detail_url"];
const labels = { year: "Year", name: "Model", rating: "Rating", category: "Category", engine: "Engine", detail_url: "Details" };

const state = {
    // 页面交互状态：当前筛选结果、排序列/方向，以及当前页码。
    data: [], filteredData: [], sortColumn: "year", ascending: true,
    page: 1, pageSize: 50, query: "", year: "all", category: "all"
};

const numberFormat = d3.format(",");
const table = d3.select("#data-table");

d3.csv(dataPath, row => ({
    year: +row.year,
    name: row.name.trim(),
    rating: row.rating.trim(),
    category: row.category.trim(),
    engine: row.engine.trim(),
    detail_url: row.detail_url.trim()
}))
    .then(data => {
        state.data = data;
        state.filteredData = [...data];
        populateSummary(data);
        populateFilters(data);
        drawCategoryChart(data);
        buildTableHeader();
        connectControls();
        applyFiltersAndRender();
    })
    .catch(error => {
        console.error("Unable to load the Lab 3 motorcycle dataset:", error);
        d3.select("#table-status").text("Data unavailable");
        d3.select("#data-error").attr("hidden", null)
            .text("The dataset could not be loaded. Open this page through a local server or GitHub Pages.");
    });

function populateSummary(data) {
    const yearCounts = d3.rollup(data, values => values.length, row => row.year);
    d3.select("#record-count").text(numberFormat(data.length));
    [2023, 2024, 2025].forEach(year => {
        d3.select(`#count-${year}`).text(numberFormat(yearCounts.get(year) || 0));
    });
    d3.select("#category-count").text(new Set(data.map(row => row.category)).size);
}

function populateFilters(data) {
    const years = [...new Set(data.map(row => row.year))].sort(d3.ascending);
    const categories = [...new Set(data.map(row => row.category))].sort(d3.ascending);
    d3.select("#year-filter").selectAll("option.year-option").data(years).join("option")
        .attr("class", "year-option").attr("value", year => year).text(year => year);
    d3.select("#category-filter").selectAll("option.category-option").data(categories).join("option")
        .attr("class", "category-option").attr("value", category => category).text(category => category);
}

function drawCategoryChart(data) {
    const categoryData = Array.from(
        d3.rollup(data, values => values.length, row => row.category),
        ([category, count]) => ({ category, count })
    ).sort((a, b) => d3.descending(a.count, b.count));
    const maxCount = d3.max(categoryData, row => row.count);
    const rows = d3.select("#category-chart").selectAll(".category-bar-row")
        .data(categoryData).join("div").attr("class", "category-bar-row");
    rows.append("div").attr("class", "category-bar-label").text(row => row.category);
    rows.append("div").attr("class", "category-bar-track").append("div")
        .attr("class", "category-bar-fill").style("width", row => `${(row.count / maxCount) * 100}%`);
    rows.append("div").attr("class", "category-bar-value").text(row => numberFormat(row.count));
}

function buildTableHeader() {
    table.select("thead").append("tr").selectAll("th").data(columns).join("th")
        .attr("scope", "col").append("button").attr("type", "button")
        .attr("class", "sort-button").attr("aria-label", column => `Sort by ${labels[column]}`)
        .on("click", (event, column) => {
            // 再次点击同一列就翻转升序/降序；点击新列则从升序开始。
            if (state.sortColumn === column) state.ascending = !state.ascending;
            else { state.sortColumn = column; state.ascending = true; }
            state.page = 1;
            renderTable();
        })
        .html(column => `<span>${labels[column]}</span><span class="sort-indicator" aria-hidden="true"></span>`);
}

function connectControls() {
    // 输入时立即更新关键词，并重新从第 1 页显示筛选后的结果。
    d3.select("#model-search").on("input", event => { state.query = event.target.value.trim().toLowerCase(); state.page = 1; applyFiltersAndRender(); });
    d3.select("#year-filter").on("change", event => { state.year = event.target.value; state.page = 1; applyFiltersAndRender(); });
    d3.select("#category-filter").on("change", event => { state.category = event.target.value; state.page = 1; applyFiltersAndRender(); });
    d3.select("#page-size").on("change", event => { state.pageSize = +event.target.value; state.page = 1; renderTable(); });
    d3.select("#previous-page").on("click", () => { state.page = Math.max(1, state.page - 1); renderTable(); });
    d3.select("#next-page").on("click", () => { state.page = Math.min(pageCount(), state.page + 1); renderTable(); });
}

function applyFiltersAndRender() {
    state.filteredData = state.data.filter(row => {
        // 搜索不区分大小写，且会检查车型名称、类别和发动机三个字段。
        const matchesQuery = !state.query || [row.name, row.category, row.engine]
            .some(value => value.toLowerCase().includes(state.query));
        return matchesQuery
            && (state.year === "all" || row.year === +state.year)
            && (state.category === "all" || row.category === state.category);
    });
    renderTable();
}

function pageCount() { return Math.max(1, Math.ceil(state.filteredData.length / state.pageSize)); }

function renderTable() {
    // 先复制筛选结果再排序，避免改变原始数据 state.data 的顺序。
    const direction = state.ascending ? 1 : -1;
    const sorted = [...state.filteredData].sort((a, b) => {
        const first = a[state.sortColumn];
        const second = b[state.sortColumn];
        // year 已转成数字；其余字段以字母顺序比较，direction 控制方向。
        return direction * (state.sortColumn === "year"
            ? d3.ascending(first, second)
            : d3.ascending(String(first).toLowerCase(), String(second).toLowerCase()));
    });
    state.page = Math.min(state.page, pageCount());
    const start = (state.page - 1) * state.pageSize;
    const pageData = sorted.slice(start, start + state.pageSize);
    const rows = table.select("tbody").selectAll("tr.data-row")
        .data(pageData, row => row.detail_url).join("tr").attr("class", "data-row");

    rows.selectAll("td").data(row => columns.map(column => ({ column, value: row[column] }))).join("td")
        .each(function (cell) {
            const td = d3.select(this);
            td.selectAll("*").remove();
            td.text(null);
            if (cell.column === "detail_url") {
                td.append("a").attr("href", cell.value).attr("target", "_blank")
                    .attr("rel", "noopener noreferrer").text("View model");
            } else if (cell.column === "rating" && ["-", "Show rating"].includes(cell.value)) {
                td.append("span").attr("class", "muted-value").text("Not listed");
            } else td.text(cell.value);
        });

    const emptyRow = table.select("tbody").selectAll("tr.empty-row")
        .data(pageData.length ? [] : [null]).join("tr").attr("class", "empty-row");
    emptyRow.selectAll("td").data([null]).join("td").attr("colspan", columns.length)
        .text("No motorcycle records match these filters.");

    table.selectAll(".sort-button")
        .attr("aria-sort", column => column === state.sortColumn ? (state.ascending ? "ascending" : "descending") : "none")
        .select(".sort-indicator").text(column => column === state.sortColumn ? (state.ascending ? "▲" : "▼") : "↕");
    const visibleStart = state.filteredData.length ? start + 1 : 0;
    const visibleEnd = Math.min(start + state.pageSize, state.filteredData.length);
    d3.select("#table-status").text(`Showing ${numberFormat(visibleStart)}–${numberFormat(visibleEnd)} of ${numberFormat(state.filteredData.length)} records`);
    d3.select("#page-indicator").text(`Page ${state.page} of ${pageCount()}`);
    d3.select("#previous-page").property("disabled", state.page === 1);
    d3.select("#next-page").property("disabled", state.page === pageCount());
}
