from __future__ import annotations

import os
import re
import time
from typing import Any, Dict, Optional, Tuple, List

import requests

from .config import SERPAPI_KEY  # can be str or list

SERPAPI_URL = "https://serpapi.com/search"

# ===================== PRE-COMPILED REGEX PATTERNS =====================
_RE_HOURS = re.compile(r'(\d+)\s*(giờ|tiếng|h\b|hour|hrs?)')
_RE_MINUTES = re.compile(r'(\d+)\s*(phút|p\b|min|m\b)')
_RE_DIGITS = re.compile(r'\d+')
_RE_NUMERIC = re.compile(r"([\d.,]+)")

# ===================== SERPAPI GEOCODE CACHE =====================
_SERPAPI_GEO_CACHE_TTL = 86400  # 24 hours
_serpapi_geo_cache: Dict[str, dict] = {}  # key -> {"ts": float, "result": (lat,lon,name)}


def _serpapi_geo_cache_get(query: str) -> Optional[Tuple[Optional[float], Optional[float], Optional[str]]]:
    key = query.strip().lower()
    entry = _serpapi_geo_cache.get(key)
    if not entry:
        return None
    if time.time() - entry["ts"] > _SERPAPI_GEO_CACHE_TTL:
        _serpapi_geo_cache.pop(key, None)
        return None
    return entry["result"]


def _serpapi_geo_cache_set(query: str, result: Tuple[Optional[float], Optional[float], Optional[str]]):
    key = query.strip().lower()
    if len(_serpapi_geo_cache) > 500:
        cutoff = time.time() - _SERPAPI_GEO_CACHE_TTL
        expired = [k for k, v in _serpapi_geo_cache.items() if v["ts"] < cutoff]
        for k in expired:
            _serpapi_geo_cache.pop(k, None)
    _serpapi_geo_cache[key] = {"ts": time.time(), "result": result}


def _keys() -> List[str]:
    """
    Support multiple keys:
      - config.SERPAPI_KEY can be str or list[str]
      - env SERPAPI_KEYS="k1,k2"
      - env SERPAPI_KEY="k1"
    Priority: env SERPAPI_KEYS > env SERPAPI_KEY > config.SERPAPI_KEY
    """
    ks = (os.getenv("SERPAPI_KEYS") or "").strip()
    if ks:
        return [k.strip() for k in ks.split(",") if k.strip()]

    k = (os.getenv("SERPAPI_KEY") or "").strip()
    if k:
        return [k]

    if isinstance(SERPAPI_KEY, list):
        return [x.strip() for x in SERPAPI_KEY if isinstance(x, str) and x.strip()]
    if isinstance(SERPAPI_KEY, str) and SERPAPI_KEY.strip():
        return [SERPAPI_KEY.strip()]
    return []


def _call_serpapi(params: Dict[str, Any], timeout: int = 20) -> Dict[str, Any]:
    """
    Rotate through keys until success.
    Raises RuntimeError on failure.
    """
    keys = _keys()
    if not keys:
        raise RuntimeError(
            "Missing SerpAPI key. Set env SERPAPI_KEY or SERPAPI_KEYS, or config.SERPAPI_KEY."
        )

    last_err: Optional[str] = None
    for key in keys:
        try:
            p = dict(params)
            p["api_key"] = key
            r = requests.get(SERPAPI_URL, params=p, timeout=timeout)
            data = r.json()
            print(data)
            # SerpAPI returns {"error": "..."} for quota/bad key/etc.
            if isinstance(data, dict) and data.get("error"):
                last_err = str(data.get("error"))
                continue
            return data
        except Exception as e:
            last_err = repr(e)
            continue

    raise RuntimeError(f"SerpAPI request failed after trying {len(keys)} keys: {last_err}")


def parse_time_str(time_str):
    if not time_str: return 0
    s = str(time_str).lower()
    
    hours = 0
    minutes = 0
    
    # Tìm số giờ (Có chữ giờ, tiếng, hour, hoặc h đứng một mình)
    h_match = _RE_HOURS.search(s)
    if h_match:
        hours = int(h_match.group(1))
        
    # Tìm số phút (Có chữ phút, min, hoặc m đứng một mình)
    m_match = _RE_MINUTES.search(s)
    if m_match:
        minutes = int(m_match.group(1))
        
    # Nếu API trả về mỗi 1 số trống không (VD: "15") mà không có chữ
    if hours == 0 and minutes == 0:
        nums = [int(n) for n in _RE_DIGITS.findall(s)]
        if nums:
            return nums[0]
            
    # Trả về tổng số phút
    return hours * 60 + minutes


def _first_float(text: Any) -> float:
    """
    Parse first number from text, handling VN locale where '.' is thousands separator.
    Examples:
      '1.116 km'  -> 1116.0   (VN locale: dot = thousands sep)
      '313 km'    -> 313.0
      '1,5 km'    -> 1.5      (VN locale: comma = decimal sep)      '2.5 km'    -> 2.5      (if clearly a decimal like X.Y with Y < 3 digits)
    """
    if not text:
        return 0.0
    s = str(text).strip()
    # Find the numeric part (digits, dots, commas)
    m = _RE_NUMERIC.search(s)
    if not m:
        return 0.0
    num_str = m.group(1)

    # Count dots and commas to determine locale
    dots = num_str.count(".")
    commas = num_str.count(",")

    if dots >= 1 and commas == 0:
        # Could be: "1.116" (VN thousands) or "2.5" (decimal)
        # Heuristic: if after the last dot there are exactly 3 digits -> thousands separator
        parts = num_str.split(".")
        if all(len(p) == 3 for p in parts[1:]):
            # VN locale: dots are thousands separators -> remove them
            return float(num_str.replace(".", ""))
        else:
            # Standard decimal: "2.5", "10.77"
            return float(num_str)
    elif commas >= 1 and dots == 0:
        # VN decimal: "1,5" -> 1.5, or "1,116" thousands
        parts = num_str.split(",")
        if len(parts) == 2 and len(parts[1]) == 3 and len(parts[0]) >= 1:
            # Ambiguous but likely thousands: "1,116" -> 1116
            return float(num_str.replace(",", ""))
        else:
            # Decimal comma: "1,5" -> "1.5"
            return float(num_str.replace(",", "."))
    elif dots >= 1 and commas >= 1:
        # Mixed: "1.116,5" (VN) or "1,116.5" (US)
        dot_pos = num_str.rfind(".")
        comma_pos = num_str.rfind(",")
        if comma_pos > dot_pos:
            # VN: "1.116,5" -> dots=thousands, comma=decimal
            return float(num_str.replace(".", "").replace(",", "."))
        else:
            # US: "1,116.5" -> commas=thousands, dot=decimal
            return float(num_str.replace(",", ""))
    else:
        return float(num_str)


def _status_bucket(ratio: float, speed_kmh: float) -> str:
    # pure status code (no emoji)
    if ratio >= 1.4:
        return "heavy"
    if ratio >= 1.2:
        return "moderate"
    if speed_kmh < 15:
        return "heavy"
    return "light"


def _emoji(status: str) -> str:
    return {"light": "🟢", "moderate": "🟠", "heavy": "🔴"}.get(status, "🟡")


def traffic_score_0_10(ratio: float, speed_kmh: float) -> int:
    """
    0..10 (10 = very bad)
    """
    score = 0.0
    if ratio >= 1.6:
        score += 8
    elif ratio >= 1.4:
        score += 6
    elif ratio >= 1.2:
        score += 4
    elif ratio >= 1.05:
        score += 2
    else:
        score += 1

    if speed_kmh < 10:
        score += 2
    elif speed_kmh < 15:
        score += 1

    score = max(0.0, min(10.0, score))
    return int(round(score))


def search_location_google(query: str) -> Tuple[Optional[float], Optional[float], Optional[str]]:
    """
    Returns: (lat, lon, full_name)
    Results cached for 24h to save SerpAPI quota.
    """
    cached = _serpapi_geo_cache_get(query)
    if cached is not None:
        return cached

    params = {
        "engine": "google_maps",
        "q": query,
        "type": "search",
        "hl": "vi",
        "gl": "vn",
    }

    try:
        data = _call_serpapi(params)
        item = None
        if isinstance(data.get("place_results"), dict):
            item = data["place_results"]
        elif isinstance(data.get("local_results"), list) and data["local_results"]:
            item = data["local_results"][0]

        if not item:
            return None, None, None

        gps = item.get("gps_coordinates") or {}
        lat = gps.get("latitude")
        lon = gps.get("longitude")
        if lat is None or lon is None:
            return None, None, None

        title = item.get("title") or query
        address = item.get("address") or ""
        full_name = f"{title}, {address}".strip(", ") if address and address not in title else title
        result = (float(lat), float(lon), full_name)
        _serpapi_geo_cache_set(query, result)
        return result
    except Exception:
        return None, None, None


def _extract_polyline(route: Dict[str, Any]) -> Optional[str]:
    """Extract polyline from SerpAPI route, trying all known key shapes."""
    if not isinstance(route, dict):
        return None

    # Direct top-level keys
    for k in ("route_polyline", "overview_polyline", "polyline", "encoded_polyline"):
        v = route.get(k)
        if isinstance(v, str) and v.strip():
            return v.strip()
        if isinstance(v, dict):
            pts = v.get("points") or v.get("point") or v.get("polyline")
            if isinstance(pts, str) and pts.strip():
                return pts.strip()    # Nested under overview / overview_route
    for parent_key in ("overview", "overview_route"):
        ov = route.get(parent_key)
        if not isinstance(ov, dict):
            continue
        for k in ("polyline", "overview_polyline", "encoded_polyline"):
            v = ov.get(k)
            if isinstance(v, str) and v.strip():
                return v.strip()
            if isinstance(v, dict):
                pts = v.get("points")
                if isinstance(pts, str) and pts.strip():
                    return pts.strip()

    return None


def _process_directions(directions_result: dict) -> dict:
        try:
            routes = directions_result.get("routes") or directions_result.get("directions")
            if not routes:
                return {"error": "No routes found"}

            route = routes[0]
            
            if "legs" in route and isinstance(route["legs"], list) and route["legs"]:
                leg = route["legs"][0]
            else:
                leg = route

            # ===== 1. KHOẢNG CÁCH (Xử lý cả Google và TrackAsia) =====
            dist_raw = route.get("formatted_distance") or leg.get("distance") or "0 km"
            dist_km = 0.0
            if isinstance(dist_raw, dict) and "value" in dist_raw:
                dist_km = float(dist_raw["value"]) / 1000.0
            elif isinstance(dist_raw, (int, float)):
                # TrackAsia trả về số mét trực tiếp
                dist_km = float(dist_raw) / 1000.0
            else:
                text_val = str(dist_raw.get("text", "") if isinstance(dist_raw, dict) else dist_raw).lower()
                # Use _first_float which handles VN locale (dot = thousands separator)
                val = _first_float(text_val)
                if "km" in text_val: dist_km = val
                elif "mi" in text_val: dist_km = val * 1.60934
                elif "m" in text_val: dist_km = val / 1000.0
                else: dist_km = val

            # ===== 2. THỜI GIAN (Xử lý chia 60s -> phút cho TrackAsia) =====
            normal_raw = leg.get("duration", 0)
            traffic_raw = leg.get("duration_in_traffic") or normal_raw

            time_normal = 0.0
            time_traffic = 0.0

            # Xử lý thời gian gốc (Normal)
            if isinstance(normal_raw, dict) and "value" in normal_raw:
                time_normal = float(normal_raw["value"]) / 60.0
            elif isinstance(normal_raw, (int, float)):
                # Dữ liệu TrackAsia (Giây) -> Đổi ra Phút
                time_normal = float(normal_raw) / 60.0
            else:
                val_text = normal_raw.get("text", normal_raw) if isinstance(normal_raw, dict) else normal_raw
                time_normal = float(parse_time_str(str(val_text)))

            # Xử lý thời gian giao thông (Traffic)
            if isinstance(traffic_raw, dict) and "value" in traffic_raw:
                time_traffic = float(traffic_raw["value"]) / 60.0
            elif isinstance(traffic_raw, (int, float)):
                time_traffic = float(traffic_raw) / 60.0
            else:
                val_text = traffic_raw.get("text", traffic_raw) if isinstance(traffic_raw, dict) else traffic_raw
                time_traffic = float(parse_time_str(str(val_text)))

            # ===== 3. TÍNH TOÁN DELAY, RATIO & VẬN TỐC =====
            delay = time_traffic - time_normal
            if delay < 0: delay = 0

            ratio = (time_traffic / time_normal) if time_normal > 0 else 1.0
            ratio = round(ratio, 2)

            speed_kmh = round(dist_km / (time_traffic / 60.0), 2) if time_traffic > 0 else 0.0

            # ===== 4. TRẠNG THÁI & POLYLINE =====
            status = _status_bucket(ratio, speed_kmh)
            route_polyline = _extract_polyline(route)

            return {
                "distance_km": float(dist_km),
                "time_normal_min": int(time_normal),
                "time_traffic_min": int(time_traffic),
                "delay_min": int(delay),
                "ratio": float(ratio),
                "speed_kmh": float(speed_kmh),
                "status": status,
                "status_emoji": _emoji(status),
                "traffic_score": traffic_score_0_10(ratio, speed_kmh),
                "route_polyline": route_polyline,
                "reported_time_normal_min": int(time_normal),
                "reported_time_traffic_min": int(time_traffic),
            }

        except Exception as e:
            # Dòng except này là bắt buộc phải có để không bị lỗi gạch đỏ
            print(f"❌ [LỖI TRONG _process_directions]: {e}")
            return {"error": str(e)}


def check_route_traffic_google(
    addr1: str,
    addr2: str,
    lat1: float,
    lon1: float,
    lat2: float,
    lon2: float,
):
    """
    Gọi SerpAPI Google Maps Directions đúng param chuẩn
    """

    # ===== Cách 1: Dùng tọa độ (ổn định nhất) =====
    start_coords = f"{float(lat1):.6f},{float(lon1):.6f}"
    end_coords = f"{float(lat2):.6f},{float(lon2):.6f}"

    params = {
        "engine": "google_maps_directions",
        "start_coords": start_coords,
        "end_coords": end_coords,
        "departure_time": "now",   # bắt buộc để có traffic
        "hl": "vi",
        "gl": "vn",
    }

    try:
        data = _call_serpapi(params)
        result = _process_directions(data)

        if result and not result.get("error"):
            result["start_address"] = start_coords
            result["end_address"] = end_coords
            return result

        return result

    except Exception as e:
        return {"error": str(e)}