"""Download and extract readable article bodies.

RSS summaries from Balkan media run 100-500 characters, which is not enough text to
tell `premijer` (prime minister) from `premijera` (film premiere), or to see whether a
story is actually about the subscribed topic or merely name-drops it. The full body runs
1k-9k characters and settles both questions, so relevance and translation both read it.
"""

from __future__ import annotations

import os
import re
from concurrent.futures import ThreadPoolExecutor, as_completed

import httpx
import trafilatura

# Cost/latency knobs (override via env)
FETCH_CONCURRENCY = int(os.environ.get("BODY_FETCH_CONCURRENCY", "8"))
FETCH_TIMEOUT = float(os.environ.get("BODY_FETCH_TIMEOUT", "15"))
MAX_BODY_CHARS = int(os.environ.get("BODY_MAX_CHARS", "6000"))

# Real browser UA: several Balkan sites return 403 to obvious bots.
BROWSER_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
)

_WS = re.compile(r"[ \t]+")
_BLANK_LINES = re.compile(r"\n{3,}")


def clip_text(text: str, limit: int) -> str:
    """Clip to `limit`, preferring a paragraph or sentence break in the last 40%."""
    text = (text or "").strip()
    if len(text) <= limit:
        return text
    chunk = text[:limit]
    for sep in ("\n\n", "\n", ". ", "! ", "? "):
        pos = chunk.rfind(sep)
        if pos >= int(limit * 0.6):
            return chunk[: pos + len(sep)].strip()
    return chunk.strip()


def _tidy(text: str) -> str:
    text = _WS.sub(" ", (text or "").replace("\r", ""))
    text = _BLANK_LINES.sub("\n\n", text)
    return text.strip()


def extract_body(html: str) -> str:
    """Main text of an article page, or '' when the page has no readable body."""
    if not html:
        return ""
    try:
        text = trafilatura.extract(
            html,
            include_comments=False,
            include_tables=False,
            include_images=False,
            no_fallback=False,
        )
    except Exception:  # noqa: BLE001 - trafilatura raises assorted parser errors
        return ""
    return clip_text(_tidy(text or ""), MAX_BODY_CHARS)


def fetch_body(client: httpx.Client, url: str) -> str:
    try:
        resp = client.get(url)
        resp.raise_for_status()
        ctype = resp.headers.get("content-type", "")
        if ctype and "html" not in ctype.lower():
            return ""
        return extract_body(resp.text)
    except Exception:  # noqa: BLE001 - one dead link must not stop the crawl
        return ""


def fetch_bodies(urls: list[str]) -> dict[str, str]:
    """url -> body text. Missing/failed URLs are simply absent from the result."""
    urls = [u for u in dict.fromkeys(urls) if u]
    if not urls:
        return {}

    out: dict[str, str] = {}
    headers = {"User-Agent": BROWSER_UA, "Accept-Language": "sr,hr,bs,en;q=0.8"}
    with httpx.Client(
        timeout=FETCH_TIMEOUT,
        follow_redirects=True,
        headers=headers,
        limits=httpx.Limits(max_connections=FETCH_CONCURRENCY),
    ) as client:
        with ThreadPoolExecutor(max_workers=FETCH_CONCURRENCY) as pool:
            futures = {pool.submit(fetch_body, client, u): u for u in urls}
            for fut in as_completed(futures):
                url = futures[fut]
                try:
                    body = fut.result()
                except Exception:  # noqa: BLE001
                    continue
                if body:
                    out[url] = body
    return out
