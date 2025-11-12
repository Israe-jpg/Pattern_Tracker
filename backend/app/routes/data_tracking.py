from datetime import date
from flask import Blueprint, request, jsonify
from flask_jwt_extended import get_jwt_identity, jwt_required
from marshmallow import ValidationError
from typing import Tuple, Dict, Any, Optional
from sqlalchemy.orm import Query

from app import db
from app.models.user import User
from app.models.tracker import Tracker
from app.models.tracking_data import TrackingData
from app.schemas.tracking_data_schema import TrackingDataSchema
from app.services.tracking_service import TrackingService

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



#bulk create tracking data entries (imported from a csv file)



#--------------------------------------------
#UTILITY ROUTES

#Export tracking data entries of a specific range of dates as a csv file

