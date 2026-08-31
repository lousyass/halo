#!/usr/bin/env python3
"""
One-time FMHY /video snapshot importer for Halo.

What it does:
- Fetches https://fmhy.net/video once.
- Parses the main content headings and list items.
- Preserves the source's heading hierarchy as category/section/subsection.
- Captures the first resource link in each list item plus all links found in that item.
- Deduplicates exact URL entries while preserving their first-seen order.
- Writes a static JSON snapshot for the Halo frontend.
- NEVER writes anything to Supabase.

Usage:
    python scrape_fmhy_video.py

Output:
    fmhy-video-snapshot.json
"""

from __future__ import annotations

import json
import re
import sys
from dataclasses import dataclass, asdict
from html import unescape
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin, urlparse
from urllib.request import Request, urlopen

SOURCE_URL = "https://fmhy.net/video"
OUTPUT = Path("fmhy-video-snapshot.json")
USER_AGENT = "Halo-FMHY-One-Time-Importer/1.0"

# Keep these configurable so the one-time snapshot can be cleaned manually later.
INTERNAL_HOSTS = {
    "fmhy.net",
    "www.fmhy.net",
    "github.com",  # FMHY GitHub links are still useful resources when present.
}

# Common non-resource/support link labels that should not become the primary item.
NON_PRIMARY_LABELS = {
    "status", "discord", "telegram", "github", "docs", "wiki", "mirrors",
    "mirror", "backup", "backups", "2", "3", "4", "5", "6", "7",
    "requests", "guide", "setup guide", "plugins", "tools", "resources",
    "full list", "archive",
}


@dataclass
class Link:
    label: str
    url: str


@dataclass
class Resource:
    name: str
    url: str
    category: str | None
    section: str | None
    subsection: str | None
    description: str
    all_links: list[Link]
    source: str = SOURCE_URL


class FMHYParser(HTMLParser):
    """
    Lightweight HTML parser using only Python stdlib.
    It focuses on the page's main content and list items.
    """

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.main_depth = 0
        self.heading_level: int | None = None
        self.heading_text: list[str] = []
        self.in_li = False
        self.li_text: list[str] = []
        self.li_links: list[Link] = []
        self.anchor_label: list[str] = []
        self.anchor_href: str | None = None
        self.heading_stack: dict[int, str] = {}
        self.resources: list[Resource] = []

    @property
    def in_main(self) -> bool:
        return self.main_depth > 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attr = dict(attrs)

        if tag == "main":
            self.main_depth += 1
            return

        if not self.in_main:
            return

        if tag in {"h1", "h2", "h3", "h4", "h5"}:
            self.heading_level = int(tag[1:])
            self.heading_text = []

        elif tag == "li":
            self.in_li = True
            self.li_text = []
            self.li_links = []

        elif tag == "a" and self.in_li:
            self.anchor_href = attr.get("href")
            self.anchor_label = []

    def handle_endtag(self, tag: str) -> None:
        if tag == "main":
            self.main_depth = max(0, self.main_depth - 1)
            return

        if not self.in_main:
            return

        if tag in {"h1", "h2", "h3", "h4", "h5"} and self.heading_level is not None:
            text = clean_text("".join(self.heading_text))
            if text:
                level = self.heading_level
                self.heading_stack[level] = text
                for deeper in range(level + 1, 6):
                    self.heading_stack.pop(deeper, None)
            self.heading_level = None
            self.heading_text = []

        elif tag == "a" and self.in_li and self.anchor_href is not None:
            label = clean_text("".join(self.anchor_label))
            if label and self.anchor_href:
                url = urljoin(SOURCE_URL, self.anchor_href)
                if is_http_url(url):
                    self.li_links.append(Link(label=label, url=url))
            self.anchor_href = None
            self.anchor_label = []

        elif tag == "li" and self.in_li:
            description = clean_text("".join(self.li_text))
            self.add_resource(description, self.li_links)
            self.in_li = False
            self.li_text = []
            self.li_links = []

    def handle_data(self, data: str) -> None:
        if not self.in_main:
            return

        if self.heading_level is not None:
            self.heading_text.append(data)

        if self.in_li:
            self.li_text.append(data)
            if self.anchor_href is not None:
                self.anchor_label.append(data)

    def add_resource(self, description: str, links: list[Link]) -> None:
        if not links:
            return

        primary = choose_primary_link(links)
        if primary is None:
            return

        category = self.heading_stack.get(2)
        section = self.heading_stack.get(3)
        subsection = self.heading_stack.get(4)

        # Strip the primary label from the beginning of the description when possible.
        clean_description = description
        if clean_description.lower().startswith(primary.label.lower()):
            clean_description = clean_description[len(primary.label):].strip(" -–—:/")

        self.resources.append(
            Resource(
                name=primary.label,
                url=primary.url,
                category=category,
                section=section,
                subsection=subsection,
                description=clean_description,
                all_links=links,
            )
        )


def clean_text(text: str) -> str:
    text = unescape(text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def is_http_url(url: str) -> bool:
    try:
        return urlparse(url).scheme in {"http", "https"}
    except ValueError:
        return False


def choose_primary_link(links: list[Link]) -> Link | None:
    for link in links:
        label = link.label.strip().lower()
        if label not in NON_PRIMARY_LABELS:
            return link
    return links[0] if links else None


def fetch_html() -> str:
    request = Request(
        SOURCE_URL,
        headers={
            "User-Agent": USER_AGENT,
            "Accept": "text/html,application/xhtml+xml",
        },
    )
    with urlopen(request, timeout=30) as response:
        charset = response.headers.get_content_charset() or "utf-8"
        return response.read().decode(charset, errors="replace")


def dedupe(resources: list[Resource]) -> list[Resource]:
    seen: set[str] = set()
    out: list[Resource] = []

    for resource in resources:
        # Dedupe on primary URL; alternate links remain inside all_links.
        if resource.url in seen:
            continue
        seen.add(resource.url)
        out.append(resource)

    return out


def main() -> int:
    try:
        html = fetch_html()
    except Exception as exc:
        print(f"ERROR: failed to fetch {SOURCE_URL}: {exc}", file=sys.stderr)
        return 1

    parser = FMHYParser()
    parser.feed(html)
    parser.close()

    resources = dedupe(parser.resources)

    payload = {
        "source": SOURCE_URL,
        "snapshot_type": "one-time",
        "generated_at_utc": __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat(),
        "notes": [
            "Static snapshot for Halo; no runtime scraping.",
            "Review links manually before production use.",
            "Do not store this dataset in Supabase; keep it in the frontend source tree.",
        ],
        "resource_count": len(resources),
        "resources": [
            {
                **{k: v for k, v in asdict(r).items() if k != "all_links"},
                "all_links": [asdict(link) for link in r.all_links],
            }
            for r in resources
        ],
    }

    OUTPUT.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    print(f"Wrote {len(resources)} resources to {OUTPUT.resolve()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
