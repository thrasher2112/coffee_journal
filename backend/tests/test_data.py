"""Tests for import/export endpoints."""
from __future__ import annotations

from datetime import date


def test_export_returns_user_data(auth_client):
    auth_client.post("/api/beans/", json={"name": "Export Bean"})

    resp = auth_client.get("/api/export")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["beans"]) == 1
    assert data["beans"][0]["name"] == "Export Bean"
    assert isinstance(data["brews"], list)


def test_import_creates_records(auth_client):
    payload = {
        "beans": [
            {"name": "Imported Bean A"},
            {"name": "Imported Bean B"},
        ],
        "brews": [],
    }
    resp = auth_client.post("/api/import", json=payload)
    assert resp.status_code == 202
    assert resp.json()["counts"]["beans"] == 2

    list_resp = auth_client.get("/api/beans/")
    assert list_resp.json()["total"] == 2


def test_import_updates_existing(auth_client):
    create_resp = auth_client.post("/api/beans/", json={"name": "Before Update"})
    bean_id = create_resp.json()["id"]

    payload = {
        "beans": [{"id": bean_id, "name": "After Update"}],
        "brews": [],
    }
    auth_client.post("/api/import", json=payload)

    get_resp = auth_client.get(f"/api/beans/{bean_id}")
    assert get_resp.json()["name"] == "After Update"


def test_import_brew_missing_bean(auth_client):
    payload = {
        "beans": [],
        "brews": [
            {
                "date": date.today().isoformat(),
                "bean_id": "nonexistent-bean-id",
                "bean_weight_g": 18,
                "water_weight_g": 288,
            }
        ],
    }
    resp = auth_client.post("/api/import", json=payload)
    assert resp.status_code == 400
    assert "missing" in resp.json()["detail"].lower()


def test_export_empty(auth_client):
    resp = auth_client.get("/api/export")
    assert resp.status_code == 200
    data = resp.json()
    assert data["beans"] == []
    assert data["brews"] == []


def test_export_unauthenticated(client):
    resp = client.get("/api/export")
    assert resp.status_code == 401
