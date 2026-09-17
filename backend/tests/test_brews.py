"""API tests for brew endpoints."""
from __future__ import annotations

from datetime import date, timedelta


def _create_bean(auth_client, name="Test Bean"):
    resp = auth_client.post("/api/beans/", json={"name": name, "roaster": "Cafe", "origin": "Kenya"})
    return resp.json()["id"]


def test_create_brew_flow(auth_client):
    bean_id = _create_bean(auth_client, "Brew Bean")

    brew_payload = {
        "date": date.today().isoformat(),
        "bean_id": bean_id,
        "bean_weight_g": 18,
        "water_weight_g": 288,
        "brew_style": "pour-over",
        "grinder_name": "Baratza Encore",
        "grind_setting": "18",
        "rating": 9,
        "flavor_tags": ["Citrus", "Floral"],
        "aroma_rating": 8,
        "flavor_rating": 9,
        "aroma_tags": ["Floral", "Fruity"],
    }

    resp = auth_client.post("/api/brews/", json=brew_payload)
    assert resp.status_code == 201
    brew = resp.json()
    assert brew["bean_id"] == bean_id
    assert brew["brew_style"] == "pour-over"
    assert brew["ratio"] == 16.0
    assert brew["grinder_name"] == "Baratza Encore"
    assert brew["aroma_rating"] == 8
    assert brew["flavor_rating"] == 9
    assert set(brew["aroma_tags"]) == {"Floral", "Fruity"}

    list_resp = auth_client.get("/api/brews/?bean_id=" + bean_id)
    assert list_resp.status_code == 200
    assert list_resp.json()["total"] >= 1


def test_get_brew(auth_client):
    bean_id = _create_bean(auth_client)
    create_resp = auth_client.post(
        "/api/brews/",
        json={
            "date": date.today().isoformat(),
            "bean_id": bean_id,
            "bean_weight_g": 20,
            "water_weight_g": 300,
        },
    )
    brew_id = create_resp.json()["id"]

    get_resp = auth_client.get(f"/api/brews/{brew_id}")
    assert get_resp.status_code == 200
    assert get_resp.json()["id"] == brew_id


def test_update_brew(auth_client):
    bean_id = _create_bean(auth_client)
    create_resp = auth_client.post(
        "/api/brews/",
        json={
            "date": date.today().isoformat(),
            "bean_id": bean_id,
            "bean_weight_g": 18,
            "water_weight_g": 288,
        },
    )
    brew_id = create_resp.json()["id"]

    update_resp = auth_client.put(f"/api/brews/{brew_id}", json={"rating": 8})
    assert update_resp.status_code == 200
    assert update_resp.json()["rating"] == 8


def test_update_brew_date(auth_client):
    """Regression test: BrewUpdate.date must accept a real date, not just None."""
    bean_id = _create_bean(auth_client)
    create_resp = auth_client.post(
        "/api/brews/",
        json={
            "date": date.today().isoformat(),
            "bean_id": bean_id,
            "bean_weight_g": 18,
            "water_weight_g": 288,
        },
    )
    brew_id = create_resp.json()["id"]

    new_date = (date.today() - timedelta(days=2)).isoformat()
    update_resp = auth_client.put(f"/api/brews/{brew_id}", json={"date": new_date})
    assert update_resp.status_code == 200
    assert update_resp.json()["date"] == new_date


def test_delete_brew(auth_client):
    bean_id = _create_bean(auth_client)
    create_resp = auth_client.post(
        "/api/brews/",
        json={
            "date": date.today().isoformat(),
            "bean_id": bean_id,
            "bean_weight_g": 18,
            "water_weight_g": 288,
        },
    )
    brew_id = create_resp.json()["id"]

    delete_resp = auth_client.delete(f"/api/brews/{brew_id}")
    assert delete_resp.status_code == 204

    get_resp = auth_client.get(f"/api/brews/{brew_id}")
    assert get_resp.status_code == 404


def test_get_nonexistent_brew(auth_client):
    resp = auth_client.get("/api/brews/nonexistent-id")
    assert resp.status_code == 404


def test_list_brews_date_filter(auth_client):
    bean_id = _create_bean(auth_client)
    today = date.today()
    yesterday = today - timedelta(days=1)

    auth_client.post(
        "/api/brews/",
        json={
            "date": today.isoformat(),
            "bean_id": bean_id,
            "bean_weight_g": 18,
            "water_weight_g": 288,
        },
    )
    auth_client.post(
        "/api/brews/",
        json={
            "date": yesterday.isoformat(),
            "bean_id": bean_id,
            "bean_weight_g": 18,
            "water_weight_g": 288,
        },
    )

    resp = auth_client.get(f"/api/brews/?start_date={today.isoformat()}")
    assert resp.json()["total"] == 1


def test_tag_deduplication(auth_client):
    bean_id = _create_bean(auth_client)
    resp = auth_client.post(
        "/api/brews/",
        json={
            "date": date.today().isoformat(),
            "bean_id": bean_id,
            "bean_weight_g": 18,
            "water_weight_g": 288,
            "flavor_tags": ["Citrus", "Citrus", "Floral"],
        },
    )
    assert resp.status_code == 201
    tags = resp.json()["flavor_tags"]
    assert len(tags) == 2


def test_brew_ratio_computation(auth_client):
    bean_id = _create_bean(auth_client)
    resp = auth_client.post(
        "/api/brews/",
        json={
            "date": date.today().isoformat(),
            "bean_id": bean_id,
            "bean_weight_g": 15,
            "water_weight_g": 250,
        },
    )
    ratio = resp.json()["ratio"]
    assert ratio == round(250 / 15, 2)


def test_unauthenticated_brew_returns_401(client):
    resp = client.get("/api/brews/")
    assert resp.status_code == 401
