# app/services/period_analytics_service.py
"""
Specialized analytics for Period Tracker.
"""

from typing import Dict, List, Any, Optional, Tuple
from datetime import date, timedelta, datetime
from collections import defaultdict
import calendar
import numpy as np
import matplotlib.pyplot as plt
import matplotlib.dates as mdates

from app.services.analytics_service import (
    NumericExtractor,  
    CategoricalAnalyzer,
    FieldTypeDetector,
    ChartGenerator
)
from app.models.tracker import Tracker
from app.models.tracker_category import TrackerCategory
from app.utils.menstruation_calculations import (
    calculate_cycle_day,
    determine_cycle_phase,
    predict_ovulation_date,
    predict_next_period_date,
    get_fertility_window,
    is_period_expected_soon,
    is_period_late
)
from app.services.period_cycle_service import PeriodCycleService

class PeriodAnalyticsService:
    """ 
    Provides:
    - Cycle regularity analysis
    - Symptom-phase correlations
    - Prediction accuracy tracking
    - Cycle comparison visualizations
    """
    
    @staticmethod
    def analyze_cycle_regularity(tracker_id: int, months: int = 6) -> Dict[str, Any]:
        """
        Returns:
        - Average cycle length
        - Standard deviation (regularity measure)
        - Longest/shortest cycles
        - Regularity score (0-100)
        - Trend (getting more/less regular)
        """
        # Get period start dates from tracking data
        period_starts = PeriodAnalyticsService._get_period_start_dates(
            tracker_id, months
        )
        
        if len(period_starts) < 2:
            return {
                'message': 'Need at least 2 cycles to analyze regularity',
                'cycles_found': len(period_starts)
            }
        
        # Calculate cycle lengths
        cycle_lengths = []
        for i in range(len(period_starts) - 1):
            cycle_length = (period_starts[i+1] - period_starts[i]).days
            cycle_lengths.append(cycle_length)
        
        # Statistical analysis
        avg_length = np.mean(cycle_lengths)
        std_dev = np.std(cycle_lengths)
        
        # Regularity score (0-100)
        # Perfect regularity (std_dev=0) = 100
        # High variance (std_dev>7) = low score
        regularity_score = max(0, 100 - (std_dev * 10))
        
        # Classify regularity
        if std_dev <= 2:
            regularity_level = "Very Regular"
        elif std_dev <= 4:
            regularity_level = "Regular"
        elif std_dev <= 7:
            regularity_level = "Somewhat Irregular"
        else:
            regularity_level = "Irregular"
        
        return {
            'cycles_analyzed': len(cycle_lengths),
            'average_length': round(avg_length, 1),
            'std_deviation': round(std_dev, 2),
            'shortest_cycle': min(cycle_lengths),
            'longest_cycle': max(cycle_lengths),
            'regularity_score': round(regularity_score, 1),
            'regularity_level': regularity_level,
            'cycle_lengths': cycle_lengths,
            'period_start_dates': [d.isoformat() for d in period_starts],
            'medical_note': PeriodAnalyticsService._generate_medical_note(
                avg_length, std_dev
            )
        }
    
    @staticmethod
    def analyze_symptoms_by_phase(
        tracker_id: int,
        symptom_field: str,
        months: int = 3
    ) -> Dict[str, Any]:
        """
        Returns frequency/severity by phase.
        """
        # Get tracking entries with cycle phase info
        entries_with_phases = PeriodAnalyticsService._get_entries_with_phases(
            tracker_id, symptom_field, months
        )
        
        if not entries_with_phases:
            return {
                'message': 'No symptom data found',
                'field': symptom_field
            }
        
        # Group by phase
        phase_data = defaultdict(list)
        for entry in entries_with_phases:
            phase = entry['cycle_phase']
            symptom_value = entry['symptom_value']
            phase_data[phase].append(symptom_value)
        
        # Analyze by phase
        phase_analysis = {}
        for phase in ['menstruation', 'follicular', 'ovulation', 'luteal']:
            if phase in phase_data:
                # Use appropriate analyzer based on field type
                field_type, _ = FieldTypeDetector.detect_field_type(
                    symptom_field, tracker_id
                )
                
                if field_type == 'numeric':
                    phase_analysis[phase] = {
                        'count': len(phase_data[phase]),
                        'mean': round(np.mean(phase_data[phase]), 2),
                        'min': round(min(phase_data[phase]), 2),
                        'max': round(max(phase_data[phase]), 2)
                    }
                else:
                    # Categorical - count frequencies
                    freq = {}
                    for val in phase_data[phase]:
                        freq[val] = freq.get(val, 0) + 1
                    phase_analysis[phase] = {
                        'count': len(phase_data[phase]),
                        'frequency': freq
                    }
        
        return {
            'symptom_field': symptom_field,
            'months_analyzed': months,
            'total_entries': len(entries_with_phases),
            'phase_analysis': phase_analysis,
            'insights': PeriodAnalyticsService._generate_phase_insights(
                phase_analysis, symptom_field
            )
        }
    
    @staticmethod
    def analyze_prediction_accuracy(tracker_id: int, months: int = 6) -> Dict[str, Any]:
        # Get historical predictions vs actuals
        predictions = PeriodAnalyticsService._get_prediction_history(
            tracker_id, months
        )
        
        if not predictions:
            return {
                'message': 'No prediction history available',
                'note': 'Predictions are made when you log entries'
            }
        
        # Calculate accuracy
        errors = []
        for pred in predictions:
            error_days = abs((pred['actual_date'] - pred['predicted_date']).days)
            errors.append(error_days)
        
        avg_error = np.mean(errors)
        
        # Accuracy classification
        if avg_error <= 1:
            accuracy_level = "Highly Accurate"
        elif avg_error <= 3:
            accuracy_level = "Accurate"
        elif avg_error <= 5:
            accuracy_level = "Moderately Accurate"
        else:
            accuracy_level = "Less Accurate"
        
        return {
            'predictions_analyzed': len(predictions),
            'average_error_days': round(avg_error, 1),
            'accuracy_level': accuracy_level,
            'predictions': [
                {
                    'predicted_date': p['predicted_date'].isoformat(),
                    'actual_date': p['actual_date'].isoformat(),
                    'error_days': abs((p['actual_date'] - p['predicted_date']).days)
                }
                for p in predictions
            ],
            'recommendation': PeriodAnalyticsService._generate_accuracy_recommendation(
                avg_error, len(predictions)
            )
        }
    
    @staticmethod
    def generate_cycle_calendar(
        tracker_id: int,
        time_period: str
    ) -> bytes:
        try:
            tracker = Tracker.query.get(tracker_id)
            category = TrackerCategory.query.filter_by(id=tracker.category_id).first()
            if not category or category.name != 'Period Tracker':
                raise ValueError("This endpoint is only available for Period Tracker")
            
            if time_period == 'month':
                # Generate calendar month view
                calendar_data = PeriodAnalyticsService.get_calendar_month_view()
                
            elif time_period == 'all':
                # Generate calendar global view
                calendar_data = PeriodAnalyticsService.generate_calendar_global_view(tracker_id)
            else:
                raise ValueError("Invalid time_period")
            return calendar_data
        except ValueError as e:
            raise ValueError(f"Failed to generate cycle calendar: {str(e)}")
    
    @staticmethod
    def get_calendar_month_view(target_date: Optional[date] = None) -> Dict[str, Any]:
        
        target_date = target_date or date.today()
        today = date.today()
        
        # Get month boundaries
        month_start = date(target_date.year, target_date.month, 1)
        _, last_day = calendar.monthrange(target_date.year, target_date.month)
        month_end = date(target_date.year, target_date.month, last_day)
        
        # Calculate days from previous month (fill first week, min 3 days)
        month_start_weekday = month_start.weekday()  # 0=Monday, 6=Sunday
        days_from_prev_month = max(month_start_weekday, 3)
        calendar_start = month_start - timedelta(days=days_from_prev_month)
        
        # Calculate days from next month to complete 6 weeks (42 days total)
        days_in_month = (month_end - month_start).days + 1
        days_from_next_month = max(2, min(4, 42 - days_from_prev_month - days_in_month))
        calendar_end = month_end + timedelta(days=days_from_next_month)
        
        # Generate all days in calendar view
        days = []
        current = calendar_start
        while current <= calendar_end:
            is_current_month = month_start <= current <= month_end
            days.append({
                'date': current.isoformat(),
                'day': current.day,
                'weekday': current.strftime('%A'),
                'weekday_short': current.strftime('%a'),
                'is_today': current == today,
                'is_current_month': is_current_month,
                'is_previous_month': current < month_start,
                'is_next_month': current > month_end,
                'week_number': current.isocalendar()[1]
            })
            current += timedelta(days=1)
        
        total_days = len(days)
        return {
            'month_start': month_start.isoformat(),
            'month_end': month_end.isoformat(),
            'calendar_start': calendar_start.isoformat(),
            'calendar_end': calendar_end.isoformat(),
            'days': days,
            'today': today.isoformat(),
            'target_month': target_date.strftime('%B %Y'),
            'total_days': total_days,
            'weeks': total_days // 7
        }
    
    @staticmethod
    def generate_calendar_global_view(tracker_id: int) -> Dict[str, Any]:
        try:
            tracker = Tracker.query.get(tracker_id)
            category = TrackerCategory.query.filter_by(id=tracker.category_id).first()
            if not category or category.name != 'Period Tracker':
                raise ValueError("This endpoint is only available for Period Tracker")
            #get all cycles for this tracker
            cycles = PeriodCycleService.get_cycle_history(tracker_id)
            #get cycle phases dates for each cycle
            cycle_phases_dates = []
            for cycle in cycles:
                cycle_phases_dates.append(PeriodCycleService.get_cycle_phases_dates(tracker_id, cycle.id))
            return cycle_phases_dates
        except ValueError as e:
            raise ValueError(f"Failed to generate calendar global view: {str(e)}")
    
    # Helper methods
    
    @staticmethod
    def _get_period_start_dates(tracker_id: int, months: int) -> List[date]:
        """Extract period start dates from tracking data."""
        try:
            tracker = Tracker.query.get(tracker_id)
            if not tracker:
                raise ValueError(f"Tracker {tracker_id} not found")
            if tracker.category.name != 'Period Tracker':
                raise ValueError("This endpoint is only for Period Trackers")
            period_starts = []
            entries = TrackingData.query.filter_by(tracker_id=tracker_id ).order_by(TrackingData.entry_date.asc()).all()
        except Exception as e:
            raise ValueError(f"Failed to get period start dates: {str(e)}")
            
    
    @staticmethod
    def _get_entries_with_phases(
        tracker_id: int,
        field_name: str,
        months: int
    ) -> List[Dict[str, Any]]:
        """Get entries annotated with cycle phase."""
        # Fetch entries and calculate cycle phase for each
        pass
    
    @staticmethod
    def _get_prediction_history(tracker_id: int, months: int) -> List[Dict]:
        """Get historical predictions vs actuals."""
        # This requires storing predictions when they're made
        # Might need new database table: PeriodPredictions
        pass
    
    @staticmethod
    def _generate_medical_note(avg_length: float, std_dev: float) -> str:
        """Generate medical context note about cycle regularity."""
        notes = []
        
        if 21 <= avg_length <= 35:
            notes.append("Your average cycle length is within the normal range (21-35 days).")
        elif avg_length < 21:
            notes.append("Your cycles are shorter than typical. Consider discussing with your doctor.")
        else:
            notes.append("Your cycles are longer than typical. Consider discussing with your doctor.")
        
        if std_dev <= 4:
            notes.append("Your cycles show good regularity.")
        else:
            notes.append("Your cycles show some variability, which can be normal but worth monitoring.")
        
        return " ".join(notes)
    
    @staticmethod
    def _generate_phase_insights(
        phase_analysis: Dict,
        symptom_field: str
    ) -> List[str]:
        """Generate insights about symptom patterns."""
        insights = []
        
        # Example: identify which phase has worst symptoms
        # This is domain-specific analysis
        
        return insights
    
    @staticmethod
    def _generate_accuracy_recommendation(avg_error: float, count: int) -> str:
        """Generate recommendation based on prediction accuracy."""
        if count < 3:
            return "Log more cycles to improve prediction accuracy."
        
        if avg_error <= 2:
            return "Predictions are highly accurate. Your cycle is very regular!"
        elif avg_error <= 4:
            return "Predictions are reasonably accurate. Continue tracking for best results."
        else:
            return ("Predictions are less accurate, which may indicate cycle irregularity. "
                   "Consider tracking for a few more months or discussing with your doctor.")


