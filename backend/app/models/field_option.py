from datetime import datetime
from app import db

class FieldOption(db.Model):
    __tablename__ = 'field_options'
    
    id = db.Column(db.Integer, primary_key=True)
    tracker_field_id = db.Column(db.Integer, db.ForeignKey('tracker_fields.id'), nullable=True)
    tracker_user_field_id = db.Column(db.Integer, db.ForeignKey('tracker_user_fields.id'), nullable=True)
    
    # Ensure at least one field reference exists
    __table_args__ = (
        db.CheckConstraint(
            '(tracker_field_id IS NOT NULL) OR (tracker_user_field_id IS NOT NULL)',
            name='check_field_reference'
        ),
    )
    
    # Option identification
    option_name = db.Column(db.String(100), nullable=False)  # "overall mood", "mood notes"
    option_type = db.Column(db.String(50), nullable=False)   # "rating", "text", "single_choice", etc.
    option_order = db.Column(db.Integer, default=0)          # For ordering options within a field
    
    # Option configuration
    is_required = db.Column(db.Boolean, default=False)
    display_label = db.Column(db.String(200), nullable=True)  # "How was your overall mood?"
    help_text = db.Column(db.Text, nullable=True)
    placeholder = db.Column(db.String(200), nullable=True)
    default_value = db.Column(db.Text, nullable=True)
    
    # Validation rules
    min_value = db.Column(db.Integer, nullable=True)
    max_value = db.Column(db.Integer, nullable=True)
    max_length = db.Column(db.Integer, nullable=True)
    step = db.Column(db.Float, nullable=True)
    
    # Choice management
    choices = db.Column(db.JSON, nullable=True)              # ["option1", "option2"]
    choice_labels = db.Column(db.JSON, nullable=True)        # {"option1": "Label 1"}
    
    # Advanced options
    validation_rules = db.Column(db.JSON, nullable=True)
    display_options = db.Column(db.JSON, nullable=True)
    
    # Metadata
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    is_active = db.Column(db.Boolean, default=True)
    
    # Relationships
    tracker_field = db.relationship('TrackerField', foreign_keys=[tracker_field_id])
    tracker_user_field = db.relationship('TrackerUserField', foreign_keys=[tracker_user_field_id])
    
    @property
    def parent_field(self):
        """Get the parent field (either TrackerField or TrackerUserField)."""
        return self.tracker_field or self.tracker_user_field
    
    # Option type mappings
    OPTION_TYPE_MAPPING = {
        'rating': 'integer',           # 1-10 scales with labels
        'single_choice': 'string',     # Pick one option from enum
        'multiple_choice': 'array',    # Pick multiple options
        'yes_no': 'boolean',          # True/False
        'number_input': 'integer',     # Free number input
        'text': 'string',             # Free text
        'notes': 'string'             # Free text (longer)
    }
    
    OPTION_TYPE_LABELS = {
        'rating': 'Rating Scale (1-10)',
        'single_choice': 'Single Choice (pick one)',
        'multiple_choice': 'Multiple Choice (pick many)', 
        'yes_no': 'Yes/No',
        'number_input': 'Number Input',
        'text': 'Text Input',
        'notes': 'Notes (free text)'
    }
    
    def to_dict(self):
        return {
            'id': self.id,
            'tracker_field_id': self.tracker_field_id,
            'tracker_user_field_id': self.tracker_user_field_id,
            'option_name': self.option_name,
            'option_type': self.option_type,
            'option_type_label': self.OPTION_TYPE_LABELS.get(self.option_type, self.option_type),
            'option_order': self.option_order,
            'is_required': self.is_required,
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
            'is_active': self.is_active
        }
    
    def to_schema_format(self):
        """Convert to JSON schema format"""
        technical_type = self.OPTION_TYPE_MAPPING.get(self.option_type, 'string')
        
        schema = {
            'type': technical_type,
            'optional': not self.is_required
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
    def get_available_option_types(cls):
        """Get all available option types with labels"""
        return [
            {'value': option_type, 'label': label}
            for option_type, label in cls.OPTION_TYPE_LABELS.items()
        ]
    
    def __repr__(self):
        return f'<FieldOption {self.option_name} ({self.option_type})>'
