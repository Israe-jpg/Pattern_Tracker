from typing import Dict, List, Any, Optional
from datetime import datetime, timedelta
from enum import Enum


class ConfidenceLevel(Enum):
    """Confidence levels for analytics insights"""
    INSUFFICIENT = "insufficient"
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    VERY_HIGH = "very_high"


class InsightType(Enum):
    """Types of insights based on data requirements"""
    # Tier 1: Minimal data (1-3 entries)
    STREAK = "streak"
    MILESTONE = "milestone"
    RECENT_COMPARISON = "recent_comparison"
    COMPLETION_RATE = "completion_rate"
    
    # Tier 2: Light analysis (4-7 entries)
    WEEKLY_SUMMARY = "weekly_summary"
    SIMPLE_AVERAGE = "simple_average"
    MOST_COMMON = "most_common"
    BEST_WORST = "best_worst"
    
    # Tier 3: Statistical (14+ entries)
    TREND_LINE = "trend_line"
    WEEKLY_PATTERN = "weekly_pattern"
    SIMPLE_CORRELATION = "simple_correlation"
    CONSISTENCY_SCORE = "consistency_score"
    
    # Tier 4: Advanced (30+ entries)
    MULTI_FACTOR = "multi_factor"
    PREDICTION = "prediction"
    PERSONALIZED_REC = "personalized_recommendation"
    CYCLICAL_DETECTION = "cyclical_detection"


class DataSufficiencyChecker:
    """Determines what analytics can be shown based on available data."""
    
    # Minimum entries required for each insight type
    MINIMUM_REQUIREMENTS = {
        # Tier 1
        InsightType.STREAK: 1,
        InsightType.MILESTONE: 1,
        InsightType.RECENT_COMPARISON: 2,
        InsightType.COMPLETION_RATE: 1,
        
        # Tier 2
        InsightType.WEEKLY_SUMMARY: 4,
        InsightType.SIMPLE_AVERAGE: 4,
        InsightType.MOST_COMMON: 3,
        InsightType.BEST_WORST: 4,
        
        # Tier 3
        InsightType.TREND_LINE: 14,
        InsightType.WEEKLY_PATTERN: 14,
        InsightType.SIMPLE_CORRELATION: 10,
        InsightType.CONSISTENCY_SCORE: 7,
        
        # Tier 4
        InsightType.MULTI_FACTOR: 30,
        InsightType.PREDICTION: 30,
        InsightType.PERSONALIZED_REC: 30,
        InsightType.CYCLICAL_DETECTION: 21,
    }
    
    # Recommended entries for high confidence
    RECOMMENDED_REQUIREMENTS = {
        InsightType.WEEKLY_SUMMARY: 7,
        InsightType.TREND_LINE: 21,
        InsightType.WEEKLY_PATTERN: 28,
        InsightType.MULTI_FACTOR: 60,
    }
    
    # Minimum time span requirements (days)
    MINIMUM_TIME_SPAN = {
        InsightType.WEEKLY_PATTERN: 7,     # At least 1 week
        InsightType.TREND_LINE: 7,          # At least 1 week
        InsightType.CYCLICAL_DETECTION: 14, # At least 2 weeks
        InsightType.PREDICTION: 21,         # At least 3 weeks
    }
    
    @staticmethod
    def check_field_eligibility(
        field_name: str,
        entry_count: int,
        time_span_days: int,
        insight_type: InsightType,
        option: Optional[str] = None
    ) -> Dict[str, Any]:
        
        """Check if a field has enough data for a specific insight."""
        # Ensure types are correct
        entry_count = int(entry_count)
        time_span_days = int(time_span_days)
        
        min_required = DataSufficiencyChecker.MINIMUM_REQUIREMENTS[insight_type]
        recommended = DataSufficiencyChecker.RECOMMENDED_REQUIREMENTS.get(
            insight_type,
            min_required
        )
        min_time_span = DataSufficiencyChecker.MINIMUM_TIME_SPAN.get(insight_type, 0)
        
        # Check entry count
        has_enough_entries = entry_count >= min_required
        
        # Check time span if required
        has_adequate_time_span = time_span_days >= min_time_span if min_time_span > 0 else True
        
        # Both conditions must be met
        is_eligible = has_enough_entries and has_adequate_time_span
        
        # Calculate confidence level
        if not is_eligible:
            confidence = ConfidenceLevel.INSUFFICIENT
            confidence_score = 0.0
        elif entry_count < min_required * 1.5:
            confidence = ConfidenceLevel.LOW
            confidence_score = 0.3
        elif entry_count < recommended:
            confidence = ConfidenceLevel.MEDIUM
            confidence_score = 0.6
        elif entry_count < recommended * 1.5:
            confidence = ConfidenceLevel.HIGH
            confidence_score = 0.85
        else:
            confidence = ConfidenceLevel.VERY_HIGH
            confidence_score = 1.0
        
        # Calculate logging frequency
        frequency = entry_count / max(time_span_days, 1) if time_span_days > 0 else 0
        adequate_frequency = frequency >= (2 / 7)  # At least 2x/week
        
        return {
            'field_name': field_name,
            'insight_type': insight_type.value,
            'is_eligible': is_eligible,
            'confidence': confidence.value,
            'confidence_score': confidence_score,
            'entry_count': entry_count,
            'min_required': min_required,
            'recommended': recommended,
            'entries_needed': max(0, min_required - entry_count),
            'time_span_days': time_span_days,
            'min_time_span': min_time_span,
            'time_span_adequate': has_adequate_time_span,
            'logging_frequency': round(frequency, 2),
            'adequate_frequency': adequate_frequency,
            'message': DataSufficiencyChecker._get_message(
                entry_count, min_required, recommended, confidence,
                has_adequate_time_span, min_time_span, time_span_days
            )
        }
    
    @staticmethod
    def _get_message(
        entry_count: int,
        min_required: int,
        recommended: int,
        confidence: ConfidenceLevel,
        has_adequate_time_span: bool,
        min_time_span: int,
        actual_time_span: int
    ) -> str:
        """Generate user-friendly message about data sufficiency."""
        # Time span issue
        if not has_adequate_time_span:
            days_needed = min_time_span - actual_time_span
            return f"Track for {days_needed} more day{'s' if days_needed > 1 else ''} to unlock this insight"
        
        # Entry count issue
        if entry_count < min_required:
            needed = min_required - entry_count
            return f"Log {needed} more time{'s' if needed > 1 else ''} to unlock this insight"
        
        # Confidence levels
        if confidence == ConfidenceLevel.LOW:
            return "Early insight - log more for accuracy"
        elif confidence == ConfidenceLevel.MEDIUM:
            more = recommended - entry_count
            return f"Good data! Log {more} more for stronger insights"
        elif confidence == ConfidenceLevel.HIGH:
            return "High confidence - reliable insight"
        else:
            return "Very strong data - highly reliable"
    
    @staticmethod
    def get_all_eligible_insights(
        field_name: str,
        entry_count: int,
        time_span_days: int,
        option: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        Get ALL eligible insights for a field, sorted by priority.
        
        Returns list of eligible insights with their eligibility info.
        """
        eligible_insights = []
        
        for insight_type in InsightType:
            result = DataSufficiencyChecker.check_field_eligibility(
                field_name,
                entry_count,
                time_span_days,
                insight_type,
                option=option
            )
            
            if result['is_eligible']:
                eligible_insights.append(result)
        
        # Sort by confidence score (descending) and tier priority
        tier_priority = {
            # Tier 4 (most valuable)
            InsightType.PREDICTION: 100,
            InsightType.PERSONALIZED_REC: 95,
            InsightType.MULTI_FACTOR: 90,
            InsightType.CYCLICAL_DETECTION: 85,
            
            # Tier 3
            InsightType.TREND_LINE: 80,
            InsightType.WEEKLY_PATTERN: 75,
            InsightType.SIMPLE_CORRELATION: 70,
            InsightType.CONSISTENCY_SCORE: 65,
            
            # Tier 2
            InsightType.WEEKLY_SUMMARY: 60,
            InsightType.BEST_WORST: 55,
            InsightType.SIMPLE_AVERAGE: 50,
            InsightType.MOST_COMMON: 45,
            
            # Tier 1 (engagement)
            InsightType.COMPLETION_RATE: 40,
            InsightType.STREAK: 35,
            InsightType.RECENT_COMPARISON: 30,
            InsightType.MILESTONE: 25,
        }
        
        def sort_key(insight):
            insight_type = InsightType(insight['insight_type'])
            priority = tier_priority.get(insight_type, 0)
            confidence = insight['confidence_score']
            # Combine priority and confidence (priority weighted higher)
            return (priority * 10) + (confidence * 5)
        
        eligible_insights.sort(key=sort_key, reverse=True)
        
        return eligible_insights
    
    @staticmethod
    def get_primary_insight(
        field_name: str,
        entry_count: int,
        time_span_days: int,
        option: Optional[str] = None
    ) -> Optional[Dict[str, Any]]:
        """
        Get the single BEST insight to show for a field/option.
        
        Returns the highest priority eligible insight, or None if no insights available.
        """
        eligible = DataSufficiencyChecker.get_all_eligible_insights(
            field_name,
            entry_count,
            time_span_days,
            option=option
        )
        
        return eligible[0] if eligible else None


class AnalyticsDisplayStrategy:
    """Determines what to show users based on available data."""
    
    @staticmethod
    def get_display_config(entry_count: int, confidence: ConfidenceLevel) -> Dict[str, Any]:
        """Get display configuration based on data quality."""
        if confidence == ConfidenceLevel.INSUFFICIENT:
            return {
                'show_insight': False,
                'show_chart': False,
                'show_disclaimer': True,
                'disclaimer_text': 'Not enough data to show this insight',
                'show_encouragement': True,
                'encouragement_text': 'Keep logging to unlock insights!',
                'alternative_insights': ['streak', 'milestone', 'completion_rate']
            }
        
        elif confidence == ConfidenceLevel.LOW:
            return {
                'show_insight': True,
                'show_chart': True,
                'chart_type': 'simple_bar',
                'show_disclaimer': True,
                'disclaimer_text': 'Early insight - log more for better accuracy',
                'confidence_badge': '⚠️ Limited data',
                'badge_color': 'orange',
                'show_data_points': True,
                'emphasize_gaps': True
            }
        
        elif confidence == ConfidenceLevel.MEDIUM:
            return {
                'show_insight': True,
                'show_chart': True,
                'chart_type': 'line_with_trend',
                'show_disclaimer': True,
                'disclaimer_text': 'Based on good data - log consistently for stronger insights',
                'confidence_badge': 'ℹ️ Good data',
                'badge_color': 'blue',
                'show_trend_line': True,
                'show_confidence_interval': False
            }
        
        elif confidence == ConfidenceLevel.HIGH:
            return {
                'show_insight': True,
                'show_chart': True,
                'chart_type': 'advanced_line',
                'show_disclaimer': False,
                'confidence_badge': '✓ High confidence',
                'badge_color': 'green',
                'show_trend_line': True,
                'show_confidence_interval': True,
                'show_predictions': True
            }
        
        else:  # VERY_HIGH
            return {
                'show_insight': True,
                'show_chart': True,
                'chart_type': 'advanced_interactive',
                'show_disclaimer': False,
                'confidence_badge': '✓✓ Very reliable',
                'badge_color': 'dark-green',
                'show_trend_line': True,
                'show_confidence_interval': True,
                'show_predictions': True,
                'show_correlations': True,
                'show_recommendations': True
            }
    
    @staticmethod
    def build_insight_summary(
        eligible_insights: List[Dict[str, Any]],
        max_display: int = 5
    ) -> Dict[str, Any]:
        """
        Build a summary of available insights for display.
        
        Args:
            eligible_insights: List of eligible insights (already sorted by priority)
            max_display: Maximum number of insights to highlight
        
        Returns:
            Summary with primary insight, secondary insights, and counts by tier
        """
        if not eligible_insights:
            return {
                'has_insights': False,
                'primary_insight': None,
                'secondary_insights': [],
                'total_available': 0,
                'by_tier': {
                    'tier_1': 0,
                    'tier_2': 0,
                    'tier_3': 0,
                    'tier_4': 0
                }
            }
        
        # Categorize by tier
        tier_1 = ['streak', 'milestone', 'recent_comparison', 'completion_rate']
        tier_2 = ['weekly_summary', 'simple_average', 'most_common', 'best_worst']
        tier_3 = ['trend_line', 'weekly_pattern', 'simple_correlation', 'consistency_score']
        tier_4 = ['multi_factor', 'prediction', 'personalized_recommendation', 'cyclical_detection']
        
        tier_counts = {
            'tier_1': sum(1 for i in eligible_insights if i['insight_type'] in tier_1),
            'tier_2': sum(1 for i in eligible_insights if i['insight_type'] in tier_2),
            'tier_3': sum(1 for i in eligible_insights if i['insight_type'] in tier_3),
            'tier_4': sum(1 for i in eligible_insights if i['insight_type'] in tier_4),
        }
        
        return {
            'has_insights': True,
            'primary_insight': eligible_insights[0],
            'secondary_insights': eligible_insights[1:max_display],
            'total_available': len(eligible_insights),
            'by_tier': tier_counts
        }