"""
Universal comparison service for all trackers.

Supports:
- Period trackers: Cycle-to-cycle comparisons
- Regular trackers: Time period comparisons (week, month, year)
- Field-level comparisons across time periods
- Comparison with averages/baselines
"""

from typing import Dict, Any, List, Optional, Tuple
from datetime import date, timedelta, datetime
from collections import defaultdict
import numpy as np
import calendar

from app.models.tracker import Tracker
from app.models.period_cycle import PeriodCycle
from app.models.tracking_data import TrackingData
from app.models.tracker_category import TrackerCategory
from app.services.analytics_base import (
    AnalyticsDataExtractor,
    AnalyticsGrouper,
    AnalyticsStatsCalculator,
    NumericExtractor,
    FieldTypeDetector
)
from app.services.period_cycle_service import PeriodCycleService

class ComparisonService:

    # ============================================================================
    # CYCLE COMPARISONS (Period Tracker Only)
    # ============================================================================
    
    @staticmethod
    def compare_cycle_with_previous(tracker_id: int, cycle_id: int) -> Dict[str, Any]:
        """
        Compare a cycle with the previous cycle - overall insights.
        
        Compares:
        - Cycle length
        - Period length
        - Symptom severity
        - Phase durations
        - Overall wellbeing
        """
        # Validate tracker
        tracker = Tracker.query.get(tracker_id)
        if not tracker:
            raise ValueError(f"Tracker {tracker_id} not found")
        
        category = TrackerCategory.query.filter_by(id=tracker.category_id).first()
        if not category or category.name != 'Period Tracker':
            raise ValueError("This comparison is only for Period Trackers")
        
        # Get target cycle
        target_cycle = PeriodCycle.query.get(cycle_id)
        if not target_cycle or target_cycle.tracker_id != tracker_id:
            raise ValueError(f"Cycle {cycle_id} not found or doesn't belong to tracker")
        
        # Get previous cycle
        previous_cycle = PeriodCycle.query.filter_by(
            tracker_id=tracker_id
        ).filter(
            PeriodCycle.cycle_start_date < target_cycle.cycle_start_date
        ).order_by(
            PeriodCycle.cycle_start_date.desc()
        ).first()
        
        if not previous_cycle:
            return {
                'message': 'No previous cycle to compare with',
                'target_cycle_id': cycle_id,
                'has_comparison': False
            }
        
        # 1. Basic cycle metrics comparison
        cycle_metrics = ComparisonService._compare_cycle_metrics(
            target_cycle, previous_cycle
        )
        
        # 2. Get all tracked fields for this tracker (top 10)
        tracked_fields = ComparisonService._get_tracked_fields(tracker_id)
        
        # 3. Compare key symptoms across cycles (all top 10 fields)
        all_comparisons = {}
        for field_name in tracked_fields:
            try:
                comparison = ComparisonService.compare_field_between_cycles(
                    tracker_id, field_name, target_cycle.id, previous_cycle.id
                )
                if comparison and comparison.get('has_comparison'):
                    all_comparisons[field_name] = {
                        'summary': comparison.get('summary'),
                        'change_direction': comparison.get('change_direction'),
                        'is_significant': comparison.get('is_significant', False),
                        'percent_change': comparison.get('percent_change', 0),
                        'difference': comparison.get('difference', 0)
                    }
            except:
                continue  # Skip fields with errors
        
        # 4. Filter to only significant comparisons and limit to top 3
        significant_comparisons = {
            field_name: comp for field_name, comp in all_comparisons.items()
            if comp.get('is_significant', False)
        }
        
        # Sort by absolute percent change (or absolute difference for categorical) and take top 3
        sorted_significant = sorted(
            significant_comparisons.items(),
            key=lambda x: abs(x[1].get('percent_change', 0)) if x[1].get('percent_change') is not None else abs(x[1].get('difference', 0)),
            reverse=True
        )
        
        symptom_comparisons = dict(sorted_significant[:3])  # Max 3 significant comparisons
        
        # 4. Generate overall insights
        insights = ComparisonService._generate_cycle_comparison_insights(
            cycle_metrics, symptom_comparisons, target_cycle, previous_cycle
        )
        
        return {
            'target_cycle': {
                'cycle_id': target_cycle.id,
                'cycle_number': ComparisonService._get_cycle_number(tracker_id, target_cycle),
                'start_date': target_cycle.cycle_start_date.isoformat(),
                'end_date': target_cycle.cycle_end_date.isoformat() if target_cycle.cycle_end_date else None,
                'is_current': target_cycle.is_current
            },
            'previous_cycle': {
                'cycle_id': previous_cycle.id,
                'cycle_number': ComparisonService._get_cycle_number(tracker_id, previous_cycle),
                'start_date': previous_cycle.cycle_start_date.isoformat(),
                'end_date': previous_cycle.cycle_end_date.isoformat() if previous_cycle.cycle_end_date else None
            },
            'cycle_metrics': cycle_metrics,
            'symptom_comparisons': symptom_comparisons,
            'insights': insights,
            'overall_change': ComparisonService._calculate_overall_change(
                cycle_metrics, symptom_comparisons
            ),
            'has_comparison': True
        }
    
    @staticmethod
    def compare_field_between_cycles(
        tracker_id: int,
        field_name: str,
        cycle_id_1: int,
        cycle_id_2: int,
        option: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Compare a specific field between two cycles.
        
        Args:
            tracker_id: The tracker ID
            field_name: Field to compare (can be nested like "mood.overall")
            cycle_id_1: First cycle (typically current/newer)
            cycle_id_2: Second cycle (typically previous/older)
            option: Optional specific option for nested fields
        
        Returns:
            Detailed field comparison
        """
        # Get both cycles
        cycle1 = PeriodCycle.query.get(cycle_id_1)
        cycle2 = PeriodCycle.query.get(cycle_id_2)
        
        if not cycle1 or not cycle2:
            raise ValueError("One or both cycles not found")
        
        if cycle1.tracker_id != tracker_id or cycle2.tracker_id != tracker_id:
            raise ValueError("Cycles don't belong to tracker")
        
        # Handle nested field names (e.g., "mood.overall" -> field_name="mood", option="overall")
        if '.' in field_name and not option:
            base_field, sub_field = field_name.split('.', 1)
            field_name = base_field
            option = sub_field
        
        # Detect field type - when option is provided, FieldTypeDetector checks 
        # if that specific option is numeric within the field context
        # This is correct: for "mood.overall", we pass field_name="mood" and option="overall"
        # FieldTypeDetector will check if "overall" is a numeric option within "mood"
        field_type, _ = FieldTypeDetector.detect_field_type(
            field_name, tracker_id, option
        )
        
        # Get data for both cycles
        cycle1_data = ComparisonService._get_cycle_field_data(
            tracker_id, cycle1, field_name, option
        )
        cycle2_data = ComparisonService._get_cycle_field_data(
            tracker_id, cycle2, field_name, option
        )
        
        if not cycle1_data or not cycle2_data:
            return {
                'message': f'Insufficient data for {field_name} in one or both cycles',
                'has_comparison': False
            }
        
        # Store original field name for display (before splitting)
        original_field_name = field_name
        if option:
            original_field_name = f"{field_name}.{option}"
        
        # Compare based on field type
        if field_type == 'numeric':
            comparison = ComparisonService._compare_numeric_field(
                cycle1_data, cycle2_data, original_field_name
            )
        else:
            comparison = ComparisonService._compare_categorical_field(
                cycle1_data, cycle2_data, original_field_name
            )
        
        return {
            'field_name': original_field_name,
            'option': option,
            'field_type': field_type,
            'cycle1': {
                'cycle_id': cycle1.id,
                'data_points': cycle1_data['count']
            },
            'cycle2': {
                'cycle_id': cycle2.id,
                'data_points': cycle2_data['count']
            },
            **comparison,
            'has_comparison': True
        }
    
    @staticmethod
    def compare_cycle_with_average(tracker_id: int, cycle_id: int, months: int = 6) -> Dict[str, Any]:
        """
        Compare a specific cycle with the average of recent cycles.
        
        Args:
            tracker_id: The tracker ID
            cycle_id: Cycle to compare
            months: How many months of history to use for average (default: 6)
        
        Returns:
            Comparison with average metrics
        """
        # Get target cycle
        target_cycle = PeriodCycle.query.get(cycle_id)
        if not target_cycle or target_cycle.tracker_id != tracker_id:
            raise ValueError(f"Cycle {cycle_id} not found or doesn't belong to tracker")
        
        # Get recent cycles for average (excluding target)
        cutoff_date = date.today() - timedelta(days=months * 30)
        recent_cycles = PeriodCycle.query.filter_by(
            tracker_id=tracker_id
        ).filter(
            PeriodCycle.cycle_start_date >= cutoff_date,
            PeriodCycle.id != cycle_id,
            PeriodCycle.cycle_end_date.isnot(None)  # Only completed cycles
        ).all()
        
        if len(recent_cycles) < 2:
            return {
                'message': 'Need at least 2 other cycles to calculate average',
                'cycles_found': len(recent_cycles),
                'has_comparison': False
            }
        
        # Calculate average metrics
        cycle_lengths = [c.cycle_length for c in recent_cycles if c.cycle_length]
        period_lengths = [c.period_length for c in recent_cycles if c.period_length]
        
        avg_cycle_length = np.mean(cycle_lengths) if cycle_lengths else None
        avg_period_length = np.mean(period_lengths) if period_lengths else None
        
        # Compare target with average
        cycle_length_diff = None
        period_length_diff = None
        
        if target_cycle.cycle_length and avg_cycle_length:
            cycle_length_diff = target_cycle.cycle_length - avg_cycle_length
        
        if target_cycle.period_length and avg_period_length:
            period_length_diff = target_cycle.period_length - avg_period_length
        
        return {
            'target_cycle': {
                'cycle_id': target_cycle.id,
                'cycle_length': target_cycle.cycle_length,
                'period_length': target_cycle.period_length,
                'start_date': target_cycle.cycle_start_date.isoformat()
            },
            'average_metrics': {
                'cycle_length': round(avg_cycle_length, 1) if avg_cycle_length else None,
                'period_length': round(avg_period_length, 1) if avg_period_length else None,
                'based_on_cycles': len(recent_cycles)
            },
            'differences': {
                'cycle_length': round(cycle_length_diff, 1) if cycle_length_diff is not None else None,
                'period_length': round(period_length_diff, 1) if period_length_diff is not None else None
            },
            'interpretation': ComparisonService._interpret_cycle_vs_average(
                cycle_length_diff, period_length_diff
            ),
            'has_comparison': True
        }
    
    # ============================================================================
    # TIME PERIOD COMPARISONS (All Trackers)
    # ============================================================================
    
    @staticmethod
    def compare_year_to_year(tracker_id: int, year: int) -> Dict[str, Any]:
        """
        Compare a specific year with the previous year.
        
        Works for all trackers.
        
        Args:
            tracker_id: The tracker ID
            year: Year to compare (e.g., 2024)
        
        Returns:
            Year-over-year comparison
        """
        tracker = Tracker.query.get(tracker_id)
        if not tracker:
            raise ValueError(f"Tracker {tracker_id} not found")
        
        # Get data for target year and previous year
        target_start = date(year, 1, 1)
        target_end = date(year, 12, 31)
        previous_start = date(year - 1, 1, 1)
        previous_end = date(year - 1, 12, 31)
        
        target_entries = TrackingData.query.filter_by(
            tracker_id=tracker_id
        ).filter(
            TrackingData.entry_date >= target_start,
            TrackingData.entry_date <= target_end
        ).all()
        
        previous_entries = TrackingData.query.filter_by(
            tracker_id=tracker_id
        ).filter(
            TrackingData.entry_date >= previous_start,
            TrackingData.entry_date <= previous_end
        ).all()
        
        if not target_entries and not previous_entries:
            return {
                'message': 'No data found for either year',
                'has_comparison': False
            }
        
        # Get tracked fields
        tracked_fields = ComparisonService._get_tracked_fields(tracker_id)
        
        # Compare each field
        field_comparisons = {}
        for field_name in tracked_fields[:15]:  # Limit to 15 fields
            try:
                comparison = ComparisonService._compare_field_between_periods(
                    target_entries, previous_entries, field_name, tracker_id
                )
                if comparison:
                    field_comparisons[field_name] = comparison
            except:
                continue
        
        return {
            'target_year': year,
            'previous_year': year - 1,
            'activity': {
                'target_year': {
                    'entries': len(target_entries),
                    'days_tracked': len(set(e.entry_date for e in target_entries))
                },
                'previous_year': {
                    'entries': len(previous_entries),
                    'days_tracked': len(set(e.entry_date for e in previous_entries))
                }
            },
            'field_comparisons': field_comparisons,
            'insights': ComparisonService._generate_temporal_insights(
                field_comparisons, f"{year} vs {year-1}"
            ),
            'has_comparison': True
        }
    
    @staticmethod
    def compare_month_to_month(tracker_id: int, year: int, month: int) -> Dict[str, Any]:
        """
        Compare a specific month with the same month last year.
        
        Args:
            tracker_id: The tracker ID
            year: Year of target month
            month: Month number (1-12)
        
        Returns:
            Month-over-month comparison
        """
        tracker = Tracker.query.get(tracker_id)
        if not tracker:
            raise ValueError(f"Tracker {tracker_id} not found")
        
        if not 1 <= month <= 12:
            raise ValueError("Month must be between 1 and 12")
        
        # Get data for target month and same month previous year
        _, last_day = calendar.monthrange(year, month)
        target_start = date(year, month, 1)
        target_end = date(year, month, last_day)
        
        _, prev_last_day = calendar.monthrange(year - 1, month)
        previous_start = date(year - 1, month, 1)
        previous_end = date(year - 1, month, prev_last_day)
        
        target_entries = TrackingData.query.filter_by(
            tracker_id=tracker_id
        ).filter(
            TrackingData.entry_date >= target_start,
            TrackingData.entry_date <= target_end
        ).all()
        
        previous_entries = TrackingData.query.filter_by(
            tracker_id=tracker_id
        ).filter(
            TrackingData.entry_date >= previous_start,
            TrackingData.entry_date <= previous_end
        ).all()
        
        if not target_entries and not previous_entries:
            return {
                'message': 'No data found for either month',
                'has_comparison': False
            }
        
        # Get tracked fields
        tracked_fields = ComparisonService._get_tracked_fields(tracker_id)
        
        # Compare each field
        field_comparisons = {}
        for field_name in tracked_fields[:15]:
            try:
                comparison = ComparisonService._compare_field_between_periods(
                    target_entries, previous_entries, field_name, tracker_id
                )
                if comparison:
                    field_comparisons[field_name] = comparison
            except:
                continue
        
        month_name = calendar.month_name[month]
        
        return {
            'target_period': f"{month_name} {year}",
            'previous_period': f"{month_name} {year - 1}",
            'activity': {
                'target': {
                    'entries': len(target_entries),
                    'days_tracked': len(set(e.entry_date for e in target_entries))
                },
                'previous': {
                    'entries': len(previous_entries),
                    'days_tracked': len(set(e.entry_date for e in previous_entries))
                }
            },
            'field_comparisons': field_comparisons,
            'insights': ComparisonService._generate_temporal_insights(
                field_comparisons, f"{month_name} {year} vs {month_name} {year-1}"
            ),
            'has_comparison': True
        }
    
    @staticmethod
    def compare_month_to_average(tracker_id: int, year: int, month: int, history_months: int = 12) -> Dict[str, Any]:
        """
        Compare a specific month with the average of recent months.
        
        Args:
            tracker_id: The tracker ID
            year: Year of target month
            month: Month number (1-12)
            history_months: How many months to use for average (default: 12)
        
        Returns:
            Month vs average comparison
        """
        tracker = Tracker.query.get(tracker_id)
        if not tracker:
            raise ValueError(f"Tracker {tracker_id} not found")
        
        # Get target month data
        _, last_day = calendar.monthrange(year, month)
        target_start = date(year, month, 1)
        target_end = date(year, month, last_day)
        
        target_entries = TrackingData.query.filter_by(
            tracker_id=tracker_id
        ).filter(
            TrackingData.entry_date >= target_start,
            TrackingData.entry_date <= target_end
        ).all()
        
        # Get historical months for average (excluding target month)
        cutoff_date = target_start - timedelta(days=history_months * 30)
        historical_entries = TrackingData.query.filter_by(
            tracker_id=tracker_id
        ).filter(
            TrackingData.entry_date >= cutoff_date,
            TrackingData.entry_date < target_start
        ).all()
        
        if not target_entries or not historical_entries:
            return {
                'message': 'Insufficient data for comparison',
                'has_comparison': False
            }
        
        # Get tracked fields
        tracked_fields = ComparisonService._get_tracked_fields(tracker_id)
        
        # Compare each field
        field_comparisons = {}
        for field_name in tracked_fields[:15]:
            try:
                comparison = ComparisonService._compare_field_with_average(
                    target_entries, historical_entries, field_name, tracker_id
                )
                if comparison:
                    field_comparisons[field_name] = comparison
            except:
                continue
        
        month_name = calendar.month_name[month]
        
        return {
            'target_period': f"{month_name} {year}",
            'baseline': f"Average of previous {history_months} months",
            'field_comparisons': field_comparisons,
            'insights': ComparisonService._generate_temporal_insights(
                field_comparisons, f"{month_name} {year} vs average"
            ),
            'has_comparison': True
        }
    
    @staticmethod
    def compare_week_to_week(tracker_id: int, year: int, week: int) -> Dict[str, Any]:
        """
        Compare a specific week with the same week last year.
        
        Args:
            tracker_id: The tracker ID
            year: Year of target week
            week: ISO week number (1-53)
        
        Returns:
            Week-over-week comparison
        """
        tracker = Tracker.query.get(tracker_id)
        if not tracker:
            raise ValueError(f"Tracker {tracker_id} not found")
        
        # Get date range for target week (ISO week)
        target_start = datetime.strptime(f'{year}-W{week:02d}-1', "%Y-W%W-%w").date()
        target_end = target_start + timedelta(days=6)
        
        # Get same week previous year
        previous_start = datetime.strptime(f'{year-1}-W{week:02d}-1', "%Y-W%W-%w").date()
        previous_end = previous_start + timedelta(days=6)
        
        target_entries = TrackingData.query.filter_by(
            tracker_id=tracker_id
        ).filter(
            TrackingData.entry_date >= target_start,
            TrackingData.entry_date <= target_end
        ).all()
        
        previous_entries = TrackingData.query.filter_by(
            tracker_id=tracker_id
        ).filter(
            TrackingData.entry_date >= previous_start,
            TrackingData.entry_date <= previous_end
        ).all()
        
        if not target_entries and not previous_entries:
            return {
                'message': 'No data found for either week',
                'has_comparison': False
            }
        
        # Get tracked fields
        tracked_fields = ComparisonService._get_tracked_fields(tracker_id)
        
        # Compare each field
        field_comparisons = {}
        for field_name in tracked_fields[:15]:
            try:
                comparison = ComparisonService._compare_field_between_periods(
                    target_entries, previous_entries, field_name, tracker_id
                )
                if comparison:
                    field_comparisons[field_name] = comparison
            except:
                continue
        
        return {
            'target_period': f"Week {week}, {year}",
            'previous_period': f"Week {week}, {year - 1}",
            'date_ranges': {
                'target': f"{target_start.isoformat()} to {target_end.isoformat()}",
                'previous': f"{previous_start.isoformat()} to {previous_end.isoformat()}"
            },
            'activity': {
                'target': {
                    'entries': len(target_entries),
                    'days_tracked': len(set(e.entry_date for e in target_entries))
                },
                'previous': {
                    'entries': len(previous_entries),
                    'days_tracked': len(set(e.entry_date for e in previous_entries))
                }
            },
            'field_comparisons': field_comparisons,
            'insights': ComparisonService._generate_temporal_insights(
                field_comparisons, f"Week {week} comparison"
            ),
            'has_comparison': True
        }
    
    @staticmethod
    def compare_week_to_average(tracker_id: int, year: int, week: int, history_weeks: int = 12) -> Dict[str, Any]:
        """
        Compare a specific week with the average of recent weeks.
        
        Args:
            tracker_id: The tracker ID
            year: Year of target week
            week: ISO week number (1-53)
            history_weeks: How many weeks to use for average (default: 12)
        
        Returns:
            Week vs average comparison
        """
        tracker = Tracker.query.get(tracker_id)
        if not tracker:
            raise ValueError(f"Tracker {tracker_id} not found")
        
        # Get target week data
        target_start = datetime.strptime(f'{year}-W{week:02d}-1', "%Y-W%W-%w").date()
        target_end = target_start + timedelta(days=6)
        
        target_entries = TrackingData.query.filter_by(
            tracker_id=tracker_id
        ).filter(
            TrackingData.entry_date >= target_start,
            TrackingData.entry_date <= target_end
        ).all()
        
        # Get historical weeks for average
        cutoff_date = target_start - timedelta(weeks=history_weeks)
        historical_entries = TrackingData.query.filter_by(
            tracker_id=tracker_id
        ).filter(
            TrackingData.entry_date >= cutoff_date,
            TrackingData.entry_date < target_start
        ).all()
        
        if not target_entries or not historical_entries:
            return {
                'message': 'Insufficient data for comparison',
                'has_comparison': False
            }
        
        # Get tracked fields
        tracked_fields = ComparisonService._get_tracked_fields(tracker_id)
        
        # Compare each field
        field_comparisons = {}
        for field_name in tracked_fields[:15]:
            try:
                comparison = ComparisonService._compare_field_with_average(
                    target_entries, historical_entries, field_name, tracker_id
                )
                if comparison:
                    field_comparisons[field_name] = comparison
            except:
                continue
        
        return {
            'target_period': f"Week {week}, {year}",
            'baseline': f"Average of previous {history_weeks} weeks",
            'field_comparisons': field_comparisons,
            'insights': ComparisonService._generate_temporal_insights(
                field_comparisons, f"Week {week} vs average"
            ),
            'has_comparison': True
        }
    
    # ============================================================================
    # HELPER METHODS
    # ============================================================================
    
    @staticmethod
    def _get_cycle_number(tracker_id: int, cycle: PeriodCycle) -> int:
        """Get the cycle number (position in history)."""
        earlier_cycles = PeriodCycle.query.filter_by(
            tracker_id=tracker_id
        ).filter(
            PeriodCycle.cycle_start_date < cycle.cycle_start_date
        ).count()
        return earlier_cycles + 1
    
    @staticmethod
    def _compare_cycle_metrics(
        target: PeriodCycle,
        previous: PeriodCycle
    ) -> Dict[str, Any]:
        """Compare basic cycle metrics between two cycles."""
        metrics = {}
        
        # Cycle length comparison
        if target.cycle_length and previous.cycle_length:
            length_diff = target.cycle_length - previous.cycle_length
            metrics['cycle_length'] = {
                'target': target.cycle_length,
                'previous': previous.cycle_length,
                'difference': length_diff,
                'change': 'longer' if length_diff > 0 else 'shorter' if length_diff < 0 else 'same'
            }
        
        # Period length comparison
        if target.period_length and previous.period_length:
            period_diff = target.period_length - previous.period_length
            metrics['period_length'] = {
                'target': target.period_length,
                'previous': previous.period_length,
                'difference': period_diff,
                'change': 'longer' if period_diff > 0 else 'shorter' if period_diff < 0 else 'same'
            }
        
        return metrics
    
    @staticmethod
    def _get_tracked_fields(tracker_id: int) -> List[str]:
        """Get list of fields that have been tracked for this tracker."""
        # Get all entries
        entries = TrackingData.query.filter_by(tracker_id=tracker_id).limit(100).all()
        
        # Helper function to flatten nested fields
        def flatten_fields(data: Dict[str, Any], prefix: str = "") -> List[str]:
            """Recursively flatten nested field structures."""
            fields = []
            for key, value in data.items():
                if prefix:
                    field_path = f"{prefix}.{key}"
                else:
                    field_path = key
                
                # If value is a dict, recursively flatten it
                if isinstance(value, dict) and value:
                    fields.extend(flatten_fields(value, field_path))
                else:
                    # Only count if value is not None
                    if value is not None:
                        fields.append(field_path)
            return fields
        
        # Count how many entries each field (including nested) appears in
        field_counts = defaultdict(int)
        for entry in entries:
            if entry.data:
                # Flatten nested structure to get all field paths
                flattened = flatten_fields(entry.data)
                for field_path in flattened:
                    field_counts[field_path] += 1
        
        # Sort by count (descending) and get top 10
        sorted_fields = sorted(field_counts.items(), key=lambda x: x[1], reverse=True)
        main_fields = [field_name for field_name, count in sorted_fields[:10]]
        
        # If we have less than 10 fields, return all available fields
        if len(main_fields) < 10:
            # Return all unique fields (flattened)
            all_fields = set()
            for entry in entries:
                if entry.data:
                    all_fields.update(flatten_fields(entry.data))
            return sorted(list(all_fields))
        
        return main_fields
    
    @staticmethod
    def _get_cycle_field_data(
        tracker_id: int,
        cycle: PeriodCycle,
        field_name: str,
        option: Optional[str]
    ) -> Optional[Dict]:
        """Extract field data for a specific cycle."""
        cycle_end = cycle.cycle_end_date or cycle.predicted_next_period_date or date.today()
        
        entries = TrackingData.query.filter_by(
            tracker_id=tracker_id
        ).filter(
            TrackingData.entry_date >= cycle.cycle_start_date,
            TrackingData.entry_date <= cycle_end
        ).all()
        
        extracted = AnalyticsDataExtractor.extract_field_values(
            entries, field_name, option, tracker_id
        )
        
        if not extracted:
            return None
        
        values = [item['value'] for item in extracted if item['value'] is not None]
        
        if not values:
            return None
        
        # Detect field type BEFORE calculating stats
        field_type, _ = FieldTypeDetector.detect_field_type(
            field_name, tracker_id, option
        )
        
        # Convert values to appropriate type based on field type
        if field_type == 'numeric':
            # Ensure all values are numeric (convert strings to floats)
            numeric_values = []
            for v in values:
                if isinstance(v, (int, float)):
                    numeric_values.append(float(v))
                elif isinstance(v, str):
                    try:
                        numeric_values.append(float(v))
                    except (ValueError, TypeError):
                        continue  # Skip non-numeric strings
            if numeric_values:
                stats = AnalyticsStatsCalculator.calculate_numeric_stats(numeric_values)
                stats['count'] = len(numeric_values)
                return stats
            else:
                # No valid numeric values, treat as categorical
                stats = AnalyticsStatsCalculator.calculate_categorical_stats(values)
                stats['count'] = len(values)
                return stats
        else:
            stats = AnalyticsStatsCalculator.calculate_categorical_stats(values)
            stats['count'] = len(values)
            return stats
    
    @staticmethod
    def _compare_numeric_field(
        cycle1_data: Dict,
        cycle2_data: Dict,
        field_name: str
    ) -> Dict[str, Any]:
        """Compare numeric field between two cycles."""
        avg1 = cycle1_data.get('mean', 0)
        avg2 = cycle2_data.get('mean', 0)
        
        if avg2 == 0:
            return {
                'cycle1_average': round(avg1, 2),
                'cycle2_average': round(avg2, 2),
                'difference': round(avg1 - avg2, 2),
                'percent_change': 0,
                'change_direction': 'unchanged',
                'is_significant': False,
                'summary': f"{field_name}: No comparison possible (previous cycle had no data)"
            }
        
        difference = avg1 - avg2
        percent_change = (difference / avg2 * 100) if avg2 != 0 else 0
        
        if difference > 0:
            direction = 'increased'
        elif difference < 0:
            direction = 'decreased'
        else:
            direction = 'unchanged'
        
        is_significant = abs(percent_change) > 15 or abs(difference) > 1
        
        return {
            'cycle1_average': round(avg1, 2),
            'cycle2_average': round(avg2, 2),
            'difference': round(difference, 2),
            'percent_change': round(percent_change, 1),
            'change_direction': direction,
            'is_significant': is_significant,
            'summary': f"{field_name} {direction} by {abs(percent_change):.1f}% ({abs(difference):.1f} units)"
        }
    
    @staticmethod
    def _compare_categorical_field(
        cycle1_data: Dict,
        cycle2_data: Dict,
        field_name: str
    ) -> Dict[str, Any]:
        """Compare categorical field between two cycles."""
        mode1 = cycle1_data.get('most_common', {}).get('value') if isinstance(cycle1_data.get('most_common'), dict) else cycle1_data.get('most_common')
        mode2 = cycle2_data.get('most_common', {}).get('value') if isinstance(cycle2_data.get('most_common'), dict) else cycle2_data.get('most_common')
        
        changed = mode1 != mode2
        
        # For categorical, a change is considered significant
        is_significant = changed
        
        return {
            'cycle1_most_common': mode1,
            'cycle2_most_common': mode2,
            'changed': changed,
            'change_direction': 'changed' if changed else 'same',
            'is_significant': is_significant,
            'percent_change': None,  # Not applicable for categorical
            'difference': 1 if changed else 0,  # Use 1 for changed, 0 for same
            'summary': f"{field_name}: '{mode1}' (current) vs '{mode2}' (previous)"
        }
    
    @staticmethod
    def _compare_field_between_periods(
        target_entries: List[TrackingData],
        previous_entries: List[TrackingData],
        field_name: str,
        tracker_id: int,
        option: Optional[str] = None
    ) -> Optional[Dict[str, Any]]:
        """Compare a field between two time periods."""
        # Extract data for both periods
        target_extracted = AnalyticsDataExtractor.extract_field_values(
            target_entries, field_name, option, tracker_id
        )
        previous_extracted = AnalyticsDataExtractor.extract_field_values(
            previous_entries, field_name, option, tracker_id
        )
        
        if not target_extracted or not previous_extracted:
            return None
        
        target_values = [item['value'] for item in target_extracted if item['value'] is not None]
        previous_values = [item['value'] for item in previous_extracted if item['value'] is not None]
        
        if not target_values or not previous_values:
            return None
        
        # Detect field type
        field_type, _ = FieldTypeDetector.detect_field_type(field_name, tracker_id, option)
        
        if field_type == 'numeric':
            target_stats = AnalyticsStatsCalculator.calculate_numeric_stats(target_values)
            previous_stats = AnalyticsStatsCalculator.calculate_numeric_stats(previous_values)
            
            avg1 = target_stats.get('mean', 0)
            avg2 = previous_stats.get('mean', 0)
            
            if avg2 == 0:
                return None
            
            difference = avg1 - avg2
            percent_change = (difference / avg2 * 100) if avg2 != 0 else 0
            
            return {
                'target_average': round(avg1, 2),
                'previous_average': round(avg2, 2),
                'difference': round(difference, 2),
                'percent_change': round(percent_change, 1),
                'change_direction': 'increased' if difference > 0 else 'decreased' if difference < 0 else 'unchanged'
            }
        else:
            target_stats = AnalyticsStatsCalculator.calculate_categorical_stats(target_values)
            previous_stats = AnalyticsStatsCalculator.calculate_categorical_stats(previous_values)
            
            mode1 = target_stats.get('most_common', {}).get('value') if isinstance(target_stats.get('most_common'), dict) else target_stats.get('most_common')
            mode2 = previous_stats.get('most_common', {}).get('value') if isinstance(previous_stats.get('most_common'), dict) else previous_stats.get('most_common')
            
            return {
                'target_most_common': mode1,
                'previous_most_common': mode2,
                'changed': mode1 != mode2,
                'change_direction': 'changed' if mode1 != mode2 else 'same'
            }
    
    @staticmethod
    def _compare_field_with_average(
        target_entries: List[TrackingData],
        historical_entries: List[TrackingData],
        field_name: str,
        tracker_id: int,
        option: Optional[str] = None
    ) -> Optional[Dict[str, Any]]:
        """Compare a field with historical average."""
        # Extract target data
        target_extracted = AnalyticsDataExtractor.extract_field_values(
            target_entries, field_name, option, tracker_id
        )
        
        if not target_extracted:
            return None
        
        target_values = [item['value'] for item in target_extracted if item['value'] is not None]
        
        if not target_values:
            return None
        
        # Extract historical data
        historical_extracted = AnalyticsDataExtractor.extract_field_values(
            historical_entries, field_name, option, tracker_id
        )
        
        if not historical_extracted:
            return None
        
        historical_values = [item['value'] for item in historical_extracted if item['value'] is not None]
        
        if not historical_values:
            return None
        
        # Detect field type
        field_type, _ = FieldTypeDetector.detect_field_type(field_name, tracker_id, option)
        
        if field_type == 'numeric':
            target_stats = AnalyticsStatsCalculator.calculate_numeric_stats(target_values)
            historical_stats = AnalyticsStatsCalculator.calculate_numeric_stats(historical_values)
            
            avg1 = target_stats.get('mean', 0)
            avg2 = historical_stats.get('mean', 0)
            
            if avg2 == 0:
                return None
            
            difference = avg1 - avg2
            percent_change = (difference / avg2 * 100) if avg2 != 0 else 0
            
            return {
                'target_average': round(avg1, 2),
                'historical_average': round(avg2, 2),
                'difference': round(difference, 2),
                'percent_change': round(percent_change, 1),
                'change_direction': 'above_average' if difference > 0 else 'below_average' if difference < 0 else 'at_average'
            }
        else:
            target_stats = AnalyticsStatsCalculator.calculate_categorical_stats(target_values)
            historical_stats = AnalyticsStatsCalculator.calculate_categorical_stats(historical_values)
            
            mode1 = target_stats.get('most_common', {}).get('value') if isinstance(target_stats.get('most_common'), dict) else target_stats.get('most_common')
            mode2 = historical_stats.get('most_common', {}).get('value') if isinstance(historical_stats.get('most_common'), dict) else historical_stats.get('most_common')
            
            return {
                'target_most_common': mode1,
                'historical_most_common': mode2,
                'changed': mode1 != mode2,
                'change_direction': 'different' if mode1 != mode2 else 'same'
            }
    
    @staticmethod
    def _generate_cycle_comparison_insights(
        cycle_metrics: Dict[str, Any],
        symptom_comparisons: Dict[str, Any],
        target_cycle: PeriodCycle,
        previous_cycle: PeriodCycle
    ) -> List[str]:
        """Generate human-readable insights from cycle comparison."""
        insights = []
        
        # Cycle length insights
        if 'cycle_length' in cycle_metrics:
            cl = cycle_metrics['cycle_length']
            if cl['difference'] != 0:
                insights.append(
                    f"Cycle was {abs(cl['difference'])} days {cl['change']} than previous cycle"
                )
        
        # Period length insights
        if 'period_length' in cycle_metrics:
            pl = cycle_metrics['period_length']
            if pl['difference'] != 0:
                insights.append(
                    f"Period was {abs(pl['difference'])} days {pl['change']} than previous cycle"
                )
        
        # Symptom insights
        significant_changes = [
            name for name, comp in symptom_comparisons.items()
            # Use the same flag key we set when building comparisons
            if comp.get('is_significant', False)
        ]
        
        if significant_changes:
            insights.append(
                f"Notable changes in: {', '.join(significant_changes[:3])}"
            )
        
        return insights
    
    @staticmethod
    def _calculate_overall_change(
        cycle_metrics: Dict[str, Any],
        symptom_comparisons: Dict[str, Any]
    ) -> str:
        """Calculate overall change direction."""
        improvements = 0
        declines = 0
        
        # Count symptom changes
        for comp in symptom_comparisons.values():
            direction = comp.get('change_direction', '')
            if direction == 'increased':
                # Context-dependent: could be good or bad
                pass
            elif direction == 'decreased':
                # Context-dependent: could be good or bad
                pass
        
        # Simple heuristic: more longer cycles and longer periods might indicate issues
        if 'cycle_length' in cycle_metrics:
            if cycle_metrics['cycle_length']['change'] == 'longer':
                declines += 1
            elif cycle_metrics['cycle_length']['change'] == 'shorter':
                improvements += 1
        
        if improvements > declines:
            return 'improving'
        elif declines > improvements:
            return 'worsening'
        else:
            return 'stable'

    @staticmethod
    def _interpret_cycle_vs_average(
        cycle_length_diff: Optional[float],
        period_length_diff: Optional[float]
    ) -> List[str]:
        """Interpret cycle vs average differences."""
        interpretations = []
        
        if cycle_length_diff is not None:
            if abs(cycle_length_diff) > 7:
                interpretations.append(
                    f"Cycle length is {'significantly longer' if cycle_length_diff > 0 else 'significantly shorter'} than average"
                )
            elif abs(cycle_length_diff) > 3:
                interpretations.append(
                    f"Cycle length is {'somewhat longer' if cycle_length_diff > 0 else 'somewhat shorter'} than average"
                )
        
        if period_length_diff is not None:
            if abs(period_length_diff) > 2:
                interpretations.append(
                    f"Period length is {'longer' if period_length_diff > 0 else 'shorter'} than average"
                )
        
        return interpretations
    
    @staticmethod
    def _generate_temporal_insights(
        field_comparisons: Dict[str, Any],
        period_label: str
    ) -> List[str]:
        """Generate insights for temporal comparisons."""
        insights = []
        
        significant_changes = []
        for field_name, comp in field_comparisons.items():
            if isinstance(comp, dict):
                percent_change = comp.get('percent_change', 0)
                if abs(percent_change) > 20:
                    significant_changes.append(f"{field_name} ({percent_change:+.1f}%)")
        
        if significant_changes:
            insights.append(
                f"Significant changes in {period_label}: {', '.join(significant_changes[:5])}"
            )
        
        return insights
    