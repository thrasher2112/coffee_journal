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
        "grind_setting": "V60",
        "rating": 9,
        "flavor_tags": ["citrus", "floral"],
    }

    resp = client.post("/api/brews/", json=brew_payload)
    assert resp.status_code == 201
    brew = resp.json()
    assert brew["bean_id"] == bean_id
    assert brew["brew_style"] == "pour-over"
    assert brew["ratio"] == 16.0

    list_resp = client.get("/api/brews/?bean_id=" + bean_id)
    assert list_resp.status_code == 200
    assert list_resp.json()["total"] >= 1
