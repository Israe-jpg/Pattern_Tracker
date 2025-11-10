"""
Constants and utility functions for tracker categories.
Extracted to avoid circular dependencies.
"""

# Pre-built categories configuration
PREBUILT_CATEGORIES = {
    'Workout Tracker': 'workout_tracker',
    'Symptom Tracker': 'symptom_tracker'
}

# Period Tracker is handled separately due to special functionality
PERIOD_TRACKER_NAME = 'Period Tracker'
PERIOD_TRACKER_KEY = 'period_tracker'


def is_prebuilt_category(category_name: str) -> bool:
    return (category_name in PREBUILT_CATEGORIES or 
            category_name == PERIOD_TRACKER_NAME)


def get_category_config_key(category_name: str) -> str:
   
    if category_name in PREBUILT_CATEGORIES:
        return PREBUILT_CATEGORIES[category_name]
    elif category_name == PERIOD_TRACKER_NAME:
        return PERIOD_TRACKER_KEY
    return None

