"""Build and validate the browser-ready knowledge graph from Quarto metadata."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Any

import yaml


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "assets" / "generated" / "knowledge-graph.json"
NODE_ID_PATTERN = re.compile(r"^(topic|ref)-[a-z0-9][a-z0-9-]*$")
READING_STATUSES = {"inbox", "queued", "reading", "complete"}
NOTE_STATUSES = {"stub", "ai-draft", "checked", "verified"}
REFERENCE_TYPES = {"paper", "book"}


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
    records: list[tuple[Path, dict[str, Any]]] = []
    source_paths = sorted((ROOT / "topics").glob("**/index.qmd")) + sorted(
        (ROOT / "references").glob("**/index.qmd")
    )

    for path in source_paths:
        if path.parent in {ROOT / "topics", ROOT / "references"}:
            continue
        try:
            metadata = read_front_matter(path)
        except ValueError as exc:
            errors.append(str(exc))
            continue
        if metadata and metadata.get("node-type") in {"topic", "reference"}:
            records.append((path, metadata))

    allowed_relations, undirected_relations = load_relation_types()
    citekeys = bibliography_keys()
    nodes: list[dict[str, Any]] = []
    metadata_by_id: dict[str, tuple[Path, dict[str, Any]]] = {}

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
        if node_id.startswith("topic-") != (node_type == "topic"):
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

        if node_type == "topic":
            node.update(
                {
                    "maturity": scalar_text(meta.get("maturity")),
                    "cluster": scalar_text(meta.get("cluster")) or node_id.removeprefix("topic-"),
                }
            )
        else:
            reference_type = scalar_text(meta.get("reference-type"))
            reading_status = scalar_text(meta.get("reading-status"))
            note_status = scalar_text(meta.get("note-status"))
            citekey = scalar_text(meta.get("citekey"))
            topics = list(meta.get("topics") or [])
            if reference_type not in REFERENCE_TYPES:
                errors.append(f"{relative}: reference-type은 paper 또는 book이어야 합니다.")
            if reading_status not in READING_STATUSES:
                errors.append(f"{relative}: 알 수 없는 reading-status '{reading_status}'")
            if note_status not in NOTE_STATUSES:
                errors.append(f"{relative}: 알 수 없는 note-status '{note_status}'")
            if citekey not in citekeys:
                errors.append(f"{relative}: citekey '{citekey}'가 bibliography에 없습니다.")
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
                    "topics": topics,
                    "cluster": (topics[0].removeprefix("topic-") if topics else "references"),
                }
            )
        nodes.append(node)

    edges: list[dict[str, Any]] = []
    known_ids = set(metadata_by_id)
    for source_id, (path, meta) in metadata_by_id.items():
        relative = path.relative_to(ROOT).as_posix()
        node_type = meta.get("node-type")

        if node_type == "reference":
            for target in meta.get("topics") or []:
                if target not in known_ids:
                    errors.append(f"{relative}: topics target '{target}'가 존재하지 않습니다.")
                edges.append(
                    {
                        "source": source_id,
                        "target": target,
                        "relation": "documents",
                        "directed": True,
                        "note": "이 레퍼런스가 다루는 토픽",
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
            if relation_type not in allowed_relations:
                errors.append(f"{relative}: 허용되지 않은 relation type '{relation_type}'")
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

    priority_order = {"now": 0, "core": 1, "next": 2, "later": 3, "": 4}
    nodes.sort(
        key=lambda node: (
            0 if node["id"] == "topic-sde" else 1,
            0 if node["kind"] == "topic" else 1,
            priority_order.get(node.get("priority", ""), 9),
            node["title"].casefold(),
        )
    )
    edges.sort(key=lambda edge: (edge["source"], edge["target"], edge["relation"]))

    graph = {
        "schemaVersion": 1,
        "generatedFrom": "Quarto front matter",
        "stats": {
            "topics": sum(node["kind"] == "topic" for node in nodes),
            "references": sum(node["kind"] == "reference" for node in nodes),
            "papers": sum(node.get("referenceType") == "paper" for node in nodes),
            "books": sum(node.get("referenceType") == "book" for node in nodes),
            "relations": len(edges),
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

