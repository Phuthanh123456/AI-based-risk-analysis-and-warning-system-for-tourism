from typing import Dict, Any, List, Tuple, Optional
import re
import unicodedata
from collections import defaultdict

from src.common.io import read_yaml

def strip_accents(s: str) -> str:
    if not s:
        return ""
    s = unicodedata.normalize("NFD", s)
    s = "".join(ch for ch in s if unicodedata.category(ch) != "Mn")
    return s

def norm(s: str) -> str:
    s = (s or "").lower()
    s = strip_accents(s)
    s = re.sub(r"\s+", " ", s).strip()
    return s

def load_provinces(path: str = "configs/provinces.yaml") -> Dict[str, Any]:
    return read_yaml(path)

def build_alias_index(cfg: Dict[str, Any]) -> Dict[str, str]:
    """
    Map normalized alias -> canonical province name
    Dedup by province name.
    """
    idx = {}
    seen_names = set()
    for p in cfg.get("provinces", []):
        name = p["name"]
        if name in seen_names:
            # allow duplicates in YAML; ignore later ones
            continue
        seen_names.add(name)
        aliases = p.get("aliases", [])
        for a in aliases:
            na = norm(a)
            if na:
                idx[na] = name
        # also add normalized canonical
        idx[norm(name)] = name
    return idx

def match_province(title: str, text: str, cfg: Dict[str, Any]) -> Dict[str, Any]:
    """
    Simple substring match in normalized text.
    Priority: title matches weigh higher.
    Returns province + confidence + evidence.
    """
    alias_idx = build_alias_index(cfg)

    t_title = norm(title)
    t_body = norm(text)
    full = (t_title + " " + t_body).strip()

    # score by occurrences; cap to avoid long articles inflating
    scores = defaultdict(float)
    evidence = defaultdict(list)

    # prioritize a list of special aliases in title
    pri = [norm(x) for x in cfg.get("priority_aliases", [])]

    for a, prov in alias_idx.items():
        if not a or len(a) < 3:
            continue
        in_title = a in t_title
        in_body = a in t_body
        if not (in_title or in_body):
            continue

        # base weights
        w = 0.0
        if in_title:
            w += 2.5
        if in_body:
            w += 1.0

        # priority alias boost
        if in_title and a in pri:
            w += 1.0

        # frequency
        freq = full.count(a)
        w += min(3.0, 0.4 * freq)

        scores[prov] += w
        if in_title:
            evidence[prov].append(f"title:{a}")
        if in_body:
            evidence[prov].append(f"body:{a}")

    if not scores:
        return {"province": None, "province_conf": 0.0, "province_evidence": []}

    best = max(scores.items(), key=lambda x: x[1])
    prov, s = best[0], best[1]

    # confidence heuristic
    conf = 1.0 - (1.0 / (1.0 + s))  # maps score->(0,1)
    conf = max(0.0, min(1.0, conf))

    ev = list(dict.fromkeys(evidence[prov]))[:6]
    return {"province": prov, "province_conf": conf, "province_evidence": ev}


