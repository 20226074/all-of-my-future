"""Build and validate the browser-ready knowledge graph from Quarto metadata."""

from __future__ import annotations

import json
import math
import re
import sys
from pathlib import Path
from typing import Any

import yaml


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "assets" / "generated" / "knowledge-graph.json"
GRAPH_VIEW = ROOT / "data" / "graph-view.json"
NODE_ID_PATTERN = re.compile(r"^(topic|entry|ref)-[a-z0-9][a-z0-9-]*$")
READING_STATUSES = {"inbox", "queued", "reading", "complete"}
NOTE_STATUSES = {"stub", "ai-draft", "checked", "verified"}
REFERENCE_TYPES = {"paper", "book"}
ENTRY_KINDS = {"project", "question", "statement", "note", "idea"}


def read_front_matter(path: Path) -> dict[str, Any] | None:
    text = path.read_text(encoding="utf-8-sig")
    lines = text.splitlines()
    if not lines or lines[0].strip() != "---":
        return None
    try:
        end = next(i for i, line in enumerate(lines[1:], start=1) if line.strip() == "---")
    except StopIteration:
        raise ValueError(f"{path.relative_to(ROOT)}: YAML front matter가 닫히지 않았습니다.")
    data = yaml.safe_load("\n".join(lines[1:end])) or {}
    if not isinstance(data, dict):
        raise ValueError(f"{path.relative_to(ROOT)}: front matter는 mapping이어야 합니다.")
    return data


def page_url(path: Path) -> str:
    relative = path.relative_to(ROOT)
    if relative.name == "index.qmd":
        return relative.parent.as_posix().rstrip("/") + "/"
    return relative.with_suffix(".html").as_posix()


def scalar_text(value: Any) -> str:
    if isinstance(value, list):
        parts: list[str] = []
        for item in value:
            if isinstance(item, dict):
                parts.append(" ".join(str(item.get(k, "")) for k in ("given", "family")).strip())
            else:
                parts.append(str(item))
        return ", ".join(part for part in parts if part)
    return str(value or "")


def first_author_text(value: Any) -> str:
    if isinstance(value, list):
        return scalar_text(value[0]) if value else ""
    text = scalar_text(value).strip()
    if not text:
        return ""
    return re.split(r"\s*(?:;|\band\b|,)\s*", text, maxsplit=1)[0].strip()


def load_graph_view(errors: list[str]) -> dict[str, Any]:
    default = {"schemaVersion": 1, "explorerOrder": [], "nodes": {}}
    if not GRAPH_VIEW.exists():
        return default
    try:
        data = json.loads(GRAPH_VIEW.read_text(encoding="utf-8-sig"))
    except (OSError, json.JSONDecodeError) as exc:
        errors.append(f"{GRAPH_VIEW.relative_to(ROOT)}: JSON을 읽을 수 없습니다: {exc}")
        return default
    if not isinstance(data, dict):
        errors.append(f"{GRAPH_VIEW.relative_to(ROOT)}: 최상위 값은 object여야 합니다.")
        return default
    if data.get("schemaVersion") != 1:
        errors.append(f"{GRAPH_VIEW.relative_to(ROOT)}: schemaVersion은 1이어야 합니다.")
    if not isinstance(data.get("explorerOrder", []), list):
        errors.append(f"{GRAPH_VIEW.relative_to(ROOT)}: explorerOrder는 node-id 목록이어야 합니다.")
    if not isinstance(data.get("nodes", {}), dict):
        errors.append(f"{GRAPH_VIEW.relative_to(ROOT)}: nodes는 object여야 합니다.")
    return {
        "schemaVersion": 1,
        "explorerOrder": data.get("explorerOrder", []),
        "nodes": data.get("nodes", {}),
    }


def bibliography_keys() -> set[str]:
    bib_path = ROOT / "bibliography" / "references.bib"
    if not bib_path.exists():
        return set()
    text = bib_path.read_text(encoding="utf-8-sig")
    return set(re.findall(r"@[A-Za-z]+\s*\{\s*([^,\s]+)\s*,", text))


def load_relation_types() -> tuple[set[str], set[str]]:
    path = ROOT / "data" / "relation-types.yml"
    data = yaml.safe_load(path.read_text(encoding="utf-8"))
    directed = set(data.get("directed", []))
    undirected = set(data.get("undirected", []))
    implicit = set(data.get("implicit", []))
    return directed | undirected | implicit, undirected


def main() -> int:
    errors: list[str] = []
    graph_view = load_graph_view(errors)
    records: list[tuple[Path, dict[str, Any]]] = []
    content_roots = [ROOT / "topics", ROOT / "entries", ROOT / "references"]
    source_paths = [
        path
        for content_root in content_roots
        for path in sorted(content_root.glob("**/index.qmd"))
    ]

    for path in source_paths:
        if path.parent in set(content_roots):
            continue
        try:
            metadata = read_front_matter(path)
        except ValueError as exc:
            errors.append(str(exc))
            continue
        if not metadata:
            errors.append(f"{path.relative_to(ROOT)}: graph page에 YAML front matter가 없습니다.")
            continue
        node_type = metadata.get("node-type")
        if node_type not in {"topic", "entry", "reference"}:
            errors.append(
                f"{path.relative_to(ROOT)}: node-type은 topic, entry, reference 중 하나여야 합니다."
            )
            continue
        records.append((path, metadata))

    allowed_relations, undirected_relations = load_relation_types()
    citekeys = bibliography_keys()
    nodes: list[dict[str, Any]] = []
    metadata_by_id: dict[str, tuple[Path, dict[str, Any]]] = {}
    attachments_by_id: dict[str, list[str]] = {}

    for path, meta in records:
        relative = path.relative_to(ROOT).as_posix()
        node_id = str(meta.get("node-id", "")).strip()
        node_type = str(meta.get("node-type", "")).strip()
        if not NODE_ID_PATTERN.fullmatch(node_id):
            errors.append(f"{relative}: 잘못된 node-id '{node_id}'")
            continue
        if node_id in metadata_by_id:
            other = metadata_by_id[node_id][0].relative_to(ROOT).as_posix()
            errors.append(f"{relative}: node-id '{node_id}'가 {other}와 중복됩니다.")
            continue
        expected_prefix = {"topic": "topic-", "entry": "entry-", "reference": "ref-"}.get(node_type)
        if not expected_prefix or not node_id.startswith(expected_prefix):
            errors.append(f"{relative}: node-id prefix와 node-type이 일치하지 않습니다.")
        metadata_by_id[node_id] = (path, meta)

        title = scalar_text(meta.get("title"))
        node: dict[str, Any] = {
            "id": node_id,
            "kind": node_type,
            "label": scalar_text(meta.get("short-title")) or title,
            "title": title,
            "summary": scalar_text(meta.get("graph-summary") or meta.get("description")),
            "url": page_url(path),
            "status": scalar_text(meta.get("status")),
            "priority": scalar_text(meta.get("priority")),
            "tags": list(meta.get("tags") or []),
            "searchAliases": list(meta.get("search-aliases") or []),
        }

        if node_type in {"topic", "entry"}:
            importance = meta.get("importance", 3)
            if not isinstance(importance, int) or isinstance(importance, bool) or not 1 <= importance <= 5:
                errors.append(f"{relative}: importance는 1부터 5 사이의 정수여야 합니다.")
                importance = 3
            view_node = graph_view.get("nodes", {}).get(node_id, {})
            if isinstance(view_node, dict) and "importance" in view_node:
                view_importance = view_node.get("importance")
                if (
                    not isinstance(view_importance, int)
                    or isinstance(view_importance, bool)
                    or not 1 <= view_importance <= 5
                ):
                    errors.append(
                        f"{GRAPH_VIEW.relative_to(ROOT)}: {node_id}.importance는 1부터 5 사이의 정수여야 합니다."
                    )
                else:
                    importance = view_importance
            node.update(
                {
                    "maturity": scalar_text(meta.get("maturity")),
                    "importance": importance,
                    "cluster": scalar_text(meta.get("cluster")) or node_id.split("-", 1)[1],
                }
            )
            if node_type == "entry":
                entry_kind = scalar_text(meta.get("entry-kind"))
                if entry_kind not in ENTRY_KINDS:
                    errors.append(
                        f"{relative}: entry-kind는 {', '.join(sorted(ENTRY_KINDS))} 중 하나여야 합니다."
                    )
                node["entryKind"] = entry_kind
        else:
            reference_type = scalar_text(meta.get("reference-type"))
            reading_status = scalar_text(meta.get("reading-status"))
            note_status = scalar_text(meta.get("note-status"))
            citekey = scalar_text(meta.get("citekey"))
            primary_node = scalar_text(meta.get("primary-node"))
            raw_attached_to = meta.get("attached-to") if "attached-to" in meta else meta.get("topics", [])
            attached_to: list[str] = []
            if not isinstance(raw_attached_to, list):
                errors.append(f"{relative}: attached-to는 node-id 목록이어야 합니다.")
            else:
                for target in raw_attached_to:
                    if not isinstance(target, str) or not target.strip():
                        errors.append(f"{relative}: attached-to의 각 값은 비어 있지 않은 node-id여야 합니다.")
                        continue
                    target = target.strip()
                    if target not in attached_to:
                        attached_to.append(target)
            attachments_by_id[node_id] = attached_to
            if reference_type not in REFERENCE_TYPES:
                errors.append(f"{relative}: reference-type은 paper 또는 book이어야 합니다.")
            if reading_status not in READING_STATUSES:
                errors.append(f"{relative}: 알 수 없는 reading-status '{reading_status}'")
            if note_status not in NOTE_STATUSES:
                errors.append(f"{relative}: 알 수 없는 note-status '{note_status}'")
            if citekey not in citekeys:
                errors.append(f"{relative}: citekey '{citekey}'가 bibliography에 없습니다.")
            if not primary_node:
                errors.append(f"{relative}: primary-node가 필요합니다.")
            elif primary_node not in attached_to:
                errors.append(f"{relative}: primary-node '{primary_node}'는 attached-to에도 있어야 합니다.")
            if meta.get("source-checked") not in {True, False}:
                errors.append(f"{relative}: source-checked는 true 또는 false여야 합니다.")
            node.update(
                {
                    "referenceType": reference_type,
                    "readingStatus": reading_status,
                    "noteStatus": note_status,
                    "sourceChecked": bool(meta.get("source-checked")),
                    "citekey": citekey,
                    "year": meta.get("year"),
                    "author": scalar_text(meta.get("author")),
                    "firstAuthor": first_author_text(meta.get("author")),
                    "attachedTo": attached_to,
                    "primaryNode": primary_node,
                    "cluster": "references",
                }
            )
        nodes.append(node)

    edges: list[dict[str, Any]] = []
    known_ids = set(metadata_by_id)
    graph_node_ids = {
        node_id
        for node_id, (_, meta) in metadata_by_id.items()
        if meta.get("node-type") in {"topic", "entry"}
    }

    validated_order: list[str] = []
    seen_order: set[str] = set()
    for node_id in graph_view.get("explorerOrder", []):
        if not isinstance(node_id, str) or not node_id.strip():
            errors.append(f"{GRAPH_VIEW.relative_to(ROOT)}: explorerOrder에는 node-id 문자열만 쓸 수 있습니다.")
            continue
        node_id = node_id.strip()
        if node_id in seen_order:
            errors.append(f"{GRAPH_VIEW.relative_to(ROOT)}: explorerOrder에 '{node_id}'가 중복됩니다.")
            continue
        if node_id not in graph_node_ids:
            errors.append(f"{GRAPH_VIEW.relative_to(ROOT)}: explorerOrder의 '{node_id}'는 그래프 노드가 아닙니다.")
            continue
        seen_order.add(node_id)
        validated_order.append(node_id)

    validated_view_nodes: dict[str, dict[str, Any]] = {}
    for node_id, config in graph_view.get("nodes", {}).items():
        if node_id not in graph_node_ids:
            errors.append(f"{GRAPH_VIEW.relative_to(ROOT)}: nodes의 '{node_id}'는 그래프 노드가 아닙니다.")
            continue
        if not isinstance(config, dict):
            errors.append(f"{GRAPH_VIEW.relative_to(ROOT)}: nodes.{node_id}는 object여야 합니다.")
            continue
        cleaned: dict[str, Any] = {}
        if "importance" in config:
            value = config.get("importance")
            if not isinstance(value, int) or isinstance(value, bool) or not 1 <= value <= 5:
                errors.append(
                    f"{GRAPH_VIEW.relative_to(ROOT)}: nodes.{node_id}.importance는 1부터 5 사이의 정수여야 합니다."
                )
            else:
                cleaned["importance"] = value
        has_x = "x" in config
        has_y = "y" in config
        if has_x != has_y:
            errors.append(f"{GRAPH_VIEW.relative_to(ROOT)}: nodes.{node_id}의 x와 y는 함께 있어야 합니다.")
        elif has_x and has_y:
            x = config.get("x")
            y = config.get("y")
            coordinates = (x, y)
            if any(
                isinstance(value, bool)
                or not isinstance(value, (int, float))
                or not math.isfinite(value)
                or not 0 <= value <= 1
                for value in coordinates
            ):
                errors.append(
                    f"{GRAPH_VIEW.relative_to(ROOT)}: nodes.{node_id}의 x와 y는 0부터 1 사이의 유한한 수여야 합니다."
                )
            else:
                cleaned.update({"x": float(x), "y": float(y)})
        if "pinned" in config:
            pinned = config.get("pinned")
            if not isinstance(pinned, bool):
                errors.append(f"{GRAPH_VIEW.relative_to(ROOT)}: nodes.{node_id}.pinned은 boolean이어야 합니다.")
            else:
                cleaned["pinned"] = pinned
        validated_view_nodes[node_id] = cleaned

    for source_id, (path, meta) in metadata_by_id.items():
        relative = path.relative_to(ROOT).as_posix()
        node_type = meta.get("node-type")

        if node_type == "reference":
            for target in attachments_by_id.get(source_id, []):
                if target not in known_ids:
                    errors.append(f"{relative}: attached-to target '{target}'가 존재하지 않습니다.")
                elif metadata_by_id[target][1].get("node-type") not in {"topic", "entry"}:
                    errors.append(f"{relative}: attached-to target은 concept 또는 entry여야 합니다: '{target}'")
                edges.append(
                    {
                        "source": source_id,
                        "target": target,
                        "relation": "documents",
                        "directed": True,
                        "note": "이 문헌이 연결된 지식 노드",
                        "evidence": [],
                    }
                )

        for relation in meta.get("relations") or []:
            if not isinstance(relation, dict):
                errors.append(f"{relative}: relations 항목은 mapping이어야 합니다.")
                continue
            target = scalar_text(relation.get("target"))
            relation_type = scalar_text(relation.get("type"))
            evidence = list(relation.get("evidence") or [])
            if target not in known_ids:
                errors.append(f"{relative}: relation target '{target}'가 존재하지 않습니다.")
            else:
                target_type = metadata_by_id[target][1].get("node-type")
                if node_type not in {"topic", "entry"} or target_type not in {"topic", "entry"}:
                    errors.append(
                        f"{relative}: 수동 relation은 concept와 entry 사이에서만 만들 수 있습니다."
                    )
            if relation_type not in allowed_relations:
                errors.append(f"{relative}: 허용되지 않은 relation type '{relation_type}'")
            if relation_type == "documents":
                errors.append(f"{relative}: documents 관계는 attached-to에서 자동 생성됩니다.")
            for key in evidence:
                if key not in citekeys:
                    errors.append(f"{relative}: evidence citekey '{key}'가 bibliography에 없습니다.")
            edges.append(
                {
                    "source": source_id,
                    "target": target,
                    "relation": relation_type,
                    "directed": relation_type not in undirected_relations,
                    "note": scalar_text(relation.get("note")),
                    "evidence": evidence,
                }
            )

    if errors:
        print("Knowledge graph validation failed:", file=sys.stderr)
        for error in errors:
            print(f"  - {error}", file=sys.stderr)
        return 1

    nodes.sort(key=lambda node: node["title"].casefold())
    edges.sort(key=lambda edge: (edge["source"], edge["target"], edge["relation"]))

    graph = {
        "schemaVersion": 3,
        "generatedFrom": "Quarto front matter",
        "stats": {
            "topics": sum(node["kind"] == "topic" for node in nodes),
            "entries": sum(node["kind"] == "entry" for node in nodes),
            "graphNodes": sum(node["kind"] in {"topic", "entry"} for node in nodes),
            "references": sum(node["kind"] == "reference" for node in nodes),
            "papers": sum(node.get("referenceType") == "paper" for node in nodes),
            "books": sum(node.get("referenceType") == "book" for node in nodes),
            "graphRelations": sum(edge["relation"] != "documents" for edge in edges),
            "documentLinks": sum(edge["relation"] == "documents" for edge in edges),
            "relations": len(edges),
        },
        "view": {
            "schemaVersion": 1,
            "explorerOrder": validated_order,
            "nodes": validated_view_nodes,
        },
        "nodes": nodes,
        "edges": edges,
    }
    rendered = json.dumps(graph, ensure_ascii=False, indent=2) + "\n"
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    previous = OUTPUT.read_text(encoding="utf-8") if OUTPUT.exists() else None
    if previous != rendered:
        OUTPUT.write_text(rendered, encoding="utf-8", newline="\n")
        action = "updated"
    else:
        action = "unchanged"
    print(
        f"Knowledge graph {action}: {len(nodes)} nodes, {len(edges)} edges -> "
        f"{OUTPUT.relative_to(ROOT)}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
