"""Seed the database with sample beans and brews."""
from __future__ import annotations

import os
from datetime import date

from sqlalchemy.orm import Session

from ..db import SessionLocal
from ..models import Bean, Brew
from ..models.user import User

# Seeding is opt-in: there is deliberately NO default address.
#
# A hardcoded default would be an attackable identity. Seeding runs on every API
# boot (see start.sh), so a default like "demo@example.dev" would create that
# account on every deployment — and because sign-in is by magic link, whoever
# controls that domain's mailbox could request a link and take the account over.
# A reserved TLD (.local) is not an escape hatch either: EmailStr rejects it, so
# the account exists but can never be signed in to, which is how the seed user
# ended up unreachable in the first place.
#
# So: set SEED_USER_EMAIL to an address YOU control. Unset means no seeding.
SEED_USER_EMAIL = os.getenv("SEED_USER_EMAIL", "").strip()

SAMPLE_BEANS = [
    {
        "name": "Ethiopia Yirgacheffe",
        "roaster": "Blue Bottle",
        "origin": "Ethiopia",
        "process": "Natural",
        "roast_level": "Light",
        "notes": "Blueberry, jasmine, honey sweetness",
    },
    {
        "name": "Colombia Huila",
        "roaster": "Onyx",
        "origin": "Colombia",
        "process": "Washed",
        "roast_level": "Medium",
        "notes": "Caramel, stone fruit, balanced body",
    },
    {
        "name": "Guatemala Huehuetenango",
        "roaster": "Heart",
        "origin": "Guatemala",
        "process": "Honey",
        "roast_level": "Medium-Light",
        "notes": "Cocoa, citrus zest, floral aroma",
    },
]

SAMPLE_BREWS = [
    {
        "bean_name": "Ethiopia Yirgacheffe",
        "date": date.today(),
        "bean_weight_g": 18,
        "water_weight_g": 288,
        "brew_style": "pour-over",
        "grinder_name": "EK43",
        "grind_setting": "7.5",
        "water_temp_c": 96,
        "bloom_time_s": 40,
        "total_brew_time_s": 180,
        "agitation_events": [
            {"timestamp_s": 0, "action": "pour", "amount_g": 60},
            {"timestamp_s": 40, "action": "pour", "amount_g": 120},
            {"timestamp_s": 90, "action": "stir"},
        ],
        "tasting_notes": "Lush blueberries, bergamot, silky finish",
        "flavor_tags": ["Fruity", "Floral", "Citrus"],
        "rating": 9,
    },
    {
        "bean_name": "Colombia Huila",
        "date": date.today(),
        "bean_weight_g": 20,
        "water_weight_g": 320,
        "brew_style": "pour-over",
        "grinder_name": "Comandante C40",
        "grind_setting": "24 clicks",
        "water_temp_c": 94,
        "bloom_time_s": 45,
        "total_brew_time_s": 210,
        "tasting_notes": "Brown sugar sweetness with plum acidity",
        "flavor_tags": ["Chocolatey", "Caramel", "Berry"],
        "rating": 8,
    },
]


def _get_or_create_seed_user(session: Session) -> User:
    """Return the demo seed user, creating it if needed."""
    user = session.query(User).filter(User.email == SEED_USER_EMAIL).first()
    if not user:
        user = User(email=SEED_USER_EMAIL, display_name="Demo User")
        session.add(user)
        session.commit()
        session.refresh(user)
    return user


def seed(session: Session) -> None:
    seed_user = _get_or_create_seed_user(session)

    existing = {
        bean.name: bean
        for bean in session.query(Bean).filter(Bean.user_id == seed_user.id).all()
    }
    for bean_data in SAMPLE_BEANS:
        bean = existing.get(bean_data["name"])
        if not bean:
            bean = Bean(user_id=seed_user.id, **bean_data)
            session.add(bean)
            session.commit()
            session.refresh(bean)
            existing[bean.name] = bean

    for sample in SAMPLE_BREWS:
        brew_data = {k: v for k, v in sample.items() if k != "bean_name"}
        bean = existing.get(sample["bean_name"])
        if not bean:
            continue
        has_brew = (
            session.query(Brew)
            .filter(
                Brew.bean_id == bean.id,
                Brew.user_id == seed_user.id,
                Brew.date == brew_data["date"],
            )
            .first()
        )
        if has_brew:
            continue
        session.add(Brew(user_id=seed_user.id, bean_id=bean.id, **brew_data))
        session.commit()


def main() -> None:
    if not SEED_USER_EMAIL:
        print(
            "SEED_USER_EMAIL is not set - skipping seed. "
            "Set it to an email address you control to load the sample data."
        )
        return
    session = SessionLocal()
    try:
        seed(session)
    finally:
        session.close()


if __name__ == "__main__":
    main()
