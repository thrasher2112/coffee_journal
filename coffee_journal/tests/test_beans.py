"""API tests for bean endpoints."""
from __future__ import annotations

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
    assert any(item["name"] == payload["name"] for item in items)


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
