import json
import os
from typing import Dict, List, Any, Optional
from sqlalchemy.orm.attributes import flag_modified
from app import db
from app.models.tracker_category import TrackerCategory
from app.models.tracker_field import TrackerField
from app.models.field_option import FieldOption


class SchemaManager:
    
    @staticmethod
    def build_option_schema(option_data: Dict[str, Any]) -> Dict[str, Any]:
        schema = {
            'type': FieldOption.OPTION_TYPE_MAPPING.get(option_data['option_type'], 'string'),
            'optional': not option_data.get('is_required', False)
        }
        
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
            elif field not in ('option_name', 'option_type'):
                kwargs[field] = option_data.get(field)
        
        return FieldOption(**kwargs)


class CategoryService:
    
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
            
            db.session.flush()
            
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
    def create_new_option(tracker_field: TrackerField, option_data: Dict[str, Any]) -> FieldOption:
        try:
            max_order = db.session.query(db.func.max(FieldOption.option_order)).filter_by(
                tracker_field_id=tracker_field.id
            ).scalar() or 0
            
            field_option = FieldOptionBuilder.create(
                tracker_field.id, option_data, max_order + 1, is_active=True
            )
            db.session.add(field_option)
            db.session.flush()
            
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
    def update_field_display_label(field_id: int, new_label: str) -> None:
        try:
            field = TrackerField.query.filter_by(id=field_id).first()
            if not field:
                raise ValueError("Field not found")
            
            field.display_label = new_label
            db.session.commit()
        except Exception as e:
            db.session.rollback()
            raise

    @staticmethod
    def update_option(option_id: int, validated_data: Dict[str, Any]) -> None:  
        try:
            option = FieldOption.query.filter_by(id=option_id).first()
            if not option:
                raise ValueError("Option not found")
            
            old_option_name = option.option_name
            old_option_type = option.option_type
            field = option.tracker_field
            category = TrackerCategory.query.filter_by(id=field.category_id).first()
            
            # Update all provided fields
            for key, value in validated_data.items():
                if hasattr(option, key):
                    setattr(option, key, value)
            
            # Always clear fields that are not relevant for the current option type
            current_option_type = validated_data.get('option_type', old_option_type)
            CategoryService._clear_irrelevant_fields(option, current_option_type)
            
            db.session.flush()
            
            if category:
                if old_option_name != option.option_name:
                    SchemaManager.remove_option_from_schema(category, field.field_name, old_option_name)
                
                option_schema = SchemaManager.build_option_schema(validated_data)
                SchemaManager.add_option_to_schema(
                    category,
                    field.field_name,
                    option.option_name,
                    option_schema
                )
            
            db.session.commit()
        except Exception as e:
            db.session.rollback()
            raise
    
    @staticmethod
    def update_option_order(option_id: int, new_order: int) -> None:
        try:
            option = FieldOption.query.filter_by(id=option_id).first()
            if not option:
                raise ValueError("Option not found")

            # Normalize and validate new_order (0-based indexing)
            target_order = int(new_order)

            siblings = FieldOption.query.filter_by(
                tracker_field_id=option.tracker_field_id,
                is_active=True
            ).order_by(FieldOption.option_order).all()

            total = len(siblings)
            if total == 0:
                db.session.commit()
                return

            if target_order < 0 or target_order >= total:
                raise ValueError("new_order out of range")

            current_order = option.option_order
            if target_order == current_order:
                db.session.commit()
                return

            # Shift orders of siblings to make room
            if target_order > current_order:
                # Moving down: decrement those between (current, target]
                for s in siblings:
                    if current_order < s.option_order <= target_order:
                        s.option_order -= 1
            else:
                # Moving up: increment those between [target, current)
                for s in siblings:
                    if target_order <= s.option_order < current_order:
                        s.option_order += 1

            option.option_order = target_order

            db.session.commit()
        except Exception:
            db.session.rollback()
            raise

    @staticmethod
    def update_field_order(field_id: int, new_order: int) -> None:
        try:
            field = TrackerField.query.filter_by(id=field_id).first()
            if not field:
                raise ValueError("Field not found")
            if field.field_group != 'custom':
                raise ValueError("Cannot reorder baseline fields")

            target_order = int(new_order)

            # Count baseline fields to anchor minimum absolute index
            baseline_count = TrackerField.query.filter_by(
                category_id=field.category_id,
                field_group='baseline',
                is_active=True
            ).count()

            # Custom siblings ordered by absolute order
            siblings = TrackerField.query.filter_by(
                category_id=field.category_id,
                field_group='custom',
                is_active=True
            ).order_by(TrackerField.field_order).all()

            total_custom = len(siblings)
            if total_custom == 0:
                db.session.commit()
                return

            # Validate target within custom range (0..total_custom-1)
            if target_order < 0 or target_order >= total_custom:
                raise ValueError("new_order out of range")

            # Map to absolute order space, after baseline block
            absolute_target = baseline_count + target_order
            current_order = field.field_order
            if absolute_target == current_order:
                db.session.commit()
                return

            # Shift affected custom siblings using absolute field_order
            if absolute_target > current_order:
                for s in siblings:
                    if current_order < s.field_order <= absolute_target:
                        s.field_order -= 1
            else:
                for s in siblings:
                    if absolute_target <= s.field_order < current_order:
                        s.field_order += 1

            field.field_order = absolute_target

            db.session.commit()
        except Exception:
            db.session.rollback()
            raise
    
    @staticmethod
    def _clear_irrelevant_fields(option: FieldOption, option_type: str) -> None:
        """Clear fields that are not relevant for the given option type"""
        if option_type == 'yes_no':
            # Yes/No doesn't need choices, labels, min/max values, etc.
            option.choices = None
            option.choice_labels = None
            option.min_value = None
            option.max_value = None
            option.step = None
            option.max_length = None
        elif option_type == 'rating':
            # Rating needs min/max values, clear choices if they exist
            option.choices = None
            option.choice_labels = None
            option.max_length = None
        elif option_type in ['single_choice', 'multiple_choice']:
            # Choice types need choices and labels, clear numeric fields
            option.min_value = None
            option.max_value = None
            option.step = None
            option.max_length = None
        elif option_type in ['text', 'notes']:
            # Text types need max_length, clear numeric and choice fields
            option.min_value = None
            option.max_value = None
            option.step = None
            option.choices = None
            option.choice_labels = None
        elif option_type == 'number_input':
            # Number input needs min/max values, clear choice fields
            option.choices = None
            option.choice_labels = None
            option.max_length = None


    @staticmethod
    def update_field_help_text(field_id: int, new_help_text: str) -> None:
        try:
            field = TrackerField.query.filter_by(id=field_id).first()
            if not field:
                raise ValueError("Field not found")
            
            field.help_text = new_help_text
            db.session.commit()
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
            
            # Check if this was the last option in the field
            remaining_options = FieldOption.query.filter_by(
                tracker_field_id=field.id,
                is_active=True
            ).count()
            
            # If field has no options left and it's a custom field, delete the field too
            if remaining_options == 0 and field.field_group == 'custom':
                CategoryService.delete_field_from_category(field.id)
            else:
                db.session.commit()
        except Exception as e:
            db.session.rollback()
            raise
    
    @staticmethod
    def delete_field_from_category(field_id: int) -> None:
        try:
            field = TrackerField.query.filter_by(id=field_id).first()
            if not field:
                raise ValueError("Field not found")
            
            category = TrackerCategory.query.filter_by(id=field.category_id).first()
            if not category:
                raise ValueError("Category not found")
            
            db.session.delete(field)
            db.session.flush()
            
            if category:
                SchemaManager.remove_field_from_schema(category, field.field_name)
            
            db.session.commit()
        except Exception as e:
            db.session.rollback()
            raise


    @staticmethod
    def bulk_delete_options(tracker_field: TrackerField, options_to_delete: List[int]) -> None:
        try:
            category = TrackerCategory.query.filter_by(id=tracker_field.category_id).first()
            
            # Get option names before deletion for schema cleanup
            options_to_remove_names = []
            for option_id in options_to_delete:
                option = FieldOption.query.filter_by(id=option_id).first()
                if not option:
                    raise ValueError("Option not found")
                options_to_remove_names.append(option.option_name)
                db.session.delete(option)
            db.session.flush()
            
            # Remove from schema
            if category:
                for option_name in options_to_remove_names:
                    SchemaManager.remove_option_from_schema(category, tracker_field.field_name, option_name)
            
            # Check if field has any options left
            remaining_options = FieldOption.query.filter_by(
                tracker_field_id=tracker_field.id,
                is_active=True
            ).count()
            
            # If field has no options left and it's a custom field, delete the field too
            if remaining_options == 0 and tracker_field.field_group == 'custom':
                CategoryService.delete_field_from_category(tracker_field.id)
            else:
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
    
    @staticmethod
    def rebuild_category_schema(category_id: int) -> Dict[str, Any]:
        category = TrackerCategory.query.filter_by(id=category_id).first()
        if not category:
            raise ValueError("Category not found")
        
        # Build baseline schema from active baseline fields in database
        baseline_fields = TrackerField.query.filter_by(
            category_id=category_id,
            field_group='baseline',
            is_active=True
        ).order_by(TrackerField.field_order).all()
        
        baseline_schema = {}
        for field in baseline_fields:
            field_options = FieldOption.query.filter_by(
                tracker_field_id=field.id,
                is_active=True
            ).order_by(FieldOption.option_order).all()
            
            field_schema = {}
            for option in field_options:
                option_schema = SchemaManager.build_option_schema(option.to_dict())
                field_schema[option.option_name] = option_schema
            
            baseline_schema[field.field_name] = field_schema
        
        # Build custom schema from active custom fields in database
        custom_fields = TrackerField.query.filter_by(
            category_id=category_id, 
            field_group='custom',
            is_active=True
        ).order_by(TrackerField.field_order).all()
        
        custom_schema = {}
        for field in custom_fields:
            field_options = FieldOption.query.filter_by(
                tracker_field_id=field.id,
                is_active=True
            ).order_by(FieldOption.option_order).all()
            
            field_schema = {}
            for option in field_options:
                option_schema = SchemaManager.build_option_schema(option.to_dict())
                field_schema[option.option_name] = option_schema
            
            custom_schema[field.field_name] = field_schema
        
        rebuilt_schema = {
            "baseline": baseline_schema,
            "custom": custom_schema
        }
        
        category.data_schema = rebuilt_schema
        flag_modified(category, 'data_schema')
        db.session.commit()
        
        return rebuilt_schema
    
    @staticmethod
    def export_tracker_config(category: TrackerCategory) -> Dict[str, Any]:
        return category.data_schema

    @staticmethod
    def toggle_field_active_status(field_id: int) -> None:
        try:
            field = TrackerField.query.filter_by(id=field_id).first()
            if not field:
                raise ValueError("Field not found")
            field.is_active = not field.is_active
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
            option.is_active = not option.is_active
            db.session.commit()
        except Exception as e:
            db.session.rollback()
            raise