from dataclasses import dataclass
import re

@dataclass
class QualityResult:
    pass_: bool
    score: float
    reasons: list

_ws = re.compile(r"\s+")
_nonword = re.compile(r"[^0-9A-Za-zÀ-ỹ]+")

def quality_check(text: str, min_chars: int = 600) -> QualityResult:
    reasons = []
    t = (text or "").strip()
    if len(t) < min_chars:
        reasons.append(f"too_short<{min_chars}")

    # rough duplication / boilerplate heuristic
    tokens = [x for x in _nonword.split(t.lower()) if x]
    if len(tokens) >= 50:
        unique_ratio = len(set(tokens)) / max(1, len(tokens))
        if unique_ratio < 0.18:
            reasons.append("low_unique_ratio")

    pass_ = (len(reasons) == 0)

    # score: simple mapping
    score = 1.0
    if "too_short" in " ".join(reasons):
        score -= 0.5
    if "low_unique_ratio" in reasons:
        score -= 0.3
    score = max(0.0, min(1.0, score))

    return QualityResult(pass_=pass_, score=score, reasons=reasons)
