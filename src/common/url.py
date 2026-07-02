import hashlib
from urllib.parse import urlparse, parse_qsl, urlencode, urlunparse

def canonicalize_url(url: str) -> str:
    if not url:
        return url
    u = urlparse(url.strip())
    # strip utm_*
    q = [(k, v) for k, v in parse_qsl(u.query, keep_blank_values=True) if not k.lower().startswith("utm_")]
    new_q = urlencode(q, doseq=True)
    # drop fragment
    return urlunparse((u.scheme or "https", (u.netloc or "").lower(), u.path, u.params, new_q, ""))

def sha1_hex(s: str) -> str:
    return hashlib.sha1(s.encode("utf-8")).hexdigest()
