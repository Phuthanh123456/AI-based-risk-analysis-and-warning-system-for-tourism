import json
from typing import Dict, Any, Iterable, List
from datetime import datetime
from dateutil import parser as dtparser
import csv

def iter_jsonl(path: str) -> Iterable[Dict[str, Any]]:
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            yield json.loads(line)

def to_date(published_at: str | None) -> str | None:
    if not published_at:
        return None
    try:
        dt = dtparser.parse(published_at)
        return dt.date().isoformat()
    except Exception:
        return None

def aggregate_province_daily(
    features_jsonl: str,
    out_csv: str,
    use_score_field: str = "risk_score_rule",
    min_quality: bool = True,
) -> None:
    # key: (date, province)
    agg = {}

    for r in iter_jsonl(features_jsonl):
        if min_quality and not r.get("quality_pass", False):
            continue

        d = to_date(r.get("published_at"))
        prov = r.get("province") or "UNKNOWN"
        if not d:
            continue

        key = (d, prov)
        if key not in agg:
            agg[key] = {
                "date": d,
                "province": prov,
                "articles": 0,
                "risk_any_count": 0,
                "score_sum": 0.0,
                "score_avg": 0.0,
                "province_conf_avg": 0.0,
            }

        agg[key]["articles"] += 1
        if r.get("risk_any", False):
            agg[key]["risk_any_count"] += 1

        score = float(r.get(use_score_field, 0.0) or 0.0)
        agg[key]["score_sum"] += score
        agg[key]["province_conf_avg"] += float(r.get("province_conf", 0.0) or 0.0)

    # finalize averages
    rows = []
    for v in agg.values():
        if v["articles"] > 0:
            v["score_avg"] = v["score_sum"] / v["articles"]
            v["province_conf_avg"] = v["province_conf_avg"] / v["articles"]
        rows.append(v)

    rows.sort(key=lambda x: (x["date"], x["province"]))

    fieldnames = ["date", "province", "articles", "risk_any_count", "score_sum", "score_avg", "province_conf_avg"]
    with open(out_csv, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        w.writerows(rows)
