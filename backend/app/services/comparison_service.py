"""
This service is used to compare current cycle with previous cycle
or compare current cycle with average cycle.
Its also used to compare current year, month or week with previous year, month or week
It will return the difference in days, weeks, months, etc.
"""

from typing import Dict, Any
from app.models.tracker import Tracker
from app.models.period_cycle import PeriodCycle
from app.models.tracking_data import TrackingData
from app.models.analytics_data import AnalyticsData
from app.models.tracker_category import TrackerCategory
from app.models.tracker_settings import TrackerSettings
from app.models.tracker_settings_category import TrackerSettingsCategory
from app.models.tracker_settings_category_option import TrackerSettingsCategoryOption
from app.models.tracker_settings_category_option_value import TrackerSettingsCategoryOptionValue
from app.services.analytics_base import AnalyticsDataExtractor, AnalyticsGrouper, AnalyticsStatsCalculator, NumericExtractor, FieldTypeDetector

class ComparisonService:

    #cycle to cycle comparisons
    @staticmethod
    def compare_cycles(tracker_id: int, cycle_id: int) -> Dict[str, Any]:
        pass

    @staticmethod
    def compare_cycles_with_average(tracker_id: int, cycle_id: int) -> Dict[str, Any]:
        pass

    #year, month, week to year, month, week comparisons
    @staticmethod
    def compare_year_to_year(tracker_id: int, year: int) -> Dict[str, Any]:
        pass
    
    @staticmethod
    def compare_month_to_month(tracker_id: int, month: int) -> Dict[str, Any]:
        pass

    def compare_month_to_average(tracker_id: int, month: int) -> Dict[str, Any]:
        pass

    @staticmethod
    def compare_week_to_week(tracker_id: int, week: int) -> Dict[str, Any]:
        pass

    def compare_week_to_average(tracker_id: int, week: int) -> Dict[str, Any]:
        pass

    #generate insights for the comparisons
    @staticmethod
    def generate_comparison_insights(comparisons: Dict[str, Any]) -> Dict[str, Any]:
        pass
    
    