from flask import Blueprint, request, jsonify
from flask_jwt_extended import create_access_token, create_refresh_token, get_jwt_identity, jwt_required
from marshmallow import ValidationError
from datetime import datetime
from app import db
from app.models.user import User
from app.models.tracker import Tracker
from app.models.tracking_data import TrackingData
from app.models.tracker_category import TrackerCategory
from app.schemas.user_schemas import UserRegistrationSchema, UserLoginSchema
from app.schemas.tracker_schemas import TrackerSchema, TrackerUpdateSchema, TrackerPatchSchema



trackers_bp = Blueprint('trackers', __name__)

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

#Create a custom tracker for the user
@trackers_bp.route('/create-custom-tracker', methods=['POST'])
@jwt_required()
def create_custom_tracker():
    current_user_id = get_jwt_identity()
    
    # Validate input
    schema = TrackerSchema()
    try:
        validated_data = schema.load(request.json)
    except ValidationError as err:
        return jsonify({'error': 'Validation failed', 'details': err.messages}), 400
    
    category_name = validated_data['name'].strip()
    
    # get baseline schema
    from app.config import tracker_config
    baseline_schema = tracker_config.get_schema('baseline')
    
    # Combine baseline with custom schema
    combined_schema = {
        'baseline': baseline_schema,
        'custom_tracker': validated_data['data_schema']
    }
    
    # Create custom tracker category
    custom_tracker_category = TrackerCategory(
        name=category_name,
        data_schema=combined_schema,  
        created_at=datetime.now(),
        is_active=True
    )
    db.session.add(custom_tracker_category)
    db.session.flush()  # This generates the ID of the category without committing so we can use later
    
    # Create custom tracker
    custom_tracker = Tracker(
        user_id=current_user_id,
        category_id=custom_tracker_category.id, 
        is_default=False
    )
    db.session.add(custom_tracker)
    db.session.commit()  # Commit both category and tracker
    return jsonify({'message': 'Custom tracker created successfully'}), 201



#Data schema routes

# Get all fields for a tracker
@trackers_bp.route('/<int:tracker_id>/fields', methods=['GET'])
@jwt_required()
def get_tracker_fields(tracker_id):
    """Get all fields for a specific tracker with full details"""
    current_user_id = get_jwt_identity()
    
    tracker = Tracker.query.filter_by(id=tracker_id, user_id=current_user_id).first()
    if not tracker:
        return jsonify({'error': 'Tracker not found'}), 404
    
    from app.models.tracker_field import TrackerField
    fields = TrackerField.query.filter_by(
        category_id=tracker.category_id, 
        is_active=True
    ).order_by(TrackerField.field_order).all()
    
    return jsonify({
        'fields': [field.to_dict() for field in fields],
        'total_count': len(fields)
    }), 200


# Create a new field
@trackers_bp.route('/<int:tracker_id>/fields', methods=['POST'])
@jwt_required()
def create_tracker_field(tracker_id):
    """Create a new field for a tracker"""
    current_user_id = get_jwt_identity()
    
    tracker = Tracker.query.filter_by(id=tracker_id, user_id=current_user_id).first()
    if not tracker:
        return jsonify({'error': 'Tracker not found'}), 404
    
    # Prevent modifying default trackers
    category = TrackerCategory.query.get(tracker.category_id)
    default_categories = ['Period Tracker', 'Workout Tracker', 'Symptom Tracker']
    if category.name in default_categories:
        return jsonify({'error': 'Cannot modify default tracker fields'}), 403
    
    data = request.json
    from app.models.tracker_field import TrackerField
    
    # Get next order number
    max_order = db.session.query(db.func.max(TrackerField.field_order)).filter_by(
        category_id=tracker.category_id
    ).scalar() or 0
    
    field = TrackerField(
        category_id=tracker.category_id,
        field_name=data.get('field_name'),
        field_type=data.get('field_type', 'string'),
        is_required=data.get('is_required', False),
        display_label=data.get('display_label'),
        help_text=data.get('help_text'),
        placeholder=data.get('placeholder'),
        validation_rules=data.get('validation_rules'),
        display_options=data.get('display_options'),
        field_order=max_order + 1,
        field_group=data.get('field_group', 'custom')
    )
    
    db.session.add(field)
    db.session.commit()
    
    return jsonify({
        'message': 'Field created successfully',
        'field': field.to_dict()
    }), 201


# Update a specific field
@trackers_bp.route('/<int:tracker_id>/fields/<int:field_id>', methods=['PUT'])
@jwt_required()
def update_tracker_field(tracker_id, field_id):
    """Update a specific field"""
    current_user_id = get_jwt_identity()
    
    tracker = Tracker.query.filter_by(id=tracker_id, user_id=current_user_id).first()
    if not tracker:
        return jsonify({'error': 'Tracker not found'}), 404
    
    from app.models.tracker_field import TrackerField
    field = TrackerField.query.filter_by(id=field_id, category_id=tracker.category_id).first()
    if not field:
        return jsonify({'error': 'Field not found'}), 404
    
    # Prevent modifying default tracker fields
    if field.field_group == 'baseline':
        return jsonify({'error': 'Cannot modify baseline fields'}), 403
    
    data = request.json
    
    # Update field properties
    if 'field_name' in data:
        field.field_name = data['field_name']
    if 'field_type' in data:
        field.field_type = data['field_type']
    if 'is_required' in data:
        field.is_required = data['is_required']
    if 'display_label' in data:
        field.display_label = data['display_label']
    if 'help_text' in data:
        field.help_text = data['help_text']
    if 'placeholder' in data:
        field.placeholder = data['placeholder']
    if 'validation_rules' in data:
        field.validation_rules = data['validation_rules']
    if 'display_options' in data:
        field.display_options = data['display_options']
    
    field.updated_at = datetime.utcnow()
    db.session.commit()
    
    return jsonify({
        'message': 'Field updated successfully',
        'field': field.to_dict()
    }), 200


# Delete a field
@trackers_bp.route('/<int:tracker_id>/fields/<int:field_id>', methods=['DELETE'])
@jwt_required()
def delete_tracker_field(tracker_id, field_id):
    """Delete a specific field"""
    current_user_id = get_jwt_identity()
    
    tracker = Tracker.query.filter_by(id=tracker_id, user_id=current_user_id).first()
    if not tracker:
        return jsonify({'error': 'Tracker not found'}), 404
    
    from app.models.tracker_field import TrackerField
    field = TrackerField.query.filter_by(id=field_id, category_id=tracker.category_id).first()
    if not field:
        return jsonify({'error': 'Field not found'}), 404
    
    # Prevent deleting baseline fields
    if field.field_group == 'baseline':
        return jsonify({'error': 'Cannot delete baseline fields'}), 403
    
    # Soft delete
    field.is_active = False
    field.updated_at = datetime.utcnow()
    db.session.commit()
    
    return jsonify({'message': 'Field deleted successfully'}), 200


# Reorder fields
@trackers_bp.route('/<int:tracker_id>/fields/reorder', methods=['PUT'])
@jwt_required()
def reorder_tracker_fields(tracker_id):
    """Reorder fields for a tracker"""
    current_user_id = get_jwt_identity()
    
    tracker = Tracker.query.filter_by(id=tracker_id, user_id=current_user_id).first()
    if not tracker:
        return jsonify({'error': 'Tracker not found'}), 404
    
    field_orders = request.json.get('field_orders', [])  # [{"field_id": 1, "order": 1}, ...]
    
    from app.models.tracker_field import TrackerField
    
    for item in field_orders:
        field = TrackerField.query.filter_by(
            id=item['field_id'], 
            category_id=tracker.category_id
        ).first()
        if field and field.field_group != 'baseline':  # Don't reorder baseline fields
            field.field_order = item['order']
    
    db.session.commit()
    
    return jsonify({'message': 'Fields reordered successfully'}), 200


# Get available field types for form builder
@trackers_bp.route('/field-types', methods=['GET'])
@jwt_required()
def get_field_types():
    """Get all available field types for the form builder"""
    from app.models.tracker_field import TrackerField
    
    return jsonify({
        'field_types': TrackerField.get_available_field_types()
    }), 200


