import requests
from typing import Optional, Dict, Any

def fetch_html(url: str, timeout_s: int = 25) -> Dict[str, Any]:
    """
    Fetch raw HTML of article URL.
    Return dict with html (or None) + status_code + final_url.
    """
    headers = {
        "User-Agent": "travel-risk-bot/1.0 (+https://example.local)",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    }
    try:
        r = requests.get(url, timeout=timeout_s, headers=headers, allow_redirects=True)
        return {
            "ok": r.ok,
            "status_code": r.status_code,
            "final_url": r.url,
            "html": r.text if r.ok else None,
        }
    except Exception as e:
        return {
            "ok": False,
            "status_code": None,
            "final_url": None,
            "html": None,
            "error": str(e),
        }
