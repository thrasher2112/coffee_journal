"""Tests for GET /api/brews/last-grind (the grind prefill source)."""
from __future__ import annotations

import pytest

URL = "/api/brews/last-grind"


def _bean(client, name="Ethiopia"):
    resp = client.post("/api/beans/", json={"name": name})
    assert resp.status_code == 201
    return resp.json()["id"]


def _brew(client, bean_id, *, date="2026-10-01", grind="14", grinder="Niche Zero", **extra):
    payload = {
        "date": date,
        "bean_id": bean_id,
        "bean_weight_g": 18,
        "water_weight_g": 288,
        "grind_setting": grind,
        "grinder_name": grinder,
        **extra,
    }
    resp = client.post("/api/brews/", json=payload)
    assert resp.status_code == 201, resp.text
    return resp.json()


def _last(client, bean_id, grinder="Niche Zero"):
    return client.get(URL, params={"bean_id": bean_id, "grinder_name": grinder})


def test_returns_grind_and_brew_date(auth_client):
    bean = _bean(auth_client)
    _brew(auth_client, bean, date="2026-10-03", grind="14.5")

    resp = _last(auth_client, bean)

    assert resp.status_code == 200
    assert resp.json() == {"grind_setting": "14.5", "date": "2026-10-03"}


def test_none_is_200_with_null_body(auth_client):
    bean = _bean(auth_client)

    resp = _last(auth_client, bean)

    assert resp.status_code == 200
    assert resp.json() is None


@pytest.mark.parametrize("query", ["niche zero", "NICHE ZERO", "  Niche Zero\t"])
def test_grinder_match_is_case_insensitive_and_trimmed(auth_client, query):
    bean = _bean(auth_client)
    _brew(auth_client, bean, grind="14")

    assert _last(auth_client, bean, query).json()["grind_setting"] == "14"


def test_stored_grinder_name_is_normalised_too(auth_client):
    bean = _bean(auth_client)
    _brew(auth_client, bean, grind="12", grinder="  niche ZERO ")

    assert _last(auth_client, bean, "Niche Zero").json()["grind_setting"] == "12"


def test_whitespace_only_grinder_matches_nothing(auth_client):
    bean = _bean(auth_client)
    _brew(auth_client, bean, grind="12", grinder="   ")

    assert _last(auth_client, bean, "   ").json() is None


def test_newest_date_wins_regardless_of_insertion_order(auth_client):
    bean = _bean(auth_client)
    _brew(auth_client, bean, date="2026-10-05", grind="newest")
    _brew(auth_client, bean, date="2026-10-01", grind="older")  # logged later

    assert _last(auth_client, bean).json() == {"grind_setting": "newest", "date": "2026-10-05"}


def test_same_date_falls_back_to_created_at(auth_client):
    bean = _bean(auth_client)
    _brew(auth_client, bean, date="2026-10-05", grind="first")
    _brew(auth_client, bean, date="2026-10-05", grind="second")

    assert _last(auth_client, bean).json()["grind_setting"] == "second"


def test_other_grinder_is_ignored(auth_client):
    bean = _bean(auth_client)
    _brew(auth_client, bean, date="2026-10-01", grind="14", grinder="Niche Zero")
    _brew(auth_client, bean, date="2026-10-05", grind="24 clicks", grinder="Comandante C40")

    assert _last(auth_client, bean, "Niche Zero").json()["grind_setting"] == "14"
    assert _last(auth_client, bean, "Comandante C40").json()["grind_setting"] == "24 clicks"
    assert _last(auth_client, bean, "Timemore").json() is None


def test_brews_without_grinder_are_ignored(auth_client):
    bean = _bean(auth_client)
    _brew(auth_client, bean, grind="14", grinder=None)

    assert _last(auth_client, bean).json() is None


def test_other_bean_is_ignored(auth_client):
    bean_a, bean_b = _bean(auth_client, "A"), _bean(auth_client, "B")
    _brew(auth_client, bean_a, grind="14")

    assert _last(auth_client, bean_b).json() is None


@pytest.mark.parametrize("blank", [None, "", "   "])
def test_empty_or_null_grind_is_skipped(auth_client, blank):
    bean = _bean(auth_client)
    _brew(auth_client, bean, date="2026-10-01", grind="14")
    _brew(auth_client, bean, date="2026-10-05", grind=blank)  # newer, but no grind

    assert _last(auth_client, bean).json() == {"grind_setting": "14", "date": "2026-10-01"}


@pytest.mark.parametrize("blank", ["\t", "\n", " \t \n "])
def test_whitespace_other_than_spaces_is_blank_and_hides_nothing(auth_client, blank):
    bean = _bean(auth_client)
    _brew(auth_client, bean, date="2026-10-01", grind="14")
    _brew(auth_client, bean, date="2026-10-05", grind=blank)  # newer, tab/newline only

    assert _last(auth_client, bean).json() == {"grind_setting": "14", "date": "2026-10-01"}


def test_only_tab_grinds_gives_null(auth_client):
    bean = _bean(auth_client)
    _brew(auth_client, bean, grind="\t")

    assert _last(auth_client, bean).json() is None


def test_only_blank_grinds_gives_null(auth_client):
    bean = _bean(auth_client)
    _brew(auth_client, bean, grind="  ")

    assert _last(auth_client, bean).json() is None


def test_returned_grind_is_trimmed(auth_client):
    bean = _bean(auth_client)
    _brew(auth_client, bean, grind=" 14 ")

    assert _last(auth_client, bean).json()["grind_setting"] == "14"


def test_other_users_brews_and_beans_are_invisible(make_client, test_user, second_user):
    client_a = make_client(test_user)
    bean_a = _bean(client_a)
    _brew(client_a, bean_a, grind="secret")

    client_b = make_client(second_user)
    # B asks about A's bean id with the same grinder name.
    assert _last(client_b, bean_a).json() is None
    # B's own brews never leak into A, even for the same grinder name.
    bean_b = _bean(client_b, "B bean")
    _brew(client_b, bean_b, grind="b-grind")
    assert _last(make_client(test_user), bean_b).json() is None
    assert _last(make_client(test_user), bean_a).json()["grind_setting"] == "secret"


def test_unknown_bean_id_is_null_not_404(auth_client):
    assert _last(auth_client, "does-not-exist").json() is None


def test_does_not_collide_with_brew_id_route(auth_client):
    bean = _bean(auth_client)
    brew = _brew(auth_client, bean)

    assert auth_client.get(f"/api/brews/{brew['id']}").status_code == 200
    assert _last(auth_client, bean).status_code == 200


def test_trailing_slash_redirects(auth_client):
    bean = _bean(auth_client)
    _brew(auth_client, bean, grind="14")

    resp = auth_client.get(
        URL + "/", params={"bean_id": bean, "grinder_name": "Niche Zero"}
    )

    assert resp.status_code == 200
    assert resp.json()["grind_setting"] == "14"


@pytest.mark.parametrize(
    "params",
    [
        {},
        {"bean_id": "b"},
        {"grinder_name": "g"},
        {"bean_id": "", "grinder_name": "g"},
        {"bean_id": "b", "grinder_name": ""},
        {"bean_id": "b" * 37, "grinder_name": "g"},
        {"bean_id": "b", "grinder_name": "g" * 121},
    ],
)
def test_bad_params_are_422(auth_client, params):
    assert auth_client.get(URL, params=params).status_code == 422


def test_param_length_boundaries_accepted(auth_client):
    resp = auth_client.get(URL, params={"bean_id": "b" * 36, "grinder_name": "g" * 120})

    assert resp.status_code == 200
    assert resp.json() is None


def test_requires_authentication(client):
    assert client.get(URL, params={"bean_id": "b", "grinder_name": "g"}).status_code == 401
