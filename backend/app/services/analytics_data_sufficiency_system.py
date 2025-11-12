from typing import Dict, List, Any, Optional
from datetime import datetime, timedelta
from enum import Enum


class ConfidenceLevel(Enum):
    """Confidence levels for analytics insights"""
    INSUFFICIENT = "insufficient"  # < min required
    LOW = "low"                     # Just above minimum
    MEDIUM = "medium"                # Decent sample size
    HIGH = "high"                    # Strong statistical basis
    VERY_HIGH = "very_high"          # Extensive data


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
    """
    Determines what analytics can be shown based on available data.
    """
    
    # Minimum entries required for each insight type
    MINIMUM_REQUIREMENTS = {
        # Tier 1: Always show (engagement)
        InsightType.STREAK: 1,
        InsightType.MILESTONE: 1,
        InsightType.RECENT_COMPARISON: 2,
        InsightType.COMPLETION_RATE: 1,
        
        # Tier 2: Light analysis
        InsightType.WEEKLY_SUMMARY: 4,
        InsightType.SIMPLE_AVERAGE: 4,
        InsightType.MOST_COMMON: 3,
        InsightType.BEST_WORST: 4,
        
        # Tier 3: Statistical
        InsightType.TREND_LINE: 14,
        InsightType.WEEKLY_PATTERN: 14,
        InsightType.SIMPLE_CORRELATION: 10,
        InsightType.CONSISTENCY_SCORE: 7,
        
        # Tier 4: Advanced
        InsightType.MULTI_FACTOR: 30,
        InsightType.PREDICTION: 30,
        InsightType.PERSONALIZED_REC: 30,
        InsightType.CYCLICAL_DETECTION: 21,
    }
    
    # Recommended entries for high confidence
    RECOMMENDED_REQUIREMENTS = {
        InsightType.WEEKLY_SUMMARY: 7,      # Daily for a week
        InsightType.TREND_LINE: 21,          # 3 weeks
        InsightType.WEEKLY_PATTERN: 28,      # 4 weeks
        InsightType.MULTI_FACTOR: 60,        # 2 months
    }
    
    @staticmethod
    def check_field_eligibility(
        field_name: str,
        entry_count: int,
        time_span_days: int,
        insight_type: InsightType
    ) -> Dict[str, Any]:
        """
        Check if a field has enough data for a specific insight.
        
        Args:
            field_name: Name of the field being analyzed
            entry_count: Number of entries with this field
            time_span_days: Days between first and last entry
            insight_type: Type of insight to generate
        
        Returns:
            Dictionary with eligibility info
        """
        min_required = DataSufficiencyChecker.MINIMUM_REQUIREMENTS[insight_type]
        recommended = DataSufficiencyChecker.RECOMMENDED_REQUIREMENTS.get(
            insight_type,
            min_required
        )
        
        # Check if minimum met
        is_eligible = entry_count >= min_required
        
        # Calculate confidence level
        if not is_eligible:
            confidence = ConfidenceLevel.INSUFFICIENT
            confidence_score = 0
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
        
        # Determine if frequency is adequate (at least 2x/week for trends)
        adequate_frequency = frequency >= (2 / 7)  # 2 times per week
        
        return {
            'field_name': field_name,
            'is_eligible': is_eligible,
            'confidence': confidence.value,
            'confidence_score': confidence_score,
            'entry_count': entry_count,
            'min_required': min_required,
            'recommended': recommended,
            'entries_needed': max(0, min_required - entry_count),
            'time_span_days': time_span_days,
            'logging_frequency': round(frequency, 2),
            'adequate_frequency': adequate_frequency,
            'message': DataSufficiencyChecker._get_message(
                entry_count, min_required, recommended, confidence
            )
        }
    
    @staticmethod
    def _get_message(
        entry_count: int,
        min_required: int,
        recommended: int,
        confidence: ConfidenceLevel
    ) -> str:
        """Generate user-friendly message about data sufficiency"""
        if entry_count < min_required:
            needed = min_required - entry_count
            return f"Log {needed} more time{'s' if needed > 1 else ''} to unlock this insight"
        elif confidence == ConfidenceLevel.LOW:
            return "Early insight - log more for accuracy"
        elif confidence == ConfidenceLevel.MEDIUM:
            more = recommended - entry_count
            return f"Good data! Log {more} more for stronger insights"
        elif confidence == ConfidenceLevel.HIGH:
            return "High confidence - reliable insight"
        else:
            return "Very strong data - highly reliable"
    
    @staticmethod
    def get_available_insights(
        field_entries: Dict[str, int],
        time_spans: Dict[str, int]
    ) -> Dict[str, List[InsightType]]:
        """
        Get all available insights for each field based on data.
        
        Args:
            field_entries: {field_name: entry_count}
            time_spans: {field_name: days_span}
        
        Returns:
            {field_name: [available_insight_types]}
        """
        available = {}
        
        for field_name, entry_count in field_entries.items():
            time_span = time_spans.get(field_name, 0)
            field_insights = []
            
            for insight_type in InsightType:
                result = DataSufficiencyChecker.check_field_eligibility(
                    field_name,
                    entry_count,
                    time_span,
                    insight_type
                )
                
                if result['is_eligible']:
                    field_insights.append({
                        'type': insight_type.value,
                        'confidence': result['confidence'],
                        'confidence_score': result['confidence_score']
                    })
            
            available[field_name] = field_insights
        
        return available


class AnalyticsDisplayStrategy:
    """
    Determines what to show users based on available data.
    """
    
    @staticmethod
    def get_display_config(entry_count: int, confidence: ConfidenceLevel) -> Dict[str, Any]:
        """
        Get display configuration based on data quality.
        
        Returns configuration for:
        - Whether to show charts
        - Chart type (line, bar, scatter)
        - Whether to show disclaimer
        - Visual indicators (confidence badges)
        """
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
                'show_data_points': True,  # Show actual dots on chart
                'emphasize_gaps': True     # Highlight missing days
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
    def prioritize_insights(
        available_insights: Dict[str, List[Dict[str, Any]]],
        max_display: int = 5
    ) -> List[Dict[str, Any]]:
        """
        Prioritize which insights to show first.
        
        Priority order:
        1. High confidence insights
        2. Most interesting patterns
        3. Actionable recommendations
        4. Engagement/motivation insights
        """
        all_insights = []
        
        for field_name, insights in available_insights.items():
            for insight in insights:
                all_insights.append({
                    'field_name': field_name,
                    **insight
                })
        
        # Sort by confidence score (descending)
        all_insights.sort(key=lambda x: x['confidence_score'], reverse=True)
        
        # Take top N
        return all_insights[:max_display]


# ============================================================================
# EXAMPLE USAGE
# ============================================================================

def example_usage():
    """Example of how to use the system"""
    
    # User has logged mood 5 times over 2 weeks
    field_entries = {
        'mood': 5,
        'sleep': 12,
        'energy': 3
    }
    
    time_spans = {
        'mood': 14,    # 14 days
        'sleep': 14,
        'energy': 7
    }
    
    # Check what insights are available
    checker = DataSufficiencyChecker()
    
    # Check specific insight
    result = checker.check_field_eligibility(
        field_name='mood',
        entry_count=5,
        time_span_days=14,
        insight_type=InsightType.TREND_LINE
    )
    
    print(f"Trend line for mood: {result['message']}")
    # Output: "Log 9 more times to unlock this insight"
    
    # Check what's available
    result = checker.check_field_eligibility(
        field_name='mood',
        entry_count=5,
        time_span_days=14,
        insight_type=InsightType.WEEKLY_SUMMARY
    )
    
    print(f"Weekly summary for mood: {result['message']}")
    # Output: "Good data! Log 2 more for stronger insights"
    
    # Get all available insights
    available = checker.get_available_insights(field_entries, time_spans)
    
    print("\nAvailable insights:")
    for field, insights in available.items():
        print(f"\n{field}:")
        for insight in insights:
            print(f"  - {insight['type']} (confidence: {insight['confidence']})")
    
    # Get display configuration
    display_config = AnalyticsDisplayStrategy.get_display_config(
        entry_count=5,
        confidence=ConfidenceLevel.MEDIUM
    )
    
    print(f"\nDisplay config: {display_config}")