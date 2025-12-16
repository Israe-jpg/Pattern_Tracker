"""
Universal comparison service for all trackers.

Architecture:
- Period providers define data sources (cycles, date ranges)
- Comparators perform comparisons (field-level, metrics)
- Formatters generate insights and summaries

Supports:
- Period trackers: Cycle-to-cycle comparisons
- Regular trackers: Time period comparisons
- Field-level comparisons with automatic type detection
- Baseline and average comparisons
"""

from typing import Dict, Any, List, Optional, Tuple, Protocol
from datetime import date, timedelta, datetime
from collections import defaultdict
from enum import Enum
import numpy as np
import calendar
import calendar

from app.models.tracker import Tracker
from app.models.period_cycle import PeriodCycle
from app.models.tracking_data import TrackingData
from app.models.tracker_category import TrackerCategory
from app.services.analytics_base import (
    AnalyticsDataExtractor,
    AnalyticsStatsCalculator,
    FieldTypeDetector
)
from app.services.period_cycle_service import PeriodCycleService


# ============================================================================
# ENUMS & PROTOCOLS
# ============================================================================

class ComparisonType(Enum):
    """Types of comparisons supported."""
    CYCLE_TO_CYCLE = "cycle_to_cycle"
    CYCLE_TO_AVERAGE = "cycle_to_average"
    PERIOD_TO_PERIOD = "period_to_period"
    PERIOD_TO_BASELINE = "period_to_baseline"
    CUSTOM_RANGE = "custom_range"


class PeriodProvider(Protocol):
    """Protocol for providing data periods to compare."""
    
    def get_target_entries(self) -> List[TrackingData]:
        """Get entries for target period."""
        ...
    
    def get_comparison_entries(self) -> List[TrackingData]:
        """Get entries for comparison period."""
        ...
    
    def get_metadata(self) -> Dict[str, Any]:
        """Get metadata about the periods."""
        ...


# ============================================================================
# PERIOD PROVIDERS (Data Sources)
# ============================================================================

class DateRangePeriodProvider:
    """Provides data for date range comparisons."""
    
    def __init__(
        self,
        tracker_id: int,
        target_start: date,
        target_end: date,
        comparison_start: date,
        comparison_end: date
    ):
        self.tracker_id = tracker_id
        self.target_start = target_start
        self.target_end = target_end
        self.comparison_start = comparison_start
        self.comparison_end = comparison_end
    
    def get_target_entries(self) -> List[TrackingData]:
        return TrackingData.query.filter_by(
            tracker_id=self.tracker_id
        ).filter(
            TrackingData.entry_date >= self.target_start,
            TrackingData.entry_date <= self.target_end
        ).all()
    
    def get_comparison_entries(self) -> List[TrackingData]:
        return TrackingData.query.filter_by(
            tracker_id=self.tracker_id
        ).filter(
            TrackingData.entry_date >= self.comparison_start,
            TrackingData.entry_date <= self.comparison_end
        ).all()
    
    def get_metadata(self) -> Dict[str, Any]:
        target_entries = self.get_target_entries()
        comparison_entries = self.get_comparison_entries()
        
        return {
            'target_period': {
                'start_date': self.target_start.isoformat(),
                'end_date': self.target_end.isoformat(),
                'entries': len(target_entries),
                'days_tracked': len(set(e.entry_date for e in target_entries))
            },
            'comparison_period': {
                'start_date': self.comparison_start.isoformat(),
                'end_date': self.comparison_end.isoformat(),
                'entries': len(comparison_entries),
                'days_tracked': len(set(e.entry_date for e in comparison_entries))
            }
        }


class CyclePeriodProvider:
    """Provides data for cycle-based comparisons."""
    
    def __init__(self, tracker_id: int, target_cycle_id: int, comparison_cycle_id: int):
        self.tracker_id = tracker_id
        self.target_cycle = PeriodCycle.query.get(target_cycle_id)
        self.comparison_cycle = PeriodCycle.query.get(comparison_cycle_id)
        
        if not self.target_cycle or not self.comparison_cycle:
            raise ValueError("Invalid cycle IDs")
    
    def get_target_entries(self) -> List[TrackingData]:
        cycle_end = self.target_cycle.cycle_end_date or self.target_cycle.predicted_next_period_date or date.today()
        return TrackingData.query.filter_by(
            tracker_id=self.tracker_id
        ).filter(
            TrackingData.entry_date >= self.target_cycle.cycle_start_date,
            TrackingData.entry_date <= cycle_end
        ).all()
    
    def get_comparison_entries(self) -> List[TrackingData]:
        cycle_end = self.comparison_cycle.cycle_end_date or self.comparison_cycle.predicted_next_period_date or date.today()
        return TrackingData.query.filter_by(
            tracker_id=self.tracker_id
        ).filter(
            TrackingData.entry_date >= self.comparison_cycle.cycle_start_date,
            TrackingData.entry_date <= cycle_end
        ).all()
    
    def get_metadata(self) -> Dict[str, Any]:
        return {
            'target_cycle': {
                'cycle_id': self.target_cycle.id,
                'start_date': self.target_cycle.cycle_start_date.isoformat(),
                'end_date': self.target_cycle.cycle_end_date.isoformat() if self.target_cycle.cycle_end_date else None,
                'cycle_length': self.target_cycle.cycle_length,
                'period_length': self.target_cycle.period_length
            },
            'comparison_cycle': {
                'cycle_id': self.comparison_cycle.id,
                'start_date': self.comparison_cycle.cycle_start_date.isoformat(),
                'end_date': self.comparison_cycle.cycle_end_date.isoformat() if self.comparison_cycle.cycle_end_date else None,
                'cycle_length': self.comparison_cycle.cycle_length,
                'period_length': self.comparison_cycle.period_length
            }
        }


class BaselinePeriodProvider:
    """Provides data for baseline (historical average) comparisons."""
    
    def __init__(
        self,
        tracker_id: int,
        target_start: date,
        target_end: date,
        baseline_months: int = 6
    ):
        self.tracker_id = tracker_id
        self.target_start = target_start
        self.target_end = target_end
        self.baseline_start = target_start - timedelta(days=baseline_months * 30)
        self.baseline_end = target_start - timedelta(days=1)
    
    def get_target_entries(self) -> List[TrackingData]:
        return TrackingData.query.filter_by(
            tracker_id=self.tracker_id
        ).filter(
            TrackingData.entry_date >= self.target_start,
            TrackingData.entry_date <= self.target_end
        ).all()
    
    def get_comparison_entries(self) -> List[TrackingData]:
        return TrackingData.query.filter_by(
            tracker_id=self.tracker_id
        ).filter(
            TrackingData.entry_date >= self.baseline_start,
            TrackingData.entry_date <= self.baseline_end
        ).all()
    
    def get_metadata(self) -> Dict[str, Any]:
        target_entries = self.get_target_entries()
        baseline_entries = self.get_comparison_entries()
        
        return {
            'target_period': {
                'start_date': self.target_start.isoformat(),
                'end_date': self.target_end.isoformat(),
                'entries': len(target_entries),
                'days_tracked': len(set(e.entry_date for e in target_entries))
            },
            'baseline_period': {
                'start_date': self.baseline_start.isoformat(),
                'end_date': self.baseline_end.isoformat(),
                'entries': len(baseline_entries),
                'days_tracked': len(set(e.entry_date for e in baseline_entries))
            }
        }


# ============================================================================
# FIELD COMPARATOR (Core Comparison Logic)
# ============================================================================

class FieldComparator:
    """Handles field-level comparisons with automatic type detection."""
    
    @staticmethod
    def compare_field(
        target_entries: List[TrackingData],
        comparison_entries: List[TrackingData],
        field_name: str,
        tracker_id: int,
        option: Optional[str] = None
    ) -> Optional[Dict[str, Any]]:
        """
        Compare a field between two sets of entries.
        
        Returns comparison dict or None if insufficient data.
        """
        # Extract field values
        target_extracted = AnalyticsDataExtractor.extract_field_values(
            target_entries, field_name, option, tracker_id
        )
        comparison_extracted = AnalyticsDataExtractor.extract_field_values(
            comparison_entries, field_name, option, tracker_id
        )
        
        if not target_extracted or not comparison_extracted:
            return None
        
        target_values = [item['value'] for item in target_extracted if item['value'] is not None]
        comparison_values = [item['value'] for item in comparison_extracted if item['value'] is not None]
        
        if not target_values or not comparison_values:
            return None
        
        # Detect field type
        field_type, _ = FieldTypeDetector.detect_field_type(field_name, tracker_id, option)
        
        # Compare based on type
        if field_type == 'numeric':
            return FieldComparator._compare_numeric(target_values, comparison_values, field_name)
        else:
            return FieldComparator._compare_categorical(target_values, comparison_values, field_name)
    
    @staticmethod
    def _compare_numeric(
        target_values: List[float],
        comparison_values: List[float],
        field_name: str
    ) -> Dict[str, Any]:
        """Compare numeric field values."""
        target_stats = AnalyticsStatsCalculator.calculate_numeric_stats(target_values)
        comparison_stats = AnalyticsStatsCalculator.calculate_numeric_stats(comparison_values)
        
        target_mean = target_stats.get('mean', 0)
        comparison_mean = comparison_stats.get('mean', 0)
        
        if comparison_mean == 0:
            difference = target_mean - comparison_mean
            return {
                'target_average': round(target_mean, 2),
                'comparison_average': round(comparison_mean, 2),
                'difference': round(difference, 2),
                'percent_change': None,
                'change_direction': 'unchanged',
                'is_significant': False
            }
        
        difference = target_mean - comparison_mean
        percent_change = (difference / comparison_mean * 100)
        
        # Determine direction
        if difference > 0:
            direction = 'increased'
        elif difference < 0:
            direction = 'decreased'
        else:
            direction = 'unchanged'
        
        # Determine significance
        is_significant = abs(percent_change) > 15 or abs(difference) > 1
        
        return {
            'target_average': round(target_mean, 2),
            'comparison_average': round(comparison_mean, 2),
            'difference': round(difference, 2),
            'percent_change': round(percent_change, 1),
            'change_direction': direction,
            'is_significant': is_significant
        }
    
    @staticmethod
    def _compare_categorical(
        target_values: List[Any],
        comparison_values: List[Any],
        field_name: str
    ) -> Dict[str, Any]:
        """Compare categorical field values."""
        target_stats = AnalyticsStatsCalculator.calculate_categorical_stats(target_values)
        comparison_stats = AnalyticsStatsCalculator.calculate_categorical_stats(comparison_values)
        
        target_mode = target_stats.get('most_common', {})
        comparison_mode = comparison_stats.get('most_common', {})
        
        # Extract values
        if isinstance(target_mode, dict):
            target_val = target_mode.get('value')
        else:
            target_val = target_mode
        
        if isinstance(comparison_mode, dict):
            comparison_val = comparison_mode.get('value')
        else:
            comparison_val = comparison_mode
        
        changed = target_val != comparison_val
        
        return {
            'target_most_common': target_val,
            'comparison_most_common': comparison_val,
            'changed': changed,
            'change_direction': 'changed' if changed else 'same',
            'is_significant': changed,
            'percent_change': None,
            'difference': 1 if changed else 0
        }


# ============================================================================
# INSIGHT GENERATOR (Formatting & Summaries)
# ============================================================================

class InsightGenerator:
    """Generates human-readable insights from comparisons."""
    
    @staticmethod
    def generate_field_insights(
        field_comparisons: Dict[str, Any],
        threshold: float = 20.0
    ) -> List[str]:
        """Generate insights for field comparisons."""
        insights = []
        significant_changes = []
        
        for field_name, comp in field_comparisons.items():
            if not isinstance(comp, dict):
                continue
            
            # Check if field is significant
            if not comp.get('is_significant', False):
                continue
            
            percent_change = comp.get('percent_change')
            if percent_change is not None:
                # Numeric field with percent change
                if abs(percent_change) > threshold:
                    significant_changes.append(f"{field_name} ({percent_change:+.1f}%)")
            else:
                # Categorical field or numeric without percent change
                change_direction = comp.get('change_direction', '')
                if change_direction in ['changed', 'increased', 'decreased']:
                    significant_changes.append(f"{field_name} ({change_direction})")
        
        if significant_changes:
            insights.append(f"Significant changes: {', '.join(significant_changes[:5])}")
        else:
            insights.append("No significant changes detected")
        
        return insights
    
    @staticmethod
    def generate_summary_stats(
        field_comparisons: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Generate summary statistics from field comparisons."""
        total_fields = len(field_comparisons)
        significant_count = sum(
            1 for comp in field_comparisons.values()
            if isinstance(comp, dict) and comp.get('is_significant', False)
        )
        
        improved = sum(
            1 for comp in field_comparisons.values()
            if isinstance(comp, dict) and 
            comp.get('change_direction') in ['increased', 'above_average']
        )
        
        declined = sum(
            1 for comp in field_comparisons.values()
            if isinstance(comp, dict) and 
            comp.get('change_direction') in ['decreased', 'below_average']
        )
        
        # Stable = fields that are NOT significant
        # This correctly handles categorical fields with change_direction='changed'
        fields_stable = total_fields - significant_count
        
        return {
            'total_fields': total_fields,
            'significant_changes': significant_count,
            'fields_increased': improved,
            'fields_decreased': declined,
            'fields_stable': fields_stable
        }
    
    @staticmethod
    def get_top_changes(
        field_comparisons: Dict[str, Any],
        limit: int = 5
    ) -> Dict[str, Any]:
        """Get top N most significant changes."""
        # Filter significant
        significant = {
            name: comp for name, comp in field_comparisons.items()
            if isinstance(comp, dict) and comp.get('is_significant', False)
        }
        
        # Sort by magnitude
        # Note: Categorical fields use difference (0 or 1), so we normalize them
        # to compete with numeric percent_change values (typically 15-100+)
        # A categorical change (difference=1) is treated as equivalent to ~30% change
        sorted_changes = sorted(
            significant.items(),
            key=lambda x: (
                abs(x[1].get('percent_change', 0)) if x[1].get('percent_change') is not None 
                else abs(x[1].get('difference', 0)) * 30  # Normalize categorical: 1 * 30 = 30%
            ),
            reverse=True
        )
        
        return dict(sorted_changes[:limit])


# ============================================================================
# MAIN COMPARISON SERVICE (Public API)
# ============================================================================

class ComparisonService:
    """
    Universal comparison service.
    
    Provides a unified interface for all comparison types using
    the provider pattern for flexibility and reusability.
    """
    
    # ========================================================================
    # UNIFIED COMPARISON METHOD
    # ========================================================================
    
    @staticmethod
    def compare(
        provider: PeriodProvider,
        tracker_id: int,
        field_names: Optional[List[str]] = None,
        max_fields: int = 15
    ) -> Dict[str, Any]:
        """
        Universal comparison method.
        
        Args:
            provider: Period provider (defines what to compare)
            tracker_id: Tracker ID
            field_names: Specific fields to compare (None = all tracked fields)
            max_fields: Maximum fields to analyze
        
        Returns:
            Complete comparison results
        """
        # Get entries from provider
        target_entries = provider.get_target_entries()
        comparison_entries = provider.get_comparison_entries()
        
        if not target_entries or not comparison_entries:
            return {
                'message': 'Insufficient data for comparison',
                'has_comparison': False
            }
        
        # Get fields to compare
        if field_names is None:
            field_names = ComparisonService._get_tracked_fields(tracker_id)[:max_fields]
        
        # Compare each field (skip notes/text fields)
        field_comparisons = {}
        for field_name in field_names:
            # Skip notes/text fields - they can't be meaningfully compared
            if field_name.endswith('.notes') or field_name == 'notes' or '.notes' in field_name.lower():
                continue
            try:
                comparison = FieldComparator.compare_field(
                    target_entries,
                    comparison_entries,
                    field_name,
                    tracker_id
                )
                if comparison:
                    field_comparisons[field_name] = comparison
            except:
                continue
        
        if not field_comparisons:
            return {
                'message': 'No valid comparisons could be made',
                'has_comparison': False
            }
        
        # Generate insights and summary
        insights = InsightGenerator.generate_field_insights(field_comparisons)
        summary = InsightGenerator.generate_summary_stats(field_comparisons)
        top_changes = InsightGenerator.get_top_changes(field_comparisons)
        
        # Build response
        return {
            **provider.get_metadata(),
            **summary,
            'top_changes': top_changes,
            'insights': insights,
            'has_comparison': True
        }
    
    # ========================================================================
    # CONVENIENCE METHODS (Simplified API)
    # ========================================================================
    
    @staticmethod
    def compare_date_ranges(
        tracker_id: int,
        target_start: date,
        target_end: date,
        comparison_start: date,
        comparison_end: date,
        field_names: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """Compare two custom date ranges."""
        tracker = Tracker.query.get(tracker_id)
        if not tracker:
            raise ValueError(f"Tracker {tracker_id} not found")
        
        provider = DateRangePeriodProvider(
            tracker_id, target_start, target_end,
            comparison_start, comparison_end
        )
        
        result = ComparisonService.compare(provider, tracker_id, field_names)
        result['comparison_type'] = 'custom_date_range'
        return result
    
    @staticmethod
    def compare_current_week_with_previous(tracker_id: int) -> Dict[str, Any]:
        """
        Compare current calendar week (ISO week) with previous calendar week.
        
        Uses actual calendar weeks, not rolling 7-day windows.
        Example: Week 3 of 2025 vs Week 2 of 2025
        """
        today = date.today()
        
        # Get current ISO week
        current_year, current_week, current_weekday = today.isocalendar()
        
        # Calculate start of current week (Monday)
        days_since_monday = current_weekday - 1
        current_week_start = today - timedelta(days=days_since_monday)
        current_week_end = current_week_start + timedelta(days=6)
        
        # Calculate previous week
        previous_week_start = current_week_start - timedelta(days=7)
        previous_week_end = previous_week_start + timedelta(days=6)
        
        result = ComparisonService.compare_date_ranges(
            tracker_id,
            current_week_start, current_week_end,
            previous_week_start, previous_week_end
        )
        result['comparison_type'] = 'week_over_week'
        result['current_week'] = {
            'year': current_year,
            'week': current_week,
            'start_date': current_week_start.isoformat(),
            'end_date': current_week_end.isoformat()
        }
        prev_year, prev_week, _ = previous_week_start.isocalendar()
        result['previous_week'] = {
            'year': prev_year,
            'week': prev_week,
            'start_date': previous_week_start.isoformat(),
            'end_date': previous_week_end.isoformat()
        }
        return result
    
    @staticmethod
    def compare_current_month_with_previous(tracker_id: int) -> Dict[str, Any]:
        """
        Compare current calendar month with previous calendar month.
        
        Uses actual calendar months, not rolling 30-day windows.
        Example: January 2025 vs December 2024
        """
        today = date.today()
        
        # Current month boundaries
        current_year = today.year
        current_month = today.month
        current_month_start = date(current_year, current_month, 1)
        _, last_day = calendar.monthrange(current_year, current_month)
        current_month_end = date(current_year, current_month, last_day)
        
        # Previous month boundaries
        if current_month == 1:
            prev_year = current_year - 1
            prev_month = 12
        else:
            prev_year = current_year
            prev_month = current_month - 1
        
        previous_month_start = date(prev_year, prev_month, 1)
        _, prev_last_day = calendar.monthrange(prev_year, prev_month)
        previous_month_end = date(prev_year, prev_month, prev_last_day)
        
        result = ComparisonService.compare_date_ranges(
            tracker_id,
            current_month_start, current_month_end,
            previous_month_start, previous_month_end
        )
        result['comparison_type'] = 'month_over_month'
        result['current_month'] = {
            'year': current_year,
            'month': current_month,
            'month_name': calendar.month_name[current_month],
            'start_date': current_month_start.isoformat(),
            'end_date': current_month_end.isoformat()
        }
        result['previous_month'] = {
            'year': prev_year,
            'month': prev_month,
            'month_name': calendar.month_name[prev_month],
            'start_date': previous_month_start.isoformat(),
            'end_date': previous_month_end.isoformat()
        }
        return result
    
    @staticmethod
    def compare_current_year_with_previous(tracker_id: int) -> Dict[str, Any]:
        """
        Compare current calendar year with previous calendar year.
        
        Uses actual calendar years.
        Example: 2025 vs 2024
        """
        today = date.today()
        current_year = today.year
        
        # Current year boundaries
        current_year_start = date(current_year, 1, 1)
        current_year_end = date(current_year, 12, 31)
        
        # Previous year boundaries
        previous_year = current_year - 1
        previous_year_start = date(previous_year, 1, 1)
        previous_year_end = date(previous_year, 12, 31)
        
        result = ComparisonService.compare_date_ranges(
            tracker_id,
            current_year_start, current_year_end,
            previous_year_start, previous_year_end
        )
        result['comparison_type'] = 'year_over_year'
        result['current_year'] = {
            'year': current_year,
            'start_date': current_year_start.isoformat(),
            'end_date': current_year_end.isoformat()
        }
        result['previous_year'] = {
            'year': previous_year,
            'start_date': previous_year_start.isoformat(),
            'end_date': previous_year_end.isoformat()
        }
        return result
    
    @staticmethod
    def compare_with_baseline(
        tracker_id: int,
        target_start: date,
        target_end: date,
        baseline_months: int = 6,
        field_names: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """Compare a period with historical baseline."""
        tracker = Tracker.query.get(tracker_id)
        if not tracker:
            raise ValueError(f"Tracker {tracker_id} not found")
        
        provider = BaselinePeriodProvider(
            tracker_id, target_start, target_end, baseline_months
        )
        
        result = ComparisonService.compare(provider, tracker_id, field_names)
        result['comparison_type'] = 'baseline_comparison'
        result['baseline_months'] = baseline_months
        return result
    
    @staticmethod
    def get_general_summary(tracker_id: int, months: int = 3) -> Dict[str, Any]:
        """
        Get general comparison summary for any tracker.
        
        Compares recent period with historical baseline.
        """
        tracker = Tracker.query.get(tracker_id)
        if not tracker:
            raise ValueError(f"Tracker {tracker_id} not found")
        
        today = date.today()
        target_start = today - timedelta(days=months * 30)
        target_end = today
        
        result = ComparisonService.compare_with_baseline(
            tracker_id, target_start, target_end, baseline_months=months
        )
        
        result['comparison_type'] = 'general_summary'
        result['tracker_id'] = tracker.id
        result['analysis_months'] = months
        
        return result
    
    # ========================================================================
    # CYCLE-SPECIFIC METHODS (Period Tracker)
    # ========================================================================
    
    @staticmethod
    def compare_cycle_with_previous(tracker_id: int, cycle_id: int) -> Dict[str, Any]:
        """
        Compare a cycle with the previous cycle.
        
        Includes cycle metrics + field comparisons.
        """
        # Validate tracker
        tracker = Tracker.query.get(tracker_id)
        if not tracker:
            raise ValueError(f"Tracker {tracker_id} not found")
        
        category = TrackerCategory.query.filter_by(id=tracker.category_id).first()
        if not category or category.name != 'Period Tracker':
            raise ValueError("This comparison is only for Period Trackers")
        
        # Get cycles
        target_cycle = PeriodCycle.query.get(cycle_id)
        if not target_cycle or target_cycle.tracker_id != tracker_id:
            raise ValueError(f"Cycle {cycle_id} not found")
        
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
                'has_comparison': False
            }
        
        # Compare cycle metrics
        cycle_metrics = ComparisonService._compare_cycle_metrics(
            target_cycle, previous_cycle
        )
        
        # Use unified comparison for fields
        provider = CyclePeriodProvider(tracker_id, target_cycle.id, previous_cycle.id)
        field_comparison = ComparisonService.compare(provider, tracker_id, max_fields=10)
        
        # Combine results
        return {
            'comparison_type': 'cycle_to_cycle',
            'cycle_metrics': cycle_metrics,
            **field_comparison,
            'cycle_insights': ComparisonService._generate_cycle_insights(
                cycle_metrics, field_comparison.get('top_changes', {})
            )
        }
    
    @staticmethod
    def compare_cycle_with_average(
        tracker_id: int,
        cycle_id: int,
        months: int = 6
    ) -> Dict[str, Any]:
        """Compare a cycle with the average of recent cycles."""
        # Get target cycle
        target_cycle = PeriodCycle.query.get(cycle_id)
        if not target_cycle or target_cycle.tracker_id != tracker_id:
            raise ValueError(f"Cycle {cycle_id} not found")
        
        # Get recent cycles for average
        cutoff_date = date.today() - timedelta(days=months * 30)
        recent_cycles = PeriodCycle.query.filter_by(
            tracker_id=tracker_id
        ).filter(
            PeriodCycle.cycle_start_date >= cutoff_date,
            PeriodCycle.id != cycle_id,
            PeriodCycle.cycle_end_date.isnot(None)
        ).all()
        
        if len(recent_cycles) < 2:
            return {
                'message': 'Need at least 2 other cycles to calculate average',
                'has_comparison': False
            }
        
        # Calculate average metrics
        cycle_lengths = [c.cycle_length for c in recent_cycles if c.cycle_length]
        period_lengths = [c.period_length for c in recent_cycles if c.period_length]
        
        avg_cycle_length = np.mean(cycle_lengths) if cycle_lengths else None
        avg_period_length = np.mean(period_lengths) if period_lengths else None
        
        # Compare
        cycle_length_diff = None
        period_length_diff = None
        
        if target_cycle.cycle_length and avg_cycle_length:
            cycle_length_diff = target_cycle.cycle_length - avg_cycle_length
        
        if target_cycle.period_length and avg_period_length:
            period_length_diff = target_cycle.period_length - avg_period_length
        
        return {
            'comparison_type': 'cycle_to_average',
            'target_cycle': {
                'cycle_id': target_cycle.id,
                'cycle_length': target_cycle.cycle_length,
                'period_length': target_cycle.period_length
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
    
    @staticmethod
    def compare_field_between_cycles(
        tracker_id: int,
        field_name: str,
        cycle_id_1: int,
        cycle_id_2: int,
        option: Optional[str] = None
    ) -> Dict[str, Any]:
        """Compare a specific field between two cycles."""
        # Get cycles
        cycle1 = PeriodCycle.query.get(cycle_id_1)
        cycle2 = PeriodCycle.query.get(cycle_id_2)
        
        if not cycle1 or not cycle2:
            raise ValueError("One or both cycles not found")
        
        # Use unified comparison
        provider = CyclePeriodProvider(tracker_id, cycle_id_1, cycle_id_2)
        
        comparison = FieldComparator.compare_field(
            provider.get_target_entries(),
            provider.get_comparison_entries(),
            field_name,
            tracker_id,
            option
        )
        
        if not comparison:
            return {
                'message': f'Insufficient data for {field_name}',
                'has_comparison': False
            }
        
        # Detect field type
        field_type, _ = FieldTypeDetector.detect_field_type(field_name, tracker_id, option)
        
        return {
            'field_name': field_name,
            'option': option,
            'field_type': field_type,
            **provider.get_metadata(),
            **comparison,
            'has_comparison': True
        }
    
    # ========================================================================
    # HELPER METHODS
    # ========================================================================
    
    @staticmethod
    def _get_tracked_fields(tracker_id: int) -> List[str]:
        """Get list of fields tracked for this tracker, excluding notes/text fields."""
        entries = TrackingData.query.filter_by(tracker_id=tracker_id).limit(100).all()
        
        def flatten_fields(data: Dict[str, Any], prefix: str = "") -> List[str]:
            fields = []
            for key, value in data.items():
                field_path = f"{prefix}.{key}" if prefix else key
                if isinstance(value, dict) and value:
                    fields.extend(flatten_fields(value, field_path))
                elif value is not None:
                    fields.append(field_path)
            return fields
        
        def is_notes_field(field_path: str) -> bool:
            """Check if field is a notes/text field that shouldn't be compared."""
            # Exclude fields ending with .notes
            if field_path.endswith('.notes') or field_path == 'notes':
                return True
            # Exclude fields with 'notes' in the option name
            if '.notes' in field_path.lower():
                return True
            return False
        
        field_counts = defaultdict(int)
        for entry in entries:
            if entry.data:
                for field_path in flatten_fields(entry.data):
                    # Skip notes/text fields
                    if not is_notes_field(field_path):
                        field_counts[field_path] += 1
        
        sorted_fields = sorted(field_counts.items(), key=lambda x: x[1], reverse=True)
        return [field_name for field_name, _ in sorted_fields[:15]]
    
    @staticmethod
    def _compare_cycle_metrics(
        target: PeriodCycle,
        previous: PeriodCycle
    ) -> Dict[str, Any]:
        """Compare basic cycle metrics between two cycles."""
        metrics = {}
        
        if target.cycle_length and previous.cycle_length:
            length_diff = target.cycle_length - previous.cycle_length
            metrics['cycle_length'] = {
                'target': target.cycle_length,
                'previous': previous.cycle_length,
                'difference': length_diff,
                'change': 'longer' if length_diff > 0 else 'shorter' if length_diff < 0 else 'same'
            }
        
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
    def _generate_cycle_insights(
        cycle_metrics: Dict[str, Any],
        top_changes: Dict[str, Any]
    ) -> List[str]:
        """Generate insights for cycle comparisons."""
        insights = []
        
        if 'cycle_length' in cycle_metrics:
            cl = cycle_metrics['cycle_length']
            if cl['difference'] != 0:
                insights.append(
                    f"Cycle was {abs(cl['difference'])} days {cl['change']} than previous"
                )
        
        if 'period_length' in cycle_metrics:
            pl = cycle_metrics['period_length']
            if pl['difference'] != 0:
                insights.append(
                    f"Period was {abs(pl['difference'])} days {pl['change']} than previous"
                )
        
        if top_changes:
            field_names = ', '.join(list(top_changes.keys())[:3])
            insights.append(f"Notable changes in: {field_names}")
        
        return insights
    
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
        
        if period_length_diff is not None and abs(period_length_diff) > 2:
            interpretations.append(
                f"Period length is {'longer' if period_length_diff > 0 else 'shorter'} than average"
            )
        
        return interpretations
