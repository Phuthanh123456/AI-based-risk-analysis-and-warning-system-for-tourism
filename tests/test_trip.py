"""Covers /trip end-to-end via TestClient. External services (SerpAPI geocode +
directions) are mocked so CI doesn't depend on live keys/network."""
from unittest.mock import patch


FAKE_TRAFFIC = {
    "distance_km": 310.0,
    "time_normal_min": 300,
    "time_traffic_min": 320,
    "delay_min": 20,
    "ratio": 1.07,
    "speed_kmh": 60.0,
    "status": "light",
    "status_emoji": "🟢",
    "traffic_score": 2,
    "route_polyline": None,
}


def test_trip_success_anonymous(client):
    with patch("src.api.app.search_location_google", return_value=(11.9404, 108.4583, "Đà Lạt, Lâm Đồng, Việt Nam")), \
         patch("src.api.app.check_route_traffic_google", return_value=dict(FAKE_TRAFFIC)), \
         patch("src.api.app.ensure_route_polyline", return_value=None):
        resp = client.get(
            "/trip",
            params={"destination": "Đà Lạt", "lat": "10.77", "lon": "106.69", "trip_purpose": "dating"},
        )
    assert resp.status_code == 200
    data = resp.json()
    assert data["to"]["name"] == "Đà Lạt, Lâm Đồng, Việt Nam"
    assert data["matched_province"] == "Lâm Đồng"
    assert "recommendation" in data


def test_trip_destination_not_found(client):
    with patch("src.api.app.search_location_google", return_value=(None, None, None)):
        resp = client.get(
            "/trip",
            params={"destination": "Xyz Nowhere", "lat": "10.77", "lon": "106.69"},
        )
    assert resp.status_code == 404


def test_trip_invalid_coords(client):
    resp = client.get(
        "/trip",
        params={"destination": "Đà Lạt", "lat": "not-a-number", "lon": "106.69"},
    )
    assert resp.status_code == 422
