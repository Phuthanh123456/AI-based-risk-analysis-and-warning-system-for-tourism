def test_health(client):
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"ok": True}


def test_debug_where(client):
    resp = client.get("/debug/where")
    assert resp.status_code == 200
    data = resp.json()
    assert data["features_exists"] is True
    assert data["provinces_exists"] is True
