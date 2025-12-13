"""API tests for bean endpoints."""
from __future__ import annotations

from datetime import date

from coffee_journal.models import Bean


def test_create_and_list_beans(client):
    payload = {
        "name": "Test Bean",
        "roaster": "Local",
        "origin": "Peru",
        "process": "Washed",
        "roast_level": "Light",
        "notes": "Crisp and floral",
    }
    response = client.post("/api/beans/", json=payload)
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == payload["name"]

    list_response = client.get("/api/beans/")
    assert list_response.status_code == 200
    items = list_response.json()["items"]
    created = next(item for item in items if item["name"] == payload["name"])
    assert created["brew_count"] == 0
    assert created["first_used_at"] is None
    assert created["last_used_at"] is None


def test_create_bean_without_notes(client):
    payload = {
        "name": "No Notes Bean",
        "roaster": "Mystery Roasters",
        "origin": "Blend",
        "process": "Natural",
        "roast_level": "Medium",
    }
    response = client.post("/api/beans/", json={**payload})
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == payload["name"]
    assert data["notes"] is None


def test_list_beans_includes_usage_metadata(client):
    bean_payload = {"name": "Usage Bean"}
    bean_resp = client.post("/api/beans/", json=bean_payload)
    bean_id = bean_resp.json()["id"]

    brew_payload = {
        "date": date.today().isoformat(),
        "bean_id": bean_id,
        "bean_weight_g": 18,
        "water_weight_g": 288,
        "rating": 9,
    }
    client.post("/api/brews/", json=brew_payload)

    list_response = client.get("/api/beans/")
    assert list_response.status_code == 200
    bean_entry = next(item for item in list_response.json()["items"] if item["id"] == bean_id)
    assert bean_entry["first_used_at"] == date.today().isoformat()
    assert bean_entry["last_used_at"] == date.today().isoformat()
    assert bean_entry["avg_rating"] == 9
    assert bean_entry["brew_count"] == 1


def test_copy_bean(client):
    payload = {"name": "Original Bean"}
    original_resp = client.post("/api/beans/", json=payload)
    bean_id = original_resp.json()["id"]

    copy_resp = client.post(f"/api/beans/{bean_id}/copy")
    assert copy_resp.status_code == 201
    duplicated = copy_resp.json()
    assert duplicated["name"].startswith(payload["name"])
    assert duplicated["id"] != bean_id
