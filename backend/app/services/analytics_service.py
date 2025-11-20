from typing import Dict, List, Any, Optional, Tuple
from datetime import datetime, date, timedelta
from sqlalchemy import and_, func
import numpy as np
import matplotlib
matplotlib.use('Agg')  # Non-interactive backend for server
import matplotlib.pyplot as plt
import matplotlib.dates as mdates
import io
import base64
import matplotlib
matplotlib.use('Agg')  # Non-interactive backend
import matplotlib.pyplot as plt
import matplotlib.dates as mdates
import io
import base64

from app import db
from app.models.tracking_data import TrackingData
from app.models.tracker import Tracker
from app.models.tracker_field import TrackerField
from app.models.tracker_user_field import TrackerUserField
from app.models.field_option import FieldOption


class TrendLineAnalyzer:
    """Analyzer for calculating trend lines from tracking data."""
    
    @staticmethod
    def _get_time_range_days(time_range: str) -> Optional[int]:
        """Convert time range string to number of days."""
        time_range_map = {
            'week': 7,
            '2_weeks': 14,
            'month': 30,
            '3_months': 90,
            '6_months': 180,
            'year': 365
        }
        return time_range_map.get(time_range)
    
    @staticmethod
    def _extract_numeric_value(field_data: Any) -> Optional[float]:
        """
        Extract numeric value from field data.
        Handles various data structures:
        - Direct number: 5
        - Dict with numeric value: {"value": 5}
        - Nested dict: {"hours": 8}
        - String number: "5"
        """
        if field_data is None:
            return None
        
        # Direct numeric value
        if isinstance(field_data, (int, float)):
            return float(field_data)
        
        # String that can be converted to number
        if isinstance(field_data, str):
            try:
                return float(field_data)
            except (ValueError, TypeError):
                return None
        
        # Dictionary - try common keys
        if isinstance(field_data, dict):
            # Try common numeric keys
            for key in ['value', 'amount', 'hours', 'minutes', 'count', 'rating', 'score']:
                if key in field_data and isinstance(field_data[key], (int, float)):
                    return float(field_data[key])
            
            # If dict has only one key-value pair and value is numeric
            if len(field_data) == 1:
                value = list(field_data.values())[0]
                if isinstance(value, (int, float)):
                    return float(value)
        
        return None
    
    @staticmethod
    def _is_numeric_field(field_name: str, tracker_id: int) -> Tuple[bool, Optional[str]]:
        """
        Check if a field is numeric by examining its options.
        Returns (is_numeric, error_message)
        """
        try:
            tracker = Tracker.query.get(tracker_id)
            if not tracker:
                return False, "Tracker not found"
            
            # Check user fields first (tracker-specific)
            user_field = TrackerUserField.query.filter_by(
                tracker_id=tracker_id,
                field_name=field_name,
                is_active=True
            ).first()
            
            if user_field:
                # Check if any option is numeric type
                numeric_types = ['number', 'number_input', 'rating', 'slider']
                options = FieldOption.query.filter_by(
                    tracker_user_field_id=user_field.id,
                    is_active=True
                ).all()
                
                if options:
                    has_numeric = any(opt.option_type in numeric_types for opt in options)
                    return has_numeric, None if has_numeric else "Field has no numeric options"
                # If no options, assume it might be numeric (could be direct value)
                return True, None
            
            # Check category fields
            category_field = TrackerField.query.filter_by(
                category_id=tracker.category_id,
                field_name=field_name,
                is_active=True
            ).first()
            
            if category_field:
                numeric_types = ['number', 'number_input', 'rating', 'slider']
                options = FieldOption.query.filter_by(
                    tracker_field_id=category_field.id,
                    is_active=True
                ).all()
                
                if options:
                    has_numeric = any(opt.option_type in numeric_types for opt in options)
                    return has_numeric, None if has_numeric else "Field has no numeric options"
                # If no options, assume it might be numeric
                return True, None
            
            # Field not found in schema, but might exist in data (custom field)
            # Allow it and let data extraction determine if it's numeric
            return True, None
            
        except Exception as e:
            return False, f"Error checking field: {str(e)}"
    
    @staticmethod
    def analyze(
        field_name: str,
        tracker_id: int,
        time_range: str = 'all'
    ) -> Dict[str, Any]:
        """
        Analyze trend line for a specific field.
        
        Args:
            field_name: Name of the field to analyze
            tracker_id: ID of the tracker
            time_range: Time range ('week', 'month', 'all', etc.)
        
        Returns:
            Dictionary with trend line data, statistics, and metadata
        """
        try:
            # Validate tracker exists
            tracker = Tracker.query.get(tracker_id)
            if not tracker:
                raise ValueError(f"Tracker {tracker_id} not found")
            
            # Check if field is numeric
            is_numeric, error_msg = TrendLineAnalyzer._is_numeric_field(field_name, tracker_id)
            if not is_numeric and error_msg:
                raise ValueError(error_msg)
            
            # Calculate date range
            end_date = date.today()
            start_date = None
            
            if time_range != 'all':
                days = TrendLineAnalyzer._get_time_range_days(time_range)
                if days:
                    start_date = end_date - timedelta(days=days)
            
            # Query tracking data
            query = TrackingData.query.filter_by(tracker_id=tracker_id)
            
            # Filter by date range if specified
            if start_date:
                query = query.filter(
                    and_(
                        TrackingData.entry_date >= start_date,
                        TrackingData.entry_date <= end_date
                    )
                )
            
            # Order by date
            all_entries = query.order_by(TrackingData.entry_date.asc()).all()
            
            # Filter entries that have this field 
            entries = [entry for entry in all_entries 
                      if entry.data and field_name in entry.data]
            
            if not entries:
                return {
                    'field_name': field_name,
                    'time_range': time_range,
                    'data_points': [],
                    'trend': None,
                    'statistics': {
                        'total_entries': 0,
                        'date_range': {
                            'start_date': None,
                            'end_date': None
                        }
                    },
                    'message': 'No data available for this field in the specified time range'
                }
            
            # Extract numeric values from entries
            data_points = []
            for entry in entries:
                field_data = entry.data.get(field_name)
                numeric_value = TrendLineAnalyzer._extract_numeric_value(field_data)
                
                if numeric_value is not None:
                    data_points.append({
                        'date': entry.entry_date.isoformat(),
                        'value': numeric_value,
                        'entry_id': entry.id
                    })
            
            if len(data_points) < 2:
                return {
                    'field_name': field_name,
                    'time_range': time_range,
                    'data_points': data_points,
                    'trend': None,
                    'statistics': {
                        'total_entries': len(data_points),
                        'date_range': {
                            'start_date': data_points[0]['date'] if data_points else None,
                            'end_date': data_points[-1]['date'] if data_points else None
                        }
                    },
                    'message': 'Need at least 2 data points to calculate trend'
                }
            
            # Calculate trend line using linear regression
            dates = [datetime.fromisoformat(dp['date']).date() for dp in data_points]
            values = [dp['value'] for dp in data_points]
            
            # Convert dates to numeric (days since first date)
            first_date = dates[0]
            x_values = np.array([(d - first_date).days for d in dates])
            y_values = np.array(values)
            
            # Linear regression using numpy
            # Fit polynomial of degree 1 (linear)
            coefficients = np.polyfit(x_values, y_values, 1)
            slope = coefficients[0]
            intercept = coefficients[1]
            
            # Calculate correlation coefficient (r_value)
            correlation_matrix = np.corrcoef(x_values, y_values)
            r_value = correlation_matrix[0, 1]
            
            # Calculate standard error
            y_pred = intercept + slope * x_values
            residuals = y_values - y_pred
            std_err = np.std(residuals)
            
            # Simple p-value approximation (for large samples, t-test)
            n = len(x_values)
            if n > 2:
                t_stat = r_value * np.sqrt((n - 2) / (1 - r_value**2)) if abs(r_value) < 0.999 else 0
                # Approximate p-value (two-tailed)
                p_value = 2 * (1 - abs(t_stat) / np.sqrt(n)) if abs(t_stat) < np.sqrt(n) else 0.0
            else:
                p_value = 1.0
            
            # Calculate trend line points
            trend_points = []
            for i, x in enumerate(x_values):
                trend_value = intercept + (slope * x)
                trend_points.append({
                    'date': dates[i].isoformat(),
                    'value': round(trend_value, 2)
                })
            
            # Calculate statistics
            mean_value = np.mean(values)
            median_value = np.median(values)
            std_dev = np.std(values)
            min_value = min(values)
            max_value = max(values)
            
            # Determine trend direction
            if abs(slope) < 0.01:
                trend_direction = 'stable'
                trend_strength = 'none'
            elif slope > 0:
                trend_direction = 'increasing'
                trend_strength = 'strong' if abs(r_value) > 0.7 else 'moderate' if abs(r_value) > 0.4 else 'weak'
            else:
                trend_direction = 'decreasing'
                trend_strength = 'strong' if abs(r_value) > 0.7 else 'moderate' if abs(r_value) > 0.4 else 'weak'
            
            return {
                'field_name': field_name,
                'time_range': time_range,
                'data_points': data_points,
                'trend': {
                    'direction': trend_direction,
                    'strength': trend_strength,
                    'slope': round(slope, 4),
                    'correlation': round(r_value, 4),
                    'p_value': round(p_value, 6),
                    'points': trend_points
                },
                'statistics': {
                    'total_entries': len(data_points),
                    'mean': round(mean_value, 2),
                    'median': round(median_value, 2),
                    'std_dev': round(std_dev, 2),
                    'min': round(min_value, 2),
                    'max': round(max_value, 2),
                    'date_range': {
                        'start_date': dates[0].isoformat(),
                        'end_date': dates[-1].isoformat()
                    }
                },
                'chart_url': f'/api/data-tracking/{tracker_id}/trend-chart?field_name={field_name}&time_range={time_range}'
            }
            
        except ValueError as e:
            raise e
        except Exception as e:
            raise ValueError(f"Failed to analyze trend line: {str(e)}")
    
    @staticmethod
    def generate_chart_image(
        field_name: str,
        tracker_id: int,
        time_range: str = 'all'
    ) -> bytes:
        """
        Generate a chart image showing data points and trend line.
        
        Returns:
            bytes: PNG image data
        """
        try:
            # Get the trend data
            result = TrendLineAnalyzer.analyze(field_name, tracker_id, time_range)
            
            if not result.get('data_points') or len(result['data_points']) < 2:
                # Return empty image if no data
                with io.BytesIO() as buffer:
                    fig, ax = plt.subplots(figsize=(10, 6))
                    ax.text(0.5, 0.5, 'Insufficient data for chart', 
                           ha='center', va='center', fontsize=14)
                    plt.savefig(buffer, format='png', dpi=100)
                    buffer.seek(0)
                    image_data = buffer.getvalue()
                    plt.close(fig)
                    return image_data
            
            data_points = result['data_points']
            trend_points = result['trend']['points']
            
            # Extract dates and values
            dates = [datetime.fromisoformat(dp['date']).date() for dp in data_points]
            values = [dp['value'] for dp in data_points]
            
            # Create figure
            fig, ax = plt.subplots(figsize=(10, 6))
            
            # Convert dates to matplotlib format
            date_objs = [datetime.combine(d, datetime.min.time()) for d in dates]
            
            # Plot actual data points
            ax.plot(date_objs, values, 'o-', color='#4A90E2', 
                   label='Actual Data', linewidth=2, markersize=6, alpha=0.7)
            
            # Plot trend line
            trend_dates = [datetime.fromisoformat(tp['date']).date() for tp in trend_points]
            trend_date_objs = [datetime.combine(d, datetime.min.time()) for d in trend_dates]
            trend_values = [tp['value'] for tp in trend_points]
            ax.plot(trend_date_objs, trend_values, '--', color='#E74C3C', 
                   label='Trend Line', linewidth=2, alpha=0.8)
            
            # Formatting
            ax.set_xlabel('Date', fontsize=12, fontweight='bold')
            ax.set_ylabel('Value', fontsize=12, fontweight='bold')
            ax.set_title(f'Trend Analysis: {field_name.replace("_", " ").title()} ({time_range})', 
                        fontsize=14, fontweight='bold', pad=20)
            ax.legend(loc='best', fontsize=10)
            ax.grid(True, alpha=0.3, linestyle='--')
            
            # Format x-axis dates
            ax.xaxis.set_major_formatter(mdates.DateFormatter('%Y-%m-%d'))
            ax.xaxis.set_major_locator(mdates.AutoDateLocator())
            plt.xticks(rotation=45, ha='right')
            
            # Tight layout
            plt.tight_layout()
            
            # Save to bytes buffer using context manager
            with io.BytesIO() as buffer:
                plt.savefig(buffer, format='png', dpi=100, bbox_inches='tight')
                buffer.seek(0)
                image_data = buffer.getvalue()
            
            # Clean up matplotlib figure
            plt.close(fig)
            
            return image_data
            
        except Exception as e:
            # Return error image if generation fails
            with io.BytesIO() as buffer:
                fig, ax = plt.subplots(figsize=(10, 6))
                ax.text(0.5, 0.5, f'Error generating chart: {str(e)}', 
                       ha='center', va='center', fontsize=12, color='red')
                plt.savefig(buffer, format='png', dpi=100)
                buffer.seek(0)
                image_data = buffer.getvalue()
                plt.close(fig)
                return image_data
