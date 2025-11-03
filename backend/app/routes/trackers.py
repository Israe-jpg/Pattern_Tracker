from flask import Blueprint, request, jsonify
from flask_jwt_extended import get_jwt_identity, jwt_required
from marshmallow import ValidationError
from typing import Tuple, Dict, Any

from app import db
from app.models.user import User
from app.models.tracker import Tracker
from app.models.tracker_field import TrackerField
from app.models.tracker_category import TrackerCategory
from app.models.field_option import FieldOption
from app.schemas.tracker_schemas import (
    CustomCategorySchema, FieldOptionSchema
)
from app.services.category_service import CategoryService

trackers_bp = Blueprint('trackers', __name__)


# HELPER FUNCTIONS

#get current user
def get_current_user() -> Tuple[User, int]:
    user_id = get_jwt_identity()
    user = User.query.filter_by(id=user_id).first()
    if not user:
        raise ValueError("User not found")
    return user, user_id

#verify tracker ownership
def verify_tracker_ownership(tracker_id: int, user_id: int) -> Tracker:
    tracker = Tracker.query.filter_by(id=tracker_id, user_id=user_id).first()
    if not tracker:
        raise ValueError("Tracker not found")
    return tracker

#verify field ownership
def verify_field_ownership(tracker_field_id: int, user_id: int) -> TrackerField:
    tracker_field = TrackerField.query.filter_by(id=tracker_field_id).first()
    if not tracker_field:
        raise ValueError("Tracker field not found")
    
    # Verify field belongs to user's tracker
    tracker = Tracker.query.filter_by(
        category_id=tracker_field.category_id,
        user_id=user_id
    ).first()
    if not tracker:
        raise ValueError("Unauthorized - field does not belong to your tracker")
    
    return tracker_field


#verify option ownership
def verify_option_ownership(option_id: int, user_id: int) -> FieldOption:
    option = FieldOption.query.filter_by(id=option_id).first()
    if not option:
        raise ValueError("Option not found")
    
    # Verify option belongs to user's tracker
    tracker = Tracker.query.filter_by(
        category_id=option.tracker_field.category_id,
        user_id=user_id
    ).first()
    if not tracker:
        raise ValueError("Unauthorized - option does not belong to your tracker")
    
    return option


#error response
def error_response(message: str, status_code: int = 400, details: Dict[str, Any] = None) -> Tuple[Dict, int]:
    response = {'error': message}
    if details:
        response['details'] = details
    return jsonify(response), status_code

#success response
def success_response(message: str, data: Dict[str, Any] = None, status_code: int = 200) -> Tuple[Dict, int]:
    response = {'message': message}
    if data:
        response.update(data)
    return jsonify(response), status_code


# TRACKER SETUP ROUTES

#setup default trackers
@trackers_bp.route('/setup-default-trackers', methods=['POST'])
@jwt_required()
def setup_default_trackers():
    try:
        user, user_id = get_current_user()
    except ValueError:
        return error_response("User not found", 404)
    
    # Check if user already has trackers
    existing_trackers = Tracker.query.filter_by(user_id=user_id).all()
    if existing_trackers:
        return success_response(
            "Trackers already configured",
            {
                'trackers': [
                    {'id': t.id, 'category_id': t.category_id, 'is_default': t.is_default}
                    for t in existing_trackers
                ]
            },
            200
        )
    
    # Determine default category based on gender
    user_gender = user.gender or 'female'  # Default to female for testing
    is_female = user_gender.lower() == 'female'
    
    # Get categories based on gender
    if is_female:
        categories = TrackerCategory.query.all()
        default_name = 'Period Tracker'
    else:
        categories = TrackerCategory.query.filter(
            TrackerCategory.name != 'Period Tracker'
        ).all()
        default_name = 'Workout Tracker'
    
    # Create trackers
    trackers_created = 0
    for category in categories:
        tracker = Tracker(
            user_id=user_id,
            category_id=category.id,
            is_default=(category.name == default_name)
        )
        db.session.add(tracker)
        trackers_created += 1
    
    db.session.commit()
    
    return success_response(
        "Default trackers setup successfully",
        {
            'trackers_created': trackers_created,
            'user_gender': user_gender
        },
        201
    )


# TRACKER MANAGEMENT ROUTES

#get my trackers
@trackers_bp.route('/my-trackers', methods=['GET'])
@jwt_required()
def get_my_trackers():
    try:
        _, user_id = get_current_user()
    except ValueError:
        return error_response("User not found", 404)
    
    trackers = Tracker.query.filter_by(user_id=user_id).all()
    
    return success_response(
        "Trackers retrieved successfully",
        {
            'trackers': [t.to_dict() for t in trackers],
            'total_count': len(trackers)
        }
    )

#delete tracker
@trackers_bp.route('/delete-tracker/<int:tracker_id>', methods=['DELETE'])
@jwt_required()
def delete_tracker(tracker_id: int):
    try:
        _, user_id = get_current_user()
        tracker = verify_tracker_ownership(tracker_id, user_id)
    except ValueError as e:
        return error_response(str(e), 404 if "not found" in str(e) else 403)
    
    try:
        db.session.delete(tracker)
        
        # Delete associated custom category if not default
        if not tracker.is_default:
            category = TrackerCategory.query.filter_by(id=tracker.category_id).first()
            if category:
                db.session.delete(category)
        
        db.session.commit()
        return success_response("Tracker deleted successfully")
    except Exception as e:
        db.session.rollback()
        return error_response(f"Failed to delete tracker: {str(e)}", 500)

#update default tracker
@trackers_bp.route('/update-default-tracker/<int:tracker_id>', methods=['PUT'])
@jwt_required()
def update_default_tracker(tracker_id: int):
    try:
        _, user_id = get_current_user()
        
        # Get current default tracker
        predefault_tracker = Tracker.query.filter_by(
            user_id=user_id,
            is_default=True
        ).first()
        if not predefault_tracker:
            return error_response("No current default tracker found", 404)
        
        # Get new default tracker
        new_default = verify_tracker_ownership(tracker_id, user_id)
    except ValueError as e:
        return error_response(str(e), 404)
    
    try:
        predefault_tracker.is_default = False
        new_default.is_default = True
        db.session.commit()
        
        return success_response("Default tracker updated successfully")
    except Exception as e:
        db.session.rollback()
        return error_response(f"Failed to update default tracker: {str(e)}", 500)


# Change the name of a tracker
@trackers_bp.route('/<int:tracker_id>/change-tracker-name', methods=['PATCH'])
@jwt_required()
def change_tracker_name(tracker_id: int):
    try:
        _, user_id = get_current_user()
        tracker = verify_tracker_ownership(tracker_id, user_id)
    except ValueError as e:
        return error_response(str(e), 404)
    
    if not tracker.is_default:
        category = TrackerCategory.query.filter_by(id=tracker.category_id).first()
        if category:
            try:
                new_name = request.json.get('new_name')
                if not new_name:
                    return error_response("new_name is required", 400)
                
                try:
                    category.name = new_name
                    db.session.commit()
                    return success_response("Tracker name updated successfully")
                except Exception as e:
                    db.session.rollback()
                    return error_response(f"Failed to update tracker name: {str(e)}", 500)
            except Exception as e:
                return error_response(f"Failed to update tracker name: {str(e)}", 500)
    else:
        return error_response("Cannot change name of default tracker", 403)


# CUSTOM CATEGORY ROUTES

#create custom category
@trackers_bp.route('/create-custom-category', methods=['POST'])
@jwt_required()
def create_custom_category():
    try:
        _, user_id = get_current_user()
    except ValueError:
        return error_response("User not found", 404)
    
    # Validate input
    try:
        schema = CustomCategorySchema()
        validated_data = schema.load(request.json)
    except ValidationError as err:
        return error_response("Validation failed", 400, err.messages)
    
    try:
        # Create custom category
        category = CategoryService.create_custom_category(
            name=validated_data['name'],
            custom_fields_data=validated_data['custom_fields']
        )
        
        # Create tracker for the user
        tracker = Tracker(
            user_id=user_id,
            category_id=category.id,
            is_default=False
        )
        db.session.add(tracker)
        db.session.commit()
        
        return success_response(
            "Custom category and tracker created successfully",
            {
                'category': category.to_dict(),
                'tracker_id': tracker.id
            },
            201
        )
    except Exception as e:
        db.session.rollback()
        return error_response(f"Failed to create custom category: {str(e)}", 500)


# DATA SCHEMA ROUTES

#Fields

#get data schema of a specific tracker
@trackers_bp.route('/<int:tracker_id>/get-data-schema', methods=['GET'])
@jwt_required()
def get_tracker_schema(tracker_id: int):
    try:
        _, user_id = get_current_user()
        tracker = verify_tracker_ownership(tracker_id, user_id)
    except ValueError as e:
        return error_response(str(e), 404)
    
    try:
        category = TrackerCategory.query.filter_by(id=tracker.category_id).first()
        if not category:
            return error_response("Tracker category not found", 404)
        
        data_schema = CategoryService.rebuild_category_schema(category.id)
        
        return success_response(
            "Data schema retrieved successfully",
            {'data_schema': data_schema}
        )
    except Exception as e:
        return error_response(f"Failed to retrieve schema: {str(e)}", 500)


# Ordered fields (baseline then custom), with options ordered
@trackers_bp.route('/<int:tracker_id>/ordered-fields', methods=['GET'])
@jwt_required()
def get_ordered_fields(tracker_id: int):
    try:
        _, user_id = get_current_user()
        tracker = verify_tracker_ownership(tracker_id, user_id)
    except ValueError as e:
        return error_response(str(e), 404)

    try:
        # Baseline first
        baseline_fields = TrackerField.query.filter_by(
            category_id=tracker.category_id,
            field_group='baseline',
            is_active=True
        ).order_by(TrackerField.field_order).all()

        # Then custom
        custom_fields = TrackerField.query.filter_by(
            category_id=tracker.category_id,
            field_group='custom',
            is_active=True
        ).order_by(TrackerField.field_order).all()

        def serialize_field(field: TrackerField):
            options = FieldOption.query.filter_by(
                tracker_field_id=field.id,
                is_active=True
            ).order_by(FieldOption.option_order).all()
            data = field.to_dict()
            data['options'] = [o.to_dict() for o in options]
            return data

        return success_response(
            "Fields retrieved successfully",
            {
                'baseline_fields': [serialize_field(f) for f in baseline_fields],
                'custom_fields': [serialize_field(f) for f in custom_fields]
            }
        )
    except Exception as e:
        return error_response(f"Failed to retrieve fields: {str(e)}", 500)

#create new field in a custom schema of a specific tracker
@trackers_bp.route('/<int:tracker_id>/create-new-field', methods=['POST'])
@jwt_required()
def create_new_field(tracker_id: int):
    try:
        _, user_id = get_current_user()
        tracker = verify_tracker_ownership(tracker_id, user_id)
    except ValueError as e:
        return error_response(str(e), 404)
    
    try:
        category = TrackerCategory.query.filter_by(id=tracker.category_id).first()
        if not category:
            return error_response("Tracker category not found", 404)
        
        # Prevent modification of default categories
        if CategoryService.is_default_category(category.name):
            return error_response("Cannot modify default categories", 403)
        
        # Extract and validate request data
        field_data = request.json.get('field_data', {})
        options_data = request.json.get('options', [])
        
        if not field_data.get('field_name') or not options_data:
            return error_response("field_data with field_name and options array are required", 400)
        
        # Validate options
        option_schema = FieldOptionSchema()
        validated_options = []
        
        for option_data in options_data:
            try:
                validated_options.append(option_schema.load(option_data))
            except ValidationError as err:
                return error_response("Option validation failed", 400, err.messages)
        
        # Create field
        new_field = CategoryService.create_new_field(
            category,
            field_data,
            validated_options
        )
        
        return success_response(
            "Field created successfully",
            {'field': new_field.to_dict()},
            201
        )
    except Exception as e:
        return error_response(f"Failed to create field: {str(e)}", 500)


#delete field 
@trackers_bp.route('/<int:tracker_field_id>/delete-field', methods=['DELETE'])
@jwt_required()
def delete_field(tracker_field_id: int):
    try:
        _, user_id = get_current_user()
        tracker_field = verify_field_ownership(tracker_field_id, user_id)
    except ValueError as e:
        return error_response(str(e), 404)
    
    try:
        CategoryService.delete_field_from_category(tracker_field_id)
        return success_response("Field deleted successfully")
    except Exception as e:
        return error_response(f"Failed to delete field: {str(e)}", 500)


#update field display label
@trackers_bp.route('/<int:tracker_field_id>/update-field-display-label', methods=['PATCH'])
@jwt_required()
def update_field_display_label(tracker_field_id: int):
    try:
        _, user_id = get_current_user()
        tracker_field = verify_field_ownership(tracker_field_id, user_id)
    except ValueError as e:
        return error_response(str(e), 404)
    
    try:
        new_label = request.json.get('new_label')
        if not new_label:
            return error_response("new_label is required", 400)
        
        CategoryService.update_field_display_label(tracker_field_id, new_label)
        return success_response("Field display label updated successfully")
    except Exception as e:
        return error_response(f"Failed to update field display label: {str(e)}", 500)


#update field help text
@trackers_bp.route('/<int:tracker_field_id>/update-field-help-text', methods=['PATCH'])
@jwt_required()
def update_field_help_text(tracker_field_id: int):
    try:
        _, user_id = get_current_user()
        tracker_field = verify_field_ownership(tracker_field_id, user_id)
    except ValueError as e:
        return error_response(str(e), 404)
    
    try:
        new_help_text = request.json.get('new_help_text')
        if not new_help_text:
            return error_response("new_help_text is required", 400)
        
        CategoryService.update_field_help_text(tracker_field_id, new_help_text)
        return success_response("Field help text updated successfully")
    except Exception as e:
        return error_response(f"Failed to update field help text: {str(e)}", 500)



# Get specific field details
@trackers_bp.route('/<int:tracker_field_id>/field-details', methods=['GET'])
@jwt_required()
def get_field_details(tracker_field_id: int):
    try:
        _, user_id = get_current_user()
        tracker_field = verify_field_ownership(tracker_field_id, user_id)
    except ValueError as e:
        return error_response(str(e), 404)
    
    try:
        options = FieldOption.query.filter_by(tracker_field_id=tracker_field.id).order_by(FieldOption.option_order).all()
        return success_response(
            "Field details retrieved successfully",
            {
                'field': tracker_field.to_dict(),
                'options': [opt.to_dict() for opt in options]
            }
        )
    except Exception as e:
        return error_response(f"Failed to get field details: {str(e)}", 500)

# Update field order (reorder fields)
@trackers_bp.route('/<int:tracker_field_id>/update-field-order', methods=['PATCH'])
@jwt_required()
def update_field_order(tracker_field_id: int):
    try:
        _, user_id = get_current_user()
        tracker_field = verify_field_ownership(tracker_field_id, user_id)
    except ValueError as e:
        return error_response(str(e), 404)
    
    try:
        new_order = request.json.get('new_order')
        if new_order is None:
            return error_response("new_order is required", 400)
        
        try:
            CategoryService.update_field_order(tracker_field_id, int(new_order))
        except ValueError as ve:
            return error_response(str(ve), 400)
        
        return success_response("Field order updated successfully")
    except Exception as e:
        return error_response(f"Failed to update field order: {str(e)}", 500)


#Options

#create new option in a specific field of a specific tracker
@trackers_bp.route('/<int:tracker_field_id>/create-new-option', methods=['POST'])
@jwt_required()
def create_new_option(tracker_field_id: int):
    try:
        _, user_id = get_current_user()
        tracker_field = verify_field_ownership(tracker_field_id, user_id)
    except ValueError as e:
        status = 403 if "Unauthorized" in str(e) else 404
        return error_response(str(e), status)
    
    try:
        option_data = request.json.get('option_data', {})
        
        if not option_data.get('option_name'):
            return error_response("option_name is required", 400)
        
        if not option_data.get('option_type'):
            return error_response("option_type is required", 400)
        
        # Create option
        new_option = CategoryService.create_new_option(tracker_field, option_data)
        
        return success_response(
            "Option created successfully",
            {'option': new_option.to_dict()},
            201
        )
    except Exception as e:
        return error_response(f"Failed to create option: {str(e)}", 500)


#delete option
@trackers_bp.route('/<int:option_id>/delete-option', methods=['DELETE'])
@jwt_required()
def delete_option(option_id: int):
    try:
        _, user_id = get_current_user()
        verify_option_ownership(option_id, user_id)
    except ValueError as e:
        status = 403 if "Unauthorized" in str(e) else 404
        return error_response(str(e), status)
    
    try:
        CategoryService.delete_option_from_field(option_id)
        return success_response("Option deleted successfully")
    except Exception as e:
        return error_response(f"Failed to delete option: {str(e)}", 500)


#update option info
@trackers_bp.route('/<int:option_id>/update-option-info', methods=['PUT'])
@jwt_required()
def update_option_info(option_id: int):
    try:
        _, user_id = get_current_user()
        option = verify_option_ownership(option_id, user_id)
    except ValueError as e:
        return error_response(str(e), 404)
    
    try:
        validated_data = FieldOptionSchema().load(request.json) 
        CategoryService.update_option(option_id, validated_data)
        return success_response("Option updated successfully")
    except ValidationError as err:
        return error_response("Validation failed", 400, err.messages)
    except Exception as e:
        return error_response(f"Failed to update option: {str(e)}", 500)



# Get all options for a field
@trackers_bp.route('/<int:tracker_field_id>/options', methods=['GET'])
@jwt_required()
def get_field_options(tracker_field_id: int):
    try:
        _, user_id = get_current_user()
        tracker_field = verify_field_ownership(tracker_field_id, user_id)
    except ValueError as e:
        return error_response(str(e), 404)
    
    try:
        options = tracker_field.options
        return success_response("Options retrieved successfully", {'options': [option.to_dict() for option in options]})
    except Exception as e:
        return error_response(f"Failed to get options: {str(e)}", 500)

# Get specific option details
@trackers_bp.route('/<int:option_id>/option-details', methods=['GET'])
@jwt_required()
def get_option_details(option_id: int):
    try:
        _, user_id = get_current_user()
        option = verify_option_ownership(option_id, user_id)
    except ValueError as e:
        return error_response(str(e), 404)
    
    try:
        return success_response("Option details retrieved successfully", {'option': option.to_dict()})
    except Exception as e:
        return error_response(f"Failed to get option details: {str(e)}", 500)

# Update option order (reorder options)
@trackers_bp.route('/<int:option_id>/update-option-order', methods=['PATCH'])
@jwt_required()
def update_option_order(option_id: int):
    try:
        _, user_id = get_current_user()
        option = verify_option_ownership(option_id, user_id)
    except ValueError as e:
        return error_response(str(e), 404)
    
    try:
        new_order = request.json.get('new_order')
        if new_order is None:
            return error_response("new_order is required", 400)
        
        try:
            CategoryService.update_option_order(option_id, int(new_order))
        except ValueError as ve:
            return error_response(str(ve), 400)
        
        return success_response("Option order updated successfully")
    except Exception as e:
        return error_response(f"Failed to update option order: {str(e)}", 500)


#BULK OPERATIONS

# Bulk update multiple fields
@trackers_bp.route('/<int:tracker_id>/bulk-update-fields', methods=['PUT'])
@jwt_required()
def bulk_update_fields(tracker_id: int):
    pass

# Bulk delete multiple options
@trackers_bp.route('/<int:tracker_field_id>/bulk-delete-options', methods=['DELETE'])
@jwt_required()
def bulk_delete_options(tracker_field_id: int):
    try:
        _, user_id = get_current_user()
        tracker_field = verify_field_ownership(tracker_field_id, user_id)
    except ValueError as e:
        return error_response(str(e), 404)
    options_to_delete = request.json.get('options_to_delete', [])
    if not options_to_delete:
        return error_response("options_to_delete is required", 400)
    try:
        CategoryService.bulk_delete_options(tracker_field, options_to_delete)
    except Exception as e:
        return error_response(f"Failed to delete options: {str(e)}", 500)
    try:
        db.session.commit()
        return success_response("Options deleted successfully")
    except Exception as e:
        db.session.rollback()
        return error_response(f"Failed to delete options: {str(e)}", 500)

#UTILITY ROUTES

# Get available option types
@trackers_bp.route('/option-types', methods=['GET'])
@jwt_required()
def get_option_types():
    try:
        _, user_id = get_current_user()
    except ValueError as e:
        return error_response("User not found", 404)
    
    try:
        option_types = FieldOption.get_available_option_types()
        return success_response(
            "Available option types retrieved successfully",
            {'option_types': option_types}
        )
    except Exception as e:
        return error_response(f"Failed to get option types: {str(e)}", 500)

# Duplicate a field (with all its options)
@trackers_bp.route('/<int:tracker_field_id>/duplicate-field', methods=['POST'])
@jwt_required()
def duplicate_field(tracker_field_id: int):
    pass

# Export tracker configuration
@trackers_bp.route('/<int:tracker_id>/export-config', methods=['GET'])
@jwt_required()
def export_tracker_config(tracker_id: int):
    pass