"""API tests for brew endpoints."""
from __future__ import annotations

from datetime import date


def test_create_brew_flow(client):
    bean_payload = {"name": "Brew Bean", "roaster": "Cafe", "origin": "Kenya"}
    bean_resp = client.post("/api/beans/", json=bean_payload)
    bean_id = bean_resp.json()["id"]

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

    resp = client.post("/api/brews/", json=brew_payload)
    assert resp.status_code == 201
    brew = resp.json()
    assert brew["bean_id"] == bean_id
    assert brew["brew_style"] == "pour-over"
    assert brew["ratio"] == 16.0
    assert brew["grinder_name"] == "Baratza Encore"
    assert brew["aroma_rating"] == 8
    assert brew["flavor_rating"] == 9
    assert set(brew["aroma_tags"]) == {"Floral", "Fruity"}

    list_resp = client.get("/api/brews/?bean_id=" + bean_id)
    assert list_resp.status_code == 200
    assert list_resp.json()["total"] >= 1
