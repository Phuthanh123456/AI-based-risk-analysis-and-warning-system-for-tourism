from typing import Dict, Any, List, Tuple
from collections import defaultdict
import re

from src.common.io import read_yaml

def _norm(s: str) -> str:
    return (s or "").lower()

def load_keywords(path: str = "configs/keywords.yaml") -> Dict[str, Any]:
    return read_yaml(path)

def count_hits(text: str, phrases: List[str]) -> Tuple[int, List[str]]:
    """
    Simple substring counting (case-insensitive).
    Returns (hit_count, matched_phrases_unique)
    """
    t = _norm(text)
    matched = []
    hit = 0
    for p in phrases:
        p2 = _norm(p)
        if not p2:
            continue
        if p2 in t:
            matched.append(p)
            # count occurrences (cap later)
            hit += t.count(p2)
    # unique keep
    matched_uniq = list(dict.fromkeys(matched))
    return hit, matched_uniq

def build_risk_features(title: str, text: str, kw_cfg: Dict[str, Any]) -> Dict[str, Any]:
    full = (title or "") + "\n\n" + (text or "")
    tourism = kw_cfg.get("tourism_context", {})
    risk_kw = kw_cfg.get("risk_keywords", {})
    fatal_kw = kw_cfg.get("fatality_keywords", [])
    filtering = kw_cfg.get("filtering", {})
    scoring = kw_cfg.get("scoring", {})

    # tourism hits
    tourism_hits, tourism_matched = count_hits(full, tourism.get("must_any", []))
    soft_neg_hits, soft_neg_matched = count_hits(full, tourism.get("soft_negative_any", []))

    # risk groups
    group_hits = {}
    group_matched = {}
    total_groups = []

    for g, phrases in risk_kw.items():
        h, m = count_hits(full, phrases)
        group_hits[g] = h
        group_matched[g] = m
        if h > 0:
            total_groups.append(g)

    # fatality
    fatal_hits, fatal_matched = count_hits(full, fatal_kw)

    # keep/drop
    risk_min_hits_keep = int(filtering.get("risk_min_hits_keep", 1))
    tourism_min_hits = int(filtering.get("tourism_min_hits", 1))
    drop_only_soft = bool(filtering.get("drop_if_only_soft_negative", True))

    risk_total_hits = sum(group_hits.values())
    tourism_ok = tourism_hits >= tourism_min_hits

    keep = (risk_total_hits >= risk_min_hits_keep) or tourism_ok
    if drop_only_soft and (risk_total_hits == 0) and (tourism_hits > 0) and (soft_neg_hits > 0):
        # still keep negatives for training; but mark as soft negative
        pass

    risk_any = risk_total_hits >= risk_min_hits_keep

    # scoring
    base_map = scoring.get("group_base_score", {})
    per_hit_add = float(scoring.get("per_hit_add", 0.5))
    per_group_cap = int(scoring.get("per_group_hit_cap", 6))
    fatal_boost = float(scoring.get("fatality_boost", 4.0))
    fatal_cap = int(scoring.get("fatality_cap", 2))
    total_cap = float(scoring.get("total_score_cap", 20.0))

    score = 0.0
    for g in total_groups:
        score += float(base_map.get(g, 2.0))
        score += per_hit_add * min(per_group_cap, max(0, group_hits.get(g, 0)))

    score += fatal_boost * min(fatal_cap, fatal_hits)
    score = min(total_cap, score)

    return {
        "tourism_hits": tourism_hits,
        "tourism_matched": tourism_matched,
        "soft_negative_hits": soft_neg_hits,
        "soft_negative_matched": soft_neg_matched,
        "risk_any": bool(risk_any),
        "risk_groups": total_groups,
        "risk_hits_by_group": group_hits,
        "matched_phrases": group_matched,
        "fatality_hits": fatal_hits,
        "fatality_matched": fatal_matched,
        "risk_score_rule": score,
        "keep": bool(keep),
    }
