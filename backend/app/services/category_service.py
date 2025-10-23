import json
import os
from typing import Dict, List, Any, Optional
from app import db
from app.models.tracker_category import TrackerCategory
from app.models.tracker_field import TrackerField
from app.models.field_option import FieldOption


class SchemaManager:
    #handles data schema operations
    
    @staticmethod
    def build_option_schema(option_data: Dict[str, Any]) -> Dict[str, Any]:
        """Convert option data to schema format."""
        schema = {
            'type': FieldOption.OPTION_TYPE_MAPPING.get(option_data['option_type'], 'string'),
            'optional': not option_data.get('is_required', False)
        }
        
        # Add validation rules based on option type
        if 'min_value' in option_data and 'max_value' in option_data:
            schema['range'] = [option_data['min_value'], option_data['max_value']]
        
        for key in ['max_length', 'choices', 'choice_labels']:
            if key == 'choices':
                if option_data.get(key):
                    schema['enum'] = option_data[key]
            elif key == 'choice_labels':
                if option_data.get(key):
                    schema['labels'] = option_data[key]
            else:
                if option_data.get(key):
                    schema[key] = option_data[key]
        
        return schema
    
    @staticmethod
    def update_category_schema(category: TrackerCategory, field_name: str, 
                               options_dict: Dict[str, Dict[str, Any]]) -> None:
        data_schema = category.data_schema or {}
        
        if 'custom' not in data_schema:
            data_schema['custom'] = {}
        
        data_schema['custom'][field_name] = options_dict
        category.data_schema = data_schema
    
    @staticmethod
    def remove_option_from_schema(category: TrackerCategory, field_name: str, 
                                  option_name: str) -> None:
        data_schema = category.data_schema or {}
        
        if 'custom' in data_schema and field_name in data_schema['custom']:
            data_schema['custom'][field_name].pop(option_name, None)
            
            # Clean up empty field
            if not data_schema['custom'][field_name]:
                del data_schema['custom'][field_name]
            
            category.data_schema = data_schema


class FieldOptionBuilder:
    
    OPTION_FIELDS = {
        'option_name', 'option_type', 'is_required', 'display_label',
        'help_text', 'placeholder', 'default_value', 'min_value', 'max_value',
        'max_length', 'step', 'choices', 'choice_labels', 'validation_rules',
        'display_options'
    }
    
    @classmethod
    def create(cls, tracker_field_id: int, option_data: Dict[str, Any], 
               option_order: int, is_active: bool = True) -> FieldOption:
        kwargs = {'tracker_field_id': tracker_field_id, 'option_order': option_order, 'is_active': is_active}
        
        for field in cls.OPTION_FIELDS:
            if field in option_data:
                kwargs[field] = option_data[field]
            elif field not in ('option_name', 'option_type'):  # Required fields
                kwargs[field] = option_data.get(field)
        
        return FieldOption(**kwargs)


class CategoryService:
    #Service for managing tracker categories and their fields
    
    CONFIG_PATH = os.path.join(os.path.dirname(__file__), '..', 'config', 'tracker_schemas.json')
    TYPE_MAPPING = {
        'integer': 'rating',
        'string': 'single_choice',
        'array': 'multiple_choice',
        'boolean': 'yes_no',
        'float': 'number_input'
    }
    DEFAULT_CATEGORIES = ['baseline', 'period_tracker', 'workout_tracker']
    
    @staticmethod
    def get_baseline_schema() -> Dict[str, Any]:
        with open(CategoryService.CONFIG_PATH, 'r') as f:
            schemas = json.load(f)
        return schemas.get('baseline', {})
    
    @staticmethod
    def create_custom_category(name: str, custom_fields_data: List[Dict[str, Any]]) -> TrackerCategory:
        try:
            baseline_schema = CategoryService.get_baseline_schema()
            combined_schema = {
                "baseline": baseline_schema,
                "custom": CategoryService._build_custom_schema(custom_fields_data)
            }
            
            category = TrackerCategory(name=name, data_schema=combined_schema, is_active=True)
            db.session.add(category)
            db.session.flush()
            
            CategoryService._create_baseline_fields(category.id, baseline_schema)
            CategoryService._create_custom_fields(category.id, custom_fields_data)
            
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
    
    @staticmethod
    def _create_baseline_fields(category_id: int, baseline_schema: Dict[str, Any]) -> None:
        for field_order, (field_name, field_options) in enumerate(baseline_schema.items()):
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
            
            for option_order, (option_name, option_config) in enumerate(field_options.items()):
                option_data = CategoryService._config_to_option_data(option_name, option_config)
                field_option = FieldOptionBuilder.create(
                    tracker_field.id, option_data, option_order, is_active=True
                )
                db.session.add(field_option)
    
    @staticmethod
    def _create_custom_fields(category_id: int, custom_fields_data: List[Dict[str, Any]]) -> None:
        max_order = db.session.query(db.func.max(TrackerField.field_order)).filter_by(
            category_id=category_id
        ).scalar() or 0
        
        for field_offset, field_data in enumerate(custom_fields_data):
            tracker_field = TrackerField(
                category_id=category_id,
                field_name=field_data['field_name'],
                field_group='custom',
                field_order=max_order + field_offset + 1,
                display_label=field_data.get('display_label', field_data['field_name']),
                help_text=field_data.get('help_text'),
                is_active=True
            )
            db.session.add(tracker_field)
            db.session.flush()
            
            for option_order, option_data in enumerate(field_data.get('options', [])):
                field_option = FieldOptionBuilder.create(
                    tracker_field.id, option_data, option_order, is_active=True
                )
                db.session.add(field_option)
    
    @staticmethod
    def create_new_field(tracker_category: TrackerCategory, field_data: Dict[str, Any],
                         validated_options: List[Dict[str, Any]]) -> TrackerField:
        try:
            field_name = field_data['field_name']
            max_order = db.session.query(db.func.max(TrackerField.field_order)).filter_by(
                category_id=tracker_category.id
            ).scalar() or 0
            
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
                    tracker_field.id, option_data, option_order, is_active=True
                )
                db.session.add(field_option)
            
            db.session.commit()
            
            # Build schema options dict
            options_dict = {
                opt['option_name']: SchemaManager.build_option_schema(opt)
                for opt in validated_options
            }
            
            # Update schema
            fresh_category = TrackerCategory.query.filter_by(id=tracker_category.id).first()
            SchemaManager.update_category_schema(fresh_category, field_name, options_dict)
            db.session.commit()
            
            return tracker_field
        except Exception as e:
            db.session.rollback()
            raise
    
    @staticmethod
    def create_new_option(tracker_field: TrackerField, option_data: Dict[str, Any]) -> FieldOption:
        try:
            max_order = db.session.query(db.func.max(FieldOption.option_order)).filter_by(
                tracker_field_id=tracker_field.id
            ).scalar() or 0
            
            field_option = FieldOptionBuilder.create(
                tracker_field.id, option_data, max_order + 1, is_active=True
            )
            db.session.add(field_option)
            db.session.commit()
            
            # Update schema
            fresh_category = TrackerCategory.query.filter_by(id=tracker_field.category_id).first()
            option_schema = SchemaManager.build_option_schema(option_data)
            
            data_schema = fresh_category.data_schema or {}
            if 'custom' not in data_schema:
                data_schema['custom'] = {}
            if tracker_field.field_name not in data_schema['custom']:
                data_schema['custom'][tracker_field.field_name] = {}
            
            data_schema['custom'][tracker_field.field_name][option_data['option_name']] = option_schema
            fresh_category.data_schema = data_schema
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
            
            db.session.delete(field_option)
            db.session.commit()
            
            if category:
                SchemaManager.remove_option_from_schema(category, field.field_name, field_option.option_name)
                db.session.commit()
        except Exception as e:
            db.session.rollback()
            raise
    
    @staticmethod
    def _config_to_option_data(option_name: str, option_config: Dict[str, Any]) -> Dict[str, Any]:
        return {
            'option_name': option_name,
            'option_type': CategoryService.TYPE_MAPPING.get(option_config.get('type', 'string'), 'single_choice'),
            'is_required': not option_config.get('optional', True),
            'min_value': option_config.get('range', [None, None])[0] if option_config.get('range') else None,
            'max_value': option_config.get('range', [None, None])[1] if option_config.get('range') else None,
            'max_length': option_config.get('max_length'),
            'step': option_config.get('step'),
            'choices': option_config.get('enum'),
            'choice_labels': option_config.get('labels'),
        }
    
    @staticmethod
    def get_default_categories() -> List[str]:
        return CategoryService.DEFAULT_CATEGORIES
    
    @staticmethod
    def is_default_category(category_name: str) -> bool:
        return category_name.lower() in CategoryService.DEFAULT_CATEGORIES