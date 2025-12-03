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
from app.services.period_cycle_service import PeriodCycleService

class ComparisonService:

    #cycle to cycle comparisons general insights and differences globally
    @staticmethod
    def compare_cycle_with_previous(tracker_id: int, cycle_id: int) -> Dict[str, Any]:
        try:
            current_cycle = PeriodCycle.query.filter_by(tracker_id=tracker_id, id=cycle_id).first()
            finished_cycle = PeriodCycle.query.filter_by(tracker_id=tracker_id, id=cycle_id - 1).first()
            previous_cycle = PeriodCycle.query.filter_by(tracker_id=tracker_id, id=cycle_id - 2).first()
            if not current_cycle or not previous_cycle or not finished_cycle:
                raise ValueError("Cycle not found")

            #cycle metrics
            cycle_metrics = {}
            
            #compare lenght of the cycles
            finished_cycle_length = (finished_cycle.cycle_end_date - finished_cycle.cycle_start_date).days
            previous_cycle_length = (previous_cycle.cycle_end_date - previous_cycle.cycle_start_date).days
            length_difference = finished_cycle_length - previous_cycle_length
            length_difference_percentage = (length_difference / previous_cycle_length) * 100
            cycle_length_insight = f"Cycle length is {length_difference} days {'longer' if length_difference > 0 else 'shorter'} than previous cycle"
            cycle_metrics['cycle_length_insight'] = cycle_length_insight

            #compare length of the periods
            finished_period_length = (finished_cycle.period_end_date - finished_cycle.period_start_date).days
            previous_period_length = (previous_cycle.period_end_date - previous_cycle.period_start_date).days
            period_difference = finished_period_length - previous_period_length
            period_difference_percentage = (period_difference / previous_period_length) * 100
            period_length_insight = f"Period length is {period_difference} days {'longer' if period_difference > 0 elif period_difference ==0 'same' else 'shorter'} than previous cycle"
            cycle_metrics['period_length_insight'] = period_length_insight
            
            #compare how soon ovulation was
            finished_cycle_ovulation_time = finished_cycle.cycle_length - 14
            previous_cycle_ovulation_time = previous_cycle.cycle_length - 14
            ovulation_difference = finished_cycle_ovulation_time - previous_cycle_ovulation_time
            ovulation_difference_percentage = (ovulation_difference / previous_cycle_ovulation_time) * 100
            ovulation_insight = f"Ovulation was {ovulation_difference} days {'earlier' if ovulation_difference < 0 else 'later'} than previous cycle"
            cycle_metrics['ovulation_insight'] = ovulation_insight
         
            return cycle_metrics
        except Exception as e:
            raise ValueError(f"Failed to compare cycle with previous: {str(e)}")

    #compare field developement of this cycle with previous cycle
    @staticmethod
    def compare_field_between_cycles(tracker_id: int, field_name: str, option: str) -> Dict[str, Any]:
        pass
    
    
    #cycle to average cycle comparisons
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
    
    