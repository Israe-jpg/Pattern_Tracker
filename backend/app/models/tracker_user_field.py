from datetime import datetime
from app import db

class TrackerUserField(db.Model):
    """
    User-specific custom fields for prebuilt trackers.
    These fields belong to a specific tracker instance, not the shared category.
    """
    __tablename__ = 'tracker_user_fields'
    
    id = db.Column(db.Integer, primary_key=True)
    tracker_id = db.Column(db.Integer, db.ForeignKey('trackers.id', ondelete='CASCADE'), nullable=False)
    
    # Field identification
    field_name = db.Column(db.String(100), nullable=False)
    parent_id = db.Column(db.Integer, db.ForeignKey('tracker_user_fields.id'), nullable=True)
    field_full_path = db.Column(db.String(200), nullable=True)
    
    # Field configuration
    display_label = db.Column(db.String(200), nullable=True)
    help_text = db.Column(db.Text, nullable=True)
    
    # Ordering
    field_order = db.Column(db.Integer, default=0)
    
    # Metadata
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    is_active = db.Column(db.Boolean, default=True)
    
    # Relationships
    tracker = db.relationship('Tracker', backref='user_fields')
    
    # Self-referencing relationship for parent-child hierarchy
    children = db.relationship('TrackerUserField', 
                              backref=db.backref('parent', remote_side='TrackerUserField.id'),
                              cascade='all, delete-orphan',
                              foreign_keys=[parent_id])
    
    # Relationship with FieldOption - user field options
    options = db.relationship('FieldOption', 
                              foreign_keys='FieldOption.tracker_user_field_id',
                              cascade='all, delete-orphan', 
                              order_by='FieldOption.option_order')
    
    def to_dict(self):
        """Convert to dictionary representation."""
        field_options = []
        if hasattr(self, 'options') and self.options:
            field_options = [option.to_dict() for option in self.options if option.is_active]
        
        return {
            'id': self.id,
            'tracker_id': self.tracker_id,
            'field_name': self.field_name,
            'parent_id': self.parent_id,
            'field_full_path': self.field_full_path,
            'display_label': self.display_label,
            'help_text': self.help_text,
            'field_order': self.field_order,
            'is_active': self.is_active,
            'has_children': len(self.children) > 0 if self.children else False,
            'children_count': len(self.children) if self.children else 0,
            'options': field_options,
            'options_count': len(field_options)
        }
    
    def to_schema_format(self):
        """Convert field and its options to JSON schema format."""
        if not hasattr(self, 'options') or not self.options:
            return {}
        
        schema = {}
        for option in self.options:
            if option.is_active:
                schema[option.option_name] = option.to_schema_format()
        
        return schema
    
    def __repr__(self):
        return f'<TrackerUserField {self.field_name} (Tracker {self.tracker_id})>'

