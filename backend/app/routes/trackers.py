from flask import Blueprint, request, jsonify
from flask_jwt_extended import get_jwt_identity, jwt_required
from marshmallow import ValidationError
from typing import Tuple, Dict, Any
from datetime import datetime, date, timedelta
from sqlalchemy.orm.attributes import flag_modified

from app import db
from app.models.user import User
from app.models.tracker import Tracker
from app.models.tracker_field import TrackerField
from app.models.tracker_user_field import TrackerUserField
from app.models.tracker_category import TrackerCategory
from app.models.field_option import FieldOption
from app.models.period_cycle import PeriodCycle
from app.schemas.tracker_schemas import CustomCategorySchema, FieldOptionSchema, MenstruationTrackerSetupSchema
from app.services.category_service import CategoryService
from app.utils.menstruation_calculations import (
    predict_ovulation_date,
    predict_next_period_date,
    predict_period_end_date
)

trackers_bp = Blueprint('trackers', __name__)


# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

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


def verify_field_ownership(tracker_field_id: int, user_id: int):
    user_field = TrackerUserField.query.filter_by(id=tracker_field_id).first()
    if user_field:
        tracker = Tracker.query.filter_by(
            id=user_field.tracker_id,
            user_id=user_id
        ).first()
        if not tracker:
            raise ValueError("Unauthorized - field does not belong to your tracker")
        return user_field
    
    # Try category-level field
    tracker_field = TrackerField.query.filter_by(id=tracker_field_id).first()
    if tracker_field:
        tracker = Tracker.query.filter_by(
            category_id=tracker_field.category_id,
            user_id=user_id
        ).first()
        if not tracker:
            raise ValueError("Unauthorized - field does not belong to your tracker")
        return tracker_field
    
    raise ValueError("Tracker field not found")


def verify_option_ownership(option_id: int, user_id: int) -> FieldOption:
    """
    Verify option ownership. Handles options from both TrackerField and TrackerUserField.
    """
    option = FieldOption.query.filter_by(id=option_id).first()
    if not option:
        raise ValueError("Option not found")
    
    # Check if option belongs to a category field or user field
    if option.tracker_field_id:
        tracker = Tracker.query.filter_by(
            category_id=option.tracker_field.category_id,
            user_id=user_id
        ).first()
    elif option.tracker_user_field_id:
        tracker = Tracker.query.filter_by(
            id=option.tracker_user_field.tracker_id,
            user_id=user_id
        ).first()
    else:
        raise ValueError("Option has no valid field reference")
    
    if not tracker:
        raise ValueError("Unauthorized - option does not belong to your tracker")
    
    return option


def error_response(message: str, status_code: int = 400, 
                   details: Dict[str, Any] = None) -> Tuple[Dict, int]:
    
    response = {'error': message}
    if details:
        response['details'] = details
    return jsonify(response), status_code


def success_response(message: str, data: Dict[str, Any] = None, 
                     status_code: int = 200) -> Tuple[Dict, int]:
    
    response = {'message': message}
    if data:
        response.update(data)
    return jsonify(response), status_code


def ensure_category_fields_initialized(category: TrackerCategory) -> bool:
    """
    Ensure a category has its fields initialized (baseline + category-specific).
    Returns True if fields were created, False if they already existed.
    """
    # Check if baseline fields exist
    baseline_fields_exist = TrackerField.query.filter_by(
        category_id=category.id,
        field_group='baseline'
    ).first() is not None
    
    # For prebuilt categories, also check if category-specific fields exist
    category_specific_fields_exist = True  # Default to True for custom categories
    if category.name in CategoryService.PREBUILT_CATEGORIES:
        config_key = CategoryService.PREBUILT_CATEGORIES[category.name]
        category_specific_fields_exist = TrackerField.query.filter_by(
            category_id=category.id,
            field_group=config_key
        ).first() is not None
    elif category.name == CategoryService.PERIOD_TRACKER_NAME:
        category_specific_fields_exist = TrackerField.query.filter_by(
            category_id=category.id,
            field_group=CategoryService.PERIOD_TRACKER_KEY
        ).first() is not None
    
    # If both baseline and category-specific fields exist, category is fully initialized
    if baseline_fields_exist and category_specific_fields_exist:
        return False  # Already initialized
    
    # Initialize category properly (baseline + category-specific fields)
    if category.name == CategoryService.PERIOD_TRACKER_NAME:
        CategoryService.initialize_period_tracker()
    elif category.name in CategoryService.PREBUILT_CATEGORIES:
        # Initialize single category (fallback)
        config = CategoryService._load_config()
        baseline_schema = config.get('baseline', {})
        config_key = CategoryService.PREBUILT_CATEGORIES[category.name]
        specific_schema = config.get(config_key, {})
        
        CategoryService._create_fields_for_prebuilt_category(
            category.id,
            baseline_schema,
            specific_schema,
            config_key
        )
        db.session.commit()
    
    return True  # Fields were created


# ============================================================================
# TRACKER SETUP ROUTES
# ============================================================================

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
        # For old users: ensure baseline fields exist for their categories
        categories_to_fix = set()
        for tracker in existing_trackers:
            categories_to_fix.add(tracker.category_id)
        
        fields_created = False
        for category_id in categories_to_fix:
            category = TrackerCategory.query.filter_by(id=category_id).first()
            if not category:
                continue
            
            if ensure_category_fields_initialized(category):
                fields_created = True
        
        if fields_created:
            db.session.commit()
        
        return success_response(
            "Trackers already configured",
            {
                'trackers': [
                    {
                        'id': t.id,
                        'category_id': t.category_id,
                        'is_default': t.is_default
                    }
                    for t in existing_trackers
                ]
            },
            200
        )
    
    # Determine default category based on gender
    user_gender = user.gender or 'female'
    is_female = user_gender.lower() == 'female'
    
    # Get prebuilt categories (Workout, Symptom) + Period Tracker separately
    prebuilt_category_names = list(CategoryService.PREBUILT_CATEGORIES.keys())
    all_prebuilt_names = prebuilt_category_names + [CategoryService.PERIOD_TRACKER_NAME]
    
    if is_female:
        # Female users get all prebuilt categories (Workout, Symptom, Period)
        categories = TrackerCategory.query.filter(
            TrackerCategory.name.in_(all_prebuilt_names)
        ).all()
        default_name = 'Period Tracker'
    else:
        # Non-female users get Workout and Symptom only (no Period Tracker)
        categories = TrackerCategory.query.filter(
            TrackerCategory.name.in_(prebuilt_category_names)
        ).all()
        default_name = 'Workout Tracker'
    
    # Create trackers for user
    # Note: Categories should already be initialized on app startup,
    # but we check here as a safety net for edge cases
    trackers_created = 0
    for category in categories:
        # Safety check: ensure fields exist (should already be initialized on startup)
        ensure_category_fields_initialized(category)
        
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


# ============================================================================
# MENSTRUATION TRACKER SETUP ROUTES
# ============================================================================

#get tracker settings
@trackers_bp.route('/<int:tracker_id>/tracker-settings', methods=['GET'])
@jwt_required()
def get_tracker_settings(tracker_id: int):
    try:
        _, user_id = get_current_user()
        tracker = verify_tracker_ownership(tracker_id, user_id)
    except ValueError as e:
        return error_response(str(e), 404)
    
    return success_response(
        "Tracker settings retrieved successfully",
        {'settings': tracker.settings or {}}
    )

#update tracker settings
@trackers_bp.route('/<int:tracker_id>/tracker-settings', methods=['PUT'])
@jwt_required()
def update_tracker_settings(tracker_id: int):
    try:
        _, user_id = get_current_user()
        tracker = verify_tracker_ownership(tracker_id, user_id)
    except ValueError as e:
        return error_response(str(e), 404)
    
    try:
        from sqlalchemy.orm.attributes import flag_modified
        
        settings = request.json.get('settings', {})
        
        # Validate settings based on tracker type if needed
        category = TrackerCategory.query.filter_by(id=tracker.category_id).first()
        
        # For Period Tracker, validate menstruation-specific settings
        if category and category.name == 'Period Tracker':
            try:
                # Validate required fields for Period Tracker
                settings_schema = MenstruationTrackerSetupSchema()
                validated_data = settings_schema.load(settings)
                settings = validated_data
            except ValidationError as err:
                return error_response("Validation failed", 400, err.messages)
            
        tracker.settings = settings
        flag_modified(tracker, 'settings')
        db.session.commit()
        
        return success_response(
            "Tracker settings updated successfully",
            {'settings': tracker.settings}
        )
    
    except Exception as e:
        db.session.rollback()
        return error_response(f"Failed to update tracker settings: {str(e)}", 500)


# ============================================================================
# TRACKER MANAGEMENT ROUTES
# ============================================================================

@trackers_bp.route('/my-trackers', methods=['GET'])
@jwt_required()
def get_my_trackers():
    
    try:
        _, user_id = get_current_user()
    except ValueError:
        return error_response("User not found", 404)
    
    trackers = Tracker.query.filter_by(user_id=user_id).all()
    
    # Build response with category names
    trackers_list = []
    for tracker in trackers:
        category = TrackerCategory.query.filter_by(id=tracker.category_id).first()
        trackers_list.append({
            'tracker_name': category.name if category else None,
            'tracker_info': tracker.to_dict()
        })
    
    return success_response(
        "Trackers retrieved successfully",
        {
            'trackers': trackers_list,
            'total_count': len(trackers)
        }
    )


@trackers_bp.route('/delete-tracker/<int:tracker_id>', methods=['DELETE'])
@jwt_required()
def delete_tracker(tracker_id: int):
    
    try:
        _, user_id = get_current_user()
        tracker = verify_tracker_ownership(tracker_id, user_id)
    except ValueError as e:
        return error_response(str(e), 404 if "not found" in str(e) else 403)
    
    try:
        # Store category info before deleting tracker
        category_id = tracker.category_id
        is_custom_category = not tracker.is_default
        
        # Delete the tracker first (before category to avoid FK violation)
        db.session.delete(tracker)
        db.session.flush()  # Flush to ensure tracker deletion is processed
        
        # Delete associated custom category if not default and no other trackers use it
        if is_custom_category:
            category = TrackerCategory.query.filter_by(id=category_id).first()
            if category and not CategoryService.is_prebuilt_category(category.name):
                # Check if any other trackers are using this category
                other_trackers = Tracker.query.filter_by(category_id=category_id).first()
                
                # Only delete category if no other trackers are using it
                if not other_trackers:
                    # Delete all fields and their options before deleting the category
                    fields = TrackerField.query.filter_by(category_id=category.id).all()
                    for field in fields:
                        # Delete all options for this field
                        options = FieldOption.query.filter_by(tracker_field_id=field.id).all()
                        for option in options:
                            db.session.delete(option)
                        # Delete the field
                        db.session.delete(field)
                    
                    # Now safe to delete the category
                    db.session.delete(category)
        
        db.session.commit()
        
        return success_response("Tracker deleted successfully")
    except Exception as e:
        db.session.rollback()
        return error_response(f"Failed to delete tracker: {str(e)}", 500)


@trackers_bp.route('/update-default-tracker/<int:tracker_id>', methods=['PUT'])
@jwt_required()
def update_default_tracker(tracker_id: int):
    
    try:
        _, user_id = get_current_user()
        
        predefault_tracker = Tracker.query.filter_by(
            user_id=user_id,
            is_default=True
        ).first()
        if not predefault_tracker:
            return error_response("No current default tracker found", 404)
        
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


@trackers_bp.route('/<int:tracker_id>/change-tracker-name', methods=['PATCH'])
@jwt_required()
def change_tracker_name(tracker_id: int):
    
    try:
        _, user_id = get_current_user()
        tracker = verify_tracker_ownership(tracker_id, user_id)
    except ValueError as e:
        return error_response(str(e), 404)
    
    try:
        category = TrackerCategory.query.filter_by(id=tracker.category_id).first()
        if not category:
            return error_response("Tracker category not found", 404)
        
        # Prevent renaming pre-built categories
        if CategoryService.is_prebuilt_category(category.name):
            return error_response("Cannot rename pre-built tracker categories", 403)
        
        new_name = request.json.get('new_name')
        if not new_name:
            return error_response("new_name is required", 400)
        
        category.name = new_name
        db.session.commit()
        
        return success_response("Tracker name updated successfully")
    except Exception as e:
        db.session.rollback()
        return error_response(f"Failed to update tracker name: {str(e)}", 500)


@trackers_bp.route('/<int:tracker_id>/tracker-details', methods=['GET'])
@jwt_required()
def get_tracker_details(tracker_id: int):
    
    try:
        _, user_id = get_current_user()
        tracker = verify_tracker_ownership(tracker_id, user_id)
        category = TrackerCategory.query.filter_by(id=tracker.category_id).first()
        if not category:
            return error_response("Tracker category not found", 404)
    except ValueError as e:
        return error_response(str(e), 404)
    
    try:
        # Rebuild schema to ensure it's up-to-date with active/inactive statuses
        CategoryService.rebuild_category_schema(category, tracker if CategoryService.is_prebuilt_category(category.name) else None)
        db.session.refresh(category)
        
        return success_response(
            "Tracker details retrieved successfully",
            {
                'tracker': tracker.to_dict(),
                'category': category.to_dict()
            }
        )
    except Exception as e:
        return error_response(f"Failed to retrieve tracker details: {str(e)}", 500)


# ============================================================================
# CUSTOM CATEGORY ROUTES
# ============================================================================

@trackers_bp.route('/create-custom-category', methods=['POST'])
@jwt_required()
def create_custom_category():
    
    try:
        _, user_id = get_current_user()
    except ValueError:
        return error_response("User not found", 404)
    
    try:
        schema = CustomCategorySchema()
        validated_data = schema.load(request.json)
    except ValidationError as err:
        return error_response("Validation failed", 400, err.messages)
    
    try:
        category = CategoryService.create_custom_category(
            name=validated_data['name'],
            custom_fields_data=validated_data['custom_fields']
        )
        
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


# ============================================================================
# UNIFIED SCHEMA ROUTES - PROFESSIONAL STRUCTURE
# ============================================================================

@trackers_bp.route('/<int:tracker_id>/form-schema', methods=['GET'])
@jwt_required()
def get_form_schema(tracker_id: int):

    try:
        _, user_id = get_current_user()
        tracker = verify_tracker_ownership(tracker_id, user_id)
    except ValueError as e:
        return error_response(str(e), 404)
    
    try:
        category = TrackerCategory.query.filter_by(id=tracker.category_id).first()
        if not category:
            return error_response("Tracker category not found", 404)
         
        is_prebuilt = CategoryService.is_prebuilt_category(category.name)
        is_period_tracker = category.name == 'Period Tracker'
        
        # Special handling for Period Tracker
        if is_period_tracker:
            result = CategoryService.get_contextual_period_schema(tracker)
            
            # Format response consistently with other trackers
            return success_response(
                "Form schema retrieved successfully",
                {
                    'field_groups': result.get('data_schema'),
                    'tracker_name': category.name,
                    'tracker_id': tracker.id,
                    'cycle_info':{
                        'cycle_day': result.get('cycle_info').get('cycle_day'),
                        'cycle_phase': result.get('cycle_info').get('cycle_phase'),
                        'is_menstruating': result.get('cycle_info').get('is_menstruating')
                    },
                    'predictions':{
                        'ovulation_date': result.get('predictions').get('ovulation_date'),
                        'next_period_date': result.get('predictions').get('next_period_date'),
                        'period_expected_soon': result.get('predictions').get('period_expected_soon'),
                        'period_late': result.get('predictions').get('period_late')
                    },
                    'is_prebuilt': True,
                    'is_contextual': True,
                    'context': result.get('context'),
                    'field_count': len(result.get('data_schema').get('baseline')) + len(result.get('data_schema').get('period_tracker')) + len(result.get('data_schema').get('custom')),
                }
            )
        
        # Standard handling for all other trackers
        # Ensure fields are initialized (safety check - creates missing category-specific fields)
        ensure_category_fields_initialized(category)
        db.session.expire_all()
        
        # 1. Baseline fields
        baseline_fields = TrackerField.query.filter_by(
            category_id=category.id,
            field_group='baseline',
            is_active=True
        ).order_by(TrackerField.field_order.asc()).all()
        
        # 2. Category-specific fields (for prebuilt trackers)
        category_specific_fields = []
        if is_prebuilt:
            section_key = CategoryService.PREBUILT_CATEGORIES.get(category.name)
            if section_key:
                category_specific_fields = TrackerField.query.filter_by(
                    category_id=category.id,
                    field_group=section_key,
                    is_active=True
                ).order_by(TrackerField.field_order.asc()).all()
        
        # 3. Custom fields (user additions)
        custom_fields = []
        if is_prebuilt:
            # User-specific fields for prebuilt trackers
            custom_fields = TrackerUserField.query.filter_by(
                tracker_id=tracker.id,
                is_active=True
            ).order_by(TrackerUserField.field_order.asc()).all()
        else:
            # Category-level custom fields
            custom_fields = TrackerField.query.filter_by(
                category_id=category.id,
                field_group='custom',
                is_active=True
            ).order_by(TrackerField.field_order.asc()).all()
        
        def serialize_field(field):
            """Serialize field with options"""
            if isinstance(field, TrackerUserField):
                options = FieldOption.query.filter_by(
                    tracker_user_field_id=field.id,
                    is_active=True
                ).order_by(FieldOption.option_order.asc()).all()
            else:
                options = FieldOption.query.filter_by(
                    tracker_field_id=field.id,
                    is_active=True
                ).order_by(FieldOption.option_order.asc()).all()
            
            data = field.to_dict()
            data['options'] = [o.to_dict() for o in options]
            return data
        
        # Combine all fields in field_group order
        field_groups = {
            'baseline': [serialize_field(f) for f in baseline_fields],
            'category_specific': [serialize_field(f) for f in category_specific_fields],
            'custom': [serialize_field(f) for f in custom_fields]
        }
        
        
        return success_response(
            "Form schema retrieved successfully",
            {
                'field-groups': field_groups,
                'tracker_name': category.name,
                'tracker_id': tracker.id,
                'is_prebuilt': is_prebuilt,
                'is_contextual': False,
                'context': None,
                'field_count': len(baseline_fields) + len(category_specific_fields) + len(custom_fields)
            }
        )
    except Exception as e:
        return error_response(f"Failed to retrieve form schema: {str(e)}", 500)


@trackers_bp.route('/<int:tracker_id>/management-schema', methods=['GET'])
@jwt_required()
def get_management_schema(tracker_id: int):
    """
    MANAGEMENT UI ENDPOINT: Get fields organized by groups.
    
    Use this for:
    - Admin/settings UI where you need to see field structure
    - Field management (add/edit/delete/reorder)
    - Schema configuration
    
    For rendering forms to users, use /form-schema instead.
    
    Response includes fields grouped by:
    - baseline_fields
    - category_fields (for prebuilt trackers)
    - custom_fields (user additions)
    """
    try:
        _, user_id = get_current_user()
        tracker = verify_tracker_ownership(tracker_id, user_id)
    except ValueError as e:
        return error_response(str(e), 404)
    
    try:
        category = TrackerCategory.query.filter_by(id=tracker.category_id).first()
        if not category:
            return error_response("Tracker category not found", 404)
        
        db.session.expire_all()
        
        # Get baseline fields
        baseline_fields = TrackerField.query.filter_by(
            category_id=category.id,
            field_group='baseline',
            is_active=True
        ).order_by(TrackerField.field_order.asc()).all()
        
        # Get category-specific fields
        category_specific_fields = []
        is_prebuilt = CategoryService.is_prebuilt_category(category.name)
        print(f"Is prebuilt: {is_prebuilt}")
        if is_prebuilt:
            section_key = CategoryService.PREBUILT_CATEGORIES.get(category.name)
            if not section_key and category.name == CategoryService.PERIOD_TRACKER_NAME:
                section_key = CategoryService.PERIOD_TRACKER_KEY
            print(f"Section key: {section_key}")
            if section_key:
                category_specific_fields = TrackerField.query.filter_by(
                    category_id=category.id,
                    field_group=section_key,
                    is_active=True
                ).order_by(TrackerField.field_order.asc()).all()
                print(f"Category specific fields: {category_specific_fields}")
            
        
        # Get custom fields
        custom_fields = []
        if is_prebuilt:
            # User-specific fields
            custom_fields = TrackerUserField.query.filter_by(
                tracker_id=tracker.id,
                is_active=True
            ).order_by(TrackerUserField.field_order.asc()).all()
        else:
            # Category-level custom fields
            custom_fields = TrackerField.query.filter_by(
                category_id=category.id,
                field_group='custom',
                is_active=True
            ).order_by(TrackerField.field_order.asc()).all()
        
        def serialize_field(field):
            if isinstance(field, TrackerUserField):
                options = FieldOption.query.filter_by(
                    tracker_user_field_id=field.id,
                    is_active=True
                ).order_by(FieldOption.option_order.asc()).all()
            else:
                options = FieldOption.query.filter_by(
                    tracker_field_id=field.id,
                    is_active=True
                ).order_by(FieldOption.option_order.asc()).all()
            
            data = field.to_dict()
            data['options'] = [o.to_dict() for o in options]
            data['is_user_field'] = isinstance(field, TrackerUserField)
            return data
        
        response_data = {
            'baseline_fields': [serialize_field(f) for f in baseline_fields],
            'custom_fields': [serialize_field(f) for f in custom_fields]
        }
        
        if category_specific_fields:
            response_data['category_fields'] = [
                serialize_field(f) for f in category_specific_fields
            ]
        
        return success_response(
            "Management schema retrieved successfully",
            response_data
        )
    except Exception as e:
        return error_response(f"Failed to retrieve management schema: {str(e)}", 500)


@trackers_bp.route('/<int:tracker_id>/complete-schema', methods=['GET'])
@jwt_required()
def get_complete_schema(tracker_id: int):
    """
    DEVELOPER/DEBUG ENDPOINT: Get complete raw schema including inactive fields.
    
    Use this for:
    - Debugging
    - Export/import functionality
    - Viewing full tracker configuration
    
    Includes both active and inactive fields/options.
    """
    try:
        _, user_id = get_current_user()
        tracker = verify_tracker_ownership(tracker_id, user_id)
    except ValueError as e:
        return error_response(str(e), 404)
    
    try:
        category = TrackerCategory.query.filter_by(id=tracker.category_id).first()
        if not category:
            return error_response("Tracker category not found", 404)
        
        all_inclusive_schema = CategoryService.get_all_inclusive_data_schema(
            category,
            tracker if CategoryService.is_prebuilt_category(category.name) else None
        )
        
        return success_response(
            "Complete schema retrieved successfully",
            {
                'data_schema': all_inclusive_schema,
                'tracker_name': category.name,
                'tracker_id': tracker.id
            }
        )
    except Exception as e:
        return error_response(f"Failed to get complete schema: {str(e)}", 500)



# ============================================================================
# FIELD OPERATIONS
# ============================================================================

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
        
        # For prebuilt categories, use TrackerUserField instead of TrackerField
        is_prebuilt = CategoryService.is_prebuilt_category(category.name)
        
        field_data = request.json.get('field_data', {})
        options_data = request.json.get('options', [])
        
        if not field_data.get('field_name') or not options_data:
            return error_response(
                "field_data with field_name and options array are required",
                400
            )
        
        # Validate options
        option_schema = FieldOptionSchema()
        validated_options = []
        
        for option_data in options_data:
            try:
                validated_options.append(option_schema.load(option_data))
            except ValidationError as err:
                return error_response("Option validation failed", 400, err.messages)
        
        if is_prebuilt:
            # Create user-specific field for prebuilt tracker
            new_field = CategoryService.create_user_field(
                tracker,
                field_data,
                validated_options
            )
        else:
            # Create regular field for custom category
            new_field = CategoryService.create_new_field(
                category,
                field_data,
                validated_options
            )
        
        # Rebuild schema to include the new field
        CategoryService.rebuild_category_schema(category, tracker if is_prebuilt else None)
        db.session.refresh(category)
        
        return success_response(
            "Field created successfully",
            {'field': new_field.to_dict()},
            201
        )
    except Exception as e:
        return error_response(f"Failed to create field: {str(e)}", 500)


@trackers_bp.route('/<int:tracker_field_id>/delete-field', methods=['DELETE'])
@jwt_required()
def delete_field(tracker_field_id: int):
    
    try:
        _, user_id = get_current_user()
        field = verify_field_ownership(tracker_field_id, user_id)
    except ValueError as e:
        return error_response(str(e), 404)
    
    try:
        
        # Check if it's a user field or category field
        if isinstance(field, TrackerUserField):
            CategoryService.delete_user_field(tracker_field_id)
            # Rebuild schema for prebuilt tracker
            tracker = Tracker.query.filter_by(id=field.tracker_id).first()
            if tracker:
                category = TrackerCategory.query.filter_by(id=tracker.category_id).first()
                if category:
                    CategoryService.rebuild_category_schema(category, tracker)
        else:
            CategoryService.delete_field_from_category(tracker_field_id)
        
        return success_response("Field deleted successfully")
    except ValueError as e:
        return error_response(str(e), 403)
    except Exception as e:
        return error_response(f"Failed to delete field: {str(e)}", 500)


@trackers_bp.route('/<int:tracker_field_id>/field-details', methods=['GET'])
@jwt_required()
def get_field_details(tracker_field_id: int):
    
    try:
        _, user_id = get_current_user()
        field = verify_field_ownership(tracker_field_id, user_id)
    except ValueError as e:
        return error_response(str(e), 404)
    
    try:
        
        # Get options based on field type
        if isinstance(field, TrackerUserField):
            options = FieldOption.query.filter_by(
                tracker_user_field_id=field.id,
                is_active=True
            ).order_by(FieldOption.option_order).all()
        else:
            options = FieldOption.query.filter_by(
                tracker_field_id=field.id,
                is_active=True
            ).order_by(FieldOption.option_order).all()
        
        return success_response(
            "Field details retrieved successfully",
            {
                'field': field.to_dict(),
                'options': [opt.to_dict() for opt in options]
            }
        )
    except Exception as e:
        return error_response(f"Failed to get field details: {str(e)}", 500)


@trackers_bp.route('/<int:tracker_field_id>/update-field-display-label', methods=['PATCH'])
@jwt_required()
def update_field_display_label(tracker_field_id: int):
    
    try:
        _, user_id = get_current_user()
        field = verify_field_ownership(tracker_field_id, user_id)
    except ValueError as e:
        return error_response(str(e), 404)
    
    try:
        new_label = request.json.get('new_label')
        if not new_label:
            return error_response("new_label is required", 400)
        
        # Field already retrieved and verified in the outer try block
        field.display_label = new_label
        db.session.commit()
        
        return success_response("Field display label updated successfully")
    except Exception as e:
        db.session.rollback()
        return error_response(f"Failed to update field display label: {str(e)}", 500)


@trackers_bp.route('/<int:tracker_field_id>/update-field-help-text', methods=['PATCH'])
@jwt_required()
def update_field_help_text(tracker_field_id: int):
    
    try:
        _, user_id = get_current_user()
        field = verify_field_ownership(tracker_field_id, user_id)
    except ValueError as e:
        return error_response(str(e), 404)
    
    try:
        new_help_text = request.json.get('new_help_text')
        if new_help_text is None:
            return error_response("new_help_text is required", 400)
        
        field.help_text = new_help_text
        db.session.commit()
        
        return success_response("Field help text updated successfully")
    except Exception as e:
        db.session.rollback()
        return error_response(f"Failed to update field help text: {str(e)}", 500)


@trackers_bp.route('/<int:tracker_field_id>/update-field-order', methods=['PATCH'])
@jwt_required()
def update_field_order(tracker_field_id: int):
    
    try:
        _, user_id = get_current_user()
        field = verify_field_ownership(tracker_field_id, user_id)
    except ValueError as e:
        return error_response(str(e), 404)
    
    try:
        new_order = request.json.get('new_order')
        if new_order is None:
            return error_response("new_order is required", 400)
        
        # Update field order (this commits internally)
        CategoryService.update_field_order(tracker_field_id, new_order)
        
        # ALWAYS rebuild schema to reflect new order
        # Determine the category and tracker based on field type
        if isinstance(field, TrackerUserField):
            # User field - need tracker for rebuild
            tracker = Tracker.query.filter_by(id=field.tracker_id).first()
            if tracker:
                category = TrackerCategory.query.filter_by(id=tracker.category_id).first()
                if category:
                    db.session.expire(category)
                    CategoryService.rebuild_category_schema(category, tracker)
        else:
            # TrackerField (custom category field) - rebuild without tracker
            category = TrackerCategory.query.filter_by(id=field.category_id).first()
            if category:
                db.session.expire(category)
                CategoryService.rebuild_category_schema(category, None)
        
        return success_response("Field order updated successfully")
    except ValueError as ve:
        return error_response(str(ve), 400)
    except Exception as e:
        return error_response(f"Failed to update field order: {str(e)}", 500)


@trackers_bp.route('/<int:tracker_field_id>/toggle-field-active-status', methods=['PATCH'])
@jwt_required()
def toggle_field_active_status(tracker_field_id: int):
    
    try:
        _, user_id = get_current_user()
        verify_field_ownership(tracker_field_id, user_id)
    except ValueError as e:
        return error_response(str(e), 404)
    
    try:
        CategoryService.toggle_field_active_status(tracker_field_id)
        return success_response("Field active status toggled successfully")
    except Exception as e:
        return error_response(f"Failed to toggle field active status: {str(e)}", 500)


# ============================================================================
# OPTION OPERATIONS
# ============================================================================

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
        
        new_option = CategoryService.create_new_option(tracker_field, option_data)
        
        return success_response(
            "Option created successfully",
            {'option': new_option.to_dict()},
            201
        )
    except Exception as e:
        return error_response(f"Failed to create option: {str(e)}", 500)


@trackers_bp.route('/<int:tracker_field_id>/options', methods=['GET'])
@jwt_required()
def get_field_options(tracker_field_id: int):
    
    try:
        _, user_id = get_current_user()
        tracker_field = verify_field_ownership(tracker_field_id, user_id)
    except ValueError as e:
        return error_response(str(e), 404)
    
    try:
        # Get options based on field type
        if isinstance(tracker_field, TrackerUserField):
            options = FieldOption.query.filter_by(
                tracker_user_field_id=tracker_field.id,
                is_active=True
            ).order_by(FieldOption.option_order).all()
        else:
            options = FieldOption.query.filter_by(
                tracker_field_id=tracker_field.id,
                is_active=True
            ).order_by(FieldOption.option_order).all()
        
        return success_response(
            "Options retrieved successfully",
            {'options': [option.to_dict() for option in options]}
        )
    except Exception as e:
        return error_response(f"Failed to get options: {str(e)}", 500)


@trackers_bp.route('/<int:option_id>/option-details', methods=['GET'])
@jwt_required()
def get_option_details(option_id: int):
    
    try:
        _, user_id = get_current_user()
        option = verify_option_ownership(option_id, user_id)
    except ValueError as e:
        return error_response(str(e), 404)
    
    try:
        return success_response(
            "Option details retrieved successfully",
            {'option': option.to_dict()}
        )
    except Exception as e:
        return error_response(f"Failed to get option details: {str(e)}", 500)


@trackers_bp.route('/<int:option_id>/update-option-info', methods=['PUT'])
@jwt_required()
def update_option_info(option_id: int):

    try:
        _, user_id = get_current_user()
        verify_option_ownership(option_id, user_id)
    except ValueError as e:
        return error_response(str(e), 404)
    
    try:
        validated_data = FieldOptionSchema().load(request.json)
        
        # Remove option_order from validated data to prevent update of order
        validated_data.pop('option_order', None)
        
        option = FieldOption.query.filter_by(id=option_id).first()
        if not option:
            return error_response("Option not found", 404)
        
        # Update only the allowed fields (excluding option_order)
        for key, value in validated_data.items():
            if hasattr(option, key):
                setattr(option, key, value)
        
        db.session.commit()
        
        return success_response("Option updated successfully")
    except ValidationError as err:
        return error_response("Validation failed", 400, err.messages)
    except Exception as e:
        db.session.rollback()
        return error_response(f"Failed to update option: {str(e)}", 500)


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


@trackers_bp.route('/<int:option_id>/update-option-order', methods=['PATCH'])
@jwt_required()
def update_option_order(option_id: int):
    
    try:
        _, user_id = get_current_user()
        verify_option_ownership(option_id, user_id)
    except ValueError as e:
        return error_response(str(e), 404)
    
    try:
        new_order = request.json.get('new_order')
        if new_order is None:
            return error_response("new_order is required", 400)
        
        CategoryService.update_option_order(option_id, new_order)
        return success_response("Option order updated successfully")
    except ValueError as ve:
        return error_response(str(ve), 400)
    except Exception as e:
        return error_response(f"Failed to update option order: {str(e)}", 500)


@trackers_bp.route('/<int:option_id>/toggle-option-active-status', methods=['PATCH'])
@jwt_required()
def toggle_option_active_status(option_id: int):
    
    try:
        _, user_id = get_current_user()
        verify_option_ownership(option_id, user_id)
    except ValueError as e:
        return error_response(str(e), 404)
    
    try:
        CategoryService.toggle_option_active_status(option_id)
        return success_response("Option active status toggled successfully")
    except Exception as e:
        return error_response(f"Failed to toggle option active status: {str(e)}", 500)


# ============================================================================
# BULK OPERATIONS
# ============================================================================

@trackers_bp.route('/<int:tracker_field_id>/bulk-delete-options', methods=['DELETE'])
@jwt_required()
def bulk_delete_options(tracker_field_id: int):
    
    try:
        _, user_id = get_current_user()
        tracker_field = verify_field_ownership(tracker_field_id, user_id)
    except ValueError as e:
        return error_response(str(e), 404)
    
    try:
        options_to_delete = request.json.get('options_to_delete', [])
        if not options_to_delete:
            return error_response("options_to_delete is required", 400)
        
        CategoryService.bulk_delete_options(tracker_field, options_to_delete)
        return success_response("Options deleted successfully")
    except Exception as e:
        return error_response(f"Failed to delete options: {str(e)}", 500)


# ============================================================================
# SCHEMA MANAGEMENT ROUTES
# ============================================================================

@trackers_bp.route('/<int:tracker_id>/rebuild-schema', methods=['POST'])
@jwt_required()
def rebuild_tracker_schema(tracker_id: int):
    
    try:
        _, user_id = get_current_user()
        tracker = verify_tracker_ownership(tracker_id, user_id)
    except ValueError as e:
        return error_response(str(e), 404)
    
    try:
        category = TrackerCategory.query.filter_by(id=tracker.category_id).first()
        if not category:
            return error_response("Tracker category not found", 404)
        
        CategoryService.rebuild_category_schema(category, tracker if CategoryService.is_prebuilt_category(category.name) else None)
        db.session.refresh(category)
        
        return success_response(
            "Schema rebuilt successfully",
            {'data_schema': category.data_schema}
        )
    except Exception as e:
        return error_response(f"Failed to rebuild schema: {str(e)}", 500)


@trackers_bp.route('/<int:tracker_id>/export-config', methods=['GET'])
@jwt_required()
def export_tracker_config(tracker_id: int):
    
    try:
        _, user_id = get_current_user()
        tracker = verify_tracker_ownership(tracker_id, user_id)
    except ValueError as e:
        return error_response(str(e), 404)
    
    try:
        category = TrackerCategory.query.filter_by(id=tracker.category_id).first()
        if not category:
            return error_response("Tracker category not found", 404)
        
        # Rebuild schema to ensure it's up-to-date
        CategoryService.rebuild_category_schema(category, tracker if CategoryService.is_prebuilt_category(category.name) else None)
        db.session.refresh(category)
        
        tracker_config = CategoryService.export_tracker_config(category)
        
        return success_response(
            "Tracker config exported successfully",
            {'tracker_config': tracker_config}
        )
    except Exception as e:
        return error_response(f"Failed to export tracker config: {str(e)}", 500)


@trackers_bp.route('/<int:tracker_id>/import-config', methods=['POST'])
@jwt_required()
def import_tracker_config(tracker_id: int):
    
    try:
        _, user_id = get_current_user()
        tracker = verify_tracker_ownership(tracker_id, user_id)
    except ValueError as e:
        return error_response(str(e), 404)
    
    try:
        category = TrackerCategory.query.filter_by(id=tracker.category_id).first()
        if not category:
            return error_response("Tracker category not found", 404)
        
        tracker_config = request.json.get('tracker_config')
        if not tracker_config:
            return error_response("tracker_config is required", 400)
        
        CategoryService.import_tracker_config(category, tracker_config)
        
        return success_response("Tracker config imported successfully")
    except ValueError as e:
        return error_response(str(e), 400)
    except Exception as e:
        return error_response(f"Failed to import tracker config: {str(e)}", 500)


# ============================================================================
# UTILITY ROUTES
# ============================================================================

@trackers_bp.route('/option-types', methods=['GET'])
@jwt_required()
def get_available_option_types():
    
    try:
        _, user_id = get_current_user()
    except ValueError:
        return error_response("User not found", 404)
    
    option_types = {
        'rating': 'Rating Scale',
        'single_choice': 'Single Choice',
        'multiple_choice': 'Multiple Choice',
        'yes_no': 'Yes/No',
        'number_input': 'Number Input',
        'text': 'Text Input',
        'date': 'Date Picker',
        'time': 'Time Picker',
        'datetime': 'Date & Time Picker'
    }
    
    return success_response(
        "Option types retrieved successfully",
        {'option_types': option_types}
    )


# ============================================================================
# PERIOD TRACKING ROUTES
# ============================================================================

@trackers_bp.route('/<int:tracker_id>/log-period', methods=['POST'])
@jwt_required()
def log_period_start(tracker_id: int):
    """
    Log the start of a new period cycle.
    This creates a new PeriodCycle record and updates tracker predictions.
    Can log periods for today or past dates.
    """
    try:
        _, user_id = get_current_user()
        tracker = verify_tracker_ownership(tracker_id, user_id)
    except ValueError as e:
        return error_response(str(e), 404)
    
    try:
        # Verify this is a Period Tracker
        category = TrackerCategory.query.filter_by(id=tracker.category_id).first()
        if not category or category.name != 'Period Tracker':
            return error_response("This endpoint is only available for Period Tracker", 400)
        
        # Get period date from request (default to today)
        data = request.json or {}
        period_date_str = data.get('period_date')
        
        if period_date_str:
            try:
                period_date = datetime.fromisoformat(period_date_str).date()
            except (ValueError, TypeError):
                return error_response("Invalid date format. Use ISO format (YYYY-MM-DD)", 400)
        else:
            period_date = date.today()
        
        # Ensure tracker has settings
        if not tracker.settings:
            tracker.settings = {}
        
        settings = tracker.settings.copy()
        
        # Get average cycle length and period length from settings
        average_cycle_length = settings.get('average_cycle_length', 28)
        average_period_length = settings.get('average_period_length', 5)
        
        # Close any previous incomplete cycles
        previous_cycles = PeriodCycle.query.filter_by(
            tracker_id=tracker_id,
            cycle_end_date=None
        ).all()
        
        for prev_cycle in previous_cycles:
            # Only close if the new period date is after the previous cycle start
            if period_date > prev_cycle.cycle_start_date:
                prev_cycle.cycle_end_date = period_date
                # Calculate cycle length
                cycle_length = (period_date - prev_cycle.cycle_start_date).days
                prev_cycle.cycle_length = cycle_length
                
                # If period_end_date is not set, set it based on average period length using utility function
                if not prev_cycle.period_end_date:
                    prev_period_start_datetime = datetime.combine(prev_cycle.period_start_date, datetime.min.time())
                    estimated_period_end = predict_period_end_date(prev_period_start_datetime, average_period_length)
                    if estimated_period_end:
                        estimated_period_end_date = estimated_period_end.date()
                        # Don't let estimated end date exceed the actual new period start date
                        prev_cycle.period_end_date = min(estimated_period_end_date, period_date)
                        period_length = (prev_cycle.period_end_date - prev_cycle.period_start_date).days + 1
                        prev_cycle.period_length = period_length
        
        # Check if a cycle already exists for this date
        existing_cycle = PeriodCycle.query.filter_by(
            tracker_id=tracker_id,
            cycle_start_date=period_date
        ).first()
        
        if existing_cycle:
            return error_response(
                f"A period cycle already exists for {period_date.isoformat()}. "
                "If you want to update it, please use the update endpoint.",
                409
            )
        
        # Calculate predictions for the new cycle
        # Convert date to datetime for prediction functions
        period_datetime = datetime.combine(period_date, datetime.min.time())
        predicted_ovulation = predict_ovulation_date(period_datetime, average_cycle_length)
        predicted_next_period = predict_next_period_date(period_datetime, average_cycle_length)
        
        # Extract date from datetime results
        predicted_ovulation_date_obj = predicted_ovulation.date() if predicted_ovulation else None
        predicted_next_period_date_obj = predicted_next_period.date() if predicted_next_period else None
        
        # Calculate estimated period end date using utility function
        predicted_period_end = predict_period_end_date(period_datetime, average_period_length)
        estimated_period_end_date = predicted_period_end.date() if predicted_period_end else None
        estimated_period_length = average_period_length
        
        # Create new PeriodCycle
        new_cycle = PeriodCycle(
            tracker_id=tracker_id,
            cycle_start_date=period_date,
            period_start_date=period_date,
            period_end_date=estimated_period_end_date,  # Estimated based on average
            period_length=estimated_period_length,  # Estimated based on average
            predicted_ovulation_date=predicted_ovulation_date_obj,
            predicted_next_period_date=predicted_next_period_date_obj
        )
        
        db.session.add(new_cycle)
        
        # Update tracker settings with new predictions
        settings['last_period_start_date'] = period_date.isoformat()
        settings['predicted_ovulation'] = predicted_ovulation_date_obj.isoformat() if predicted_ovulation_date_obj else None
        settings['predicted_next_period'] = predicted_next_period_date_obj.isoformat() if predicted_next_period_date_obj else None
        
        tracker.settings = settings
        flag_modified(tracker, 'settings')
        
        db.session.commit()
        
        return success_response(
            "Period logged successfully",
            {
                'period_cycle': new_cycle.to_dict(),
                'updated_settings': tracker.settings
            }
        )
    
    except Exception as e:
        db.session.rollback()
        return error_response(f"Failed to log period: {str(e)}", 500)