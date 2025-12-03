
"""
Universal pattern recognition system for all trackers.
Detects temporal patterns, recurring trends, and contextual insights.

Supports:
- Regular trackers: Weekly/monthly patterns
- Period trackers: Cycle-based patterns + temporal patterns
"""

from typing import Dict, List, Any, Optional, Tuple
from datetime import date, timedelta, datetime
from collections import defaultdict, Counter
import numpy as np
from scipy import stats

from app.models.tracking_data import TrackingData
from app.models.tracker import Tracker
from app.models.tracker_category import TrackerCategory
from app.models.period_cycle import PeriodCycle
from app.services.analytics_base import (
    AnalyticsDataExtractor,
    AnalyticsGrouper,
    AnalyticsStatsCalculator,
    FieldTypeDetector
)
from app.services.period_cycle_service import PeriodCycleService


class PatternRecognitionService:
    """
    Detects and analyzes patterns in tracking data.
    
    Pattern Types:
    1. Day-of-week patterns (e.g., "poor sleep on weekends")
    2. Time-of-month patterns (e.g., "mood drops mid-month")
    3. Cycle phase patterns (period tracker only)
    4. Sequential patterns (e.g., "symptom X follows symptom Y")
    5. Recurring correlations (e.g., "low energy after poor sleep")
    """
    
    # Minimum occurrences to consider a pattern valid
    MIN_PATTERN_OCCURRENCES = 2
    MIN_CONFIDENCE_THRESHOLD = 0.6  # 60% consistency
    
    @staticmethod
    def detect_all_patterns(
        tracker_id: int,
        field_name: str,
        option: Optional[str] = None,
        months: int = 3,
        min_confidence: float = 0.6
    ) -> Dict[str, Any]:
        """
        Detect all patterns for a field across temporal and contextual dimensions.
        
        Returns:
            Dictionary with detected patterns and insights
        """
        tracker = Tracker.query.get(tracker_id)
        if not tracker:
            raise ValueError(f"Tracker {tracker_id} not found")
        
        category = TrackerCategory.query.filter_by(id=tracker.category_id).first()
        is_period_tracker = category and category.name == 'Period Tracker'
        
        # Get tracking data
        cutoff_date = date.today() - timedelta(days=months * 30)
        entries = TrackingData.query.filter_by(
            tracker_id=tracker_id
        ).filter(
            TrackingData.entry_date >= cutoff_date
        ).order_by(TrackingData.entry_date.asc()).all()
        
        # Extract field values
        extracted_data = AnalyticsDataExtractor.extract_field_values(
            entries, field_name, option, tracker_id
        )
        
        if not extracted_data or len(extracted_data) < 10:
            return {
                'message': 'Need at least 10 data points to detect patterns',
                'data_points': len(extracted_data) if extracted_data else 0
            }
        
        # Detect field type
        field_type, _ = FieldTypeDetector.detect_field_type(
            field_name, tracker_id, option
        )
        
        detected_patterns = {
            'field_name': field_name,
            'option': option,
            'field_type': field_type,
            'data_points_analyzed': len(extracted_data),
            'analysis_period': {
                'start': extracted_data[0]['entry_date'].isoformat(),
                'end': extracted_data[-1]['entry_date'].isoformat(),
                'days': (extracted_data[-1]['entry_date'] - extracted_data[0]['entry_date']).days + 1
            },
            'patterns': {}
        }
        
        # 1. Day-of-week patterns (all trackers)
        dow_patterns = PatternRecognitionService._detect_day_of_week_patterns(
            extracted_data, field_name, field_type, min_confidence
        )
        if dow_patterns:
            detected_patterns['patterns']['day_of_week'] = dow_patterns
        
        # 2. Time-of-month patterns (all trackers)
        month_patterns = PatternRecognitionService._detect_time_of_month_patterns(
            extracted_data, field_name, field_type, min_confidence
        )
        if month_patterns:
            detected_patterns['patterns']['time_of_month'] = month_patterns
        
        # 3. Cycle-specific patterns (period tracker only)
        if is_period_tracker:
            cycle_patterns = PatternRecognitionService._detect_cycle_phase_patterns(
                tracker_id, extracted_data, field_name, field_type, min_confidence
            )
            if cycle_patterns:
                detected_patterns['patterns']['cycle_phases'] = cycle_patterns
        
        # 4. Streak patterns (consecutive days)
        streak_patterns = PatternRecognitionService._detect_streak_patterns(
            extracted_data, field_name, field_type
        )
        if streak_patterns:
            detected_patterns['patterns']['streaks'] = streak_patterns
        
        # Generate insights from all patterns
        detected_patterns['insights'] = PatternRecognitionService._generate_pattern_insights(
            detected_patterns['patterns'], field_name, is_period_tracker
        )
        
        # Calculate overall pattern strength
        detected_patterns['pattern_strength'] = PatternRecognitionService._calculate_pattern_strength(
            detected_patterns['patterns']
        )
        
        return detected_patterns
    
    @staticmethod
    def _detect_day_of_week_patterns(
        data: List[Dict],
        field_name: str,
        field_type: str,
        min_confidence: float
    ) -> Optional[Dict[str, Any]]:
        """
        Detect patterns based on day of week.
        
        Examples:
        - "You sleep poorly on weekends"
        - "Mood is low on Mondays"
        - "Energy peaks on Wednesdays"
        """
        # Group by day of week (0=Monday, 6=Sunday)
        dow_groups = defaultdict(list)
        for item in data:
            dow = item['entry_date'].weekday()
            if item['value'] is not None:
                dow_groups[dow].append(item['value'])
        
        # Need data for at least 5 different days
        if len(dow_groups) < 5:
            return None
        
        day_names = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
        
        if field_type == 'numeric':
            # Calculate average for each day
            dow_stats = {}
            for dow, values in dow_groups.items():
                if len(values) >= 2:  # At least 2 occurrences
                    stats_calc = AnalyticsStatsCalculator.calculate_numeric_stats(values)
                    dow_stats[dow] = {
                        'day': day_names[dow],
                        'count': len(values),
                        'mean': stats_calc['mean'],
                        'std_dev': stats_calc['std_dev']
                    }
            
            if len(dow_stats) < 2:
                return None
            
            # Find significant differences
            means = {dow: s['mean'] for dow, s in dow_stats.items()}
            highest_dow = max(means, key=means.get)
            lowest_dow = min(means, key=means.get)
            
            highest_mean = means[highest_dow]
            lowest_mean = means[lowest_dow]
            difference = highest_mean - lowest_mean
            
            # Calculate if difference is significant (>20% or >1 unit)
            if lowest_mean > 0:
                percent_diff = (difference / lowest_mean) * 100
            else:
                percent_diff = 100 if difference > 0 else 0
            
            is_significant = percent_diff > 20 or difference > 1
            
            if not is_significant:
                return None
            
            # Weekend vs weekday comparison
            weekday_values = []
            weekend_values = []
            for dow, values in dow_groups.items():
                if dow < 5:  # Monday-Friday
                    weekday_values.extend(values)
                else:  # Saturday-Sunday
                    weekend_values.extend(values)
            
            weekend_vs_weekday = None
            if weekday_values and weekend_values:
                weekday_avg = np.mean(weekday_values)
                weekend_avg = np.mean(weekend_values)
                diff = weekend_avg - weekday_avg
                
                if abs(diff) > 1 or abs(diff / weekday_avg * 100) > 15:
                    weekend_vs_weekday = {
                        'weekday_average': round(weekday_avg, 2),
                        'weekend_average': round(weekend_avg, 2),
                        'difference': round(diff, 2),
                        'pattern': 'higher_on_weekend' if diff > 0 else 'higher_on_weekday'
                    }
            
            return {
                'type': 'numeric',
                'day_statistics': dow_stats,
                'highest_day': {
                    'day': day_names[highest_dow],
                    'average': round(highest_mean, 2),
                    'occurrences': dow_stats[highest_dow]['count']
                },
                'lowest_day': {
                    'day': day_names[lowest_dow],
                    'average': round(lowest_mean, 2),
                    'occurrences': dow_stats[lowest_dow]['count']
                },
                'difference': round(difference, 2),
                'percent_difference': round(percent_diff, 1),
                'weekend_vs_weekday': weekend_vs_weekday,
                'confidence': 'high' if percent_diff > 30 else 'medium',
                'insight': PatternRecognitionService._generate_dow_numeric_insight(
                    field_name, day_names[highest_dow], day_names[lowest_dow],
                    highest_mean, lowest_mean, weekend_vs_weekday
                )
            }
        
        else:  # Categorical
            # Find most common value for each day
            dow_patterns = {}
            for dow, values in dow_groups.items():
                if len(values) >= 2:
                    stats_calc = AnalyticsStatsCalculator.calculate_categorical_stats(values)
                    dow_patterns[dow] = {
                        'day': day_names[dow],
                        'count': len(values),
                        'most_common': stats_calc['mode'],
                        'frequency': stats_calc['frequency']
                    }
            
            if len(dow_patterns) < 2:
                return None
            
            # Check if specific values consistently appear on specific days
            consistent_patterns = []
            for dow, pattern in dow_patterns.items():
                mode_count = pattern['frequency'].get(pattern['most_common'], 0)
                consistency = mode_count / pattern['count']
                
                if consistency >= min_confidence:
                    consistent_patterns.append({
                        'day': day_names[dow],
                        'value': pattern['most_common'],
                        'frequency': f"{mode_count}/{pattern['count']}",
                        'consistency': round(consistency * 100, 1)
                    })
            
            if not consistent_patterns:
                return None
            
            return {
                'type': 'categorical',
                'day_patterns': dow_patterns,
                'consistent_patterns': consistent_patterns,
                'confidence': 'high' if len(consistent_patterns) >= 3 else 'medium',
                'insight': PatternRecognitionService._generate_dow_categorical_insight(
                    field_name, consistent_patterns
                )
            }
    
    @staticmethod
    def _detect_time_of_month_patterns(
        data: List[Dict],
        field_name: str,
        field_type: str,
        min_confidence: float
    ) -> Optional[Dict[str, Any]]:
        """
        Detect patterns based on day of month (early, mid, late month).
        
        Divides month into:
        - Early month: days 1-10
        - Mid month: days 11-20
        - Late month: days 21-31
        """
        # Group by month period
        early_month = []  # 1-10
        mid_month = []    # 11-20
        late_month = []   # 21-31
        
        for item in data:
            day_of_month = item['entry_date'].day
            if item['value'] is not None:
                if day_of_month <= 10:
                    early_month.append(item['value'])
                elif day_of_month <= 20:
                    mid_month.append(item['value'])
                else:
                    late_month.append(item['value'])
        
        # Need data in all periods
        if not (early_month and mid_month and late_month):
            return None
        
        if field_type == 'numeric':
            early_avg = np.mean(early_month)
            mid_avg = np.mean(mid_month)
            late_avg = np.mean(late_month)
            
            # Find highest and lowest periods
            periods = {
                'early': early_avg,
                'mid': mid_avg,
                'late': late_avg
            }
            
            highest_period = max(periods, key=periods.get)
            lowest_period = min(periods, key=periods.get)
            
            difference = periods[highest_period] - periods[lowest_period]
            
            if periods[lowest_period] > 0:
                percent_diff = (difference / periods[lowest_period]) * 100
            else:
                percent_diff = 100 if difference > 0 else 0
            
            # Only report if significant
            if percent_diff < 15 and difference < 1:
                return None
            
            period_labels = {
                'early': 'Early Month (1-10)',
                'mid': 'Mid Month (11-20)',
                'late': 'Late Month (21-31)'
            }
            
            return {
                'type': 'numeric',
                'early_month': {
                    'average': round(early_avg, 2),
                    'count': len(early_month)
                },
                'mid_month': {
                    'average': round(mid_avg, 2),
                    'count': len(mid_month)
                },
                'late_month': {
                    'average': round(late_avg, 2),
                    'count': len(late_month)
                },
                'highest_period': {
                    'period': period_labels[highest_period],
                    'average': round(periods[highest_period], 2)
                },
                'lowest_period': {
                    'period': period_labels[lowest_period],
                    'average': round(periods[lowest_period], 2)
                },
                'difference': round(difference, 2),
                'confidence': 'high' if percent_diff > 25 else 'medium',
                'insight': f"Your {field_name} tends to be {round(difference, 1)} units higher during {period_labels[highest_period].lower()} compared to {period_labels[lowest_period].lower()}"
            }
        
        else:  # Categorical
            early_stats = AnalyticsStatsCalculator.calculate_categorical_stats(early_month)
            mid_stats = AnalyticsStatsCalculator.calculate_categorical_stats(mid_month)
            late_stats = AnalyticsStatsCalculator.calculate_categorical_stats(late_month)
            
            # Check for consistency
            consistent = (
                early_stats['mode'] == mid_stats['mode'] == late_stats['mode']
            )
            
            if consistent:
                return None  # No variation
            
            return {
                'type': 'categorical',
                'early_month': {
                    'most_common': early_stats['mode'],
                    'frequency': early_stats['frequency'],
                    'count': len(early_month)
                },
                'mid_month': {
                    'most_common': mid_stats['mode'],
                    'frequency': mid_stats['frequency'],
                    'count': len(mid_month)
                },
                'late_month': {
                    'most_common': late_stats['mode'],
                    'frequency': late_stats['frequency'],
                    'count': len(late_month)
                },
                'confidence': 'medium',
                'insight': f"Your {field_name} varies throughout the month: typically '{early_stats['mode']}' early month, '{mid_stats['mode']}' mid month, and '{late_stats['mode']}' late month"
            }
    
    @staticmethod
    def _detect_cycle_phase_patterns(
        tracker_id: int,
        data: List[Dict],
        field_name: str,
        field_type: str,
        min_confidence: float
    ) -> Optional[Dict[str, Any]]:
        """
        Detect patterns specific to menstrual cycle phases.
        
        Examples:
        - "Period flow is heavy during menstruation"
        - "Discharge is creamy when period ends"
        - "Pain spikes during ovulation"
        - "Mood drops in luteal phase"
        """
        settings = PeriodCycleService.get_tracker_settings(tracker_id)
        
        # Annotate data with cycle phases
        phase_groups = {
            'menstruation': [],
            'follicular': [],
            'ovulation': [],
            'luteal': []
        }
        
        for item in data:
            # Find cycle for this date
            cycle = PeriodCycleService.find_cycle_for_date(tracker_id, item['entry_date'])
            if not cycle or item['value'] is None:
                continue
            
            # Calculate cycle day and phase
            days_since_start = (item['entry_date'] - cycle.cycle_start_date).days + 1
            
            # Determine phase based on cycle day
            if days_since_start <= settings['average_period_length']:
                phase = 'menstruation'
            elif days_since_start <= (settings['average_cycle_length'] // 2) - 2:
                phase = 'follicular'
            elif days_since_start <= (settings['average_cycle_length'] // 2) + 2:
                phase = 'ovulation'
            else:
                phase = 'luteal'
            
            phase_groups[phase].append(item['value'])
        
        # Filter phases with sufficient data
        valid_phases = {p: v for p, v in phase_groups.items() if len(v) >= 2}
        
        if len(valid_phases) < 2:
            return None
        
        if field_type == 'numeric':
            phase_stats = {}
            for phase, values in valid_phases.items():
                stats_calc = AnalyticsStatsCalculator.calculate_numeric_stats(values)
                phase_stats[phase] = {
                    'average': stats_calc['mean'],
                    'count': len(values),
                    'std_dev': stats_calc['std_dev']
                }
            
            # Find most and least affected phases
            means = {p: s['average'] for p, s in phase_stats.items()}
            highest_phase = max(means, key=means.get)
            lowest_phase = min(means, key=means.get)
            
            difference = means[highest_phase] - means[lowest_phase]
            percent_diff = (difference / means[lowest_phase] * 100) if means[lowest_phase] > 0 else 0
            
            if percent_diff < 20 and difference < 1:
                return None
            
            phase_labels = {
                'menstruation': 'menstrual phase',
                'follicular': 'follicular phase',
                'ovulation': 'ovulation',
                'luteal': 'luteal phase'
            }
            
            return {
                'type': 'numeric',
                'phase_statistics': phase_stats,
                'highest_phase': {
                    'phase': phase_labels[highest_phase],
                    'average': round(means[highest_phase], 2)
                },
                'lowest_phase': {
                    'phase': phase_labels[lowest_phase],
                    'average': round(means[lowest_phase], 2)
                },
                'confidence': 'high' if percent_diff > 30 else 'medium',
                'insight': f"Your {PatternRecognitionService._get_field_display_name(field_name, highest_phase)} peaks during {phase_labels[highest_phase]} ({round(means[highest_phase], 1)}) and is lowest during {phase_labels[lowest_phase]} ({round(means[lowest_phase], 1)})"
            }
        
        else:  # Categorical
            phase_patterns = {}
            for phase, values in valid_phases.items():
                if len(values) >= 2:
                    stats_calc = AnalyticsStatsCalculator.calculate_categorical_stats(values)
                    mode_count = stats_calc['frequency'].get(stats_calc['mode'], 0)
                    consistency = mode_count / len(values)
                    
                    if consistency >= min_confidence:
                        phase_patterns[phase] = {
                            'most_common': stats_calc['mode'],
                            'frequency': f"{mode_count}/{len(values)}",
                            'consistency': round(consistency * 100, 1),
                            'count': len(values)
                        }
            
            if not phase_patterns:
                return None
            
            phase_labels = {
                'menstruation': 'when period ends',
                'follicular': 'in follicular phase',
                'ovulation': 'during ovulation',
                'luteal': 'in luteal phase'
            }
            
            # Generate specific insights
            insights = []
            for phase, pattern in phase_patterns.items():
                # Use "period flow" instead of "discharge" during menstruation
                display_name = PatternRecognitionService._get_field_display_name(field_name, phase)
                insights.append(
                    f"Your {display_name} is typically '{pattern['most_common']}' {phase_labels[phase]} "
                    f"({pattern['consistency']}% of the time)"
                )
            
            return {
                'type': 'categorical',
                'phase_patterns': phase_patterns,
                'confidence': 'high' if len(phase_patterns) >= 3 else 'medium',
                'insight': ' | '.join(insights)
            }
    
    @staticmethod
    def _detect_streak_patterns(
        data: List[Dict],
        field_name: str,
        field_type: str
    ) -> Optional[Dict[str, Any]]:
        """
        Detect consecutive streaks.
        
        For numeric: "3 days in a row of high/low values"
        For categorical: "3 days in a row of 'cramps'" or "2 days in a row of 'bloating'"
        """
        if len(data) < 5:
            return None
        
        # Sort by date
        sorted_data = sorted(data, key=lambda x: x['entry_date'])
        
        if field_type == 'numeric':
            return PatternRecognitionService._detect_numeric_streaks(sorted_data, field_name)
        else:
            return PatternRecognitionService._detect_categorical_streaks(sorted_data, field_name)
    
    @staticmethod
    def _detect_numeric_streaks(
        sorted_data: List[Dict],
        field_name: str
    ) -> Optional[Dict[str, Any]]:
        """Detect streaks for numeric values (high/low based on thresholds)."""
        # Calculate overall average
        values = [item['value'] for item in sorted_data if item['value'] is not None]
        if not values:
            return None
        
        overall_avg = np.mean(values)
        overall_std = np.std(values)
        
        # Define thresholds
        high_threshold = overall_avg + (0.5 * overall_std)
        low_threshold = overall_avg - (0.5 * overall_std)
        
        # Find streaks
        current_high_streak = 0
        current_low_streak = 0
        max_high_streak = 0
        max_low_streak = 0
        high_streak_count = 0
        low_streak_count = 0
        
        # Track streak details with dates
        high_streaks = []  # List of streak dicts: {start_date, end_date, length}
        low_streaks = []   # List of streak dicts: {start_date, end_date, length}
        current_high_start = None
        current_low_start = None
        prev_date = None
        
        def end_high_streak():
            if current_high_streak >= 2 and current_high_start and prev_date:
                high_streaks.append({
                    'start_date': current_high_start.isoformat(),
                    'end_date': prev_date.isoformat(),
                    'length': current_high_streak
                })
                return True
            return False
        
        def end_low_streak():
            if current_low_streak >= 2 and current_low_start and prev_date:
                low_streaks.append({
                    'start_date': current_low_start.isoformat(),
                    'end_date': prev_date.isoformat(),
                    'length': current_low_streak
                })
                return True
            return False
        
        def reset_high_streak():
            nonlocal current_high_streak, current_high_start
            current_high_streak = 0
            current_high_start = None
        
        def reset_low_streak():
            nonlocal current_low_streak, current_low_start
            current_low_streak = 0
            current_low_start = None
        
        for i, item in enumerate(sorted_data):
            if item['value'] is None:
                # End current streaks if any (missing data breaks streak)
                end_high_streak()
                end_low_streak()
                reset_high_streak()
                reset_low_streak()
                continue
            
            if item['value'] > high_threshold:
                # Start new high streak if this is the first day
                if current_high_streak == 0:
                    current_high_start = item['entry_date']
                
                # End low streak if it was >= 2 days
                end_low_streak()
                reset_low_streak()
                
                current_high_streak += 1
                max_high_streak = max(max_high_streak, current_high_streak)
                if current_high_streak >= 2:
                    high_streak_count += 1
                
            elif item['value'] < low_threshold:
                # Start new low streak if this is the first day
                if current_low_streak == 0:
                    current_low_start = item['entry_date']
                
                # End high streak if it was >= 2 days
                end_high_streak()
                reset_high_streak()
                
                current_low_streak += 1
                max_low_streak = max(max_low_streak, current_low_streak)
                if current_low_streak >= 2:
                    low_streak_count += 1
                
            else:
                # Value is normal - end any active streaks
                end_high_streak()
                end_low_streak()
                reset_high_streak()
                reset_low_streak()
            
            prev_date = item['entry_date']
        
        # Finalize any streaks that are still active at the end
        end_high_streak()
        end_low_streak()
        
        if max_high_streak < 2 and max_low_streak < 2:
            return None
        
        return {
            'type': 'numeric',
            'longest_high_streak': max_high_streak,
            'longest_low_streak': max_low_streak,
            'high_streak_occurrences': high_streak_count,
            'low_streak_occurrences': low_streak_count,
            'high_streaks': high_streaks,  # List of all high streaks with dates
            'low_streaks': low_streaks,    # List of all low streaks with dates
            'thresholds': {
                'high': round(high_threshold, 2),
                'low': round(low_threshold, 2),
                'average': round(overall_avg, 2)
            },
            'insight': PatternRecognitionService._generate_streak_insight(
                field_name, max_high_streak, max_low_streak,
                high_streak_count, low_streak_count
            )
        }
    
    @staticmethod
    def _detect_categorical_streaks(
        sorted_data: List[Dict],
        field_name: str
    ) -> Optional[Dict[str, Any]]:
        """
        Detect streaks for categorical values (e.g., "cramps" for 3 days in a row).
        
        Handles both single values and arrays (e.g., ["cramps", "bloating"]).
        """
        # Extract all unique values that appear
        all_values = set()
        for item in sorted_data:
            if item['value'] is None:
                continue
            # Handle both single values and arrays
            if isinstance(item['value'], list):
                all_values.update(item['value'])
            else:
                all_values.add(str(item['value']))
        
        if not all_values:
            return None
        
        # Track streaks for each categorical value
        value_streaks = {}  # {value: {streaks: [], longest: int, total_days: int}}
        
        for value in all_values:
            current_streak = 0
            current_start = None
            streaks = []
            longest_streak = 0
            total_days = 0
            prev_date = None
            
            for item in sorted_data:
                if item['value'] is None:
                    # End streak if it was >= 2 days
                    if current_streak >= 2 and current_start and prev_date:
                        streaks.append({
                            'start_date': current_start.isoformat(),
                            'end_date': prev_date.isoformat(),
                            'length': current_streak
                        })
                    current_streak = 0
                    current_start = None
                    continue
                
                # Check if this value is present (handles both single and array)
                value_present = False
                if isinstance(item['value'], list):
                    value_present = value in item['value']
                else:
                    value_present = str(item['value']) == value
                
                if value_present:
                    # Start new streak if this is the first day
                    if current_streak == 0:
                        current_start = item['entry_date']
                    
                    current_streak += 1
                    longest_streak = max(longest_streak, current_streak)
                    if current_streak >= 2:
                        total_days += 1
                else:
                    # End streak if it was >= 2 days
                    if current_streak >= 2 and current_start and prev_date:
                        streaks.append({
                            'start_date': current_start.isoformat(),
                            'end_date': prev_date.isoformat(),
                            'length': current_streak
                        })
                    current_streak = 0
                    current_start = None
                
                prev_date = item['entry_date']
            
            # Finalize any streak still active at the end
            if current_streak >= 2 and current_start and prev_date:
                streaks.append({
                    'start_date': current_start.isoformat(),
                    'end_date': prev_date.isoformat(),
                    'length': current_streak
                })
            
            # Only include values with meaningful streaks (>= 2 days)
            if longest_streak >= 2:
                value_streaks[value] = {
                    'longest_streak': longest_streak,
                    'total_days_in_streaks': total_days,
                    'streaks': streaks,
                    'streak_count': len(streaks)
                }
        
        if not value_streaks:
            return None
        
        # Find the value with the longest streak
        top_value = max(value_streaks, key=lambda v: value_streaks[v]['longest_streak'])
        top_streak_info = value_streaks[top_value]
        
        return {
            'type': 'categorical',
            'value_streaks': value_streaks,  # All values with streaks
            'top_streak': {
                'value': top_value,
                'longest_streak': top_streak_info['longest_streak'],
                'streak_count': top_streak_info['streak_count']
            },
            'insight': PatternRecognitionService._generate_categorical_streak_insight(
                field_name, value_streaks
            )
        }
    
    @staticmethod
    def _generate_categorical_streak_insight(
        field_name: str,
        value_streaks: Dict[str, Dict]
    ) -> str:
        """Generate insight for categorical streaks."""
        if not value_streaks:
            return f"No significant streaks detected for {field_name}"
        
        insights = []
        for value, info in sorted(value_streaks.items(), key=lambda x: x[1]['longest_streak'], reverse=True)[:3]:
            if info['longest_streak'] >= 3:
                insights.append(
                    f"You had '{value}' for {info['longest_streak']} consecutive days"
                )
            elif info['streak_count'] > 1:
                insights.append(
                    f"You had multiple streaks of '{value}' (longest: {info['longest_streak']} days)"
                )
        
        if not insights:
            return f"Some streaks detected for {field_name}"
        
        return ". ".join(insights) + "."
    
    # Helper methods for generating insights
    
    @staticmethod
    def _get_field_display_name(field_name: str, phase: Optional[str] = None) -> str:
        """
        Get appropriate display name for field based on context.
        
        For discharge fields during menstruation, use "period flow".
        Otherwise use the field name as-is.
        
        Examples:
        - "discharge" during menstruation → "period flow"
        - "discharge.amount" during menstruation → "period flow amount"
        - "discharge" during other phases → "discharge"
        """
        # Check if this is a discharge-related field
        if 'discharge' in field_name.lower():
            # If we're in menstruation phase, use "period flow"
            if phase == 'menstruation':
                # Handle nested fields like "discharge.amount" or "discharge.consistency"
                if '.' in field_name:
                    base, sub = field_name.split('.', 1)
                    return f"period flow {sub}"
                else:
                    return "period flow"
            # Otherwise keep as "discharge"
            return field_name
        
        return field_name
    
    @staticmethod
    def _generate_dow_numeric_insight(
        field_name: str,
        highest_day: str,
        lowest_day: str,
        highest_val: float,
        lowest_val: float,
        weekend_pattern: Optional[Dict]
    ) -> str:
        """Generate human-readable insight for day-of-week numeric patterns."""
        insight = f"Your {field_name} is highest on {highest_day}s ({round(highest_val, 1)}) and lowest on {lowest_day}s ({round(lowest_val, 1)})"
        
        if weekend_pattern:
            if weekend_pattern['pattern'] == 'higher_on_weekend':
                insight += f". You tend to have higher {field_name} on weekends ({round(weekend_pattern['weekend_average'], 1)}) compared to weekdays ({round(weekend_pattern['weekday_average'], 1)})"
            else:
                insight += f". You tend to have lower {field_name} on weekends ({round(weekend_pattern['weekend_average'], 1)}) compared to weekdays ({round(weekend_pattern['weekday_average'], 1)})"
        
        return insight
    
    @staticmethod
    def _generate_dow_categorical_insight(
        field_name: str,
        consistent_patterns: List[Dict]
    ) -> str:
        """Generate human-readable insight for day-of-week categorical patterns."""
        if len(consistent_patterns) == 1:
            p = consistent_patterns[0]
            return f"You consistently experience '{p['value']}' for {field_name} on {p['day']}s ({p['consistency']}% of the time)"
        
        patterns_text = ", ".join([
            f"'{p['value']}' on {p['day']}s" for p in consistent_patterns[:3]
        ])
        return f"Your {field_name} shows consistent patterns: {patterns_text}"
    
    @staticmethod
    def _generate_streak_insight(
        field_name: str,
        max_high: int,
        max_low: int,
        high_count: int,
        low_count: int
    ) -> str:
        """Generate insight for streak patterns."""
        insights = []
        
        if max_high >= 3:
            insights.append(f"You've had streaks of up to {max_high} consecutive days with high {field_name}")
        
        if max_low >= 3:
            insights.append(f"You've had streaks of up to {max_low} consecutive days with low {field_name}")
        
        if not insights:
            return f"Your {field_name} shows some consecutive patterns"
        
        return ". ".join(insights)
    
    @staticmethod
    def _generate_pattern_insights(
        patterns: Dict,
        field_name: str,
        is_period_tracker: bool
    ) -> List[str]:
        """Generate overall insights from all detected patterns."""
        insights = []
        
        # Day of week insights
        if 'day_of_week' in patterns:
            insights.append(patterns['day_of_week']['insight'])
        
        # Time of month insights
        if 'time_of_month' in patterns:
            insights.append(patterns['time_of_month']['insight'])
        
        # Cycle phase insights (period tracker)
        if 'cycle_phases' in patterns:
            insights.append(patterns['cycle_phases']['insight'])
        
        # Streak insights
        if 'streaks' in patterns:
            insights.append(patterns['streaks']['insight'])
        
        # Summary insight
        if len(insights) > 1:
            insights.append(
                f"Your {field_name} shows clear patterns across multiple dimensions. "
                "Use these insights to plan ahead and optimize your wellbeing!"
            )
        
        return insights
    
    @staticmethod
    def _calculate_pattern_strength(patterns: Dict) -> Dict[str, Any]:
        """Calculate overall strength of detected patterns."""
        total_patterns = len(patterns)
        high_confidence = sum(
            1 for p in patterns.values()
            if isinstance(p, dict) and p.get('confidence') == 'high'
        )
        
        if total_patterns == 0:
            strength = 'none'
        elif high_confidence >= 2 or (high_confidence >= 1 and total_patterns >= 3):
            strength = 'strong'
        elif total_patterns >= 2:
            strength = 'moderate'
        else:
            strength = 'weak'
        
        return {
            'overall_strength': strength,
            'patterns_detected': total_patterns,
            'high_confidence_patterns': high_confidence,
            'interpretation': PatternRecognitionService._interpret_strength(strength, total_patterns)
        }
    
    @staticmethod
    def _interpret_strength(strength: str, count: int) -> str:
        """Interpret pattern strength for users."""
        if strength == 'strong':
            return f"Strong patterns detected! We found {count} reliable patterns in your data."
        elif strength == 'moderate':
            return f"Some patterns detected. Continue tracking to confirm these {count} patterns."
        elif strength == 'weak':
            return "Weak patterns detected. Track more consistently to reveal clearer insights."
        else:
            return "No clear patterns detected yet. Keep tracking!"
    

    @staticmethod
    def generate_summary_insight(
        fields_analyzed: int,
        total_patterns: int,
        strong_patterns: int
    ) -> str:
        """Generate overall insight for pattern summary."""
        if total_patterns == 0:
            return "No clear patterns detected yet. Continue tracking consistently to reveal insights."
        
        if strong_patterns >= 2:
            return (
                f"Excellent! We detected {total_patterns} patterns across {fields_analyzed} fields, "
                f"with {strong_patterns} showing strong consistency. Your data reveals clear trends!"
            )
        
        if total_patterns >= 3:
            return (
                f"Good progress! We found {total_patterns} patterns across {fields_analyzed} fields. "
                "Continue tracking to strengthen these insights."
            )
        
        return (
            f"Some patterns emerging across {fields_analyzed} fields. "
            "Track more consistently to confirm these trends."
        )

    # ============================================================================
    # ADVANCED: Recurring Cycle Pattern Detection (Period Tracker Specific)
    # ============================================================================
    
    @staticmethod
    def detect_recurring_cycle_patterns(
        tracker_id: int,
        symptom_field: str,
        option: Optional[str] = None,
        min_cycles: int = 2,
        max_cycles: int = 6
    ) -> Dict[str, Any]:
        """
        Detect symptoms that recur consistently at specific points in multiple cycles.
        
        Examples:
        - "Period flow is heavy during menstruation" (found in 4/6 cycles)
        - "Discharge becomes creamy when period ends" (found in 4/6 cycles)
        - "Pain level spikes 2 days before ovulation" (consistent across 3 cycles)
        - "Mood drops in late luteal phase" (detected in 5/6 cycles)
        
        Args:
            tracker_id: The tracker ID
            symptom_field: Symptom to analyze
            option: Optional specific option
            min_cycles: Minimum cycles where pattern must appear
            max_cycles: Maximum cycles to analyze
        
        Returns:
            Dictionary with recurring patterns and their consistency
        """
        # Get recent completed cycles
        # Note: is_complete is a property, not a DB column, so we filter on cycle_end_date
        cycles = PeriodCycle.query.filter_by(
            tracker_id=tracker_id
        ).filter(
            PeriodCycle.cycle_end_date.isnot(None)  # Complete cycles have an end date
        ).order_by(
            PeriodCycle.cycle_start_date.desc()
        ).limit(max_cycles).all()
        
        if len(cycles) < min_cycles:
            return {
                'message': f'Need at least {min_cycles} completed cycles to detect recurring patterns',
                'cycles_found': len(cycles),
                'note': 'Make sure you have logged periods to create cycles. Use /log-period endpoint to create cycles.'
            }
        
        # Reverse to chronological order
        cycles = list(reversed(cycles))
        
        # Detect field type
        field_type, _ = FieldTypeDetector.detect_field_type(
            symptom_field, tracker_id, option
        )
        
        settings = PeriodCycleService.get_tracker_settings(tracker_id)
        
        # Extract symptom data for each cycle with timing context
        cycle_data = []
        
        for cycle in cycles:
            entries = TrackingData.query.filter_by(
                tracker_id=tracker_id
            ).filter(
                TrackingData.entry_date >= cycle.cycle_start_date,
                TrackingData.entry_date <= (cycle.cycle_end_date or cycle.predicted_next_period_date)
            ).order_by(TrackingData.entry_date.asc()).all()
            
            # Extract field values with cycle context
            extracted = AnalyticsDataExtractor.extract_field_values(
                entries, symptom_field, option, tracker_id
            )
            
            if not extracted:
                continue
            
            # Annotate each entry with cycle timing
            annotated_entries = []
            for item in extracted:
                if item['value'] is None:
                    continue
                
                days_since_start = (item['entry_date'] - cycle.cycle_start_date).days + 1
                
                # Determine phase
                if days_since_start <= settings['average_period_length']:
                    phase = 'menstruation'
                    phase_day = days_since_start  # Day 1, 2, 3 of period
                elif days_since_start <= (settings['average_cycle_length'] // 2) - 2:
                    phase = 'follicular'
                    phase_day = days_since_start - settings['average_period_length']
                elif days_since_start <= (settings['average_cycle_length'] // 2) + 2:
                    phase = 'ovulation'
                    phase_day = days_since_start - ((settings['average_cycle_length'] // 2) - 2)
                else:
                    phase = 'luteal'
                    phase_day = days_since_start - ((settings['average_cycle_length'] // 2) + 2)
                
                # Days relative to period end (for "when period ends" patterns)
                if cycle.period_end_date:
                    days_after_period_end = (item['entry_date'] - cycle.period_end_date).days
                else:
                    estimated_end = cycle.period_start_date + timedelta(days=settings['average_period_length'])
                    days_after_period_end = (item['entry_date'] - estimated_end).days
                
                annotated_entries.append({
                    'value': item['value'],
                    'cycle_day': days_since_start,
                    'phase': phase,
                    'phase_day': phase_day,
                    'days_after_period_end': days_after_period_end,
                    'date': item['entry_date']
                })
            
            if annotated_entries:
                cycle_data.append({
                    'cycle_id': cycle.id,
                    'cycle_number': len(cycle_data) + 1,
                    'entries': annotated_entries
                })
        
        if len(cycle_data) < min_cycles:
            return {
                'message': f'Need at least {min_cycles} cycles with data for {symptom_field}',
                'cycles_with_data': len(cycle_data),
                'total_cycles_checked': len(cycles)
            }
        
        # Detect recurring patterns
        if field_type == 'numeric':
            patterns = PatternRecognitionService._detect_numeric_recurring_patterns(
                cycle_data, symptom_field, min_cycles
            )
        else:
            patterns = PatternRecognitionService._detect_categorical_recurring_patterns(
                cycle_data, symptom_field, min_cycles
            )
        
        return {
            'symptom_field': symptom_field,
            'option': option,
            'field_type': field_type,
            'cycles_analyzed': len(cycle_data),
            'recurring_patterns': patterns,
            'pattern_count': len(patterns) if patterns else 0
        }
    
    @staticmethod
    def _detect_numeric_recurring_patterns(
        cycle_data: List[Dict],
        symptom_field: str,
        min_cycles: int
    ) -> List[Dict[str, Any]]:
        """Detect recurring numeric patterns (e.g., spikes, drops at specific times)."""
        patterns = []
        
        # 1. Check for spikes/drops at specific cycle days
        # Group by cycle day across all cycles
        cycle_day_values = defaultdict(list)
        for cycle in cycle_data:
            for entry in cycle['entries']:
                cycle_day_values[entry['cycle_day']].append({
                    'value': entry['value'],
                    'cycle_number': cycle['cycle_number']
                })
        
        # Calculate average for each day
        overall_mean = np.mean([
            entry['value'] 
            for cycle in cycle_data 
            for entry in cycle['entries']
        ])
        
        # Find days with consistently high/low values
        for cycle_day, values_list in cycle_day_values.items():
            if len(values_list) < min_cycles:
                continue
            
            values = [v['value'] for v in values_list]
            day_mean = np.mean(values)
            
            # Check if significantly different from overall mean
            if day_mean > overall_mean * 1.3:  # 30% higher
                occurrence_rate = len(values) / len(cycle_data)
                patterns.append({
                    'type': 'spike',
                    'timing': f"Day {cycle_day} of cycle",
                    'average_value': round(day_mean, 2),
                    'overall_average': round(overall_mean, 2),
                    'difference': round(day_mean - overall_mean, 2),
                    'occurrences': f"{len(values)}/{len(cycle_data)} cycles",
                    'consistency': round(occurrence_rate * 100, 1),
                    'insight': f"Your {PatternRecognitionService._get_field_display_name(symptom_field, 'menstruation' if cycle_day <= 5 else None)} consistently spikes on day {cycle_day} of your cycle ({round(day_mean, 1)} vs usual {round(overall_mean, 1)})"
                })
            
            elif day_mean < overall_mean * 0.7:  # 30% lower
                occurrence_rate = len(values) / len(cycle_data)
                patterns.append({
                    'type': 'drop',
                    'timing': f"Day {cycle_day} of cycle",
                    'average_value': round(day_mean, 2),
                    'overall_average': round(overall_mean, 2),
                    'difference': round(overall_mean - day_mean, 2),
                    'occurrences': f"{len(values)}/{len(cycle_data)} cycles",
                    'consistency': round(occurrence_rate * 100, 1),
                    'insight': f"Your {PatternRecognitionService._get_field_display_name(symptom_field, 'menstruation' if cycle_day <= 5 else None)} consistently drops on day {cycle_day} of your cycle ({round(day_mean, 1)} vs usual {round(overall_mean, 1)})"
                })
        
        # 2. Check for patterns relative to period end
        period_end_values = defaultdict(list)
        for cycle in cycle_data:
            for entry in cycle['entries']:
                if entry['days_after_period_end'] >= 0:  # Only after period ends
                    period_end_values[entry['days_after_period_end']].append({
                        'value': entry['value'],
                        'cycle_number': cycle['cycle_number']
                    })
        
        for days_after, values_list in period_end_values.items():
            if len(values_list) < min_cycles or days_after > 7:  # Only check first week after
                continue
            
            values = [v['value'] for v in values_list]
            day_mean = np.mean(values)
            
            if day_mean > overall_mean * 1.3:
                occurrence_rate = len(values) / len(cycle_data)
                patterns.append({
                    'type': 'spike_after_period',
                    'timing': f"{days_after} days after period ends",
                    'average_value': round(day_mean, 2),
                    'occurrences': f"{len(values)}/{len(cycle_data)} cycles",
                    'consistency': round(occurrence_rate * 100, 1),
                    'insight': f"Your {PatternRecognitionService._get_field_display_name(symptom_field)} tends to spike {days_after} days after your period ends"
                })
        
        # 3. Check for phase-specific patterns
        phase_values = defaultdict(list)
        for cycle in cycle_data:
            for entry in cycle['entries']:
                phase_values[entry['phase']].append(entry['value'])
        
        phase_means = {phase: np.mean(values) for phase, values in phase_values.items() if len(values) >= min_cycles}
        
        if len(phase_means) >= 2:
            highest_phase = max(phase_means, key=phase_means.get)
            lowest_phase = min(phase_means, key=phase_means.get)
            
            if phase_means[highest_phase] > phase_means[lowest_phase] * 1.3:
                phase_labels = {
                    'menstruation': 'during your period',
                    'follicular': 'in follicular phase',
                    'ovulation': 'during ovulation',
                    'luteal': 'in luteal phase'
                }
                
                patterns.append({
                    'type': 'phase_pattern',
                    'timing': phase_labels[highest_phase],
                    'average_value': round(phase_means[highest_phase], 2),
                    'occurrences': f"Detected across all {len(cycle_data)} cycles",
                    'consistency': 100.0,
                    'insight': f"Your {PatternRecognitionService._get_field_display_name(symptom_field, highest_phase)} is consistently higher {phase_labels[highest_phase]} compared to other phases"
                })
        
        return patterns
    
    @staticmethod
    def _detect_categorical_recurring_patterns(
        cycle_data: List[Dict],
        symptom_field: str,
        min_cycles: int
    ) -> List[Dict[str, Any]]:
        """Detect recurring categorical patterns (e.g., specific symptoms at specific times)."""
        patterns = []
        
        # 1. Check for specific values at specific cycle days
        cycle_day_values = defaultdict(lambda: defaultdict(int))
        for cycle in cycle_data:
            for entry in cycle['entries']:
                cycle_day_values[entry['cycle_day']][entry['value']] += 1
        
        for cycle_day, value_counts in cycle_day_values.items():
            total_at_day = sum(value_counts.values())
            
            if total_at_day < min_cycles:
                continue
            
            # Find most common value at this day
            most_common = max(value_counts, key=value_counts.get)
            occurrence_count = value_counts[most_common]
            consistency = occurrence_count / total_at_day
            
            if consistency >= 0.6 and occurrence_count >= min_cycles:  # 60% consistency
                patterns.append({
                    'type': 'cycle_day_pattern',
                    'timing': f"Day {cycle_day} of cycle",
                    'value': most_common,
                    'occurrences': f"{occurrence_count}/{len(cycle_data)} cycles",
                    'consistency': round(consistency * 100, 1),
                    'insight': f"Your {PatternRecognitionService._get_field_display_name(symptom_field, 'menstruation' if cycle_day <= 5 else None)} is typically '{most_common}' on day {cycle_day} of your cycle (found in {occurrence_count}/{len(cycle_data)} cycles)"
                })
        
        # 2. Patterns relative to period end (e.g., "creamy when period ends")
        period_end_values = defaultdict(lambda: defaultdict(int))
        for cycle in cycle_data:
            for entry in cycle['entries']:
                if 0 <= entry['days_after_period_end'] <= 3:  # First 3 days after period
                    period_end_values[entry['days_after_period_end']][entry['value']] += 1
        
        for days_after, value_counts in period_end_values.items():
            total = sum(value_counts.values())
            
            if total < min_cycles:
                continue
            
            most_common = max(value_counts, key=value_counts.get)
            occurrence_count = value_counts[most_common]
            consistency = occurrence_count / total
            
            if consistency >= 0.6 and occurrence_count >= min_cycles:
                timing_labels = {
                    0: "right when period ends",
                    1: "1 day after period ends",
                    2: "2 days after period ends",
                    3: "3 days after period ends"
                }
                
                patterns.append({
                    'type': 'period_end_pattern',
                    'timing': timing_labels.get(days_after, f"{days_after} days after period"),
                    'value': most_common,
                    'occurrences': f"{occurrence_count}/{len(cycle_data)} cycles",
                    'consistency': round(consistency * 100, 1),
                    'insight': f"Your {PatternRecognitionService._get_field_display_name(symptom_field)} is typically '{most_common}' {timing_labels.get(days_after, f'{days_after} days after period')} (found in {occurrence_count}/{len(cycle_data)} cycles)"
                })
        
        # 3. Phase-specific patterns
        phase_values = defaultdict(lambda: defaultdict(int))
        for cycle in cycle_data:
            for entry in cycle['entries']:
                phase_values[entry['phase']][entry['value']] += 1
        
        for phase, value_counts in phase_values.items():
            total = sum(value_counts.values())
            
            if total < min_cycles:
                continue
            
            most_common = max(value_counts, key=value_counts.get)
            occurrence_count = value_counts[most_common]
            consistency = occurrence_count / len(cycle_data)  # Against total cycles, not just entries
            
            if consistency >= 0.5 and occurrence_count >= min_cycles:  # 50% of cycles
                phase_labels = {
                    'menstruation': 'during your period',
                    'follicular': 'in follicular phase',
                    'ovulation': 'during ovulation',
                    'luteal': 'in luteal phase'
                }
                
                patterns.append({
                    'type': 'phase_pattern',
                    'timing': phase_labels[phase],
                    'value': most_common,
                    'occurrences': f"{occurrence_count}/{len(cycle_data)} cycles",
                    'consistency': round(consistency * 100, 1),
                    'insight': f"Your {PatternRecognitionService._get_field_display_name(symptom_field, phase)} is typically '{most_common}' {phase_labels[phase]} (found in {occurrence_count}/{len(cycle_data)} cycles)"
                })
        
        return patterns