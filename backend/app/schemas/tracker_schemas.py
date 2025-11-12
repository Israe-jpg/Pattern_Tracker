from marshmallow import Schema, fields, validate, ValidationError, post_load
import re
from datetime import datetime, timedelta

class TrackerFieldSchema(Schema):
    
    field_name = fields.Str(required=True, validate=validate.Length(min=1, max=100))
    field_parent = fields.Str(allow_none=True, validate=validate.Length(max=100))
    field_full_path = fields.Str(allow_none=True, validate=validate.Length(max=200))
    field_type = fields.Str(required=True, validate=validate.OneOf([
        'rating', 'single_choice', 'multiple_choice', 'yes_no', 'number_input', 'notes'
    ]))
    
    # Basic field info
    display_label = fields.Str(allow_none=True, validate=validate.Length(max=200))
    help_text = fields.Str(allow_none=True)
    placeholder = fields.Str(allow_none=True, validate=validate.Length(max=200))
    default_value = fields.Str(allow_none=True)
    is_required = fields.Bool(missing=False)
    is_optional = fields.Bool(missing=True)
    field_group = fields.Str(missing='custom', validate=validate.Length(max=100))
    
    # Type-specific fields (will be validated in post_load)
    min_value = fields.Int(allow_none=True)
    max_value = fields.Int(allow_none=True)
    step = fields.Float(allow_none=True)
    max_length = fields.Int(allow_none=True)
    choices = fields.List(fields.Str(), allow_none=True)
    choice_labels = fields.Dict(allow_none=True)
    validation_rules = fields.Dict(allow_none=True)
    display_options = fields.Dict(allow_none=True)
    
    @post_load
    def validate_field_type_specific(self, data, **kwargs):
        #validate and clean data based an field type
        field_type = data.get('field_type')
        
        # Clear irrelevant fields based on type
        if field_type == 'rating':
            # Rating: needs min_value, max_value, choice_labels
            data.pop('choices', None)  # Remove choices, use range instead
            data.pop('step', None)
            data.pop('max_length', None)
            
            # Validate min/max for ratings
            if data.get('min_value') is None:
                data['min_value'] = 1
            if data.get('max_value') is None:
                data['max_value'] = 10
                
        elif field_type in ['single_choice', 'multiple_choice']:
            # Choice fields: need choices and choice_labels
            data.pop('min_value', None)
            data.pop('max_value', None)
            data.pop('step', None)
            data.pop('max_length', None)
            
            # Validate choices exist
            if not data.get('choices'):
                raise ValidationError('choices are required for choice fields')
                
        elif field_type == 'number_input':
            # Number input: needs min_value, max_value, optional step
            data.pop('choices', None)
            data.pop('choice_labels', None)
            data.pop('max_length', None)
            
        elif field_type == 'notes':
            # Notes: needs max_length
            data.pop('min_value', None)
            data.pop('max_value', None)
            data.pop('step', None)
            data.pop('choices', None)
            data.pop('choice_labels', None)
            
            # Set default max_length if not provided
            if data.get('max_length') is None:
                data['max_length'] = 500
                
        elif field_type == 'yes_no':
            # Yes/No: clean all validation fields
            data.pop('min_value', None)
            data.pop('max_value', None)
            data.pop('step', None)
            data.pop('max_length', None)
            data.pop('choices', None)
            data.pop('choice_labels', None)
            
        return data


class TrackerSchema(Schema):
    name = fields.Str(required=True)
    data_schema = TrackerFieldSchema(many=True)

    @post_load
    def clean_data(self, data, **kwargs):
        # Strip whitespace
        for key, value in data.items():
            if isinstance(value, str):
                data[key] = value.strip()
        return data


class TrackerUpdateSchema(Schema):
    
    data_schema = fields.Dict(required=True)


class TrackerPatchSchema(Schema):
    
    field_updates = fields.Dict(required=True)


class FieldOptionSchema(Schema):
    
    option_name = fields.Str(required=True, validate=[
        validate.Length(min=1, max=100),
        validate.Regexp(r'^[a-z][a-z0-9_]*$', error='Option name must be lowercase, start with letter, and contain only letters, numbers, and underscores')
    ])
    option_type = fields.Str(required=True, validate=validate.OneOf([
        'rating', 'single_choice', 'multiple_choice', 'yes_no', 'number_input', 'text', 'notes'
    ]))
    option_order = fields.Int(missing=0)
    is_required = fields.Bool(missing=False)
    display_label = fields.Str(allow_none=True, validate=validate.Length(max=200))
    help_text = fields.Str(allow_none=True)
    placeholder = fields.Str(allow_none=True, validate=validate.Length(max=200))
    default_value = fields.Str(allow_none=True)
    min_value = fields.Int(allow_none=True)
    max_value = fields.Int(allow_none=True)
    max_length = fields.Int(allow_none=True)
    step = fields.Float(allow_none=True)
    choices = fields.List(fields.Str(), allow_none=True)
    choice_labels = fields.Dict(allow_none=True)
    validation_rules = fields.Dict(allow_none=True)
    display_options = fields.Dict(allow_none=True)


class CustomCategorySchema(Schema):
    
    name = fields.Str(required=True, validate=validate.Length(min=1, max=80))
    custom_fields = fields.List(fields.Nested('CustomFieldSchema'), required=True)


class CustomFieldSchema(Schema):
    field_name = fields.Str(required=True, validate=[
        validate.Length(min=1, max=100),
        validate.Regexp(r'^[a-z][a-z0-9_]*$', error='Field name must be lowercase, start with letter, and contain only letters, numbers, and underscores')
    ])
    display_label = fields.Str(allow_none=True, validate=validate.Length(max=200))
    help_text = fields.Str(allow_none=True)
    options = fields.List(fields.Nested(FieldOptionSchema), required=True, validate=validate.Length(min=1))
    

class MenstruationTrackerSetupSchema(Schema):
    average_cycle_length = fields.Int(required=True, validate=validate.Range(min=21, max=45))
    average_period_length = fields.Int(required=True, validate=validate.Range(min=2, max=10))
    last_period_start_date = fields.Str(required=True)  # ISO format string: "2025-11-01"
    birth_control_method = fields.Str(allow_none=True, validate=validate.OneOf(['none', 'pill', 'iud', 'implant', 'patch', 'ring', 'injection']))
    tracking_ovulation = fields.Bool(missing=False)
    trying_to_conceive = fields.Bool(missing=False)

    @post_load
    def clean_data(self, data, **kwargs):
        # Strip whitespace
        for key, value in data.items():
            if isinstance(value, str):
                data[key] = value.strip()
        return data
