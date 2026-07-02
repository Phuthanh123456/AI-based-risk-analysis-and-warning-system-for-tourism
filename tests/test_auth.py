import os


def _unique_email():
    return f"test_{os.urandom(4).hex()}@example.com"


def test_register_and_auto_login(client):
    email = _unique_email()
    resp = client.post("/api/auth/register", json={"email": email, "password": "supersecret"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["user"]["email"] == email
    assert data["token"]


def test_register_duplicate_email_rejected(client):
    email = _unique_email()
    client.post("/api/auth/register", json={"email": email, "password": "supersecret"})
    resp = client.post("/api/auth/register", json={"email": email, "password": "another123"})
    assert resp.status_code == 409


def test_register_short_password_rejected(client):
    resp = client.post("/api/auth/register", json={"email": _unique_email(), "password": "123"})
    assert resp.status_code == 422


def test_login_success(client):
    email = _unique_email()
    client.post("/api/auth/register", json={"email": email, "password": "supersecret"})
    resp = client.post("/api/auth/login", json={"email": email, "password": "supersecret"})
    assert resp.status_code == 200
    assert resp.json()["token"]


def test_login_wrong_password_rejected(client):
    email = _unique_email()
    client.post("/api/auth/register", json={"email": email, "password": "supersecret"})
    resp = client.post("/api/auth/login", json={"email": email, "password": "wrongpass"})
    assert resp.status_code == 401


def test_login_unknown_email_rejected(client):
    resp = client.post("/api/auth/login", json={"email": _unique_email(), "password": "whatever"})
    assert resp.status_code == 401


def test_me_requires_token(client):
    resp = client.get("/api/auth/me")
    assert resp.status_code == 401


def test_me_with_valid_token(client, auth_headers):
    resp = client.get("/api/auth/me", headers=auth_headers)
    assert resp.status_code == 200
    assert "email" in resp.json()


def test_me_with_garbage_token(client):
    resp = client.get("/api/auth/me", headers={"Authorization": "Bearer not-a-real-token"})
    assert resp.status_code == 401
