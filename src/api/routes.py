# src/api/routes.py
"""
Route polyline helpers: TrackAsia → OSRM fallback.
"""
from typing import Any, Dict, Optional
import requests

from src.api.config import TRACKASIA_KEY, TRACKASIA_BASE


def _trackasia_route_polyline(lat1: float, lon1: float, lat2: float, lon2: float) -> Optional[str]:
    if not TRACKASIA_KEY:
        return None
    try:
        url = f"{TRACKASIA_BASE}/route/v1/car/{lon1:.6f},{lat1:.6f};{lon2:.6f},{lat2:.6f}.json"
        params = {"overview": "full", "geometries": "polyline", "steps": "true", "key": TRACKASIA_KEY}
        r = requests.get(url, params=params, timeout=12)
        if r.status_code != 200:
            return None
        routes = r.json().get("routes") or []
        geom = routes[0].get("geometry") if routes else None
        return geom if isinstance(geom, str) and geom else None
    except Exception:
        return None


def _osrm_route_polyline(lat1: float, lon1: float, lat2: float, lon2: float) -> Optional[str]:
    try:
        url = f"https://router.project-osrm.org/route/v1/driving/{lon1},{lat1};{lon2},{lat2}"
        params = {"overview": "full", "geometries": "polyline6"}
        r = requests.get(url, params=params, timeout=12)
        if r.status_code != 200:
            return None
        routes = r.json().get("routes") or []
        geom = routes[0].get("geometry") if routes else None
        return geom if isinstance(geom, str) and geom else None
    except Exception:
        return None


def ensure_route_polyline(
    traffic: Dict[str, Any], lat1: float, lon1: float, lat2: float, lon2: float
) -> None:
    """Add route_polyline to traffic dict if missing. TrackAsia → OSRM fallback."""
    if traffic.get("route_polyline"):
        return

    pl = _trackasia_route_polyline(lat1, lon1, lat2, lon2)
    if pl:
        traffic["route_polyline"] = pl
        traffic["route_polyline_provider"] = "trackasia"
        traffic["route_polyline_type"] = "polyline"
        return

    pl2 = _osrm_route_polyline(lat1, lon1, lat2, lon2)
    if pl2:
        traffic["route_polyline"] = pl2
        traffic["route_polyline_provider"] = "osrm"
        traffic["route_polyline_type"] = "polyline6"
