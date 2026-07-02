"""PM2.5 should come from OpenWeatherMap when a key + coords are available,
and fall back to the fixed placeholder otherwise (no key, or the call fails)."""
from unittest.mock import patch

import src.api.weather_ai as weather_ai


FAKE_OWM_RESPONSE = {
    "list": [{"components": {"pm2_5": 42.7}}]
}


def test_fetch_air_quality_uses_fallback_without_key():
    with patch.object(weather_ai, "OPENWEATHERMAP_API_KEY", ""):
        assert weather_ai._fetch_air_quality(10.77, 106.69) == weather_ai._PM25_FALLBACK


def test_fetch_air_quality_uses_fallback_without_coords():
    with patch.object(weather_ai, "OPENWEATHERMAP_API_KEY", "fake-key"):
        assert weather_ai._fetch_air_quality(None, None) == weather_ai._PM25_FALLBACK


def test_fetch_air_quality_real_value(monkeypatch):
    weather_ai._air_quality_cache.clear()

    class FakeResponse:
        def raise_for_status(self):
            pass

        def json(self):
            return FAKE_OWM_RESPONSE

    with patch.object(weather_ai, "OPENWEATHERMAP_API_KEY", "fake-key"), \
         patch("src.api.weather_ai.requests.get", return_value=FakeResponse()):
        pm25 = weather_ai._fetch_air_quality(10.77, 106.69)
    assert pm25 == 42.7


def test_fetch_air_quality_falls_back_on_error():
    weather_ai._air_quality_cache.clear()
    with patch.object(weather_ai, "OPENWEATHERMAP_API_KEY", "fake-key"), \
         patch("src.api.weather_ai.requests.get", side_effect=Exception("boom")):
        pm25 = weather_ai._fetch_air_quality(10.77, 106.69)
    assert pm25 == weather_ai._PM25_FALLBACK


def test_transform_openmeteo_uses_air_quality_helper():
    om_data = {
        "current_weather": {"windspeed": 10.0, "temperature": 28.0},
        "hourly": {
            "time": [],
            "relativehumidity_2m": [],
            "precipitation": [],
            "uv_index": [],
            "visibility": [],
        },
        "elevation": 5.0,
    }
    with patch.object(weather_ai, "_fetch_air_quality", return_value=99.9) as mock_fetch:
        result = weather_ai.transform_openmeteo_to_ai_format(
            om_data, province="Hà Nội", geo={"latitude": 21.0, "longitude": 105.8, "elevation": 5.0}
        )
    mock_fetch.assert_called_once_with(21.0, 105.8)
    assert result["pm25"] == 99.9
    assert result["smog_impact"] == round(min(99.9 / 150.0, 1.0), 4)
