/*
 * Lab 5 Task 1–16：D3 交互式网络可视化演示
 * 数据：10 名成员组成的无向协作网络。
 * 注意：CSV 必须通过 HTTP 服务器加载，不能直接双击用 file:// 打开。
 */

// Task 1：同时加载节点表和连线表，并在读取时完成数值类型转换。
Promise.all([
    d3.csv("../data/lab5_small_nodes.csv", d => ({
        id: d.id,
        name: d.name,
        group: d.group,
        activity_count: +d.activity_count,
        level: +d.level
    })),
    d3.csv("../data/lab5_small_links.csv", d => ({
        source: d.source,
        target: d.target,
        weight: +d.weight,
        type: d.type
    }))
]).then(([nodes, links]) => {
    // 基本数据检查可以尽早暴露 CSV 路径或列名错误。
    if (!nodes.length || !links.length) {
        throw new Error("节点或连线数据为空。");
    }

    // Task 2：创建节点—连线图的 SVG。
    const width = 900;
    const height = 600;
    const svg = d3.select("#chart")
        .append("svg")
        .attr("viewBox", `0 0 ${width} ${height}`)
        .attr("role", "img")
        .attr("aria-label", "大学项目成员关系的力导向网络图");

    // Task 7–10：为节点和连线属性建立视觉编码比例尺。
    const sizeScale = d3.scaleSqrt()
        .domain(d3.extent(nodes, d => d.activity_count))
        .range([8, 20]);

    const groups = [...new Set(nodes.map(d => d.group))];
    const nodeColor = d3.scaleOrdinal()
        .domain(groups)
        .range(d3.schemeTableau10);

    const linkTypes = [...new Set(links.map(d => d.type))];
    const linkColor = d3.scaleOrdinal()
        .domain(linkTypes)
        .range(d3.schemeSet2);

    const linkWidth = d3.scaleLinear()
        .domain(d3.extent(links, d => d.weight))
        .range([1.5, 7]);

    const tooltip = d3.select("#tooltip");

    // Task 4：先画连线，保证节点显示在连线之上。
    const link = svg.append("g")
        .attr("class", "links")
        .selectAll("line")
        .data(links)
        .join("line")
        .attr("stroke", d => linkColor(d.type))
        .attr("stroke-width", d => linkWidth(d.weight))
        .attr("stroke-opacity", 0.65)
        .attr("stroke-linecap", "round");

    // Task 5、7、8：每条节点记录对应一个圆，半径和颜色分别编码两个属性。
    const node = svg.append("g")
        .attr("class", "nodes")
        .selectAll("circle")
        .data(nodes)
        .join("circle")
        .attr("class", "node")
        .attr("r", d => sizeScale(d.activity_count))
        .attr("fill", d => nodeColor(d.group))
        .attr("stroke", "white")
        .attr("stroke-width", 2);

    // Task 11：添加姓名标签；标签本身不拦截鼠标事件。
    const label = svg.append("g")
        .attr("class", "labels")
        .selectAll("text")
        .data(nodes)
        .join("text")
        .text(d => d.name)
        .attr("dx", d => sizeScale(d.activity_count) + 5)
        .attr("dy", "0.35em")
        .attr("font-size", 12)
        .attr("fill", "#253047");

    // Task 3：连接力、排斥力、中心力和碰撞力共同决定节点位置。
    const simulation = d3.forceSimulation(nodes)
        .force("link", d3.forceLink(links).id(d => d.id).distance(115))
        .force("charge", d3.forceManyBody().strength(-320))
        .force("center", d3.forceCenter(width / 2, height / 2))
        .force("collision", d3.forceCollide().radius(d => sizeScale(d.activity_count) + 24));

    // Task 6：每次模拟迭代都同步更新线端点、圆心和文字位置。
    simulation.on("tick", () => {
        link
            .attr("x1", d => d.source.x)
            .attr("y1", d => d.source.y)
            .attr("x2", d => d.target.x)
            .attr("y2", d => d.target.y);

        node
            .attr("cx", d => d.x)
            .attr("cy", d => d.y);

        label
            .attr("x", d => d.x)
            .attr("y", d => d.y);
    });

    // Task 12：拖动时临时固定节点，结束后释放给模拟器继续布局。
    node.call(d3.drag()
        .on("start", (event, d) => {
            if (!event.active) simulation.alphaTarget(0.3).restart();
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

    // forceLink 会把 source/target 字符串替换成节点对象，此函数兼容两种状态。
    const endpointId = endpoint => typeof endpoint === "object" ? endpoint.id : endpoint;

    // 用 Set 保存邻接关系，比每次悬停都扫描全部连线更直接。
    const adjacency = new Set();
    links.forEach(d => {
        const source = endpointId(d.source);
        const target = endpointId(d.target);
        adjacency.add(`${source}|${target}`);
        adjacency.add(`${target}|${source}`);
    });
    const isConnected = (a, b) => adjacency.has(`${a.id}|${b.id}`);

    // Task 13、14：悬停时突出当前节点及其邻居，同时显示详细信息。
    node
        .on("mouseenter", (event, d) => {
            node.attr("opacity", other => other.id === d.id || isConnected(d, other) ? 1 : 0.14);
            label.attr("opacity", other => other.id === d.id || isConnected(d, other) ? 1 : 0.14);
            link.attr("stroke-opacity", edge =>
                endpointId(edge.source) === d.id || endpointId(edge.target) === d.id ? 1 : 0.08
            );

            tooltip
                .style("opacity", 1)
                .html(
                    `<strong>${d.name}</strong><br>` +
                    `组别：${d.group}<br>` +
                    `活动次数：${d.activity_count}<br>` +
                    `级别：${d.level}`
                );
        })
        .on("mousemove", event => moveTooltip(event))
        .on("mouseleave", () => {
            node.attr("opacity", 1);
            label.attr("opacity", 1);
            link.attr("stroke-opacity", 0.65);
            hideTooltip();
        });

    drawNetworkLegend(svg, nodeColor, linkColor, groups, linkTypes);
    drawAdjacencyMatrix(nodes, links, endpointId, linkColor, tooltip);

    // 把提示框放在指针右下方，避免挡住当前图形。
    function moveTooltip(event) {
        tooltip
            .style("left", `${event.pageX + 12}px`)
            .style("top", `${event.pageY + 12}px`);
    }

    function hideTooltip() {
        tooltip.style("opacity", 0);
    }

}).catch(error => {
    // 页面内显示友好提示，同时保留控制台中的原始错误便于调试。
    console.error("Lab 5 数据加载失败：", error);
    d3.select("#status")
        .style("display", "block")
        .text("数据加载失败。请从项目根目录启动本地服务器后再打开 lab5/lab5task.html。详情请查看浏览器控制台。");
});

/* 绘制节点颜色和连线颜色图例，明确说明视觉编码。 */
function drawNetworkLegend(svg, nodeColor, linkColor, groups, linkTypes) {
    const legend = svg.append("g")
        .attr("class", "legend")
        .attr("transform", "translate(20, 24)");

    legend.append("text")
        .attr("font-weight", 700)
        .text("节点组别");

    const groupLegend = legend.selectAll(".group-key")
        .data(groups)
        .join("g")
        .attr("class", "group-key")
        .attr("transform", (d, i) => `translate(0, ${20 + i * 22})`);

    groupLegend.append("circle")
        .attr("r", 6)
        .attr("fill", d => nodeColor(d));
    groupLegend.append("text")
        .attr("x", 12)
        .attr("dy", "0.35em")
        .text(d => d);

    const linkStartY = 38 + groups.length * 22;
    legend.append("text")
        .attr("y", linkStartY)
        .attr("font-weight", 700)
        .text("关系类型");

    const linkLegend = legend.selectAll(".link-key")
        .data(linkTypes)
        .join("g")
        .attr("class", "link-key")
        .attr("transform", (d, i) => `translate(0, ${linkStartY + 20 + i * 22})`);

    linkLegend.append("line")
        .attr("x1", 0)
        .attr("x2", 22)
        .attr("stroke-width", 4)
        .attr("stroke", d => linkColor(d));
    linkLegend.append("text")
        .attr("x", 30)
        .attr("dy", "0.35em")
        .text(d => d);
}

/* Task 16：把同一组无向网络数据转换为邻接矩阵并绘制。 */
function drawAdjacencyMatrix(nodes, links, endpointId, linkColor, tooltip) {
    const matrixSize = 500;
    const margin = { top: 105, right: 35, bottom: 35, left: 105 };
    const matrixSvg = d3.select("#matrix")
        .append("svg")
        .attr("viewBox", `0 0 ${matrixSize + margin.left + margin.right} ${matrixSize + margin.top + margin.bottom}`)
        .attr("role", "img")
        .attr("aria-label", "大学项目成员关系的邻接矩阵");

    const matrixGroup = matrixSvg.append("g")
        .attr("transform", `translate(${margin.left}, ${margin.top})`);

    const ids = nodes.map(d => d.id);
    const matrixX = d3.scaleBand().domain(ids).range([0, matrixSize]).padding(0.03);
    const matrixY = d3.scaleBand().domain(ids).range([0, matrixSize]).padding(0.03);
    const opacityScale = d3.scaleLinear()
        .domain(d3.extent(links, d => d.weight))
        .range([0.3, 1]);

    // 建立“端点对 → 连线”的索引，并同时写入两个方向，因为网络是无向的。
    const linkLookup = new Map();
    links.forEach(link => {
        const source = endpointId(link.source);
        const target = endpointId(link.target);
        linkLookup.set(`${source}|${target}`, link);
        linkLookup.set(`${target}|${source}`, link);
    });

    const matrixData = nodes.flatMap(rowNode =>
        nodes.map(colNode => ({
            row: rowNode,
            col: colNode,
            link: linkLookup.get(`${rowNode.id}|${colNode.id}`) || null
        }))
    );

    matrixGroup.selectAll("rect")
        .data(matrixData)
        .join("rect")
        .attr("x", d => matrixX(d.col.id))
        .attr("y", d => matrixY(d.row.id))
        .attr("width", matrixX.bandwidth())
        .attr("height", matrixY.bandwidth())
        .attr("rx", 2)
        .attr("fill", d => d.link ? linkColor(d.link.type) : "#edf0f4")
        .attr("fill-opacity", d => d.link ? opacityScale(d.link.weight) : 1)
        .on("mouseenter", (event, d) => {
            matrixGroup.selectAll("rect")
                .attr("opacity", cell =>
                    cell.row.id === d.row.id || cell.col.id === d.col.id ? 1 : 0.3
                );

            const relation = d.link
                ? `关系：${d.link.type}<br>强度：${d.link.weight}`
                : "两人之间没有直接关系";
            tooltip
                .style("opacity", 1)
                .html(`<strong>${d.row.name} × ${d.col.name}</strong><br>${relation}`);
        })
        .on("mousemove", event => {
            tooltip
                .style("left", `${event.pageX + 12}px`)
                .style("top", `${event.pageY + 12}px`);
        })
        .on("mouseleave", () => {
            matrixGroup.selectAll("rect").attr("opacity", 1);
            tooltip.style("opacity", 0);
        });

    // 顶部列标签旋转显示，左侧行标签水平显示。
    matrixGroup.selectAll(".column-label")
        .data(nodes)
        .join("text")
        .attr("class", "matrix-label column-label")
        .attr("x", d => matrixX(d.id) + matrixX.bandwidth() / 2)
        .attr("y", -8)
        .attr("transform", d => {
            const x = matrixX(d.id) + matrixX.bandwidth() / 2;
            return `rotate(-45, ${x}, -8)`;
        })
        .attr("text-anchor", "start")
        .text(d => d.name);

    matrixGroup.selectAll(".row-label")
        .data(nodes)
        .join("text")
        .attr("class", "matrix-label row-label")
        .attr("x", -8)
        .attr("y", d => matrixY(d.id) + matrixY.bandwidth() / 2)
        .attr("dy", "0.35em")
        .attr("text-anchor", "end")
        .text(d => d.name);
}
