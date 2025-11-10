import json
import os
from typing import Dict, List, Any, Optional
from sqlalchemy.orm.attributes import flag_modified
from app import db
from app.models.tracker_category import TrackerCategory
from app.models.tracker_field import TrackerField
from app.models.field_option import FieldOption


# ============================================================================
# HELPER CLASSES
# ============================================================================

class SchemaManager:
    """Manages JSON schema operations for tracker categories."""
    
    @staticmethod
    def build_option_schema(option_data: Dict[str, Any]) -> Dict[str, Any]:
        schema = {
            'type': FieldOption.OPTION_TYPE_MAPPING.get(option_data['option_type'], 'string'),
            'optional': not option_data.get('is_required', False)
        }
        
        if 'min_value' in option_data and 'max_value' in option_data:
            schema['range'] = [option_data['min_value'], option_data['max_value']]
        
        if option_data.get('max_length'):
            schema['max_length'] = option_data['max_length']
        
        if option_data.get('choices'):
            schema['enum'] = option_data['choices']
        
        if option_data.get('choice_labels'):
            schema['labels'] = option_data['choice_labels']
        
        return schema
    
    @staticmethod
    def update_category_schema(category: TrackerCategory, field_name: str, 
                               options_dict: Dict[str, Dict[str, Any]]) -> None:
        data_schema = dict(category.data_schema) if category.data_schema else {}
        
        if 'custom' not in data_schema:
            data_schema['custom'] = {}
        else:
            data_schema['custom'] = dict(data_schema['custom'])
        
        data_schema['custom'][field_name] = options_dict
        category.data_schema = data_schema
        flag_modified(category, 'data_schema')
    
    @staticmethod
    def add_option_to_schema(category: TrackerCategory, field_name: str,
                            option_name: str, option_schema: Dict[str, Any]) -> None:
        data_schema = dict(category.data_schema) if category.data_schema else {}
        
        if 'custom' not in data_schema:
            data_schema['custom'] = {}
        else:
            data_schema['custom'] = dict(data_schema['custom'])
        
        if field_name not in data_schema['custom']:
            data_schema['custom'][field_name] = {}
        else:
            data_schema['custom'][field_name] = dict(data_schema['custom'][field_name])
        
        data_schema['custom'][field_name][option_name] = option_schema
        category.data_schema = data_schema
        flag_modified(category, 'data_schema')
    
    @staticmethod
    def remove_option_from_schema(category: TrackerCategory, field_name: str, 
                                  option_name: str) -> None:
        data_schema = dict(category.data_schema) if category.data_schema else {}
        
        if 'custom' in data_schema and field_name in data_schema['custom']:
            data_schema['custom'] = dict(data_schema['custom'])
            data_schema['custom'][field_name] = dict(data_schema['custom'][field_name])
            
            data_schema['custom'][field_name].pop(option_name, None)
            
            if not data_schema['custom'][field_name]:
                del data_schema['custom'][field_name]
            
            category.data_schema = data_schema
            flag_modified(category, 'data_schema')

    @staticmethod
    def remove_field_from_schema(category: TrackerCategory, field_name: str) -> None:
        data_schema = dict(category.data_schema) if category.data_schema else {}
        
        if 'custom' in data_schema and field_name in data_schema['custom']:
            data_schema['custom'] = dict(data_schema['custom'])
            del data_schema['custom'][field_name]
            
        category.data_schema = data_schema
        flag_modified(category, 'data_schema')


class FieldOptionBuilder:
    """Builds FieldOption instances from option data."""
    
    OPTION_FIELDS = {
        'option_name', 'option_type', 'is_required', 'display_label',
        'help_text', 'placeholder', 'default_value', 'min_value', 'max_value',
        'max_length', 'step', 'choices', 'choice_labels', 'validation_rules',
        'display_options'
    }
    
    @classmethod
    def create(cls, tracker_field_id: int, option_data: Dict[str, Any], 
               option_order: int, is_active: bool = True) -> FieldOption:
        kwargs = {
            'tracker_field_id': tracker_field_id,
            'option_order': option_order,
            'is_active': is_active
        }
        
        for field in cls.OPTION_FIELDS:
            if field in option_data:
                kwargs[field] = option_data[field]
            elif field not in ('option_name', 'option_type'):#check if its not optional
                kwargs[field] = option_data.get(field)
        
        return FieldOption(**kwargs)


# ============================================================================
# MAIN SERVICE
# ============================================================================

class CategoryService:
    """Service for managing tracker categories, fields, and options."""
    
    CONFIG_PATH = os.path.join(os.path.dirname(__file__), '..', 'config', 'tracker_schemas.json')
    
    TYPE_MAPPING = {
        'integer': 'rating',
        'string': 'single_choice',
        'array': 'multiple_choice',
        'boolean': 'yes_no',
        'float': 'number_input'
    }
    
    # Pre-built categories configuration
    PREBUILT_CATEGORIES = {
        'Workout Tracker': 'workout_tracker',
        'Symptom Tracker': 'symptom_tracker'
    }
    
    # Period Tracker is handled separately due to special functionality
    PERIOD_TRACKER_NAME = 'Period Tracker'
    PERIOD_TRACKER_KEY = 'period_tracker'
    
    # ========================================================================
    # CONFIG FILE ACCESS
    # ========================================================================
    
    @staticmethod
    def _load_config() -> Dict[str, Any]:
        
        with open(CategoryService.CONFIG_PATH, 'r') as f:
            return json.load(f)
    
    @staticmethod
    def get_baseline_schema() -> Dict[str, Any]:
        
        config = CategoryService._load_config()
        return config.get('baseline', {})
    
    @staticmethod
    def get_prebuilt_schema(category_name: str) -> Optional[Dict[str, Any]]:
        
        # Check standard prebuilt categories
        section_key = CategoryService.PREBUILT_CATEGORIES.get(category_name)
        
        # Check Period Tracker separately
        if not section_key and category_name == CategoryService.PERIOD_TRACKER_NAME:
            section_key = CategoryService.PERIOD_TRACKER_KEY
        
        if not section_key:
            return None
        
        config = CategoryService._load_config()
        return config.get(section_key, {})
    
    @staticmethod
    def is_prebuilt_category(category_name: str) -> bool:
        """Check if category is a pre-built category (Period Tracker, Workout Tracker, Symptom Tracker)."""
        return (category_name in CategoryService.PREBUILT_CATEGORIES or 
                category_name == CategoryService.PERIOD_TRACKER_NAME)
    
    # ========================================================================
    # CATEGORY INITIALIZATION (Called during app setup)
    # ========================================================================
    
    @staticmethod
    def initialize_prebuilt_categories() -> List[TrackerCategory]:
        """Initialize pre-built categories (Workout and Symptom trackers only)."""
        categories = []
        
        # Load config once for all categories
        config = CategoryService._load_config()
        baseline_schema = config.get('baseline', {})
        
        # Initialize standard prebuilt categories (excluding Period Tracker)
        for category_name, config_key in CategoryService.PREBUILT_CATEGORIES.items():
            # Categories are created via migration, so they should exist
            category = TrackerCategory.query.filter_by(name=category_name).first()
            
            if not category:
                # If category doesn't exist (shouldn't happen after migration), create it
                try:
                    # Extract specific schema for this category
                    specific_schema = config.get(config_key, {})
                    category = CategoryService._create_prebuilt_category(
                        category_name, 
                        config_key,
                        baseline_schema,
                        specific_schema
                    )
                    categories.append(category)
                    continue
                except Exception as e:
                    db.session.rollback()
                    print(f"Failed to initialize {category_name}: {str(e)}")
                    continue
            
            # Check if fields/options exist for this category (migration doesn't create them)
            baseline_fields_exist = TrackerField.query.filter_by(
                category_id=category.id,
                field_group='baseline'
            ).first() is not None
            
            if not baseline_fields_exist:
                # Fields/options don't exist, create them from JSON config
                specific_schema = config.get(config_key, {})
                
                CategoryService._create_fields_for_prebuilt_category(
                    category.id, 
                    baseline_schema, 
                    specific_schema, 
                    config_key
                )
                db.session.commit()
            
            categories.append(category)
        
        return categories
    
    @staticmethod
    def initialize_period_tracker() -> Optional[TrackerCategory]:

        # Load config
        config = CategoryService._load_config()
        baseline_schema = config.get('baseline', {})
        period_schema = config.get(CategoryService.PERIOD_TRACKER_KEY, {})
        
        # Category is created via migration, so it should exist
        category = TrackerCategory.query.filter_by(name=CategoryService.PERIOD_TRACKER_NAME).first()
        
        if not category:
            # If category doesn't exist 
            try:
                category = CategoryService._create_prebuilt_category(
                    CategoryService.PERIOD_TRACKER_NAME,
                    CategoryService.PERIOD_TRACKER_KEY,
                    baseline_schema,
                    period_schema
                )
                return category
            except Exception as e:
                db.session.rollback()
                print(f"Failed to initialize Period Tracker: {str(e)}")
                return None
        
        # Check if fields/options exist (migration doesn't create them)
        baseline_fields_exist = TrackerField.query.filter_by(
            category_id=category.id,
            field_group='baseline'
        ).first() is not None
        
        if not baseline_fields_exist:
            # Fields/options don't exist, create them from JSON config
            CategoryService._create_fields_for_prebuilt_category(
                category.id,
                baseline_schema,
                period_schema,
                CategoryService.PERIOD_TRACKER_KEY
            )
            db.session.commit()
        
        return category
    
    @staticmethod
    def _create_fields_for_prebuilt_category(category_id: int, baseline_schema: Dict[str, Any], 
                                           specific_schema: Dict[str, Any], config_key: str) -> None:
        # Create baseline fields
        CategoryService._create_fields_from_schema(
            category_id,
            baseline_schema,
            field_group='baseline',
            start_order=0
        )
        
        # Create category-specific fields
        baseline_count = len(baseline_schema)
        CategoryService._create_fields_from_schema(
            category_id,
            specific_schema,
            field_group=config_key,
            start_order=baseline_count
        )
    
    @staticmethod
    def _create_prebuilt_category(category_name: str, config_key: str, 
                                 baseline_schema: Dict[str, Any], 
                                 specific_schema: Dict[str, Any]) -> TrackerCategory:
        # Build complete schema (JSON metadata stored in category)
        combined_schema = {
            "baseline": baseline_schema,
            config_key: specific_schema,  # e.g., "period_tracker": {...}
            "custom": {}
        }
        
        # Create category
        category = TrackerCategory(
            name=category_name,
            data_schema=combined_schema,
            is_active=True
        )
        db.session.add(category)
        db.session.flush()
        
        # Create fields and options (actual database records)
        CategoryService._create_fields_for_prebuilt_category(
            category.id, 
            baseline_schema, 
            specific_schema, 
            config_key
        )
        
        db.session.commit()
        return category
    
    # ========================================================================
    # CUSTOM CATEGORY CREATION
    # ========================================================================
    
    @staticmethod
    def create_custom_category(name: str, custom_fields_data: List[Dict[str, Any]]) -> TrackerCategory:
        
        try:
            baseline_schema = CategoryService.get_baseline_schema()
            custom_schema = CategoryService._build_custom_schema(custom_fields_data)
            
            combined_schema = {
                "baseline": baseline_schema,
                "custom": custom_schema
            }
            
            category = TrackerCategory(
                name=name,
                data_schema=combined_schema,
                is_active=True
            )
            db.session.add(category)
            db.session.flush()
            
            # Create baseline fields
            CategoryService._create_fields_from_schema(
                category.id,
                baseline_schema,
                field_group='baseline',
                start_order=0
            )
            
            # Create custom fields
            baseline_count = len(baseline_schema)
            CategoryService._create_custom_fields(
                category.id,
                custom_fields_data,
                start_order=baseline_count
            )
            
            db.session.commit()
            return category
        except Exception as e:
            db.session.rollback()
            raise
    
    @staticmethod
    def _build_custom_schema(custom_fields_data: List[Dict[str, Any]]) -> Dict[str, Dict]:
        
        custom_schema = {}
        
        for field_data in custom_fields_data:
            field_name = field_data['field_name']
            custom_schema[field_name] = {}
            
            for option_data in field_data.get('options', []):
                option_name = option_data['option_name']
                custom_schema[field_name][option_name] = SchemaManager.build_option_schema(option_data)
        
        return custom_schema
    
    # ========================================================================
    # FIELD CREATION FROM SCHEMA (Unified method)
    # ========================================================================
    
    @staticmethod
    def _create_fields_from_schema(category_id: int, schema: Dict[str, Any],
                                   field_group: str, start_order: int) -> None:
        
        for field_offset, (field_name, field_options) in enumerate(schema.items()):
            tracker_field = TrackerField(
                category_id=category_id,
                field_name=field_name,
                field_group=field_group,
                field_order=start_order + field_offset,
                display_label=field_name.replace('_', ' ').title(),
                is_active=True
            )
            db.session.add(tracker_field)
            db.session.flush()
            
            # Create options for this field
            for option_order, (option_name, option_config) in enumerate(field_options.items()):
                option_data = CategoryService._schema_to_option_data(option_name, option_config)
                field_option = FieldOptionBuilder.create(
                    tracker_field.id,
                    option_data,
                    option_order,
                    is_active=True
                )
                db.session.add(field_option)
    
    @staticmethod
    def _create_custom_fields(category_id: int, custom_fields_data: List[Dict[str, Any]],
                             start_order: int) -> None:
        
        for field_offset, field_data in enumerate(custom_fields_data):
            tracker_field = TrackerField(
                category_id=category_id,
                field_name=field_data['field_name'],
                field_group='custom',
                field_order=start_order + field_offset,
                display_label=field_data.get('display_label', field_data['field_name']),
                help_text=field_data.get('help_text'),
                is_active=True
            )
            db.session.add(tracker_field)
            db.session.flush()
            
            for option_order, option_data in enumerate(field_data.get('options', [])):
                field_option = FieldOptionBuilder.create(
                    tracker_field.id,
                    option_data,
                    option_order,
                    is_active=True
                )
                db.session.add(field_option)
    
    # ========================================================================
    # SCHEMA CONVERSION UTILITIES
    # ========================================================================
    
    @staticmethod
    def _schema_to_option_data(option_name: str, option_schema: Dict[str, Any]) -> Dict[str, Any]:
        """Convert schema format to option data format."""
        # Determine option type from schema type
        schema_type = option_schema.get('type', 'string')
        
        if schema_type == 'integer':
            option_type = 'rating' if 'range' in option_schema else 'number_input'
        elif schema_type == 'string':
            option_type = 'single_choice' if 'enum' in option_schema else 'text'
        elif schema_type == 'array':
            option_type = 'multiple_choice'
        elif schema_type == 'boolean':
            option_type = 'yes_no'
        elif schema_type == 'float':
            option_type = 'number_input'
        else:
            option_type = 'text'
        
        option_data = {
            'option_name': option_name,
            'option_type': option_type,
            'is_required': not option_schema.get('optional', False),
            'display_label': option_name.replace('_', ' ').title()
        }
        
        # Extract range
        if 'range' in option_schema and len(option_schema['range']) == 2:
            option_data['min_value'] = option_schema['range'][0]
            option_data['max_value'] = option_schema['range'][1]
        
        # Extract choices
        if 'enum' in option_schema:
            option_data['choices'] = option_schema['enum']
        
        # Extract labels
        if 'labels' in option_schema:
            option_data['choice_labels'] = option_schema['labels']
        
        # Extract other fields
        for key in ['max_length', 'step']:
            if key in option_schema:
                option_data[key] = option_schema[key]
        
        return option_data
    
    # ========================================================================
    # FIELD OPERATIONS (for custom fields)
    # ========================================================================
    
    @staticmethod
    def create_new_field(tracker_category: TrackerCategory, field_data: Dict[str, Any],
                         validated_options: List[Dict[str, Any]]) -> TrackerField:
        try:
            field_name = field_data['field_name']
            max_order = db.session.query(db.func.max(TrackerField.field_order)).filter_by(
                category_id=tracker_category.id
            ).scalar() or -1
            
            tracker_field = TrackerField(
                category_id=tracker_category.id,
                field_name=field_name,
                field_group='custom',
                field_order=max_order + 1,
                display_label=field_data.get('display_label', field_name),
                help_text=field_data.get('help_text'),
                is_active=True
            )
            db.session.add(tracker_field)
            db.session.flush()
            
            for option_order, option_data in enumerate(validated_options):
                field_option = FieldOptionBuilder.create(
                    tracker_field.id,
                    option_data,
                    option_order,
                    is_active=True
                )
                db.session.add(field_option)
            
            db.session.flush()
            
            # Update schema
            options_dict = {
                opt['option_name']: SchemaManager.build_option_schema(opt)
                for opt in validated_options
            }
            SchemaManager.update_category_schema(tracker_category, field_name, options_dict)
            
            db.session.commit()
            return tracker_field
        except Exception as e:
            db.session.rollback()
            raise
    
    @staticmethod
    def delete_field_from_category(field_id: int) -> None:
        
        try:
            field = TrackerField.query.filter_by(id=field_id).first()
            if not field:
                raise ValueError("Field not found")
            
            if field.field_group not in ['custom']:
                raise ValueError("Cannot delete baseline or pre-built fields")
            
            category = TrackerCategory.query.filter_by(id=field.category_id).first()
            field_name = field.field_name
            
            db.session.delete(field)
            db.session.flush()
            
            if category:
                SchemaManager.remove_field_from_schema(category, field_name)
            
            db.session.commit()
        except Exception as e:
            db.session.rollback()
            raise
    
    # ========================================================================
    # OPTION OPERATIONS
    # ========================================================================
    
    @staticmethod
    def create_new_option(tracker_field: TrackerField, option_data: Dict[str, Any]) -> FieldOption:
        
        try:
            max_order = db.session.query(db.func.max(FieldOption.option_order)).filter_by(
                tracker_field_id=tracker_field.id
            ).scalar() or -1
            
            field_option = FieldOptionBuilder.create(
                tracker_field.id,
                option_data,
                max_order + 1,
                is_active=True
            )
            db.session.add(field_option)
            db.session.flush()
            
            # Update schema
            category = TrackerCategory.query.filter_by(id=tracker_field.category_id).first()
            if category:
                option_schema = SchemaManager.build_option_schema(option_data)
                SchemaManager.add_option_to_schema(
                    category,
                    tracker_field.field_name,
                    option_data['option_name'],
                    option_schema
                )
            
            db.session.commit()
            return field_option
        except Exception as e:
            db.session.rollback()
            raise

    @staticmethod
    def delete_option_from_field(option_id: int) -> None:
        try:
            field_option = FieldOption.query.filter_by(id=option_id).first()
            if not field_option:
                raise ValueError("Field option not found")
            
            field = field_option.tracker_field
            category = TrackerCategory.query.filter_by(id=field.category_id).first()
            
            option_name = field_option.option_name
            field_name = field.field_name
            
            db.session.delete(field_option)
            db.session.flush()
            
            if category:
                SchemaManager.remove_option_from_schema(category, field_name, option_name)
            
            # Check if field has remaining options
            remaining = FieldOption.query.filter_by(
                tracker_field_id=field.id,
                is_active=True
            ).count()
            
            # Only delete custom fields if no options left
            if remaining == 0 and field.field_group == 'custom':
                CategoryService.delete_field_from_category(field.id)
            else:
                db.session.commit()
        except Exception as e:
            db.session.rollback()
            raise
    
    # ========================================================================
    # FIELD ORDERING AND ACTIVE STATUS
    # ========================================================================
    
    @staticmethod
    def update_field_order(field_id: int, new_order: int) -> None:
        
        try:
            field = TrackerField.query.filter_by(id=field_id).first()
            if not field:
                raise ValueError("Field not found")
            
            if field.field_group == 'baseline':
                raise ValueError("Cannot reorder baseline fields")
            
            # Get all custom fields for this category
            custom_fields = TrackerField.query.filter_by(
                category_id=field.category_id,
                field_group='custom'
            ).order_by(TrackerField.field_order).all()
            
            # Validate new_order
            if new_order < 0 or new_order >= len(custom_fields):
                raise ValueError(f"Invalid order. Must be between 0 and {len(custom_fields) - 1}")
            
            current_order = field.field_order
            if current_order == new_order:
                return  # No change needed
            
            # Reorder fields
            if new_order > current_order:
                # Moving down: shift fields up
                for f in custom_fields:
                    if current_order < f.field_order <= new_order:
                        f.field_order -= 1
            else:
                # Moving up: shift fields down
                for f in custom_fields:
                    if new_order <= f.field_order < current_order:
                        f.field_order += 1
            
            field.field_order = new_order
            db.session.commit()
        except Exception as e:
            db.session.rollback()
            raise
    
    @staticmethod
    def toggle_field_active_status(field_id: int) -> None:
        try:
            field = TrackerField.query.filter_by(id=field_id).first()
            if not field:
                raise ValueError("Field not found")
            
            new_status = not field.is_active
            field.is_active = new_status
            
            # Cascade to all options
            options = FieldOption.query.filter_by(tracker_field_id=field.id).all()
            for option in options:
                option.is_active = new_status
            
            # Rebuild schema to reflect changes
            category = TrackerCategory.query.filter_by(id=field.category_id).first()
            if category:
                CategoryService.rebuild_category_schema(category)
            
            db.session.commit()
        except Exception as e:
            db.session.rollback()
            raise

    # ========================================================================
    # OPTION ORDERING AND ACTIVE STATUS
    # ========================================================================
    
    @staticmethod
    def update_option_order(option_id: int, new_order: int) -> None:
        
        try:
            option = FieldOption.query.filter_by(id=option_id).first()
            if not option:
                raise ValueError("Option not found")
            
            field = option.tracker_field
            
            # Get all options for this field
            options = FieldOption.query.filter_by(
                tracker_field_id=field.id
            ).order_by(FieldOption.option_order).all()
            
            # Validate new_order
            if new_order < 0 or new_order >= len(options):
                raise ValueError(f"Invalid order. Must be between 0 and {len(options) - 1}")
            
            current_order = option.option_order
            if current_order == new_order:
                return  # No change needed
            
            # Reorder options
            if new_order > current_order:
                # Moving down: shift options up
                for opt in options:
                    if current_order < opt.option_order <= new_order:
                        opt.option_order -= 1
            else:
                # Moving up: shift options down
                for opt in options:
                    if new_order <= opt.option_order < current_order:
                        opt.option_order += 1
            
            option.option_order = new_order
            db.session.commit()
        except Exception as e:
            db.session.rollback()
            raise
    
    @staticmethod
    def toggle_option_active_status(option_id: int) -> None:
        
        try:
            option = FieldOption.query.filter_by(id=option_id).first()
            if not option:
                raise ValueError("Option not found")
            
            field = option.tracker_field
            
            new_status = not option.is_active
            option.is_active = new_status
            
            # If unmasking option and field is inactive, unmask field
            if new_status and not field.is_active:
                field.is_active = True
            
            # Check if all options are inactive
            active_options = FieldOption.query.filter_by(
                tracker_field_id=field.id,
                is_active=True
            ).count()
            
            # If all options are inactive, mask the field
            if active_options == 0:
                field.is_active = False
            
            # Rebuild schema to reflect changes
            category = TrackerCategory.query.filter_by(id=field.category_id).first()
            if category:
                CategoryService.rebuild_category_schema(category)
            
            db.session.commit()
        except Exception as e:
            db.session.rollback()
            raise
    
    # ========================================================================
    # BULK OPERATIONS
    # ========================================================================
    
    @staticmethod
    def bulk_delete_options(tracker_field: TrackerField, option_ids: List[int]) -> None:
        
        try:
            category = TrackerCategory.query.filter_by(id=tracker_field.category_id).first()
            
            for option_id in option_ids:
                option = FieldOption.query.filter_by(
                    id=option_id,
                    tracker_field_id=tracker_field.id
                ).first()
                
                if not option:
                    continue
                
                option_name = option.option_name
                field_name = tracker_field.field_name
                
                db.session.delete(option)
                db.session.flush()
                
                if category:
                    SchemaManager.remove_option_from_schema(category, field_name, option_name)
            
            # Check if field has remaining options
            remaining = FieldOption.query.filter_by(
                tracker_field_id=tracker_field.id,
                is_active=True
            ).count()
            
            # Only delete custom fields if no options left
            if remaining == 0 and tracker_field.field_group == 'custom':
                CategoryService.delete_field_from_category(tracker_field.id)
            else:
                db.session.commit()
        except Exception as e:
            db.session.rollback()
            raise
    
    # ========================================================================
    # SCHEMA REBUILDING AND MANAGEMENT
    # ========================================================================
    
    @staticmethod
    def rebuild_category_schema(category: TrackerCategory) -> None:
        
        try:
            data_schema = {}
            
            # Build baseline schema from active baseline fields
            baseline_fields = TrackerField.query.filter_by(
                category_id=category.id,
                field_group='baseline',
                is_active=True
            ).order_by(TrackerField.field_order).all()
            
            baseline_schema = {}
            for field in baseline_fields:
                options = FieldOption.query.filter_by(
                    tracker_field_id=field.id,
                    is_active=True
                ).order_by(FieldOption.option_order).all()
                
                field_options = {}
                for option in options:
                    option_schema = SchemaManager.build_option_schema({
                        'option_type': option.option_type,
                        'is_required': option.is_required,
                        'min_value': option.min_value,
                        'max_value': option.max_value,
                        'max_length': option.max_length,
                        'choices': option.choices,
                        'choice_labels': option.choice_labels
                    })
                    field_options[option.option_name] = option_schema
                
                if field_options:
                    baseline_schema[field.field_name] = field_options
            
            data_schema['baseline'] = baseline_schema if baseline_schema else CategoryService.get_baseline_schema()
            
            # Build custom schema from active custom fields
            custom_fields = TrackerField.query.filter_by(
                category_id=category.id,
                field_group='custom',
                is_active=True
            ).order_by(TrackerField.field_order).all()
            
            custom_schema = {}
            for field in custom_fields:
                options = FieldOption.query.filter_by(
                    tracker_field_id=field.id,
                    is_active=True
                ).order_by(FieldOption.option_order).all()
                
                field_options = {}
                for option in options:
                    option_schema = SchemaManager.build_option_schema({
                        'option_type': option.option_type,
                        'is_required': option.is_required,
                        'min_value': option.min_value,
                        'max_value': option.max_value,
                        'max_length': option.max_length,
                        'choices': option.choices,
                        'choice_labels': option.choice_labels
                    })
                    field_options[option.option_name] = option_schema
                
                if field_options:
                    custom_schema[field.field_name] = field_options
            
            data_schema['custom'] = custom_schema
            
            # Preserve static config-based sections (e.g., period_tracker)
            existing_schema = category.data_schema or {}
            # Check all prebuilt category keys (including Period Tracker)
            prebuilt_keys = list(CategoryService.PREBUILT_CATEGORIES.values()) + [CategoryService.PERIOD_TRACKER_KEY]
            
            for key in prebuilt_keys:
                if key in existing_schema and key not in ['baseline', 'custom']:
                    data_schema[key] = existing_schema[key]
                elif key not in data_schema:
                    # Restore from config if missing
                    # Check standard categories
                    category_name = next(
                        (name for name, config_key in CategoryService.PREBUILT_CATEGORIES.items() 
                         if config_key == key),
                        None
                    )
                    # Check Period Tracker
                    if not category_name and key == CategoryService.PERIOD_TRACKER_KEY:
                        category_name = CategoryService.PERIOD_TRACKER_NAME
                    
                    if category_name and category.name == category_name:
                        config = CategoryService._load_config()
                        if key in config:
                            data_schema[key] = config[key]
            
            category.data_schema = data_schema
            flag_modified(category, 'data_schema')
            db.session.commit()
        except Exception as e:
            db.session.rollback()
            raise
    
    @staticmethod
    def get_all_inclusive_data_schema(category: TrackerCategory) -> Dict[str, Any]:
        
        try:
            data_schema = {
                'active': {
                    'baseline': {},
                    'custom': {}
                },
                'inactive': {
                    'baseline': {},
                    'custom': {}
                }
            }
            
            # Process all fields (active and inactive)
            all_fields = TrackerField.query.filter_by(
                category_id=category.id
            ).order_by(TrackerField.field_order).all()
            
            for field in all_fields:
                all_options = FieldOption.query.filter_by(
                    tracker_field_id=field.id
                ).order_by(FieldOption.option_order).all()
                
                field_data = {
                    'active': {},
                    'inactive': {}
                }
                
                for option in all_options:
                    option_schema = SchemaManager.build_option_schema({
                        'option_type': option.option_type,
                        'is_required': option.is_required,
                        'min_value': option.min_value,
                        'max_value': option.max_value,
                        'max_length': option.max_length,
                        'choices': option.choices,
                        'choice_labels': option.choice_labels
                    })
                    
                    if option.is_active:
                        field_data['active'][option.option_name] = option_schema
                    else:
                        field_data['inactive'][option.option_name] = option_schema
            
                target_group = 'active' if field.is_active else 'inactive'
                target_field_group = field.field_group
                
                if target_field_group == 'baseline':
                    data_schema[target_group]['baseline'][field.field_name] = field_data
                elif target_field_group == 'custom':
                    data_schema[target_group]['custom'][field.field_name] = field_data
                else:
                    # Category-specific fields (period_tracker, etc.)
                    if target_field_group not in data_schema[target_group]:
                        data_schema[target_group][target_field_group] = {}
                    data_schema[target_group][target_field_group][field.field_name] = field_data
            
            # Preserve static config-based sections
            existing_schema = category.data_schema or {}
            # Check all prebuilt category keys (including Period Tracker)
            prebuilt_keys = list(CategoryService.PREBUILT_CATEGORIES.values()) + [CategoryService.PERIOD_TRACKER_KEY]
            
            for key in prebuilt_keys:
                if key in existing_schema and key not in ['baseline', 'custom']:
                    if 'static' not in data_schema:
                        data_schema['static'] = {}
                    data_schema['static'][key] = existing_schema[key]
                elif key not in data_schema.get('static', {}):
                    # Restore from config if missing
                    # Check standard categories
                    category_name = next(
                        (name for name, config_key in CategoryService.PREBUILT_CATEGORIES.items() 
                         if config_key == key),
                        None
                    )
                    # Check Period Tracker
                    if not category_name and key == CategoryService.PERIOD_TRACKER_KEY:
                        category_name = CategoryService.PERIOD_TRACKER_NAME
                    
                    if category_name and category.name == category_name:
                        config = CategoryService._load_config()
                        if key in config:
                            if 'static' not in data_schema:
                                data_schema['static'] = {}
                            data_schema['static'][key] = config[key]
            
            return data_schema
        except Exception as e:
            raise
    
    # ========================================================================
    # CONFIG EXPORT/IMPORT
    # ========================================================================
    
    @staticmethod
    def export_tracker_config(category: TrackerCategory) -> Dict[str, Any]:
        
        try:
            # Rebuild schema to ensure it's up-to-date
            CategoryService.rebuild_category_schema(category)
            db.session.refresh(category)
            
            return {
                'category_name': category.name,
                'data_schema': category.data_schema
            }
        except Exception as e:
            raise
    
    @staticmethod
    def import_tracker_config(category: TrackerCategory, tracker_config: Dict[str, Any]) -> None:
        
        try:
            # Delete existing custom fields
            custom_fields = TrackerField.query.filter_by(
                category_id=category.id,
                field_group='custom'
            ).all()
            
            for field in custom_fields:
                db.session.delete(field)
            
            db.session.flush()
            
            # Parse imported config (can be old or new format)
            imported_schema = tracker_config.get('data_schema', tracker_config)
            
            # Handle old format (just schema) or new format (with active/inactive sections)
            if 'active' in imported_schema and 'inactive' in imported_schema:
                # New format: extract active fields
                active_baseline = imported_schema['active'].get('baseline', {})
                active_custom = imported_schema['active'].get('custom', {})
                active_category_specific = {}
                
                for key, value in imported_schema['active'].items():
                    if key not in ['baseline', 'custom']:
                        active_category_specific[key] = value
                
                # Recreate baseline fields if needed
                baseline_fields_exist = TrackerField.query.filter_by(
                    category_id=category.id,
                    field_group='baseline'
                ).first() is not None
                
                if not baseline_fields_exist and active_baseline:
                    CategoryService._create_fields_from_schema(
                        category.id,
                        active_baseline,
                        field_group='baseline',
                        start_order=0
                    )
                
                # Recreate custom fields
                if active_custom:
                    baseline_count = TrackerField.query.filter_by(
                        category_id=category.id,
                        field_group='baseline'
                    ).count()
                    
                    CategoryService._create_fields_from_schema(
                        category.id,
                        active_custom,
                        field_group='custom',
                        start_order=baseline_count
                    )
                
                # Recreate category-specific fields
                if active_category_specific:
                    for section_key, section_schema in active_category_specific.items():
                        baseline_count = TrackerField.query.filter_by(
                            category_id=category.id
                        ).count()
                        
                        CategoryService._create_fields_from_schema(
                            category.id,
                            section_schema,
                            field_group=section_key,
                            start_order=baseline_count
                        )
                
                # Update schema
                combined_schema = {
                    'baseline': active_baseline,
                    'custom': active_custom
                }
                combined_schema.update(active_category_specific)
                category.data_schema = combined_schema
            else:
                # Old format: direct schema
                baseline_schema = imported_schema.get('baseline', {})
                custom_schema = imported_schema.get('custom', {})
                
                # Recreate baseline fields if needed
                baseline_fields_exist = TrackerField.query.filter_by(
                    category_id=category.id,
                    field_group='baseline'
                ).first() is not None
                
                if not baseline_fields_exist and baseline_schema:
                    CategoryService._create_fields_from_schema(
                        category.id,
                        baseline_schema,
                        field_group='baseline',
                        start_order=0
                    )
                
                # Recreate custom fields
                if custom_schema:
                    baseline_count = TrackerField.query.filter_by(
                        category_id=category.id,
                        field_group='baseline'
                    ).count()
                    
                    CategoryService._create_fields_from_schema(
                        category.id,
                        custom_schema,
                        field_group='custom',
                        start_order=baseline_count
                    )
                
                # Update schema
                category.data_schema = imported_schema
            
            flag_modified(category, 'data_schema')
            db.session.commit()
        except Exception as e:
            db.session.rollback()
            raise