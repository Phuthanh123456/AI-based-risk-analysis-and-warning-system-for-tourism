"""
Test script for Weather AI endpoints using Open-Meteo (free, no API key).
Run:  python scripts/test_openmeteo_weather.py
Requires: backend running on http://127.0.0.1:8000
"""
import requests, json, sys

BASE = "http://127.0.0.1:8000"
SEP = "=" * 60


def test_health():
    print(f"\n{SEP}\n[1] GET /health\n{SEP}")
    r = requests.get(f"{BASE}/health", timeout=5)
    print(f"Status: {r.status_code}")
    print(json.dumps(r.json(), indent=2, ensure_ascii=False))
    assert r.status_code == 200, "Health check failed!"


def test_weather_ai_offline():
    print(f"\n{SEP}\n[2] POST /weather/ai  (offline payload)\n{SEP}")
    payload = {
        "province": "Cao Bằng",
        "temperature": 15.0,
        "humidity": 95,
        "precipitation": 30.0,
        "wind": 25.0,
        "pm25": 50.0,
        "visibility_km": 1.0,
        "uv_index": 1.0,
    }
    print(f"Input: {json.dumps(payload, ensure_ascii=False)}")
    r = requests.post(f"{BASE}/weather/ai", json=payload, timeout=10)
    print(f"Status: {r.status_code}")
    data = r.json()
    print(json.dumps(data, indent=2, ensure_ascii=False))
    assert r.status_code == 200, f"Offline predict failed: {data}"
    print(f"=> Risk level: {data['risk_level']}  Score: {data['risk_score']}")


def test_weather_ai_live(city: str = "Hanoi"):
    print(f"\n{SEP}\n[3] POST /weather/ai/live  (Open-Meteo, city={city})\n{SEP}")
    payload = {"city": city}
    r = requests.post(f"{BASE}/weather/ai/live", json=payload, timeout=15)
    print(f"Status: {r.status_code}")
    data = r.json()
    print(json.dumps(data, indent=2, ensure_ascii=False))
    assert r.status_code == 200, f"Live predict failed: {data}"
    print(f"=> City resolved: {data.get('city_resolved')}")
    print(f"=> Coordinates: {data.get('coordinates')}")
    print(f"=> Risk level: {data['risk_level']}  Score: {data['risk_score']}")
    print(f"=> Provider: {data.get('weather_provider')}")


def test_weather_ai_live_multiple():
    cities = ["Hanoi", "Ho Chi Minh", "Da Nang", "Cao Bang", "Da Lat", "Nha Trang"]
    print(f"\n{SEP}\n[4] POST /weather/ai/live  (multiple cities)\n{SEP}")
    for city in cities:
        try:
            payload = {"city": city}
            r = requests.post(f"{BASE}/weather/ai/live", json=payload, timeout=15)
            data = r.json()
            if r.status_code == 200:
                print(f"  {city:15s} => level={data['risk_level']}  score={data['risk_score']:.2f}  temp={data['input']['temperature']}°C  humidity={data['input']['humidity']}%  wind={data['input']['wind']}km/h  precip={data['input']['precipitation']}mm  provider={data.get('weather_provider','?')}")
            else:
                print(f"  {city:15s} => ERROR {r.status_code}: {data}")
        except Exception as e:
            print(f"  {city:15s} => EXCEPTION: {e}")


if __name__ == "__main__":
    print("Vietnam Travel Risk — Weather AI Test (Open-Meteo)")
    print(f"Backend: {BASE}")
    print(f"NOTE: Make sure backend is running: uvicorn src.api.app:app --reload --port 8000")

    try:
        test_health()
        test_weather_ai_offline()
        test_weather_ai_live("Hanoi")
        test_weather_ai_live("Cao Bang")
        test_weather_ai_live_multiple()
        print(f"\n{SEP}\n ALL TESTS PASSED ✅\n{SEP}")
    except AssertionError as e:
        print(f"\n TEST FAILED ❌: {e}")
        sys.exit(1)
    except requests.ConnectionError:
        print(f"\n CONNECTION ERROR ❌ — Backend chưa chạy? Hãy start: uvicorn src.api.app:app --reload --port 8000")
        sys.exit(1)
    except Exception as e:
        print(f"\n UNEXPECTED ERROR ❌: {e}")
        sys.exit(1)
