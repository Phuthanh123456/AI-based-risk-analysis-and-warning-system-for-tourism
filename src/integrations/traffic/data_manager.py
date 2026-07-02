from __future__ import annotations

import csv
import os
from typing import Dict, Any, List, Optional

from .config import CSV_FILE_PATH


def load_full_data(csv_path: Optional[str] = None, verbose: bool = False) -> List[Dict[str, Any]]:
    """
    Load accident blackspots from CSV.

    - Always returns a list (never None).
    - Accepts optional csv_path override.
    - No noisy prints by default (good for FastAPI).
    """
    path = csv_path or CSV_FILE_PATH
    data_list: List[Dict[str, Any]] = []

    if not path:
        if verbose:
            print("⚠️ ACCIDENT_CSV_PATH/CSV_FILE_PATH is empty.")
        return []

    if not os.path.exists(path):
        if verbose:
            print(f"⚠️ Not found: {path}")
        return []

    try:
        with open(path, mode="r", encoding="utf-8-sig", newline="") as f:
            reader = csv.DictReader(f)
            for row in reader:
                try:
                    # normalize keys -> lowercase
                    clean_row = {str(k).strip().lower(): (str(v).strip() if v is not None else "") for k, v in row.items() if k}

                    lat_str = clean_row.get("lat") or clean_row.get("latitude")
                    lon_str = clean_row.get("lon") or clean_row.get("lng") or clean_row.get("long") or clean_row.get("longitude")

                    if not lat_str or not lon_str:
                        continue

                    item = {
                        "lat": float(lat_str),
                        "lon": float(lon_str),
                        "date": clean_row.get("date", ""),
                        "title": clean_row.get("title", "Tai nạn không tên"),
                        "description": clean_row.get("description", ""),
                    }
                    data_list.append(item)
                except ValueError:
                    continue

        if verbose:
            print(f"✅ Loaded {len(data_list)} accidents from {path}")

    except Exception as e:
        if verbose:
            print(f"❌ Error reading CSV: {e}")
        return []

    return data_list
