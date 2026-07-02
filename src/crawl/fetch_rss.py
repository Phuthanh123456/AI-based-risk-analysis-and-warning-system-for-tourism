from typing import List, Dict, Any
import feedparser
import requests

from src.common.io import utc_now_iso
from src.common.url import canonicalize_url, sha1_hex
from src.common.text import normalize_space


def fetch_rss_feed(feed_url: str, timeout_s: int = 20):
    """
    Fetch RSS safely.
    If HTTP error (404/403/timeout) -> return None
    """
    try:
        r = requests.get(
            feed_url,
            timeout=timeout_s,
            headers={"User-Agent": "travel-risk-bot/1.0"},
        )
        r.raise_for_status()
        return feedparser.parse(r.content)
    except Exception as e:
        print(f"[RSS ERROR] {feed_url} -> {e}")
        return None


def parse_entries(parsed, source_name: str) -> List[Dict[str, Any]]:
    if parsed is None:
        return []

    out = []
    fetched_at = utc_now_iso()

    for e in parsed.entries:
        url = e.get("link") or e.get("id")
        title = normalize_space(e.get("title", "") or "")
        published = e.get("published") or e.get("updated") or None

        c_url = canonicalize_url(url) if url else None
        _id = sha1_hex(c_url or (title + "|" + (published or "")))

        out.append(
            {
                "id": _id,
                "source": "rss",
                "source_name": source_name,
                "url": url,
                "canonical_url": c_url,
                "title": title,
                "published_at": published,
                "fetched_at": fetched_at,
                "meta": {
                    "rss": {
                        "entry_id": e.get("id"),
                        "tags": [t.get("term") for t in (e.get("tags") or []) if isinstance(t, dict)],
                    }
                },
            }
        )
    return out
