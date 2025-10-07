from flask import Blueprint, request, jsonify
from flask_jwt_extended import create_access_token, create_refresh_token, get_jwt_identity, jwt_required
from marshmallow import ValidationError
from datetime import datetime
from app import db
from app.models.user import User
from app.models.tracker import Tracker
from app.config import tracker_config
from app.models.tracking_data import TrackingData
from app.models.tracker_field import TrackerField
from app.models.tracker_category import TrackerCategory
from app.models.field_option import FieldOption
from app.schemas.user_schemas import UserRegistrationSchema, UserLoginSchema
from app.schemas.tracker_schemas import TrackerSchema, TrackerUpdateSchema, TrackerPatchSchema, TrackerFieldSchema, CustomCategorySchema
from app.services.category_service import CategoryService

trackers_bp = Blueprint('trackers', __name__)

#TRACKER ROUTES

#setup default trackers for user
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


#get current user's trackers
@trackers_bp.route('/my-trackers', methods=['GET'])
@jwt_required()
def get_my_trackers():
    current_user_id = get_jwt_identity()
    trackers = Tracker.query.filter_by(user_id=current_user_id).all()
    
    return jsonify({
        'trackers': [t.to_dict() for t in trackers],
        'total_count': len(trackers)
    }), 200

#delete a tracker from the user's trackers list
@trackers_bp.route('/delete-tracker/<int:tracker_id>', methods=['DELETE'])
@jwt_required()
def delete_tracker(tracker_id):
    current_user_id = get_jwt_identity()
    tracker = Tracker.query.filter_by(id=tracker_id, user_id=current_user_id).first()
    if not tracker:
        return jsonify({'error': 'Tracker not found'}), 404
    db.session.delete(tracker)
    if not tracker.is_default:
        custom_tracker_category = TrackerCategory.query.filter_by(id=tracker.category_id).first()
        if custom_tracker_category:
            db.session.delete(custom_tracker_category)
    db.session.commit()
    return jsonify({'message': 'Tracker deleted successfully'}), 200

#update the default tracker from the list of user's trackers
@trackers_bp.route('/update-default-tracker/<int:tracker_id>', methods=['PUT'])
@jwt_required()
def update_default_tracker(tracker_id):
    current_user_id = get_jwt_identity()
    predefault_tracker = Tracker.query.filter_by(user_id=current_user_id, is_default=True).first()
    if not predefault_tracker:
        return jsonify({'error': 'Predefault tracker not found'}), 404
    predefault_tracker.is_default = False
    tracker = Tracker.query.filter_by(id=tracker_id, user_id=current_user_id).first()
    if not tracker:
        return jsonify({'error': 'Tracker not found'}), 404
    tracker.is_default = True
    db.session.commit()
    return jsonify({'message': 'Tracker updated successfully'}), 200


#CUSTOM TRACKERS ROUTES

# Create a custom category with baseline + custom fields
@trackers_bp.route('/create-custom-category', methods=['POST'])
@jwt_required()
def create_custom_category():
    current_user_id = get_jwt_identity()
    
    # Validate input
    schema = CustomCategorySchema()
    try:
        validated_data = schema.load(request.json)
    except ValidationError as err:
        return jsonify({'error': 'Validation failed', 'details': err.messages}), 400
    
    try:
        # Create custom category using the service
        category = CategoryService.create_custom_category(
            name=validated_data['name'],
            custom_fields_data=validated_data['custom_fields']
        )
        
        # Create tracker for the user
        tracker = Tracker(
            user_id=current_user_id,
            category_id=category.id,
            is_default=False
        )
        db.session.add(tracker)
        db.session.commit()
        
        return jsonify({
            'message': 'Custom category and tracker created successfully',
            'category': category.to_dict(),
            'tracker_id': tracker.id
        }), 201
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': f'Failed to create custom category: {str(e)}'}), 500



#DATA SCHEMA ROUTES

# Get data schema of a tracker
@trackers_bp.route('/<int:tracker_id>/get-data-schema', methods=['GET'])
@jwt_required()
def get_tracker_fields(tracker_id):
    
    current_user_id = get_jwt_identity()
    
    tracker = Tracker.query.filter_by(id=tracker_id, user_id=current_user_id).first()
    if not tracker:
        return jsonify({'error': 'Tracker not found'}), 404
    tracker_category = TrackerCategory.query.filter_by(id=tracker.category_id).first()
    if not tracker_category:
        return jsonify({'error': 'Tracker category not found'}), 404
    data_schema = tracker_category.data_schema
    return jsonify({
        'data_schema': data_schema
    }), 200

# Create a new field in the data schema of a tracker


# Update a field of the data schema of a tracker


# Delete a field of the data schema of a tracker


#OPTION FIELD ROUTES

# Create a new option field for a tracker



# Update an option field of a tracker


# Delete an option field of a tracker




