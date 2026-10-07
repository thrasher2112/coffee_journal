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


# --- setup snapshot columns -------------------------------------------------


def _brew_payload(bean_id, **extra):
    return {
        "date": date.today().isoformat(),
        "bean_id": bean_id,
        "bean_weight_g": 18,
        "water_weight_g": 36,
        **extra,
    }


def test_brew_setup_snapshot_round_trips(auth_client):
    bean_id = _create_bean(auth_client)
    resp = auth_client.post(
        "/api/brews/",
        json=_brew_payload(bean_id, setup_name="Office", machine_profile="Flat 6 bar"),
    )
    assert resp.status_code == 201
    created = resp.json()
    assert created["setup_name"] == "Office"
    assert created["machine_profile"] == "Flat 6 bar"

    got = auth_client.get(f"/api/brews/{created['id']}").json()
    assert got["setup_name"] == "Office"
    assert got["machine_profile"] == "Flat 6 bar"
    listed = auth_client.get("/api/brews/").json()["items"][0]
    assert listed["setup_name"] == "Office"


def test_brew_setup_snapshot_defaults_to_null(auth_client):
    bean_id = _create_bean(auth_client)
    brew = auth_client.post("/api/brews/", json=_brew_payload(bean_id)).json()
    assert brew["setup_name"] is None
    assert brew["machine_profile"] is None


def test_brew_setup_snapshot_blank_becomes_null(auth_client):
    bean_id = _create_bean(auth_client)
    brew = auth_client.post(
        "/api/brews/", json=_brew_payload(bean_id, setup_name="  ", machine_profile="")
    ).json()
    assert brew["setup_name"] is None
    assert brew["machine_profile"] is None


def test_brew_update_can_set_and_clear_setup_snapshot(auth_client):
    bean_id = _create_bean(auth_client)
    brew = auth_client.post(
        "/api/brews/",
        json=_brew_payload(bean_id, setup_name="Office", machine_profile="Flat"),
    ).json()
    url = f"/api/brews/{brew['id']}"

    # Omitted -> untouched.
    resp = auth_client.put(url, json={"rating": 7})
    assert resp.json()["setup_name"] == "Office"

    # Changed.
    resp = auth_client.put(url, json={"setup_name": "Home"})
    assert resp.json()["setup_name"] == "Home"
    assert resp.json()["machine_profile"] == "Flat"

    # Explicit null clears.
    resp = auth_client.put(url, json={"setup_name": None, "machine_profile": None})
    assert resp.status_code == 200
    assert resp.json()["setup_name"] is None
    assert resp.json()["machine_profile"] is None
    assert auth_client.get(url).json()["setup_name"] is None


def test_brew_setup_snapshot_length_limits(auth_client):
    bean_id = _create_bean(auth_client)
    for field, limit in (("setup_name", 80), ("machine_profile", 120)):
        ok = auth_client.post(
            "/api/brews/", json=_brew_payload(bean_id, **{field: "x" * limit})
        )
        assert ok.status_code == 201
        bad = auth_client.post(
            "/api/brews/", json=_brew_payload(bean_id, **{field: "x" * (limit + 1)})
        )
        assert bad.status_code == 422
        put = auth_client.put(
            f"/api/brews/{ok.json()['id']}", json={field: "x" * (limit + 1)}
        )
        assert put.status_code == 422


def test_brew_setup_name_is_not_validated_against_setups(auth_client):
    """The snapshot is plain text: a name with no matching setup is fine."""
    bean_id = _create_bean(auth_client)
    resp = auth_client.post(
        "/api/brews/", json=_brew_payload(bean_id, setup_name="Deleted Long Ago")
    )
    assert resp.status_code == 201
    assert auth_client.get("/api/setups").json() == []


def test_brew_setup_snapshot_survives_setup_rename_and_delete(auth_client):
    bean_id = _create_bean(auth_client)
    setup = auth_client.post(
        "/api/setups", json={"name": "Office", "brew_style": "espresso", "ratio": 2}
    ).json()
    brew = auth_client.post(
        "/api/brews/", json=_brew_payload(bean_id, setup_name=setup["name"])
    ).json()
    auth_client.put(f"/api/setups/{setup['id']}", json={"name": "Renamed"})
    auth_client.delete(f"/api/setups/{setup['id']}")
    assert auth_client.get(f"/api/brews/{brew['id']}").json()["setup_name"] == "Office"
