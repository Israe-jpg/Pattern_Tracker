from flask import Blueprint, request, jsonify
from flask_jwt_extended import create_access_token, create_refresh_token, get_jwt_identity, jwt_required
from marshmallow import ValidationError
from app import db
from app.models.user import User
from app.models.tracker import Tracker
from app.models.tracking_data import TrackingData
from app.models.tracker_category import TrackerCategory
from app.schemas.user_schemas import UserRegistrationSchema, UserLoginSchema
# from app.schemas.tracker_schemas import TrackerSchema, TrackingDataSchema


trackers_bp = Blueprint('trackers', __name__)

@trackers_bp.route('/setup-default-trackers', methods=['POST'])
@jwt_required()  
def setup_default_trackers():
    current_user_id = get_jwt_identity()
    user = User.query.filter_by(id=current_user_id).first()
    
    if not user:
        return jsonify({'error': 'User not found'}), 404
    
    # Check if user already has trackers 
    existing_trackers = Tracker.query.filter_by(user_id=current_user_id).all()
    if existing_trackers:
        return jsonify({
            'message': 'Trackers already configured',
            'trackers': [{'id': t.id, 'category_id': t.category_id, 'is_default': t.is_default} for t in existing_trackers]
        }), 200
    
    # Default to female if gender not set (for testing)
    user_gender = user.gender if user.gender else 'female'
    
    if user_gender == 'female':
        categories = TrackerCategory.query.all()
        default_name = 'Period Tracker'  
    else:
        categories = TrackerCategory.query.filter(TrackerCategory.name != 'Period Tracker').all()
        default_name = 'Workout Tracker' 
    
    trackers_created = 0
    for category in categories:
        tracker = Tracker(
            user_id=current_user_id, 
            category_id=category.id,
            is_default=(category.name == default_name)
        )
        db.session.add(tracker)
        trackers_created += 1
    
    db.session.commit()
    return jsonify({
        'message': 'Default trackers setup successfully',
        'trackers_created': trackers_created,
        'user_gender': user_gender
    }), 201



@trackers_bp.route('/my-trackers', methods=['GET'])
@jwt_required()
def get_my_trackers():
    current_user_id = get_jwt_identity()
    trackers = Tracker.query.filter_by(user_id=current_user_id).all()
    
    return jsonify({
        'trackers': [t.to_dict() for t in trackers],
        'total_count': len(trackers)
    }), 200

