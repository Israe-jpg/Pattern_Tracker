from datetime import date, timedelta
from flask import Blueprint, request, jsonify, Response
from flask_jwt_extended import get_jwt_identity, jwt_required
from marshmallow import ValidationError
from typing import Tuple, Dict, Any, Optional
from sqlalchemy.orm import Query
from datetime import datetime
import csv
import json
import io

from app import db
from app.models.user import User
from app.models.tracker import Tracker
from app.models.tracking_data import TrackingData
from app.schemas.tracking_data_schema import TrackingDataSchema
from app.services.tracking_service import TrackingService
from app.services.analytics_service import TrendLineAnalyzer, ChartGenerator, CategoricalAnalyzer,UnifiedAnalyzer


from app.services.analytics_data_sufficiency_system import DataSufficiencyChecker, InsightType, ConfidenceLevel, AnalyticsDisplayStrategy

data_tracking_bp = Blueprint('data_tracking', __name__)

# HELPER FUNCTIONS
def get_current_user() -> Tuple[User, int]:
    user_id = get_jwt_identity()
    user = User.query.filter_by(id=user_id).first()
    if not user:
        raise ValueError("User not found")
    return user, user_id

def verify_tracker_ownership(tracker_id: int, user_id: int) -> Tracker:
    tracker = Tracker.query.filter_by(id=tracker_id, user_id=user_id).first()
    if not tracker:
        raise ValueError("Tracker not found")
    return tracker

def verify_tracking_data_ownership(tracking_data_id: int, user_id: int) -> TrackingData:
    tracking_data = TrackingData.query.filter_by(id=tracking_data_id).first()
    if not tracking_data:
        raise ValueError("Tracking data not found")
    
    # Verify ownership through tracker
    tracker = Tracker.query.filter_by(id=tracking_data.tracker_id, user_id=user_id).first()
    if not tracker:
        raise ValueError("Unauthorized - tracking data does not belong to your tracker")
    
    return tracking_data

def error_response(message: str, status_code: int = 400, details: Dict[str, Any] = None) -> Tuple[Dict, int]:
    response = {'error': message}
    if details:
        response['details'] = details
    return jsonify(response), status_code

def success_response(message: str, data: Dict[str, Any] = None, status_code: int = 200) -> Tuple[Dict, int]:
    response = {'message': message}
    if data:
        response['data'] = data
    return jsonify(response), status_code

def validate_pagination_params() -> Tuple[Optional[int], Optional[int], Optional[Tuple[Dict, int]]]:
    """
    Validates pagination query parameters.
    Returns: (page, per_page, None) on success, or (None, None, error_response) on validation failure
    """
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 50, type=int)
    
    if page < 1:
        return None, None, error_response("page must be greater than 0", 400)
    if per_page < 1:
        return None, None, error_response("per_page must be greater than 0", 400)
    if per_page > 100:
        return None, None, error_response("per_page cannot exceed 100", 400)
    
    return page, per_page, None

def paginate_query(query: Query, page: int, per_page: int) -> Tuple[Any, Dict[str, Any]]:
    """
    Applies pagination to a SQLAlchemy query and returns pagination object and metadata.
    Returns: (pagination_object, pagination_info_dict)
    """
    # Apply pagination
    pagination = query.paginate(
        page=page,
        per_page=per_page,
        error_out=False  # Return empty list instead of 404 for out-of-range pages
    )
    
    # Build pagination metadata
    pagination_info = {
        'page': page,
        'per_page': per_page,
        'total_count': pagination.total,
        'total_pages': pagination.pages,
        'has_next': pagination.has_next,
        'has_prev': pagination.has_prev,
        'next_page': pagination.next_num if pagination.has_next else None,
        'prev_page': pagination.prev_num if pagination.has_prev else None
    }
    
    return pagination, pagination_info

#ROUTES

# ------------------------------
#BASIC CRUD ROUTES

#get all tracking data for a specific tracker (with pagination)
@data_tracking_bp.route('/<int:tracker_id>/get-all-tracking-data', methods=['GET'])
@jwt_required()
def get_all_tracking_data(tracker_id: int):
    try:
        _, user_id = get_current_user()
        tracker = verify_tracker_ownership(tracker_id, user_id)
    except ValueError as e:
        return error_response(str(e), 404)
    
    try:
        # Validate pagination parameters
        page, per_page, error = validate_pagination_params()
        if error:
            return error
        
        # Build base query with ordering
        base_query = TrackingData.query.filter_by(tracker_id=tracker_id).order_by(
            TrackingData.entry_date.desc()  # Most recent first
        )
        
        # Apply pagination
        pagination, pagination_info = paginate_query(base_query, page, per_page)
        
        return success_response(
            "All tracking data retrieved successfully",
            {
                'tracking_data': [data.to_dict() for data in pagination.items],
                'pagination': pagination_info
            }
        )
    except Exception as e:
        return error_response(f"Failed to get all tracking data: {str(e)}", 500)


# PRIMARY ENDPOINT: Save tracking data 
@data_tracking_bp.route('/<int:tracker_id>/save-tracking-data', methods=['POST'])
@jwt_required()
def save_tracking_data(tracker_id: int):
    try:
        _, user_id = get_current_user()
        tracker = verify_tracker_ownership(tracker_id, user_id)
    except ValueError as e:
        return error_response(str(e), 404)
    
    try:
        # Basic structure validation with schema
        tracking_data_schema = TrackingDataSchema()
        validated_data = tracking_data_schema.load(request.json)
        
        # Extract fields (all optional except basic structure)
        entry_data = validated_data.get('data', {})
        entry_date = validated_data.get('entry_date') or date.today()
        ai_insights = validated_data.get('ai_insights')
        
        # Check if entry exists to determine response (before service call)
        existing_entry = TrackingData.query.filter_by(
            tracker_id=tracker_id,
            entry_date=entry_date
        ).first()
        
        # Business logic validation and save in service
        tracking_data = TrackingService.save_tracking_data(
            tracker=tracker,
            data=entry_data,
            entry_date=entry_date,
            ai_insights=ai_insights
        )
        
        # Return appropriate status code based on whether entry existed before
        status_code = 200 if existing_entry else 201
        message = "Tracking data updated successfully" if existing_entry else "Tracking data created successfully"
        
        return success_response(
            message,
            {'tracking_data': tracking_data.to_dict()}, 
            status_code
        )
    except ValidationError as e:
        return error_response("Validation failed", 400, e.messages)
    except ValueError as e:
        return error_response(str(e), 400)
    except Exception as e:
        return error_response(f"Failed to save tracking data: {str(e)}", 500)

# OPTIONAL: Explicit create endpoint (use save-tracking-data for surveys)
@data_tracking_bp.route('/<int:tracker_id>/add-tracking-data', methods=['POST'])
@jwt_required()
def add_tracking_data(tracker_id: int):
    try:
        _, user_id = get_current_user()
        tracker = verify_tracker_ownership(tracker_id, user_id)
    except ValueError as e:
        return error_response(str(e), 404)
    
    try:
        # Basic structure validation with schema
        tracking_data_schema = TrackingDataSchema()
        validated_data = tracking_data_schema.load(request.json)
        
        # Extract fields (all optional except basic structure)
        entry_data = validated_data.get('data', {})
        entry_date = validated_data.get('entry_date')
        ai_insights = validated_data.get('ai_insights')
        
        # Business logic validation and creation in service
        tracking_data = TrackingService.create_tracking_data(
            tracker=tracker,
            data=entry_data,
            entry_date=entry_date,
            ai_insights=ai_insights
        )
        
        return success_response(
            "Tracking data created successfully",
            {'tracking_data': tracking_data.to_dict()}, 201
        )
    except ValidationError as e:
        return error_response("Validation failed", 400, e.messages)
    except ValueError as e:
        return error_response(str(e), 400)
    except Exception as e:
        return error_response(f"Failed to add tracking data: {str(e)}", 500)

# OPTIONAL: Explicit update endpoint (use save-tracking-data for surveys)
@data_tracking_bp.route('/<int:tracker_id>/update-tracking-data', methods=['PUT'])
@jwt_required()
def update_tracking_data(tracker_id: int):
    try:
        _, user_id = get_current_user()
        tracker = verify_tracker_ownership(tracker_id, user_id)
    except ValueError as e:
        return error_response(str(e), 404)
    
    try:
        # Basic structure validation with schema
        tracking_data_schema = TrackingDataSchema()
        validated_data = tracking_data_schema.load(request.json)
        
        # Extract fields
        entry_date = validated_data.get('entry_date')
        if not entry_date:
            return error_response("entry_date is required for update", 400)
        
        entry_data = validated_data.get('data')
        ai_insights = validated_data.get('ai_insights')
        
        # Business logic validation and update in service
        tracking_data = TrackingService.update_tracking_data(
            tracker=tracker,
            entry_date=entry_date,
            data=entry_data,
            ai_insights=ai_insights
        )
        
        return success_response(
            "Tracking data updated successfully",
            {'tracking_data': tracking_data.to_dict()}, 200
        )
    except ValidationError as e:
        return error_response("Validation failed", 400, e.messages)
    except ValueError as e:
        return error_response(str(e), 400)
    except Exception as e:
        return error_response(f"Failed to update tracking data: {str(e)}", 500)

# -------------------------------------
# TIME RELATED ROUTES
#get tracking data for a specific date
@data_tracking_bp.route('/<int:tracker_id>/get-tracking-data-by-date', methods=['GET'])
@jwt_required()
def get_tracking_data_by_date(tracker_id: int):
    try:
        _, user_id = get_current_user()
        tracker = verify_tracker_ownership(tracker_id, user_id)
    except ValueError as e:
        return error_response(str(e), 404)
    
    try:
        # Get entry_date from query params
        entry_date_str = request.args.get('entry_date')
        if not entry_date_str:
            return error_response("entry_date query parameter is required (YYYY-MM-DD)", 400)
        
        # Parse date
        from datetime import datetime
        try:
            entry_date = datetime.strptime(entry_date_str, '%Y-%m-%d').date()
        except ValueError:
            return error_response("Invalid date format. Use YYYY-MM-DD", 400)
        
        # Get entry for this date
        tracking_data = TrackingData.query.filter_by(
            tracker_id=tracker_id,
            entry_date=entry_date
        ).first()
        
        if not tracking_data:
            return error_response("No tracking data found for this date", 404)
        
        return success_response(
            "Tracking data retrieved successfully",
            {'tracking_data': tracking_data.to_dict()}
        )
    except Exception as e:
        return error_response(f"Failed to get tracking data: {str(e)}", 500)

#get tracking data for a date range with pagination
@data_tracking_bp.route('/<int:tracker_id>/get-tracking-data-range', methods=['GET'])
@jwt_required()
def get_tracking_data_range(tracker_id: int):
    try:
        _, user_id = get_current_user()
        tracker = verify_tracker_ownership(tracker_id, user_id)
    except ValueError as e:
        return error_response(str(e), 404)
    
    try:
        # Get date range from query parameters
        start_date_str = request.args.get('start_date')
        end_date_str = request.args.get('end_date')
        
        if not start_date_str or not end_date_str:
            return error_response("Both start_date and end_date query parameters are required (YYYY-MM-DD)", 400)
        
        # Parse dates
        from datetime import datetime
        try:
            start_date = datetime.strptime(start_date_str, '%Y-%m-%d').date()
            end_date = datetime.strptime(end_date_str, '%Y-%m-%d').date()
        except ValueError:
            return error_response("Invalid date format. Use YYYY-MM-DD", 400)
        
        if start_date > end_date:
            return error_response("start_date must be before or equal to end_date", 400)
        
        # Validate pagination parameters
        page, per_page, error = validate_pagination_params()
        if error:
            return error
        
        # Build base query with date range and ordering
        base_query = TrackingData.query.filter(
            TrackingData.tracker_id == tracker_id,
            TrackingData.entry_date >= start_date,
            TrackingData.entry_date <= end_date
        ).order_by(
            TrackingData.entry_date.desc()  # Most recent first
        )
        
        # Apply pagination
        pagination, pagination_info = paginate_query(base_query, page, per_page)
        
        return success_response(
            "Tracking data retrieved successfully",
            {
                'tracking_data': [data.to_dict() for data in pagination.items],
                'start_date': start_date_str,
                'end_date': end_date_str,
                'pagination': pagination_info
            }
        )
    except Exception as e:
        return error_response(f"Failed to get tracking data range: {str(e)}", 500)


# ------------------------------------------
# BULK OPERATIONS

#bulk delete by time range tracking data entries
@data_tracking_bp.route('/<int:tracker_id>/bulk-delete-tracking-data', methods=['DELETE'])
@jwt_required()
def bulk_delete_tracking_data(tracker_id: int):
    try:
        _, user_id = get_current_user()
        tracker = verify_tracker_ownership(tracker_id, user_id)
    except ValueError as e:
        return error_response(str(e), 404)
    
    try:
        #get start and end date from query parameters
        start_date_str = request.args.get('start_date')
        end_date_str = request.args.get('end_date')
        if not start_date_str or not end_date_str:
            return error_response("Both start_date and end_date query parameters are required (YYYY-MM-DD)", 400)
        
        #parse dates
        try:
            start_date = datetime.strptime(start_date_str, '%Y-%m-%d').date()
            end_date = datetime.strptime(end_date_str,'%Y-%m-%d').date()
        except ValueError:
            return error_response("Invalid date format. Use YYYY-MM-DD", 400)
        
        if start_date > end_date:
            return error_response("start_date must be before or equal to end_date", 400)
        
        #get tracking data entries to delete
        tracking_data_to_delete = TrackingData.query.filter(
            TrackingData.tracker_id == tracker_id,
            TrackingData.entry_date >= start_date,
            TrackingData.entry_date <= end_date
        ).all()
        
        if not tracking_data_to_delete:
            return error_response("No tracking data found for this date range", 404)
        
        #delete tracking data entries
        for tracking_data in tracking_data_to_delete:
            db.session.delete(tracking_data)
        db.session.commit()
        
        return success_response("Tracking data deleted successfully", {'count': len(tracking_data_to_delete)})
    except Exception as e:
        return error_response(f"Failed to bulk delete tracking data: {str(e)}", 500)


#bulk create tracking data entries (imported from a csv file)
@data_tracking_bp.route('/<int:tracker_id>/bulk-create-tracking-data', methods=['POST'])
@jwt_required()
def bulk_create_tracking_data(tracker_id: int):
    try:
        _, user_id = get_current_user()
        tracker = verify_tracker_ownership(tracker_id, user_id)
    except ValueError as e:
        return error_response(str(e), 404)
    
    try:
        # Get csv file from request
        csv_file = request.files.get('csv_file')
        if not csv_file:
            return error_response("csv_file is required", 400)
        
        # Read csv file
        csv_data = csv_file.read().decode('utf-8')
        csv_reader = csv.reader(csv_data.splitlines())
        
        # Skip header row
        next(csv_reader, None)
        
        tracking_data_to_create = []
        errors = []
        
        # Process each row
        for row_num, row in enumerate(csv_reader, start=2):  # start=2 because header is row 1
            try:
                # Validate row has at least 2 columns
                if len(row) < 2:
                    errors.append(f"Row {row_num}: Insufficient columns (expected at least 2)")
                    continue
                
                # Parse entry_date
                entry_date_str = row[0].strip()
                try:
                    entry_date = datetime.strptime(entry_date_str, '%Y-%m-%d').date()
                except ValueError:
                    errors.append(f"Row {row_num}: Invalid date format '{entry_date_str}' (expected YYYY-MM-DD)")
                    continue
                
                # Parse entry_data (JSON string)
                entry_data_str = row[1].strip()
                try:
                    entry_data = json.loads(entry_data_str) if entry_data_str else {}
                except json.JSONDecodeError as e:
                    errors.append(f"Row {row_num}: Invalid JSON in entry_data: {str(e)}")
                    continue
                
                # Parse ai_insights (optional, can be empty)
                ai_insights = None
                if len(row) > 2 and row[2].strip():
                    try:
                        ai_insights = json.loads(row[2].strip()) if row[2].strip() else None
                    except json.JSONDecodeError:
                        # If not valid JSON, treat as plain string
                        ai_insights = row[2].strip()
                
                # Create tracking data entry
                tracking_data = TrackingService.create_tracking_data(
                    tracker=tracker,
                    data=entry_data,
                    entry_date=entry_date,
                    ai_insights=ai_insights
                )
                tracking_data_to_create.append(tracking_data)
                
            except ValueError as e:
                errors.append(f"Row {row_num}: {str(e)}")
                continue
            except Exception as e:
                errors.append(f"Row {row_num}: Unexpected error - {str(e)}")
                continue
        
        # Build response
        response_data = {
            'count': len(tracking_data_to_create),
            'created_entries': [data.to_dict() for data in tracking_data_to_create]
        }
        
        if errors:
            response_data['errors'] = errors
            response_data['error_count'] = len(errors)
        
        if not tracking_data_to_create and errors:
            return error_response(
                f"Failed to create any tracking data. {len(errors)} error(s) occurred.",
                400,
                {'errors': errors}
            )
        
        message = f"Successfully created {len(tracking_data_to_create)} tracking data entries"
        if errors:
            message += f" ({len(errors)} error(s) occurred)"
        
        return success_response(message, response_data)
        
    except Exception as e:
        return error_response(f"Failed to bulk create tracking data: {str(e)}", 500)


#--------------------------------------------
#UTILITY ROUTES

#Export tracking data entries of a specific range of dates as a csv file
@data_tracking_bp.route('/<int:tracker_id>/export-tracking-data', methods=['GET'])
@jwt_required()
def export_tracking_data(tracker_id: int):
    try:
        _, user_id = get_current_user()
        tracker = verify_tracker_ownership(tracker_id, user_id)
    except ValueError as e:
        return error_response(str(e), 404)
    
    try:
        #get start and end date from query parameters
        start_date_str = request.args.get('start_date')
        end_date_str = request.args.get('end_date')
        if not start_date_str or not end_date_str:
            return error_response("Both start_date and end_date query parameters are required (YYYY-MM-DD)", 400)
        
        #parse dates
        try:
            start_date = datetime.strptime(start_date_str, '%Y-%m-%d').date()
            end_date = datetime.strptime(end_date_str,'%Y-%m-%d').date()
        except ValueError:
            return error_response("Invalid date format. Use YYYY-MM-DD", 400)
        
        if start_date > end_date:
            return error_response("start_date must be before or equal to end_date", 400)
        
        # Get tracking data entries to export
        tracking_data_to_export = TrackingData.query.filter(
            TrackingData.tracker_id == tracker_id,
            TrackingData.entry_date >= start_date,
            TrackingData.entry_date <= end_date
        ).order_by(TrackingData.entry_date.asc()).all()
        
        if not tracking_data_to_export:
            return error_response("No tracking data found for this date range", 404)
        
        # Create CSV content
        # Use context manager to ensure proper cleanup
        with io.StringIO() as output:
            csv_writer = csv.writer(output)
            
            # Write header
            csv_writer.writerow(['entry_date', 'entry_data', 'ai_insights'])
            
            # Write data rows
            for tracking_data in tracking_data_to_export:
                # Convert data and ai_insights to JSON strings
                entry_data_str = json.dumps(tracking_data.data) if tracking_data.data else ''
                ai_insights_str = json.dumps(tracking_data.ai_insights) if tracking_data.ai_insights else ''
                
                csv_writer.writerow([
                    tracking_data.entry_date.strftime('%Y-%m-%d'),
                    entry_data_str,
                    ai_insights_str
                ])
            
            # Get CSV content before buffer closes
            csv_content = output.getvalue()
        
        # Create response with proper headers for file download
        response = Response(
            csv_content,
            mimetype='text/csv',
            headers={
                'Content-Disposition': f'attachment; filename=tracking_data_{tracker_id}_{start_date_str}_to_{end_date_str}.csv'
            }
        )
        
        return response
    except Exception as e:
        return error_response(f"Failed to export tracking data: {str(e)}", 500)


#--------------------------------------------------------------
#ANALYTICS ROUTES

#----------------------------------------------------------------
#ANALYTICS SUFFICIENCY SYSTEM ROUTES

#get insights for a specific tracker about a field
@data_tracking_bp.route('/<int:tracker_id>/get-insights-for-field', methods=['GET'])
@jwt_required()
def get_field_insights(tracker_id: int):
    """
    Get analytics insights for a specific field.
    
    Query params:
    - field_name (required): Field to analyze
    - time_range (optional): week, 2_weeks, month, 3_months, 6_months, year, all
    - insight_type (optional): Specific insight type to calculate
    - show_all (optional): true/false - show all eligible insights or just primary
    """
    try:
        _, user_id = get_current_user()
        tracker = verify_tracker_ownership(tracker_id, user_id)
    except ValueError as e:
        return error_response(str(e), 404)
    
    try:
        # Get parameters
        field_name = request.args.get('field_name')
        if not field_name:
            return error_response("field_name query parameter is required", 400)
        
        time_range = request.args.get('time_range', 'all')
        show_all = request.args.get('show_all', 'false').lower() == 'true'
        requested_insight_type = request.args.get('insight_type')
        option = request.args.get('option')  # Optional: specific option to check
        
        # Calculate date range
        end_date = date.today()
        time_range_days = {
            'week': 7, '2_weeks': 14, 'month': 30,
            '3_months': 90, '6_months': 180, 'year': 365, 'all': None
        }
        
        if time_range not in time_range_days:
            return error_response(
                f"Invalid time_range. Valid: {', '.join(time_range_days.keys())}",
                400
            )
        
        start_date = None
        if time_range != 'all':
            start_date = end_date - timedelta(days=time_range_days[time_range])
        
        # Get tracking data
        query = TrackingData.query.filter_by(tracker_id=tracker_id)
        if start_date:
            query = query.filter(TrackingData.entry_date >= start_date)
        query = query.filter(TrackingData.entry_date <= end_date)
        
        all_entries = query.order_by(TrackingData.entry_date.asc()).all()
        
        # Filter entries with this field
        field_entries = [e for e in all_entries if e.data and field_name in e.data]
        
        if not field_entries:
            return success_response(
                "No data found for this field",
                {
                    'field_name': field_name,
                    'time_range': time_range,
                    'entry_count': 0,
                    'has_insights': False,
                    'message': f"Start tracking '{field_name}' to unlock insights"
                }
            )
        
        # If option is specified, filter to entries that actually have that option
        option_entries = field_entries
        if option:
            option_entries = []
            for entry in field_entries:
                field_data = entry.data.get(field_name)
                if field_data:
                    # Check if option exists in the field data
                    if isinstance(field_data, dict):
                        # For nested structure: {"hours": 8.5, "quality": 7}
                        if option in field_data and field_data[option] is not None:
                            option_entries.append(entry)
                    elif isinstance(field_data, list):
                        # For array fields, check if option is in the array
                        if option in field_data:
                            option_entries.append(entry)
                    else:
                        # Direct value - if option matches the value
                        if str(field_data).lower() == option.lower():
                            option_entries.append(entry)
            
            if not option_entries:
                return success_response(
                    f"No data found for '{field_name}.{option}'",
                    {
                        'field_name': field_name,
                        'option': option,
                        'time_range': time_range,
                        'entry_count': 0,
                        'has_insights': False,
                        'message': f"Start tracking '{field_name}.{option}' to unlock insights"
                    }
                )
        
        # Calculate metrics based on option-specific entries
        entry_count = len(option_entries)
        time_span_days = (option_entries[-1].entry_date - option_entries[0].entry_date).days + 1
        
        # Get insights
        if requested_insight_type:
            # User requested specific insight
            try:
                insight_type = InsightType(requested_insight_type)
            except ValueError:
                valid = [it.value for it in InsightType]
                return error_response(
                    f"Invalid insight_type. Valid: {', '.join(valid)}", 400
                )
            
            result = DataSufficiencyChecker.check_field_eligibility(
                field_name, entry_count, time_span_days, insight_type, option=option
            )
            
            confidence = ConfidenceLevel(result['confidence'])
            display_config = AnalyticsDisplayStrategy.get_display_config(
                entry_count, confidence
            )
            
            response_data = {
                'field_name': field_name,
                'entry_count': entry_count,
                'time_span_days': time_span_days,
                'insight': result,
                'display_config': display_config
            }
            if option:
                response_data['option'] = option
            
            return success_response("Insight calculated", response_data)
        
        elif show_all:
            # Show all eligible insights
            eligible = DataSufficiencyChecker.get_all_eligible_insights(
                field_name, entry_count, time_span_days, option=option
            )
            
            summary = AnalyticsDisplayStrategy.build_insight_summary(eligible)
            
            response_data = {
                'field_name': field_name,
                'entry_count': entry_count,
                'time_span_days': time_span_days,
                'insights_summary': summary
            }
            if option:
                response_data['option'] = option
            
            return success_response("All insights retrieved", response_data)
        
        else:
            # Show primary (best) insight only
            primary = DataSufficiencyChecker.get_primary_insight(
                field_name, entry_count, time_span_days, option=option
            )
            
            if not primary:
                return success_response(
                    "No insights available yet",
                    {
                        'field_name': field_name,
                        'entry_count': entry_count,
                        'has_insights': False,
                        'message': 'Keep logging to unlock insights!'
                    }
                )
            
            confidence = ConfidenceLevel(primary['confidence'])
            display_config = AnalyticsDisplayStrategy.get_display_config(
                entry_count, confidence
            )
            
            response_data = {
                'field_name': field_name,
                'entry_count': entry_count,
                'time_span_days': time_span_days,
                'primary_insight': primary,
                'display_config': display_config
            }
            if option:
                response_data['option'] = option
            
            return success_response("Primary insight retrieved", response_data)
    
    except Exception as e:
        return error_response(f"Failed to get insights: {str(e)}", 500)

#get insights for a specific tracker all fields included
@data_tracking_bp.route('/<int:tracker_id>/get-all-insights', methods=['GET'])
@jwt_required()
def get_insights(tracker_id: int):
    """
    Get insights for all fields in a tracker.
    
    Returns primary insight for each field (best insight per field).
    """
    try:
        _, user_id = get_current_user()
        tracker = verify_tracker_ownership(tracker_id, user_id)
    except ValueError as e:
        return error_response(str(e), 404)
    
    try:
        
        # Get all tracking data entries
        all_entries = TrackingData.query.filter_by(tracker_id=tracker_id)\
            .order_by(TrackingData.entry_date.asc()).all()
        
        if not all_entries:
            return success_response("No tracking data found", {
                'fields': [],
                'total_fields': 0
            })
        
        # Group entries by field name
        # Structure: {field_name: [list of entries that have this field]}
        field_entries_map = {}
        
        for entry in all_entries:
            if not entry.data:
                continue
            
            for field_name in entry.data.keys():
                if field_name not in field_entries_map:
                    field_entries_map[field_name] = []
                field_entries_map[field_name].append(entry)
        
        # Calculate insights for each field
        fields_insights = []
        
        for field_name, entries in field_entries_map.items():
            # Calculate metrics for this field
            entry_count = len(entries)
            
            # Time span: from first entry to last entry with this field
            first_entry_date = entries[0].entry_date
            last_entry_date = entries[-1].entry_date
            time_span_days = (last_entry_date - first_entry_date).days + 1
            
            # Get primary (best) insight for this field
            primary_insight = DataSufficiencyChecker.get_primary_insight(
                field_name,
                entry_count,
                time_span_days
            )
            
            if primary_insight:
                # Get display config
                confidence = ConfidenceLevel(primary_insight['confidence'])
                display_config = AnalyticsDisplayStrategy.get_display_config(
                    entry_count,
                    confidence
                )
                
                fields_insights.append({
                    'field_name': field_name,
                    'entry_count': entry_count,
                    'time_span_days': time_span_days,
                    'date_range': {
                        'start_date': first_entry_date.isoformat(),
                        'end_date': last_entry_date.isoformat()
                    },
                    'primary_insight': primary_insight,
                    'display_config': display_config
                })
        
        return success_response("All insights retrieved", {
            'fields': fields_insights,
            'total_fields': len(fields_insights)
        })
        
    except Exception as e:
        return error_response(f"Failed to get all insights: {str(e)}", 500)


#--------------------------------------------------------------
#ANALYTICS TREND LINE ROUTES

@data_tracking_bp.route('/<int:tracker_id>/get-trend-line', methods=['GET'])
@jwt_required()
def get_trend_line(tracker_id: int):
    """
    Get trend line analysis for a specific field.
    
    Query params:
    - field_name (required): Field to analyze
    - time_range (optional): week, 2_weeks, month, 3_months, 6_months, year, all (default: all)
    - option (optional): Specific numeric option to analyze (e.g., 'hours', 'quality')
                        If not provided, uses first available numeric option
    """
    try:
        _, user_id = get_current_user()
        tracker = verify_tracker_ownership(tracker_id, user_id)
    except ValueError as e:
        return error_response(str(e), 404)
    
    try:
        # Get parameters
        field_name = request.args.get('field_name')
        if not field_name:
            return error_response("field_name query parameter is required", 400)
        
        time_range = request.args.get('time_range', 'all')
        valid_ranges = ['week', '2_weeks', 'month', '3_months', '6_months', 'year', 'all']
        if time_range not in valid_ranges:
            return error_response(
                f"Invalid time_range. Valid: {', '.join(valid_ranges)}",
                400
            )
        
        option = request.args.get('option')  # Optional: specific option to analyze
        
        # Analyze trend line
        result = TrendLineAnalyzer.analyze(field_name, tracker_id, time_range, option=option)
        
        return success_response("Trend line retrieved successfully", result)
        
    except ValueError as e:
        return error_response(str(e), 400)
    except Exception as e:
        return error_response(f"Failed to get trend line: {str(e)}", 500)


@data_tracking_bp.route('/<int:tracker_id>/trend-chart', methods=['GET'])
@jwt_required()
def get_trend_chart(tracker_id: int):
    """
    Get trend line chart image for a specific field.
    
    Query params:
    - field_name (required): Field to analyze
    - time_range (optional): week, 2_weeks, month, 3_months, 6_months, year, all (default: all)
    """
    try:
        _, user_id = get_current_user()
        tracker = verify_tracker_ownership(tracker_id, user_id)
    except ValueError as e:
        return error_response(str(e), 404)
    
    try:
        # Get parameters
        field_name = request.args.get('field_name')
        if not field_name:
            return error_response("field_name query parameter is required", 400)
        
        time_range = request.args.get('time_range', 'all')
        valid_ranges = ['week', '2_weeks', 'month', '3_months', '6_months', 'year', 'all']
        if time_range not in valid_ranges:
            return error_response(
                f"Invalid time_range. Valid: {', '.join(valid_ranges)}",
                400
            )
        
        option = request.args.get('option')  # Optional: specific option to analyze
        
        # Generate chart image
        image_data = ChartGenerator.generate_trend_chart(
            field_name, tracker_id, time_range, option=option
        )
        
        # Build filename
        filename = f'trend_chart_{field_name}'
        if option:
            filename += f'_{option}'
        filename += f'_{time_range}.png'
        
        # Return image as response
        return Response(
            image_data,
            mimetype='image/png',
            headers={
                'Content-Disposition': f'inline; filename={filename}'
            }
        )
        
    except ValueError as e:
        return error_response(str(e), 400)
    except Exception as e:
        return error_response(f"Failed to generate chart: {str(e)}", 500)

#---------------------------------------------------------------
#ANALYTICS CATEGORICAL BAR CHARTS ROUTES

@data_tracking_bp.route('/<int:tracker_id>/get-categorical-analysis', methods=['GET'])
@jwt_required()
def get_categorical_analysis(tracker_id: int):
    """
    Get categorical analysis for a specific field.
    
    Query params:
    - field_name (required): Field to analyze
    - time_range (optional): week, 2_weeks, month, 3_months, 6_months, year, all (default: all)
    """
    try:
        _, user_id = get_current_user()
        tracker = verify_tracker_ownership(tracker_id, user_id)
    except ValueError as e:
        return error_response(str(e), 404)
    
    try:
        # Get parameters
        field_name = request.args.get('field_name')
        if not field_name:
            return error_response("field_name query parameter is required", 400)
        
        time_range = request.args.get('time_range', 'all')
        valid_ranges = ['week', '2_weeks', 'month', '3_months', '6_months', 'year', 'all']
        if time_range not in valid_ranges:
            return error_response(
                f"Invalid time_range. Valid: {', '.join(valid_ranges)}",
                400
            )
        
        option = request.args.get('option')  # Optional: specific option to analyze
        
        # Generate chart image
        result = CategoricalAnalyzer.analyze(
            field_name, tracker_id, time_range, option=option
        )
        return success_response("Categorical analysis retrieved successfully", result)
    except ValueError as e:
        return error_response(str(e), 400)
    except Exception as e:
        return error_response(f"Failed to get categorical analysis: {str(e)}", 500)


@data_tracking_bp.route('/<int:tracker_id>/get-categorical-bar-chart', methods=['GET'])
@jwt_required()
def get_categorical_bar_chart(tracker_id: int):
    """
    Get bar chart for a specific field.
    
    Query params:
    - field_name (required): Field to analyze
    - time_range (optional): week, 2_weeks, month, 3_months, 6_months, year, all (default: all)
    """
    try:
        _, user_id = get_current_user()
        tracker = verify_tracker_ownership(tracker_id, user_id)
    except ValueError as e:
        return error_response(str(e), 404)
    try:
        # Get parameters
        field_name = request.args.get('field_name')
        if not field_name:
            return error_response("field_name query parameter is required", 400)
        
        time_range = request.args.get('time_range', 'all')
        valid_ranges = ['week', '2_weeks', 'month', '3_months', '6_months', 'year', 'all']
        if time_range not in valid_ranges:
            return error_response(
                f"Invalid time_range. Valid: {', '.join(valid_ranges)}",
                400 
            )
        
        option = request.args.get('option')  # Optional: specific option to analyze
        
        # Generate chart image
        image_data = CategoricalAnalyzer.generate_bar_chart(
            field_name, tracker_id, time_range, option=option
        )
        
        # Build filename
        filename = f'bar_chart_{field_name}'
        if option:
            filename += f'_{option}'
        filename += f'_{time_range}.png'
        
        # Return image as response (not JSON!)
        return Response(
            image_data,
            mimetype='image/png',
            headers={
                'Content-Disposition': f'inline; filename={filename}'
            }
        )
    except ValueError as e:
        return error_response(str(e), 400)
    except Exception as e:
        return error_response(f"Failed to get categorical bar chart: {str(e)}", 500)

#--------------------------------------------------
#ANALYTICS UNIFIED ANALYZER ROUTES

@data_tracking_bp.route('/<int:tracker_id>/get-unified-analysis', methods=['GET'])
@jwt_required()
def get_unified_analysis(tracker_id: int):
    """
    Get unified analysis for a specific field.
    """
    try:
        _, user_id = get_current_user()
        tracker = verify_tracker_ownership(tracker_id, user_id)
    except ValueError as e:
        return error_response(str(e), 404)
    try:
        # Get parameters
        field_name = request.args.get('field_name')
        if not field_name:
            return error_response("field_name query parameter is required", 400)
        
        time_range = request.args.get('time_range', 'all')
        valid_ranges = ['week', '2_weeks', 'month', '3_months', '6_months', 'year', 'all']
        if time_range not in valid_ranges:
            return error_response(
                f"Invalid time_range. Valid: {', '.join(valid_ranges)}",
                400 
            )
        
        option = request.args.get('option')  # Optional: specific option to analyze
        
        # Generate unified analysis
        result = UnifiedAnalyzer.analyze(
            field_name, tracker_id, time_range, option=option
        )
        return success_response("Unified analysis retrieved successfully", result)
    except ValueError as e:
        return error_response(str(e), 400)
    except Exception as e:
        return error_response(f"Failed to get unified analysis: {str(e)}", 500)


@data_tracking_bp.route('/<int:tracker_id>/get-unified-chart', methods=['GET'])
@jwt_required()
def get_unified_chart(tracker_id: int):
    """
    Get unified chart for a specific field.
    """
    try:
        _, user_id = get_current_user()
        tracker = verify_tracker_ownership(tracker_id, user_id)
    except ValueError as e:
        return error_response(str(e), 404)
    try:
        # Get parameters
        field_name = request.args.get('field_name')
        if not field_name:
            return error_response("field_name query parameter is required", 400)

        time_range = request.args.get('time_range', 'all')
        valid_ranges = ['week', '2_weeks', 'month', '3_months', '6_months', 'year', 'all']
        if time_range not in valid_ranges:
            return error_response(
                f"Invalid time_range. Valid: {', '.join(valid_ranges)}",
                400 
            )
        
        option = request.args.get('option')  # Optional: specific option to analyze
        
        # Generate unified chart (returns bytes - PNG image)
        image_data = UnifiedAnalyzer.generate_chart(
            field_name, tracker_id, time_range, option=option
        )
        
        # Build filename
        filename = f'unified_chart_{field_name}'
        if option:
            filename += f'_{option}'
        filename += f'_{time_range}.png'
        
        # Return image as response (not JSON!)
        return Response(
            image_data,
            mimetype='image/png',
            headers={
                'Content-Disposition': f'inline; filename={filename}'
            }
        )
    except ValueError as e:
        return error_response(str(e), 400)
    except Exception as e:
        return error_response(f"Failed to get unified chart: {str(e)}", 500)




