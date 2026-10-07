"""Tests for saved brew setups (/api/setups)."""
from __future__ import annotations

import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from coffee_journal.models import BrewSetup

BASE = {"name": "Office", "brew_style": "espresso", "ratio": 3}


def _create(client, **overrides):
    resp = client.post("/api/setups", json={**BASE, **overrides})
    assert resp.status_code == 201, resp.text
    return resp.json()


# --- CRUD happy path --------------------------------------------------------


def test_create_returns_201_with_all_fields(auth_client):
    resp = auth_client.post(
        "/api/setups",
        json={
            "name": "Office",
            "brew_style": "espresso",
            "ratio": 3,
            "dose_g": 18,
            "grinder_name": "Niche Zero",
            "target_time_s": 36,
            "machine_profile": "Extractamundo Dos!",
        },
    )

    assert resp.status_code == 201
    body = resp.json()
    assert body["id"]
    assert body["name"] == "Office"
    assert body["brew_style"] == "espresso"
    assert body["ratio"] == 3
    assert body["dose_g"] == 18
    assert body["grinder_name"] == "Niche Zero"
    assert body["target_time_s"] == 36
    assert body["machine_profile"] == "Extractamundo Dos!"
    assert body["created_at"]
    assert body["updated_at"]
    assert "user_id" not in body


def test_create_minimal_leaves_optionals_null(auth_client):
    body = _create(auth_client, name="Home", brew_style="aeropress", ratio=8)

    assert body["dose_g"] is None
    assert body["grinder_name"] is None
    assert body["target_time_s"] is None
    assert body["machine_profile"] is None


def test_fractional_ratio_allowed(auth_client):
    assert _create(auth_client, ratio=2.5)["ratio"] == 2.5


def test_get_by_id(auth_client):
    created = _create(auth_client)

    resp = auth_client.get(f"/api/setups/{created['id']}")

    assert resp.status_code == 200
    assert resp.json() == created


def test_get_unknown_id_404(auth_client):
    assert auth_client.get("/api/setups/nope").status_code == 404


def test_patch_updates_only_sent_fields(auth_client):
    created = _create(auth_client, dose_g=18, grinder_name="Niche")

    resp = auth_client.patch(
        f"/api/setups/{created['id']}", json={"ratio": 2.5, "target_time_s": 30}
    )

    assert resp.status_code == 200
    body = resp.json()
    assert body["ratio"] == 2.5
    assert body["target_time_s"] == 30
    assert body["dose_g"] == 18
    assert body["grinder_name"] == "Niche"
    assert body["name"] == "Office"
    # Persisted
    assert auth_client.get(f"/api/setups/{created['id']}").json() == body


def test_patch_null_clears_optional_fields(auth_client):
    created = _create(
        auth_client,
        dose_g=18,
        grinder_name="Niche",
        target_time_s=36,
        machine_profile="DE1",
    )

    resp = auth_client.patch(
        f"/api/setups/{created['id']}",
        json={
            "dose_g": None,
            "grinder_name": None,
            "target_time_s": None,
            "machine_profile": None,
        },
    )

    assert resp.status_code == 200
    body = resp.json()
    for field in ("dose_g", "grinder_name", "target_time_s", "machine_profile"):
        assert body[field] is None
    assert body["name"] == "Office"


@pytest.mark.parametrize("field", ["name", "brew_style", "ratio"])
def test_patch_null_on_required_field_422(auth_client, field):
    created = _create(auth_client)

    resp = auth_client.patch(f"/api/setups/{created['id']}", json={field: None})

    assert resp.status_code == 422
    assert auth_client.get(f"/api/setups/{created['id']}").json() == created


def test_patch_ignores_unknown_and_protected_fields(auth_client, second_user):
    created = _create(auth_client)

    resp = auth_client.patch(
        f"/api/setups/{created['id']}",
        json={"user_id": second_user.id, "id": "hijack", "ratio": 4},
    )

    assert resp.status_code == 200
    assert resp.json()["id"] == created["id"]
    assert resp.json()["ratio"] == 4


def test_delete_returns_204_then_404(auth_client):
    created = _create(auth_client)

    assert auth_client.delete(f"/api/setups/{created['id']}").status_code == 204
    assert auth_client.get(f"/api/setups/{created['id']}").status_code == 404
    assert auth_client.delete(f"/api/setups/{created['id']}").status_code == 404
    assert auth_client.get("/api/setups").json() == []


def test_list_ordered_by_name(auth_client):
    _create(auth_client, name="office")
    _create(auth_client, name="Alpha")
    _create(auth_client, name="Home")

    names = [s["name"] for s in auth_client.get("/api/setups").json()]

    assert names == ["Alpha", "Home", "office"]


# --- Validation -------------------------------------------------------------


@pytest.mark.parametrize("ratio", [0, -1, -0.5, 30.01, 31, 1000])
def test_bad_ratio_422(auth_client, ratio):
    resp = auth_client.post("/api/setups", json={**BASE, "ratio": ratio})
    assert resp.status_code == 422


def test_ratio_boundary_30_ok(auth_client):
    assert _create(auth_client, ratio=30)["ratio"] == 30


def _raw_post(client, raw_json: str):
    return client.post(
        "/api/setups", content=raw_json, headers={"Content-Type": "application/json"}
    )


@pytest.mark.parametrize("token", ["NaN", "Infinity", "-Infinity"])
def test_non_finite_ratio_422(auth_client, token):
    raw = f'{{"name": "X", "brew_style": "espresso", "ratio": {token}}}'
    assert _raw_post(auth_client, raw).status_code == 422


@pytest.mark.parametrize("token", ["NaN", "Infinity", "-Infinity"])
def test_non_finite_dose_422(auth_client, token):
    raw = f'{{"name": "X", "brew_style": "espresso", "ratio": 3, "dose_g": {token}}}'
    assert _raw_post(auth_client, raw).status_code == 422


def test_non_finite_on_patch_422(auth_client):
    created = _create(auth_client)
    for field in ("ratio", "dose_g"):
        resp = auth_client.patch(
            f"/api/setups/{created['id']}",
            content=f'{{"{field}": NaN}}',
            headers={"Content-Type": "application/json"},
        )
        assert resp.status_code == 422, field


@pytest.mark.parametrize("dose", [0, -5, 0.05, 0.09])
def test_bad_dose_422(auth_client, dose):
    resp = auth_client.post("/api/setups", json={**BASE, "dose_g": dose})
    assert resp.status_code == 422


def test_smallest_dose_ok(auth_client):
    # Matches the log form's dose input (min 0.1), so an accepted setup dose can
    # always be submitted as a brew.
    assert _create(auth_client, dose_g=0.1)["dose_g"] == 0.1


def test_negative_target_time_422(auth_client):
    resp = auth_client.post("/api/setups", json={**BASE, "target_time_s": -1})
    assert resp.status_code == 422


def test_zero_target_time_ok(auth_client):
    assert _create(auth_client, target_time_s=0)["target_time_s"] == 0


def test_target_time_upper_bound(auth_client):
    # One day. Anything larger is nonsense and, unbounded, overflows int4 on
    # Postgres (500).
    assert _create(auth_client, target_time_s=86_400)["target_time_s"] == 86_400
    for value in (86_401, 2**31, 10**12):
        resp = auth_client.post("/api/setups", json={**BASE, "name": "t", "target_time_s": value})
        assert resp.status_code == 422, value


def test_target_time_upper_bound_on_patch(auth_client):
    created = _create(auth_client)
    url = f"/api/setups/{created['id']}"
    assert auth_client.patch(url, json={"target_time_s": 86_400}).status_code == 200
    assert auth_client.patch(url, json={"target_time_s": 86_401}).status_code == 422
    assert auth_client.patch(url, json={"target_time_s": 2**31}).status_code == 422


def test_fractional_target_time_422(auth_client):
    resp = auth_client.post("/api/setups", json={**BASE, "target_time_s": 36.5})
    assert resp.status_code == 422


@pytest.mark.parametrize("style", ["pour-over", "aeropress", "french-press", "espresso"])
def test_supported_styles_accepted(auth_client, style):
    assert _create(auth_client, brew_style=style)["brew_style"] == style


@pytest.mark.parametrize("style", ["moka", "", "Espresso", "pour over"])
def test_unknown_style_422(auth_client, style):
    resp = auth_client.post("/api/setups", json={**BASE, "brew_style": style})
    assert resp.status_code == 422


def test_unknown_style_on_patch_422(auth_client):
    created = _create(auth_client)
    resp = auth_client.patch(f"/api/setups/{created['id']}", json={"brew_style": "moka"})
    assert resp.status_code == 422


@pytest.mark.parametrize(
    "field,limit",
    [
        ("name", 80),
        ("grinder_name", 120),
        ("machine_profile", 120),
    ],
)
def test_over_length_strings_422(auth_client, field, limit):
    ok = auth_client.post(
        "/api/setups", json={**BASE, "name": "ok", field: "x" * limit}
    )
    assert ok.status_code == 201, ok.text

    resp = auth_client.post(
        "/api/setups", json={**BASE, "name": "ok2", field: "x" * (limit + 1)}
    )
    assert resp.status_code == 422


def test_over_length_on_patch_422(auth_client):
    created = _create(auth_client)
    resp = auth_client.patch(
        f"/api/setups/{created['id']}", json={"grinder_name": "x" * 121}
    )
    assert resp.status_code == 422


@pytest.mark.parametrize("name", ["", " ", "   ", "\t\n"])
def test_blank_name_422(auth_client, name):
    resp = auth_client.post("/api/setups", json={**BASE, "name": name})
    assert resp.status_code == 422


def test_blank_name_on_patch_422(auth_client):
    created = _create(auth_client)
    resp = auth_client.patch(f"/api/setups/{created['id']}", json={"name": "   "})
    assert resp.status_code == 422


def test_name_trimmed_on_create_and_patch(auth_client):
    created = _create(auth_client, name="  Office  ")
    assert created["name"] == "Office"

    resp = auth_client.patch(f"/api/setups/{created['id']}", json={"name": "  Home\t"})
    assert resp.json()["name"] == "Home"
    assert auth_client.get(f"/api/setups/{created['id']}").json()["name"] == "Home"


def test_name_length_checked_after_trim(auth_client):
    assert _create(auth_client, name="  " + "x" * 80 + "  ")["name"] == "x" * 80


# --- Duplicate names --------------------------------------------------------


def test_duplicate_name_on_create_409(auth_client):
    _create(auth_client, name="Office")

    resp = auth_client.post("/api/setups", json={**BASE, "name": "Office"})

    assert resp.status_code == 409
    assert len(auth_client.get("/api/setups").json()) == 1


@pytest.mark.parametrize("name", ["office", "OFFICE", " oFFice "])
def test_duplicate_name_different_case_on_create_409(auth_client, name):
    _create(auth_client, name="Office")

    assert auth_client.post("/api/setups", json={**BASE, "name": name}).status_code == 409


def test_duplicate_name_on_rename_409(auth_client):
    _create(auth_client, name="Office")
    other = _create(auth_client, name="Home")

    for name in ("Office", "office"):
        resp = auth_client.patch(f"/api/setups/{other['id']}", json={"name": name})
        assert resp.status_code == 409

    assert auth_client.get(f"/api/setups/{other['id']}").json()["name"] == "Home"


def test_case_only_rename_of_self_ok(auth_client):
    created = _create(auth_client, name="office")

    resp = auth_client.patch(f"/api/setups/{created['id']}", json={"name": "Office"})

    assert resp.status_code == 200
    assert resp.json()["name"] == "Office"


def test_patch_same_name_ok(auth_client):
    created = _create(auth_client, name="Office")

    resp = auth_client.patch(
        f"/api/setups/{created['id']}", json={"name": "Office", "ratio": 2}
    )

    assert resp.status_code == 200


def test_same_name_allowed_for_different_users(make_client, test_user, second_user):
    _create(make_client(test_user), name="Office")

    resp = make_client(second_user).post("/api/setups", json={**BASE, "name": "office"})

    assert resp.status_code == 201


# --- DB-level uniqueness / IntegrityError mapping ---------------------------


def test_db_index_enforces_case_insensitive_uniqueness(db_session, test_user, second_user):
    db_session.add(
        BrewSetup(user_id=test_user.id, name="Office", brew_style="espresso", ratio=3)
    )
    db_session.commit()

    # Another user may reuse the name.
    db_session.add(
        BrewSetup(user_id=second_user.id, name="office", brew_style="espresso", ratio=3)
    )
    db_session.flush()

    db_session.add(
        BrewSetup(user_id=test_user.id, name="OFFICE", brew_style="espresso", ratio=3)
    )
    with pytest.raises(IntegrityError):
        db_session.flush()


def test_integrity_error_on_create_maps_to_409(auth_client, monkeypatch):
    """A concurrent create slips past the pre-check; the unique index must
    surface as 409, not 500."""
    from coffee_journal.crud import setup as setup_crud

    _create(auth_client, name="Office")
    monkeypatch.setattr(setup_crud, "name_taken", lambda *a, **k: False)

    resp = auth_client.post("/api/setups", json={**BASE, "name": "office"})

    assert resp.status_code == 409


def test_integrity_error_on_rename_maps_to_409(auth_client, monkeypatch):
    from coffee_journal.crud import setup as setup_crud

    _create(auth_client, name="Office")
    other = _create(auth_client, name="Home")
    monkeypatch.setattr(setup_crud, "name_taken", lambda *a, **k: False)

    resp = auth_client.patch(f"/api/setups/{other['id']}", json={"name": "OFFICE"})

    assert resp.status_code == 409


def test_session_usable_after_duplicate_integrity_error(db_session, test_user, monkeypatch):
    """create_setup must roll back on the index violation; otherwise the session
    is left in "transaction has been rolled back" state and the next query
    raises PendingRollbackError."""
    from coffee_journal.crud import setup as setup_crud

    user_id = test_user.id
    setup_crud.create_setup(
        db_session, {"user_id": user_id, "name": "Office", "brew_style": "espresso", "ratio": 3}
    )
    monkeypatch.setattr(setup_crud, "name_taken", lambda *a, **k: False)

    with pytest.raises(setup_crud.DuplicateSetupName):
        setup_crud.create_setup(
            db_session,
            {"user_id": user_id, "name": "OFFICE", "brew_style": "espresso", "ratio": 3},
        )

    # Would raise PendingRollbackError had the session not been rolled back.
    db_session.scalars(select(BrewSetup)).all()


def test_non_name_integrity_error_is_not_mapped_to_duplicate(db_session, test_user):
    """Only the name index maps to DuplicateSetupName; any other integrity
    error (here NOT NULL on brew_style) is a bug and must stay loud."""
    from coffee_journal.crud import setup as setup_crud

    data = {"user_id": test_user.id, "name": "Broken", "brew_style": None, "ratio": 3}

    with pytest.raises(IntegrityError) as excinfo:
        setup_crud.create_setup(db_session, data)

    assert not isinstance(excinfo.value, setup_crud.DuplicateSetupName)
    # Still rolled back, so the session is usable.
    db_session.scalars(select(BrewSetup)).all()


# --- Tenancy / auth ---------------------------------------------------------


def test_other_user_cannot_see_or_touch_setup(make_client, test_user, second_user, db_session):
    a = make_client(test_user)
    created = _create(a, name="Mine")
    # Capture ids now: objects may expire between client swaps.
    setup_id = created["id"]

    b = make_client(second_user)
    assert b.get("/api/setups").json() == []
    assert b.get(f"/api/setups/{setup_id}").status_code == 404
    assert b.patch(f"/api/setups/{setup_id}", json={"ratio": 5}).status_code == 404
    assert b.delete(f"/api/setups/{setup_id}").status_code == 404

    a = make_client(test_user)
    still = a.get(f"/api/setups/{setup_id}")
    assert still.status_code == 200
    assert still.json() == created
    assert [s["id"] for s in a.get("/api/setups").json()] == [setup_id]


def test_list_contains_only_own_setups(make_client, test_user, second_user):
    _create(make_client(test_user), name="A-mine")
    _create(make_client(second_user), name="B-theirs")

    names_a = [s["name"] for s in make_client(test_user).get("/api/setups").json()]
    names_b = [s["name"] for s in make_client(second_user).get("/api/setups").json()]

    assert names_a == ["A-mine"]
    assert names_b == ["B-theirs"]


def test_other_users_name_does_not_block_rename(make_client, test_user, second_user):
    """Another user's setup name never blocks my rename."""
    _create(make_client(second_user), name="Shared")
    mine = _create(make_client(test_user), name="Mine")

    resp = make_client(test_user).patch(
        f"/api/setups/{mine['id']}", json={"name": "shared"}
    )

    assert resp.status_code == 200


def test_unauthenticated_401(client):
    assert client.get("/api/setups").status_code == 401
    assert client.get("/api/setups/x").status_code == 401
    assert client.post("/api/setups", json=BASE).status_code == 401
    assert client.patch("/api/setups/x", json={"ratio": 2}).status_code == 401
    assert client.delete("/api/setups/x").status_code == 401


# --- Optional text normalisation --------------------------------------------

OPTIONAL_TEXT = ("grinder_name", "machine_profile")


@pytest.mark.parametrize("field", OPTIONAL_TEXT)
def test_optional_text_stripped_on_create(auth_client, field):
    assert _create(auth_client, **{field: "  Niche Zero \t"})[field] == "Niche Zero"


@pytest.mark.parametrize("field", OPTIONAL_TEXT)
@pytest.mark.parametrize("blank", ["", "   ", "\t\n"])
def test_blank_optional_text_becomes_null_on_create(auth_client, field, blank):
    assert _create(auth_client, **{field: blank})[field] is None


@pytest.mark.parametrize("field", OPTIONAL_TEXT)
def test_optional_text_normalised_on_patch(auth_client, field):
    created = _create(auth_client, **{field: "x"})
    url = f"/api/setups/{created['id']}"

    assert auth_client.patch(url, json={field: "  y "}).json()[field] == "y"
    assert auth_client.patch(url, json={field: "  "}).json()[field] is None
    # Omitted fields are untouched.
    auth_client.patch(url, json={field: "z"})
    assert auth_client.patch(url, json={"ratio": 2}).json()[field] == "z"


def test_optional_text_length_checked_after_strip(auth_client):
    assert _create(auth_client, grinder_name=" " + "x" * 120 + " ")["grinder_name"] == "x" * 120
    resp = auth_client.post(
        "/api/setups", json={**BASE, "name": "n2", "grinder_name": "x" * 121}
    )
    assert resp.status_code == 422


# --- App-wide validation error handler --------------------------------------


def test_validation_handler_survives_nan_on_other_routes(auth_client):
    """FastAPI's default 422 echoes the input; NaN is not valid JSON, so the
    default handler turned this into a 500."""
    resp = auth_client.post(
        "/api/beans/",
        content='{"name": "Beans", "elevation_m": NaN}',
        headers={"Content-Type": "application/json"},
    )

    assert resp.status_code == 422
    detail = resp.json()["detail"]
    assert isinstance(detail, list) and detail
    assert detail[0]["input"] == "nan"


# --- Grind no longer lives on a setup ---------------------------------------
# It is prefilled from the last brew of the bean on the grinder instead
# (tests/test_last_grind.py). Unknown keys are ignored, as on every other schema,
# so stale clients and old backup files keep working.


def test_setup_has_no_grind_setting_column():
    assert not hasattr(BrewSetup, "grind_setting")


def test_create_ignores_grind_setting_and_does_not_return_it(auth_client):
    body = _create(auth_client, grind_setting="14")

    assert "grind_setting" not in body
    assert "grind_setting" not in auth_client.get(f"/api/setups/{body['id']}").json()
    assert all("grind_setting" not in s for s in auth_client.get("/api/setups").json())


def test_patch_ignores_grind_setting(auth_client):
    created = _create(auth_client, dose_g=18)

    resp = auth_client.patch(
        f"/api/setups/{created['id']}", json={"grind_setting": "99", "ratio": 2.5}
    )

    assert resp.status_code == 200
    body = resp.json()
    assert body["ratio"] == 2.5
    assert body["dose_g"] == 18
    assert "grind_setting" not in body
