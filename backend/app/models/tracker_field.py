from datetime import datetime
from app import db

class TrackerField(db.Model):
    __tablename__ = 'tracker_fields'
    
    id = db.Column(db.Integer, primary_key=True)
    category_id = db.Column(db.Integer, db.ForeignKey('tracker_categories.id'), nullable=False)
    
    # Field identification
    field_name = db.Column(db.String(100), nullable=False)              # "amount"
    field_parent = db.Column(db.String(100), nullable=True)             # "discharge" (for nested fields)
    field_full_path = db.Column(db.String(200), nullable=True)          # "discharge.amount"
    field_type = db.Column(db.String(50), nullable=False, default='single_choice')  # Most fields are single choice
    
    # Field configuration  
    is_required = db.Column(db.Boolean, default=False)                  # True = required, False = optional
    is_optional = db.Column(db.Boolean, default=True)                   # True = optional (matches JSON structure)
    display_label = db.Column(db.String(200), nullable=True)    # "How was your sleep?"
    help_text = db.Column(db.Text, nullable=True)               # "Rate from 1-10 where..."
    placeholder = db.Column(db.String(200), nullable=True)      # "Select rating..."
    default_value = db.Column(db.Text, nullable=True)           # Default value
    
    # Validation rules - specific fields for common validations
    min_value = db.Column(db.Integer, nullable=True)            # For numbers/ratings
    max_value = db.Column(db.Integer, nullable=True)            # For numbers/ratings  
    max_length = db.Column(db.Integer, nullable=True)           # For text fields
    step = db.Column(db.Float, nullable=True)                   # For decimal inputs
    
    # Choice management for multiple choice/enum fields
    choices = db.Column(db.JSON, nullable=True)                 # ["option1", "option2"]
    choice_labels = db.Column(db.JSON, nullable=True)           # {"option1": "Label 1"}
    
    # Advanced options (for complex cases)
    validation_rules = db.Column(db.JSON, nullable=True)        # Complex validation
    display_options = db.Column(db.JSON, nullable=True)         # Complex display options   
    
    # Ordering and grouping
    field_order = db.Column(db.Integer, default=0)
    field_group = db.Column(db.String(100), nullable=True)  # 'baseline', 'custom', etc.
    
    # Metadata
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    is_active = db.Column(db.Boolean, default=True)
    
    # Relationships
    category = db.relationship('TrackerCategory', backref='fields')
    
    # Field type mappings
    FIELD_TYPE_MAPPING = {
        'rating': 'integer',           # 1-10 scales with labels
        'single_choice': 'string',     # Pick one option from enum
        'multiple_choice': 'array',    # Pick multiple options
        'yes_no': 'boolean',          # True/False
        'number_input': 'integer',     # Free number input (rare)
        'notes': 'string'             # Free text (very rare, like notes fields)
    }
    
    FIELD_TYPE_LABELS = {
        'rating': 'Rating Scale (1-10)',
        'single_choice': 'Single Choice (pick one)',
        'multiple_choice': 'Multiple Choice (pick many)', 
        'yes_no': 'Yes/No',
        'number_input': 'Number Input',
        'notes': 'Notes (free text)'
    }
    
    def to_dict(self):
        return {
            'id': self.id,
            'field_name': self.field_name,
            'field_parent': self.field_parent,
            'field_full_path': self.field_full_path,
            'field_type': self.field_type,
            'field_type_label': self.FIELD_TYPE_LABELS.get(self.field_type, self.field_type),
            'is_required': self.is_required,
            'is_optional': self.is_optional,
            'display_label': self.display_label,
            'help_text': self.help_text,
            'placeholder': self.placeholder,
            'default_value': self.default_value,
            'min_value': self.min_value,
            'max_value': self.max_value,
            'max_length': self.max_length,
            'step': self.step,
            'choices': self.choices,
            'choice_labels': self.choice_labels,
            'validation_rules': self.validation_rules,
            'display_options': self.display_options,
            'field_order': self.field_order,
            'field_group': self.field_group,
            'is_active': self.is_active
        }
    
    def to_schema_format(self):
        # Convert user-friendly type to technical type
        technical_type = self.FIELD_TYPE_MAPPING.get(self.field_type, 'string')
        
        schema = {
            'type': technical_type,
            'optional': self.is_optional  # Match JSON structure
        }
        
        # Add enum/choices
        if self.choices:
            schema['enum'] = self.choices
            
        # Add labels
        if self.choice_labels:
            schema['labels'] = self.choice_labels
            
        # Add range for numbers/ratings
        if self.min_value is not None and self.max_value is not None:
            schema['range'] = [self.min_value, self.max_value]
            
        # Add max_length for strings
        if self.max_length:
            schema['max_length'] = self.max_length
            
        # Add step for decimals
        if self.step:
            schema['step'] = self.step
            
        # Add any additional validation rules
        if self.validation_rules:
            schema.update(self.validation_rules)
            
        # Add any additional display options
        if self.display_options:
            schema.update(self.display_options)
            
        return schema
    
    @classmethod
    def get_available_field_types(cls):
        """Get all available field types with labels"""
        return [
            {'value': field_type, 'label': label}
            for field_type, label in cls.FIELD_TYPE_LABELS.items()
        ]
    
    def __repr__(self):
        return f'<TrackerField {self.field_name}>'
