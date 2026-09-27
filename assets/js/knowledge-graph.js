(() => {
  "use strict";

  const currentScript = document.currentScript || document.getElementById("atlas-graph-script");
  const scriptUrl = currentScript?.src || new URL("assets/js/knowledge-graph.js", document.baseURI).href;
  const dataUrl = new URL("../generated/knowledge-graph.json", scriptUrl);
  const siteRoot = new URL("../../", scriptUrl);
  const svgNamespace = "http://www.w3.org/2000/svg";

  const clusterColors = {
    sde: "var(--atlas-teal)",
    "high-dimensional-pde": "var(--atlas-blue)",
    "diffusion-models": "var(--atlas-teal)",
    "optimal-transport": "var(--atlas-ochre)",
    "fokker-planck": "var(--atlas-violet)",
    "schrodinger-bridge": "var(--atlas-violet)",
    references: "var(--atlas-line-strong)"
  };

  const readingOrder = { reading: 0, queued: 1, inbox: 2, complete: 3 };

  function element(name, className, text) {
    const node = document.createElement(name);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function svgElement(name, attributes = {}) {
    const node = document.createElementNS(svgNamespace, name);
    for (const [key, value] of Object.entries(attributes)) {
      node.setAttribute(key, String(value));
    }
    return node;
  }

  function nodeUrl(node) {
    return new URL(node.url, siteRoot).href;
  }

  function statusLabel(status) {
    const labels = {
      inbox: "수집",
      queued: "읽기 대기",
      reading: "읽는 중",
      complete: "읽기 완료",
      stub: "뼈대",
      "ai-draft": "AI 초안",
      checked: "일부 확인",
      verified: "검증됨",
      core: "중심",
      active: "확장 중",
      seed: "씨앗"
    };
    return labels[status] || status;
  }

  function relationLabel(relation) {
    return relation.replaceAll("-", " ");
  }

  function updateStats(graph) {
    document.querySelectorAll("[data-graph-stat]").forEach((target) => {
      const key = target.dataset.graphStat;
      if (Object.hasOwn(graph.stats, key)) target.textContent = graph.stats[key];
    });
  }

  function renderQueue(graph) {
    const references = graph.nodes
      .filter((node) => node.kind === "reference")
      .sort((a, b) => {
        const byReading = (readingOrder[a.readingStatus] ?? 9) - (readingOrder[b.readingStatus] ?? 9);
        return byReading || Number(b.year || 0) - Number(a.year || 0);
      });

    document.querySelectorAll("[data-learning-queue]").forEach((board) => {
      board.replaceChildren();
      if (!references.length) {
        board.append(element("p", "graph-loading", "등록된 레퍼런스가 없습니다."));
        return;
      }

      for (const reference of references) {
        const card = element("article", "queue-card");
        const top = element("div", "queue-card-top");
        top.append(
          element("span", "queue-card-type", `${reference.referenceType} · ${reference.year || "연도 미상"}`)
        );
        const readingBadge = element("span", "status-badge", statusLabel(reference.readingStatus));
        readingBadge.dataset.status = reference.readingStatus;
        top.append(readingBadge);

        const title = element("h3", "", reference.title);
        const summary = element("p", "", reference.summary || "요약을 준비 중입니다.");
        const badges = element("div", "panel-badges");
        const noteBadge = element("span", "status-badge", statusLabel(reference.noteStatus));
        noteBadge.dataset.status = reference.noteStatus;
        badges.append(noteBadge);
        if (!reference.sourceChecked) {
          const unchecked = element("span", "status-badge", "원문 확인 전");
          unchecked.dataset.status = "stub";
          badges.append(unchecked);
        }
        const link = element("a", "card-link", "노트 열기 →");
        link.href = nodeUrl(reference);
        card.append(top, title, summary, badges, link);
        board.append(card);
      }
    });
  }

  function renderReferenceLibraries(graph) {
    const references = graph.nodes
      .filter((node) => node.kind === "reference")
      .sort((a, b) => Number(b.year || 0) - Number(a.year || 0));
    const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));

    document.querySelectorAll("[data-reference-library]").forEach((library) => {
      library.replaceChildren();
      const controls = element("div", "reference-controls");
      const search = element("input", "reference-search");
      search.type = "search";
      search.placeholder = "제목, 저자, 태그 검색";
      search.setAttribute("aria-label", "레퍼런스 검색");

      const type = element("select", "reference-select");
      type.setAttribute("aria-label", "레퍼런스 유형 필터");
      for (const [value, label] of [["all", "논문 + 책"], ["paper", "논문"], ["book", "책"]]) {
        const option = element("option", "", label);
        option.value = value;
        type.append(option);
      }

      const reading = element("select", "reference-select");
      reading.setAttribute("aria-label", "읽기 상태 필터");
      for (const [value, label] of [
        ["all", "모든 읽기 상태"],
        ["inbox", "수집"],
        ["queued", "읽기 대기"],
        ["reading", "읽는 중"],
        ["complete", "읽기 완료"]
      ]) {
        const option = element("option", "", label);
        option.value = value;
        reading.append(option);
      }

      const note = element("select", "reference-select");
      note.setAttribute("aria-label", "노트 상태 필터");
      for (const [value, label] of [
        ["all", "모든 노트 상태"],
        ["stub", "뼈대"],
        ["ai-draft", "AI 초안"],
        ["checked", "일부 확인"],
        ["verified", "검증됨"]
      ]) {
        const option = element("option", "", label);
        option.value = value;
        note.append(option);
      }

      controls.append(search, type, reading, note);
      const summary = element("p", "reference-count");
      summary.setAttribute("aria-live", "polite");
      const grid = element("div", "reference-library-grid");
      library.append(controls, summary, grid);

      const draw = () => {
        const query = search.value.trim().toLocaleLowerCase("ko");
        const visible = references.filter((reference) => {
          const haystack = [
            reference.title,
            reference.author,
            reference.summary,
            ...(reference.tags || []),
            ...(reference.searchAliases || [])
          ].join(" ").toLocaleLowerCase("ko");
          return (!query || haystack.includes(query)) &&
            (type.value === "all" || reference.referenceType === type.value) &&
            (reading.value === "all" || reference.readingStatus === reading.value) &&
            (note.value === "all" || reference.noteStatus === note.value);
        });

        summary.textContent = `${visible.length} / ${references.length} references`;
        grid.replaceChildren();
        if (!visible.length) {
          grid.append(element("p", "reference-empty", "조건에 맞는 레퍼런스가 없습니다."));
          return;
        }

        for (const reference of visible) {
          const card = element("article", "reference-card");
          const top = element("div", "reference-card-top");
          top.append(
            element(
              "span",
              "reference-kind",
              `${reference.referenceType === "paper" ? "PAPER" : "BOOK"} · ${reference.year || "—"}`
            )
          );
          const status = element("div", "panel-badges");
          for (const state of [reference.readingStatus, reference.noteStatus]) {
            const badge = element("span", "status-badge", statusLabel(state));
            badge.dataset.status = state;
            status.append(badge);
          }
          top.append(status);

          const title = element("h3");
          const titleLink = element("a", "", reference.title);
          titleLink.href = nodeUrl(reference);
          title.append(titleLink);
          const author = element("p", "reference-author", reference.author);
          const description = element("p", "reference-description", reference.summary || "요약을 준비 중입니다.");
          const topics = element("div", "reference-topics");
          for (const topicId of reference.attachedTo || []) {
            const topic = nodeById.get(topicId);
            if (!topic) continue;
            const topicLink = element("a", "topic-chip", topic.label);
            topicLink.href = nodeUrl(topic);
            topics.append(topicLink);
          }
          const open = element("a", "card-link", "노트 열기 →");
          open.href = nodeUrl(reference);
          card.append(top, title, author, description, topics, open);
          grid.append(card);
        }
      };

      search.addEventListener("input", draw);
      type.addEventListener("change", draw);
      reading.addEventListener("change", draw);
      note.addEventListener("change", draw);
      draw();
    });
  }

  function splitLabel(label, maxLength) {
    if (label.length <= maxLength) return [label];
    const words = label.split(/\s+/);
    const lines = [""];
    for (const word of words) {
      const current = lines[lines.length - 1];
      if (!current || `${current} ${word}`.length <= maxLength) {
        lines[lines.length - 1] = current ? `${current} ${word}` : word;
      } else if (lines.length < 2) {
        lines.push(word);
      } else {
        lines[1] = `${lines[1]} ${word}`;
      }
    }
    if (lines[1]?.length > maxLength + 4) lines[1] = `${lines[1].slice(0, maxLength + 1).trim()}…`;
    return lines.slice(0, 2);
  }

  function hashNumber(text) {
    let value = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      value ^= text.charCodeAt(index);
      value = Math.imul(value, 16777619);
    }
    return Math.abs(value >>> 0);
  }

  function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
  }

  const labelCanvas = document.createElement("canvas");
  const labelContext = labelCanvas.getContext("2d");

  function fitLabel(label, maxWidth, maxHeight, preferredSize = 14, maxLines = 3) {
    const words = String(label).trim().split(/\s+/).filter(Boolean);
    const measure = (text, size) => {
      labelContext.font = `650 ${size}px Inter, "Segoe UI", "Noto Sans KR", sans-serif`;
      return labelContext.measureText(text).width;
    };

    const wrap = (fontSize) => {
      const lines = [];
      let current = "";
      let splitLongWord = false;
      const pushCurrent = () => {
        if (current) lines.push(current);
        current = "";
      };

      for (const word of words) {
        if (measure(word, fontSize) > maxWidth) {
          splitLongWord = true;
          pushCurrent();
          for (const character of Array.from(word)) {
            const candidate = `${current}${character}`;
            if (current && measure(candidate, fontSize) > maxWidth) pushCurrent();
            current += character;
          }
          continue;
        }

        const candidate = current ? `${current} ${word}` : word;
        if (current && measure(candidate, fontSize) > maxWidth) pushCurrent();
        current = current ? `${current} ${word}` : word;
      }
      pushCurrent();
      return { lines, splitLongWord };
    };

    let fontSize = preferredSize;
    let lastLayout = { lines: [String(label)], fontSize, lineHeight: fontSize * 1.18 };
    for (let attempt = 0; attempt < 80; attempt += 1) {
      const { lines, splitLongWord } = wrap(fontSize);
      const lineHeight = fontSize * 1.18;
      lastLayout = { lines, fontSize, lineHeight };
      if (
        lines.length <= maxLines &&
        lines.every((line) => measure(line, fontSize) <= maxWidth) &&
        lines.length * lineHeight <= maxHeight &&
        (!splitLongWord || fontSize <= 8)
      ) {
        return { lines, fontSize, lineHeight };
      }
      fontSize = fontSize > 4 ? fontSize - 0.5 : fontSize * 0.82;
    }
    return lastLayout;
  }

  class KnowledgeGraph {
    constructor(container, graph) {
      this.container = container;
      this.mode = container.dataset.mode || "full";
      this.rawGraph = graph;
      this.allNodes = graph.nodes.map((node) => ({ ...node, x: 0, y: 0, vx: 0, vy: 0 }));
      this.nodeById = new Map(this.allNodes.map((node) => [node.id, node]));
      this.nodes = this.allNodes.filter((node) => node.kind === "topic" || node.kind === "entry");
      this.graphNodeIds = new Set(this.nodes.map((node) => node.id));
      this.allEdges = graph.edges
        .filter((edge) => this.nodeById.has(edge.source) && this.nodeById.has(edge.target))
        .map((edge) => ({
          ...edge,
          sourceNode: this.nodeById.get(edge.source),
          targetNode: this.nodeById.get(edge.target)
        }));
      this.edges = this.allEdges.filter(
        (edge) => this.graphNodeIds.has(edge.source) && this.graphNodeIds.has(edge.target)
      );
      this.neighbors = new Map(this.allNodes.map((node) => [node.id, []]));
      for (const edge of this.allEdges) {
        this.neighbors.get(edge.source).push({ node: edge.targetNode, edge, outgoing: true });
        this.neighbors.get(edge.target).push({ node: edge.sourceNode, edge, outgoing: false });
      }
      this.orderStorageKey = `knowledge-atlas:explorer-order:v1:${siteRoot.pathname.replace(/\/$/, "") || "/"}`;
      this.computeNodeGeometry();
      this.query = "";
      this.selected = null;
      this.transform = { x: 0, y: 0, k: 1 };
      this.drag = null;
      this.pan = null;
      this.alpha = 1;
      this.frame = null;
      this.width = 900;
      this.height = 520;
      this.build();
    }

    computeNodeGeometry() {
      for (const node of this.nodes) {
        const uniqueNeighbors = [...new Map(
          (this.neighbors.get(node.id) || []).map((item) => [item.node.id, item.node])
        ).values()];
        node.relatedNodeCount = uniqueNeighbors.filter((item) => this.graphNodeIds.has(item.id)).length;
        node.sourceCount = uniqueNeighbors.filter((item) => item.kind === "reference").length;
        node.importance = clamp(Number(node.importance) || 3, 1, 5);
        const sizeUnit = clamp(
          46 +
            node.importance * 5 +
            Math.sqrt(node.relatedNodeCount) * 7 +
            Math.sqrt(node.sourceCount) * 5,
          54,
          96
        );

        if (node.kind === "topic") {
          node.radius = sizeUnit;
          node.halfWidth = sizeUnit;
          node.halfHeight = sizeUnit;
        } else {
          node.width = clamp(sizeUnit * 2.3, 142, 240);
          node.height = clamp(sizeUnit * 1.15, 72, 116);
          node.halfWidth = node.width / 2;
          node.halfHeight = node.height / 2;
        }
      }
    }

    build() {
      this.container.replaceChildren();
      this.app = element("div", "graph-app");

      this.explorer = element("div", "graph-explorer");
      this.explorer.setAttribute("role", "navigation");
      this.explorer.setAttribute("aria-label", "지식 그래프 탐색기");
      const explorerHeader = element("div", "explorer-header");
      const explorerTitleRow = element("div", "explorer-title-row");
      explorerTitleRow.append(element("p", "explorer-kicker", "ATLAS"));
      this.resetOrderButton = element("button", "explorer-order-reset", "순서 초기화");
      this.resetOrderButton.type = "button";
      this.resetOrderButton.addEventListener("click", () => this.resetExplorerOrder());
      explorerTitleRow.append(this.resetOrderButton);
      explorerHeader.append(explorerTitleRow);
      const searchWrap = element("label", "explorer-search-wrap");
      this.searchInput = element("input", "explorer-search");
      this.searchInput.type = "search";
      this.searchInput.placeholder = "개념·항목·문헌 검색";
      this.searchInput.setAttribute("aria-label", "모든 지식 노드 검색");
      this.searchInput.addEventListener("input", () => {
        this.query = this.searchInput.value.trim().toLocaleLowerCase("ko");
        this.applyVisibility();
      });
      searchWrap.append(this.searchInput);
      explorerHeader.append(searchWrap);
      this.explorerCount = element("p", "explorer-count");
      explorerHeader.append(this.explorerCount);
      this.explorerTree = element("ul", "explorer-tree");
      this.explorerTree.setAttribute("role", "tree");
      this.explorerResults = element("ul", "explorer-results");
      this.explorerResults.setAttribute("role", "list");
      this.explorerResults.hidden = true;
      this.explorerLive = element("p", "visually-hidden");
      this.explorerLive.setAttribute("role", "status");
      this.explorerLive.setAttribute("aria-live", "polite");
      this.explorer.append(explorerHeader, this.explorerTree, this.explorerResults, this.explorerLive);

      const zoomOut = this.actionButton("−", "축소", () => this.zoomBy(0.82));
      const reset = this.actionButton("↺", "보기 초기화", () => this.resetView());
      const zoomIn = this.actionButton("+", "확대", () => this.zoomBy(1.22));
      const canvasControls = element("div", "graph-canvas-controls");
      canvasControls.append(zoomOut, reset, zoomIn);

      this.stage = element("div", "graph-stage");
      this.svg = svgElement("svg", {
        role: "group",
        "aria-label": "개념과 항목의 관계 그래프",
        tabindex: "0"
      });
      const defs = svgElement("defs");
      const marker = svgElement("marker", {
        id: `graph-arrow-${Math.random().toString(36).slice(2)}`,
        viewBox: "0 -5 10 10",
        refX: "9",
        refY: "0",
        markerWidth: "6",
        markerHeight: "6",
        orient: "auto"
      });
      marker.append(svgElement("path", { d: "M0,-4L9,0L0,4", fill: "var(--atlas-line-strong)" }));
      defs.append(marker);
      this.markerId = marker.id;
      this.svg.append(defs);

      this.viewport = svgElement("g", { class: "graph-viewport" });
      this.linkLayer = svgElement("g", { class: "graph-links", "aria-hidden": "true" });
      this.nodeLayer = svgElement("g", { class: "graph-nodes" });
      this.viewport.append(this.linkLayer, this.nodeLayer);
      this.svg.append(this.viewport);
      this.stage.append(this.svg, canvasControls);

      const legend = element("div", "graph-legend");
      legend.innerHTML =
        '<span class="legend-item"><i class="legend-shape concept"></i> Concept</span>' +
        '<span class="legend-item"><i class="legend-shape entry"></i> Entry</span>';
      this.stage.append(legend);

      this.panel = element("div", "knowledge-panel");
      this.panel.setAttribute("role", "complementary");
      this.panel.setAttribute("aria-live", "polite");
      this.app.append(this.explorer, this.stage, this.panel);
      this.container.append(this.app);

      this.createGraphElements();
      this.buildExplorer();
      this.attachInteraction();
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(this.stage);
      this.resize();
      this.showPanel(null);
      this.applyVisibility();
    }

    searchText(node) {
      return [
        node.title,
        node.label,
        node.summary,
        node.author,
        node.year,
        ...(node.tags || []),
        ...(node.searchAliases || [])
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("ko");
    }

    nodeTypeLabel(node) {
      if (node.kind === "topic") return "CONCEPT";
      if (node.kind === "entry") return (node.entryKind || "ENTRY").toUpperCase();
      return `${(node.referenceType || "SOURCE").toUpperCase()}${node.year ? ` · ${node.year}` : ""}`;
    }

    nodeIcon(node) {
      if (node.kind === "topic") return "○";
      if (node.kind === "entry") return "▢";
      return "▤";
    }

    buildExplorer() {
      this.explorerItems = new Map();
      const defaults = [...this.nodes].sort((a, b) => {
        const orderA = Number.isFinite(Number(a.explorerOrder)) ? Number(a.explorerOrder) : Number.MAX_SAFE_INTEGER;
        const orderB = Number.isFinite(Number(b.explorerOrder)) ? Number(b.explorerOrder) : Number.MAX_SAFE_INTEGER;
        return orderA - orderB || a.title.localeCompare(b.title, "ko");
      });
      this.defaultRootIds = defaults.map((node) => node.id);
      const defaultById = new Map(defaults.map((node) => [node.id, node]));
      let storedIds = [];
      try {
        const stored = JSON.parse(window.localStorage.getItem(this.orderStorageKey) || "null");
        if (stored?.version === 1 && Array.isArray(stored.ids)) storedIds = stored.ids;
      } catch {
        storedIds = [];
      }
      const validStored = storedIds.filter((id, index) => defaultById.has(id) && storedIds.indexOf(id) === index);
      const orderedIds = [...validStored, ...this.defaultRootIds.filter((id) => !validStored.includes(id))];

      for (const nodeId of orderedIds) {
        const node = defaultById.get(nodeId);
        const item = element("li", "explorer-item");
        item.dataset.nodeId = node.id;
        item.setAttribute("role", "treeitem");
        item.setAttribute("aria-expanded", "false");
        const row = element("div", "explorer-row");
        const uniqueNeighbors = [...new Map(
          (this.neighbors.get(node.id) || []).map((neighbor) => [neighbor.node.id, neighbor])
        ).values()].sort((a, b) => a.node.title.localeCompare(b.node.title, "ko"));

        const toggle = element("button", "explorer-toggle", uniqueNeighbors.length ? "›" : "·");
        toggle.type = "button";
        toggle.setAttribute("aria-label", `${node.label}의 직접 연결 펼치기`);
        toggle.setAttribute("aria-expanded", "false");
        toggle.disabled = !uniqueNeighbors.length;

        const reorder = element("button", "explorer-reorder-handle", "⠿");
        reorder.type = "button";
        reorder.draggable = true;
        reorder.title = "드래그하거나 Alt+↑/↓로 순서 이동";
        reorder.setAttribute("aria-label", `${node.label} 순서 이동`);
        reorder.setAttribute("aria-keyshortcuts", "Alt+ArrowUp Alt+ArrowDown");
        reorder.addEventListener("click", (event) => event.preventDefault());
        reorder.addEventListener("keydown", (event) => {
          if (!event.altKey || !["ArrowUp", "ArrowDown"].includes(event.key)) return;
          event.preventDefault();
          this.moveExplorerItem(node.id, event.key === "ArrowUp" ? -1 : 1);
        });
        reorder.addEventListener("dragstart", (event) => {
          this.draggedExplorerId = node.id;
          item.classList.add("is-dragging");
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", node.id);
        });
        reorder.addEventListener("dragend", () => this.clearExplorerDragState());

        const select = element("button", "explorer-node");
        select.type = "button";
        select.append(
          element("span", `explorer-node-icon ${node.kind}`, this.nodeIcon(node)),
          element("span", "explorer-node-label", node.label),
          element("span", "explorer-node-type", this.nodeTypeLabel(node))
        );
        select.addEventListener("click", () => this.selectNode(node, true));
        row.append(toggle, reorder, select);

        const children = element("ul", "explorer-children");
        children.setAttribute("role", "group");
        children.hidden = true;
        const appendChildren = (label, neighbors) => {
          if (!neighbors.length) return;
          const heading = element("li", "explorer-child-group-label", label);
          heading.setAttribute("role", "presentation");
          children.append(heading);
          for (const neighbor of neighbors) {
            const child = element("li", "explorer-child-item");
            child.setAttribute("role", "treeitem");
            const childButton = element("button", "explorer-child");
            childButton.type = "button";
            childButton.append(
              element("span", `explorer-node-icon ${neighbor.node.kind}`, this.nodeIcon(neighbor.node)),
              element("span", "explorer-node-label", neighbor.node.label)
            );
            childButton.title = relationLabel(neighbor.edge.relation);
            childButton.addEventListener("click", () =>
              this.selectNode(neighbor.node, this.graphNodeIds.has(neighbor.node.id))
            );
            child.append(childButton);
            children.append(child);
          }
        };
        appendChildren(
          "CONNECTED NODES",
          uniqueNeighbors.filter((neighbor) => this.graphNodeIds.has(neighbor.node.id))
        );
        appendChildren(
          "PAPERS & BOOKS",
          uniqueNeighbors.filter((neighbor) => neighbor.node.kind === "reference")
        );

        toggle.addEventListener("click", () => {
          const expanded = toggle.getAttribute("aria-expanded") === "true";
          toggle.setAttribute("aria-expanded", String(!expanded));
          item.setAttribute("aria-expanded", String(!expanded));
          toggle.textContent = expanded ? "›" : "⌄";
          children.hidden = expanded;
        });

        item.addEventListener("dragover", (event) => {
          if (!this.draggedExplorerId || this.draggedExplorerId === node.id) return;
          event.preventDefault();
          const before = event.clientY < row.getBoundingClientRect().top + row.getBoundingClientRect().height / 2;
          item.classList.toggle("drop-before", before);
          item.classList.toggle("drop-after", !before);
        });
        item.addEventListener("dragleave", () => item.classList.remove("drop-before", "drop-after"));
        item.addEventListener("drop", (event) => {
          event.preventDefault();
          const movedId = this.draggedExplorerId;
          const dragged = this.explorerItems.get(movedId)?.item;
          if (!dragged || dragged === item) return this.clearExplorerDragState();
          const before = event.clientY < row.getBoundingClientRect().top + row.getBoundingClientRect().height / 2;
          if (before) item.before(dragged);
          else item.after(dragged);
          this.saveExplorerOrder(movedId);
          this.clearExplorerDragState();
        });

        item.append(row, children);
        this.explorerTree.append(item);
        this.explorerItems.set(node.id, { item, select, children, toggle, reorder });
      }
    }

    currentExplorerIds() {
      return [...this.explorerTree.children]
        .map((item) => item.dataset.nodeId)
        .filter(Boolean);
    }

    saveExplorerOrder(movedId) {
      const ids = this.currentExplorerIds();
      try {
        window.localStorage.setItem(
          this.orderStorageKey,
          JSON.stringify({ version: 1, ids, updatedAt: new Date().toISOString() })
        );
      } catch {
        // The visual order still works when storage is unavailable.
      }
      const position = ids.indexOf(movedId) + 1;
      const moved = this.nodeById.get(movedId);
      this.explorerLive.textContent = `${moved?.label || "항목"}, ${ids.length}개 중 ${position}번째로 이동`;
    }

    moveExplorerItem(nodeId, delta) {
      const current = this.currentExplorerIds();
      const index = current.indexOf(nodeId);
      const targetIndex = clamp(index + delta, 0, current.length - 1);
      if (index < 0 || targetIndex === index) return;
      const item = this.explorerItems.get(nodeId).item;
      const target = this.explorerItems.get(current[targetIndex]).item;
      if (delta < 0) target.before(item);
      else target.after(item);
      this.saveExplorerOrder(nodeId);
      this.explorerItems.get(nodeId).reorder.focus();
    }

    resetExplorerOrder() {
      for (const nodeId of this.defaultRootIds) {
        const item = this.explorerItems.get(nodeId)?.item;
        if (item) this.explorerTree.append(item);
      }
      try {
        window.localStorage.removeItem(this.orderStorageKey);
      } catch {
        // Keep the reset visual order even if storage is unavailable.
      }
      this.explorerLive.textContent = "탐색기 순서를 기본값으로 되돌렸습니다.";
    }

    clearExplorerDragState() {
      this.draggedExplorerId = null;
      for (const item of this.explorerTree.children) {
        item.classList.remove("is-dragging", "drop-before", "drop-after");
      }
    }

    renderSearchResults(matches) {
      this.explorerResults.replaceChildren();
      const results = [...matches]
        .map((id) => this.nodeById.get(id))
        .filter(Boolean)
        .sort((a, b) => a.title.localeCompare(b.title, "ko"));
      for (const node of results) {
        const item = element("li", "explorer-result-item");
        const button = element("button", "explorer-result");
        button.type = "button";
        button.append(
          element("span", `explorer-node-icon ${node.kind}`, this.nodeIcon(node)),
          element("span", "explorer-node-label", node.label),
          element("span", "explorer-node-type", this.nodeTypeLabel(node))
        );
        button.addEventListener("click", () => this.selectNode(node, this.graphNodeIds.has(node.id)));
        item.append(button);
        this.explorerResults.append(item);
      }
      if (!results.length) {
        this.explorerResults.append(element("li", "explorer-empty", "검색 결과가 없습니다."));
      }
    }

    actionButton(symbol, label, action) {
      const button = element("button", "graph-action");
      button.type = "button";
      button.title = label;
      button.setAttribute("aria-label", label);
      const symbolSpan = element("span", "", symbol);
      symbolSpan.setAttribute("aria-hidden", "true");
      button.append(symbolSpan);
      button.addEventListener("click", action);
      return button;
    }

    createGraphElements() {
      this.edgeElements = new Map();
      this.nodeElements = new Map();

      for (const edge of this.edges) {
        const line = svgElement("line", { class: "graph-link" });
        if (edge.directed) line.setAttribute("marker-end", `url(#${this.markerId})`);
        const title = svgElement("title");
        title.textContent = `${edge.sourceNode.label} — ${relationLabel(edge.relation)} → ${edge.targetNode.label}`;
        line.append(title);
        this.linkLayer.append(line);
        this.edgeElements.set(edge, line);
      }

      for (const node of this.nodes) {
        const group = svgElement("g", {
          class: `graph-node ${node.kind}`,
          tabindex: "0",
          role: "button",
          "aria-label": `${node.kind === "topic" ? "개념" : node.entryKind || "항목"}: ${node.title}`
        });
        group.style.setProperty("--node-color", clusterColors[node.cluster] || "var(--atlas-teal)");

        if (node.kind === "topic") {
          group.append(svgElement("circle", { class: "node-shape", r: node.radius }));
        } else {
          group.append(
            svgElement("rect", {
              class: "node-shape",
              x: -node.halfWidth,
              y: -node.halfHeight,
              width: node.width,
              height: node.height,
              rx: Math.min(24, node.height * 0.28)
            })
          );
        }

        const availableWidth = node.kind === "topic" ? node.radius * 1.42 : node.width - 24;
        const availableHeight = node.kind === "topic" ? node.radius * 1.3 : node.height - 20;
        const preferredSize = clamp((node.kind === "topic" ? node.radius : node.height) * 0.18, 11, 15);
        const layout = fitLabel(
          node.label,
          availableWidth,
          availableHeight,
          preferredSize,
          node.kind === "entry" ? 9 : 3
        );
        const startY = -((layout.lines.length - 1) * layout.lineHeight) / 2 + layout.fontSize * 0.34;
        const text = svgElement("text", { y: startY });
        text.style.fontSize = `${layout.fontSize}px`;
        const lines = layout.lines;
        lines.forEach((line, index) => {
          const span = svgElement("tspan", { x: 0, dy: index === 0 ? 0 : layout.lineHeight });
          span.textContent = line;
          text.append(span);
        });
        group.append(text);

        const title = svgElement("title");
        title.textContent = node.title;
        group.append(title);
        group.addEventListener("click", (event) => {
          event.stopPropagation();
          if (this.suppressNodeClick) {
            this.suppressNodeClick = false;
            return;
          }
          this.selectNode(node, true);
        });
        group.addEventListener("dblclick", (event) => {
          event.stopPropagation();
          window.location.href = nodeUrl(node);
        });
        group.addEventListener("keydown", (event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            this.selectNode(node, true);
          }
        });
        this.nodeLayer.append(group);
        this.nodeElements.set(node.id, group);
      }
    }

    resize() {
      const bounds = this.stage.getBoundingClientRect();
      const oldWidth = this.width;
      const oldHeight = this.height;
      this.width = Math.max(320, bounds.width || 900);
      this.height = Math.max(420, bounds.height || (this.mode === "full" ? 620 : 480));
      this.svg.setAttribute("viewBox", `0 0 ${this.width} ${this.height}`);

      if (!this.positioned) {
        this.positionNodes();
        this.positioned = true;
      } else if (oldWidth && oldHeight) {
        const scaleX = this.width / oldWidth;
        const scaleY = this.height / oldHeight;
        for (const node of this.nodes) {
          node.x *= scaleX;
          node.y *= scaleY;
          this.clampNode(node);
        }
      }
      this.renderPositions();
      this.restart(0.45);
    }

    positionNodes() {
      const centerX = this.width * 0.5;
      const centerY = this.height * 0.5;
      const radius = Math.min(this.width, this.height) * 0.3;
      this.nodes.forEach((node, index) => {
        const angle = -Math.PI / 2 + (index * Math.PI * 2) / Math.max(this.nodes.length, 1);
        node.x = centerX + Math.cos(angle) * radius;
        node.y = centerY + Math.sin(angle) * radius * 0.72;
      });
    }

    visible() {
      return true;
    }

    applyVisibility() {
      const matches = new Set();
      if (this.query) {
        for (const node of this.allNodes) {
          if (this.searchText(node).includes(this.query)) matches.add(node.id);
        }
      }

      const graphMatches = new Set([...matches].filter((id) => this.graphNodeIds.has(id)));
      for (const nodeId of matches) {
        if (this.graphNodeIds.has(nodeId)) continue;
        for (const relation of this.neighbors.get(nodeId) || []) {
          if (this.graphNodeIds.has(relation.node.id)) graphMatches.add(relation.node.id);
        }
      }

      for (const node of this.nodes) {
        const group = this.nodeElements.get(node.id);
        const searchMuted = this.query && !graphMatches.has(node.id);
        group.classList.toggle("is-search-muted", Boolean(searchMuted));
      }
      for (const edge of this.edges) {
        const line = this.edgeElements.get(edge);
        const searchMuted = this.query && !(graphMatches.has(edge.source) && graphMatches.has(edge.target));
        line.classList.toggle("is-search-muted", Boolean(searchMuted));
      }

      this.explorerTree.hidden = Boolean(this.query);
      this.explorerResults.hidden = !this.query;
      this.resetOrderButton.disabled = Boolean(this.query);
      if (this.query) this.renderSearchResults(matches);

      const sourceCount = this.allNodes.length - this.nodes.length;
      const count = this.query ? matches.size : this.nodes.length;
      this.explorerCount.textContent = this.query
        ? `${count}개 검색 결과`
        : `${this.nodes.length}개 노드 · 문헌 ${sourceCount}개`;
      this.explorer.classList.toggle("is-searching", Boolean(this.query));

      this.updateSelectionClasses();
    }

    selectNode(node, center) {
      this.selected = node;
      this.showPanel(node);
      this.updateSelectionClasses();
      if (center && this.graphNodeIds.has(node.id)) this.centerNode(node);
    }

    updateSelectionClasses() {
      const selectedId = this.selected?.id;
      const connected = new Set(selectedId ? [selectedId] : []);
      if (selectedId) {
        for (const relation of this.neighbors.get(selectedId) || []) connected.add(relation.node.id);
      }
      for (const node of this.nodes) {
        const group = this.nodeElements.get(node.id);
        group.classList.toggle("is-selected", node.id === selectedId);
        const selectionMuted = Boolean(selectedId) && !connected.has(node.id);
        group.classList.toggle("is-selection-muted", selectionMuted);
        this.explorerItems.get(node.id)?.select.classList.toggle("is-selected", node.id === selectedId);
      }
      for (const edge of this.edges) {
        const line = this.edgeElements.get(edge);
        const active = Boolean(selectedId) && (edge.source === selectedId || edge.target === selectedId);
        line.classList.toggle("is-active", active);
        line.classList.toggle("is-selection-muted", Boolean(selectedId) && !active);
      }
    }

    showPanel(node) {
      this.panel.replaceChildren();
      if (!node) {
        this.panel.hidden = true;
        this.app.classList.remove("has-selection");
        return;
      }

      this.panel.hidden = false;
      this.app.classList.add("has-selection");

      const type = node.kind === "topic"
        ? "CONCEPT"
        : node.kind === "entry"
          ? (node.entryKind || "ENTRY").toUpperCase()
          : `${node.referenceType} · ${node.year || ""}`;
      this.panel.append(element("p", "panel-type", type));
      this.panel.append(element("h3", "", node.title));
      this.panel.append(element("p", "panel-summary", node.summary || "설명을 준비 중입니다."));

      const badges = element("div", "panel-badges");
      if (node.kind === "topic" || node.kind === "entry") {
        for (const status of [node.status, node.maturity].filter(Boolean)) {
          const badge = element("span", "status-badge", statusLabel(status));
          badge.dataset.status = status;
          badges.append(badge);
        }
        const importance = element("span", "status-badge", `중요도 ${node.importance}/5`);
        importance.dataset.status = "importance";
        badges.append(importance);
      } else {
        for (const status of [node.readingStatus, node.noteStatus].filter(Boolean)) {
          const badge = element("span", "status-badge", statusLabel(status));
          badge.dataset.status = status;
          badges.append(badge);
        }
      }
      this.panel.append(badges);

      const relations = [...new Map(
        (this.neighbors.get(node.id) || []).map((item) => [item.node.id, item])
      ).values()];
      const relatedNodes = relations.filter((item) => this.graphNodeIds.has(item.node.id));
      const sources = relations
        .filter((item) => item.node.kind === "reference")
        .map((item) => item.node)
        .sort((a, b) => Number(b.year || 0) - Number(a.year || 0));

      if (node.kind !== "reference") {
        const sourceSection = element("div", "panel-sources");
        sourceSection.append(element("h4", "", `Papers & Books · ${sources.length}`));
        if (!sources.length) {
          sourceSection.append(element("p", "panel-source-empty", "아직 연결된 문헌이 없습니다."));
        } else {
          for (const [referenceType, label] of [["paper", "PAPERS"], ["book", "BOOKS"]]) {
            const groupSources = sources.filter((source) => source.referenceType === referenceType);
            if (!groupSources.length) continue;
            const group = element("div", "panel-source-group");
            group.append(element("p", "panel-source-group-label", `${label} · ${groupSources.length}`));
            const list = element("ul", "panel-source-list");
            for (const source of groupSources) {
              const li = element("li", "panel-source-item");
              const link = element("a", "panel-source-link", source.title);
              link.href = nodeUrl(source);
              const meta = element(
                "span",
                "panel-source-meta",
                [source.author, source.year].filter(Boolean).join(" · ")
              );
              li.append(link, meta);
              list.append(li);
            }
            group.append(list);
            sourceSection.append(group);
          }
        }
        this.panel.append(sourceSection);
      }

      if (relatedNodes.length) {
        const relationSection = element("div", "panel-relations");
        relationSection.append(element("h4", "", `연결된 노드 ${relatedNodes.length}`));
        const list = element("ul");
        for (const item of relatedNodes.slice(0, 10)) {
          const li = element("li");
          const link = element("a", "", item.node.label);
          link.href = "#";
          link.addEventListener("click", (event) => {
            event.preventDefault();
            this.selectNode(item.node, this.graphNodeIds.has(item.node.id));
          });
          const relation = relationLabel(item.edge.relation);
          if (item.outgoing) {
            li.append(document.createTextNode(`${relation} → `), link);
          } else {
            li.append(document.createTextNode(`← ${relation} — `), link);
          }
          list.append(li);
        }
        relationSection.append(list);
        this.panel.append(relationSection);
      }

      const open = element("a", "btn btn-primary panel-open", "페이지 열기");
      open.href = nodeUrl(node);
      this.panel.append(open);
    }

    attachInteraction() {
      this.svg.addEventListener("click", (event) => {
        if (!event.target.closest(".graph-node")) {
          this.selected = null;
          this.showPanel(null);
          this.updateSelectionClasses();
        }
      });

      this.svg.addEventListener(
        "wheel",
        (event) => {
          event.preventDefault();
          const factor = event.deltaY > 0 ? 0.9 : 1.1;
          const bounds = this.svg.getBoundingClientRect();
          const px = ((event.clientX - bounds.left) / bounds.width) * this.width;
          const py = ((event.clientY - bounds.top) / bounds.height) * this.height;
          this.setZoom(this.transform.k * factor, px, py);
        },
        { passive: false }
      );

      this.svg.addEventListener("pointerdown", (event) => {
        const nodeGroup = event.target.closest(".graph-node");
        if (nodeGroup) {
          nodeGroup.setPointerCapture(event.pointerId);
          const node = this.nodeById.get(
            [...this.nodeElements.entries()].find(([, group]) => group === nodeGroup)?.[0]
          );
          if (!node) return;
          const point = this.toGraphPoint(event);
          this.drag = { node, offsetX: node.x - point.x, offsetY: node.y - point.y };
          this.dragStart = { x: event.clientX, y: event.clientY };
          this.dragMoved = false;
          node.fixed = true;
          this.restart(0.35);
        } else {
          this.svg.setPointerCapture(event.pointerId);
          this.pan = {
            startX: event.clientX,
            startY: event.clientY,
            originX: this.transform.x,
            originY: this.transform.y
          };
          this.stage.classList.add("is-panning");
        }
      });

      this.svg.addEventListener("pointermove", (event) => {
        if (this.drag) {
          if (
            this.dragStart &&
            Math.hypot(event.clientX - this.dragStart.x, event.clientY - this.dragStart.y) > 4
          ) {
            this.dragMoved = true;
          }
          const point = this.toGraphPoint(event);
          this.drag.node.x = point.x + this.drag.offsetX;
          this.drag.node.y = point.y + this.drag.offsetY;
          this.clampNode(this.drag.node);
          this.drag.node.vx = 0;
          this.drag.node.vy = 0;
          this.renderPositions();
        } else if (this.pan) {
          const bounds = this.svg.getBoundingClientRect();
          const scaleX = this.width / bounds.width;
          const scaleY = this.height / bounds.height;
          this.transform.x = this.pan.originX + (event.clientX - this.pan.startX) * scaleX;
          this.transform.y = this.pan.originY + (event.clientY - this.pan.startY) * scaleY;
          this.applyTransform();
        }
      });

      const finishPointer = () => {
        if (this.drag) {
          this.drag.node.fixed = false;
          if (this.dragMoved) this.suppressNodeClick = true;
        }
        this.drag = null;
        this.dragStart = null;
        this.dragMoved = false;
        this.pan = null;
        this.stage.classList.remove("is-panning");
      };
      this.svg.addEventListener("pointerup", finishPointer);
      this.svg.addEventListener("pointercancel", finishPointer);
      this.svg.addEventListener("dblclick", (event) => {
        if (!event.target.closest(".graph-node")) this.resetView();
      });
    }

    toGraphPoint(event) {
      const bounds = this.svg.getBoundingClientRect();
      const x = ((event.clientX - bounds.left) / bounds.width) * this.width;
      const y = ((event.clientY - bounds.top) / bounds.height) * this.height;
      return {
        x: (x - this.transform.x) / this.transform.k,
        y: (y - this.transform.y) / this.transform.k
      };
    }

    setZoom(nextScale, pivotX = this.width / 2, pivotY = this.height / 2) {
      const oldScale = this.transform.k;
      const scale = Math.max(0.52, Math.min(2.6, nextScale));
      const graphX = (pivotX - this.transform.x) / oldScale;
      const graphY = (pivotY - this.transform.y) / oldScale;
      this.transform.x = pivotX - graphX * scale;
      this.transform.y = pivotY - graphY * scale;
      this.transform.k = scale;
      this.applyTransform();
    }

    zoomBy(factor) {
      this.setZoom(this.transform.k * factor);
    }

    resetView() {
      this.transform = { x: 0, y: 0, k: 1 };
      this.applyTransform();
      this.selected = null;
      this.showPanel(null);
      this.updateSelectionClasses();
      this.restart(0.55);
    }

    centerNode(node) {
      this.transform.x = this.width / 2 - node.x * this.transform.k;
      this.transform.y = this.height / 2 - node.y * this.transform.k;
      this.applyTransform();
    }

    boundaryDistance(node, unitX, unitY) {
      if (node.kind === "topic") return node.radius;
      const horizontal = Math.abs(unitX) / Math.max(node.halfWidth, 1);
      const vertical = Math.abs(unitY) / Math.max(node.halfHeight, 1);
      return 1 / Math.max(horizontal, vertical, 0.0001);
    }

    clampNode(node) {
      const padding = 14;
      const halfWidth = Math.min(node.halfWidth, Math.max(20, this.width / 2 - padding));
      const halfHeight = Math.min(node.halfHeight, Math.max(20, this.height / 2 - padding));
      node.x = clamp(node.x, halfWidth + padding, this.width - halfWidth - padding);
      node.y = clamp(node.y, halfHeight + padding, this.height - halfHeight - padding);
    }

    collisionDisplacement(a, b, padding = 14) {
      if (a.kind === "topic" && b.kind === "topic") {
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let distance = Math.hypot(dx, dy);
        if (distance < 0.01) {
          const angle = (hashNumber(`${a.id}:${b.id}`) % 360) * (Math.PI / 180);
          dx = Math.cos(angle);
          dy = Math.sin(angle);
          distance = 1;
        }
        return {
          unitX: dx / distance,
          unitY: dy / distance,
          overlap: a.radius + b.radius + padding - distance
        };
      }

      if (a.kind === "entry" && b.kind === "entry") {
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const overlapX = a.halfWidth + b.halfWidth + padding - Math.abs(dx);
        const overlapY = a.halfHeight + b.halfHeight + padding - Math.abs(dy);
        if (overlapX <= 0 || overlapY <= 0) return { unitX: 0, unitY: 0, overlap: 0 };
        if (overlapX < overlapY) {
          return { unitX: dx < 0 ? -1 : 1, unitY: 0, overlap: overlapX };
        }
        return { unitX: 0, unitY: dy < 0 ? -1 : 1, overlap: overlapY };
      }

      const circleIsA = a.kind === "topic";
      const circle = circleIsA ? a : b;
      const rectangle = circleIsA ? b : a;
      const closestX = clamp(
        circle.x,
        rectangle.x - rectangle.halfWidth,
        rectangle.x + rectangle.halfWidth
      );
      const closestY = clamp(
        circle.y,
        rectangle.y - rectangle.halfHeight,
        rectangle.y + rectangle.halfHeight
      );
      let dx = circle.x - closestX;
      let dy = circle.y - closestY;
      let distance = Math.hypot(dx, dy);
      let overlap;

      if (distance < 0.01) {
        const horizontalGap = rectangle.halfWidth - Math.abs(circle.x - rectangle.x);
        const verticalGap = rectangle.halfHeight - Math.abs(circle.y - rectangle.y);
        if (horizontalGap < verticalGap) {
          dx = circle.x < rectangle.x ? -1 : 1;
          dy = 0;
          overlap = circle.radius + padding + horizontalGap;
        } else {
          dx = 0;
          dy = circle.y < rectangle.y ? -1 : 1;
          overlap = circle.radius + padding + verticalGap;
        }
        distance = 1;
      } else {
        overlap = circle.radius + padding - distance;
      }

      const direction = circleIsA ? -1 : 1;
      return {
        unitX: (dx / distance) * direction,
        unitY: (dy / distance) * direction,
        overlap
      };
    }

    resolveCollisions(nodes, passes = 3) {
      for (let pass = 0; pass < passes; pass += 1) {
        for (let i = 0; i < nodes.length; i += 1) {
          const a = nodes[i];
          for (let j = i + 1; j < nodes.length; j += 1) {
            const b = nodes[j];
            const { unitX, unitY, overlap } = this.collisionDisplacement(a, b);
            if (overlap <= 0) continue;

            const movableCount = Number(!a.fixed) + Number(!b.fixed);
            if (!movableCount) continue;
            const correction = overlap / movableCount;
            if (!a.fixed) {
              a.x -= unitX * correction;
              a.y -= unitY * correction;
            }
            if (!b.fixed) {
              b.x += unitX * correction;
              b.y += unitY * correction;
            }
          }
        }
        for (const node of nodes) this.clampNode(node);
      }
    }

    applyTransform() {
      this.viewport.setAttribute(
        "transform",
        `translate(${this.transform.x} ${this.transform.y}) scale(${this.transform.k})`
      );
    }

    restart(alpha = 0.5) {
      this.alpha = Math.max(this.alpha, alpha);
      if (!this.frame) this.frame = requestAnimationFrame(() => this.tick());
    }

    tick() {
      const activeNodes = this.nodes.filter((node) => this.visible(node));
      const activeEdges = this.edges.filter(
        (edge) => this.visible(edge.sourceNode) && this.visible(edge.targetNode)
      );
      const alpha = this.alpha;

      for (const edge of activeEdges) {
        const source = edge.sourceNode;
        const target = edge.targetNode;
        const dx = target.x - source.x;
        const dy = target.y - source.y;
        const distance = Math.max(1, Math.hypot(dx, dy));
        const unitX = dx / distance;
        const unitY = dy / distance;
        const desired =
          this.boundaryDistance(source, unitX, unitY) +
          this.boundaryDistance(target, -unitX, -unitY) +
          72;
        const strength = (distance - desired) * 0.018 * alpha;
        const fx = unitX * strength;
        const fy = unitY * strength;
        if (!source.fixed) {
          source.vx += fx;
          source.vy += fy;
        }
        if (!target.fixed) {
          target.vx -= fx;
          target.vy -= fy;
        }
      }

      for (let i = 0; i < activeNodes.length; i += 1) {
        const a = activeNodes[i];
        for (let j = i + 1; j < activeNodes.length; j += 1) {
          const b = activeNodes[j];
          let dx = b.x - a.x;
          let dy = b.y - a.y;
          let distanceSquared = dx * dx + dy * dy;
          if (distanceSquared < 1) {
            dx = ((hashNumber(`${a.id}${b.id}`) % 20) - 10) / 10;
            dy = ((hashNumber(`${b.id}${a.id}`) % 20) - 10) / 10;
            distanceSquared = dx * dx + dy * dy;
          }
          const distance = Math.sqrt(distanceSquared);
          const unitX = dx / distance;
          const unitY = dy / distance;
          const minimum =
            this.boundaryDistance(a, unitX, unitY) +
            this.boundaryDistance(b, -unitX, -unitY) +
            20;
          const charge = (3100 * alpha) / distanceSquared;
          const collision = distance < minimum ? (minimum - distance) * 0.105 * alpha : 0;
          const force = Math.min(5.2, charge + collision);
          const fx = unitX * force;
          const fy = unitY * force;
          if (!a.fixed) {
            a.vx -= fx;
            a.vy -= fy;
          }
          if (!b.fixed) {
            b.vx += fx;
            b.vy += fy;
          }
        }
      }

      const centerX = this.width * 0.5;
      const centerY = this.height * 0.5;
      for (const node of activeNodes) {
        const gravity = 0.0065;
        if (!node.fixed) {
          node.vx += (centerX - node.x) * gravity * alpha;
          node.vy += (centerY - node.y) * gravity * alpha;
          node.vx *= 0.83;
          node.vy *= 0.83;
          node.x += node.vx;
          node.y += node.vy;
          this.clampNode(node);
        }
      }
      this.resolveCollisions(activeNodes);

      this.renderPositions();
      this.alpha *= 0.968;
      if (this.alpha > 0.012 || this.drag) {
        this.frame = requestAnimationFrame(() => this.tick());
      } else {
        this.frame = null;
      }
    }

    renderPositions() {
      for (const edge of this.edges) {
        const line = this.edgeElements.get(edge);
        const dx = edge.targetNode.x - edge.sourceNode.x;
        const dy = edge.targetNode.y - edge.sourceNode.y;
        const distance = Math.max(1, Math.hypot(dx, dy));
        const unitX = dx / distance;
        const unitY = dy / distance;
        const sourceOffset = this.boundaryDistance(edge.sourceNode, unitX, unitY) + 2;
        const targetOffset = this.boundaryDistance(edge.targetNode, -unitX, -unitY) + 8;
        line.setAttribute("x1", edge.sourceNode.x + unitX * sourceOffset);
        line.setAttribute("y1", edge.sourceNode.y + unitY * sourceOffset);
        line.setAttribute("x2", edge.targetNode.x - unitX * targetOffset);
        line.setAttribute("y2", edge.targetNode.y - unitY * targetOffset);
      }
      for (const node of this.nodes) {
        this.nodeElements.get(node.id).setAttribute("transform", `translate(${node.x} ${node.y})`);
      }
    }
  }

  async function initialize() {
    const targets = document.querySelectorAll(
      "[data-knowledge-graph], [data-learning-queue], [data-reference-library], [data-graph-stat]"
    );
    if (!targets.length) return;
    try {
      const response = await fetch(dataUrl, { cache: "no-cache" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const graph = await response.json();
      updateStats(graph);
      renderQueue(graph);
      renderReferenceLibraries(graph);
      document.querySelectorAll("[data-knowledge-graph]").forEach((container) => {
        new KnowledgeGraph(container, graph);
      });
    } catch (error) {
      console.error("Knowledge graph could not be loaded", error);
      document
        .querySelectorAll("[data-knowledge-graph], [data-learning-queue], [data-reference-library]")
        .forEach((container) => {
        container.replaceChildren();
        const message = element(
          "div",
          "graph-loading",
          "지식 지도를 불러오지 못했습니다. Quarto preview로 열었는지 확인해 주세요."
        );
          container.append(message);
        });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize, { once: true });
  } else {
    initialize();
  }
})();
