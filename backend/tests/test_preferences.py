"""Tests for server-side brewing preferences.

These used to live only in each browser's localStorage, so they did not follow
the account between devices and vanished when site data was cleared.
"""
from __future__ import annotations


def test_preferences_start_unset(auth_client):
    """Null means "never set", which the client reads as "keep my defaults"."""
    resp = auth_client.get("/api/preferences")

    assert resp.status_code == 200
    assert resp.json() == {
        "temperature_unit": None,
        "grinders": None,
        "preferred_grinder": None,
    }


def test_preferences_round_trip(auth_client):
    payload = {
        "temperature_unit": "fahrenheit",
        "grinders": ["Comandante C40", "Fellow Opus"],
        "preferred_grinder": "Comandante C40",
    }

    put = auth_client.put("/api/preferences", json=payload)
    assert put.status_code == 200
    assert put.json() == payload

    # Persisted, not just echoed.
    assert auth_client.get("/api/preferences").json() == payload


def test_update_is_partial(auth_client):
    auth_client.put(
        "/api/preferences",
        json={"temperature_unit": "celsius", "grinders": ["Niche Zero"]},
    )

    auth_client.put("/api/preferences", json={"temperature_unit": "fahrenheit"})

    prefs = auth_client.get("/api/preferences").json()
    assert prefs["temperature_unit"] == "fahrenheit"
    assert prefs["grinders"] == ["Niche Zero"], "omitted fields must be left alone"


def test_preferences_require_authentication(client):
    assert client.get("/api/preferences").status_code == 401
    assert client.put("/api/preferences", json={}).status_code == 401


def test_preferences_are_per_user(make_client, test_user, second_user):
    """The whole point: they follow the account, and only that account."""
    client_a = make_client(test_user)
    client_a.put(
        "/api/preferences",
        json={"temperature_unit": "fahrenheit", "grinders": ["Only Mine"]},
    )

    client_b = make_client(second_user)
    assert client_b.get("/api/preferences").json()["grinders"] is None

    client_b.put("/api/preferences", json={"grinders": ["Theirs"]})

    client_a = make_client(test_user)
    assert client_a.get("/api/preferences").json()["grinders"] == ["Only Mine"]


def test_rejects_an_unknown_temperature_unit(auth_client):
    assert auth_client.put(
        "/api/preferences", json={"temperature_unit": "kelvin"}
    ).status_code == 422


def test_rejects_oversized_grinder_lists(auth_client):
    assert auth_client.put(
        "/api/preferences", json={"grinders": [f"g{i}" for i in range(51)]}
    ).status_code == 422
    assert auth_client.put(
        "/api/preferences", json={"grinders": ["x" * 121]}
    ).status_code == 422
    assert auth_client.put(
        "/api/preferences", json={"grinders": [""]}
    ).status_code == 422


def test_preferences_cannot_write_other_user_fields(auth_client, test_user):
    """Only the three preference fields are writable through this endpoint."""
    original_email = test_user.email

    resp = auth_client.put(
        "/api/preferences",
        json={
            "temperature_unit": "celsius",
            "email": "attacker@example.com",
            "token_version": 99,
            "id": "hijacked",
        },
    )

    assert resp.status_code == 200
    assert test_user.email == original_email
    assert test_user.token_version != 99
    assert test_user.id != "hijacked"
