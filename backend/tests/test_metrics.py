"""Tests for metrics endpoints."""
from __future__ import annotations

from datetime import date


def test_metrics_overview_empty(auth_client):
    resp = auth_client.get("/api/metrics/overview")
    assert resp.status_code == 200
    data = resp.json()
    assert data["top_beans"] == []
    assert data["recent_brews"] == []
    assert data["rating_trends"] == []


def test_metrics_overview_with_data(auth_client):
    bean_resp = auth_client.post("/api/beans/", json={"name": "Metrics Bean"})
    bean_id = bean_resp.json()["id"]

    auth_client.post(
        "/api/brews/",
        json={
            "date": date.today().isoformat(),
            "bean_id": bean_id,
            "bean_weight_g": 18,
            "water_weight_g": 288,
            "rating": 9,
        },
    )
    auth_client.post(
        "/api/brews/",
        json={
            "date": date.today().isoformat(),
            "bean_id": bean_id,
            "bean_weight_g": 20,
            "water_weight_g": 320,
            "rating": 7,
        },
    )

    resp = auth_client.get("/api/metrics/overview")
    assert resp.status_code == 200
    data = resp.json()

    assert len(data["top_beans"]) == 1
    assert data["top_beans"][0]["bean_name"] == "Metrics Bean"
    assert data["top_beans"][0]["brew_count"] == 2

    assert len(data["recent_brews"]) == 2

    assert len(data["rating_trends"]) >= 1


def test_metrics_unauthenticated(client):
    resp = client.get("/api/metrics/overview")
    assert resp.status_code == 401
