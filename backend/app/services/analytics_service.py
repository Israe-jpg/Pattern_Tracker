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

from app import db
from app.models.tracking_data import TrackingData
from app.models.tracker import Tracker
from app.models.tracker_field import TrackerField
from app.models.tracker_user_field import TrackerUserField
from app.models.field_option import FieldOption



class NumericExtractor:
    """Intelligently extracts numeric values from complex nested data structures."""
    
    # Priority order for numeric keys (most common first)
    NUMERIC_KEYS_PRIORITY = [
        'level', 'overall', 'rating', 'score',  # Common rating keys
        'hours', 'minutes', 'duration',          # Time-based
        'amount', 'count', 'quantity',           # Quantity-based
        'value', 'number'                         # Generic
    ]
    
    NUMERIC_OPTION_TYPES = {'number', 'number_input', 'rating', 'slider'}
    
    @staticmethod
    def extract(
        field_data: Any,
        numeric_option_names: Optional[List[str]] = None
    ) -> Optional[float]:
        """
        Extract numeric value from field data with intelligent fallback.
        
        Handles:
        - Direct numbers: 5, 7.5
        - String numbers: "5", "7.5"
        - Simple dict: {"level": 5}
        - Complex dict: {"mood": {"overall": 5, "notes": "text"}}
        - Arrays: Skip (not numeric)
        
        Args:
            field_data: Data to extract from
            numeric_option_names: Known numeric option names for this field
        
        Returns:
            Float value or None if no numeric value found
        """
        if field_data is None:
            return None
        
        # 1. Direct numeric value
        if isinstance(field_data, (int, float)):
            return float(field_data)
        
        # 2. String number
        if isinstance(field_data, str):
            try:
                return float(field_data)
            except (ValueError, TypeError):
                return None
        
        # 3. Dictionary - use priority-based extraction
        if isinstance(field_data, dict):
            # Skip empty dicts
            if not field_data:
                return None
            
            # Priority 1: User-provided numeric option names
            if numeric_option_names:
                for option_name in numeric_option_names:
                    value = field_data.get(option_name)
                    if value is not None and not isinstance(value, (list, dict)):
                        try:
                            return float(value)
                        except (ValueError, TypeError):
                            continue
            
            # Priority 2: Common numeric keys (ordered by likelihood)
            for key in NumericExtractor.NUMERIC_KEYS_PRIORITY:
                if key in field_data:
                    value = field_data[key]
                    if value is not None and not isinstance(value, (list, dict)):
                        try:
                            return float(value)
                        except (ValueError, TypeError):
                            continue
            
            # Priority 3: Single key-value pair
            if len(field_data) == 1:
                value = list(field_data.values())[0]
                if not isinstance(value, (list, dict)):
                    try:
                        return float(value)
                    except (ValueError, TypeError):
                        pass
            
            # Priority 4: First numeric value found (last resort)
            for value in field_data.values():
                if isinstance(value, (int, float)):
                    return float(value)
                if not isinstance(value, (list, dict)) and isinstance(value, str):
                    try:
                        return float(value)
                    except (ValueError, TypeError):
                        continue
        
        return None
    
    @staticmethod
    def get_numeric_option_names(field_name: str, tracker_id: int) -> List[str]:
        """Get list of numeric option names for a field from schema."""
        try:
            tracker = Tracker.query.get(tracker_id)
            if not tracker:
                return []
            
            # Check user-specific fields first
            user_field = TrackerUserField.query.filter_by(
                tracker_id=tracker_id,
                field_name=field_name,
                is_active=True
            ).first()
            
            if user_field:
                options = FieldOption.query.filter_by(
                    tracker_user_field_id=user_field.id,
                    is_active=True
                ).all()
                return [
                    opt.option_name for opt in options
                    if opt.option_type in NumericExtractor.NUMERIC_OPTION_TYPES
                ]
            
            # Check category fields
            category_field = TrackerField.query.filter_by(
                category_id=tracker.category_id,
                field_name=field_name,
                is_active=True
            ).first()
            
            if category_field:
                options = FieldOption.query.filter_by(
                    tracker_field_id=category_field.id,
                    is_active=True
                ).all()
                return [
                    opt.option_name for opt in options
                    if opt.option_type in NumericExtractor.NUMERIC_OPTION_TYPES
                ]
            
            return []
        except Exception:
            return []
    
    @staticmethod
    def validate_numeric_field(field_name: str, tracker_id: int) -> Tuple[bool, Optional[str]]:
        """
        Check if field has numeric options in schema.
        
        Returns:
            (is_valid, error_message)
        """
        try:
            tracker = Tracker.query.get(tracker_id)
            if not tracker:
                return False, "Tracker not found"
            
            # Check user field
            user_field = TrackerUserField.query.filter_by(
                tracker_id=tracker_id,
                field_name=field_name,
                is_active=True
            ).first()
            
            if user_field:
                has_numeric = FieldOption.query.filter_by(
                    tracker_user_field_id=user_field.id,
                    is_active=True
                ).filter(
                    FieldOption.option_type.in_(NumericExtractor.NUMERIC_OPTION_TYPES)
                ).first() is not None
                
                return (True, None) if has_numeric else (False, "Field has no numeric options")
            
            # Check category field
            category_field = TrackerField.query.filter_by(
                category_id=tracker.category_id,
                field_name=field_name,
                is_active=True
            ).first()
            
            if category_field:
                has_numeric = FieldOption.query.filter_by(
                    tracker_field_id=category_field.id,
                    is_active=True
                ).filter(
                    FieldOption.option_type.in_(NumericExtractor.NUMERIC_OPTION_TYPES)
                ).first() is not None
                
                return (True, None) if has_numeric else (False, "Field has no numeric options")
            
            # Field not in schema - allow (might be legacy or direct numeric)
            return True, None
            
        except Exception as e:
            return False, f"Error validating field: {str(e)}"


class StatisticalAnalyzer:
    """Performs statistical analysis on time series data."""
    
    @staticmethod
    def calculate_trend(x_values: np.ndarray, y_values: np.ndarray) -> Dict[str, Any]:
        """
        Calculate trend line using linear regression with proper statistics.
        
        Returns:
            Dictionary with slope, intercept, r_value, p_value, std_err
        """
        # Linear regression using scipy for accurate p-values
        slope, intercept, r_value, p_value, std_err = stats.linregress(x_values, y_values)
        
        # Convert numpy types to Python types for JSON serialization
        slope = float(slope)
        intercept = float(intercept)
        r_value = float(r_value)
        p_value = float(p_value)
        std_err = float(std_err)
        
        # Determine trend characteristics
        if abs(slope) < 0.01:
            direction = 'stable'
            strength = 'none'
        elif slope > 0:
            direction = 'increasing'
            strength = StatisticalAnalyzer._classify_strength(abs(r_value))
        else:
            direction = 'decreasing'
            strength = StatisticalAnalyzer._classify_strength(abs(r_value))
        
        # Statistical significance (convert to Python bool for JSON serialization)
        is_significant = bool(p_value < 0.05)
        confidence = 'high' if is_significant and abs(r_value) > 0.7 else \
                     'medium' if is_significant else 'low'
        
        # Generate user-friendly summary message
        summary = StatisticalAnalyzer._generate_user_summary(
            direction, strength, confidence, abs(r_value), is_significant
        )
        
        return {
            'direction': direction,
            'strength': strength,
            'slope': round(slope, 4),
            'intercept': round(intercept, 4),
            'correlation': round(r_value, 4),
            'p_value': round(p_value, 6),
            'std_error': round(std_err, 4),
            'is_significant': is_significant,
            'confidence': confidence,
            'summary': summary  # User-friendly interpretation
        }
    
    @staticmethod
    def _classify_strength(abs_r_value: float) -> str:
        """Classify correlation strength."""
        if abs_r_value > 0.7:
            return 'strong'
        elif abs_r_value > 0.4:
            return 'moderate'
        else:
            return 'weak'
    
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
        
        Args:
            values: List of numeric values
            field_name: Name of the field (e.g., 'sleep')
            option: Name of the option (e.g., 'hours', 'quality')
        
        Returns both raw values and user-friendly descriptions.
        """
        arr = np.array(values)
        
        # Calculate all statistics
        mean_val = round(float(np.mean(arr)), 2)
        median_val = round(float(np.median(arr)), 2)
        std_dev_val = round(float(np.std(arr)), 2)
        variance_val = round(float(np.var(arr)), 2)
        min_val = round(float(np.min(arr)), 2)
        max_val = round(float(np.max(arr)), 2)
        range_val = round(float(np.max(arr) - np.min(arr)), 2)
        q1_val = round(float(np.percentile(arr, 25)), 2)
        q3_val = round(float(np.percentile(arr, 75)), 2)
        
        # Build display name for descriptions
        display_name = StatisticalAnalyzer._build_display_name(field_name, option)
        
        # Generate user-friendly descriptions
        descriptions = StatisticalAnalyzer._generate_stat_descriptions(
            mean_val, median_val, std_dev_val, min_val, max_val, 
            range_val, q1_val, q3_val, len(values), display_name
        )
        
        return {
            'count': len(values),
            'mean': mean_val,
            'median': median_val,
            'std_dev': std_dev_val,
            'variance': variance_val,
            'min': min_val,
            'max': max_val,
            'range': range_val,
            'q1': q1_val,
            'q3': q3_val,
            'descriptions': descriptions  # User-friendly explanations
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


class FieldTypeDetector:
    """
    Automatically detects whether a field should be analyzed as numeric or categorical.
    """
    
    @staticmethod
    def detect_field_type(
        field_name: str,
        tracker_id: int,
        option: Optional[str] = None
    ) -> Tuple[str, Optional[str]]:
        """
        Detect if field should be analyzed as 'numeric' or 'categorical'.
        
        Args:
            field_name: Field to analyze
            tracker_id: Tracker ID
            option: Specific option to analyze (if provided)
        
        Returns:
            Tuple of (field_type, reason)
            - field_type: 'numeric' or 'categorical'
            - reason: Human-readable explanation of detection
        """
        try:
            # Get numeric options for this field
            numeric_option_names = NumericExtractor.get_numeric_option_names(
                field_name, tracker_id
            )
            
            # If option is specified, check if it's numeric
            if option:
                if option in numeric_option_names:
                    return 'numeric', f"Option '{option}' is a numeric field"
                else:
                    return 'categorical', f"Option '{option}' is not numeric"
            
            # If field has numeric options, it's numeric
            if numeric_option_names:
                if len(numeric_option_names) == 1:
                    return 'numeric', f"Field has numeric option: {numeric_option_names[0]}"
                else:
                    return 'numeric', f"Field has numeric options: {', '.join(numeric_option_names)}"
            
            # Check actual data to determine type
            sample_data = FieldTypeDetector._sample_field_data(field_name, tracker_id)
            
            if not sample_data:
                # No data yet - default to categorical (safer default)
                return 'categorical', "No data available yet - defaulting to categorical"
            
            # Analyze sample data
            numeric_count = 0
            total_count = len(sample_data)
            
            for field_data in sample_data:
                numeric_value = NumericExtractor.extract(field_data, numeric_option_names)
                if numeric_value is not None:
                    numeric_count += 1
            
            # If majority of samples are numeric, treat as numeric
            if numeric_count / total_count >= 0.5:
                return 'numeric', f"Field contains numeric data ({numeric_count}/{total_count} samples)"
            else:
                return 'categorical', f"Field contains categorical data ({total_count - numeric_count}/{total_count} samples)"
                
        except Exception as e:
            # Default to categorical on error (safer)
            return 'categorical', f"Error detecting type: {str(e)}"
    
    @staticmethod
    def _sample_field_data(field_name: str, tracker_id: int, sample_size: int = 10) -> List[Any]:
        """
        Get sample of field data from recent entries.
        
        Args:
            field_name: Field to sample
            tracker_id: Tracker ID
            sample_size: Number of samples to retrieve
        
        Returns:
            List of field data values
        """
        try:
            entries = TrackingData.query.filter_by(
                tracker_id=tracker_id
            ).order_by(
                TrackingData.entry_date.desc()
            ).limit(sample_size).all()
            
            sample_data = []
            for entry in entries:
                if entry.data and field_name in entry.data:
                    sample_data.append(entry.data[field_name])
            
            return sample_data
        except Exception:
            return []




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
            if end_date is None:
                end_date = date.today()
            if start_date is None:
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
            
            # Extract numeric values
            data_points = []
            for entry in entries:
                field_data = entry.data.get(field_name)
                numeric_value = NumericExtractor.extract(
                    field_data, numeric_option_names
                )
                
                if numeric_value is not None:
                    data_points.append({
                        'date': entry.entry_date.isoformat(),
                        'value': numeric_value,
                        'entry_id': entry.id
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
        
        # Calculate trend
        trend_stats = StatisticalAnalyzer.calculate_trend(x_values, y_values)
        
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
            # Get trend data
            result = TrendLineAnalyzer.analyze(field_name, tracker_id, time_range, option=option)
            
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
            if end_date is None:
                end_date = date.today()
            if start_date is None:
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
            
            # Extract categorical values
            frequency_data = CategoricalAnalyzer._extract_frequencies(
                entries, field_name, option
            )
            
            if not frequency_data:
                return CategoricalAnalyzer._no_data_response(
                    field_name, time_range,
                    "No valid categorical data found for this field"
                )
            
            # Calculate statistics
            stats = CategoricalAnalyzer._calculate_categorical_stats(frequency_data)
            
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
    
    @staticmethod
    def _extract_frequencies(
        entries: List[TrackingData],
        field_name: str,
        option: Optional[str] = None
    ) -> Dict[str, int]:
        """
        Extract frequency counts for categorical values.
        
        Handles:
        - Direct values: "positive", "negative"
        - Boolean: true, false
        - Arrays: ["symptom1", "symptom2"]
        - Nested: {"option": "value"}
        """
        frequency = {}
        
        for entry in entries:
            field_data = entry.data.get(field_name)
            if field_data is None:
                continue
            
            # Handle nested option
            if option and isinstance(field_data, dict):
                field_data = field_data.get(option)
                if field_data is None:
                    continue
            
            # Extract values based on type
            values = CategoricalAnalyzer._extract_categorical_values(field_data)
            
            for value in values:
                # Normalize value for counting
                normalized = str(value).lower().strip()
                frequency[normalized] = frequency.get(normalized, 0) + 1
        
        # Sort by frequency (descending)
        return dict(sorted(frequency.items(), key=lambda x: x[1], reverse=True))
    
    @staticmethod
    def _extract_categorical_values(field_data: Any) -> List[str]:
        """Extract categorical values from various data structures."""
        if field_data is None:
            return []
        
        # Boolean values
        if isinstance(field_data, bool):
            return ["yes" if field_data else "no"]
        
        # String values
        if isinstance(field_data, str):
            return [field_data]
        
        # Array values
        if isinstance(field_data, list):
            return [str(v) for v in field_data if v is not None]
        
        # Dictionary - extract all string values
        if isinstance(field_data, dict):
            values = []
            for v in field_data.values():
                if isinstance(v, (str, bool)):
                    values.append(str(v))
                elif isinstance(v, list):
                    values.extend([str(item) for item in v])
            return values
        
        # Fallback: convert to string
        return [str(field_data)]
    
    @staticmethod
    def _calculate_categorical_stats(frequency: Dict[str, int]) -> Dict[str, Any]:
        """Calculate statistics for categorical data."""
        total = sum(frequency.values())
        if total == 0:
            return {}
        
        # Most common
        most_common = max(frequency.items(), key=lambda x: x[1])

        # Least common
        least_common = min(frequency.items(), key=lambda x: x[1])
        
        # Percentage distribution (ensure Python float types)
        distribution = {
            key: round(float(count / total) * 100, 1)
            for key, count in frequency.items()
        }
        
        # Diversity (how many unique values)
        diversity = len(frequency)
        
        # Ensure all values are Python types for JSON serialization
        return {
            'total_count': int(total),
            'unique_values': int(diversity),
            'most_common': {
                'value': str(most_common[0]),  # Ensure string
                'count': int(most_common[1]),  # Ensure int
                'percentage': round(float(most_common[1] / total) * 100, 1)  # Ensure float
            },
            'least_common': {
                'value': str(least_common[0]),  # Ensure string
                'count': int(least_common[1]),  # Ensure int
                'percentage': round(float(least_common[1] / total) * 100, 1)  # Ensure float
            },
            'distribution': distribution,
            'diversity': 'high' if diversity > 5 else 'medium' if diversity > 2 else 'low'
        }
    
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
        start_date: Optional[date] = None,
        end_date: Optional[date] = None
    ) -> bytes:
        """
        Generate appropriate chart based on field type.
        
        Returns:
            PNG image as bytes
        """
        try:
            # Determine field type
            if force_type:
                field_type = force_type
            else:
                field_type, _ = FieldTypeDetector.detect_field_type(
                    field_name, tracker_id, option
                )
            
            # Generate appropriate chart
            if field_type == 'numeric':
                return ChartGenerator.generate_trend_chart(
                    field_name, tracker_id, time_range, option,
                    start_date=start_date, end_date=end_date
                )
            else:
                return CategoricalAnalyzer.generate_bar_chart(
                    field_name, tracker_id, time_range, option,
                    start_date=start_date, end_date=end_date
                )
                
        except Exception as e:
            return ChartGenerator._generate_error_chart(f"Error: {str(e)}")