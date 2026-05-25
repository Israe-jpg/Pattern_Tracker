"""
Seed script: Add 5 months of realistic Sleep Journal data for iris1@gmail.com.

Fills ONLY the custom "sleep" TrackerField (field_id=304) options:
  hours_slept, quality, time_i_went_to_bed, time_i_woke_up,
  how_i_felt_when_i_woke_up, woke_up_during_the_night,
  slept_instantly, used_screens_before_bed,
  factors_affecting_my_sleep, environnement

Patterns baked in (so analytics can detect correlations + trends):
  - Screen use → worse quality, harder to fall asleep
  - Stress factor → night wake-ups, exhausted mornings
  - Hours slept → determines feeling on waking
  - Late bedtime on weekends / travel nights
  - Month 1-2 baseline, Month 3 stress dip, Month 4-5 recovery trend

Run from backend/:
    & .\\venv\\Scripts\\Activate.ps1; python scripts/seed_sleep_journal.py
"""

import sys
import os
import random
from datetime import date, timedelta, datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import create_app, db
from app.models.user import User
from app.models.tracker import Tracker
from app.models.tracker_category import TrackerCategory
from app.models.tracking_data import TrackingData

# ── Constants for the custom sleep field options ──────────────────────────────
FEELINGS   = ["Refreshed", "Good", "Energized", "Fully rested", "Exhausted", "Neutral"]
FACTORS    = ["Stress", "Noise", "Light", "Temperature", "Exercise",
              "Alcohol", "Heavy meal", "Bad dreams", "None", "Physical pain"]
ENVS       = ["Home", "Travel", "Friends", "Other"]

# ── Date generation ────────────────────────────────────────────────────────────

def generate_dates(start: date, end: date) -> list[date]:
    """~3 days/week most weeks, some full weeks, some sparse weeks."""
    chosen = []
    cursor = start - timedelta(days=start.weekday())   # align to Monday

    while cursor <= end:
        week = [cursor + timedelta(days=i) for i in range(7) if cursor + timedelta(days=i) <= end]
        week = [d for d in week if start <= d <= end]
        if not week:
            break
        roll = random.random()
        if roll < 0.22:
            chosen.extend(week)                                        # full week
        elif roll < 0.32:
            chosen.extend(random.sample(week, min(1, len(week))))      # very sparse
        elif roll < 0.48:
            chosen.extend(random.sample(week, min(2, len(week))))      # 2 days
        else:
            chosen.extend(random.sample(week, min(3, len(week))))      # 3 days (most common)
        cursor += timedelta(days=7)

    return sorted(set(chosen))


# ── Helpers ────────────────────────────────────────────────────────────────────

def hhmm(hour: int, minute: int) -> str:
    return f"{hour % 24:02d}:{minute:02d}"


def weighted_choice(options, weights):
    return random.choices(options, weights=weights, k=1)[0]


# ── Core entry generator ───────────────────────────────────────────────────────

def generate_sleep_entry(entry_date: date, phase: str) -> dict:
    """
    phase:  'baseline' | 'stress' | 'recovery'
    Returns the `data` dict to store in TrackingData.data under key "sleep".
    """
    is_weekend  = entry_date.weekday() >= 5
    is_stress   = phase == "stress"
    is_recovery = phase == "recovery"

    # ── Environment ────────────────────────────────────────────────────────────
    # Travel is ~10 % of nights (slightly higher in recovery)
    env_weights = [78, 10, 7, 5] if not is_stress else [85, 7, 5, 3]
    environment = weighted_choice(ENVS, env_weights)
    away = (environment != "Home")

    # ── Screens before bed ─────────────────────────────────────────────────────
    # Stress phase: more screens (doom-scrolling); recovery: intentionally reducing
    if is_stress:
        screens = random.random() < 0.72
    elif is_recovery:
        screens = random.random() < 0.35
    else:
        screens = random.random() < 0.55

    # ── Bedtime ────────────────────────────────────────────────────────────────
    if is_weekend:
        hour_weights = [5, 10, 20, 30, 20, 10, 5]   # 21-03
        bedtime_hour = weighted_choice(range(21, 28), hour_weights) % 24
    elif is_stress:
        hour_weights = [5, 15, 25, 30, 15, 7, 3]
        bedtime_hour = weighted_choice(range(21, 28), hour_weights) % 24
    else:
        hour_weights = [10, 25, 30, 20, 10, 4, 1]
        bedtime_hour = weighted_choice(range(21, 28), hour_weights) % 24
    bedtime_min = random.choice([0, 15, 30, 45])

    # ── Hours slept (0-16 rating scale) ───────────────────────────────────────
    # Late bedtime → fewer hours; stress → fewer; recovery → rebound
    if is_stress:
        raw_hours = random.gauss(5.5, 1.2)
    elif is_recovery:
        raw_hours = random.gauss(7.5, 0.8)
    elif away:
        raw_hours = random.gauss(6.5, 1.0)
    elif screens:
        raw_hours = random.gauss(6.3, 1.0)
    else:
        raw_hours = random.gauss(7.2, 0.9)

    # Late bedtime nudge
    if bedtime_hour in (1, 2, 3):
        raw_hours -= 1.0
    hours_slept = max(0, min(16, round(raw_hours)))

    # ── Woke-up time (derived from bedtime + hours) ────────────────────────────
    wake_total_min = (bedtime_hour * 60 + bedtime_min) + int(hours_slept * 60) + random.randint(-20, 20)
    wake_hour  = (wake_total_min // 60) % 24
    wake_min   = (wake_total_min % 60 // 15) * 15

    # ── Sleep quality (0-5) ────────────────────────────────────────────────────
    # Correlates with hours slept, screen use, stress, and travel
    quality_base = 2.5
    if hours_slept >= 8:   quality_base += 1.5
    elif hours_slept >= 7: quality_base += 1.0
    elif hours_slept >= 6: quality_base += 0.0
    elif hours_slept < 5:  quality_base -= 1.0
    if screens:            quality_base -= 0.6
    if is_stress:          quality_base -= 0.8
    if is_recovery:        quality_base += 0.6
    if away:               quality_base -= 0.3
    quality = max(0, min(5, round(quality_base + random.gauss(0, 0.6))))

    # ── Woke up during night ───────────────────────────────────────────────────
    # Correlated with poor quality + stress
    wake_prob = 0.25
    if is_stress:       wake_prob += 0.30
    if quality <= 2:    wake_prob += 0.30
    elif quality >= 4:  wake_prob -= 0.15
    if away:            wake_prob += 0.10
    woke_up = random.random() < wake_prob

    # ── Slept instantly ────────────────────────────────────────────────────────
    instant_prob = 0.55
    if screens:       instant_prob -= 0.30
    if is_stress:     instant_prob -= 0.25
    if is_recovery:   instant_prob += 0.15
    slept_instantly = random.random() < instant_prob

    # ── How felt when waking ──────────────────────────────────────────────────
    if quality >= 4 and hours_slept >= 7:
        pool = ["Refreshed", "Good", "Energized", "Fully rested"]
        k = random.randint(1, 2)
    elif quality >= 3 or hours_slept >= 6:
        pool = ["Good", "Neutral", "Refreshed"]
        k = random.randint(1, 2)
    else:
        pool = ["Exhausted", "Neutral", "Good"]
        k = random.randint(1, 2)
    feelings = random.sample(pool, min(k, len(pool)))

    # ── Factors affecting sleep ───────────────────────────────────────────────
    chosen_factors = []

    if is_stress and random.random() < 0.70:
        chosen_factors.append("Stress")
    if screens and random.random() < 0.40:
        chosen_factors.append("Light")
    if away and random.random() < 0.45:
        chosen_factors.append("Noise")
    if away and random.random() < 0.35:
        chosen_factors.append("Temperature")
    if woke_up and random.random() < 0.30:
        chosen_factors.append("Bad dreams")
    # exercise as a positive/neutral factor occasionally
    if random.random() < 0.25:
        chosen_factors.append("Exercise")
    if not chosen_factors:
        chosen_factors.append("None")

    # deduplicate
    chosen_factors = list(dict.fromkeys(chosen_factors))

    # ── Build the payload ──────────────────────────────────────────────────────
    return {
        "hours_slept":              hours_slept,
        "quality":                  quality,
        "time_i_went_to_bed":       hhmm(bedtime_hour, bedtime_min),
        "time_i_woke_up":           hhmm(wake_hour, wake_min),
        "how_i_felt_when_i_woke_up": feelings,
        "woke_up_during_the_night": woke_up,
        "slept_instantly":          slept_instantly,
        "used_screens_before_bed":  screens,
        "factors_affecting_my_sleep": chosen_factors,
        "environnement":            environment,
    }


# ── Phase lookup ───────────────────────────────────────────────────────────────

def get_phase(entry_date: date, start: date, end: date) -> str:
    """
    5 months split:
      Month 1-2  → baseline
      Month 3    → stress (dip in quality/hours)
      Month 4-5  → recovery (quality improves)
    """
    total_days  = (end - start).days or 1
    elapsed     = (entry_date - start).days
    frac        = elapsed / total_days

    if frac < 0.40:
        return "baseline"
    elif frac < 0.60:
        return "stress"
    else:
        return "recovery"


# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    app = create_app("development")

    with app.app_context():
        user = User.query.filter_by(email="iris1@gmail.com").first()
        if not user:
            print("ERROR: iris1@gmail.com not found.")
            sys.exit(1)
        print(f"User: {user.username} (id={user.id})")

        tracker = (
            Tracker.query
            .join(TrackerCategory, Tracker.category_id == TrackerCategory.id)
            .filter(
                Tracker.user_id == user.id,
                TrackerCategory.name.ilike("%sleep%"),
            )
            .first()
        )
        if not tracker:
            print("ERROR: Sleep Journal tracker not found.")
            sys.exit(1)

        cat = db.session.get(TrackerCategory, tracker.category_id)
        print(f"Tracker: id={tracker.id}, category='{cat.name}'")

        # Date range: 5 months back from today
        end_date   = date.today()
        start_date = end_date
        for _ in range(5):
            if start_date.month == 1:
                start_date = date(start_date.year - 1, 12, 1)
            else:
                start_date = date(start_date.year, start_date.month - 1, 1)

        print(f"Date range: {start_date} to {end_date}")

        dates = generate_dates(start_date, end_date)
        print(f"Will generate {len(dates)} entries…\n")

        created = skipped = 0

        for entry_date in dates:
            existing = TrackingData.query.filter_by(
                tracker_id=tracker.id,
                entry_date=entry_date,
            ).first()
            if existing:
                skipped += 1
                continue

            phase   = get_phase(entry_date, start_date, end_date)
            payload = generate_sleep_entry(entry_date, phase)

            entry = TrackingData(
                tracker_id=tracker.id,
                entry_date=entry_date,
                data={"sleep": payload},
            )
            db.session.add(entry)
            created += 1

        db.session.commit()

        # ── Summary ────────────────────────────────────────────────────────────
        print(f"Done. Created: {created}  |  Skipped (already existed): {skipped}")
        total = TrackingData.query.filter_by(tracker_id=tracker.id).count()
        print(f"Total entries in Sleep Journal: {total}")

        # ── Quick stats ────────────────────────────────────────────────────────
        entries = TrackingData.query.filter_by(tracker_id=tracker.id).all()
        qualities = [e.data.get("sleep", {}).get("quality") for e in entries if e.data.get("sleep", {}).get("quality") is not None]
        hours    = [e.data.get("sleep", {}).get("hours_slept") for e in entries if e.data.get("sleep", {}).get("hours_slept") is not None]
        screens  = [e.data.get("sleep", {}).get("used_screens_before_bed") for e in entries]
        if qualities:
            print(f"  Avg quality: {sum(qualities)/len(qualities):.2f}/5  "
                  f"Min: {min(qualities)}  Max: {max(qualities)}")
        if hours:
            print(f"  Avg hours:   {sum(hours)/len(hours):.1f}  "
                  f"Min: {min(hours)}  Max: {max(hours)}")
        screen_pct = sum(1 for s in screens if s) / max(len(screens), 1) * 100
        print(f"  Screens before bed: {screen_pct:.0f}% of nights")


if __name__ == "__main__":
    random.seed()   # non-deterministic each run
    main()
