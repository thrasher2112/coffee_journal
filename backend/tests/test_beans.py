"""API tests for bean endpoints."""
from __future__ import annotations

from datetime import date


def test_create_and_list_beans(auth_client):
    payload = {
        "name": "Test Bean",
        "roaster": "Local",
        "origin": "Peru",
        "process": "Washed",
        "roast_level": "Light",
        "notes": "Crisp and floral",
    }
    response = auth_client.post("/api/beans/", json=payload)
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == payload["name"]

    list_response = auth_client.get("/api/beans/")
    assert list_response.status_code == 200
    items = list_response.json()["items"]
    created = next(item for item in items if item["name"] == payload["name"])
    assert created["brew_count"] == 0
    assert created["first_used_at"] is None
    assert created["last_used_at"] is None


def test_create_bean_without_notes(auth_client):
    payload = {
        "name": "No Notes Bean",
        "roaster": "Mystery Roasters",
        "origin": "Blend",
        "process": "Natural",
        "roast_level": "Medium",
    }
    response = auth_client.post("/api/beans/", json={**payload})
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == payload["name"]
    assert data["notes"] is None


def test_list_beans_includes_usage_metadata(auth_client):
    bean_payload = {"name": "Usage Bean"}
    bean_resp = auth_client.post("/api/beans/", json=bean_payload)
    bean_id = bean_resp.json()["id"]

    brew_payload = {
        "date": date.today().isoformat(),
        "bean_id": bean_id,
        "bean_weight_g": 18,
        "water_weight_g": 288,
        "rating": 9,
    }
    auth_client.post("/api/brews/", json=brew_payload)

    list_response = auth_client.get("/api/beans/")
    assert list_response.status_code == 200
    bean_entry = next(item for item in list_response.json()["items"] if item["id"] == bean_id)
    assert bean_entry["first_used_at"] == date.today().isoformat()
    assert bean_entry["last_used_at"] == date.today().isoformat()
    assert bean_entry["avg_rating"] == 9
    assert bean_entry["brew_count"] == 1


def test_copy_bean(auth_client):
    payload = {"name": "Original Bean"}
    original_resp = auth_client.post("/api/beans/", json=payload)
    bean_id = original_resp.json()["id"]

    copy_resp = auth_client.post(f"/api/beans/{bean_id}/copy")
    assert copy_resp.status_code == 201
    duplicated = copy_resp.json()
    assert duplicated["name"].startswith(payload["name"])
    assert duplicated["id"] != bean_id


def test_create_bean_with_elevation(auth_client):
    payload = {
        "name": "Sidama Natural",
        "origin": "Ethiopia",
        "process": "Natural",
        "elevation_m": 2150,
    }
    response = auth_client.post("/api/beans/", json=payload)
    assert response.status_code == 201
    data = response.json()
    assert data["elevation_m"] == 2150


def test_create_bean_without_elevation(auth_client):
    payload = {"name": "Mystery Origin"}
    response = auth_client.post("/api/beans/", json=payload)
    assert response.status_code == 201
    data = response.json()
    assert data["elevation_m"] is None


def test_get_bean(auth_client):
    payload = {"name": "Get Me Bean"}
    create_resp = auth_client.post("/api/beans/", json=payload)
    bean_id = create_resp.json()["id"]

    get_resp = auth_client.get(f"/api/beans/{bean_id}")
    assert get_resp.status_code == 200
    assert get_resp.json()["name"] == "Get Me Bean"


def test_update_bean(auth_client):
    create_resp = auth_client.post("/api/beans/", json={"name": "Old Name"})
    bean_id = create_resp.json()["id"]

    update_resp = auth_client.put(f"/api/beans/{bean_id}", json={"name": "New Name"})
    assert update_resp.status_code == 200
    assert update_resp.json()["name"] == "New Name"


def test_delete_bean(auth_client):
    create_resp = auth_client.post("/api/beans/", json={"name": "Delete Me"})
    bean_id = create_resp.json()["id"]

    delete_resp = auth_client.delete(f"/api/beans/{bean_id}")
    assert delete_resp.status_code == 204

    get_resp = auth_client.get(f"/api/beans/{bean_id}")
    assert get_resp.status_code == 404


def test_get_nonexistent_bean(auth_client):
    resp = auth_client.get("/api/beans/nonexistent-id")
    assert resp.status_code == 404


def test_create_bean_missing_name(auth_client):
    resp = auth_client.post("/api/beans/", json={"roaster": "Missing Name"})
    assert resp.status_code == 422


def test_list_beans_search(auth_client):
    auth_client.post("/api/beans/", json={"name": "Kenyan AA", "roaster": "Rare"})
    auth_client.post("/api/beans/", json={"name": "Sumatra", "roaster": "Common"})

    resp = auth_client.get("/api/beans/?q=kenyan")
    items = resp.json()["items"]
    assert len(items) == 1
    assert items[0]["name"] == "Kenyan AA"


def test_list_beans_pagination(auth_client):
    for i in range(5):
        auth_client.post("/api/beans/", json={"name": f"Page Bean {i}"})

    resp = auth_client.get("/api/beans/?limit=2")
    data = resp.json()
    assert len(data["items"]) == 2
    assert data["total"] == 5

    resp2 = auth_client.get("/api/beans/?skip=2&limit=2")
    items2 = resp2.json()["items"]
    assert len(items2) == 2
    assert items2[0]["id"] != data["items"][0]["id"]


def test_delete_bean_removes_bean(auth_client):
    bean_resp = auth_client.post("/api/beans/", json={"name": "Cascade Bean"})
    bean_id = bean_resp.json()["id"]

    auth_client.post(
        "/api/brews/",
        json={
            "date": date.today().isoformat(),
            "bean_id": bean_id,
            "bean_weight_g": 15,
            "water_weight_g": 240,
        },
    )

    delete_resp = auth_client.delete(f"/api/beans/{bean_id}")
    assert delete_resp.status_code == 204

    # Bean should be gone
    get_resp = auth_client.get(f"/api/beans/{bean_id}")
    assert get_resp.status_code == 404
    # Note: cascade delete of brews works in PostgreSQL but not in SQLite test DB
    # (SQLite requires PRAGMA foreign_keys=ON which is not set in test fixtures)


def test_unauthenticated_request_returns_401(client):
    resp = client.get("/api/beans/")
    assert resp.status_code == 401
