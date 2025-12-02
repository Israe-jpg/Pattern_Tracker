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
from app.models.period_cycle import PeriodCycle
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
    
    # ============================================================================
    # SERVICE METHODS - Enhanced Calendar Data Generation
    # ============================================================================
    
    @staticmethod
    def get_calendar_data(
        tracker_id: int,
        target_date: date,
        include_predictions: bool = True
    ) -> Dict[str, Any]:
        """
        Get comprehensive calendar data for a specific month.
        
        Returns:
        - Calendar grid structure (weeks and days)
        - Phase information for each day
        - Cycle boundaries
        - Predictions
        """
        # Get month boundaries
        year, month = target_date.year, target_date.month
        month_start = date(year, month, 1)
        _, last_day = calendar.monthrange(year, month)
        month_end = date(year, month, last_day)
        
        # Get calendar grid (include surrounding days to fill weeks)
        calendar_grid = PeriodAnalyticsService._build_calendar_grid(
            month_start, month_end
        )
        
        # Get all cycles that overlap with this month (including buffer days)
        cycles = PeriodAnalyticsService._get_cycles_for_month(
            tracker_id,
            date.fromisoformat(calendar_grid['calendar_start']),
            date.fromisoformat(calendar_grid['calendar_end'])
        )
        
        # Annotate each day with cycle information
        annotated_days = PeriodAnalyticsService._annotate_calendar_days(
            calendar_grid['days'],
            cycles,
            include_predictions
        )
        
        # Get current cycle info
        current_cycle = PeriodCycleService.get_current_cycle(tracker_id)
        settings = PeriodCycleService.get_tracker_settings(tracker_id)
        
        return {
            'month': {
                'year': year,
                'month': month,
                'month_name': target_date.strftime('%B'),
                'month_name_short': target_date.strftime('%b')
            },
            'calendar_grid': calendar_grid,
            'days': annotated_days,
            'cycles_in_view': [
                {
                    'cycle_id': c.id,
                    'cycle_start': c.cycle_start_date.isoformat(),
                    'cycle_end': c.cycle_end_date.isoformat() if c.cycle_end_date else None,
                    'is_current': c.is_current
                }
                for c in cycles
            ],
            'current_cycle_info': {
                'cycle_day': calculate_cycle_day(
                    current_cycle.cycle_start_date.isoformat()
                ) if current_cycle else None,
                'cycle_phase': determine_cycle_phase(
                    calculate_cycle_day(current_cycle.cycle_start_date.isoformat()),
                    settings['average_period_length'],
                    settings['average_cycle_length']
                ) if current_cycle else None
            } if current_cycle else None,
            'legend': {
                'menstrual': {'label': 'Period', 'color': '#EF4444'},
                'follicular': {'label': 'Follicular', 'color': '#3B82F6'},
                'ovulation': {'label': 'Ovulation', 'color': '#10B981'},
                'luteal': {'label': 'Luteal', 'color': '#F59E0B'},
                'predicted': {'label': 'Predicted', 'opacity': 0.5}
            }
        }
    
    @staticmethod
    def _build_calendar_grid(month_start: date, month_end: date) -> Dict[str, Any]:
        # Include days from previous month to start on Monday
        start_weekday = month_start.weekday()  # 0=Monday
        calendar_start = month_start - timedelta(days=start_weekday)
        
        # Include days from next month to complete last week
        end_weekday = month_end.weekday()
        days_to_add = 6 - end_weekday  # Complete to Sunday
        calendar_end = month_end + timedelta(days=days_to_add)
        
        # Generate all days
        days = []
        current = calendar_start
        while current <= calendar_end:
            days.append({
                'date': current.isoformat(),
                'day': current.day,
                'weekday': current.weekday(),  # 0=Monday
                'is_today': current == date.today(),
                'is_current_month': month_start <= current <= month_end,
                'week_of_month': ((current - month_start).days // 7) + 1
            })
            current += timedelta(days=1)
        
        # Group into weeks
        weeks = []
        for i in range(0, len(days), 7):
            weeks.append(days[i:i+7])
        
        return {
            'calendar_start': calendar_start.isoformat(),
            'calendar_end': calendar_end.isoformat(),
            'days': days,
            'weeks': weeks,
            'total_weeks': len(weeks)
        }
    
    @staticmethod
    def _get_cycles_for_month(
        tracker_id: int,
        start_date: date,
        end_date: date
    ) -> List[PeriodCycle]:
        """Get all cycles that overlap with date range."""
        cycles = PeriodCycle.query.filter_by(
            tracker_id=tracker_id
        ).filter(
            PeriodCycle.cycle_start_date <= end_date
        ).order_by(PeriodCycle.cycle_start_date.asc()).all()
        
        overlapping = []
        for cycle in cycles:
            cycle_end = cycle.cycle_end_date or cycle.predicted_next_period_date
            
            if cycle_end:
                if cycle_end >= start_date:
                    overlapping.append(cycle)
            else:
                overlapping.append(cycle)
        
        return overlapping
    
    @staticmethod
    def _annotate_calendar_days(
        days: List[Dict],
        cycles: List[PeriodCycle],
        include_predictions: bool
    ) -> List[Dict]:

        annotated = []
        
        for day_info in days:
            day_date = date.fromisoformat(day_info['date'])
            
            # Find which cycle this day belongs to
            cycle_info = PeriodAnalyticsService._find_cycle_for_day(
                day_date, cycles
            )
            
            day_info['cycle'] = cycle_info
            
            if cycle_info:
                # Determine phase for this day
                phase_info = PeriodAnalyticsService._determine_day_phase(
                    day_date,
                    cycle_info,
                    include_predictions
                )
                day_info['phase'] = phase_info
            else:
                day_info['phase'] = None
            
            annotated.append(day_info)
        
        return annotated
    
    @staticmethod
    def _find_cycle_for_day(day_date: date, cycles: List[PeriodCycle]) -> Optional[Dict]:
        for cycle in cycles:
            cycle_end = cycle.cycle_end_date or cycle.predicted_next_period_date
            
            if cycle.cycle_start_date <= day_date:
                if not cycle_end or day_date < cycle_end:
                    return {
                        'cycle_id': cycle.id,
                        'cycle_start_date': cycle.cycle_start_date.isoformat(),
                        'cycle_end_date': cycle.cycle_end_date.isoformat() if cycle.cycle_end_date else None,
                        'period_start_date': cycle.period_start_date.isoformat(),
                        'period_end_date': cycle.period_end_date.isoformat() if cycle.period_end_date else None,
                        'is_current': cycle.is_current,
                        'is_complete': cycle.is_complete
                    }
        
        return None
    
    @staticmethod
    def _determine_day_phase(
        day_date: date,
        cycle_info: Dict,
        include_predictions: bool
    ) -> Optional[Dict]:
        
        # Get cycle object if needed, or use cycle_info dict
        period_start_date = date.fromisoformat(cycle_info['period_start_date'])
        period_end_date = date.fromisoformat(cycle_info['period_end_date']) if cycle_info['period_end_date'] else None
        is_complete = cycle_info['is_complete']
        
        # Period phase (confirmed)
        if period_start_date <= day_date:
            if period_end_date and day_date <= period_end_date:
                return {
                    'phase': 'menstrual',
                    'label': 'Period',
                    'is_predicted': False
                }
        
        # If we don't have period end, estimate it
        estimated_period_end = period_end_date
        if not estimated_period_end:
            # Need to get settings to estimate period end
            # We'll need the cycle object for tracker_id, so let's get it from cycle_id
            cycle = PeriodCycle.query.get(cycle_info['cycle_id'])
            if cycle:
                settings = PeriodCycleService.get_tracker_settings(cycle.tracker_id)
                estimated_period_end = period_start_date + timedelta(
                    days=settings['average_period_length'] - 1
                )
            else:
                estimated_period_end = period_start_date + timedelta(days=4)  # Default 5 days
        
        # After period ends
        if day_date > estimated_period_end:
            # Get cycle for ovulation date
            cycle = PeriodCycle.query.get(cycle_info['cycle_id'])
            if cycle and cycle.predicted_ovulation_date:
                days_from_ovulation = abs((day_date - cycle.predicted_ovulation_date).days)
                
                if days_from_ovulation <= 1:
                    return {
                        'phase': 'ovulation',
                        'label': 'Ovulation',
                        'is_predicted': not is_complete
                    }
                elif day_date < cycle.predicted_ovulation_date:
                    return {
                        'phase': 'follicular',
                        'label': 'Follicular',
                        'is_predicted': not is_complete
                    }
                else:
                    return {
                        'phase': 'luteal',
                        'label': 'Luteal',
                        'is_predicted': not is_complete
                    }
        
        return None
    
    @staticmethod
    def get_calendar_overview(
        tracker_id: int,
        months: int = 12
    ) -> Dict[str, Any]:
        """
        Get simplified overview of cycles for timeline view.
        
        Returns minimal data for showing multiple months at once.
        """
        cutoff_date = date.today() - timedelta(days=months * 30)
        
        cycles = PeriodCycleService.get_cycle_history(
            tracker_id,
            start_date=cutoff_date
        )
        
        # Build simplified timeline
        timeline = []
        for cycle in cycles:
            timeline.append({
                'cycle_id': cycle.id,
                'period_start': cycle.period_start_date.isoformat(),
                'period_end': cycle.period_end_date.isoformat() if cycle.period_end_date else None,
                'cycle_length': cycle.cycle_length,
                'period_length': cycle.period_length,
                'predicted_ovulation': cycle.predicted_ovulation_date.isoformat() 
                    if cycle.predicted_ovulation_date else None,
                'is_current': cycle.is_current
            })
        
        return {
            'timeline': timeline,
            'total_cycles': len(timeline),
            'date_range': {
                'start': cutoff_date.isoformat(),
                'end': date.today().isoformat()
            }
        }

    # Helper methods
    
    @staticmethod
    def get_period_start_dates(tracker_id: int, months: int) -> List[date]:
        try:
            tracker = Tracker.query.get(tracker_id)
            if not tracker:
                raise ValueError(f"Tracker {tracker_id} not found")
            cycles = PeriodCycles.query.filter_by(tracker_id=tracker_id).order_by(PeriodCycles.cycle_start_date.desc()).filter(PeriodCycles.cycle_start_date >= date.today() - timedelta(days=months*30)).all()
            return [cycle.cycle_start_date for cycle in cycles]
        except Exception as e:
            raise ValueError(f"Failed to get period start dates: {str(e)}")
    
    @staticmethod
    def get_prediction_history(tracker_id: int, months: int) -> List[Dict]:
        try:
            tracker = Tracker.query.get(tracker_id)
            if not tracker:
                raise ValueError(f"Tracker {tracker_id} not found")
            cycles = PeriodCycles.query.filter_by(tracker_id=tracker_id).order_by(PeriodCycles.cycle_start_date.desc()).filter(PeriodCycles.cycle_start_date >= date.today() - timedelta(days=months*30)).all()
            predictions = []
            reality = []
            for cycle in cycles:
                predictions.append({
                    'predictions': get_cycle_phases_dates(tracker_id, cycle.id)['cycle_predictions'],
                })
                reality.append({
                    'reality': get_cycle_phases_dates(tracker_id, cycle.id)['cycle_info'],
                })
            return {
                'predictions': predictions,
                'reality': reality
            }
        except Exception as e:
            raise ValueError(f"Failed to get prediction history: {str(e)}")


    @staticmethod
    def generate_medical_note(avg_length: float, std_dev: float) -> str:
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
    def generate_phase_insights(
        phase_analysis: Dict,
        symptom_field: str
    ) -> List[str]:
        """Generate insights about symptom patterns."""
        insights = []
        
        # Example: identify which phase has worst symptoms
        # This is domain-specific analysis
        
        return insights
    
    @staticmethod
    def generate_accuracy_recommendation(avg_error: float, count: int) -> str:
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


