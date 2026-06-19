"""
Seed script: Add 3 cycles of realistic Period Tracker data for defaultuser1@example.com.

Dynamically reads which fields/options are masked (is_hidden=True) for the user's
Period Tracker and only seeds visible data.

Patterns baked in so analytics can detect correlations:
  - Heavy flow (days 1-2) -> severe cramps -> high pain_level -> low mood/energy
  - Menstrual phase -> fatigue, back_pain, bloating, irritability
  - Follicular phase (post-period) -> mood/energy recovery, creamy discharge
  - Ovulation (~day 14) -> egg_white discharge, breast tenderness, increased libido
  - Luteal phase -> bloating, breast tenderness, acne, declining mood/energy
  - Pre-menstrual (last 5 days) -> mood_swings, irritable, anxious, worsening sleep
  - Stress level elevated during period and pre-menstrual phase
  - 3 cycles: baseline -> slightly-worse -> recovery (gives trend + correlation signal)

Run from backend/:
    .\\venv\\Scripts\\Activate.ps1; python scripts/seed_period_tracker.py
"""

import sys
import os
import random
from datetime import date, timedelta

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import create_app, db
from app.models.user import User
from app.models.tracker import Tracker
from app.models.tracker_category import TrackerCategory
from app.models.tracking_data import TrackingData
from app.models.period_cycle import PeriodCycle
from app.models.tracker_field import TrackerField
from app.models.field_option import FieldOption
from app.models.tracker_field_override import TrackerFieldOverride
from app.models.tracker_option_override import TrackerOptionOverride
from app.services.period_cycle_service import PeriodCycleService

TARGET_EMAIL = "defaultuser1@example.com"

AVERAGE_CYCLE_LENGTH = 28
AVERAGE_PERIOD_LENGTH = 5

# Each variant gives a different symptom severity profile across the 3 cycles
CYCLE_VARIANTS = ['normal', 'tough', 'recovery']


# ── Helpers ────────────────────────────────────────────────────────────────────

def weighted_choice(options, weights):
    return random.choices(options, weights=weights, k=1)[0]


def determine_phase(cycle_day, period_length, cycle_length):
    """Returns 'menstrual' | 'follicular' | 'ovulation' | 'luteal'."""
    ovulation_day = cycle_length - 14
    if cycle_day <= period_length:
        return 'menstrual'
    elif cycle_day <= ovulation_day - 1:
        return 'follicular'
    elif cycle_day <= ovulation_day + 1:
        return 'ovulation'
    else:
        return 'luteal'


def days_until_next_period(cycle_day, cycle_length):
    return max(0, cycle_length - cycle_day)


# ── Field/option visibility helpers ──────────────────────────────────────────

def get_hidden_field_ids(tracker_id):
    overrides = TrackerFieldOverride.query.filter_by(
        tracker_id=tracker_id, is_hidden=True
    ).all()
    return {o.tracker_field_id for o in overrides}


def get_hidden_option_ids(tracker_id):
    overrides = TrackerOptionOverride.query.filter_by(
        tracker_id=tracker_id, is_hidden=True
    ).all()
    return {o.field_option_id for o in overrides}


def build_visible_schema(category_id, tracker_id):
    """
    Returns dict:
      {field_name: {'field_id': int, 'context': str|None,
                    'field_group': str, 'options': {option_name: option_id}}}
    Only includes non-hidden fields and options.
    """
    hidden_fields = get_hidden_field_ids(tracker_id)
    hidden_options = get_hidden_option_ids(tracker_id)

    fields = TrackerField.query.filter_by(
        category_id=category_id, is_active=True
    ).all()

    schema = {}
    for field in fields:
        if field.id in hidden_fields:
            continue
        visible_options = {
            opt.option_name: opt.id
            for opt in field.options
            if opt.is_active and opt.id not in hidden_options
        }
        schema[field.field_name] = {
            'field_id': field.id,
            'context': field.context,
            'field_group': field.field_group,
            'options': visible_options,
        }
    return schema


def field_visible(schema, field_name, context=None):
    """True if field exists and its context matches (or is baseline)."""
    if field_name not in schema:
        return False
    field_ctx = schema[field_name]['context']
    if field_ctx is None:
        return True
    if context is None:
        return False
    return field_ctx == context


def opt_visible(schema, field_name, option_name):
    if field_name not in schema:
        return False
    return option_name in schema[field_name]['options']


# ── Baseline data generator ───────────────────────────────────────────────────

def gen_baseline(schema, phase, variant, cycle_day, cycle_length):
    """
    Baseline fields visible every day regardless of menstrual context:
    mood, energy, sleep, stress, physical, hydration, nutrition, social
    """
    days_to_next = days_until_next_period(cycle_day, cycle_length)
    is_pms = days_to_next <= 5
    is_period = phase == 'menstrual'
    is_ovulation = phase == 'ovulation'
    is_follicular = phase == 'follicular'

    sev = {'normal': 0, 'tough': -1, 'recovery': 1}[variant]

    # Mood
    if is_period:
        mood = max(1, min(10, weighted_choice([3, 4, 5, 6], [30, 35, 25, 10]) + sev + random.randint(-1, 1)))
    elif is_pms:
        mood = max(1, min(10, weighted_choice([3, 4, 5, 6], [25, 30, 30, 15]) + sev + random.randint(-1, 1)))
    elif is_ovulation:
        mood = max(1, min(10, weighted_choice([7, 8, 9], [25, 45, 30]) + random.randint(-1, 1)))
    elif is_follicular:
        mood = max(1, min(10, weighted_choice([6, 7, 8], [20, 50, 30]) + random.randint(-1, 1)))
    else:
        mood = max(1, min(10, weighted_choice([5, 6, 7], [25, 45, 30]) + (sev // 2) + random.randint(-1, 1)))

    # Energy
    if is_period:
        energy = max(1, min(10, weighted_choice([2, 3, 4, 5], [30, 35, 25, 10]) + sev + random.randint(-1, 1)))
    elif is_pms:
        energy = max(1, min(10, weighted_choice([3, 4, 5, 6], [25, 35, 25, 15]) + sev + random.randint(-1, 1)))
    elif is_ovulation:
        energy = max(1, min(10, weighted_choice([7, 8, 9], [20, 50, 30]) + random.randint(-1, 1)))
    elif is_follicular:
        energy = max(1, min(10, weighted_choice([6, 7, 8], [25, 45, 30]) + random.randint(-1, 1)))
    else:
        energy = max(1, min(10, weighted_choice([5, 6, 7], [20, 50, 30]) + (sev // 2) + random.randint(-1, 1)))

    consistency = (
        weighted_choice(['steady', 'fluctuating'], [70, 30]) if energy >= 7
        else weighted_choice(['steady', 'fluctuating', 'crashed'], [35, 45, 20]) if energy >= 5
        else weighted_choice(['fluctuating', 'crashed'], [40, 60])
    )

    # Sleep quality (correlated with phase)
    sq_base = (
        max(2, 4 + sev) if is_period
        else 4 if is_pms
        else 7 if (is_follicular or is_ovulation)
        else 6
    )
    sleep_q = max(1, min(10, sq_base + random.randint(-1, 1)))
    sleep_h = round(max(3.0, min(10.0, random.gauss(
        7.5 if sleep_q >= 7 else 6.8 if sleep_q >= 5 else 5.8,
        0.6 if sleep_q >= 7 else 0.7 if sleep_q >= 5 else 0.8
    ))), 1)

    # Stress
    if is_period:
        stress = max(1, min(10, weighted_choice([5, 6, 7, 8], [20, 35, 30, 15]) + (1 if variant == 'tough' else 0) + random.randint(-1, 1)))
    elif is_pms:
        stress = max(1, min(10, weighted_choice([5, 6, 7, 8], [15, 30, 35, 20]) + (1 if variant == 'tough' else 0) + random.randint(-1, 1)))
    elif is_ovulation:
        stress = max(1, min(10, weighted_choice([2, 3, 4, 5], [25, 35, 30, 10]) + random.randint(-1, 1)))
    elif is_follicular:
        stress = max(1, min(10, weighted_choice([3, 4, 5, 6], [25, 40, 25, 10]) + random.randint(-1, 1)))
    else:
        stress = max(1, min(10, weighted_choice([4, 5, 6, 7], [20, 35, 30, 15]) + random.randint(-1, 1)))

    stress_triggers = []
    if stress >= 6 and random.random() < 0.65:
        stress_triggers = random.sample(['work', 'relationships', 'health', 'finances', 'family'],
                                        1 if stress < 8 else random.randint(1, 2))

    # Physical
    if is_period:
        overall_health = max(1, min(10, weighted_choice([3, 4, 5], [30, 45, 25]) + sev))
        activity = weighted_choice(['sedentary', 'light', 'moderate'], [40, 45, 15])
    elif is_pms:
        overall_health = max(1, min(10, weighted_choice([4, 5, 6], [25, 45, 30]) + sev))
        activity = weighted_choice(['sedentary', 'light', 'moderate'], [25, 40, 35])
    elif is_ovulation:
        overall_health = max(1, min(10, weighted_choice([7, 8, 9], [25, 50, 25])))
        activity = weighted_choice(['light', 'moderate', 'active', 'very_active'], [15, 35, 35, 15])
    else:
        overall_health = max(1, min(10, weighted_choice([6, 7, 8], [20, 50, 30]) + (sev // 2)))
        activity = weighted_choice(['light', 'moderate', 'active'], [25, 45, 30])

    water = random.randint(5, 9) if is_period else random.randint(4, 10)

    if is_pms or is_period:
        regularity = weighted_choice(['irregular', 'regular', 'very_regular'], [35, 45, 20])
        appetite = max(1, min(10, weighted_choice([6, 7, 8, 9], [10, 25, 35, 30])))
    elif is_ovulation:
        regularity = weighted_choice(['regular', 'very_regular'], [40, 60])
        appetite = max(1, min(10, weighted_choice([5, 6, 7], [25, 45, 30])))
    else:
        regularity = weighted_choice(['regular', 'very_regular', 'irregular'], [50, 30, 20])
        appetite = max(1, min(10, weighted_choice([5, 6, 7], [30, 45, 25])))

    if is_period:
        social = max(1, min(10, weighted_choice([2, 3, 4, 5], [20, 35, 30, 15]) + sev))
    elif is_ovulation:
        social = max(1, min(10, weighted_choice([7, 8, 9], [25, 45, 30])))
    elif is_pms:
        social = max(1, min(10, weighted_choice([3, 4, 5, 6], [20, 35, 30, 15])))
    else:
        social = max(1, min(10, weighted_choice([5, 6, 7, 8], [15, 30, 35, 20])))

    # Assemble only visible fields
    data = {}

    if field_visible(schema, 'mood'):
        entry = {}
        if opt_visible(schema, 'mood', 'overall'):
            entry['overall'] = mood
        if entry:
            data['mood'] = entry

    if field_visible(schema, 'energy'):
        entry = {}
        if opt_visible(schema, 'energy', 'level'):
            entry['level'] = energy
        if opt_visible(schema, 'energy', 'consistency'):
            entry['consistency'] = consistency
        if entry:
            data['energy'] = entry

    if field_visible(schema, 'sleep'):
        entry = {}
        if opt_visible(schema, 'sleep', 'quality'):
            entry['quality'] = sleep_q
        if opt_visible(schema, 'sleep', 'hours'):
            entry['hours'] = sleep_h
        if entry:
            data['sleep'] = entry

    if field_visible(schema, 'stress'):
        entry = {}
        if opt_visible(schema, 'stress', 'level'):
            entry['level'] = stress
        if opt_visible(schema, 'stress', 'triggers') and stress_triggers:
            entry['triggers'] = stress_triggers
        if entry:
            data['stress'] = entry

    if field_visible(schema, 'physical'):
        entry = {}
        if opt_visible(schema, 'physical', 'overall_health'):
            entry['overall_health'] = overall_health
        if opt_visible(schema, 'physical', 'activity_level'):
            entry['activity_level'] = activity
        if entry:
            data['physical'] = entry

    if field_visible(schema, 'hydration'):
        entry = {}
        if opt_visible(schema, 'hydration', 'water_glasses'):
            entry['water_glasses'] = water
        if entry:
            data['hydration'] = entry

    if field_visible(schema, 'nutrition'):
        entry = {}
        if opt_visible(schema, 'nutrition', 'meal_regularity'):
            entry['meal_regularity'] = regularity
        if opt_visible(schema, 'nutrition', 'appetite'):
            entry['appetite'] = appetite
        if entry:
            data['nutrition'] = entry

    if field_visible(schema, 'social'):
        entry = {}
        if opt_visible(schema, 'social', 'interaction_level'):
            entry['interaction_level'] = social
        if entry:
            data['social'] = entry

    return data


# ── Menstruating data generator ───────────────────────────────────────────────

def gen_menstrual_data(schema, cycle_day, variant):
    """Fields for 'menstruating' context: flow, symptoms, products."""
    pd = cycle_day  # period day alias

    # Flow level: heavy early, light late
    if pd == 1:
        flow_level = weighted_choice(['light', 'medium', 'heavy'], [20, 35, 45])
    elif pd == 2:
        flow_level = (
            weighted_choice(['heavy', 'very_heavy'], [40, 60]) if variant == 'tough'
            else weighted_choice(['medium', 'heavy', 'very_heavy'], [25, 45, 30])
        )
    elif pd == 3:
        flow_level = weighted_choice(['light', 'medium', 'heavy'], [25, 55, 20])
    elif pd == 4:
        flow_level = weighted_choice(['spotting', 'light', 'medium'], [25, 55, 20])
    else:
        flow_level = weighted_choice(['spotting', 'light'], [55, 45])

    # Flow color
    if pd <= 2:
        flow_color = weighted_choice(['bright_red', 'dark_red'], [60, 40])
    elif pd <= 4:
        flow_color = weighted_choice(['bright_red', 'dark_red', 'brown'], [35, 40, 25])
    else:
        flow_color = weighted_choice(['brown', 'dark_red', 'pink'], [50, 25, 25])

    # Physical symptoms (correlated with flow)
    physical = []
    cramp_p = {1: 0.90, 2: 0.85, 3: 0.65, 4: 0.35, 5: 0.20}.get(pd, 0.15)
    if variant == 'tough':
        cramp_p = min(1.0, cramp_p + 0.10)
    if random.random() < cramp_p:
        physical.append('cramps')
    if random.random() < (0.80 if pd <= 3 else 0.50):
        physical.append('bloating')
    fat_p = 0.85 if pd <= 2 else 0.65
    if variant == 'tough':
        fat_p = min(1.0, fat_p + 0.10)
    if random.random() < fat_p:
        physical.append('fatigue')
    if random.random() < (0.60 if pd <= 3 else 0.30):
        physical.append('back_pain')
    if random.random() < (0.35 if pd <= 2 else 0.20):
        physical.append('headache')
    if random.random() < (0.30 if (variant == 'tough' and pd <= 2) else 0.15):
        physical.append('nausea')
    if random.random() < (0.25 if pd <= 2 else 0.10):
        physical.append('breast_tenderness')

    # Emotional symptoms
    emotional = []
    if random.random() < (0.75 if pd <= 2 else 0.50):
        emotional.append('irritable')
    if random.random() < (0.55 if pd <= 3 else 0.30):
        emotional.append('mood_swings')
    if random.random() < (0.35 if variant == 'tough' else 0.20):
        emotional.append('sad')
    if random.random() < (0.30 if pd <= 2 else 0.15):
        emotional.append('anxious')
    if random.random() < (0.25 if variant == 'tough' else 0.10):
        emotional.append('crying')

    # Pain level correlated with flow heaviness + cramps
    pain_map = {'very_heavy': (7, 9), 'heavy': (5, 8), 'medium': (3, 6),
                'light': (1, 4), 'spotting': (0, 2)}
    lo, hi = pain_map.get(flow_level, (0, 3))
    pain_level = random.randint(lo, hi)
    if 'cramps' not in physical:
        pain_level = max(0, pain_level - 2)
    if variant == 'tough':
        pain_level = min(10, pain_level + 1)

    # Products
    products_used = weighted_choice(
        [['pads'], ['tampons'], ['menstrual_cup'], ['period_underwear'], ['pads', 'period_underwear']],
        [35, 25, 20, 10, 10]
    )
    changes_map = {'very_heavy': (4, 7), 'heavy': (4, 6), 'medium': (3, 5), 'light': (2, 4), 'spotting': (1, 2)}
    clo, chi = changes_map.get(flow_level, (1, 3))
    changes = random.randint(clo, chi)

    # Assemble
    ctx = 'menstruating'
    data = {}

    if field_visible(schema, 'flow', ctx):
        entry = {}
        if opt_visible(schema, 'flow', 'level'):
            entry['level'] = flow_level
        if opt_visible(schema, 'flow', 'color'):
            entry['color'] = flow_color
        if entry:
            data['flow'] = entry

    if field_visible(schema, 'symptoms', ctx):
        entry = {}
        if opt_visible(schema, 'symptoms', 'physical') and physical:
            entry['physical'] = physical
        if opt_visible(schema, 'symptoms', 'emotional') and emotional:
            entry['emotional'] = emotional
        if opt_visible(schema, 'symptoms', 'pain_level'):
            entry['pain_level'] = pain_level
        if entry:
            data['symptoms'] = entry

    if field_visible(schema, 'products', ctx):
        entry = {}
        if opt_visible(schema, 'products', 'type_used'):
            entry['type_used'] = products_used
        if opt_visible(schema, 'products', 'changes_count'):
            entry['changes_count'] = changes
        if entry:
            data['products'] = entry

    return data


# ── Non-menstruating data generator ──────────────────────────────────────────

def gen_non_menstrual_data(schema, phase, cycle_day, cycle_length, variant):
    """Fields for 'not_menstruating' context: discharge, symptoms, fertility_tracking, contraception."""
    days_to_next = days_until_next_period(cycle_day, cycle_length)
    is_pms = days_to_next <= 5
    is_ovulation = phase == 'ovulation'
    is_follicular = phase == 'follicular'
    ctx = 'not_menstruating'

    # Discharge (tracks cervical fluid changes through cycle)
    if is_follicular:
        if cycle_day <= 8:
            d_consistency = weighted_choice(['dry', 'sticky', 'creamy'], [20, 50, 30])
            d_amount = weighted_choice(['none', 'light'], [30, 70])
        else:
            d_consistency = weighted_choice(['sticky', 'creamy', 'egg_white'], [20, 55, 25])
            d_amount = weighted_choice(['light', 'moderate'], [55, 45])
    elif is_ovulation:
        d_consistency = weighted_choice(['egg_white', 'watery'], [65, 35])
        d_amount = weighted_choice(['moderate', 'heavy'], [50, 50])
    elif is_pms:
        d_consistency = weighted_choice(['dry', 'sticky', 'creamy'], [35, 45, 20])
        d_amount = weighted_choice(['none', 'light'], [45, 55])
    else:  # luteal non-PMS
        d_consistency = weighted_choice(['creamy', 'sticky', 'dry'], [50, 30, 20])
        d_amount = weighted_choice(['light', 'moderate'], [60, 40])

    # Physical symptoms (not_menstruating set)
    physical = []
    if is_ovulation:
        if random.random() < 0.55:
            physical.append('breast_tenderness')
        if random.random() < 0.20:
            physical.append('bloating')
    elif is_pms:
        if random.random() < 0.75:
            physical.append('bloating')
        if random.random() < 0.65:
            physical.append('breast_tenderness')
        if random.random() < 0.55:
            physical.append('fatigue')
        if random.random() < 0.45:
            physical.append('headache')
        if random.random() < 0.40:
            physical.append('acne')
        if random.random() < 0.50:
            physical.append('increased_appetite')
        if variant == 'tough':
            for s in ['bloating', 'breast_tenderness']:
                if s not in physical and random.random() < 0.25:
                    physical.append(s)
    elif phase == 'luteal':
        if random.random() < 0.35:
            physical.append('bloating')
        if random.random() < 0.30:
            physical.append('breast_tenderness')
        if random.random() < 0.25:
            physical.append('fatigue')
        if random.random() < 0.20:
            physical.append('acne')
    else:  # follicular
        if random.random() < 0.15:
            physical.append('fatigue')

    # Emotional symptoms (not_menstruating set)
    emotional = []
    if is_ovulation:
        if random.random() < 0.70:
            emotional.append('increased_libido')
    elif is_pms:
        if random.random() < 0.80:
            emotional.append('mood_swings')
        if random.random() < 0.75:
            emotional.append('irritable')
        if random.random() < 0.50:
            emotional.append('anxious')
        if random.random() < 0.20:
            emotional.append('decreased_libido')
        if variant == 'tough':
            for s in ['mood_swings', 'irritable']:
                if s not in emotional:
                    emotional.append(s)
    elif phase == 'luteal':
        if random.random() < 0.35:
            emotional.append('mood_swings')
        if random.random() < 0.30:
            emotional.append('irritable')
    else:  # follicular
        if random.random() < 0.20:
            emotional.append('increased_libido')

    # Fertility tracking
    ovulation_test = None
    sexual_activity = None
    if is_ovulation:
        ovulation_test = weighted_choice(['positive', 'peak', 'negative'], [40, 45, 15])
        sexual_activity = random.random() < 0.55
    elif is_follicular and cycle_day >= 10:
        ovulation_test = weighted_choice(['negative', 'positive'], [70, 30])
        sexual_activity = random.random() < 0.35
    elif phase == 'luteal' and not is_pms:
        sexual_activity = random.random() < 0.30

    # Assemble
    data = {}

    if field_visible(schema, 'discharge', ctx):
        entry = {}
        if opt_visible(schema, 'discharge', 'amount'):
            entry['amount'] = d_amount
        if opt_visible(schema, 'discharge', 'consistency'):
            entry['consistency'] = d_consistency
        if entry:
            data['discharge'] = entry

    if field_visible(schema, 'symptoms', ctx):
        entry = {}
        if opt_visible(schema, 'symptoms', 'physical') and physical:
            entry['physical'] = physical
        if opt_visible(schema, 'symptoms', 'emotional') and emotional:
            entry['emotional'] = emotional
        if entry:
            data['symptoms'] = entry

    if field_visible(schema, 'fertility_tracking', ctx):
        entry = {}
        if opt_visible(schema, 'fertility_tracking', 'ovulation_test') and ovulation_test:
            entry['ovulation_test'] = ovulation_test
        if opt_visible(schema, 'fertility_tracking', 'sexual_activity') and sexual_activity is not None:
            entry['sexual_activity'] = sexual_activity
        if entry:
            data['fertility_tracking'] = entry

    return data


# ── Cycle helpers ─────────────────────────────────────────────────────────────

def create_cycle(tracker_id, cycle_start, avg_cycle, avg_period):
    existing = PeriodCycle.query.filter_by(
        tracker_id=tracker_id,
        cycle_start_date=cycle_start
    ).first()
    if existing:
        return existing

    actual_period_len = max(3, min(7, avg_period + random.randint(-1, 1)))
    period_end = cycle_start + timedelta(days=actual_period_len - 1)
    predictions = PeriodCycleService.calculate_cycle_predictions(cycle_start, avg_cycle)

    cycle = PeriodCycle(
        tracker_id=tracker_id,
        cycle_start_date=cycle_start,
        period_start_date=cycle_start,
        period_end_date=period_end,
        period_length=actual_period_len,
        predicted_ovulation_date=predictions['predicted_ovulation'],
        predicted_next_period_date=predictions['predicted_next_period'],
    )
    db.session.add(cycle)
    return cycle


def recalc_cycle_boundaries(tracker_id):
    """Recalculate cycle_end_date / cycle_length for all cycles in order."""
    cycles = (
        PeriodCycle.query.filter_by(tracker_id=tracker_id)
        .order_by(PeriodCycle.cycle_start_date.asc())
        .all()
    )
    for i, c in enumerate(cycles):
        if i < len(cycles) - 1:
            c.cycle_end_date = cycles[i + 1].cycle_start_date - timedelta(days=1)
            c.cycle_length = (c.cycle_end_date - c.cycle_start_date).days + 1
        else:
            c.cycle_end_date = None
            c.cycle_length = None


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    app = create_app("development")

    with app.app_context():
        # 1. User
        user = User.query.filter_by(email=TARGET_EMAIL).first()
        if not user:
            print("ERROR: %s not found." % TARGET_EMAIL)
            sys.exit(1)
        print("User: %s (id=%d)" % (user.username, user.id))

        # 2. Period Tracker
        tracker = (
            Tracker.query
            .join(TrackerCategory, Tracker.category_id == TrackerCategory.id)
            .filter(Tracker.user_id == user.id, TrackerCategory.name == 'Period Tracker')
            .first()
        )
        if not tracker:
            print("ERROR: Period Tracker not found for this user.")
            sys.exit(1)

        cat = db.session.get(TrackerCategory, tracker.category_id)
        print("Tracker: id=%d, category='%s'" % (tracker.id, cat.name))

        # 3. Tracker settings
        settings = tracker.settings or {}
        avg_cycle = settings.get('average_cycle_length', AVERAGE_CYCLE_LENGTH)
        avg_period = settings.get('average_period_length', AVERAGE_PERIOD_LENGTH)
        print("Settings: cycle_length=%d, period_length=%d" % (avg_cycle, avg_period))

        # 4. Visible schema
        schema = build_visible_schema(cat.id, tracker.id)
        print("\nVisible fields (%d):" % len(schema))
        for fname in sorted(schema.keys()):
            ctx = schema[fname]['context'] or 'baseline'
            opts = ', '.join(schema[fname]['options'].keys()) or '(no options)'
            print("  [%s] %s: %s" % (ctx, fname, opts))

        # 5. Pick target cycles: 3 most recent completed cycles
        completed = (
            PeriodCycle.query
            .filter_by(tracker_id=tracker.id)
            .filter(PeriodCycle.cycle_end_date.isnot(None))
            .order_by(PeriodCycle.cycle_start_date.desc())
            .limit(3)
            .all()
        )

        # If we need more, create them going back in time
        if len(completed) < 3:
            needed = 3 - len(completed)
            anchor = (
                min(c.cycle_start_date for c in completed)
                if completed else date.today()
            )
            print("\nCreating %d additional cycle(s)..." % needed)
            for _ in range(needed):
                anchor = anchor - timedelta(days=avg_cycle + random.randint(-2, 2))
                create_cycle(tracker.id, anchor, avg_cycle, avg_period)
            db.session.flush()
            recalc_cycle_boundaries(tracker.id)
            db.session.flush()

            completed = (
                PeriodCycle.query
                .filter_by(tracker_id=tracker.id)
                .filter(PeriodCycle.cycle_end_date.isnot(None))
                .order_by(PeriodCycle.cycle_start_date.desc())
                .limit(3)
                .all()
            )

        target = sorted(completed, key=lambda c: c.cycle_start_date)  # oldest first
        cycle_pairs = [(target[i], CYCLE_VARIANTS[i % 3]) for i in range(len(target))]

        print("\nTarget cycles (oldest to newest):")
        for cyc, var in cycle_pairs:
            print("  id=%d  %s to %s  period_len=%s  variant=%s" % (
                cyc.id,
                cyc.cycle_start_date.isoformat(),
                cyc.cycle_end_date.isoformat() if cyc.cycle_end_date else "open",
                cyc.period_length,
                var,
            ))

        # 6. Generate daily tracking data
        print("\nGenerating daily entries...")
        created = skipped = 0

        for cyc, variant in cycle_pairs:
            cycle_end = cyc.cycle_end_date  # always set for completed cycles
            period_end = cyc.period_end_date or (
                cyc.period_start_date + timedelta(days=avg_period - 1)
            )
            period_len = (period_end - cyc.period_start_date).days + 1

            cur = cyc.cycle_start_date
            while cur <= cycle_end:
                cday = (cur - cyc.cycle_start_date).days + 1
                menstruating = cur <= period_end
                phase = determine_phase(cday, period_len, avg_cycle)

                if TrackingData.query.filter_by(tracker_id=tracker.id, entry_date=cur).first():
                    skipped += 1
                    cur += timedelta(days=1)
                    continue

                day_data = gen_baseline(schema, phase, variant, cday, avg_cycle)

                if menstruating:
                    day_data.update(gen_menstrual_data(schema, cday, variant))
                else:
                    day_data.update(gen_non_menstrual_data(schema, phase, cday, avg_cycle, variant))

                if day_data:
                    db.session.add(TrackingData(
                        tracker_id=tracker.id,
                        entry_date=cur,
                        data=day_data,
                    ))
                    created += 1

                cur += timedelta(days=1)

        db.session.commit()

        # 7. Summary
        print("\nDone!")
        print("  Entries created:  %d" % created)
        print("  Entries skipped:  %d" % skipped)
        total = TrackingData.query.filter_by(tracker_id=tracker.id).count()
        print("  Total Period Tracker entries: %d" % total)

        all_entries = TrackingData.query.filter_by(tracker_id=tracker.id).all()
        pain_vals = [
            e.data['symptoms']['pain_level']
            for e in all_entries
            if isinstance(e.data.get('symptoms'), dict)
            and e.data['symptoms'].get('pain_level') is not None
        ]
        mood_vals = [
            e.data['mood']['overall']
            for e in all_entries
            if isinstance(e.data.get('mood'), dict)
            and e.data['mood'].get('overall') is not None
        ]

        print("\nStats:")
        if pain_vals:
            print("  Pain (menstrual days): avg=%.1f  min=%d  max=%d  n=%d" % (
                sum(pain_vals) / len(pain_vals), min(pain_vals), max(pain_vals), len(pain_vals)))
        if mood_vals:
            print("  Mood (all days):       avg=%.1f  min=%d  max=%d  n=%d" % (
                sum(mood_vals) / len(mood_vals), min(mood_vals), max(mood_vals), len(mood_vals)))

        print("\nCycles seeded:")
        for cyc, var in cycle_pairs:
            end = cyc.cycle_end_date.isoformat() if cyc.cycle_end_date else "open"
            print("  %s to %s  period=%sd  variant=%s" % (
                cyc.period_start_date.isoformat(), end, cyc.period_length, var))


if __name__ == "__main__":
    random.seed()
    main()
