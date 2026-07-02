from typing import Optional, Dict, Any
import trafilatura
from bs4 import BeautifulSoup

from src.common.text import normalize_space

def extract_text_from_html(html: str) -> str:
    """
    Prefer trafilatura; fallback to BeautifulSoup text.
    """
    if not html:
        return ""

    # 1) trafilatura
    try:
        txt = trafilatura.extract(
            html,
            include_comments=False,
            include_tables=False,
            include_formatting=False,
            favor_precision=False,
            favor_recall=True,
        )
        if txt and len(txt.strip()) > 0:
            return normalize_space(txt)
    except Exception:
        pass

    # 2) BeautifulSoup fallback
    try:
        soup = BeautifulSoup(html, "lxml")
        # remove obvious junk
        for tag in soup(["script", "style", "noscript"]):
            tag.decompose()
        txt = soup.get_text(" ", strip=True)
        return normalize_space(txt)
    except Exception:
        return ""
