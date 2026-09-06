"""Tests for import/export endpoints."""
from __future__ import annotations

from datetime import date


def test_export_returns_user_data(auth_client):
    auth_client.post("/api/beans/", json={"name": "Export Bean"})

    resp = auth_client.get("/api/export")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["beans"]) == 1
    assert data["beans"][0]["name"] == "Export Bean"
    assert isinstance(data["brews"], list)


def test_import_creates_records(auth_client):
    payload = {
        "beans": [
            {"name": "Imported Bean A"},
            {"name": "Imported Bean B"},
        ],
        "brews": [],
    }
    resp = auth_client.post("/api/import", json=payload)
    assert resp.status_code == 202
    assert resp.json()["counts"]["beans"] == 2

    list_resp = auth_client.get("/api/beans/")
    assert list_resp.json()["total"] == 2


def test_import_updates_existing(auth_client):
    create_resp = auth_client.post("/api/beans/", json={"name": "Before Update"})
    bean_id = create_resp.json()["id"]

    payload = {
        "beans": [{"id": bean_id, "name": "After Update"}],
        "brews": [],
    }
    auth_client.post("/api/import", json=payload)

    get_resp = auth_client.get(f"/api/beans/{bean_id}")
    assert get_resp.json()["name"] == "After Update"


def test_import_brew_missing_bean(auth_client):
    payload = {
        "beans": [],
        "brews": [
            {
                "date": date.today().isoformat(),
                "bean_id": "nonexistent-bean-id",
                "bean_weight_g": 18,
                "water_weight_g": 288,
            }
        ],
    }
    resp = auth_client.post("/api/import", json=payload)
    assert resp.status_code == 400
    assert "missing" in resp.json()["detail"].lower()


def test_export_empty(auth_client):
    resp = auth_client.get("/api/export")
    assert resp.status_code == 200
    data = resp.json()
    assert data["beans"] == []
    assert data["brews"] == []


def test_export_unauthenticated(client):
    resp = client.get("/api/export")
    assert resp.status_code == 401


def test_import_of_another_users_export_does_not_collide(
    make_client, test_user, second_user
):
    """Importing an export into a second account must not reuse its row ids.

    Exports carry the ids the rows had in the source database, and the import
    lookups are owner-scoped. Because ids are globally unique, an id belonging
    to another user used to fall through to an INSERT with that same primary
    key, raising IntegrityError and returning a 500 - which is exactly what
    "export locally, import on the deployed instance" would hit on any re-run.
    """
    client_a = make_client(test_user)
    bean_id = client_a.post("/api/beans/", json={"name": "Kenya Nyeri AA"}).json()["id"]
    client_a.post(
        "/api/brews/",
        json={
            "bean_id": bean_id,
            "bean_weight_g": 18,
            "water_weight_g": 300,
            "date": date.today().isoformat(),
            "rating": 9,
        },
    )
    export = client_a.get("/api/export").json()

    client_b = make_client(second_user)
    resp = client_b.post("/api/import", json=export)
    assert resp.status_code == 202, resp.text
    assert resp.json()["counts"] == {"beans": 1, "brews": 1}

    beans_b = client_b.get("/api/beans/").json()["items"]
    brews_b = client_b.get("/api/brews/").json()["items"]
    assert len(beans_b) == 1
    assert len(brews_b) == 1
    # Fresh ids, and the brew follows its bean to the new one.
    assert beans_b[0]["id"] != bean_id
    assert brews_b[0]["bean_id"] == beans_b[0]["id"]

    # The original owner is untouched.
    client_a = make_client(test_user)
    assert client_a.get("/api/beans/").json()["items"][0]["id"] == bean_id


def test_reimporting_your_own_export_is_idempotent(auth_client):
    """A second import of your own export updates in place, it does not duplicate."""
    auth_client.post("/api/beans/", json={"name": "Ethiopia Guji"})
    export = auth_client.get("/api/export").json()

    assert auth_client.post("/api/import", json=export).status_code == 202
    assert auth_client.post("/api/import", json=export).status_code == 202

    beans = auth_client.get("/api/beans/").json()
    assert beans["total"] == 1


def test_import_into_a_fresh_database_keeps_ids_and_is_idempotent(auth_client):
    """The documented migration: export locally, import on the deployed instance.

    There the ids are free, so they are preserved - which is what makes running
    the import twice (a retry, a double click) update in place rather than
    duplicating every bean and brew.
    """
    bean_id = "11111111-2222-3333-4444-555555555555"
    brew_id = "66666666-7777-8888-9999-000000000000"
    payload = {
        "beans": [{"id": bean_id, "name": "Colombia Huila"}],
        "brews": [
            {
                "id": brew_id,
                "bean_id": bean_id,
                "bean_weight_g": 18,
                "water_weight_g": 300,
                "date": date.today().isoformat(),
                "rating": 8,
            }
        ],
    }

    assert auth_client.post("/api/import", json=payload).status_code == 202
    beans = auth_client.get("/api/beans/").json()
    assert beans["total"] == 1
    assert beans["items"][0]["id"] == bean_id

    # Second run must not duplicate.
    assert auth_client.post("/api/import", json=payload).status_code == 202
    assert auth_client.get("/api/beans/").json()["total"] == 1
    assert auth_client.get("/api/brews/").json()["total"] == 1
