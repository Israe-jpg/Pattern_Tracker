from flask import Blueprint, request, jsonify
from flask_jwt_extended import get_jwt_identity, jwt_required
from marshmallow import ValidationError
from typing import Tuple, Dict, Any

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

#ROUTES

# ------------------------------
#BASIC CRUD ROUTES

#get all tracking data for a specific tracker
@data_tracking_bp.route('/<int:tracker_id>/get-all-tracking-data', methods=['GET'])
@jwt_required()
def get_all_tracking_data(tracker_id: int):
    try:
        _, user_id = get_current_user()
        tracker = verify_tracker_ownership(tracker_id, user_id)
    except ValueError as e:
        return error_response(str(e), 404)
    
    try:
        tracking_data = TrackingData.query.filter_by(tracker_id=tracker_id).all()
        return success_response(
            "All tracking data retrieved successfully",
            {'tracking_data': [data.to_dict() for data in tracking_data]}
        )
    except Exception as e:
        return error_response(f"Failed to get all tracking data: {str(e)}", 500)

#create a new tracking data entry for a specific tracker
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
        tracking_data = TrackingService.add_tracking_data(
            tracker=tracker,
            data=entry_data,
            entry_date=entry_date,
            ai_insights=ai_insights
        )
        
        return success_response(
            "Tracking data added successfully",
            {'tracking_data': tracking_data.to_dict()}, 201
        )
    except ValidationError as e:
        return error_response("Validation failed", 400, e.messages)
    except ValueError as e:
        return error_response(str(e), 400)
    except Exception as e:
        return error_response(f"Failed to add tracking data: {str(e)}", 500)

#update a tracking data entry for a specific tracker


#delete a tracking data entry for a specific tracker


# -------------------------------------
# TIME RELATED ROUTES
