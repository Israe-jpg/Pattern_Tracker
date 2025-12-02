from typing import Dict, List, Any, Optional, Tuple
from datetime import datetime, date, timedelta
from sqlalchemy import and_
import numpy as np
from scipy import stats
import matplotlib
matplotlib.use('Agg')  # Non-interactive backend
import matplotlib.pyplot as plt
import matplotlib.dates as mdates
import io

from app.services.analytics_data_sufficiency_system import DataSufficiencyChecker, InsightType, ConfidenceLevel, AnalyticsDisplayStrategy
from app.services.analytics_base import (
    AnalyticsDataExtractor,
    AnalyticsGrouper,
    AnalyticsStatsCalculator,
    NumericExtractor,
    FieldTypeDetector
)

from app import db
from app.models.tracking_data import TrackingData
from app.models.tracker import Tracker
from app.models.tracker_field import TrackerField
from app.models.tracker_user_field import TrackerUserField
from app.models.field_option import FieldOption




class StatisticalAnalyzer:
    """Performs statistical analysis on time series data."""
    
    @staticmethod
    def calculate_trend(x_values: np.ndarray, y_values: np.ndarray) -> Dict[str, Any]:
        """
        Calculate trend line using linear regression with user-friendly summary.
        
        Uses shared base layer for core statistics, then adds domain-specific
        user-friendly summary message.
        
        Returns:
            Dictionary with slope, intercept, r_value, p_value, std_err, and summary
        """
        # === USE SHARED BASE LAYER: Get core trend statistics ===
        trend_stats = AnalyticsStatsCalculator.calculate_trend(x_values, y_values)
        
        # === DOMAIN-SPECIFIC: Add user-friendly summary ===
        summary = StatisticalAnalyzer._generate_user_summary(
            trend_stats['direction'], trend_stats['strength'], trend_stats['confidence'],
            abs(trend_stats['correlation']), trend_stats['is_significant']
        )
        
        # Add summary to trend stats
        trend_stats['summary'] = summary
        
        return trend_stats
    
    @staticmethod
    def _generate_user_summary(
        direction: str,
        strength: str,
        confidence: str,
        abs_r_value: float,
        is_significant: bool
    ) -> str:
        """
        Generate user-friendly summary message explaining the trend.
        
        Args:
            direction: 'increasing', 'decreasing', or 'stable'
            strength: 'strong', 'moderate', 'weak', or 'none'
            confidence: 'high', 'medium', or 'low'
            abs_r_value: Absolute correlation value (0-1)
            is_significant: Whether trend is statistically significant
        
        Returns:
            Human-readable summary string
        """
        if direction == 'stable':
            if is_significant:
                return "Your data shows a stable trend with no significant change over time."
            else:
                return "Your data appears stable, but there's not enough evidence to confirm a clear pattern."
        
        # Build direction description
        direction_desc = {
            'increasing': 'increasing',
            'decreasing': 'decreasing'
        }.get(direction, 'changing')
        
        # Build strength description
        strength_desc = {
            'strong': 'strong',
            'moderate': 'moderate',
            'weak': 'weak'
        }.get(strength, 'some')
        
        # Build confidence description
        if confidence == 'high':
            confidence_desc = "high confidence"
        elif confidence == 'medium':
            confidence_desc = "moderate confidence"
        else:
            confidence_desc = "low confidence"
        
        # Build significance message
        if is_significant:
            significance_msg = "This trend is statistically significant"
        else:
            significance_msg = "This trend may not be statistically significant"
        
        # Combine into readable message
        if strength == 'none':
            return f"Your data shows a {direction_desc} trend, but the pattern is not clear enough to be confident."
        
        return (
            f"Your data shows a {strength_desc} {direction_desc} trend "
            f"with {confidence_desc}. {significance_msg}."
        )
    
    @staticmethod
    def calculate_descriptive_stats(
        values: List[float], 
        field_name: Optional[str] = None, 
        option: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Calculate comprehensive descriptive statistics.
        
        Uses shared base layer for core stats, then adds domain-specific features
        (variance, user-friendly descriptions).
        
        Args:
            values: List of numeric values
            field_name: Name of the field (e.g., 'sleep')
            option: Name of the option (e.g., 'hours', 'quality')
        
        Returns both raw values and user-friendly descriptions.
        """
        # === USE SHARED BASE LAYER: Get core statistics ===
        core_stats = AnalyticsStatsCalculator.calculate_numeric_stats(values)
        
        if not core_stats:
            return {}
        
        # === DOMAIN-SPECIFIC: Add variance (not in base layer) ===
        arr = np.array([v for v in values if v is not None and isinstance(v, (int, float))])
        variance_val = round(float(np.var(arr)), 2)
        
        # Build display name for descriptions
        display_name = StatisticalAnalyzer._build_display_name(field_name, option)
        
        # Generate user-friendly descriptions
        descriptions = StatisticalAnalyzer._generate_stat_descriptions(
            core_stats['mean'], core_stats['median'], core_stats['std_dev'],
            core_stats['min'], core_stats['max'], core_stats['range'],
            core_stats['q1'], core_stats['q3'], core_stats['count'], display_name
        )
        
        # Combine core stats with domain-specific additions
        return {
            **core_stats,  # Include all core stats from base layer
            'variance': variance_val,  # Domain-specific addition
            'descriptions': descriptions  # Domain-specific: user-friendly explanations
        }
    
    @staticmethod
    def _build_display_name(field_name: Optional[str], option: Optional[str]) -> str:
        """
        Build a user-friendly display name from field and option.
        
        Examples:
            field_name='sleep', option='hours' -> 'sleep hours'
            field_name='energy', option='level' -> 'energy level'
            field_name='mood', option=None -> 'mood'
        """
        if not field_name:
            return "your values"
        
        # Convert field_name from snake_case to readable
        field_display = field_name.replace('_', ' ').title()
        
        if option:
            # Convert option from snake_case to readable
            option_display = option.replace('_', ' ').title()
            return f"{field_display} {option_display}"
        else:
            return field_display
    
    @staticmethod
    def _generate_stat_descriptions(
        mean: float, median: float, std_dev: float,
        min_val: float, max_val: float, range_val: float,
        q1: float, q3: float, count: int, display_name: str
    ) -> Dict[str, str]:
        """
        Generate user-friendly descriptions for each statistic.
        
        Args:
            display_name: User-friendly name (e.g., "Sleep Hours", "Energy Level")
        
        Returns:
            Dictionary with plain-language explanations
        """
        # Determine consistency level
        if std_dev < 0.5:
            consistency = "very consistent"
        elif std_dev < 1.0:
            consistency = "fairly consistent"
        elif std_dev < 2.0:
            consistency = "somewhat variable"
        else:
            consistency = "highly variable"
        
        # Determine if mean and median are close (indicates normal distribution)
        mean_median_diff = abs(mean - median)
        if mean_median_diff < 0.1:
            distribution_note = f"Your {display_name.lower()} is well-balanced."
        elif mean > median:
            distribution_note = f"You have some high {display_name.lower()} pulling the average up."
        else:
            distribution_note = f"You have some low {display_name.lower()} pulling the average down."
        
        return {
            'count': f"You have {count} data points for {display_name.lower()} in this analysis.",
            'mean': f"Your average {display_name.lower()} is {mean}. This is the typical value you can expect.",
            'median': f"Your middle {display_name.lower()} is {median}. Half your values are above this, half are below.",
            'std_dev': f"Your {display_name.lower()} is {consistency} (standard deviation: {std_dev}). Lower values mean more consistency.",
            'variance': f"Your {display_name.lower()} spread is {round(std_dev**2, 2)} (variance). This measures how much your values vary.",
            'min': f"Your lowest {display_name.lower()} was {min_val}.",
            'max': f"Your highest {display_name.lower()} was {max_val}.",
            'range': f"Your {display_name.lower()} spans {range_val} units (from {min_val} to {max_val}).",
            'q1': f"25% of your {display_name.lower()} are {q1} or lower. This represents your lower range.",
            'q3': f"75% of your {display_name.lower()} are {q3} or lower. This represents your upper range.",
            'summary': f"On average, your {display_name.lower()} is {mean} with a middle value of {median}. {distribution_note} Your data shows {consistency} with values ranging from {min_val} to {max_val}."
        }




class TrendLineAnalyzer:
    """
    Analyzer for NUMERIC data - calculates trend lines using linear regression.
    """
    
    TIME_RANGE_DAYS = {
        'week': 7,
        '2_weeks': 14,
        '3_weeks': 21,
        'month': 30,
        '3_months': 90,
        '6_months': 180,
        'year': 365
    }
    
    @staticmethod
    def analyze(
        field_name: str,
        tracker_id: int,
        time_range: str = 'all',
        min_data_points: int = 2,
        option: Optional[str] = None,
        skip_sufficiency_check: bool = False,  # NEW: Allow bypassing check
        start_date: Optional[date] = None,  # Optional: custom start date
        end_date: Optional[date] = None  # Optional: custom end date
    ) -> Dict[str, Any]:
        """
        Analyze trend line for a specific field.
        
        Args:
            field_name: Field to analyze
            tracker_id: Tracker ID
            time_range: 'week', 'month', 'all', etc.
            min_data_points: Minimum points required for analysis
            option: Specific option name to analyze (e.g., 'hours', 'quality')
            skip_sufficiency_check: If True, skip data sufficiency validation
        
        Returns:
            Complete trend analysis with data, statistics, and metadata
        """
        try:
            # Validate tracker
            tracker = Tracker.query.get(tracker_id)
            if not tracker:
                raise ValueError(f"Tracker {tracker_id} not found")
            
            # Auto-detect field type to ensure it's numeric
            field_type, detection_reason = FieldTypeDetector.detect_field_type(
                field_name, tracker_id, option
            )
            
            if field_type != 'numeric':
                raise ValueError(
                    f"Field '{field_name}' is not numeric. {detection_reason}. "
                    f"Use CategoricalAnalyzer instead."
                )
            
            # Get all numeric options for this field
            numeric_option_names = NumericExtractor.get_numeric_option_names(
                field_name, tracker_id
            )
            
            # Validate option if provided
            if option:
                if option not in numeric_option_names:
                    available = ', '.join(numeric_option_names) if numeric_option_names else 'none'
                    raise ValueError(
                        f"Option '{option}' is not a numeric option for field '{field_name}'. "
                        f"Available numeric options: {available}"
                    )
                numeric_option_names = [option]
            elif not numeric_option_names:
                is_valid, error_msg = NumericExtractor.validate_numeric_field(
                    field_name, tracker_id
                )
                if not is_valid:
                    raise ValueError(error_msg)
            
            # Calculate date range
            # Use provided dates if available, otherwise calculate from time_range
            if start_date and end_date:
                # Both dates provided - use them as-is
                pass
            elif start_date and not end_date:
                # Start date provided but no end date - calculate end_date from start_date + time_range
                if time_range != 'all':
                    days = TrendLineAnalyzer.TIME_RANGE_DAYS.get(time_range)
                    if days:
                        end_date = start_date + timedelta(days=days)
                    else:
                        end_date = date.today()
                else:
                    end_date = date.today()
            elif not start_date and end_date:
                # End date provided but no start date - calculate start_date from end_date - time_range
                end_date = end_date if end_date else date.today()
                start_date = TrendLineAnalyzer._calculate_start_date(time_range, end_date)
            else:
                # Neither provided - calculate from time_range relative to today
                end_date = date.today()
                start_date = TrendLineAnalyzer._calculate_start_date(time_range, end_date)
            
            # Fetch entries
            entries = TrendLineAnalyzer._fetch_entries(
                tracker_id, field_name, start_date, end_date
            )
            
            if not entries:
                return TrendLineAnalyzer._no_data_response(
                    field_name, time_range,
                    "No data available for this field in the specified time range"
                )
            
            # === USE SHARED BASE LAYER: Extract field values ===
            extracted_data = AnalyticsDataExtractor.extract_field_values(
                entries, field_name, option, tracker_id
            )
            
            # Convert to data_points format (for backward compatibility)
            data_points = []
            for item in extracted_data:
                if item['value'] is not None:
                    data_points.append({
                        'date': item['entry_date'].isoformat(),
                        'value': item['value'],
                        'entry_id': item['entry_id']
                    })
            
            # Check minimum data points
            if len(data_points) < min_data_points:
                return TrendLineAnalyzer._insufficient_data_response(
                    field_name, time_range, data_points, min_data_points
                )
            
            # Data Sufficiency Check
            if not skip_sufficiency_check:
                time_span_days = (
                    datetime.fromisoformat(data_points[-1]['date']).date() -
                    datetime.fromisoformat(data_points[0]['date']).date()
                ).days + 1
                
                sufficiency_result = DataSufficiencyChecker.check_field_eligibility(
                    field_name=field_name,
                    entry_count=len(data_points),
                    time_span_days=time_span_days,
                    insight_type=InsightType.TREND_LINE,
                    option=option
                )
                
                # Add sufficiency info to response metadata
                sufficiency_info = {
                    'is_eligible': sufficiency_result.get('is_eligible', False),
                    'confidence': sufficiency_result.get('confidence', 'insufficient'),
                    'confidence_score': sufficiency_result.get('confidence_score', 0.0),
                    'entry_count': sufficiency_result.get('entry_count', len(data_points)),
                    'min_required': sufficiency_result.get('min_required', 14),
                    'message': sufficiency_result.get('message', '')
                }
                
                # If data is insufficient, return early with warning
                if not sufficiency_result.get('is_eligible', False):
                    return {
                        'field_name': field_name,
                        'time_range': time_range,
                        'data_points': data_points,
                        'trend': None,
                        'trend_line_points': [],
                        'statistics': {'total_entries': len(data_points)},
                        'data_sufficiency': sufficiency_info,
                        'message': sufficiency_result.get('message', 'Insufficient data for reliable trend analysis.')
                    }
            
            # Determine which option was used
            result_option = option if option else (numeric_option_names[0] if numeric_option_names else None)
            
            # Perform statistical analysis
            analysis = TrendLineAnalyzer._perform_analysis(data_points, field_name, result_option)
            
            # Build response
            response = {
                'field_name': field_name,
                'time_range': time_range,
                'data_points': data_points,
                'trend': analysis['trend'],
                'trend_line_points': analysis['trend_points'],
                'statistics': analysis['statistics'],
                'metadata': {
                    'date_range': {
                        'start_date': data_points[0]['date'],
                        'end_date': data_points[-1]['date'],
                        'days_span': (
                            datetime.fromisoformat(data_points[-1]['date']).date() -
                            datetime.fromisoformat(data_points[0]['date']).date()
                        ).days + 1
                    },
                    'logging_frequency': round(
                        len(data_points) / max(
                            (datetime.fromisoformat(data_points[-1]['date']).date() -
                             datetime.fromisoformat(data_points[0]['date']).date()).days + 1,
                            1
                        ),
                        2
                    )
                }
            }
            
            # Add data sufficiency info if check was performed
            if not skip_sufficiency_check:
                response['data_sufficiency'] = sufficiency_info
            
            # Add option info
            if option:
                response['option'] = option
            elif numeric_option_names:
                response['option'] = numeric_option_names[0] if len(numeric_option_names) == 1 else None
                if len(numeric_option_names) > 1:
                    response['available_options'] = numeric_option_names
            
            return response
            
        except ValueError as e:
            raise e
        except Exception as e:
            raise ValueError(f"Failed to analyze trend: {str(e)}")
    
    @staticmethod
    def _calculate_start_date(time_range: str, end_date: date) -> Optional[date]:
        """Calculate start date based on time range."""
        if time_range == 'all':
            return None
        
        days = TrendLineAnalyzer.TIME_RANGE_DAYS.get(time_range)
        if not days:
            raise ValueError(
                f"Invalid time_range. Valid options: {', '.join(TrendLineAnalyzer.TIME_RANGE_DAYS.keys())}, all"
            )
        
        return end_date - timedelta(days=days)
    
    @staticmethod
    def _fetch_entries(
        tracker_id: int,
        field_name: str,
        start_date: Optional[date],
        end_date: date
    ) -> List[TrackingData]:
        """Fetch tracking entries for the specified range."""
        query = TrackingData.query.filter_by(tracker_id=tracker_id)
        
        if start_date:
            query = query.filter(
                and_(
                    TrackingData.entry_date >= start_date,
                    TrackingData.entry_date <= end_date
                )
            )
        
        all_entries = query.order_by(TrackingData.entry_date.asc()).all()
        
        # Filter entries with the field
        return [e for e in all_entries if e.data and field_name in e.data]
    
    @staticmethod
    def _perform_analysis(
        data_points: List[Dict], 
        field_name: str, 
        option: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Perform complete statistical analysis on data points.
        
        Args:
            data_points: List of data point dictionaries
            field_name: Name of the field being analyzed
            option: Optional specific option name (e.g., 'hours', 'quality')
        """
        # Extract dates and values
        dates = [datetime.fromisoformat(dp['date']).date() for dp in data_points]
        values = [dp['value'] for dp in data_points]
        
        # Convert dates to numeric (days since first date)
        first_date = dates[0]
        x_values = np.array([(d - first_date).days for d in dates])
        y_values = np.array(values)
        
        # === USE SHARED BASE LAYER: Calculate trend ===
        trend_stats = AnalyticsStatsCalculator.calculate_trend(x_values, y_values)
        
        # === DOMAIN-SPECIFIC: Add user-friendly summary ===
        summary = StatisticalAnalyzer._generate_user_summary(
            trend_stats['direction'], trend_stats['strength'], trend_stats['confidence'],
            abs(trend_stats['correlation']), trend_stats['is_significant']
        )
        trend_stats['summary'] = summary  # Add domain-specific user-friendly message
        
        # Generate trend line points
        trend_points = []
        for i, x in enumerate(x_values):
            trend_value = trend_stats['intercept'] + (trend_stats['slope'] * x)
            trend_points.append({
                'date': dates[i].isoformat(),
                'value': round(trend_value, 2)
            })
        
        # Calculate descriptive statistics with field/option context
        descriptive_stats = StatisticalAnalyzer.calculate_descriptive_stats(
            values, field_name, option
        )
        
        # Combine trend stats with descriptive
        trend_stats_output = {
            k: v for k, v in trend_stats.items()
            if k not in ['intercept', 'std_error']  # Keep these internal
        }
        
        return {
            'trend': trend_stats_output,
            'trend_points': trend_points,
            'statistics': {**descriptive_stats, 'total_entries': len(data_points)}
        }
    
    @staticmethod
    def _no_data_response(
        field_name: str,
        time_range: str,
        message: str
    ) -> Dict[str, Any]:
        """Response when no data is available."""
        return {
            'field_name': field_name,
            'time_range': time_range,
            'data_points': [],
            'trend': None,
            'statistics': {'total_entries': 0},
            'message': message
        }
    
    @staticmethod
    def _insufficient_data_response(
        field_name: str,
        time_range: str,
        data_points: List[Dict],
        min_required: int
    ) -> Dict[str, Any]:
        """Response when insufficient data points."""
        return {
            'field_name': field_name,
            'time_range': time_range,
            'data_points': data_points,
            'trend': None,
            'trend_line_points': [],  # Empty list for consistency
            'statistics': {'total_entries': len(data_points)},
            'message': f'Need at least {min_required} data points to calculate trend (found {len(data_points)})'
        }


class ChartGenerator:
    """Generates matplotlib charts for trend visualization."""

    @staticmethod
    def generate_trend_chart(
        field_name: str,
        tracker_id: int,
        time_range: str = 'all',
        option: Optional[str] = None,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None
    ) -> bytes:
        """
        Generate PNG chart showing data points and trend line.
        
        Args:
            field_name: Field to analyze
            tracker_id: Tracker ID
            time_range: Time range string
            option: Specific numeric option to analyze (e.g., 'hours', 'quality')
        
        Returns:
            PNG image as bytes
        """
        try:
            # Get trend data (skip sufficiency check for chart - we just need 2+ points)
            result = TrendLineAnalyzer.analyze(
                field_name, tracker_id, time_range, option=option,
                start_date=start_date, end_date=end_date,
                skip_sufficiency_check=True  # Allow chart with just 2+ data points
            )
            
            # Handle insufficient data or missing trend data
            if not result.get('data_points') or len(result['data_points']) < 2:
                return ChartGenerator._generate_error_chart(
                    result.get('message', 'Insufficient data for chart')
                )
            
            # Check if trend_line_points exists
            if 'trend_line_points' not in result or not result.get('trend_line_points'):
                return ChartGenerator._generate_error_chart(
                    'Trend line points not available. Data may be insufficient for trend analysis.'
                )
            
            # Check if trend info exists
            if 'trend' not in result or not result.get('trend'):
                return ChartGenerator._generate_error_chart(
                    'Trend information not available. Unable to generate chart.'
                )
            
            data_points = result['data_points']
            trend_points = result.get('trend_line_points', [])
            trend_info = result.get('trend', {})
            
            # Validate trend_points structure
            if not isinstance(trend_points, list) or len(trend_points) == 0:
                return ChartGenerator._generate_error_chart(
                    'Trend line points not available. Unable to generate chart.'
                )
            
            # Validate trend_points have required structure
            if not all('value' in tp for tp in trend_points):
                return ChartGenerator._generate_error_chart(
                    'Invalid trend line points structure. Unable to generate chart.'
                )
            
            # Get option from result (may be set by analyze method)
            result_option = result.get('option') or option
            
            # Extract dates and values
            dates = [datetime.fromisoformat(dp['date']).date() for dp in data_points]
            values = [dp['value'] for dp in data_points]
            trend_values = [tp['value'] for tp in trend_points]
            
            # Ensure trend_values and values have same length
            if len(trend_values) != len(values):
                return ChartGenerator._generate_error_chart(
                    f'Mismatch between data points ({len(values)}) and trend points ({len(trend_values)}). Unable to generate chart.'
                )
            
            # Create figure
            fig, ax = plt.subplots(figsize=(12, 7))
            
            # Convert to datetime objects for matplotlib
            date_objs = [datetime.combine(d, datetime.min.time()) for d in dates]
            
            # Plot actual data
            ax.plot(date_objs, values, 'o-', color='#3498db',
                   label='Actual Data', linewidth=2.5, markersize=8,
                   markeredgecolor='white', markeredgewidth=1.5, alpha=0.8)
            
            # Plot trend line
            ax.plot(date_objs, trend_values, '--', color='#e74c3c',
                   label=f'Trend ({trend_info["direction"]})', linewidth=2.5, alpha=0.9)
            
            # Styling
            ax.set_xlabel('Date', fontsize=13, fontweight='bold', labelpad=10)
            
            # Build title and y-label with option info
            field_display = field_name.replace("_", " ").title()
            option_display = result_option.replace("_", " ").title() if result_option else None
            if option_display:
                title = f'{field_display} - {option_display} - Trend Analysis'
                ax.set_ylabel(option_display, fontsize=13, fontweight='bold', labelpad=10)
            else:
                title = f'{field_display} - Trend Analysis'
                ax.set_ylabel('Value', fontsize=13, fontweight='bold', labelpad=10)
            subtitle = f'({time_range.replace("_", " ").title()} | r={trend_info["correlation"]:.2f} | p={trend_info["p_value"]:.4f})'
            ax.set_title(f'{title}\n{subtitle}', fontsize=15, fontweight='bold', pad=20)
            
            ax.legend(loc='best', fontsize=11, framealpha=0.9)
            ax.grid(True, alpha=0.3, linestyle='--', linewidth=0.7)
            
            # Format x-axis
            ax.xaxis.set_major_formatter(mdates.DateFormatter('%Y-%m-%d'))
            ax.xaxis.set_major_locator(mdates.AutoDateLocator())
            plt.xticks(rotation=45, ha='right')
            
            # Add confidence indicator
            confidence_colors = {'high': 'green', 'medium': 'orange', 'low': 'red'}
            confidence_text = f"Confidence: {trend_info['confidence'].title()}"
            ax.text(0.02, 0.98, confidence_text,
                   transform=ax.transAxes,
                   fontsize=10,
                   verticalalignment='top',
                   bbox=dict(boxstyle='round', facecolor=confidence_colors[trend_info['confidence']], alpha=0.3))
            
            plt.tight_layout()
            
            # Save to bytes
            with io.BytesIO() as buffer:
                plt.savefig(buffer, format='png', dpi=120, bbox_inches='tight')
                buffer.seek(0)
                image_data = buffer.getvalue()
            
            plt.close(fig)
            return image_data
            
        except Exception as e:
            return ChartGenerator._generate_error_chart(f'Error: {str(e)}')

    @staticmethod
    def _generate_error_chart(message: str) -> bytes:
        """Generate error message chart."""
        fig, ax = plt.subplots(figsize=(10, 6))
        ax.text(0.5, 0.5, message,
               ha='center', va='center', fontsize=14,
               bbox=dict(boxstyle='round', facecolor='#ffcccc', alpha=0.8))
        ax.axis('off')
        
        with io.BytesIO() as buffer:
            plt.savefig(buffer, format='png', dpi=100)
            buffer.seek(0)
            image_data = buffer.getvalue()
        
        plt.close(fig)
        return image_data
    
    @staticmethod
    def generate_scatter_chart(
        field_name: str,
        tracker_id: int,
        time_range: str = 'all',
        option: Optional[str] = None,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None
    ) -> bytes:
        """
        Generate scatter plot chart for numeric data.
        
        Returns:
            PNG image as bytes
        """
        try:
            # Get trend data (skip sufficiency check for chart - we just need 2+ points)
            result = TrendLineAnalyzer.analyze(
                field_name, tracker_id, time_range, option=option,
                start_date=start_date, end_date=end_date,
                skip_sufficiency_check=True
            )
            
            # Handle insufficient data
            if not result.get('data_points') or len(result['data_points']) < 2:
                return ChartGenerator._generate_error_chart(
                    result.get('message', 'Insufficient data for chart')
                )
            
            data_points = result['data_points']
            
            # Extract dates and values
            dates = [datetime.fromisoformat(dp['date']).date() for dp in data_points]
            values = [dp['value'] for dp in data_points]
            
            # Create figure
            fig, ax = plt.subplots(figsize=(12, 7))
            
            # Convert to datetime objects for matplotlib
            date_objs = [datetime.combine(d, datetime.min.time()) for d in dates]
            
            # Plot scatter
            ax.scatter(date_objs, values, color='#3498db', s=100, alpha=0.6,
                     edgecolors='white', linewidths=1.5, zorder=3)
            
            # Styling
            ax.set_xlabel('Date', fontsize=13, fontweight='bold', labelpad=10)
            
            # Build title and y-label with option info
            field_display = field_name.replace("_", " ").title()
            result_option = result.get('option') or option
            option_display = result_option.replace("_", " ").title() if result_option else None
            if option_display:
                title = f'{field_display} - {option_display} - Scatter Plot'
                ax.set_ylabel(option_display, fontsize=13, fontweight='bold', labelpad=10)
            else:
                title = f'{field_display} - Scatter Plot'
                ax.set_ylabel('Value', fontsize=13, fontweight='bold', labelpad=10)
            
            subtitle = f'({time_range.replace("_", " ").title()} | {len(data_points)} data points)'
            ax.set_title(f'{title}\n{subtitle}', fontsize=15, fontweight='bold', pad=20)
            
            ax.grid(True, alpha=0.3, linestyle='--', linewidth=0.7)
            
            # Format x-axis
            ax.xaxis.set_major_formatter(mdates.DateFormatter('%Y-%m-%d'))
            ax.xaxis.set_major_locator(mdates.AutoDateLocator())
            plt.xticks(rotation=45, ha='right')
            
            plt.tight_layout()
            
            # Save to bytes
            with io.BytesIO() as buffer:
                plt.savefig(buffer, format='png', dpi=120, bbox_inches='tight')
                buffer.seek(0)
                image_data = buffer.getvalue()
            
            plt.close(fig)
            return image_data
            
        except Exception as e:
            return ChartGenerator._generate_error_chart(f'Error: {str(e)}')
    
    @staticmethod
    def generate_box_plot_chart(
        field_name: str,
        tracker_id: int,
        time_range: str = 'all',
        option: Optional[str] = None,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None
    ) -> bytes:
        """
        Generate box plot chart for numeric data distribution.
        
        Returns:
            PNG image as bytes
        """
        try:
            # Get trend data (skip sufficiency check for chart - we just need 2+ points)
            result = TrendLineAnalyzer.analyze(
                field_name, tracker_id, time_range, option=option,
                start_date=start_date, end_date=end_date,
                skip_sufficiency_check=True
            )
            
            # Handle insufficient data
            if not result.get('data_points') or len(result['data_points']) < 2:
                return ChartGenerator._generate_error_chart(
                    result.get('message', 'Insufficient data for chart')
                )
            
            data_points = result['data_points']
            stats = result.get('statistics', {})
            
            # Extract values
            values = [dp['value'] for dp in data_points]
            
            # Create figure
            fig, ax = plt.subplots(figsize=(10, 7))
            
            # Create box plot
            bp = ax.boxplot(values, vert=True, patch_artist=True,
                           boxprops=dict(facecolor='#3498db', alpha=0.7),
                           medianprops=dict(color='#e74c3c', linewidth=2),
                           whiskerprops=dict(color='#34495e', linewidth=1.5),
                           capprops=dict(color='#34495e', linewidth=1.5))
            
            # Styling
            ax.set_ylabel('Value', fontsize=13, fontweight='bold', labelpad=10)
            
            # Build title with option info
            field_display = field_name.replace("_", " ").title()
            result_option = result.get('option') or option
            option_display = result_option.replace("_", " ").title() if result_option else None
            if option_display:
                title = f'{field_display} - {option_display} - Distribution (Box Plot)'
            else:
                title = f'{field_display} - Distribution (Box Plot)'
            
            subtitle = f'({time_range.replace("_", " ").title()} | Median: {stats.get("median", "N/A")} | Mean: {stats.get("mean", "N/A")})'
            ax.set_title(f'{title}\n{subtitle}', fontsize=15, fontweight='bold', pad=20)
            
            # Add statistics text
            stats_text = (
                f'Min: {stats.get("min", "N/A")} | '
                f'Q1: {stats.get("q1", "N/A")} | '
                f'Median: {stats.get("median", "N/A")} | '
                f'Q3: {stats.get("q3", "N/A")} | '
                f'Max: {stats.get("max", "N/A")}'
            )
            ax.text(0.5, 0.02, stats_text, transform=ax.transAxes,
                   ha='center', fontsize=10, bbox=dict(boxstyle='round', facecolor='wheat', alpha=0.5))
            
            ax.grid(True, alpha=0.3, linestyle='--', linewidth=0.7, axis='y')
            ax.set_xticklabels(['Distribution'])
            
            plt.tight_layout()
            
            # Save to bytes
            with io.BytesIO() as buffer:
                plt.savefig(buffer, format='png', dpi=120, bbox_inches='tight')
                buffer.seek(0)
                image_data = buffer.getvalue()
            
            plt.close(fig)
            return image_data
            
        except Exception as e:
            return ChartGenerator._generate_error_chart(f'Error: {str(e)}')


class CategoricalAnalyzer:
    """
    Analyzer for NON-NUMERIC data - calculates frequency and distribution patterns.
    
    Use this for:
    - Categorical fields (strings, enums)
    - Boolean fields (yes/no)
    - Array fields (multiple choice)
    
    Returns: Bar chart with frequency analysis
    """
    
    TIME_RANGE_DAYS = {
        'week': 7,
        '2_weeks': 14,
        '3_weeks': 21,
        'month': 30,
        '3_months': 90,
        '6_months': 180,
        'year': 365
    }
    
    @staticmethod
    def analyze(
        field_name: str,
        tracker_id: int,
        time_range: str = 'all',
        option: Optional[str] = None,
        start_date: Optional[date] = None,  # Optional: custom start date
        end_date: Optional[date] = None  # Optional: custom end date
    ) -> Dict[str, Any]:
        """
        Analyze categorical/non-numeric field patterns.
        
        Args:
            field_name: Field to analyze
            tracker_id: Tracker ID
            time_range: 'week', 'month', 'all', etc.
            option: Specific option name to analyze (e.g., 'physical', 'emotional')
        
        Returns:
            Frequency analysis with distribution patterns
        """
        try:
            # Validate tracker
            tracker = Tracker.query.get(tracker_id)
            if not tracker:
                raise ValueError(f"Tracker {tracker_id} not found")
            
            # Calculate date range
            # Use provided dates if available, otherwise calculate from time_range
            if start_date and end_date:
                # Both dates provided - use them as-is
                pass
            elif start_date and not end_date:
                # Start date provided but no end date - calculate end_date from start_date + time_range
                if time_range != 'all':
                    days = CategoricalAnalyzer.TIME_RANGE_DAYS.get(time_range)
                    if days:
                        end_date = start_date + timedelta(days=days)
                    else:
                        end_date = date.today()
                else:
                    end_date = date.today()
            elif not start_date and end_date:
                # End date provided but no start date - calculate start_date from end_date - time_range
                end_date = end_date if end_date else date.today()
                start_date = CategoricalAnalyzer._calculate_start_date(time_range, end_date)
            else:
                # Neither provided - calculate from time_range relative to today
                end_date = date.today()
                start_date = CategoricalAnalyzer._calculate_start_date(time_range, end_date)
            
            # Fetch entries
            entries = CategoricalAnalyzer._fetch_entries(
                tracker_id, field_name, start_date, end_date
            )
            
            if not entries:
                return CategoricalAnalyzer._no_data_response(
                    field_name, time_range,
                    "No data available for this field in the specified time range"
                )
            
            # === USE SHARED BASE LAYER: Extract field values ===
            extracted_data = AnalyticsDataExtractor.extract_field_values(
                entries, field_name, option, tracker_id
            )
            
            if not extracted_data:
                return CategoricalAnalyzer._no_data_response(
                    field_name, time_range,
                    "No valid categorical data found for this field"
                )
            
            # Extract values for frequency counting
            categorical_values = [item['value'] for item in extracted_data if item['value'] is not None]
            
            if not categorical_values:
                return CategoricalAnalyzer._no_data_response(
                    field_name, time_range,
                    "No valid categorical data found for this field"
                )
            
            # === USE SHARED BASE LAYER: Calculate categorical statistics ===
            stats = AnalyticsStatsCalculator.calculate_categorical_stats(categorical_values)
            
            # Build frequency dict from stats (for backward compatibility)
            frequency_data = stats.get('frequency', {})
            
            # Sort by frequency (descending) for backward compatibility
            frequency_data = dict(sorted(frequency_data.items(), key=lambda x: x[1], reverse=True))
            
            # Add backward compatibility fields to stats
            if stats:
                # Add total_count (alias for count)
                stats['total_count'] = stats.get('count', 0)
                
                # Add least_common if we have frequency data
                if frequency_data:
                    least_common_item = min(frequency_data.items(), key=lambda x: x[1])
                    total = sum(frequency_data.values())
                    stats['least_common'] = {
                        'value': least_common_item[0],
                        'count': least_common_item[1],
                        'percentage': round((least_common_item[1] / total) * 100, 1)
                    }
                    
                    # Add diversity
                    unique_count = len(frequency_data)
                    stats['diversity'] = 'high' if unique_count > 5 else 'medium' if unique_count > 2 else 'low'
            
            # Build response
            display_name = CategoricalAnalyzer._build_display_name(field_name, option)
            
            return {
                'field_name': field_name,
                'option': option,
                'time_range': time_range,
                'display_name': display_name,
                'frequency': frequency_data,
                'statistics': stats,
                'metadata': {
                    'total_entries': len(entries),
                    'unique_values': len(frequency_data),
                    'date_range': {
                        'start_date': entries[0].entry_date.isoformat(),
                        'end_date': entries[-1].entry_date.isoformat()
                    }
                }
            }
            
        except ValueError as e:
            raise e
        except Exception as e:
            raise ValueError(f"Failed to analyze categorical data: {str(e)}")
    
    @staticmethod
    def _calculate_start_date(time_range: str, end_date: date) -> Optional[date]:
        """Calculate start date based on time range."""
        if time_range == 'all':
            return None
        
        days = CategoricalAnalyzer.TIME_RANGE_DAYS.get(time_range)
        if not days:
            raise ValueError(
                f"Invalid time_range. Valid options: {', '.join(CategoricalAnalyzer.TIME_RANGE_DAYS.keys())}, all"
            )
        
        return end_date - timedelta(days=days)
    
    @staticmethod
    def _fetch_entries(
        tracker_id: int,
        field_name: str,
        start_date: Optional[date],
        end_date: date
    ) -> List[TrackingData]:
        """Fetch entries containing the field."""
        query = TrackingData.query.filter_by(tracker_id=tracker_id)
        
        if start_date:
            query = query.filter(
                and_(
                    TrackingData.entry_date >= start_date,
                    TrackingData.entry_date <= end_date
                )
            )
        
        all_entries = query.order_by(TrackingData.entry_date.asc()).all()
        
        # Filter entries with the field
        return [e for e in all_entries if e.data and field_name in e.data]
    
    # NOTE: _extract_frequencies, _extract_categorical_values, and _calculate_categorical_stats
    # have been removed. They are now handled by the shared base layer:
    # - AnalyticsDataExtractor.extract_field_values() for extraction
    # - AnalyticsStatsCalculator.calculate_categorical_stats() for statistics
    
    @staticmethod
    def _build_display_name(field_name: str, option: Optional[str] = None) -> str:
        """Build user-friendly display name."""
        field_display = field_name.replace('_', ' ').title()
        
        if option:
            option_display = option.replace('_', ' ').title()
            return f"{field_display} {option_display}"
        else:
            return field_display
    
    @staticmethod
    def _no_data_response(
        field_name: str,
        time_range: str,
        message: str
    ) -> Dict[str, Any]:
        """Response when no data is available."""
        return {
            'field_name': field_name,
            'time_range': time_range,
            'frequency': {},
            'statistics': {},
            'message': message
        }
    
    @staticmethod
    def generate_bar_chart(
        field_name: str,
        tracker_id: int,
        time_range: str = 'all',
        option: Optional[str] = None,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None
    ) -> bytes:
        """
        Generate bar chart showing frequency distribution of categorical data.
        
        Returns:
            PNG image as bytes
        """
        try:
            # Get frequency data
            result = CategoricalAnalyzer.analyze(
                field_name, tracker_id, time_range, option,
                start_date=start_date, end_date=end_date
            )
            
            # Handle insufficient data
            if not result.get('frequency') or result.get('message'):
                return ChartGenerator._generate_error_chart(
                    result.get('message', 'Insufficient data for chart')
                )
            
            frequency = result['frequency']
            stats = result['statistics']
            display_name = result.get('display_name', field_name)
            
            # Create figure
            fig, ax = plt.subplots(figsize=(12, 7))
            
            # Prepare data for chart
            values = list(frequency.keys())
            counts = list(frequency.values())
            
            # Create bar chart
            bars = ax.bar(values, counts, color='#3498db', alpha=0.8, edgecolor='white', linewidth=1.5)
            
            # Add value labels on bars
            for bar in bars:
                height = bar.get_height()
                ax.text(bar.get_x() + bar.get_width()/2., height,
                       f'{int(height)}',
                       ha='center', va='bottom', fontsize=11, fontweight='bold')
            
            # Styling
            ax.set_xlabel('Values', fontsize=13, fontweight='bold', labelpad=10)
            ax.set_ylabel('Frequency', fontsize=13, fontweight='bold', labelpad=10)
            
            title = f'{display_name} - Frequency Distribution'
            subtitle = f'({time_range.replace("_", " ").title()} | Total: {stats.get("total_count", 0)} entries)'
            ax.set_title(f'{title}\n{subtitle}', fontsize=15, fontweight='bold', pad=20)
            
            # Rotate x-axis labels if needed
            if len(values) > 5:
                plt.xticks(rotation=45, ha='right')
            
            ax.grid(True, alpha=0.3, linestyle='--', linewidth=0.7, axis='y')
            plt.tight_layout()
            
            # Save to bytes
            with io.BytesIO() as buffer:
                plt.savefig(buffer, format='png', dpi=120, bbox_inches='tight')
                buffer.seek(0)
                image_data = buffer.getvalue()
            
            plt.close(fig)
            return image_data
            
        except Exception as e:
            return ChartGenerator._generate_error_chart(f'Error generating chart: {str(e)}')
    
    @staticmethod
    def generate_pie_chart(
        field_name: str,
        tracker_id: int,
        time_range: str = 'all',
        option: Optional[str] = None,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None
    ) -> bytes:
        """
        Generate pie chart showing frequency distribution of categorical data.
        
        Returns:
            PNG image as bytes
        """
        try:
            # Get frequency data
            result = CategoricalAnalyzer.analyze(
                field_name, tracker_id, time_range, option,
                start_date=start_date, end_date=end_date
            )
            
            # Handle insufficient data
            if not result.get('frequency') or result.get('message'):
                return ChartGenerator._generate_error_chart(
                    result.get('message', 'Insufficient data for chart')
                )
            
            frequency = result['frequency']
            stats = result['statistics']
            display_name = result.get('display_name', field_name)
            
            # Create figure
            fig, ax = plt.subplots(figsize=(10, 8))
            
            # Prepare data for chart
            values = list(frequency.keys())
            counts = list(frequency.values())
            
            # Generate colors
            colors = plt.cm.Set3(np.linspace(0, 1, len(values)))
            
            # Create pie chart
            wedges, texts, autotexts = ax.pie(
                counts, labels=values, colors=colors, autopct='%1.1f%%',
                startangle=90, textprops={'fontsize': 11}
            )
            
            # Make percentage text bold
            for autotext in autotexts:
                autotext.set_color('white')
                autotext.set_fontweight('bold')
                autotext.set_fontsize(10)
            
            # Styling
            title = f'{display_name} - Frequency Distribution'
            subtitle = f'({time_range.replace("_", " ").title()} | Total: {stats.get("total_count", 0)} entries)'
            ax.set_title(f'{title}\n{subtitle}', fontsize=15, fontweight='bold', pad=20)
            
            plt.tight_layout()
            
            # Save to bytes
            with io.BytesIO() as buffer:
                plt.savefig(buffer, format='png', dpi=120, bbox_inches='tight')
                buffer.seek(0)
                image_data = buffer.getvalue()
            
            plt.close(fig)
            return image_data
            
        except Exception as e:
            return ChartGenerator._generate_error_chart(f'Error generating pie chart: {str(e)}')
    
    @staticmethod
    def generate_horizontal_bar_chart(
        field_name: str,
        tracker_id: int,
        time_range: str = 'all',
        option: Optional[str] = None,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None
    ) -> bytes:
        """
        Generate horizontal bar chart showing frequency distribution of categorical data.
        
        Returns:
            PNG image as bytes
        """
        try:
            # Get frequency data
            result = CategoricalAnalyzer.analyze(
                field_name, tracker_id, time_range, option,
                start_date=start_date, end_date=end_date
            )
            
            # Handle insufficient data
            if not result.get('frequency') or result.get('message'):
                return ChartGenerator._generate_error_chart(
                    result.get('message', 'Insufficient data for chart')
                )
            
            frequency = result['frequency']
            stats = result['statistics']
            display_name = result.get('display_name', field_name)
            
            # Create figure
            fig, ax = plt.subplots(figsize=(12, 7))
            
            # Prepare data for chart
            values = list(frequency.keys())
            counts = list(frequency.values())
            
            # Create horizontal bar chart
            bars = ax.barh(values, counts, color='#3498db', alpha=0.8, edgecolor='white', linewidth=1.5)
            
            # Add value labels on bars
            for i, bar in enumerate(bars):
                width = bar.get_width()
                ax.text(width, bar.get_y() + bar.get_height()/2.,
                       f'{int(width)}',
                       ha='left', va='center', fontsize=11, fontweight='bold')
            
            # Styling
            ax.set_xlabel('Frequency', fontsize=13, fontweight='bold', labelpad=10)
            ax.set_ylabel('Values', fontsize=13, fontweight='bold', labelpad=10)
            
            title = f'{display_name} - Frequency Distribution'
            subtitle = f'({time_range.replace("_", " ").title()} | Total: {stats.get("total_count", 0)} entries)'
            ax.set_title(f'{title}\n{subtitle}', fontsize=15, fontweight='bold', pad=20)
            
            ax.grid(True, alpha=0.3, linestyle='--', linewidth=0.7, axis='x')
            plt.tight_layout()
            
            # Save to bytes
            with io.BytesIO() as buffer:
                plt.savefig(buffer, format='png', dpi=120, bbox_inches='tight')
                buffer.seek(0)
                image_data = buffer.getvalue()
            
            plt.close(fig)
            return image_data
            
        except Exception as e:
            return ChartGenerator._generate_error_chart(f'Error generating horizontal bar chart: {str(e)}')


class UnifiedAnalyzer:
    """
    Unified interface that automatically detects field type and routes to correct analyzer.
    """
    
    @staticmethod
    def analyze(
        field_name: str,
        tracker_id: int,
        time_range: str = 'all',
        option: Optional[str] = None,
        force_type: Optional[str] = None,  # Allow manual override: 'numeric' or 'categorical'
        start_date: Optional[date] = None,
        end_date: Optional[date] = None
    ) -> Dict[str, Any]:
        """
        Automatically analyze field using appropriate analyzer.
        
        Args:
            field_name: Field to analyze
            tracker_id: Tracker ID
            time_range: Time range string
            option: Specific option to analyze
            force_type: Force specific analyzer type ('numeric' or 'categorical')
        
        Returns:
            Analysis results with field_type metadata
        """
        try:
            # Determine field type
            if force_type:
                if force_type not in ['numeric', 'categorical']:
                    raise ValueError("force_type must be 'numeric' or 'categorical'")
                field_type = force_type
                detection_reason = f"Manually forced to {force_type}"
            else:
                field_type, detection_reason = FieldTypeDetector.detect_field_type(
                    field_name, tracker_id, option
                )
            
            # Route to appropriate analyzer
            if field_type == 'numeric':
                result = TrendLineAnalyzer.analyze(
                    field_name, tracker_id, time_range, option=option,
                    start_date=start_date, end_date=end_date
                )
                result['analysis_type'] = 'trend'
            else:
                result = CategoricalAnalyzer.analyze(
                    field_name, tracker_id, time_range, option=option,
                    start_date=start_date, end_date=end_date
                )
                result['analysis_type'] = 'categorical'
            
            # Add detection metadata
            result['field_type'] = field_type
            result['detection_reason'] = detection_reason
            
            return result
            
        except Exception as e:
            raise ValueError(f"Failed to analyze field: {str(e)}")
    
    @staticmethod
    def generate_chart(
        field_name: str,
        tracker_id: int,
        time_range: str = 'all',
        option: Optional[str] = None,
        force_type: Optional[str] = None,
        chart_type: Optional[str] = None,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None
    ) -> bytes:
        """
        Generate appropriate chart based on field type.
        
        Chart types:
        - For categorical static: bar (default), pie, horizontal_bar
        - For numeric static: scatter, box_plot
        
        Returns:
            PNG image as bytes
        """
        try:
            # Normalize chart_type (handle None and empty string)
            if chart_type:
                chart_type = chart_type.strip().lower()
            else:
                chart_type = None
            
            # Determine field type
            if force_type:
                field_type = force_type
            else:
                field_type, _ = FieldTypeDetector.detect_field_type(
                    field_name, tracker_id, option
                )
            
            # Generate appropriate chart
            if field_type == 'numeric':
                # Numeric static charts
                if chart_type == 'scatter':
                    return ChartGenerator.generate_scatter_chart(
                        field_name, tracker_id, time_range, option,
                        start_date=start_date, end_date=end_date
                    )
                elif chart_type == 'box_plot':
                    return ChartGenerator.generate_box_plot_chart(
                        field_name, tracker_id, time_range, option,
                        start_date=start_date, end_date=end_date
                    )
                else:
                    # Default: trend chart (line with trend line)
                    return ChartGenerator.generate_trend_chart(
                        field_name, tracker_id, time_range, option,
                        start_date=start_date, end_date=end_date
                    )
            else:
                # Categorical static charts
                if chart_type == 'pie':
                    return CategoricalAnalyzer.generate_pie_chart(
                        field_name, tracker_id, time_range, option,
                        start_date=start_date, end_date=end_date
                    )
                elif chart_type == 'horizontal_bar':
                    return CategoricalAnalyzer.generate_horizontal_bar_chart(
                        field_name, tracker_id, time_range, option,
                        start_date=start_date, end_date=end_date
                    )
                else:
                    # Default: vertical bar chart
                    return CategoricalAnalyzer.generate_bar_chart(
                        field_name, tracker_id, time_range, option,
                        start_date=start_date, end_date=end_date
                    )
                
        except Exception as e:
            return ChartGenerator._generate_error_chart(f"Error: {str(e)}")
        
    @staticmethod
    def analyze_evolution(
        field_name: str,
        tracker_id: int,
        time_range: str = 'month',
        option: Optional[str] = None,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None
    ) -> Dict[str, Any]:
        """
        Analyze how field evolves over time (unified interface).
        """
        field_type, detection_reason = FieldTypeDetector.detect_field_type(
            field_name, tracker_id, option
        )
        
        if field_type == 'numeric':
            result = TimeEvolutionAnalyzer.analyze_numeric_evolution(
                field_name, tracker_id, time_range, option, start_date, end_date
            )
        else:
            result = TimeEvolutionAnalyzer.analyze_categorical_evolution(
                field_name, tracker_id, time_range, option, start_date, end_date
            )
        
        result['field_type'] = field_type
        result['detection_reason'] = detection_reason
        return result
    
    @staticmethod
    def generate_evolution_chart(
        field_name: str,
        tracker_id: int,
        time_range: str = 'month',
        option: Optional[str] = None,
        chart_type: Optional[str] = None,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None
    ) -> bytes:
        """
        Generate time evolution chart (unified interface).
        
        Chart types:
        - For categorical evolution: stacked_area (default), stacked_bar
        - For numeric evolution: line (default), line_with_range
        """
        return TimeEvolutionAnalyzer.generate_evolution_chart(
            field_name, tracker_id, time_range, option, chart_type, start_date, end_date
        )
        

class TimeEvolutionAnalyzer:
    """
    Analyzes how data evolves over time with appropriate visualizations.
    
    - Numeric fields: Line chart showing value changes over time
    - Categorical fields: Stacked area/bar chart showing distribution changes over time
    """
    
    TIME_RANGE_DAYS = {
        'week': 7,
        '2_weeks': 14,
        '3_weeks': 21,
        'month': 30,
        '3_months': 90,
        '6_months': 180,
        'year': 365
    }
    
    # Time bucket configurations
    TIME_BUCKET_CONFIG = {
        'week': 'daily',           # 7 days -> daily buckets
        '2_weeks': 'daily',        # 14 days -> daily buckets
        '3_weeks': 'every_2_days', # 21 days -> every 2 days
        'month': 'every_3_days',   # 30 days -> every 3 days
        '3_months': 'weekly',      # 90 days -> weekly buckets
        '6_months': 'biweekly',    # 180 days -> bi-weekly buckets
        'year': 'monthly'          # 365 days -> monthly buckets
    }
    
    @staticmethod
    def analyze_numeric_evolution(
        field_name: str,
        tracker_id: int,
        time_range: str = 'month',
        option: Optional[str] = None,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None
    ) -> Dict[str, Any]:
        """
        Analyze how numeric values evolve over time.
        
        Returns time-bucketed data suitable for line charts.
        """
        try:
            # Use TrendLineAnalyzer to get the base data
            result = TrendLineAnalyzer.analyze(
                field_name, tracker_id, time_range, option=option,
                start_date=start_date, end_date=end_date
            )
            
            if not result.get('data_points'):
                return result  # Return error response as-is
            
            # Determine bucketing strategy
            bucket_strategy = TimeEvolutionAnalyzer.TIME_BUCKET_CONFIG.get(
                time_range, 'daily'
            )
            
            # Bucket the data
            bucketed_data = TimeEvolutionAnalyzer._bucket_numeric_data(
                result['data_points'], bucket_strategy
            )
            
            # Add evolution-specific metadata
            result['evolution'] = {
                'bucketed_data': bucketed_data,
                'bucket_strategy': bucket_strategy,
                'chart_type': 'line',
                'visualization_note': 'Shows value changes over time'
            }
            
            return result
            
        except Exception as e:
            raise ValueError(f"Failed to analyze numeric evolution: {str(e)}")
    
    @staticmethod
    def analyze_categorical_evolution(
        field_name: str,
        tracker_id: int,
        time_range: str = 'month',
        option: Optional[str] = None,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None
    ) -> Dict[str, Any]:
        """
        Analyze how categorical distributions evolve over time.
        
        Returns time-bucketed frequency data suitable for stacked area/bar charts.
        """
        try:
            # Validate tracker
            tracker = Tracker.query.get(tracker_id)
            if not tracker:
                raise ValueError(f"Tracker {tracker_id} not found")
            
            # Calculate date range
            if end_date is None:
                end_date = date.today()
            if start_date is None:
                start_date = TimeEvolutionAnalyzer._calculate_start_date(time_range, end_date)
            
            # Fetch entries
            query = TrackingData.query.filter_by(tracker_id=tracker_id)
            if start_date:
                query = query.filter(
                    and_(
                        TrackingData.entry_date >= start_date,
                        TrackingData.entry_date <= end_date
                    )
                )
            
            entries = query.order_by(TrackingData.entry_date.asc()).all()
            entries = [e for e in entries if e.data and field_name in e.data]
            
            if not entries:
                return {
                    'field_name': field_name,
                    'time_range': time_range,
                    'message': 'No data available for this field in the specified time range'
                }
            
            # Determine bucketing strategy
            bucket_strategy = TimeEvolutionAnalyzer.TIME_BUCKET_CONFIG.get(
                time_range, 'daily'
            )
            
            # Extract and bucket categorical data over time
            evolution_data = TimeEvolutionAnalyzer._bucket_categorical_data(
                entries, field_name, option, bucket_strategy, start_date, end_date
            )
            
            if not evolution_data['buckets']:
                return {
                    'field_name': field_name,
                    'time_range': time_range,
                    'message': 'No valid categorical data found for this field'
                }
            
            display_name = CategoricalAnalyzer._build_display_name(field_name, option)
            
            return {
                'field_name': field_name,
                'option': option,
                'time_range': time_range,
                'display_name': display_name,
                'evolution': evolution_data,
                'metadata': {
                    'total_entries': len(entries),
                    'bucket_strategy': bucket_strategy,
                    'chart_type': 'stacked_area',
                    'visualization_note': 'Shows how category frequencies change over time'
                }
            }
            
        except Exception as e:
            raise ValueError(f"Failed to analyze categorical evolution: {str(e)}")
    
    @staticmethod
    def _calculate_start_date(time_range: str, end_date: date) -> Optional[date]:
        """Calculate start date based on time range."""
        if time_range == 'all':
            return None
        
        days = TimeEvolutionAnalyzer.TIME_RANGE_DAYS.get(time_range)
        if not days:
            raise ValueError(f"Invalid time_range: {time_range}")
        
        return end_date - timedelta(days=days)
    
    @staticmethod
    def _bucket_numeric_data(
        data_points: List[Dict],
        bucket_strategy: str
    ) -> List[Dict[str, Any]]:
        """
        Bucket numeric data points by time period.
        
        Returns list of buckets with aggregated values (mean, min, max).
        """
        if not data_points:
            return []
        
        # Parse dates
        dated_points = [
            (datetime.fromisoformat(dp['date']).date(), dp['value'])
            for dp in data_points
        ]
        dated_points.sort(key=lambda x: x[0])
        
        # Determine bucket size in days
        bucket_days = {
            'daily': 1,
            'every_2_days': 2,
            'every_3_days': 3,
            'weekly': 7,
            'biweekly': 14,
            'monthly': 30
        }.get(bucket_strategy, 1)
        
        # Create buckets
        buckets = []
        current_bucket_start = dated_points[0][0]
        current_bucket_values = []
        
        for date_val, value in dated_points:
            # Check if we need a new bucket
            if (date_val - current_bucket_start).days >= bucket_days:
                # Save current bucket
                if current_bucket_values:
                    buckets.append({
                        'date': current_bucket_start.isoformat(),
                        'mean': round(np.mean(current_bucket_values), 2),
                        'min': round(min(current_bucket_values), 2),
                        'max': round(max(current_bucket_values), 2),
                        'count': len(current_bucket_values)
                    })
                
                # Start new bucket
                current_bucket_start = date_val
                current_bucket_values = [value]
            else:
                current_bucket_values.append(value)
        
        # Add final bucket
        if current_bucket_values:
            buckets.append({
                'date': current_bucket_start.isoformat(),
                'mean': round(np.mean(current_bucket_values), 2),
                'min': round(min(current_bucket_values), 2),
                'max': round(max(current_bucket_values), 2),
                'count': len(current_bucket_values)
            })
        
        return buckets
    
    @staticmethod
    def _bucket_categorical_data(
        entries: List[TrackingData],
        field_name: str,
        option: Optional[str],
        bucket_strategy: str,
        start_date: date,
        end_date: date
    ) -> Dict[str, Any]:
        """
        Bucket categorical data by time period.
        
        Returns time-bucketed frequency distributions.
        """
        # Determine bucket size in days
        bucket_days = {
            'daily': 1,
            'every_2_days': 2,
            'every_3_days': 3,
            'weekly': 7,
            'biweekly': 14,
            'monthly': 30
        }.get(bucket_strategy, 1)
        
        # Create time buckets
        buckets = []
        current_date = start_date
        
        while current_date <= end_date:
            bucket_end = current_date + timedelta(days=bucket_days - 1)
            if bucket_end > end_date:
                bucket_end = end_date
            
            # Get entries in this bucket
            bucket_entries = [
                e for e in entries
                if current_date <= e.entry_date <= bucket_end
            ]
            
            # Extract categorical frequencies for this bucket
            bucket_frequency = {}
            for entry in bucket_entries:
                field_data = entry.data.get(field_name)
                if field_data is None:
                    continue
                
                # Handle nested option
                if option and isinstance(field_data, dict):
                    field_data = field_data.get(option)
                    if field_data is None:
                        continue
                
                # Extract values using shared base layer
                # Handle list values (arrays) separately
                if isinstance(field_data, list):
                    for item in field_data:
                        if item is not None:
                            normalized = str(item).lower().strip()
                            bucket_frequency[normalized] = bucket_frequency.get(normalized, 0) + 1
                else:
                    cat_value = AnalyticsDataExtractor._extract_categorical_value(field_data, option)
                    if cat_value:
                        normalized = str(cat_value).lower().strip()
                        bucket_frequency[normalized] = bucket_frequency.get(normalized, 0) + 1
            
            # Only add bucket if it has data
            if bucket_frequency:
                buckets.append({
                    'date': current_date.isoformat(),
                    'date_end': bucket_end.isoformat(),
                    'frequency': bucket_frequency,
                    'total': sum(bucket_frequency.values())
                })
            
            current_date = bucket_end + timedelta(days=1)
        
        # Get all unique categories across all buckets
        all_categories = set()
        for bucket in buckets:
            all_categories.update(bucket['frequency'].keys())
        
        return {
            'buckets': buckets,
            'categories': sorted(list(all_categories)),
            'bucket_strategy': bucket_strategy
        }
    
    @staticmethod
    def generate_evolution_chart(
        field_name: str,
        tracker_id: int,
        time_range: str = 'month',
        option: Optional[str] = None,
        chart_type: Optional[str] = None,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None
    ) -> bytes:
        """
        Generate appropriate time evolution chart based on field type.
        
        Chart types:
        - For categorical evolution: stacked_area (default), stacked_bar
        - For numeric evolution: line (default), line_with_range
        """
        try:
            # Normalize chart_type (handle None and empty string)
            if chart_type:
                chart_type = chart_type.strip().lower()
            else:
                chart_type = None
            
            # Detect field type
            field_type, _ = FieldTypeDetector.detect_field_type(
                field_name, tracker_id, option
            )
            
            if field_type == 'numeric':
                # Numeric evolution charts
                if chart_type == 'line_with_range':
                    return TimeEvolutionAnalyzer._generate_numeric_evolution_chart(
                        field_name, tracker_id, time_range, option, start_date, end_date
                    )
                else:
                    # Default: simple line chart
                    return TimeEvolutionAnalyzer._generate_numeric_evolution_line_chart(
                        field_name, tracker_id, time_range, option, start_date, end_date
                    )
            else:
                # Categorical evolution charts
                if chart_type == 'stacked_bar':
                    return TimeEvolutionAnalyzer._generate_categorical_evolution_stacked_bar_chart(
                        field_name, tracker_id, time_range, option, start_date, end_date
                    )
                else:
                    # Default: stacked area chart
                    return TimeEvolutionAnalyzer._generate_categorical_evolution_chart(
                        field_name, tracker_id, time_range, option, start_date, end_date
                    )
                
        except Exception as e:
            return ChartGenerator._generate_error_chart(f"Error: {str(e)}")
    
    @staticmethod
    def _generate_numeric_evolution_chart(
        field_name: str,
        tracker_id: int,
        time_range: str,
        option: Optional[str],
        start_date: Optional[date],
        end_date: Optional[date]
    ) -> bytes:
        """Generate line chart for numeric evolution."""
        try:
            result = TimeEvolutionAnalyzer.analyze_numeric_evolution(
                field_name, tracker_id, time_range, option, start_date, end_date
            )
            
            if not result.get('evolution') or not result['evolution'].get('bucketed_data'):
                return ChartGenerator._generate_error_chart(
                    result.get('message', 'Insufficient data for evolution chart')
                )
            
            bucketed_data = result['evolution']['bucketed_data']
            
            # Extract data for plotting
            dates = [datetime.fromisoformat(b['date']).date() for b in bucketed_data]
            means = [b['mean'] for b in bucketed_data]
            mins = [b['min'] for b in bucketed_data]
            maxs = [b['max'] for b in bucketed_data]
            
            # Create figure
            fig, ax = plt.subplots(figsize=(14, 8))
            
            # Convert to datetime for matplotlib
            date_objs = [datetime.combine(d, datetime.min.time()) for d in dates]
            
            # Plot shaded area for min/max range
            ax.fill_between(date_objs, mins, maxs, alpha=0.2, color='#3498db',
                           label='Min-Max Range')
            
            # Plot mean line
            ax.plot(date_objs, means, 'o-', color='#3498db',
                   label='Average Value', linewidth=3, markersize=8,
                   markeredgecolor='white', markeredgewidth=2)
            
            # Styling
            field_display = field_name.replace("_", " ").title()
            option_display = option.replace("_", " ").title() if option else None
            
            if option_display:
                title = f'{field_display} - {option_display} - Evolution Over Time'
                ax.set_ylabel(option_display, fontsize=13, fontweight='bold', labelpad=10)
            else:
                title = f'{field_display} - Evolution Over Time'
                ax.set_ylabel('Value', fontsize=13, fontweight='bold', labelpad=10)
            
            subtitle = f'({time_range.replace("_", " ").title()} | Bucketed by {result["evolution"]["bucket_strategy"].replace("_", " ")})'
            ax.set_title(f'{title}\n{subtitle}', fontsize=15, fontweight='bold', pad=20)
            
            ax.set_xlabel('Date', fontsize=13, fontweight='bold', labelpad=10)
            ax.legend(loc='best', fontsize=11, framealpha=0.9)
            ax.grid(True, alpha=0.3, linestyle='--', linewidth=0.7)
            
            # Format x-axis
            ax.xaxis.set_major_formatter(mdates.DateFormatter('%Y-%m-%d'))
            ax.xaxis.set_major_locator(mdates.AutoDateLocator())
            plt.xticks(rotation=45, ha='right')
            
            plt.tight_layout()
            
            # Save to bytes
            with io.BytesIO() as buffer:
                plt.savefig(buffer, format='png', dpi=120, bbox_inches='tight')
                buffer.seek(0)
                image_data = buffer.getvalue()
            
            plt.close(fig)
            return image_data
            
        except Exception as e:
            return ChartGenerator._generate_error_chart(f"Error: {str(e)}")
    
    @staticmethod
    def _generate_numeric_evolution_line_chart(
        field_name: str,
        tracker_id: int,
        time_range: str,
        option: Optional[str],
        start_date: Optional[date],
        end_date: Optional[date]
    ) -> bytes:
        """Generate simple line chart for numeric evolution (without range shading)."""
        try:
            result = TimeEvolutionAnalyzer.analyze_numeric_evolution(
                field_name, tracker_id, time_range, option, start_date, end_date
            )
            
            if not result.get('evolution') or not result['evolution'].get('bucketed_data'):
                return ChartGenerator._generate_error_chart(
                    result.get('message', 'Insufficient data for evolution chart')
                )
            
            bucketed_data = result['evolution']['bucketed_data']
            
            # Extract data for plotting
            dates = [datetime.fromisoformat(b['date']).date() for b in bucketed_data]
            means = [b['mean'] for b in bucketed_data]
            
            # Create figure
            fig, ax = plt.subplots(figsize=(14, 8))
            
            # Convert to datetime for matplotlib
            date_objs = [datetime.combine(d, datetime.min.time()) for d in dates]
            
            # Plot mean line only (no range shading)
            ax.plot(date_objs, means, 'o-', color='#3498db',
                   label='Average Value', linewidth=3, markersize=8,
                   markeredgecolor='white', markeredgewidth=2)
            
            # Styling
            field_display = field_name.replace("_", " ").title()
            option_display = option.replace("_", " ").title() if option else None
            
            if option_display:
                title = f'{field_display} - {option_display} - Evolution Over Time'
                ax.set_ylabel(option_display, fontsize=13, fontweight='bold', labelpad=10)
            else:
                title = f'{field_display} - Evolution Over Time'
                ax.set_ylabel('Value', fontsize=13, fontweight='bold', labelpad=10)
            
            subtitle = f'({time_range.replace("_", " ").title()} | Bucketed by {result["evolution"]["bucket_strategy"].replace("_", " ")})'
            ax.set_title(f'{title}\n{subtitle}', fontsize=15, fontweight='bold', pad=20)
            
            ax.set_xlabel('Date', fontsize=13, fontweight='bold', labelpad=10)
            ax.legend(loc='best', fontsize=11, framealpha=0.9)
            ax.grid(True, alpha=0.3, linestyle='--', linewidth=0.7)
            
            # Format x-axis
            ax.xaxis.set_major_formatter(mdates.DateFormatter('%Y-%m-%d'))
            ax.xaxis.set_major_locator(mdates.AutoDateLocator())
            plt.xticks(rotation=45, ha='right')
            
            plt.tight_layout()
            
            # Save to bytes
            with io.BytesIO() as buffer:
                plt.savefig(buffer, format='png', dpi=120, bbox_inches='tight')
                buffer.seek(0)
                image_data = buffer.getvalue()
            
            plt.close(fig)
            return image_data
            
        except Exception as e:
            return ChartGenerator._generate_error_chart(f"Error: {str(e)}")
    
    @staticmethod
    def _generate_categorical_evolution_chart(
        field_name: str,
        tracker_id: int,
        time_range: str,
        option: Optional[str],
        start_date: Optional[date],
        end_date: Optional[date]
    ) -> bytes:
        """Generate stacked area chart for categorical evolution."""
        try:
            result = TimeEvolutionAnalyzer.analyze_categorical_evolution(
                field_name, tracker_id, time_range, option, start_date, end_date
            )
            
            if not result.get('evolution') or not result['evolution'].get('buckets'):
                return ChartGenerator._generate_error_chart(
                    result.get('message', 'Insufficient data for evolution chart')
                )
            
            evolution = result['evolution']
            buckets = evolution['buckets']
            categories = evolution['categories']
            
            # Prepare data for stacked area chart
            dates = [datetime.fromisoformat(b['date']).date() for b in buckets]
            date_objs = [datetime.combine(d, datetime.min.time()) for d in dates]
            
            # Build matrix of category counts over time
            category_data = {cat: [] for cat in categories}
            for bucket in buckets:
                for cat in categories:
                    category_data[cat].append(bucket['frequency'].get(cat, 0))
            
            # Create figure
            fig, ax = plt.subplots(figsize=(14, 8))
            
            # Generate colors for categories
            colors = plt.cm.Set3(np.linspace(0, 1, len(categories)))
            
            # Plot stacked area chart
            ax.stackplot(date_objs, *[category_data[cat] for cat in categories],
                        labels=categories, colors=colors, alpha=0.8)
            
            # Styling
            display_name = result.get('display_name', field_name)
            title = f'{display_name} - Distribution Evolution Over Time'
            subtitle = f'({time_range.replace("_", " ").title()} | Bucketed by {evolution["bucket_strategy"].replace("_", " ")})'
            ax.set_title(f'{title}\n{subtitle}', fontsize=15, fontweight='bold', pad=20)
            
            ax.set_xlabel('Date', fontsize=13, fontweight='bold', labelpad=10)
            ax.set_ylabel('Frequency', fontsize=13, fontweight='bold', labelpad=10)
            
            # Legend
            ax.legend(loc='upper left', bbox_to_anchor=(1, 1), fontsize=10, framealpha=0.9)
            ax.grid(True, alpha=0.3, linestyle='--', linewidth=0.7)
            
            # Format x-axis
            ax.xaxis.set_major_formatter(mdates.DateFormatter('%Y-%m-%d'))
            ax.xaxis.set_major_locator(mdates.AutoDateLocator())
            plt.xticks(rotation=45, ha='right')
            
            plt.tight_layout()
            
            # Save to bytes
            with io.BytesIO() as buffer:
                plt.savefig(buffer, format='png', dpi=120, bbox_inches='tight')
                buffer.seek(0)
                image_data = buffer.getvalue()
            
            plt.close(fig)
            return image_data
            
        except Exception as e:
            return ChartGenerator._generate_error_chart(f"Error: {str(e)}")
    
    @staticmethod
    def _generate_categorical_evolution_stacked_bar_chart(
        field_name: str,
        tracker_id: int,
        time_range: str,
        option: Optional[str],
        start_date: Optional[date],
        end_date: Optional[date]
    ) -> bytes:
        """Generate stacked bar chart for categorical evolution."""
        try:
            result = TimeEvolutionAnalyzer.analyze_categorical_evolution(
                field_name, tracker_id, time_range, option, start_date, end_date
            )
            
            if not result.get('evolution') or not result['evolution'].get('buckets'):
                return ChartGenerator._generate_error_chart(
                    result.get('message', 'Insufficient data for evolution chart')
                )
            
            evolution = result['evolution']
            buckets = evolution['buckets']
            categories = evolution['categories']
            
            # Prepare data for stacked bar chart
            dates = [datetime.fromisoformat(b['date']).date() for b in buckets]
            
            # Build matrix of category counts over time
            category_data = {cat: [] for cat in categories}
            for bucket in buckets:
                for cat in categories:
                    category_data[cat].append(bucket['frequency'].get(cat, 0))
            
            # Create figure
            fig, ax = plt.subplots(figsize=(14, 8))
            
            # Generate colors for categories
            colors = plt.cm.Set3(np.linspace(0, 1, len(categories)))
            
            # Prepare data for stacked bar
            bottom = np.zeros(len(buckets))
            
            # Plot stacked bars
            for i, cat in enumerate(categories):
                ax.bar(range(len(buckets)), category_data[cat], 
                      bottom=bottom, label=cat, color=colors[i], alpha=0.8)
                bottom += np.array(category_data[cat])
            
            # Set x-axis labels
            ax.set_xticks(range(len(buckets)))
            ax.set_xticklabels([d.strftime('%Y-%m-%d') for d in dates], rotation=45, ha='right')
            
            # Styling
            display_name = result.get('display_name', field_name)
            title = f'{display_name} - Distribution Evolution Over Time (Stacked Bar)'
            subtitle = f'({time_range.replace("_", " ").title()} | Bucketed by {evolution["bucket_strategy"].replace("_", " ")})'
            ax.set_title(f'{title}\n{subtitle}', fontsize=15, fontweight='bold', pad=20)
            
            ax.set_xlabel('Date', fontsize=13, fontweight='bold', labelpad=10)
            ax.set_ylabel('Frequency', fontsize=13, fontweight='bold', labelpad=10)
            
            # Legend
            ax.legend(loc='upper left', bbox_to_anchor=(1, 1), fontsize=10, framealpha=0.9)
            ax.grid(True, alpha=0.3, linestyle='--', linewidth=0.7, axis='y')
            
            plt.tight_layout()
            
            # Save to bytes
            with io.BytesIO() as buffer:
                plt.savefig(buffer, format='png', dpi=120, bbox_inches='tight')
                buffer.seek(0)
                image_data = buffer.getvalue()
            
            plt.close(fig)
            return image_data
            
        except Exception as e:
            return ChartGenerator._generate_error_chart(f"Error: {str(e)}")

