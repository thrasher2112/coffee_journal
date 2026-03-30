"""Tests for schema input limits (M2, M3, M6)."""
from __future__ import annotations

from datetime import date


def test_oversized_notes_rejected(auth_client):
    resp = auth_client.post("/api/beans/", json={"name": "X", "notes": "x" * 5001})
    assert resp.status_code == 422


def test_oversized_tasting_notes_rejected(auth_client):
    resp = auth_client.post(
        "/api/brews/",
        json={
            "date": date.today().isoformat(),
            "bean_id": "fake",
            "bean_weight_g": 18,
            "water_weight_g": 288,
            "tasting_notes": "x" * 5001,
        },
    )
    assert resp.status_code == 422


def test_too_many_flavor_tags_rejected(auth_client):
    resp = auth_client.post(
        "/api/brews/",
        json={
            "date": date.today().isoformat(),
            "bean_id": "fake",
            "bean_weight_g": 18,
            "water_weight_g": 288,
            "flavor_tags": [f"tag{i}" for i in range(51)],
        },
    )
    assert resp.status_code == 422


def test_too_many_agitation_events_rejected(auth_client):
    events = [{"timestamp_s": i, "action": "stir"} for i in range(101)]
    resp = auth_client.post(
        "/api/brews/",
        json={
            "date": date.today().isoformat(),
            "bean_id": "fake",
            "bean_weight_g": 18,
            "water_weight_g": 288,
            "agitation_events": events,
        },
    )
    assert resp.status_code == 422


def test_import_too_many_beans_rejected(auth_client):
    beans = [{"name": f"Bean {i}"} for i in range(501)]
    resp = auth_client.post("/api/import", json={"beans": beans, "brews": []})
    assert resp.status_code == 422
