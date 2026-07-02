# src/api/utils.py
"""
Shared helpers: text normalization, JSONL I/O, province YAML,
DataFrame schema, risk scoring, time formatting.
"""
import json
import os
import re
import unicodedata
from typing import Any, Dict, List, Optional, Tuple

import pandas as pd
import yaml
from fastapi import HTTPException

from src.api.config import FEATURES_PATH, PROVINCES_CFG, RISK_GROUPS, PLACE_MAP

# ============================================================
# In-memory DataFrame cache
# ============================================================
_df_cache: Optional[pd.DataFrame] = None
_df_mtime: Optional[float] = None

# ============================================================
# Province YAML cache (file rarely changes)
# ============================================================
_provinces_yaml_cache: Optional[Dict[str, Any]] = None
_provinces_yaml_mtime: Optional[float] = None
_province_centroids_cache: Optional[Dict[str, Tuple[float, float]]] = None
_province_alias_cache: Optional[Dict[str, str]] = None


# ---- Pre-compiled regex patterns ----
_RE_WHITESPACE = re.compile(r"\s+")

# ---- text helpers ----

def normalize_key(place: str) -> str:
    return (
        (place or "").strip().upper()
        .replace(" ", "").replace(".", "")
        .replace("-", "").replace("_", "")
    )


def strip_accents(s: str) -> str:
    if not s:
        return ""
    s = unicodedata.normalize("NFD", s)
    return "".join(ch for ch in s if unicodedata.category(ch) != "Mn")


def norm_text(s: str) -> str:
    s = strip_accents((s or "").lower())
    return _RE_WHITESPACE.sub(" ", s).strip()


# ---- JSONL I/O ----

def safe_read_jsonl(path: str) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    bad_lines = 0
    first_bad = None

    with open(path, "r", encoding="utf-8") as f:
        for i, line in enumerate(f, start=1):
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
                if isinstance(obj, dict):
                    rows.append(obj)
                else:
                    bad_lines += 1
            except Exception as e:
                bad_lines += 1
                if first_bad is None:
                    first_bad = {"line_no": i, "error": str(e), "line_head": line[:200]}

    if bad_lines:
        print(f"[API WARN] skipped_bad_lines={bad_lines}")
        if first_bad:
            print(f"[API WARN] first_bad={first_bad}")
    return rows


# ---- DataFrame helpers ----

def _to_list_safe(x) -> List[Any]:
    return [v for v in x if isinstance(v, str)] if isinstance(x, list) else []


def _published_to_str(x) -> str:
    if isinstance(x, str):
        return x
    if x is None:
        return ""
    try:
        return json.dumps(x, ensure_ascii=False)
    except Exception:
        return str(x)


def ensure_schema(df: pd.DataFrame) -> pd.DataFrame:
    defaults = {
        "province": None, "quality_pass": False, "published_at": None,
        "risk_groups": None, "risk_score_rule": 0.0, "id": None,
    }
    for col, default in defaults.items():
        if col not in df.columns:
            if col == "risk_groups":
                df[col] = [[] for _ in range(len(df))]
            else:
                df[col] = default

    df["quality_pass"] = df["quality_pass"].fillna(False).astype(bool)
    df["risk_groups"] = df["risk_groups"].apply(_to_list_safe)
    df["risk_score_rule"] = pd.to_numeric(df["risk_score_rule"], errors="coerce").fillna(0.0)

    pub = df["published_at"].apply(_published_to_str)
    ts = pd.to_datetime(pub, errors="coerce")
    df["pub_date"] = ts.apply(lambda x: x.date() if hasattr(x, "date") else None)
    return df


def load_features_df(force: bool = False) -> pd.DataFrame:
    global _df_cache, _df_mtime

    if not os.path.exists(FEATURES_PATH):
        raise HTTPException(status_code=404, detail=f"Missing features file: {FEATURES_PATH}")

    mtime = os.path.getmtime(FEATURES_PATH)
    if (not force) and (_df_cache is not None) and (_df_mtime == mtime):
        return _df_cache

    rows = safe_read_jsonl(FEATURES_PATH)
    if not rows:
        raise HTTPException(status_code=400, detail="No valid JSON rows in features JSONL.")

    df = pd.DataFrame(rows)
    df = ensure_schema(df)

    _df_cache = df
    _df_mtime = mtime
    print(f"[API] Loaded features rows={len(df)} from {FEATURES_PATH}")
    return df


# ---- Place resolution ----

def resolve_place(place: str) -> str:
    raw = (place or "").strip()
    if not raw:
        raise HTTPException(status_code=422, detail="place is required")
    return PLACE_MAP.get(normalize_key(raw), raw)


# ---- Risk scoring ----

def score_from_subset(df_sub: pd.DataFrame) -> Dict[str, Any]:
    n = int(len(df_sub))
    counts = {g: 0 for g in RISK_GROUPS}
    for groups in df_sub["risk_groups"].tolist():
        for g in groups:
            if g in counts:
                counts[g] += 1

    avg_rule = float(df_sub["risk_score_rule"].mean()) if n > 0 else 0.0
    overall = max(0.0, min(10.0, (avg_rule / 20.0) * 10.0))

    return {
        "num_articles": n,
        "risk_assessment": counts,
        "overall_risk_score": int(round(overall)),
    }


# ---- Province YAML helpers ----

def load_provinces_yaml() -> Dict[str, Any]:
    global _provinces_yaml_cache, _provinces_yaml_mtime, _province_centroids_cache, _province_alias_cache
    if not os.path.exists(PROVINCES_CFG):
        raise HTTPException(status_code=404, detail=f"Missing: {PROVINCES_CFG}")
    mtime = os.path.getmtime(PROVINCES_CFG)
    if _provinces_yaml_cache is not None and _provinces_yaml_mtime == mtime:
        return _provinces_yaml_cache
    with open(PROVINCES_CFG, "r", encoding="utf-8") as f:
        data = yaml.safe_load(f) or {}
    _provinces_yaml_cache = data
    _provinces_yaml_mtime = mtime
    # Invalidate dependent caches
    _province_centroids_cache = None
    _province_alias_cache = None
    return data


def load_province_centroids() -> Dict[str, Tuple[float, float]]:
    global _province_centroids_cache, _provinces_yaml_mtime
    # Reuse yaml cache mtime check
    cfg = load_provinces_yaml()
    current_mtime = _provinces_yaml_mtime
    if _province_centroids_cache is not None:
        return _province_centroids_cache
    out: Dict[str, Tuple[float, float]] = {}
    for it in cfg.get("provinces", []):
        name = (it.get("name") or "").strip()
        lat, lon = it.get("lat"), it.get("lon")
        if name and isinstance(lat, (int, float)) and isinstance(lon, (int, float)):
            out[name] = (float(lat), float(lon))
    _province_centroids_cache = out
    return out


def build_alias_index(cfg: Dict[str, Any]) -> Dict[str, str]:
    idx: Dict[str, str] = {}
    for p in cfg.get("provinces", []):
        name = (p.get("name") or "").strip()
        if not name:
            continue
        idx[norm_text(name)] = name
        for a in (p.get("aliases") or []):
            na = norm_text(str(a))
            if na:
                idx[na] = name
    return idx


def infer_province_from_text(text: str) -> Optional[str]:
    global _province_alias_cache
    if not text:
        return None
    cfg = load_provinces_yaml()
    if _province_alias_cache is None:
        _province_alias_cache = build_alias_index(cfg)
    idx = _province_alias_cache
    t = norm_text(text)
    for a in sorted(idx, key=len, reverse=True):
        if len(a) >= 3 and a in t:
            return idx[a]
    return None


# ---- Time formatting ----

def format_minutes_human(mins) -> Optional[str]:
    """'XX min' | 'Xh Ym' | 'Nd Xh'"""
    if mins is None:
        return None
    try:
        m = float(mins)
    except (TypeError, ValueError):
        return None
    if m < 0:
        return None
    if m < 60:
        return f"{int(round(m))} min"
    if m < 1440:
        h, rm = int(m // 60), int(round(m % 60))
        return f"{h}h {rm}m" if rm else f"{h}h"
    d, rh = int(m // 1440), int(round((m % 1440) / 60))
    return f"{d}d {rh}h" if rh else f"{d}d"
