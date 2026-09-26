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
          for (const topicId of reference.topics || []) {
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

  class KnowledgeGraph {
    constructor(container, graph) {
      this.container = container;
      this.mode = container.dataset.mode || "full";
      this.rawGraph = graph;
      this.nodes = graph.nodes.map((node) => ({ ...node, x: 0, y: 0, vx: 0, vy: 0 }));
      this.nodeById = new Map(this.nodes.map((node) => [node.id, node]));
      this.edges = graph.edges
        .filter((edge) => this.nodeById.has(edge.source) && this.nodeById.has(edge.target))
        .map((edge) => ({
          ...edge,
          sourceNode: this.nodeById.get(edge.source),
          targetNode: this.nodeById.get(edge.target)
        }));
      this.neighbors = new Map(this.nodes.map((node) => [node.id, []]));
      for (const edge of this.edges) {
        this.neighbors.get(edge.source).push({ node: edge.targetNode, edge, outgoing: true });
        this.neighbors.get(edge.target).push({ node: edge.sourceNode, edge, outgoing: false });
      }
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

    build() {
      this.container.replaceChildren();
      this.app = element("div", "graph-app");

      this.explorer = element("div", "graph-explorer");
      this.explorer.setAttribute("role", "navigation");
      this.explorer.setAttribute("aria-label", "지식 그래프 탐색기");
      const explorerHeader = element("div", "explorer-header");
      explorerHeader.append(element("p", "explorer-kicker", "ATLAS"));
      const searchWrap = element("label", "explorer-search-wrap");
      this.searchInput = element("input", "explorer-search");
      this.searchInput.type = "search";
      this.searchInput.placeholder = "개념·논문·책 검색";
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
      this.explorer.append(explorerHeader, this.explorerTree);

      const zoomOut = this.actionButton("−", "축소", () => this.zoomBy(0.82));
      const reset = this.actionButton("↺", "보기 초기화", () => this.resetView());
      const zoomIn = this.actionButton("+", "확대", () => this.zoomBy(1.22));
      const canvasControls = element("div", "graph-canvas-controls");
      canvasControls.append(zoomOut, reset, zoomIn);

      this.stage = element("div", "graph-stage");
      this.svg = svgElement("svg", {
        role: "img",
        "aria-label": "토픽과 레퍼런스의 관계 그래프",
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
      this.linkLayer = svgElement("g", { class: "graph-links" });
      this.nodeLayer = svgElement("g", { class: "graph-nodes" });
      this.viewport.append(this.linkLayer, this.nodeLayer);
      this.svg.append(this.viewport);
      this.stage.append(this.svg, canvasControls);

      const legend = element("div", "graph-legend");
      legend.innerHTML =
        '<span class="legend-item"><i class="legend-shape topic"></i> Concept</span>' +
        '<span class="legend-item"><i class="legend-shape reference"></i> Paper / Book</span>';
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
      return `${(node.referenceType || "SOURCE").toUpperCase()}${node.year ? ` · ${node.year}` : ""}`;
    }

    buildExplorer() {
      this.explorerItems = new Map();
      const ordered = [...this.nodes].sort((a, b) => a.title.localeCompare(b.title, "ko"));

      for (const node of ordered) {
        const item = element("li", "explorer-item");
        item.dataset.nodeId = node.id;
        item.setAttribute("role", "treeitem");
        const row = element("div", "explorer-row");
        const uniqueNeighbors = [...new Map(
          (this.neighbors.get(node.id) || []).map((neighbor) => [neighbor.node.id, neighbor])
        ).values()].sort((a, b) => a.node.title.localeCompare(b.node.title, "ko"));

        const toggle = element("button", "explorer-toggle", uniqueNeighbors.length ? "›" : "·");
        toggle.type = "button";
        toggle.setAttribute("aria-label", `${node.label}의 직접 연결 펼치기`);
        toggle.setAttribute("aria-expanded", "false");
        toggle.disabled = !uniqueNeighbors.length;

        const select = element("button", "explorer-node");
        select.type = "button";
        select.append(
          element("span", `explorer-node-icon ${node.kind}`, node.kind === "topic" ? "○" : "▤"),
          element("span", "explorer-node-label", node.label),
          element("span", "explorer-node-type", this.nodeTypeLabel(node))
        );
        select.addEventListener("click", () => this.selectNode(node, true));
        row.append(toggle, select);

        const children = element("ul", "explorer-children");
        children.setAttribute("role", "group");
        children.hidden = true;
        for (const neighbor of uniqueNeighbors) {
          const child = element("li", "explorer-child-item");
          const childButton = element("button", "explorer-child");
          childButton.type = "button";
          childButton.append(
            element("span", `explorer-node-icon ${neighbor.node.kind}`, neighbor.node.kind === "topic" ? "○" : "▤"),
            element("span", "explorer-node-label", neighbor.node.label)
          );
          childButton.title = relationLabel(neighbor.edge.relation);
          childButton.addEventListener("click", () => this.selectNode(neighbor.node, true));
          child.append(childButton);
          children.append(child);
        }

        toggle.addEventListener("click", () => {
          const expanded = toggle.getAttribute("aria-expanded") === "true";
          toggle.setAttribute("aria-expanded", String(!expanded));
          toggle.textContent = expanded ? "›" : "⌄";
          children.hidden = expanded;
        });

        item.append(row, children);
        this.explorerTree.append(item);
        this.explorerItems.set(node.id, { item, select, children, toggle });
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
          "aria-label": `${node.kind === "topic" ? "토픽" : node.referenceType}: ${node.title}`
        });
        group.style.setProperty("--node-color", clusterColors[node.cluster] || "var(--atlas-teal)");

        if (node.kind === "topic") {
          group.append(svgElement("circle", { class: "node-shape", r: 40 }));
        } else {
          group.append(
            svgElement("rect", {
              class: "node-shape",
              x: -57,
              y: -29,
              width: 114,
              height: 58,
              rx: 10
            })
          );
        }

        const text = svgElement("text", { y: node.kind === "topic" ? -4 : -3 });
        const kicker = svgElement("tspan", { class: "node-kicker", x: 0, dy: node.kind === "topic" ? -7 : -8 });
        kicker.textContent = node.kind === "topic" ? "CONCEPT" : node.referenceType;
        text.append(kicker);
        const lines = splitLabel(node.label, node.kind === "topic" ? 18 : 21);
        lines.forEach((line, index) => {
          const span = svgElement("tspan", { x: 0, dy: index === 0 ? 17 : 13 });
          span.textContent = line;
          text.append(span);
        });
        group.append(text);

        const title = svgElement("title");
        title.textContent = node.title;
        group.append(title);
        group.addEventListener("click", (event) => {
          event.stopPropagation();
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
        }
      }
      this.renderPositions();
      this.restart(0.45);
    }

    positionNodes() {
      const centerX = this.width * 0.5;
      const centerY = this.height * 0.5;
      const topics = this.nodes.filter((node) => node.kind === "topic");
      const topicRadius = Math.min(this.width, this.height) * 0.31;
      topics.forEach((node, index) => {
        const angle = -Math.PI / 2 + (index * Math.PI * 2) / Math.max(topics.length, 1);
        node.x = centerX + Math.cos(angle) * topicRadius;
        node.y = centerY + Math.sin(angle) * topicRadius * 0.72;
      });
      const references = this.nodes.filter((node) => node.kind === "reference");
      references.forEach((node) => {
        const anchors = (this.neighbors.get(node.id) || [])
          .map((neighbor) => neighbor.node)
          .filter((neighbor) => neighbor.kind === "topic");
        const anchor = anchors.length
          ? {
              x: anchors.reduce((sum, item) => sum + item.x, 0) / anchors.length,
              y: anchors.reduce((sum, item) => sum + item.y, 0) / anchors.length
            }
          : { x: centerX, y: centerY };
        const angle = ((hashNumber(node.id) % 360) * Math.PI) / 180;
        node.x = anchor.x + Math.cos(angle) * 105;
        node.y = anchor.y + Math.sin(angle) * 80;
      });
    }

    visible() {
      return true;
    }

    applyVisibility() {
      const matches = new Set();
      if (this.query) {
        for (const node of this.nodes) {
          if (this.searchText(node).includes(this.query)) matches.add(node.id);
        }
      }

      for (const node of this.nodes) {
        const group = this.nodeElements.get(node.id);
        const searchMuted = this.query && !matches.has(node.id);
        group.classList.toggle("is-search-muted", Boolean(searchMuted));
        const explorerItem = this.explorerItems.get(node.id);
        explorerItem.item.hidden = Boolean(this.query && !matches.has(node.id));
      }
      for (const edge of this.edges) {
        const line = this.edgeElements.get(edge);
        const searchMuted = this.query && !(matches.has(edge.source) && matches.has(edge.target));
        line.classList.toggle("is-search-muted", Boolean(searchMuted));
      }

      const count = this.query ? matches.size : this.nodes.length;
      this.explorerCount.textContent = this.query
        ? `${count}개 검색 결과`
        : `${this.nodes.length}개 노드 · 모두 동등한 시작점`;
      this.explorer.classList.toggle("is-searching", Boolean(this.query));

      if (this.query && matches.size === 1) {
        const match = this.nodeById.get([...matches][0]);
        if (match) this.selectNode(match, false);
      } else {
        this.updateSelectionClasses();
      }
    }

    selectNode(node, center) {
      this.selected = node;
      this.showPanel(node);
      this.updateSelectionClasses();
      if (center) this.centerNode(node);
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

      const type = node.kind === "topic" ? "CONCEPT" : `${node.referenceType} · ${node.year || ""}`;
      this.panel.append(element("p", "panel-type", type));
      this.panel.append(element("h3", "", node.title));
      this.panel.append(element("p", "panel-summary", node.summary || "설명을 준비 중입니다."));

      const badges = element("div", "panel-badges");
      if (node.kind === "topic") {
        for (const status of [node.status, node.maturity].filter(Boolean)) {
          const badge = element("span", "status-badge", statusLabel(status));
          badge.dataset.status = status;
          badges.append(badge);
        }
      } else {
        for (const status of [node.readingStatus, node.noteStatus].filter(Boolean)) {
          const badge = element("span", "status-badge", statusLabel(status));
          badge.dataset.status = status;
          badges.append(badge);
        }
      }
      this.panel.append(badges);

      const relations = (this.neighbors.get(node.id) || []).filter((item) => this.visible(item.node));
      if (relations.length) {
        const relationSection = element("div", "panel-relations");
        relationSection.append(element("h4", "", `직접 연결 ${relations.length}`));
        const list = element("ul");
        for (const item of relations.slice(0, 8)) {
          const li = element("li");
          const link = element("a", "", item.node.label);
          link.href = "#";
          link.addEventListener("click", (event) => {
            event.preventDefault();
            this.selectNode(item.node, true);
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
        this.svg.setPointerCapture(event.pointerId);
        if (nodeGroup) {
          const node = this.nodeById.get(
            [...this.nodeElements.entries()].find(([, group]) => group === nodeGroup)?.[0]
          );
          if (!node) return;
          const point = this.toGraphPoint(event);
          this.drag = { node, offsetX: node.x - point.x, offsetY: node.y - point.y };
          node.fixed = true;
          this.restart(0.35);
        } else {
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
          const point = this.toGraphPoint(event);
          this.drag.node.x = point.x + this.drag.offsetX;
          this.drag.node.y = point.y + this.drag.offsetY;
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
        if (this.drag) this.drag.node.fixed = false;
        this.drag = null;
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
        const desired = source.kind === "topic" && target.kind === "topic" ? 185 : 118;
        const strength = (distance - desired) * 0.018 * alpha;
        const fx = (dx / distance) * strength;
        const fy = (dy / distance) * strength;
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
          const minimum = (a.kind === "topic" ? 52 : 65) + (b.kind === "topic" ? 52 : 65);
          const charge = ((a.kind === "topic" || b.kind === "topic" ? 2600 : 1550) * alpha) / distanceSquared;
          const collision = distance < minimum ? (minimum - distance) * 0.04 * alpha : 0;
          const force = Math.min(2.8, charge + collision);
          const fx = (dx / distance) * force;
          const fy = (dy / distance) * force;
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
          const margin = node.kind === "topic" ? 55 : 68;
          node.x = Math.max(margin, Math.min(this.width - margin, node.x));
          node.y = Math.max(margin, Math.min(this.height - margin, node.y));
        }
      }

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
        line.setAttribute("x1", edge.sourceNode.x);
        line.setAttribute("y1", edge.sourceNode.y);
        line.setAttribute("x2", edge.targetNode.x);
        line.setAttribute("y2", edge.targetNode.y);
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
