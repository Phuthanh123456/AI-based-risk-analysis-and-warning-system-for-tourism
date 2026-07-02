from unittest.mock import patch


def test_vapid_public_key_no_auth_needed(client):
    resp = client.get("/api/notifications/vapid-public-key")
    assert resp.status_code == 200
    assert "publicKey" in resp.json()


def test_subscribe_requires_auth(client):
    resp = client.post(
        "/api/notifications/subscribe",
        json={"endpoint": "https://push.example.com/abc", "keys": {"p256dh": "x", "auth": "y"}},
    )
    assert resp.status_code == 401


def test_subscribe_and_check_now(client, auth_headers):
    with patch("src.api.notifications.VAPID_PUBLIC_KEY", "fake-pub"), \
         patch("src.api.notifications.VAPID_PRIVATE_KEY", "fake-priv"):
        sub_resp = client.post(
            "/api/notifications/subscribe",
            json={
                "endpoint": "https://push.example.com/xyz",
                "keys": {"p256dh": "p256dh-val", "auth": "auth-val"},
                "destination": "Đà Lạt",
                "lat": 11.94,
                "lon": 108.44,
            },
            headers=auth_headers,
        )
        assert sub_resp.status_code == 200
        assert sub_resp.json()["subscribed"] is True

        with patch("src.api.notifications.assess_weather_risk", return_value={"risk_score": 9.0, "message": "Bão lớn"}), \
             patch("src.api.notifications._send_push", return_value=True) as mock_send:
            check_resp = client.post("/api/notifications/check-now", headers=auth_headers)
        assert check_resp.status_code == 200
        data = check_resp.json()
        assert data["checked"] == 1
        assert data["alerted"] == 1
        mock_send.assert_called_once()


def test_check_now_no_alert_when_risk_low(client, auth_headers):
    with patch("src.api.notifications.VAPID_PUBLIC_KEY", "fake-pub"), \
         patch("src.api.notifications.VAPID_PRIVATE_KEY", "fake-priv"):
        client.post(
            "/api/notifications/subscribe",
            json={
                "endpoint": "https://push.example.com/low-risk",
                "keys": {"p256dh": "p", "auth": "a"},
                "destination": "Hà Nội",
                "lat": 21.0,
                "lon": 105.8,
            },
            headers=auth_headers,
        )
        with patch("src.api.notifications.assess_weather_risk", return_value={"risk_score": 2.0, "message": "An toàn"}):
            resp = client.post("/api/notifications/check-now", headers=auth_headers)
        data = resp.json()
        assert data["alerted"] == 0


def test_unsubscribe(client, auth_headers):
    with patch("src.api.notifications.VAPID_PUBLIC_KEY", "fake-pub"), \
         patch("src.api.notifications.VAPID_PRIVATE_KEY", "fake-priv"):
        client.post(
            "/api/notifications/subscribe",
            json={"endpoint": "https://push.example.com/to-remove", "keys": {"p256dh": "p", "auth": "a"}},
            headers=auth_headers,
        )
    resp = client.post(
        "/api/notifications/unsubscribe",
        json={"endpoint": "https://push.example.com/to-remove"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["unsubscribed"] is True
