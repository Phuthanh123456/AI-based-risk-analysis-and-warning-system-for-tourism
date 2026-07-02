import re

_ws = re.compile(r"\s+")

def normalize_space(s: str) -> str:
    if not s:
        return s
    return _ws.sub(" ", s).strip()
