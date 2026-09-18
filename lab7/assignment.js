// Lab 7 Assignment — Animated Temporal Commercial Network
// ========================================================
// 这份文件按照 Lab7.md 的 Assignment Part A–E 组织：
//
// Part A：建立 temporal node-link visualization
//   1. 读取 company 与 transaction 两份 CSV。
//   2. 用 d3.forceSimulation() 建立网络布局。
//   3. showDay(day) 根据当前日期筛选并更新连线。
//
// Part B：计算 dynamic node activity
//   4. 汇总每家公司当天的 transaction volume。
//   5. 用节点大小表示 volume，用透明度区分 active / inactive 公司。
//
// Part C：建立 controllable animation
//   6. 使用 D3 join 让新增连线 fade in、消失连线 fade out。
//   7. 提供 Play、Pause、Reset 和 60-day slider。
//
// Part D：Preserve the mental map
//   8. 60 天都重复使用同一组 company node objects。
//   9. 用固定的 region anchors 和较低 alpha，避免节点每天完全重排。
//
// Part E：回答 temporal-network questions
//  10. 本文件建立 60-day connectivity overview；五个问题的英文结论
//      写在 index.html 的 “Temporal-network findings” 区域。

// Step 0：设定画布尺寸、格式化函数和 tooltip 容器。
const width = 960;
const height = 600;
const formatDate = d3.timeFormat("%B %-d, %Y");
const formatMoney = d3.format("$,.0f");
const tooltip = d3.select("#tooltip");

// 这些变量保存读取后的资料，以及动画目前所在的状态。
let companies = [];
let transactions = [];
let currentDay = 1;
let currentLinks = [];
let linkSelection;
let nodeSelection;
let timer = null;

// Step 1：定义视觉编码（对应 Requirements 5、6、15）。
// node fill：sector；node outline：region；link color：transaction type。
const sectorColor = d3.scaleOrdinal(d3.schemeTableau10);
const regionColor = d3.scaleOrdinal()
  .domain(["Asia", "Europe", "North America"])
  .range(["#ef8a17", "#7c3aed", "#0891b2"]);
const typeColor = d3.scaleOrdinal()
  .domain(["goods", "shipping", "components", "materials", "services"])
  .range(["#2563eb", "#0f9d78", "#f59e0b", "#a855f7", "#e64980"]);

// 在 #network 容器内建立主要 SVG 网络图。
const svg = d3.select("#network")
  .append("svg")
  .attr("viewBox", `0 0 ${width} ${height}`)
  .attr("role", "img")
  .attr("aria-label", "Animated temporal commercial network");

// Part D：为三个地区指定稳定的水平位置。
// 节点仍然会受到 force 的影响，但每天不会突然移动到完全不同的位置。
const regionCenters = {
  Asia: { x: 205, y: height / 2 },
  Europe: { x: 480, y: height / 2 },
  "North America": { x: 755, y: height / 2 }
};

// 在画布上方标示三个地区，帮助读者理解节点轮廓颜色及空间分组。
svg.selectAll(".region-label")
  .data(Object.entries(regionCenters))
  .join("text")
  .attr("class", "region-label")
  .attr("x", d => d[1].x)
  .attr("y", 30)
  .attr("text-anchor", "middle")
  .text(d => d[0]);

// 连线图层放在节点图层下面，避免连线覆盖节点与文字。
const linkGroup = svg.append("g").attr("aria-label", "Commercial relationships");
const nodeGroup = svg.append("g").attr("aria-label", "Companies");

// Part A：连线力让当天有交易关系的公司靠近。
// transaction_count 越高，distance 越短，但设定最小缩短幅度以避免重叠。
const linkForce = d3.forceLink()
  .id(d => d.id)
  .distance(d => 145 - Math.min(45, d.transaction_count * 6))
  .strength(0.12);

// Part A / Requirement 4：建立 force-directed network。
// charge：让节点互相排斥；x/y：让节点靠近地区中心；collision：避免圆相互覆盖。
const simulation = d3.forceSimulation()
  .force("link", linkForce)
  .force("charge", d3.forceManyBody().strength(-300))
  .force("x", d3.forceX(d => regionCenters[d.region].x).strength(0.16))
  .force("y", d3.forceY(height / 2).strength(0.06))
  .force("collision", d3.forceCollide(d => (d.currentRadius || 13) + 8).iterations(2))
  .alphaDecay(0.045)
  .on("tick", ticked);

// Step 2：同时读取两份 assignment CSV。
// transaction CSV 的日期、day、amount 和 count 在读取时转换为正确类型。
Promise.all([
  d3.csv("../data/lab7_assignment_companies.csv"),
  d3.csv("../data/lab7_assignment_transactions_60days.csv", d => ({
    date: d3.timeParse("%Y-%m-%d")(d.date),
    day: +d.day,
    source: d.source,
    target: d.target,
    amount_usd: +d.amount_usd,
    transaction_type: d.transaction_type,
    transaction_count: +d.transaction_count
  }))
]).then(([companyRows, transactionRows]) => {
  // 把 company row 转成会被 simulation 持续重复使用的 node object。
  companies = companyRows.map((d, index) => ({
    ...d,
    // Part D：提供固定、可重复的初始位置，减少页面刚打开时的大幅移动。
    x: regionCenters[d.region].x + ((index % 3) - 1) * 30,
    y: 170 + (index % 4) * 95,
    currentVolume: 0,
    currentDegree: 0,
    currentRadius: 11
  }));
  transactions = transactionRows;

  sectorColor.domain([...new Set(companies.map(d => d.sector))]);

  // Step 3：根据全部 60 天资料设定比例尺的 domain。
  // node radius -> 当天交易额；link width -> amount；link opacity -> transaction count。
  const maximumNodeVolume = d3.max(d3.groups(transactions, d => d.day), ([, dayRows]) => {
    const volumes = calculateAllVolumes(dayRows);
    return d3.max(volumes.values());
  });
  sizeScale.domain([0, maximumNodeVolume]);
  amountScale.domain(d3.extent(transactions, d => d.amount_usd));
  opacityScale.domain(d3.extent(transactions, d => d.transaction_count));

  // 所有资料准备完成后，再依次建立节点、图例、overview，并显示 Day 1。
  buildNodes();
  buildLegends();
  buildActivityChart();
  showDay(1);
}).catch(error => {
  d3.select("#network").html(`<div class="error">The assignment data could not be loaded: ${error.message}</div>`);
});

// 使用 sqrt scale 表示圆的大小，避免交易额较大的节点视觉面积被过度放大。
const sizeScale = d3.scaleSqrt().range([10, 30]);
const amountScale = d3.scaleLinear().range([2, 10]);
const opacityScale = d3.scaleLinear().range([0.42, 0.94]);

// Part B：计算单一公司在当前 frame 的交易总额。
// 只要公司是 source 或 target，该笔交易额都会计入该公司的 activity。
function calculateVolume(companyId, links) {
  return d3.sum(
    links.filter(d => d.source === companyId || d.target === companyId),
    d => d.amount_usd
  );
}

// 一次计算所有公司的交易额，比对每家公司重复 filter 更有效率。
function calculateAllVolumes(links) {
  const volumes = new Map(companies.map(d => [d.id, 0]));
  links.forEach(d => {
    volumes.set(d.source, (volumes.get(d.source) || 0) + d.amount_usd);
    volumes.set(d.target, (volumes.get(d.target) || 0) + d.amount_usd);
  });
  return volumes;
}

// Step 4：建立 12 个公司节点（Requirement 5、13）。
// 节点只建立一次；切换日期时仅更新大小和透明度，因此 mental map 可以保留。
function buildNodes() {
  nodeSelection = nodeGroup.selectAll(".node")
    .data(companies, d => d.id)
    .join(enter => {
      // 每个 node 使用 <g> 包住 circle 与 label，并加入拖动和 tooltip 事件。
      const group = enter.append("g")
        .attr("class", "node")
        .call(drag(simulation))
        .on("mousemove", showNodeTooltip)
        .on("mouseleave", hideTooltip);

      // circle fill 编码 sector，stroke 编码 region。
      group.append("circle")
        .attr("r", 0)
        .attr("fill", d => sectorColor(d.sector))
        .attr("stroke", d => regionColor(d.region))
        .attr("stroke-width", 4)
        .transition()
        .duration(500)
        .attr("r", 11);

      // 圆内显示公司名称的第一个单词；完整名称可以从 tooltip 查看。
      group.append("text")
        .attr("class", "node-label")
        .attr("text-anchor", "middle")
        .attr("dy", 4)
        .text(d => shortName(d.company_name));

      return group;
    });

  simulation.nodes(companies);
}

// Step 5 / Part A + C：showDay(day) 是整个动画最核心的 frame function。
// 每次 slider 或 timer 改变日期时，按照以下顺序执行：
// 当前 day -> filter transactions -> calculate activity -> update joins
//             -> restart simulation -> update labels/summary。
function showDay(day) {
  // 保证 day 一定在 1–60 范围内，再取出当天交易。
  currentDay = Math.max(1, Math.min(60, +day));
  const rawLinks = transactions.filter(d => d.day === currentDay);
  const volumes = calculateAllVolumes(rawLinks);
  // degree 是公司当天连接的数量，用在 node tooltip 中。
  const degree = new Map(companies.map(d => [d.id, 0]));
  rawLinks.forEach(d => {
    degree.set(d.source, degree.get(d.source) + 1);
    degree.set(d.target, degree.get(d.target) + 1);
  });

  // Part B：把当天动态属性写回原本的 node objects。
  // 没有交易的公司保留一个小圆，方便用户继续追踪它的位置。
  companies.forEach(d => {
    d.currentVolume = volumes.get(d.id);
    d.currentDegree = degree.get(d.id);
    d.currentRadius = d.currentVolume ? sizeScale(d.currentVolume) : 9;
  });

  // 复制连线非常重要：forceLink 会把 source/target 的 id 字符串
  // 改成 node objects。复制后，原始 transactions 仍能在下一天正常筛选和计算。
  currentLinks = rawLinks.map(d => ({
    ...d,
    key: relationshipKey(d.source, d.target)
  }));

  // Part C / Requirements 7–8：使用 D3 data join 更新当天关系。
  // enter：新关系由透明变可见；update：更新颜色、宽度、透明度；
  // exit：消失关系淡出后删除。
  linkSelection = linkGroup.selectAll(".link")
    .data(currentLinks, d => d.key)
    .join(
      enter => enter.append("line")
        .attr("class", "link")
        .attr("stroke", d => typeColor(d.transaction_type))       // type -> color
        .attr("stroke-width", d => amountScale(d.amount_usd))    // amount -> width
        .attr("opacity", 0)
        .style("pointer-events", "stroke")
        .call(enter => enter.transition().duration(400)
          .attr("opacity", d => opacityScale(d.transaction_count))), // count -> opacity
      update => update.call(update => update.transition().duration(300)
        .attr("stroke", d => typeColor(d.transaction_type))
        .attr("stroke-width", d => amountScale(d.amount_usd))
        .attr("opacity", d => opacityScale(d.transaction_count))),
      exit => exit.transition().duration(400).attr("opacity", 0).remove()
    )
    .on("mousemove", showLinkTooltip)
    .on("mouseleave", hideTooltip);

  // Active 公司保持清晰并依据 volume 改变大小；inactive 公司变淡但不删除。
  const activeIds = new Set(rawLinks.flatMap(d => [d.source, d.target]));
  nodeSelection.transition().duration(350)
    .attr("opacity", d => activeIds.has(d.id) ? 1 : 0.23);
  nodeSelection.select("circle").transition().duration(350)
    .attr("r", d => d.currentRadius)
    .attr("stroke-width", d => activeIds.has(d.id) ? 5 : 3);

  // Part D / Requirement 14：只替换 linkForce 的 links，不重建 simulation。
  // 较低 alpha(0.28) 让布局温和调整，从而保存 mental map。
  linkForce.links(currentLinks);
  simulation
    .force("collision", d3.forceCollide(d => d.currentRadius + 8).iterations(2))
    .alpha(0.28)
    .restart();

  updateSummary(rawLinks, activeIds);
  updateActivityMarker();
}

// Step 6：更新 current day/date、active companies、active links、daily value 和 slider。
function updateSummary(rawLinks, activeIds) {
  const date = rawLinks[0]?.date || transactions.find(d => d.day === currentDay)?.date;
  const totalValue = d3.sum(rawLinks, d => d.amount_usd);

  d3.select("#day-label").text(`Day ${currentDay}`);
  d3.select("#date-label").text(formatDate(date));
  d3.select("#active-count").text(activeIds.size);
  d3.select("#link-count").text(rawLinks.length);
  d3.select("#total-value").text(formatMoney(totalValue));
  d3.select("#time-slider").property("value", currentDay);
}

// simulation 每次 tick 都调用这里，把计算出的坐标写入 SVG。
function ticked() {
  if (linkSelection) {
    linkSelection
      .attr("x1", d => d.source.x)
      .attr("y1", d => d.source.y)
      .attr("x2", d => d.target.x)
      .attr("y2", d => d.target.y);
  }

  if (nodeSelection) {
    // 同时限制节点坐标，避免它们跑出 SVG 边界。
    nodeSelection.attr("transform", d => {
      const radius = d.currentRadius || 11;
      d.x = Math.max(radius + 8, Math.min(width - radius - 8, d.x));
      d.y = Math.max(55 + radius, Math.min(height - radius - 10, d.y));
      return `translate(${d.x},${d.y})`;
    });
  }
}

// Step 7：允许用户拖动节点检查重叠关系；松开后节点重新参与 force layout。
function drag(sim) {
  return d3.drag()
    .on("start", (event, d) => {
      if (!event.active) sim.alphaTarget(0.2).restart();
      d.fx = d.x;
      d.fy = d.y;
    })
    .on("drag", (event, d) => {
      d.fx = event.x;
      d.fy = event.y;
    })
    .on("end", (event, d) => {
      if (!event.active) sim.alphaTarget(0);
      d.fx = null;
      d.fy = null;
    });
}

// Requirement 13：node tooltip 显示静态属性与当天动态 activity。
function showNodeTooltip(event, d) {
  tooltip
    .style("opacity", 1)
    .style("left", `${event.clientX + 14}px`)
    .style("top", `${event.clientY + 14}px`)
    .html(`<strong>${d.company_name}</strong><br>
      <span class="muted-tip">${d.sector} · ${d.region}</span><br>
      Day ${currentDay} volume: ${formatMoney(d.currentVolume)}<br>
      Active relationships: ${d.currentDegree}`);
}

// Requirement 13：link tooltip 显示两家公司、交易类型、金额和交易次数。
function showLinkTooltip(event, d) {
  const source = typeof d.source === "object" ? d.source : companies.find(n => n.id === d.source);
  const target = typeof d.target === "object" ? d.target : companies.find(n => n.id === d.target);
  tooltip
    .style("opacity", 1)
    .style("left", `${event.clientX + 14}px`)
    .style("top", `${event.clientY + 14}px`)
    .html(`<strong>${source.company_name} ↔ ${target.company_name}</strong><br>
      <span class="muted-tip">${titleCase(d.transaction_type)}</span><br>
      Amount: ${formatMoney(d.amount_usd)}<br>
      Transactions represented: ${d.transaction_count}`);
}

function hideTooltip() {
  tooltip.style("opacity", 0);
}

// Step 8 / Requirement 15：建立三组 legend，解释 node fill、outline 和 link color。
function buildLegends() {
  makeLegend("#sector-legend", sectorColor.domain(), sectorColor, "circle");
  makeLegend("#region-legend", regionColor.domain(), regionColor, "outline");
  makeLegend("#type-legend", typeColor.domain(), typeColor, "line");
}

function makeLegend(selector, values, color, kind) {
  const items = d3.select(selector).selectAll(".legend-item")
    .data(values)
    .join("div")
    .attr("class", "legend-item");

  items.append("span")
    .attr("class", kind === "line" ? "line-swatch" : "swatch")
    .style("background", kind === "outline" ? "white" : d => color(d))
    .style("border", kind === "outline" ? d => `3px solid ${color(d)}` : "none");
  items.append("span").text(d => titleCase(d));
}

// Step 9 / Part E：建立 60-day connectivity overview。
// 动画不容易比较相隔很远的时间点，所以用 bar chart 同时显示全部 60 天的 link 数。
let activityX;
let activityMarker;
function buildActivityChart() {
  // 每根 bar 代表一天，bar height 是当天 active link 数。
  const stats = d3.range(1, 61).map(day => ({
    day,
    links: transactions.filter(d => d.day === day).length
  }));
  const chartWidth = 330;
  const chartHeight = 130;
  const margin = { top: 8, right: 8, bottom: 26, left: 28 };
  const chart = d3.select("#activity-chart").append("svg")
    .attr("viewBox", `0 0 ${chartWidth} ${chartHeight}`);
  activityX = d3.scaleBand()
    .domain(stats.map(d => d.day))
    .range([margin.left, chartWidth - margin.right])
    .padding(0.12);
  const y = d3.scaleLinear()
    .domain([0, d3.max(stats, d => d.links)])
    .nice()
    .range([chartHeight - margin.bottom, margin.top]);

  chart.selectAll(".day-bar")
    .data(stats)
    .join("rect")
    .attr("class", "day-bar")
    .attr("x", d => activityX(d.day))
    .attr("y", d => y(d.links))
    .attr("width", activityX.bandwidth())
    .attr("height", d => y(0) - y(d.links))
    .attr("fill", "#cbd5e1")
    .style("cursor", "pointer")
    // overview 也可作为 navigation：点击 bar 直接检查指定日期。
    .on("click", (event, d) => {
      pause();
      showDay(d.day);
    });

  chart.append("g")
    .attr("transform", `translate(0,${chartHeight - margin.bottom})`)
    .call(d3.axisBottom(activityX).tickValues([1, 10, 20, 30, 40, 50, 60]).tickSizeOuter(0));
  chart.append("g")
    .attr("transform", `translate(${margin.left},0)`)
    .call(d3.axisLeft(y).ticks(3).tickSizeOuter(0));

  // 蓝色空心矩形标示当前动画所在的日期。
  activityMarker = chart.append("rect")
    .attr("y", margin.top)
    .attr("width", activityX.bandwidth() + 2)
    .attr("height", chartHeight - margin.top - margin.bottom)
    .attr("fill", "none")
    .attr("stroke", "#2457d6")
    .attr("stroke-width", 2);
}

function updateActivityMarker() {
  if (activityMarker) activityMarker.attr("x", activityX(currentDay) - 1);
}

// Step 10 / Part C：可控制的时间动画（Requirements 9–12）。
function play() {
  // 避免同时建立多个 timer；若已到 Day 60，则从 Day 1 重新播放。
  if (timer) return;
  if (currentDay >= 60) showDay(1);
  timer = d3.interval(() => {
    if (currentDay >= 60) {
      pause();
      return;
    }
    showDay(currentDay + 1);
  }, 850);
}

// 停止并清空 timer；这样下一次 Play 才能建立新的 timer。
function pause() {
  if (timer) {
    timer.stop();
    timer = null;
  }
}

// Reset 会先停止动画，再回到第一天。
function reset() {
  pause();
  showDay(1);
}

// Step 11：把 HTML controls 连接到上述函数。
d3.select("#play").on("click", play);
d3.select("#pause").on("click", pause);
d3.select("#reset").on("click", reset);
d3.select("#time-slider").on("input", function() {
  // 手动拖动 slider 时暂停自动播放，让用户可以仔细检查该日期。
  pause();
  showDay(+this.value);
});

// Undirected relationship 的 key 不考虑 source/target 顺序。
// 例如 c01-c02 和 c02-c01 会得到同一个 key，D3 才能正确识别 update。
function relationshipKey(source, target) {
  return [source, target].sort().join("--");
}

// 只在节点圆内显示较短名称，减少文字重叠。
function shortName(name) {
  const words = name.split(" ");
  return words.length > 1 ? words[0] : name;
}

// 将 CSV 中的小写类别转成适合 UI 显示的 Title Case。
function titleCase(value) {
  return value.replace(/\b\w/g, character => character.toUpperCase());
}
