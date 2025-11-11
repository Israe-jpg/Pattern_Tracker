from datetime import datetime
from werkzeug.security import generate_password_hash, check_password_hash
from app import db

class User(db.Model):
    __tablename__ = 'users'
    
    # Primary key
    id = db.Column(db.Integer, primary_key=True)
    
    # Authentication fields
    username = db.Column(db.String(80), unique=True, nullable=False, index=True)
    email = db.Column(db.String(120), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    
    # Profile fields
    first_name = db.Column(db.String(50), nullable=True)
    last_name = db.Column(db.String(50), nullable=True)
    date_of_birth = db.Column(db.Date, nullable=True)
    gender = db.Column(db.String(20), nullable=True)
    height = db.Column(db.Float, nullable=True)
    weight = db.Column(db.Float, nullable=True)
    
    # unit system
    unit_system = db.Column(db.String(10), default='metric')  # 'metric' or 'imperial'

    # Timestamps
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    is_active = db.Column(db.Boolean, default=True)
    
    def set_password(self, password):
        """Hash and set password"""
        self.password_hash = generate_password_hash(password)
    
    def check_password(self, password):
        """Check if provided password matches hash"""
        return check_password_hash(self.password_hash, password)
    
    def to_dict(self, include_measurements=False):
        
        base_dict = {
            'id': self.id,
            'username': self.username,
            'email': self.email,
            'first_name': self.first_name,
            'last_name': self.last_name,
            'created_at': self.created_at.isoformat(),
            'is_active': self.is_active
        }
        
        if include_measurements:
            from app.utils.unit_conversion import (
                convert_weight_from_metric,
                convert_height_from_metric,
                get_weight_unit,
                get_height_unit
            )
            
            unit_system = self.unit_system or 'metric'
            
            base_dict.update({
                'gender': self.gender,
                'date_of_birth': self.date_of_birth.isoformat() if self.date_of_birth else None,
                'weight': convert_weight_from_metric(self.weight, unit_system),
                'height': convert_height_from_metric(self.height, unit_system),
                'unit_system': unit_system,
                'weight_unit': get_weight_unit(unit_system),
                'height_unit': get_height_unit(unit_system)
            })
        
        return base_dict
    
    def __repr__(self):
        return f'<User {self.username}>'