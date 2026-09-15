/*
 * Lab 6 演示（Task 3–15）
 * 资料流：层级 JSON → d3.hierarchy() → layout 计算坐标 → SVG 图元。
 * Tree 使用 x/y；Treemap 使用 x0/x1/y0/y1。
 */

// Task 12：洲别属于类别资料，使用离散色标；名称要和 JSON 的顶层 children 一致。
const colors = d3.scaleOrdinal()
  .domain(["North America", "Europe", "Asia"])
  .range(d3.schemeTableau10);

// Task 13：页面只有一个 tooltip div，鼠标移到任意格子时复用它。
const tooltip = d3.select("#tooltip");

// Task 3：异步读取 Notebook Task 2 产生的层级 JSON。资料读完才开始画两张图。
d3.json("../data/lab6_small_hierarchy.json")
  .then(data => {
    // 两个函数各自以 data 建立 hierarchy；Tree 的折叠不会影响 Treemap。
    drawTree(data);
    drawTreemap(data);
  })
  .catch(error => {
    // 若直接双击 HTML，浏览器通常会阻挡 d3.json 的档案读取，因此要经由本地服务器开启。
    console.error(error);
    d3.select("#tree").append("p").attr("class", "error")
      .text("无法读取 data/lab6_small_hierarchy.json。请先在 Lab6_demo.ipynb 运行 Task 1 和 Task 2，并使用本地服务器打开本页。");
  });

/* Task 4–9：Node-link Tree。 */
function drawTree(data) {
  const width = 680;

  // Task 4：hierarchy 节点新增 data、parent、children、depth 等属性。
  // Task 5：sum() 把每座城市的 value（人口）向上汇总给区域、国家、洲和 World。
  const root = d3.hierarchy(data).sum(d => d.value || 0);
  const svg = d3.select("#tree").append("svg").attr("width", width);
  // 左上边距确保 World 标签和连线不会被 SVG 边缘裁切。
  const group = svg.append("g").attr("transform", "translate(92,32)");

  // Task 9：点击折叠后需要重算坐标，所以所有绘图都集中在 update()。
  function update() {
    // descendants() 只包含可见节点；放到 _children 的分支不会出现在这里。
    const visible = root.descendants();
    const height = Math.max(460, visible.length * 27 + 58);

    // Task 6：tree layout 不直接画图，只替每个节点写入 x（上下）与 y（左右）。
    const layout = d3.tree().size([height - 64, width - 190]);
    layout(root);
    svg.attr("height", height);

    // 为教学清晰起见，每次更新完整重画；大型图可改为 enter/update/exit 动画。
    group.selectAll("*").remove();

    // Task 7：links() 每项都有 source（父）与 target（子）。
    // 此树从左至右生长，所以 linkHorizontal 的 x 读取 y、y 读取 x。！！！！！
    group.selectAll(".link").data(root.links()).join("path")
      .attr("class", "link")
      .attr("d", d3.linkHorizontal().x(d => d.y).y(d => d.x));

    // Task 8：每个节点对应一个 <g>；translate(y,x) 把它放到 layout 指定的位置。
    const nodes = group.selectAll(".node").data(visible).join("g")
      .attr("class", "node")
      .attr("transform", d => `translate(${d.y},${d.x})`)
      .style("cursor", d => (d.children || d._children) ? "pointer" : "default");

    // 蓝色：子节点可见；紫色：已折叠（子节点在 _children）；橙色：城市叶节点。
    nodes.append("circle").attr("r", 6)
      .attr("fill", d => d._children ? "#7c3aed" : d.children ? "#2563eb" : "#f59e0b");
    nodes.append("text").attr("x", 11).attr("dy", "0.35em").text(d => d.data.name);

    // Task 9：在 children（可见）和 _children（暂存、隐藏）之间移动子节点。
    nodes.on("click", (event, d) => {
      if (!d.children && !d._children) return; // 叶节点没有可切换的分支。
      if (d.children) {
        d._children = d.children;
        d.children = null;
      } else {
        d.children = d._children;
        d._children = null;
      }
      update();
    });
  }

  // 逐一恢复被折叠的节点，然后重新绘图。
  d3.select("#reset-tree").on("click", () => {
    root.each(d => {
      if (d._children) {
        d.children = d._children;
        d._children = null;
      }
    });
    update();
  });
  update();
}

// Task 12：由任意节点向 parent 回溯，找到 root 下第一层，也就是所属洲。
function getContinent(node) {
  let current = node;
  while (current.depth > 1) current = current.parent;
  return current.data.name;
}

/*
 * Task 10–15：Treemap。
 * layout 会将节点的矩形边界写入 x0、x1、y0、y1；下面再把它们变成 SVG rect 的位置和宽高。
 */
function drawTreemap(data) {
  const width = 680;
  const height = 510;
  const svg = d3.select("#treemap").append("svg").attr("width", width).attr("height", height);
  const breadcrumb = d3.select("#breadcrumb");
  const tileSelect = d3.select("#tiling");
  let focus; // Task 14：当前放大到整张图的 hierarchy 节点。

  // Task 12：以色标 domain 生成图例，而不是手动重复写三份颜色。
  d3.select("#legend").selectAll(".legend-item")
    .data(colors.domain()).join("div").attr("class", "legend-item")
    .html(d => `<span class="swatch" style="background:${colors(d)}"></span>${d}`);

  function makeRoot() {
    // Task 15：只改变切分算法；层级结构与人口 value 都完全相同。
    const tiles = {
      squarify: d3.treemapSquarify, // 尽量生成接近正方形的格子，面积较容易比较。
      binary: d3.treemapBinary, // 每次将空间分成两个群组。
      sliceDice: d3.treemapSliceDice // 依深度交替横向与纵向分割。
    };

    // Task 10：Treemap 需要 value，所以建立新 hierarchy、sum 人口、再按数值由大到小排序。
    const root = d3.hierarchy(data)
      .sum(d => d.value || 0)
      .sort((a, b) => b.value - a.value);

    // Task 10：真正执行 layout 后，root 和所有后代都得到 x0/x1/y0/y1。
    d3.treemap()
      .size([width, height])
      .paddingInner(2)
      .paddingOuter(3)
      .tile(tiles[tileSelect.property("value")])(root);
    return root;
  }

  function show(node) {
    focus = node;
    // Task 14：只显示目前 node 的直接孩子；点击国家后，区域会填满整个画布。
    // 城市没有 children，所以用 [node] 保留最后一层格子。
    const children = node.children || [node];

    // 这两个比例尺是缩放的核心：将 node 自己的边界映射成全画布 0–width、0–height。
    const x = d3.scaleLinear().domain([node.x0, node.x1]).range([0, width]);
    const y = d3.scaleLinear().domain([node.y0, node.y1]).range([0, height]);

    // Task 11：每个要显示的节点绑到一个 cell <g>。
    // 完整祖先路径是 key，避免不同洲出现同名节点时 D3 误认成同一格。
    const cells = svg.selectAll(".cell")
      .data(children, d => d.ancestors().map(n => n.data.name).join("/"));
    cells.exit().remove();
    const entered = cells.enter().append("g").attr("class", "cell");
    entered.append("rect"); // Task 11：实际承载面积编码的矩形。
    entered.append("text").attr("x", 7).attr("y", 19).attr("fill", "#172033");

    const merged = entered.merge(cells)
      .style("cursor", d => d.children ? "zoom-in" : "default")
      .attr("transform", d => `translate(${x(d.x0)},${y(d.y0)})`);

    // Task 11：矩形宽高来自 layout 的边界差。
    // Task 12：顶层直接用洲名着色；更深层用 getContinent() 找所属洲再上色。
    merged.select("rect")
      .attr("width", d => Math.max(0, x(d.x1) - x(d.x0)))
      .attr("height", d => Math.max(0, y(d.y1) - y(d.y0)))
      .attr("fill", d => d.depth === 1 ? colors(d.data.name) : colors(getContinent(d)))
      .attr("fill-opacity", d => d.children ? 0.72 : 0.88)
      .attr("stroke", "#fff");

    // 太小的格子不画文字，避免标签超出边界；鼠标移入仍能用 tooltip 查看资料。
    merged.select("text")
      .text(d => d.data.name)
      .style("display", d => (x(d.x1) - x(d.x0) > 55 && y(d.y1) - y(d.y0) > 25) ? null : "none");

    // Task 13：mousemove 负责显示、更新 tooltip 位置；mouseout 隐藏。
    // d.value 对城市是人口，对分组则是由 sum() 算出的后代人口总和。
    merged.on("mousemove", (event, d) => {
      const label = d.children ? "合计人口" : "人口";
      tooltip.style("opacity", 1)
        .style("left", `${event.clientX + 12}px`)
        .style("top", `${event.clientY + 12}px`)
        .html(`<strong>${d.data.name}</strong><br>${label}：${d.value.toLocaleString()} 千人${d.children ? "<br>点击以放大" : ""}`);
    }).on("mouseout", () => tooltip.style("opacity", 0))
      // Task 14：只有带 children 的分组可以成为下一层的 zoom focus。
      .on("click", (event, d) => { if (d.children) show(d); });

    // Task 14：breadcrumb 显示目前层级；按钮以 node.parent 实现返回上一级。
    const trail = node.ancestors().reverse();
    breadcrumb.html("").append("span").text(trail.map(d => d.data.name).join("  ›  "));
    if (node.parent) {
      breadcrumb.append("button").text("返回上一级").on("click", () => show(node.parent));
    }
  }

  // Task 15：选择新的 tile 后，必须重新做 treemap layout，旧坐标不可继续使用。
  function resetLayout() {
    const root = makeRoot();
    show(root);
  }
  tileSelect.on("change", resetLayout);
  resetLayout(); // 初次以 HTML 默认的 Squarify 绘制。
}
