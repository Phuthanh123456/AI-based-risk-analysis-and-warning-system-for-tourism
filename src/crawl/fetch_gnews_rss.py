from typing import List, Dict, Any
import urllib.parse
import feedparser
import requests

from src.common.io import utc_now_iso
from src.common.url import canonicalize_url, sha1_hex
from src.common.text import normalize_space

def build_gnews_rss_url(q: str, language: str = "vi", region: str = "VN", when: str | None = None) -> str:
    # Google News RSS search endpoint
    # Example: https://news.google.com/rss/search?q=...&hl=vi&gl=VN&ceid=VN:vi
    base = "https://news.google.com/rss/search"
    query = q
    if when:
        query = f"{q} when:{when}"
    params = {
        "q": query,
        "hl": language,
        "gl": region,
        "ceid": f"{region}:{language}",
    }
    return base + "?" + urllib.parse.urlencode(params)

def fetch_gnews_items(q: str, query_name: str, language="vi", region="VN", when: str | None = None, timeout_s: int = 20) -> List[Dict[str, Any]]:
    url = build_gnews_rss_url(q, language=language, region=region, when=when)
    r = requests.get(url, timeout=timeout_s, headers={"User-Agent": "travel-risk-bot/1.0"})
    r.raise_for_status()
    parsed = feedparser.parse(r.content)

    fetched_at = utc_now_iso()
    out = []
    for e in parsed.entries:
        link = e.get("link")
        title = normalize_space(e.get("title", "") or "")
        published = e.get("published") or e.get("updated") or None

        c_url = canonicalize_url(link) if link else None
        _id = sha1_hex(c_url or (title + "|" + (published or "")))

        out.append({
            "id": _id,
            "source": "gnews_rss",
            "source_name": query_name,
            "query": q,
            "url": link,
            "canonical_url": c_url,
            "title": title,
            "published_at": published,
            "fetched_at": fetched_at,
            "meta": {
                "gnews": {
                    "feed_url": url
                }
            }
        })
    return out
