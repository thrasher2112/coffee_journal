"""Tests for multi-tenant data isolation.

Uses the make_client factory to swap the authenticated user between requests,
ensuring that each operation is performed by the correct user.
"""
from __future__ import annotations

from datetime import date


def _create_bean(client, name="Tenant Bean"):
    resp = client.post("/api/beans/", json={"name": name})
    assert resp.status_code == 201
    return resp.json()["id"]


def _create_brew(client, bean_id):
    resp = client.post(
        "/api/brews/",
        json={
            "date": date.today().isoformat(),
            "bean_id": bean_id,
            "bean_weight_g": 18,
            "water_weight_g": 288,
            "rating": 8,
        },
    )
    assert resp.status_code == 201
    return resp.json()["id"]


def test_user_a_cannot_see_user_b_beans(make_client, test_user, second_user):
    client_a = make_client(test_user)
    _create_bean(client_a, "User A Bean")

    client_b = make_client(second_user)
    resp = client_b.get("/api/beans/")
    assert resp.json()["total"] == 0


def test_user_a_cannot_see_user_b_brews(make_client, test_user, second_user):
    client_a = make_client(test_user)
    bean_id = _create_bean(client_a)
    _create_brew(client_a, bean_id)

    client_b = make_client(second_user)
    resp = client_b.get("/api/brews/")
    assert resp.json()["total"] == 0


def test_user_a_cannot_get_user_b_bean(make_client, test_user, second_user):
    client_a = make_client(test_user)
    bean_id = _create_bean(client_a)

    client_b = make_client(second_user)
    resp = client_b.get(f"/api/beans/{bean_id}")
    assert resp.status_code == 404


def test_user_a_cannot_update_user_b_bean(make_client, test_user, second_user):
    client_a = make_client(test_user)
    bean_id = _create_bean(client_a)

    client_b = make_client(second_user)
    resp = client_b.put(f"/api/beans/{bean_id}", json={"name": "Hacked"})
    assert resp.status_code == 404


def test_user_a_cannot_delete_user_b_bean(make_client, test_user, second_user):
    client_a = make_client(test_user)
    bean_id = _create_bean(client_a)

    client_b = make_client(second_user)
    resp = client_b.delete(f"/api/beans/{bean_id}")
    assert resp.status_code == 404

    # Verify it still exists for user A
    client_a2 = make_client(test_user)
    resp = client_a2.get(f"/api/beans/{bean_id}")
    assert resp.status_code == 200


def test_user_a_cannot_get_user_b_brew(make_client, test_user, second_user):
    client_a = make_client(test_user)
    bean_id = _create_bean(client_a)
    brew_id = _create_brew(client_a, bean_id)

    client_b = make_client(second_user)
    resp = client_b.get(f"/api/brews/{brew_id}")
    assert resp.status_code == 404


def test_user_a_cannot_delete_user_b_brew(make_client, test_user, second_user):
    client_a = make_client(test_user)
    bean_id = _create_bean(client_a)
    brew_id = _create_brew(client_a, bean_id)

    client_b = make_client(second_user)
    resp = client_b.delete(f"/api/brews/{brew_id}")
    assert resp.status_code == 404


def test_metrics_scoped_to_user(make_client, test_user, second_user):
    client_a = make_client(test_user)
    bean_id = _create_bean(client_a)
    _create_brew(client_a, bean_id)

    # User A sees their metrics
    resp_a = client_a.get("/api/metrics/overview")
    assert len(resp_a.json()["top_beans"]) == 1

    # User B sees nothing
    client_b = make_client(second_user)
    resp_b = client_b.get("/api/metrics/overview")
    assert len(resp_b.json()["top_beans"]) == 0


def test_export_scoped_to_user(make_client, test_user, second_user):
    client_a = make_client(test_user)
    _create_bean(client_a, "Export Bean")

    resp_a = client_a.get("/api/export")
    assert len(resp_a.json()["beans"]) == 1

    client_b = make_client(second_user)
    resp_b = client_b.get("/api/export")
    assert len(resp_b.json()["beans"]) == 0


def test_cannot_create_brew_with_other_users_bean(make_client, test_user, second_user):
    """C2 IDOR: User B cannot reference User A's bean_id when creating a brew."""
    client_a = make_client(test_user)
    bean_id_a = _create_bean(client_a, "User A Bean")

    client_b = make_client(second_user)
    bean_id_b = _create_bean(client_b, "User B Bean")

    # User B tries to create brew with User A's bean — should fail
    resp = client_b.post(
        "/api/brews/",
        json={
            "date": date.today().isoformat(),
            "bean_id": bean_id_a,
            "bean_weight_g": 18,
            "water_weight_g": 288,
        },
    )
    assert resp.status_code == 404

    # User B can create brew with their own bean — should succeed
    resp2 = client_b.post(
        "/api/brews/",
        json={
            "date": date.today().isoformat(),
            "bean_id": bean_id_b,
            "bean_weight_g": 18,
            "water_weight_g": 288,
        },
    )
    assert resp2.status_code == 201


def test_cannot_update_brew_to_other_users_bean(make_client, test_user, second_user):
    """C2 IDOR: User B cannot update their brew's bean_id to User A's bean."""
    client_a = make_client(test_user)
    bean_id_a = _create_bean(client_a, "User A Bean")

    client_b = make_client(second_user)
    bean_id_b = _create_bean(client_b, "User B Bean")
    brew_id_b = _create_brew(client_b, bean_id_b)

    # User B tries to update brew to point at User A's bean — should fail
    resp = client_b.put(
        f"/api/brews/{brew_id_b}",
        json={"bean_id": bean_id_a},
    )
    assert resp.status_code == 404


def test_import_assigns_to_current_user(make_client, test_user, second_user):
    payload = {
        "beans": [{"name": "Imported Bean"}],
        "brews": [],
    }
    client_a = make_client(test_user)
    client_a.post("/api/import", json=payload)

    # User A sees it
    resp_a = client_a.get("/api/beans/")
    assert resp_a.json()["total"] == 1

    # User B doesn't
    client_b = make_client(second_user)
    resp_b = client_b.get("/api/beans/")
    assert resp_b.json()["total"] == 0
