"""Check rendered internal links and fragments without third-party dependencies."""

from __future__ import annotations

import sys
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit


ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / "_site"


class PageParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.links: list[str] = []
        self.ids: set[str] = set()

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = dict(attrs)
        identifier = values.get("id")
        if identifier:
            self.ids.add(identifier)
        for attribute in ("href", "src"):
            value = values.get(attribute)
            if value:
                self.links.append(value)


def resolve_target(page: Path, raw_url: str) -> tuple[Path | None, str]:
    parsed = urlsplit(raw_url)
    if parsed.scheme or parsed.netloc or raw_url.startswith("//"):
        return None, ""
    path_text = unquote(parsed.path)
    fragment = unquote(parsed.fragment)
    if not path_text:
        return page, fragment

    if path_text.startswith("/"):
        target = SITE / path_text.lstrip("/")
    else:
        target = page.parent / path_text
    target = target.resolve()
    try:
        target.relative_to(SITE.resolve())
    except ValueError:
        return target, fragment

    if path_text.endswith("/"):
        target = target / "index.html"
    elif target.is_dir():
        target = target / "index.html"
    elif not target.suffix and not target.exists():
        html_candidate = target.with_suffix(".html")
        index_candidate = target / "index.html"
        target = html_candidate if html_candidate.exists() else index_candidate
    return target, fragment


def main() -> int:
    if not SITE.exists():
        print("_site가 없습니다. 먼저 quarto render를 실행하세요.", file=sys.stderr)
        return 1

    pages: dict[Path, PageParser] = {}
    for path in sorted(SITE.rglob("*.html")):
        parser = PageParser()
        parser.feed(path.read_text(encoding="utf-8", errors="replace"))
        pages[path.resolve()] = parser

    errors: list[str] = []
    for page, parser in pages.items():
        relative_page = page.relative_to(SITE.resolve()).as_posix()
        for raw_url in parser.links:
            if raw_url.startswith(("mailto:", "tel:", "javascript:", "data:")):
                continue
            target, fragment = resolve_target(page, raw_url)
            if target is None:
                continue
            if not target.exists():
                errors.append(f"{relative_page}: 없는 대상 '{raw_url}'")
                continue
            if fragment and target.suffix.lower() in {".html", ".htm"}:
                target_parser = pages.get(target.resolve())
                if target_parser and fragment not in target_parser.ids:
                    errors.append(f"{relative_page}: 없는 fragment '{raw_url}'")

    if errors:
        print("Internal link check failed:", file=sys.stderr)
        for error in errors:
            print(f"  - {error}", file=sys.stderr)
        return 1

    print(f"Internal link check passed: {len(pages)} HTML pages")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

