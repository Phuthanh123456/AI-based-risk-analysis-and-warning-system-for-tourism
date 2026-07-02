import json
import os
from typing import Iterable, Dict, Any

def ensure_dir(path: str) -> None:
    os.makedirs(path, exist_ok=True)

def append_jsonl(path: str, records: Iterable[Dict[str, Any]]) -> int:
    ensure_dir(os.path.dirname(path))
    n = 0
    with open(path, "a", encoding="utf-8") as f:
        for r in records:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
            n += 1
    return n

def read_yaml(path: str) -> dict:
    import yaml
    with open(path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)

def utc_now_iso() -> str:
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).isoformat()
