"""
Menstruation cycle calculations and predictions.
"""

from datetime import datetime, timedelta, date
from typing import Optional, Dict


def calculate_cycle_day(last_period_start_date: datetime) -> int:
    
    if not last_period_start_date:
        return None
    
    today = datetime.now().date()
    
    # Handle both string and datetime inputs
    if isinstance(last_period_start_date, str):
        last_period_start_date = datetime.fromisoformat(last_period_start_date).date()
    elif isinstance(last_period_start_date, datetime):
        last_period_start_date = last_period_start_date.date()
    
    cycle_day = (today - last_period_start_date).days + 1  
    return max(1, cycle_day)


def determine_cycle_phase(cycle_day: int, average_period_length: int = 5, 
                         average_cycle_length: int = 28) -> str:
    
    if not cycle_day:
        return 'unknown'
    
    # If cycle day exceeds average cycle length, likely in a new cycle
    if cycle_day > average_cycle_length + 7:  # Grace period
        return 'late_period'
    
    # Phase 1: Menstruation (bleeding days)
    if cycle_day <= average_period_length:
        return 'menstruation'
    
    # Calculate ovulation day (14 days before expected next period)
    ovulation_day = average_cycle_length - 14
    
    # Phase 2: Follicular (after period ends, before ovulation)
    if cycle_day < ovulation_day - 2:
        return 'follicular'
    
    # Phase 3: Ovulation window (±2 days around ovulation)
    if ovulation_day - 2 <= cycle_day <= ovulation_day + 2:
        return 'ovulation'
    
    # Phase 4: Luteal (after ovulation, before next period)
    return 'luteal'


def predict_ovulation_date(last_period_start_date: datetime, 
                          average_cycle_length: int) -> Optional[datetime]:
    
    if not last_period_start_date or not average_cycle_length:
        return None
    
    if isinstance(last_period_start_date, str):
        last_period_start_date = datetime.fromisoformat(last_period_start_date)
    elif isinstance(last_period_start_date, date) and not isinstance(last_period_start_date, datetime):
        # Convert date to datetime
        last_period_start_date = datetime.combine(last_period_start_date, datetime.min.time())
    
    # Ovulation = 14 days before next period
    ovulation_date = last_period_start_date + timedelta(days=(average_cycle_length - 14))
    return ovulation_date


def predict_next_period_date(last_period_start_date: datetime, 
                            average_cycle_length: int) -> Optional[datetime]:
    
    if not last_period_start_date or not average_cycle_length:
        return None
    
    if isinstance(last_period_start_date, str):
        last_period_start_date = datetime.fromisoformat(last_period_start_date)
    elif isinstance(last_period_start_date, date) and not isinstance(last_period_start_date, datetime):
        # Convert date to datetime
        last_period_start_date = datetime.combine(last_period_start_date, datetime.min.time())
    
    next_period_date = last_period_start_date + timedelta(days=average_cycle_length)
    return next_period_date


def predict_period_end_date(period_start_date: datetime, 
                           average_period_length: int) -> Optional[datetime]:
    """
    Predict when the current period will end based on average period length.
    
    Args:
        period_start_date: The start date of the period
        average_period_length: Average number of days the period typically lasts
    
    Returns:
        Predicted end date of the period, or None if inputs are invalid
    """
    if not period_start_date or not average_period_length:
        return None
    
    if isinstance(period_start_date, str):
        period_start_date = datetime.fromisoformat(period_start_date)
    elif isinstance(period_start_date, date) and not isinstance(period_start_date, datetime):
        # Convert date to datetime
        period_start_date = datetime.combine(period_start_date, datetime.min.time())
    
    # Period end = start date + (average_period_length - 1) days
    # (e.g., if period starts on day 1 and lasts 5 days, it ends on day 5)
    period_end_date = period_start_date + timedelta(days=average_period_length - 1)
    return period_end_date


def get_fertility_window(last_period_start_date: datetime, 
                        average_cycle_length: int) -> Optional[Dict]:
    
    ovulation_date = predict_ovulation_date(last_period_start_date, average_cycle_length)
    
    if not ovulation_date:
        return None
    
    # Fertility window: 5 days before ovulation + ovulation day
    fertility_start = ovulation_date - timedelta(days=5)
    fertility_end = ovulation_date + timedelta(days=1)
    
    return {
        'start': fertility_start,
        'end': fertility_end,
        'ovulation_date': ovulation_date,
        'high_fertility_days': 6  # 5 days before + ovulation day
    }


def is_period_expected_soon(cycle_day: int, average_cycle_length: int, 
                           days_threshold: int = 3) -> bool:
    
    if not cycle_day or not average_cycle_length:
        return False
    
    days_until_period = average_cycle_length - cycle_day
    return 0 <= days_until_period <= days_threshold


def is_period_late(cycle_day: int, average_cycle_length: int, 
                  grace_days: int = 3) -> bool:
    
    if not cycle_day or not average_cycle_length:
        return False
    
    days_overdue = cycle_day - average_cycle_length
    return days_overdue > grace_days