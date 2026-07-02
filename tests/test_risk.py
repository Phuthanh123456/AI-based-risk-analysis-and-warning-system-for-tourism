import urllib.parse


def test_risk_known_province(client):
    place = urllib.parse.quote("TP Hồ Chí Minh")
    resp = client.get(f"/risk?place={place}")
    assert resp.status_code == 200
    data = resp.json()
    assert "overall_risk_score" in data
    assert "num_articles" in data
    assert data["num_articles"] >= 0


def test_risk_compare(client):
    places = urllib.parse.quote("TP Hồ Chí Minh,Hà Nội,Đà Nẵng")
    resp = client.get(f"/risk/compare?places={places}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["count"] == 3
    assert len(data["results"]) == 3


def test_risk_compare_too_many_places(client):
    places = ",".join(f"Province{i}" for i in range(25))
    resp = client.get(f"/risk/compare?places={places}")
    assert resp.status_code == 422


def test_risk_trend_known_province(client):
    place = urllib.parse.quote("Hà Nội")
    resp = client.get(f"/risk/trend?place={place}")
    assert resp.status_code == 200
    data = resp.json()
    assert "trend" in data
    assert isinstance(data["trend"], list)


def test_map_points(client):
    resp = client.get("/map/points")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["points"]) > 0
    assert "province" in data["points"][0]


def test_map_heat(client):
    resp = client.get("/map/heat")
    assert resp.status_code == 200
    assert "points" in resp.json()
