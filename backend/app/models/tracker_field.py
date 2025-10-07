from datetime import datetime
from app import db

class TrackerField(db.Model):
    __tablename__ = 'tracker_fields'
    
    id = db.Column(db.Integer, primary_key=True)
    category_id = db.Column(db.Integer, db.ForeignKey('tracker_categories.id'), nullable=False)
    
    # Field identification - simplified for the new structure
    field_name = db.Column(db.String(100), nullable=False)              # "Mood", "Sleep", "Energy"
    field_parent = db.Column(db.String(100), nullable=True)             # "discharge" (for nested fields) - DEPRECATED
    parent_id = db.Column(db.Integer, db.ForeignKey('tracker_fields.id'), nullable=True) #Proper parent relationship
    field_full_path = db.Column(db.String(200), nullable=True)          # "discharge.amount"
    
    # Field configuration - basic info only, options handled by FieldOption model
    display_label = db.Column(db.String(200), nullable=True)    # "How was your mood today?"
    help_text = db.Column(db.Text, nullable=True)               # "Track your daily mood patterns"
    
    # Ordering and grouping
    field_order = db.Column(db.Integer, default=0)
    field_group = db.Column(db.String(100), nullable=True)  # 'baseline', 'custom', etc.
    
    # Metadata
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    is_active = db.Column(db.Boolean, default=True)
    
    # Relationships
    category = db.relationship('TrackerCategory', backref='fields')
    
    # Self-referencing relationship for parent-child hierarchy
    children = db.relationship('TrackerField', 
                              backref=db.backref('parent', remote_side='TrackerField.id'),
                              cascade='all, delete-orphan',
                              foreign_keys=[parent_id])
    
    # Relationship with FieldOption - this is where the actual field options are stored
    options = db.relationship('FieldOption', backref='parent_field', cascade='all, delete-orphan', order_by='FieldOption.option_order')
    
    def to_dict(self):
        # Get all active options for this field
        field_options = []
        if hasattr(self, 'options') and self.options:
            field_options = [option.to_dict() for option in self.options if option.is_active]
        
        return {
            'id': self.id,
            'field_name': self.field_name,
            'field_parent': self.field_parent,  # Keep for backward compatibility
            'parent_id': self.parent_id,
            'field_full_path': self.field_full_path,
            'display_label': self.display_label,
            'help_text': self.help_text,
            'field_order': self.field_order,
            'field_group': self.field_group,
            'is_active': self.is_active,
            'has_children': len(self.children) > 0 if self.children else False,
            'children_count': len(self.children) if self.children else 0,
            'options': field_options,  # NEW: Include all field options
            'options_count': len(field_options)
        }
    
    def to_schema_format(self):
        """Convert field and its options to JSON schema format"""
        if not hasattr(self, 'options') or not self.options:
            return {}
        
        schema = {}
        
        # Build schema from field options
        for option in self.options:
            if option.is_active:
                schema[option.option_name] = option.to_schema_format()
        
        return schema
    
    def add_option(self, option_name, option_type, **kwargs):
        """Add a new option to this field"""
        from app.models.field_option import FieldOption
        
        option = FieldOption(
            tracker_field_id=self.id,
            option_name=option_name,
            option_type=option_type,
            **kwargs
        )
        
        return option
    
    # NEW: Helper methods for parent-child operations
    def is_parent(self):
        """Check if this field is a parent/container field"""
        return len(self.children) > 0 if self.children else False
    
    def is_child(self):
        """Check if this field has a parent"""
        return self.parent_id is not None
    
    def get_all_children(self, include_inactive=False):
        """Get all direct children of this field"""
        query = TrackerField.query.filter_by(parent_id=self.id)
        if not include_inactive:
            query = query.filter_by(is_active=True)
        return query.order_by(TrackerField.field_order).all()
    
    def get_all_descendants(self, include_inactive=False):
        """Get all descendants (children, grandchildren, etc.) recursively"""
        descendants = []
        children = self.get_all_children(include_inactive)
        for child in children:
            descendants.append(child)
            descendants.extend(child.get_all_descendants(include_inactive))
        return descendants
    
    def get_root_parent(self):
        """Get the top-level parent field"""
        if self.parent is None:
            return self
        return self.parent.get_root_parent()
    
    def get_field_path(self):
        """Generate the full field path (e.g., 'symptoms.physical.cramps')"""
        if self.parent is None:
            return self.field_name
        return f"{self.parent.get_field_path()}.{self.field_name}"
    
    def update_field_full_path(self):
        """Update the field_full_path based on current hierarchy"""
        self.field_full_path = self.get_field_path()
        # Update all descendants as well
        for child in self.get_all_children(include_inactive=True):
            child.update_field_full_path()
    
    def can_be_deleted(self):
        """Check if field can be safely deleted"""
        # Container fields with children cannot be deleted unless children are handled
        if self.is_parent() and len(self.get_all_children(include_inactive=True)) > 0:
            return False, "Cannot delete parent field with children. Delete children first or use cascade delete."
        return True, "Field can be deleted"
    
    def delete_with_children(self):
        """Delete this field and all its descendants"""
        from app import db
        # The cascade='all, delete-orphan' in the relationship will handle this automatically
        db.session.delete(self)
        return True
    
    @classmethod
    def get_root_fields_for_category(cls, category_id, include_inactive=False):
        """Get all root-level fields (no parent) for a category"""
        query = cls.query.filter_by(category_id=category_id, parent_id=None)
        if not include_inactive:
            query = query.filter_by(is_active=True)
        return query.order_by(cls.field_order).all()
    
    @classmethod
    def get_field_hierarchy_for_category(cls, category_id, include_inactive=False):
        """Get complete field hierarchy for a category as nested dict"""
        root_fields = cls.get_root_fields_for_category(category_id, include_inactive)
        
        def build_hierarchy(field):
            field_dict = field.to_dict()
            children = field.get_all_children(include_inactive)
            if children:
                field_dict['children'] = [build_hierarchy(child) for child in children]
            return field_dict
        
        return [build_hierarchy(field) for field in root_fields]
    
    def __repr__(self):
        return f'<TrackerField {self.field_name}>'
