import json
import os
from app import db
from app.models.tracker_category import TrackerCategory
from app.models.tracker_field import TrackerField
from app.models.field_option import FieldOption

class CategoryService:
    
    @staticmethod
    def get_baseline_schema():
        config_path = os.path.join(os.path.dirname(__file__), '..', 'config', 'tracker_schemas.json')
        
        with open(config_path, 'r') as f:
            schemas = json.load(f)
        
        return schemas.get('baseline', {})
    
    @staticmethod
    def create_custom_category(name, custom_fields_data):
        """
        Create a new custom category with baseline schema + custom fields
        
        Args:
            name: Category name
            custom_fields_data: List of custom field definitions
                Example:
                [
                    {
                        "field_name": "Mood",
                        "display_label": "How was your mood today?",
                        "options": [
                            {
                                "option_name": "overall_mood",
                                "option_type": "rating",
                                "min_value": 1,
                                "max_value": 10,
                                "is_required": True
                            },
                            {
                                "option_name": "mood_notes",
                                "option_type": "text",
                                "max_length": 200,
                                "is_required": False
                            }
                        ]
                    }
                ]
        """
        try:
            # Get baseline schema
            baseline_schema = CategoryService.get_baseline_schema()
            
            # Create the category with combined schema
            combined_schema = {
                "baseline": baseline_schema,
                "custom": {}
            }
            
            # Build custom schema from field definitions
            for field_data in custom_fields_data:
                field_name = field_data['field_name']  
                combined_schema["custom"][field_name] = {}
                
                for option_data in field_data.get('options', []):
                    option_name = option_data['option_name']
                    option_schema = CategoryService._build_option_schema(option_data)
                    combined_schema["custom"][field_name][option_name] = option_schema
            
            # Create category
            category = TrackerCategory(
                name=name,
                data_schema=combined_schema,
                is_active=True
            )
            db.session.add(category)
            db.session.flush()  # in order to get the id
            
            # Create baseline fields
            CategoryService._create_baseline_fields(category.id, baseline_schema)
            
            # Create custom fields
            CategoryService._create_custom_fields(category.id, custom_fields_data)
            
            db.session.commit()
            return category
            
        except Exception as e:
            db.session.rollback()
            raise e
    
    @staticmethod
    def _build_option_schema(option_data):
        schema = {
            'type': FieldOption.OPTION_TYPE_MAPPING.get(option_data['option_type'], 'string'),
            'optional': not option_data.get('is_required', False)
        }
        
        # Add validation rules based on option type
        if option_data.get('min_value') is not None and option_data.get('max_value') is not None:
            schema['range'] = [option_data['min_value'], option_data['max_value']]
        
        if option_data.get('max_length'):
            schema['max_length'] = option_data['max_length']
        
        if option_data.get('choices'):
            schema['enum'] = option_data['choices']
        
        if option_data.get('choice_labels'):
            schema['labels'] = option_data['choice_labels']
        
        return schema
    
    @staticmethod
    def _create_baseline_fields(category_id, baseline_schema):
        field_order = 0
        
        for field_name, field_options in baseline_schema.items():
            # Create the main field - keep field_name as JSON key (lowercase)
            tracker_field = TrackerField(
                category_id=category_id,
                field_name=field_name,  
                field_group='baseline',
                field_order=field_order,
                display_label=f"Track your {field_name.replace('_', ' ')}",
                is_active=True
            )
            db.session.add(tracker_field)
            db.session.flush()  
            
            # Create options for this field
            option_order = 0
            for option_name, option_config in field_options.items():
                field_option = FieldOption(
                    tracker_field_id=tracker_field.id,
                    option_name=option_name,
                    option_type=CategoryService._map_json_type_to_option_type(option_config.get('type', 'string')),
                    option_order=option_order,
                    is_required=not option_config.get('optional', True),
                    min_value=option_config.get('range', [None, None])[0] if option_config.get('range') else None,
                    max_value=option_config.get('range', [None, None])[1] if option_config.get('range') else None,
                    max_length=option_config.get('max_length'),
                    step=option_config.get('step'),
                    choices=option_config.get('enum'),
                    choice_labels=option_config.get('labels'),
                    is_active=True
                )
                db.session.add(field_option)
                option_order += 1
            
            field_order += 1
    @staticmethod
    def create_new_field(tracker_category, field_data, validated_options):
        """
        Add a single custom field to an existing category.
        Creates TrackerField + FieldOptions + updates schema
        
        Args:
            tracker_category: The TrackerCategory instance
            field_data: Dict with field_name, display_label, help_text
            validated_options: List of validated option dictionaries
        
        Returns:
            The created TrackerField
        """
        try:
            field_name = field_data['field_name']
            
            # Get the highest field_order in this category
            max_order = db.session.query(db.func.max(TrackerField.field_order)).filter_by(
                category_id=tracker_category.id
            ).scalar() or 0
            
            # Create the TrackerField
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
            db.session.flush()  # Get the ID
            
            # Create FieldOptions
            for option_order, option_data in enumerate(validated_options):
                field_option = FieldOption(
                    tracker_field_id=tracker_field.id,
                    option_name=option_data['option_name'],
                    option_type=option_data['option_type'],
                    option_order=option_order,
                    is_required=option_data.get('is_required', False),
                    display_label=option_data.get('display_label'),
                    help_text=option_data.get('help_text'),
                    placeholder=option_data.get('placeholder'),
                    default_value=option_data.get('default_value'),
                    min_value=option_data.get('min_value'),
                    max_value=option_data.get('max_value'),
                    max_length=option_data.get('max_length'),
                    step=option_data.get('step'),
                    choices=option_data.get('choices'),
                    choice_labels=option_data.get('choice_labels'),
                    validation_rules=option_data.get('validation_rules'),
                    display_options=option_data.get('display_options'),
                    is_active=True
                )
                db.session.add(field_option)
            
            db.session.commit()
            
            # Query fresh category from database to ensure active session
            from app.models.tracker_category import TrackerCategory
            fresh_category = TrackerCategory.query.filter_by(id=tracker_category.id).first()
            
            # Update the data schema
            data_schema = dict(fresh_category.data_schema) if fresh_category.data_schema else {}
            if 'custom' not in data_schema:
                data_schema['custom'] = {}
            
            data_schema['custom'][field_name] = {}
            
            for validated_option in validated_options:
                option_schema = CategoryService._build_option_schema(validated_option)
                data_schema['custom'][field_name][validated_option['option_name']] = option_schema
            
            # Update schema with proper change detection
            fresh_category.data_schema = data_schema
            from sqlalchemy.orm.attributes import flag_modified
            flag_modified(fresh_category, 'data_schema')
            
            db.session.add(fresh_category)
            db.session.commit()
            
            return tracker_field
            
        except Exception as e:
            db.session.rollback()
            raise e

    @staticmethod
    def create_new_option(tracker_field, option_data):
        """
        Add a new option to an existing field.
        
        Args:
            tracker_field: The TrackerField instance
            option_data: Dict with option details
        
        Returns:
            The created FieldOption
        """
        try:
            # Get the highest option_order for this field
            max_order = db.session.query(db.func.max(FieldOption.option_order)).filter_by(
                tracker_field_id=tracker_field.id
            ).scalar() or 0
            
            # Create the FieldOption with proper defaults
            field_option = FieldOption(
                tracker_field_id=tracker_field.id,
                option_name=option_data['option_name'],
                option_type=option_data['option_type'],
                option_order=max_order + 1,
                is_required=option_data.get('is_required', False),
                display_label=option_data.get('display_label'),
                help_text=option_data.get('help_text'),
                placeholder=option_data.get('placeholder'),
                default_value=option_data.get('default_value'),
                min_value=option_data.get('min_value'),
                max_value=option_data.get('max_value'),
                max_length=option_data.get('max_length'),
                step=option_data.get('step'),
                choices=option_data.get('choices'),
                choice_labels=option_data.get('choice_labels'),
                validation_rules=option_data.get('validation_rules'),
                display_options=option_data.get('display_options'),
                is_active=option_data.get('is_active', True)
            )
            
            db.session.add(field_option)
            db.session.commit()
            
            # Update the data schema to include the new option
            # Query fresh category from database to ensure active session
            fresh_category = TrackerCategory.query.filter_by(id=tracker_field.category_id).first()
            
            # Update the schema
            data_schema = dict(fresh_category.data_schema) if fresh_category.data_schema else {}
            if 'custom' not in data_schema:
                data_schema['custom'] = {}
            if tracker_field.field_name not in data_schema['custom']:
                data_schema['custom'][tracker_field.field_name] = {}
            
            # Add the new option to the schema
            option_schema = CategoryService._build_option_schema(option_data)
            data_schema['custom'][tracker_field.field_name][option_data['option_name']] = option_schema
            
            # Update schema with proper change detection
            fresh_category.data_schema = data_schema
            from sqlalchemy.orm.attributes import flag_modified
            flag_modified(fresh_category, 'data_schema')
            
            db.session.add(fresh_category)
            db.session.commit()
            
            return field_option
            
        except Exception as e:
            db.session.rollback()
            raise e
    
    @staticmethod
    def delete_option_from_field(option_data):
        """
        Delete an option from a field.
        
        Args:
            option_data: Dict with option details
        """
        try:
            field_option = FieldOption.query.filter_by(id=option_data['id']).first()
            if not field_option:
                raise ValueError("Field option not found")
            
            category = TrackerCategory.query.filter_by(id=field_option.tracker_field.category_id).first()
            db.session.delete(field_option)
            db.session.commit() 
            if category:
            CategoryService._remove_option_from_schema(
                category, 
                field_option.tracker_field.field_name, 
                field_option.option_name
            )
        
        except Exception as e:
            db.session.rollback()
            raise e

    @staticmethod
    def _remove_option_from_schema(category, field_name, option_name):
        """
        Remove an option from the data schema of a field.
        
        Args:
            category: The TrackerCategory instance
            field_name: The name of the field
            option_name: The name of the option
        """
        try:
            data_schema = dict(category.data_schema) if category.data_schema else {}
            if 'custom' not in data_schema:
                data_schema['custom'] = {}
            if field_name not in data_schema['custom']:
                data_schema['custom'][field_name] = {}
            data_schema['custom'][field_name].pop(option_name)
            category.data_schema = data_schema
            db.session.add(category)
            db.session.commit()
        except Exception as e:
            db.session.rollback()
            raise e

    @staticmethod
    def add_option_to_schema(tracker_field, option_data):
        """
        Add a new option to the data schema of a field.
        
        Args:
            tracker_field: The TrackerField instance
            option_data: Dict with option details
        
        Returns:
            The updated TrackerCategory
        """
        try:
            # Get the category
            category = TrackerCategory.query.filter_by(id=tracker_field.category_id).first()
            if not category:
                raise ValueError("Category not found")
            
            # Update the schema
            data_schema = dict(category.data_schema) if category.data_schema else {}
            if 'custom' not in data_schema:
                data_schema['custom'] = {}
            if tracker_field.field_name not in data_schema['custom']:
                data_schema['custom'][tracker_field.field_name] = {}
            
            # Add the new option to the schema
            option_schema = CategoryService._build_option_schema(option_data)
            data_schema['custom'][tracker_field.field_name][option_data['option_name']] = option_schema
            
            # Update and commit the schema
            category.data_schema = data_schema
            db.session.add(category)
            db.session.commit()
            
            return category
            
        except Exception as e:
            db.session.rollback()
            raise e
    
    @staticmethod
    def _create_custom_fields(category_id, custom_fields_data):

        # Get the highest field_order from baseline fields
        max_order = db.session.query(db.func.max(TrackerField.field_order)).filter_by(category_id=category_id).scalar() or 0
        field_order = max_order + 1
        
        for field_data in custom_fields_data:
            # Create the main field
            tracker_field = TrackerField(
                category_id=category_id,
                field_name=field_data['field_name'],
                field_group='custom',
                field_order=field_order,
                display_label=field_data.get('display_label', field_data['field_name']),
                help_text=field_data.get('help_text'),
                is_active=True
            )
            db.session.add(tracker_field)
            db.session.flush()  
            
            # Create options for this field
            option_order = 0
            for option_data in field_data.get('options', []):
                field_option = FieldOption(
                    tracker_field_id=tracker_field.id,
                    option_name=option_data['option_name'],
                    option_type=option_data['option_type'],
                    option_order=option_order,
                    is_required=option_data.get('is_required', False),
                    display_label=option_data.get('display_label'),
                    help_text=option_data.get('help_text'),
                    placeholder=option_data.get('placeholder'),
                    default_value=option_data.get('default_value'),
                    min_value=option_data.get('min_value'),
                    max_value=option_data.get('max_value'),
                    max_length=option_data.get('max_length'),
                    step=option_data.get('step'),
                    choices=option_data.get('choices'),
                    choice_labels=option_data.get('choice_labels'),
                    validation_rules=option_data.get('validation_rules'),
                    display_options=option_data.get('display_options'),
                    is_active=True
                )
                db.session.add(field_option)
                option_order += 1
                
            
            field_order += 1
    
    @staticmethod
    def _map_json_type_to_option_type(json_type):
        mapping = {
            'integer': 'rating',  
            'string': 'single_choice',  
            'array': 'multiple_choice',
            'boolean': 'yes_no',
            'float': 'number_input'
        }
        return mapping.get(json_type, 'single_choice')
    
    @staticmethod
    def get_default_categories():
        
        return ['baseline', 'period_tracker', 'workout_tracker']
    
    @staticmethod
    def is_default_category(category_name):
        
        return category_name.lower() in CategoryService.get_default_categories()
