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
    assert resp.json()["counts"] == {
        "beans": 1,
        "brews": 1,
        "setups": 0,
        "setups_skipped": 0,
    }

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


def test_export_includes_preferences(auth_client):
    """A backup that omitted preferences would not actually restore everything."""
    auth_client.put(
        "/api/preferences",
        json={"temperature_unit": "fahrenheit", "grinders": ["Comandante C40"]},
    )

    export = auth_client.get("/api/export").json()

    assert export["preferences"]["temperature_unit"] == "fahrenheit"
    assert export["preferences"]["grinders"] == ["Comandante C40"]


def test_import_restores_preferences(auth_client):
    export = {
        "beans": [],
        "brews": [],
        "preferences": {
            "temperature_unit": "fahrenheit",
            "grinders": ["Restored Grinder"],
            "preferred_grinder": "Restored Grinder",
        },
    }

    assert auth_client.post("/api/import", json=export).status_code == 202

    prefs = auth_client.get("/api/preferences").json()
    assert prefs["temperature_unit"] == "fahrenheit"
    assert prefs["grinders"] == ["Restored Grinder"]


def test_import_without_preferences_still_works(auth_client):
    """Backup files written before preferences were stored server-side."""
    auth_client.put("/api/preferences", json={"temperature_unit": "fahrenheit"})

    resp = auth_client.post(
        "/api/import", json={"beans": [{"name": "Old Backup Bean"}], "brews": []}
    )

    assert resp.status_code == 202
    # Untouched, not reset.
    assert auth_client.get("/api/preferences").json()["temperature_unit"] == "fahrenheit"


def test_full_backup_round_trip(auth_client):
    """Export then re-import must reproduce the journal, not duplicate it."""
    bean_id = auth_client.post("/api/beans/", json={"name": "Round Trip"}).json()["id"]
    auth_client.post(
        "/api/brews/",
        json={
            "bean_id": bean_id,
            "bean_weight_g": 18,
            "water_weight_g": 300,
            "date": date.today().isoformat(),
            "rating": 7,
        },
    )
    auth_client.put("/api/preferences", json={"temperature_unit": "fahrenheit"})

    backup = auth_client.get("/api/export").json()
    assert auth_client.post("/api/import", json=backup).status_code == 202

    assert auth_client.get("/api/beans/").json()["total"] == 1
    assert auth_client.get("/api/brews/").json()["total"] == 1
    assert auth_client.get("/api/preferences").json()["temperature_unit"] == "fahrenheit"


def test_setup_snapshot_survives_export_and_import(auth_client, make_client, second_user):
    bean = auth_client.post("/api/beans/", json={"name": "Snap Bean"}).json()
    brew = auth_client.post(
        "/api/brews/",
        json={
            "date": date.today().isoformat(),
            "bean_id": bean["id"],
            "bean_weight_g": 18,
            "water_weight_g": 36,
            "setup_name": "Office",
            "machine_profile": "Flat 6 bar",
        },
    ).json()

    exported = auth_client.get("/api/export").json()
    assert exported["brews"][0]["setup_name"] == "Office"
    assert exported["brews"][0]["machine_profile"] == "Flat 6 bar"

    other = make_client(second_user)
    resp = other.post("/api/import", json=exported)
    assert resp.status_code == 202, resp.text
    imported = other.get("/api/brews/").json()["items"]
    assert len(imported) == 1
    assert imported[0]["id"] != brew["id"]
    assert imported[0]["setup_name"] == "Office"
    assert imported[0]["machine_profile"] == "Flat 6 bar"


def test_import_updates_existing_brew_snapshot(auth_client):
    bean = auth_client.post("/api/beans/", json={"name": "Snap Bean"}).json()
    brew = auth_client.post(
        "/api/brews/",
        json={
            "date": date.today().isoformat(),
            "bean_id": bean["id"],
            "bean_weight_g": 18,
            "water_weight_g": 36,
        },
    ).json()
    resp = auth_client.post(
        "/api/import",
        json={
            "beans": [{"id": bean["id"], "name": "Snap Bean"}],
            "brews": [
                {
                    "id": brew["id"],
                    "date": date.today().isoformat(),
                    "bean_id": bean["id"],
                    "bean_weight_g": 18,
                    "water_weight_g": 36,
                    "setup_name": "Imported",
                }
            ],
        },
    )
    assert resp.status_code == 202
    assert auth_client.get(f"/api/brews/{brew['id']}").json()["setup_name"] == "Imported"


# --- setups in backup / restore ---------------------------------------------


def _setup(client, name="Office", **extra):
    resp = client.post(
        "/api/setups",
        json={"name": name, "brew_style": "espresso", "ratio": 2, **extra},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


def _setups(client):
    return client.get("/api/setups").json()


def test_export_contains_setups(auth_client):
    created = _setup(auth_client, dose_g=18, machine_profile="Flat 6 bar")

    data = auth_client.get("/api/export").json()

    assert len(data["setups"]) == 1
    exported = data["setups"][0]
    assert exported["id"] == created["id"]
    assert exported["name"] == "Office"
    assert exported["dose_g"] == 18
    assert exported["machine_profile"] == "Flat 6 bar"
    assert "user_id" not in exported


def test_export_setups_are_only_the_users_own(make_client, test_user, second_user):
    _setup(make_client(test_user), "Mine")
    _setup(make_client(second_user), "Theirs")

    data = make_client(test_user).get("/api/export").json()

    assert [s["name"] for s in data["setups"]] == ["Mine"]


def test_export_empty_has_no_setups(auth_client):
    assert auth_client.get("/api/export").json()["setups"] == []


def test_import_creates_setups_in_a_fresh_account(make_client, test_user, second_user):
    client_a = make_client(test_user)
    _setup(client_a, "Office", dose_g=18, target_time_s=30, grinder_name="Niche")
    _setup(client_a, "Home", brew_style="pour-over", ratio=16)
    export = client_a.get("/api/export").json()

    client_b = make_client(second_user)
    resp = client_b.post("/api/import", json=export)

    assert resp.status_code == 202, resp.text
    counts = resp.json()["counts"]
    assert counts["setups"] == 2
    assert counts["setups_skipped"] == 0
    restored = {s["name"]: s for s in _setups(client_b)}
    assert set(restored) == {"Office", "Home"}
    assert restored["Office"]["dose_g"] == 18
    assert restored["Office"]["target_time_s"] == 30
    assert restored["Office"]["grinder_name"] == "Niche"
    assert restored["Home"]["brew_style"] == "pour-over"
    assert restored["Home"]["ratio"] == 16


def test_import_setup_with_other_users_id_gets_a_new_id(
    make_client, test_user, second_user
):
    client_a = make_client(test_user)
    original = _setup(client_a, "Office")
    export = client_a.get("/api/export").json()

    client_b = make_client(second_user)
    resp = client_b.post("/api/import", json=export)

    assert resp.status_code == 202, resp.text
    (restored,) = _setups(client_b)
    assert restored["id"] != original["id"]
    # The original owner is untouched. (dependency_overrides is global, so
    # re-select user A rather than reusing the earlier client.)
    assert _setups(make_client(test_user))[0]["id"] == original["id"]


def test_import_into_a_fresh_database_keeps_setup_ids(auth_client, db_session):
    from sqlalchemy import delete

    from coffee_journal.models import BrewSetup

    original = _setup(auth_client, "Office")
    export = auth_client.get("/api/export").json()
    db_session.execute(delete(BrewSetup))
    db_session.commit()

    resp = auth_client.post("/api/import", json=export)

    assert resp.status_code == 202
    assert [s["id"] for s in _setups(auth_client)] == [original["id"]]


def test_reimporting_own_export_skips_existing_setups(auth_client):
    _setup(auth_client, "Office")
    export = auth_client.get("/api/export").json()

    resp = auth_client.post("/api/import", json=export)

    assert resp.status_code == 202, resp.text
    counts = resp.json()["counts"]
    assert counts["setups"] == 0
    assert counts["setups_skipped"] == 1
    assert len(_setups(auth_client)) == 1


def test_import_same_name_different_case_skips_and_leaves_existing_untouched(
    auth_client,
):
    existing = _setup(auth_client, "Office", ratio=3, dose_g=18)

    resp = auth_client.post(
        "/api/import",
        json={
            "setups": [
                {
                    "name": "  OFFICE ",
                    "brew_style": "pour-over",
                    "ratio": 16,
                    "dose_g": 30,
                }
            ]
        },
    )

    assert resp.status_code == 202, resp.text
    counts = resp.json()["counts"]
    assert counts["setups"] == 0
    assert counts["setups_skipped"] == 1
    (after,) = _setups(auth_client)
    assert after == existing


def test_import_intra_payload_duplicate_names_create_one_skip_one(auth_client):
    resp = auth_client.post(
        "/api/import",
        json={
            "setups": [
                {"name": "Office", "brew_style": "espresso", "ratio": 2},
                {"name": "office ", "brew_style": "pour-over", "ratio": 16},
            ]
        },
    )

    assert resp.status_code == 202, resp.text
    counts = resp.json()["counts"]
    assert counts["setups"] == 1
    assert counts["setups_skipped"] == 1
    (only,) = _setups(auth_client)
    # First one wins.
    assert only["brew_style"] == "espresso"


def test_import_setup_with_own_existing_id_but_new_name_gets_a_fresh_id(auth_client):
    existing = _setup(auth_client, "Office", ratio=3)

    resp = auth_client.post(
        "/api/import",
        json={
            "setups": [
                {
                    "id": existing["id"],
                    "name": "Home",
                    "brew_style": "pour-over",
                    "ratio": 16,
                }
            ]
        },
    )

    assert resp.status_code == 202, resp.text
    assert resp.json()["counts"]["setups"] == 1
    by_name = {s["name"]: s for s in _setups(auth_client)}
    # The existing row is not overwritten by the colliding id...
    assert by_name["Office"] == existing
    # ...and the incoming one is created alongside it.
    assert by_name["Home"]["id"] != existing["id"]
    assert by_name["Home"]["ratio"] == 16


def test_import_partial_duplicates_create_the_rest(auth_client):
    existing = _setup(auth_client, "Dup", ratio=3)

    resp = auth_client.post(
        "/api/import",
        json={
            "setups": [
                {"name": "One", "brew_style": "espresso", "ratio": 2},
                {"name": "dup", "brew_style": "pour-over", "ratio": 16},
                {"name": "Two", "brew_style": "espresso", "ratio": 2},
            ]
        },
    )

    assert resp.status_code == 202, resp.text
    counts = resp.json()["counts"]
    assert counts["setups"] == 2
    assert counts["setups_skipped"] == 1
    by_name = {s["name"]: s for s in _setups(auth_client)}
    assert set(by_name) == {"Dup", "One", "Two"}
    assert by_name["Dup"] == existing


def test_import_setups_cap_is_1000(auth_client):
    def many(n):
        return {
            "setups": [
                {"name": f"S{i}", "brew_style": "espresso", "ratio": 2} for i in range(n)
            ]
        }

    assert auth_client.post("/api/import", json=many(1001)).status_code == 422
    assert auth_client.get("/api/setups").json() == []
    # Well past the old 200 cap: an account's own backup must restore.
    resp = auth_client.post("/api/import", json=many(250))
    assert resp.status_code == 202
    assert resp.json()["counts"]["setups"] == 250


def test_import_without_setups_key_still_works(auth_client):
    """A version-1 backup has no setups at all."""
    resp = auth_client.post(
        "/api/import", json={"beans": [{"name": "Old Bean"}], "brews": []}
    )

    assert resp.status_code == 202
    assert resp.json()["counts"] == {
        "beans": 1,
        "brews": 0,
        "setups": 0,
        "setups_skipped": 0,
    }
    assert _setups(auth_client) == []


def test_import_invalid_setup_is_422_before_any_write(auth_client):
    resp = auth_client.post(
        "/api/import",
        json={
            "beans": [{"name": "Should Not Land"}],
            "setups": [
                {"name": "Fine", "brew_style": "espresso", "ratio": 2},
                {"name": "Bad", "brew_style": "not-a-style", "ratio": 2},
            ],
        },
    )

    assert resp.status_code == 422
    assert auth_client.get("/api/beans/").json()["total"] == 0
    assert _setups(auth_client) == []


def test_import_setup_with_empty_id_is_422(auth_client):
    """An empty id would become a primary key nobody can address."""
    resp = auth_client.post(
        "/api/import",
        json={
            "setups": [
                {"id": "", "name": "A", "brew_style": "espresso", "ratio": 2},
                {"id": "", "name": "B", "brew_style": "espresso", "ratio": 2},
            ]
        },
    )

    assert resp.status_code == 422
    assert _setups(auth_client) == []


def test_import_loop_treats_a_falsy_setup_id_as_absent(db_session, test_user):
    """Belt and braces behind the schema: bypass validation and call the view."""
    from coffee_journal.models import BrewSetup
    from coffee_journal.routers.data import import_data
    from coffee_journal.schemas.brew import ImportPayload
    from coffee_journal.schemas.setup import SetupImport

    def raw(name):
        return SetupImport.model_construct(
            _fields_set={"id", "name", "brew_style", "ratio"},
            id="",
            name=name,
            brew_style="espresso",
            ratio=2.0,
        )

    payload = ImportPayload.model_construct(
        _fields_set={"setups"}, beans=[], brews=[], preferences=None,
        setups=[raw("A"), raw("B")],
    )

    result = import_data.__wrapped__(
        request=None, payload=payload, db=db_session, current_user=test_user
    )

    assert result["counts"]["setups"] == 2
    ids = [s.id for s in db_session.query(BrewSetup).all()]
    assert len(ids) == 2 and all(ids)


def test_import_setup_with_blank_name_or_oversized_id_is_422(auth_client):
    blank = auth_client.post(
        "/api/import",
        json={"setups": [{"name": "  ", "brew_style": "espresso", "ratio": 2}]},
    )
    long_id = auth_client.post(
        "/api/import",
        json={
            "setups": [
                {"id": "x" * 37, "name": "A", "brew_style": "espresso", "ratio": 2}
            ]
        },
    )
    assert blank.status_code == 422
    assert long_id.status_code == 422


def test_import_maps_duplicate_name_integrity_error_to_skipped(
    auth_client, monkeypatch
):
    """If the DB index trips after the pre-check (a concurrent writer), skip."""
    from coffee_journal import crud

    def boom(db, data):
        raise crud.setup.DuplicateSetupName

    monkeypatch.setattr(crud.setup, "create_setup", boom)

    resp = auth_client.post(
        "/api/import",
        json={"setups": [{"name": "Office", "brew_style": "espresso", "ratio": 2}]},
    )

    assert resp.status_code == 202
    counts = resp.json()["counts"]
    assert counts["setups"] == 0
    assert counts["setups_skipped"] == 1


def test_import_setup_keeps_own_id_when_free_and_ignores_timestamps(auth_client):
    resp = auth_client.post(
        "/api/import",
        json={
            "setups": [
                {
                    "id": "11111111-1111-1111-1111-111111111111",
                    "name": "Office",
                    "brew_style": "espresso",
                    "ratio": 2,
                    "created_at": "2001-01-01T00:00:00Z",
                    "updated_at": "2001-01-01T00:00:00Z",
                }
            ]
        },
    )

    assert resp.status_code == 202, resp.text
    (restored,) = _setups(auth_client)
    assert restored["id"] == "11111111-1111-1111-1111-111111111111"
    assert not restored["created_at"].startswith("2001")


def test_full_backup_round_trip_includes_setups_and_brew_snapshots(
    make_client, test_user, second_user
):
    client_a = make_client(test_user)
    bean = client_a.post("/api/beans/", json={"name": "Bean"}).json()
    _setup(client_a, "Office", machine_profile="Flat")
    client_a.post(
        "/api/brews/",
        json={
            "date": date.today().isoformat(),
            "bean_id": bean["id"],
            "bean_weight_g": 18,
            "water_weight_g": 36,
            "setup_name": "Office",
            "machine_profile": "Flat",
        },
    )
    export = client_a.get("/api/export").json()

    client_b = make_client(second_user)
    assert client_b.post("/api/import", json=export).status_code == 202

    assert [s["name"] for s in _setups(client_b)] == ["Office"]
    assert client_b.get("/api/brews/").json()["items"][0]["setup_name"] == "Office"


def test_import_old_backup_with_grind_on_setups_still_works(auth_client):
    """Backups made before grind moved off setups carry ``grind_setting`` on them."""
    payload = {
        "beans": [],
        "brews": [],
        "setups": [
            {
                "id": "old-setup-1",
                "name": "Office",
                "brew_style": "espresso",
                "ratio": 3,
                "dose_g": 18,
                "grinder_name": "Niche",
                "grind_setting": "14",
                "target_time_s": 36,
                "machine_profile": "DE1",
                "created_at": "2026-10-01T00:00:00Z",
                "updated_at": "2026-10-01T00:00:00Z",
            }
        ],
    }

    resp = auth_client.post("/api/import", json=payload)

    assert resp.status_code == 202, resp.text
    assert resp.json()["counts"]["setups"] == 1
    restored = _setups(auth_client)
    assert [s["name"] for s in restored] == ["Office"]
    assert restored[0]["dose_g"] == 18
    assert restored[0]["grinder_name"] == "Niche"
    assert "grind_setting" not in restored[0]
