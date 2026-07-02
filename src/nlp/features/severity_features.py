import re
import json
from typing import Dict, Any

RE_INT = r"(\d{1,3}(?:[.,]\d{3})*|\d+)"
RE_RANGE = rf"{RE_INT}\s*(?:-|–|—|đến|toi|to)\s*{RE_INT}"

NEGATION_PHRASES = [
    "không có thương vong",
    "không ghi nhận thương vong",
    "không ghi nhận thiệt hại về người",
    "không có người chết",
    "không có người tử vong",
    "không có người bị thương",
    "không ai bị thương",
    "không ai tử vong",
]

def _norm_int(s: str) -> int:
    s = s.replace(".", "").replace(",", "")
    try:
        return int(s)
    except Exception:
        return 0

def _safe_str(x) -> str:
    if isinstance(x, str):
        return x
    if x is None:
        return ""
    try:
        return json.dumps(x, ensure_ascii=False)
    except Exception:
        return str(x)

def _contains_neg(text: str) -> bool:
    t = text.lower()
    return any(p in t for p in NEGATION_PHRASES)

def _first_int(patterns, text: str) -> int:
    for pat in patterns:
        m = pat.search(text)
        if m:
            return _norm_int(m.group(1))
    return 0

def _first_range(patterns, text: str):
    for pat in patterns:
        m = pat.search(text)
        if m:
            a = _norm_int(m.group(1))
            b = _norm_int(m.group(2))
            return (min(a, b), max(a, b))
    return (0, 0)

def _has_any(keywords, text: str) -> int:
    t = text.lower()
    return 1 if any(k in t for k in keywords) else 0

PAT_DEATH_INT = [
    re.compile(rf"(?:làm|khiến|cướp đi)\s*{RE_INT}\s*(?:người\s*)?(?:tử vong|chết|thiệt mạng)", re.I),
    re.compile(rf"{RE_INT}\s*(?:người\s*)?(?:tử vong|chết|thiệt mạng)", re.I),
]
PAT_DEATH_RANGE = [
    re.compile(rf"(?:làm|khiến)\s*{RE_RANGE}\s*(?:người\s*)?(?:tử vong|chết|thiệt mạng)", re.I),
    re.compile(rf"{RE_RANGE}\s*(?:người\s*)?(?:tử vong|chết|thiệt mạng)", re.I),
]

PAT_INJ_INT = [
    re.compile(rf"(?:làm|khiến)\s*{RE_INT}\s*(?:người\s*)?(?:bị thương|nhập viện|cấp cứu)", re.I),
    re.compile(rf"{RE_INT}\s*(?:người\s*)?(?:bị thương|nhập viện|cấp cứu)", re.I),
]
PAT_INJ_RANGE = [
    re.compile(rf"(?:làm|khiến)\s*{RE_RANGE}\s*(?:người\s*)?(?:bị thương|nhập viện|cấp cứu)", re.I),
    re.compile(rf"{RE_RANGE}\s*(?:người\s*)?(?:bị thương|nhập viện|cấp cứu)", re.I),
]

PAT_MISSING = [re.compile(rf"{RE_INT}\s*(?:người\s*)?(?:mất tích|chưa tìm thấy)", re.I)]
PAT_EVAC = [re.compile(rf"{RE_INT}\s*(?:người\s*)?(?:sơ tán|di dời)", re.I)]

KW_FIRE = ["cháy", "hỏa hoạn", "bốc cháy", "cháy lớn", "cháy dữ dội", "cháy lan", "cột khói"]
KW_EXPLOSION = ["nổ", "phát nổ", "vụ nổ", "tiếng nổ"]
KW_COLLAPSE = ["sập", "đổ sập", "sập đổ", "sụt lún"]
KW_FLOOD = ["lũ", "lũ quét", "lũ ống", "ngập", "ngập sâu"]
KW_LANDSLIDE = ["sạt lở", "trượt lở", "đất đá sạt"]
KW_STORM = ["bão", "áp thấp", "dông lốc", "gió giật", "cấm biển", "mưa lớn"]
KW_SECURITY = ["cướp", "cướp giật", "trộm", "lừa đảo", "móc túi", "hành hung", "đe doạ", "bắt cóc"]

def severity_score_0_20(deaths: int, injuries: int, missing: int, evacuated: int,
                        fire: int, explosion: int, collapse: int, flood: int,
                        landslide: int, storm: int, security: int) -> int:
    score = 0
    score += min(12, deaths * 6)
    score += min(6, injuries)
    score += min(6, missing * 4)
    score += min(3, evacuated // 50)

    score += 2 if explosion else 0
    score += 2 if collapse else 0
    score += 2 if landslide else 0
    score += 1 if fire else 0
    score += 1 if flood else 0
    score += 1 if storm else 0
    score += 1 if security else 0

    if score < 0:
        score = 0
    if score > 20:
        score = 20
    return int(score)

def extract_severity(title: str, content: str) -> Dict[str, Any]:
    title = _safe_str(title)
    content = _safe_str(content)
    text = f"{title}\n{content}".strip()
    t_low = text.lower()

    has_neg = _contains_neg(text)

    d = _first_int(PAT_DEATH_INT, text)
    _, d_hi = _first_range(PAT_DEATH_RANGE, text)
    deaths = max(d, d_hi)

    inj = _first_int(PAT_INJ_INT, text)
    _, inj_hi = _first_range(PAT_INJ_RANGE, text)
    injuries = max(inj, inj_hi)

    missing = _first_int(PAT_MISSING, text)
    evacuated = _first_int(PAT_EVAC, text)

    if has_neg and d == 0 and d_hi == 0 and inj == 0 and inj_hi == 0:
        deaths = 0
        injuries = 0
        missing = 0

    fire = _has_any(KW_FIRE, text)
    explosion = _has_any(KW_EXPLOSION, text)
    collapse = _has_any(KW_COLLAPSE, text)
    flood = _has_any(KW_FLOOD, text)
    landslide = _has_any(KW_LANDSLIDE, text)
    storm = _has_any(KW_STORM, text)
    security = _has_any(KW_SECURITY, text)

    score = severity_score_0_20(deaths, injuries, missing, evacuated, fire, explosion, collapse, flood, landslide, storm, security)

    bucket = 2 if (deaths >= 1 or missing >= 1 or injuries >= 10) else (1 if injuries >= 1 else 0)

    return {
        "deaths": int(deaths),
        "injuries": int(injuries),
        "missing": int(missing),
        "evacuated": int(evacuated),
        "fire": int(fire),
        "explosion": int(explosion),
        "collapse": int(collapse),
        "flood": int(flood),
        "landslide": int(landslide),
        "storm": int(storm),
        "security": int(security),
        "severity_score": int(score),     # 0..20
        "severity_bucket": int(bucket),   # 0/1/2
        "has_negation_no_casualty": int(has_neg),
    }

def format_model_text(title: str, content: str, province: str = "", poi: str = "") -> str:
    f = extract_severity(title, content)
    sev = (f"[SEV] deaths={f['deaths']} injuries={f['injuries']} missing={f['missing']} evac={f['evacuated']} "
           f"sev_bucket={f['severity_bucket']} sev_score={f['severity_score']}")
    evt = (f"[EVENT] fire={f['fire']} explosion={f['explosion']} collapse={f['collapse']} flood={f['flood']} "
           f"landslide={f['landslide']} storm={f['storm']} security={f['security']}")
    ctx = f"[CTX] province={province or ''} poi={poi or ''}"
    txt = f"[TEXT] {title}. {content}"
    return "\n".join([sev, evt, ctx, txt])
