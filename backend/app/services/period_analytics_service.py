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


from app.services.analytics_base import (
    AnalyticsDataExtractor,
    AnalyticsGrouper,
    AnalyticsStatsCalculator,
    NumericExtractor,
    FieldTypeDetector
)
from app.models.field_option import FieldOption
from app.models.tracker import Tracker
from app.models.tracker_category import TrackerCategory
from app.models.period_cycle import PeriodCycle
from app.models.tracking_data import TrackingData
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
        period_starts = PeriodAnalyticsService.get_period_start_dates(
            tracker_id, months
        )
        
        if len(period_starts) < 2:
            return {
                'message': 'Need at least 2 cycles to analyze regularity',
                'cycles_found': len(period_starts)
            }
        
        # Sort dates in ascending order (oldest first) for correct cycle length calculation
        period_starts = sorted(period_starts)
        
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
            'medical_note': PeriodAnalyticsService.generate_medical_note(
                avg_length, std_dev
            )
        }
    
    @staticmethod
    def analyze_symptoms_by_phase(
        tracker_id: int,
        symptom_field: str,
        months: int = 3,
        option: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Analyze how symptoms vary across menstrual cycle phases.
        
        Uses shared base layer for extraction, grouping, and stats.
        Period-specific logic: cycle phase detection and insights.
        
        Args:
            tracker_id: The tracker ID
            symptom_field: Name of the symptom field (e.g., 'pain_level', 'discharge.amount')
            months: Number of months to analyze
            option: Optional specific option to extract (e.g., 'amount', 'quality')
        
        Returns:
            Dictionary with phase analysis and insights
        """
        # === PERIOD-SPECIFIC: Get entries that belong to cycles ===
        entries = PeriodAnalyticsService.get_entries_with_cycles(
            tracker_id, symptom_field, months
        )
        
        if not entries:
            return {
                'message': 'No symptom data found',
                'field': symptom_field,
                'option': option
            }
        
        # === USE SHARED BASE LAYER: Extract field values ===
        extracted_data = AnalyticsDataExtractor.extract_field_values(
            entries, symptom_field, option, tracker_id
        )
        
        if not extracted_data:
            return {
                'message': 'No valid data found',
                'field': symptom_field,
                'option': option
            }
        
        # Detect field type (shared utility)
        field_type, _ = FieldTypeDetector.detect_field_type(
            symptom_field, tracker_id, option
        )
        
        # === PERIOD-SPECIFIC: Add cycle phase to each data point ===
        data_with_phases = PeriodAnalyticsService.annotate_cycle_phases(
            extracted_data, tracker_id
        )
        
        # === USE SHARED BASE LAYER: Group by phase ===
        phase_groups = AnalyticsGrouper.group_by_criterion(
            data_with_phases,
            lambda d: d.get('cycle_phase', 'unknown')
        )
        
        # === USE SHARED BASE LAYER: Calculate statistics ===
        phase_analysis = {}
        for phase in ['menstruation', 'follicular', 'ovulation', 'luteal']:
            if phase in phase_groups and phase_groups[phase]:
                if field_type == 'numeric':
                    stats = AnalyticsStatsCalculator.calculate_numeric_stats(
                        phase_groups[phase]
                    )
                    # Keep only essential stats for backward compatibility
                    if stats:
                        phase_analysis[phase] = {
                            'count': stats['count'],
                            'mean': stats['mean'],
                            'min': stats['min'],
                            'max': stats['max']
                        }
                else:
                    stats = AnalyticsStatsCalculator.calculate_categorical_stats(
                        phase_groups[phase]
                    )
                    if stats:
                        phase_analysis[phase] = {
                            'count': stats['count'],
                            'frequency': stats['frequency']
                        }
        
        # === PERIOD-SPECIFIC: Generate phase insights ===
        return {
            'symptom_field': symptom_field,
            'option': option,
            'months_analyzed': months,
            'total_entries': len(extracted_data),
            'phase_analysis': phase_analysis,
            'insights': PeriodAnalyticsService.generate_phase_insights(
                phase_analysis, symptom_field
            )
        }
    
    @staticmethod
    def analyze_prediction_accuracy(tracker_id: int, months: int = 6) -> Dict[str, Any]:
        """
        Analyze prediction accuracy by comparing predicted vs actual cycle dates.
        
        Compares:
        - Predicted next period date vs actual next period start
        - Predicted ovulation date vs actual (if available)
        """
        # Get historical predictions vs actuals
        history_data = PeriodAnalyticsService.get_prediction_history(
            tracker_id, months
        )
        
        if not history_data or not history_data.get('predictions'):
            return {
                'message': 'No prediction history available',
                'note': 'Predictions are made when you log entries'
            }
        
        predictions_list = history_data.get('predictions', [])
        reality_list = history_data.get('reality', [])
        
        if not predictions_list or not reality_list:
            return {
                'message': 'No prediction history available',
                'note': 'Predictions are made when you log entries'
            }
        
        # Reverse lists to chronological order (oldest first)
        # The query returns cycles in descending order (newest first), so we reverse to get oldest first
        predictions_list = list(reversed(predictions_list))
        reality_list = list(reversed(reality_list))
        
        # Calculate accuracy by comparing predicted vs actual dates
        errors = []
        prediction_comparisons = []
        
        # Compare each cycle's predictions with the NEXT cycle's reality
        # Cycle N's predicted_next_period_date should be compared with Cycle N+1's actual period_start
        for i in range(len(predictions_list) - 1):
            # Get predictions from current cycle
            pred_dict = predictions_list[i]
            pred_data = pred_dict.get('predictions', {})
            
            # Get reality from NEXT cycle (the one that actually started)
            next_reality_dict = reality_list[i + 1]
            next_reality_data = next_reality_dict.get('reality', {})
            
            # Compare predicted next period date with actual next period start
            if pred_data.get('predicted_next_period_date') and next_reality_data.get('period_start'):
                try:
                    predicted_date = date.fromisoformat(pred_data['predicted_next_period_date'])
                    actual_date = date.fromisoformat(next_reality_data['period_start'])
                    error_days = abs((actual_date - predicted_date).days)
                    errors.append(error_days)
                    
                    prediction_comparisons.append({
                        'predicted_date': pred_data['predicted_next_period_date'],
                        'actual_date': next_reality_data['period_start'],
                        'error_days': error_days
                    })
                except (ValueError, TypeError, KeyError):
                    # Skip invalid dates
                    continue
        
        if not errors:
            return {
                'message': 'No valid prediction comparisons available',
                'note': 'Need completed cycles with predictions to analyze accuracy'
            }
        
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
            'predictions_analyzed': len(errors),
            'average_error_days': round(avg_error, 1),
            'accuracy_level': accuracy_level,
            'predictions': prediction_comparisons,
            'recommendation': PeriodAnalyticsService.generate_accuracy_recommendation(
                avg_error, len(errors)
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
        calendar_grid = PeriodAnalyticsService.build_calendar_grid(
            month_start, month_end
        )
        
        # Get all cycles that overlap with this month (including buffer days)
        cycles = PeriodAnalyticsService.get_cycles_for_month(
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
    def build_calendar_grid(month_start: date, month_end: date) -> Dict[str, Any]:
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
    def get_cycles_for_month(
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
    def annotate_calendar_days(
        days: List[Dict],
        cycles: List[PeriodCycle],
        include_predictions: bool
    ) -> List[Dict]:

        annotated = []
        
        for day_info in days:
            day_date = date.fromisoformat(day_info['date'])
            
            # Find which cycle this day belongs to
            cycle_info = PeriodAnalyticsService.find_cycle_for_day(
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
            cycles = PeriodCycle.query.filter_by(tracker_id=tracker_id).order_by(PeriodCycle.cycle_start_date.desc()).filter(PeriodCycle.cycle_start_date >= date.today() - timedelta(days=months*30)).all()
            return [cycle.cycle_start_date for cycle in cycles]
        except Exception as e:
            raise ValueError(f"Failed to get period start dates: {str(e)}")
    
    @staticmethod
    def get_prediction_history(tracker_id: int, months: int) -> List[Dict]:
        try:
            tracker = Tracker.query.get(tracker_id)
            if not tracker:
                raise ValueError(f"Tracker {tracker_id} not found")
            cycles = PeriodCycle.query.filter_by(tracker_id=tracker_id).order_by(PeriodCycle.cycle_start_date.desc()).filter(PeriodCycle.cycle_start_date >= date.today() - timedelta(days=months*30)).all()
            predictions = []
            reality = []
            for cycle in cycles:
                predictions.append({
                    'predictions': PeriodCycleService.get_cycle_phases_dates(tracker_id, cycle.id)['cycle_predictions'],
                })
                reality.append({
                    'reality': PeriodCycleService.get_cycle_phases_dates(tracker_id, cycle.id)['cycle_info'],
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
    def get_entries_with_cycles(
        tracker_id: int,
        field_name: str,
        months: int
    ) -> List[TrackingData]:
        """
        Period-specific: Get tracking entries that belong to cycles.
        
        This method filters entries to only those that have associated cycles.
        Field extraction is handled by shared AnalyticsDataExtractor.
        
        Args:
            tracker_id: The tracker ID
            field_name: Name of the field to check for
            months: Number of months to look back
        
        Returns:
            List of TrackingData entries that belong to cycles
        """
        cutoff_date = date.today() - timedelta(days=months * 30)
        
        # Get all tracking entries within date range
        entries = TrackingData.query.filter_by(
            tracker_id=tracker_id
        ).filter(
            TrackingData.entry_date >= cutoff_date
        ).order_by(TrackingData.entry_date.asc()).all()
        
        # Filter to entries that:
        # 1. Have the field (handled by shared extractor, but we pre-filter here for efficiency)
        # 2. Belong to a cycle
        entries_with_cycles = []
        for entry in entries:
            if not entry.data:
                continue
            
            # Check if field exists (handle nested fields)
            has_field = False
            if field_name in entry.data:
                has_field = True
            elif '.' in field_name:
                base_field, sub_field = field_name.split('.', 1)
                if base_field in entry.data:
                    base_data = entry.data[base_field]
                    if isinstance(base_data, dict) and sub_field in base_data:
                        has_field = True
            
            if not has_field:
                continue
            
            # Check if entry belongs to a cycle
            cycle = PeriodCycleService.find_cycle_for_date(tracker_id, entry.entry_date)
            if cycle:
                entries_with_cycles.append(entry)
        
        return entries_with_cycles
    
    @staticmethod
    def annotate_cycle_phases(
        data: List[Dict[str, Any]],
        tracker_id: int
    ) -> List[Dict[str, Any]]:
        """
        Period-specific: Add cycle phase information to extracted data.
        
        Takes data from AnalyticsDataExtractor and adds:
        - cycle_phase: The phase this entry belongs to
        - cycle_day: Day number in the cycle
        - cycle_id: ID of the cycle
        
        Args:
            data: List of extracted data dicts from AnalyticsDataExtractor
            tracker_id: The tracker ID
        
        Returns:
            Same data structure with phase annotations added
        """
        settings = PeriodCycleService.get_tracker_settings(tracker_id)
        
        annotated = []
        for item in data:
            entry_date = item['entry_date']
            
            # Find cycle for this date
            cycle = PeriodCycleService.find_cycle_for_date(tracker_id, entry_date)
            
            if cycle:
                # Calculate cycle day and phase
                days_since_start = (entry_date - cycle.cycle_start_date).days + 1
                
                phase = determine_cycle_phase(
                    days_since_start,
                    settings['average_period_length'],
                    settings['average_cycle_length']
                )
                
                # Add phase information to the item
                item['cycle_phase'] = phase
                item['cycle_day'] = days_since_start
                item['cycle_id'] = cycle.id
                
                annotated.append(item)
        
        return annotated
    
    @staticmethod
    def generate_phase_insights(
        phase_analysis: Dict,
        symptom_field: str
    ) -> Dict[str, Any]:

        if not phase_analysis:
            return {
                'insights': {},
                'summary': f"No data available for {symptom_field} across cycle phases.",
                'recommendations': ["Log more entries during different cycle phases to see patterns."]
            }
        
        # Determine if numeric or categorical
        first_phase = list(phase_analysis.keys())[0]
        is_numeric = 'mean' in phase_analysis[first_phase]
        
        phase_names = {
            'menstruation': 'Menstrual',
            'follicular': 'Follicular',
            'ovulation': 'Ovulation',
            'luteal': 'Luteal'
        }
        
        insights = {}
        phase_comparisons = {}
        
        if is_numeric:
            # ===== NUMERIC ANALYSIS =====
            phase_means = {}
            phase_counts = {}
            
            for phase, data in phase_analysis.items():
                phase_means[phase] = data['mean']
                phase_counts[phase] = data['count']
                
                # Generate phase-specific insights
                phase_label = phase_names.get(phase, phase.capitalize())
                insights[phase] = {
                    'summary': f"During {phase_label} phase: average {symptom_field} is {data['mean']}",
                    'statistics': {
                        'average': data['mean'],
                        'range': f"{data['min']} - {data['max']}",
                        'span': round(data['max'] - data['min'], 2),
                        'data_points': data['count']
                    },
                    'interpretation': PeriodAnalyticsService.interpret_numeric_phase(
                        phase, data, symptom_field
                    )
                }
            
            # Cross-phase comparisons
            if len(phase_means) > 1:
                highest_phase = max(phase_means, key=phase_means.get)
                lowest_phase = min(phase_means, key=phase_means.get)
                
                highest_value = phase_means[highest_phase]
                lowest_value = phase_means[lowest_phase]
                difference = round(highest_value - lowest_value, 2)
                percent_diff = round((difference / lowest_value * 100), 1) if lowest_value > 0 else 0
                
                phase_comparisons = {
                    'highest_phase': {
                        'phase': phase_names.get(highest_phase, highest_phase),
                        'value': highest_value,
                        'insight': f"{symptom_field} is highest during {phase_names.get(highest_phase, highest_phase)} phase"
                    },
                    'lowest_phase': {
                        'phase': phase_names.get(lowest_phase, lowest_phase),
                        'value': lowest_value,
                        'insight': f"{symptom_field} is lowest during {phase_names.get(lowest_phase, lowest_phase)} phase"
                    },
                    'variation': {
                        'difference': difference,
                        'percent_change': percent_diff,
                        'insight': f"{symptom_field} varies by {difference} ({percent_diff}%) across phases"
                    }
                }
            
            # Generate overall summary
            all_values = [data['mean'] for data in phase_analysis.values()]
            overall_mean = round(np.mean(all_values), 2)
            overall_min = min([data['min'] for data in phase_analysis.values()])
            overall_max = max([data['max'] for data in phase_analysis.values()])
            total_data_points = sum([data['count'] for data in phase_analysis.values()])
            
            summary = (
                f"Your {symptom_field} shows variation across cycle phases. "
                f"Overall average: {overall_mean} (range: {overall_min} - {overall_max}). "
                f"Based on {total_data_points} data points across {len(phase_analysis)} phases."
            )
            
        else:
            # ===== CATEGORICAL ANALYSIS =====
            phase_frequencies = {}
            
            for phase, data in phase_analysis.items():
                phase_label = phase_names.get(phase, phase.capitalize())
                frequencies = data.get('frequency', {})
                
                if frequencies:
                    most_common = max(frequencies, key=frequencies.get)
                    most_common_count = frequencies[most_common]
                    total_count = data['count']
                    percentage = round((most_common_count / total_count) * 100, 1)
                    
                    insights[phase] = {
                        'summary': f"During {phase_label} phase: most common {symptom_field} is '{most_common}'",
                        'statistics': {
                            'most_common': most_common,
                            'frequency': f"{most_common_count}/{total_count} ({percentage}%)",
                            'distribution': frequencies,
                            'data_points': total_count
                        },
                        'interpretation': PeriodAnalyticsService.interpret_categorical_phase(
                            phase, frequencies, symptom_field
                        )
                    }
                    
                    phase_frequencies[phase] = {
                        'most_common': most_common,
                        'percentage': percentage
                    }
            
            # Cross-phase comparisons for categorical
            if len(phase_frequencies) > 1:
                # Find if same value is most common across phases
                all_most_common = [pf['most_common'] for pf in phase_frequencies.values()]
                if len(set(all_most_common)) == 1:
                    phase_comparisons = {
                        'pattern': f"'{all_most_common[0]}' is the most common {symptom_field} across all phases",
                        'consistency': 'high'
                    }
                else:
                    phase_comparisons = {
                        'pattern': f"{symptom_field} patterns vary by phase",
                        'consistency': 'moderate',
                        'variations': {
                            phase_names.get(phase, phase): data['most_common']
                            for phase, data in phase_frequencies.items()
                        }
                    }
            
            total_data_points = sum([data['count'] for data in phase_analysis.values()])
            summary = (
                f"Your {symptom_field} patterns across {len(phase_analysis)} cycle phases. "
                f"Based on {total_data_points} logged entries."
            )
        
        # Generate recommendations
        recommendations = PeriodAnalyticsService.generate_phase_recommendations(
            phase_analysis, symptom_field, is_numeric
        )
        
        return {
            'insights': insights,
            'comparisons': phase_comparisons,
            'summary': summary,
            'recommendations': recommendations,
            'data_quality': {
                'phases_analyzed': len(phase_analysis),
                'total_data_points': sum([data['count'] for data in phase_analysis.values()]),
                'completeness': 'good' if len(phase_analysis) >= 3 else 'partial'
            }
        }
    
    @staticmethod
    def interpret_numeric_phase(phase: str, data: Dict, symptom_field: str) -> str:
        """Generate interpretation for numeric phase data."""
        phase_labels = {
            'menstruation': 'menstrual',
            'follicular': 'follicular',
            'ovulation': 'ovulation',
            'luteal': 'luteal'
        }
        
        phase_label = phase_labels.get(phase, phase)
        mean = data['mean']
        span = data['max'] - data['min']
        
        if span < mean * 0.2:  # Low variation
            consistency = "relatively consistent"
        elif span < mean * 0.5:  # Moderate variation
            consistency = "somewhat variable"
        else:  # High variation
            consistency = "highly variable"
        
        return (
            f"During {phase_label} phase, your {symptom_field} averages {mean} "
            f"with {consistency} values (range: {data['min']} - {data['max']})."
        )
    
    @staticmethod
    def interpret_categorical_phase(phase: str, frequencies: Dict, symptom_field: str) -> str:
        """Generate interpretation for categorical phase data."""
        phase_labels = {
            'menstruation': 'menstrual',
            'follicular': 'follicular',
            'ovulation': 'ovulation',
            'luteal': 'luteal'
        }
        
        phase_label = phase_labels.get(phase, phase)
        most_common = max(frequencies, key=frequencies.get)
        total = sum(frequencies.values())
        percentage = round((frequencies[most_common] / total) * 100, 1)
        
        if percentage >= 70:
            dominance = "predominantly"
        elif percentage >= 50:
            dominance = "mostly"
        else:
            dominance = "often"
        
        return (
            f"During {phase_label} phase, you {dominance} experience '{most_common}' "
            f"for {symptom_field} ({percentage}% of the time)."
        )
    
    @staticmethod
    def generate_phase_recommendations(
        phase_analysis: Dict,
        symptom_field: str,
        is_numeric: bool
    ) -> List[str]:
        """Generate actionable recommendations based on phase analysis."""
        recommendations = []
        
        # Check data completeness
        total_points = sum([data['count'] for data in phase_analysis.values()])
        phases_with_data = len(phase_analysis)
        
        if phases_with_data < 4:
            recommendations.append(
                f"Log {symptom_field} during all cycle phases (menstrual, follicular, ovulation, luteal) "
                "to get a complete picture of how it changes throughout your cycle."
            )
        
        if total_points < 10:
            recommendations.append(
                f"Continue tracking {symptom_field} over multiple cycles to identify reliable patterns."
            )
        
        if is_numeric and phases_with_data >= 2:
            # Check for significant variation
            means = [data['mean'] for data in phase_analysis.values()]
            if len(means) >= 2:
                max_mean = max(means)
                min_mean = min(means)
                variation = (max_mean - min_mean) / min_mean * 100 if min_mean > 0 else 0
                
                if variation > 20:
                    recommendations.append(
                        f"Your {symptom_field} varies significantly across phases ({variation:.1f}% difference). "
                        "Consider planning activities around phases when symptoms are more manageable."
                    )
        
        if not recommendations:
            recommendations.append(
                f"Keep tracking {symptom_field} to maintain accurate phase-based insights."
            )
        
        return recommendations
    
    @staticmethod
    def generate_accuracy_recommendation(avg_error: float, count: int) -> str:
        if count < 3:
            return "Log more cycles to improve prediction accuracy."
        
        if avg_error <= 2:
            return "Predictions are highly accurate. Your cycle is very regular!"
        elif avg_error <= 4:
            return "Predictions are reasonably accurate. Continue tracking for best results."
        else:
            return ("Predictions are less accurate, which may indicate cycle irregularity. "
                   "Consider tracking for a few more months or discussing with your doctor.")


