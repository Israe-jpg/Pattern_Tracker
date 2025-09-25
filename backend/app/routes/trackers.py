from flask import Blueprint, request, jsonify
from flask_jwt_extended import create_access_token, create_refresh_token, get_jwt_identity, jwt_required
from marshmallow import ValidationError
from app import db
from app.models.user import User
from app.models.tracker import Tracker
from app.models.tracking_data import TrackingData
from app.models.tracker_category import TrackerCategory
from app.schemas.user_schemas import UserRegistrationSchema, UserLoginSchema
from app.schemas.tracker_schemas import TrackerSchema, TrackingDataSchema


trackers_bp = Blueprint('trackers', __name__)

@trackers_bp.route('/setup-default-trackers', methods=['POST'])
def setup_default_trackers():
    current_user_id = get_jwt_identity()
    user = User.query.filter_by(id=current_user_id).first()
    
    if user.gender == 'female':
        categories = TrackerCategory.query.all()
    else:
        categories = TrackerCategory.query.filter(TrackerCategory.name != 'Period Tracker').all()
    
    for category in categories:
        tracker = Tracker(
            user_id=current_user_id, 
            category_id=category.id,
            is_default=(category.name == default_name)
        )
        db.session.add(tracker)
    
    db.session.commit()
    return jsonify({'message': f'Default trackers setup for {user.gender}'}), 200

