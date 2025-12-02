# ============================================================================
# SHARED ANALYTICS BASE LAYER
# ============================================================================


from typing import Dict, List, Any, Optional, Callable, Tuple
from datetime import date
import numpy as np
from scipy import stats

from app.models.tracking_data import TrackingData
from app.models.tracker import Tracker
from app.models.tracker_field import TrackerField
from app.models.tracker_user_field import TrackerUserField
from app.models.field_option import FieldOption


class NumericExtractor:
    
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


class AnalyticsDataExtractor:
    """
    Shared utilities for extracting and preparing tracking data for analysis.
    """
    
    @staticmethod
    def extract_field_values(
        entries: List[TrackingData],
        field_name: str,
        option: Optional[str] = None,
        tracker_id: Optional[int] = None
    ) -> List[Dict[str, Any]]:
        """
        Extract field values from tracking entries with metadata.
        
        This is the CORE extraction logic used everywhere.
        
        Args:
            entries: List of TrackingData objects
            field_name: Field to extract
            option: Optional specific option
            tracker_id: Optional for numeric option detection
        
        Returns:
            List of dicts with: {
                'value': extracted_value,
                'raw_data': original field data,
                'entry_date': date,
                'entry_id': id
            }
        """
        # Detect field type
        field_type = 'numeric'  # Default
        if tracker_id:
            field_type, _ = FieldTypeDetector.detect_field_type(
                field_name, tracker_id, option
            )
        
        # Get numeric option names if numeric
        numeric_option_names = None
        if field_type == 'numeric' and tracker_id:
            numeric_option_names = NumericExtractor.get_numeric_option_names(
                field_name, tracker_id
            )
            if option:
                numeric_option_names = [option]
        
        # Extract values
        extracted = []
        for entry in entries:
            if not entry.data:
                continue
            
            # Handle nested fields (e.g., "discharge.amount")
            field_data = None
            if field_name in entry.data:
                field_data = entry.data[field_name]
            elif '.' in field_name:
                # Handle nested field like 'discharge.amount'
                base_field, sub_field = field_name.split('.', 1)
                if base_field in entry.data:
                    base_data = entry.data[base_field]
                    if isinstance(base_data, dict) and sub_field in base_data:
                        field_data = base_data[sub_field]
            
            if field_data is None:
                continue
            
            # Extract based on field type
            if field_type == 'numeric':
                value = NumericExtractor.extract(field_data, numeric_option_names)
            else:
                value = AnalyticsDataExtractor._extract_categorical_value(
                    field_data, option
                )
            
            if value is not None:
                extracted.append({
                    'value': value,
                    'raw_data': field_data,
                    'entry_date': entry.entry_date,
                    'entry_id': entry.id
                })
        
        return extracted
    
    @staticmethod
    def _extract_categorical_value(
        field_data: Any,
        option: Optional[str] = None
    ) -> Optional[str]:
        """Extract categorical value from field data."""
        if field_data is None:
            return None
        
        # Handle nested option
        if option and isinstance(field_data, dict):
            field_data = field_data.get(option)
            if field_data is None:
                return None
        
        # Handle different types
        if isinstance(field_data, str):
            return field_data
        if isinstance(field_data, bool):
            return str(field_data).lower()
        if isinstance(field_data, list):
            return ', '.join(str(v) for v in field_data)
        if isinstance(field_data, dict):
            if len(field_data) == 1:
                return str(list(field_data.values())[0])
            # Return first key if multiple
            return str(list(field_data.keys())[0])
        
        return str(field_data)


class AnalyticsGrouper:
    """
    Shared utilities for grouping extracted data.
    
    Provides flexible grouping by any criterion:
    - Time periods (for general analytics)
    - Cycle phases (for period analytics)
    - Custom groupings (for future analytics)
    """
    
    @staticmethod
    def group_by_criterion(
        data: List[Dict[str, Any]],
        group_fn: Callable[[Dict], str]
    ) -> Dict[str, List[Any]]:
        """
        Group data by any criterion using a grouping function.
        
        Args:
            data: List of extracted data dicts
            group_fn: Function that takes a data dict and returns group key
        
        Returns:
            Dict mapping group keys to lists of values
        
        Example:
            # Group by weekday
            grouped = AnalyticsGrouper.group_by_criterion(
                data,
                lambda d: d['entry_date'].strftime('%A')
            )
            
            # Group by cycle phase (for period analytics)
            grouped = AnalyticsGrouper.group_by_criterion(
                data,
                lambda d: d.get('cycle_phase', 'unknown')
            )
        """
        groups = {}
        
        for item in data:
            try:
                group_key = group_fn(item)
                if group_key:
                    if group_key not in groups:
                        groups[group_key] = []
                    groups[group_key].append(item['value'])
            except Exception:
                # Skip items where grouping fails
                continue
        
        return groups


class AnalyticsStatsCalculator:
    """
    Shared statistical calculations for both numeric and categorical data.
    
    Domain-agnostic - works for any analytics context.
    """
    
    @staticmethod
    def calculate_numeric_stats(values: List[float]) -> Dict[str, Any]:
        """
        Calculate statistics for numeric data.
        
        Returns standard metrics used across all analytics.
        """
        if not values:
            return {}
        
        # Filter out None values
        numeric_values = [v for v in values if v is not None and isinstance(v, (int, float))]
        
        if not numeric_values:
            return {}
        
        arr = np.array(numeric_values)
        
        return {
            'count': len(numeric_values),
            'mean': round(float(np.mean(arr)), 2),
            'median': round(float(np.median(arr)), 2),
            'min': round(float(np.min(arr)), 2),
            'max': round(float(np.max(arr)), 2),
            'std_dev': round(float(np.std(arr)), 2),
            'q1': round(float(np.percentile(arr, 25)), 2),
            'q3': round(float(np.percentile(arr, 75)), 2),
            'range': round(float(np.max(arr) - np.min(arr)), 2)
        }
    
    @staticmethod
    def calculate_categorical_stats(values: List[str]) -> Dict[str, Any]:
        """
        Calculate statistics for categorical data.
        
        Returns frequency distribution and common metrics.
        """
        if not values:
            return {}
        
        # Filter out None values
        valid_values = [v for v in values if v is not None]
        
        if not valid_values:
            return {}
        
        # Count frequencies
        frequency = {}
        for val in valid_values:
            normalized = str(val).lower().strip()
            frequency[normalized] = frequency.get(normalized, 0) + 1
        
        total = sum(frequency.values())
        
        if not frequency:
            return {}
        
        most_common = max(frequency.items(), key=lambda x: x[1])
        
        return {
            'count': total,
            'unique_values': len(frequency),
            'frequency': frequency,
            'most_common': {
                'value': most_common[0],
                'count': most_common[1],
                'percentage': round((most_common[1] / total) * 100, 1)
            },
            'distribution': {
                key: round((count / total) * 100, 1)
                for key, count in frequency.items()
            }
        }
    
    @staticmethod
    def calculate_trend(x_values: np.ndarray, y_values: np.ndarray) -> Dict[str, Any]:
        
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
            strength = AnalyticsStatsCalculator._classify_correlation_strength(abs(r_value))
        else:
            direction = 'decreasing'
            strength = AnalyticsStatsCalculator._classify_correlation_strength(abs(r_value))
        
        # Statistical significance
        is_significant = bool(p_value < 0.05)
        confidence = 'high' if is_significant and abs(r_value) > 0.7 else \
                     'medium' if is_significant else 'low'
        
        return {
            'direction': direction,
            'strength': strength,
            'slope': round(slope, 4),
            'intercept': round(intercept, 4),
            'correlation': round(r_value, 4),
            'p_value': round(p_value, 6),
            'std_error': round(std_err, 4),
            'is_significant': is_significant,
            'confidence': confidence
        }
    
    @staticmethod
    def _classify_correlation_strength(abs_r_value: float) -> str:
        """Classify correlation strength based on r-value."""
        if abs_r_value > 0.7:
            return 'strong'
        elif abs_r_value > 0.4:
            return 'moderate'
        else:
            return 'weak'

