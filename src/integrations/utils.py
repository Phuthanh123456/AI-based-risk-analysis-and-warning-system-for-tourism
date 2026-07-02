# src/integrations/traffic/utils.py

from __future__ import annotations

import math
from typing import Optional

try:
    from geopy.geocoders import Nominatim
except ImportError:
    Nominatim = None


# ============================================================
# DISTANCE (Haversine)
# ============================================================

def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Compute distance between 2 GPS coordinates (bird-flight).
    Unit: kilometers (km)
    """
    R = 6371.0  # Earth radius km

    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)

    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(dlon / 2) ** 2
    )

    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c


# ============================================================
# REVERSE GEOCODE (Optional)
# ============================================================

def get_address_free(lat: float, lon: float) -> str:
    """
    Reverse geocoding using OpenStreetMap Nominatim.

    - Free, no API key required.
    - Slow + rate-limited → do NOT call too frequently.
    - If geopy not installed, fallback to raw coords.
    """
    if Nominatim is None:
        return f"Tọa độ {lat:.4f}, {lon:.4f}"

    try:
        geolocator = Nominatim(user_agent="travel_risk_pipeline_v1")
        location = geolocator.reverse(f"{lat}, {lon}", language="vi", timeout=10)

        if location and location.address:
            return location.address
    except Exception:
        pass

    return f"Tọa độ {lat:.4f}, {lon:.4f}"
