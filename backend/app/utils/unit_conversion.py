"""
Unit conversion utilities for health tracking.
All data is stored in metric (kg, cm) in the database.
Conversions are applied on input/output based on user preferences.
"""

def kg_to_lbs(kg: float) -> float:
   
    if kg is None:
        return None
    return round(kg * 2.20462, 2)


def lbs_to_kg(lbs: float) -> float:
    if lbs is None:
        return None
    return round(lbs / 2.20462, 2)


def cm_to_inches(cm: float) -> float:
    if cm is None:
        return None
    return round(cm / 2.54, 2)


def inches_to_cm(inches: float) -> float:
    if inches is None:
        return None
    return round(inches * 2.54, 2)


def convert_weight_to_metric(weight: float, unit_system: str) -> float:
    if weight is None:
        return None
    
    if unit_system == 'imperial':
        return lbs_to_kg(weight)
    return weight


def convert_height_to_metric(height: float, unit_system: str) -> float:
    if height is None:
        return None
    
    if unit_system == 'imperial':
        return inches_to_cm(height)
    return height


def convert_weight_from_metric(weight_kg: float, unit_system: str) -> float:
    if weight_kg is None:
        return None
    
    if unit_system == 'imperial':
        return kg_to_lbs(weight_kg)
    return weight_kg


def convert_height_from_metric(height_cm: float, unit_system: str) -> float:
    if height_cm is None:
        return None
    
    if unit_system == 'imperial':
        return cm_to_inches(height_cm)
    return height_cm


def get_weight_unit(unit_system: str) -> str:
    return 'lbs' if unit_system == 'imperial' else 'kg'


def get_height_unit(unit_system: str) -> str:
    return 'inches' if unit_system == 'imperial' else 'cm'

