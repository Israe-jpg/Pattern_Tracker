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
        
        return {
            'direction': direction,
            'strength': strength,
            'slope': round(slope, 4),
            'intercept': round(intercept, 4),
            'correlation': round(r_value, 4),
            'p_value': round(p_value, 6),
            'std_error': round(std_err, 4),
            'is_significant': is_significant,
            'confidence': 'high' if is_significant and abs(r_value) > 0.7 else 
                         'medium' if is_significant else 'low'
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
    def calculate_descriptive_stats(values: List[float]) -> Dict[str, float]:
        """Calculate comprehensive descriptive statistics."""
        arr = np.array(values)
        
        return {
            'count': len(values),
            'mean': round(float(np.mean(arr)), 2),
            'median': round(float(np.median(arr)), 2),
            'std_dev': round(float(np.std(arr)), 2),
            'variance': round(float(np.var(arr)), 2),
            'min': round(float(np.min(arr)), 2),
            'max': round(float(np.max(arr)), 2),
            'range': round(float(np.max(arr) - np.min(arr)), 2),
            'q1': round(float(np.percentile(arr, 25)), 2),
            'q3': round(float(np.percentile(arr, 75)), 2)
        }


class TrendLineAnalyzer:
    """Main analyzer for calculating trend lines from tracking data."""
    
    TIME_RANGE_DAYS = {
        'week': 7,
        '2_weeks': 14,
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
        min_data_points: int = 2
    ) -> Dict[str, Any]:
        """
        Analyze trend line for a specific field.
        
        Args:
            field_name: Field to analyze
            tracker_id: Tracker ID
            time_range: 'week', 'month', 'all', etc.
            min_data_points: Minimum points required for analysis
        
        Returns:
            Complete trend analysis with data, statistics, and metadata
        """
        try:
            # Validate tracker
            tracker = Tracker.query.get(tracker_id)
            if not tracker:
                raise ValueError(f"Tracker {tracker_id} not found")
            
            # Validate field has numeric options
            is_valid, error_msg = NumericExtractor.validate_numeric_field(
                field_name, tracker_id
            )
            if not is_valid:
                raise ValueError(error_msg)
            
            # Calculate date range
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
            
            # Extract numeric values
            numeric_option_names = NumericExtractor.get_numeric_option_names(
                field_name, tracker_id
            )
            
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
            
            # Perform statistical analysis
            analysis = TrendLineAnalyzer._perform_analysis(data_points)
            
            # Build response
            return {
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
    def _perform_analysis(data_points: List[Dict]) -> Dict[str, Any]:
        """Perform complete statistical analysis on data points."""
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
        
        # Calculate descriptive statistics
        descriptive_stats = StatisticalAnalyzer.calculate_descriptive_stats(values)
        
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
            'statistics': {'total_entries': len(data_points)},
            'message': f'Need at least {min_required} data points to calculate trend (found {len(data_points)})'
        }


class ChartGenerator:
    """Generates matplotlib charts for trend visualization."""
    
    @staticmethod
    def generate_trend_chart(
        field_name: str,
        tracker_id: int,
        time_range: str = 'all'
    ) -> bytes:
        """
        Generate PNG chart showing data points and trend line.
        
        Returns:
            PNG image as bytes
        """
        try:
            # Get trend data
            result = TrendLineAnalyzer.analyze(field_name, tracker_id, time_range)
            
            # Handle insufficient data
            if not result.get('data_points') or len(result['data_points']) < 2:
                return ChartGenerator._generate_error_chart(
                    result.get('message', 'Insufficient data for chart')
                )
            
            data_points = result['data_points']
            trend_points = result['trend_line_points']
            trend_info = result['trend']
            
            # Extract dates and values
            dates = [datetime.fromisoformat(dp['date']).date() for dp in data_points]
            values = [dp['value'] for dp in data_points]
            trend_values = [tp['value'] for tp in trend_points]
            
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
            ax.set_ylabel('Value', fontsize=13, fontweight='bold', labelpad=10)
            
            title = f'{field_name.replace("_", " ").title()} - Trend Analysis'
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