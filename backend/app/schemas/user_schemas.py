from marshmallow import Schema, fields, validate, ValidationError, post_load
import re

class UserRegistrationSchema(Schema):
    username = fields.Str(
        required=True,
        validate=[
            validate.Length(min=3, max=80, error="Username must be between 3 and 80 characters"),
            validate.Regexp(
                r'^[a-zA-Z0-9_]+$', 
                error="Username can only contain letters, numbers, and underscores"
            )
        ]
    )
    
    email = fields.Email(
        required=True,
        validate=validate.Length(max=120, error="Email must be less than 120 characters")
    )
    
    password = fields.Str(
        required=True,
        validate=[
            validate.Length(min=8, error="Password must be at least 8 characters"),
        ]
    )
    
    first_name = fields.Str(
        required=False,
        validate=validate.Length(max=50, error="First name must be less than 50 characters"),
        missing=""
    )
    
    last_name = fields.Str(
        required=False,
        validate=validate.Length(max=50, error="Last name must be less than 50 characters"),
        missing=""
    )
    
    @post_load
    def clean_data(self, data, **kwargs):
        """Clean and normalize data after validation"""
        # Strip whitespace
        for key, value in data.items():
            if isinstance(value, str):
                data[key] = value.strip()
        
        # Lowercase email
        if 'email' in data:
            data['email'] = data['email'].lower()
            
        return data
    
    def validate_password_strength(self, password):
        """Custom password strength validation"""
        errors = []
        
        if not re.search(r'[A-Z]', password):
            errors.append("Password must contain at least one uppercase letter")
        
        if not re.search(r'[a-z]', password):
            errors.append("Password must contain at least one lowercase letter")
        
        if not re.search(r'\d', password):
            errors.append("Password must contain at least one number")
        
        if errors:
            raise ValidationError(errors)

class UserLoginSchema(Schema):
    email = fields.Email(
        required=True,
        validate=validate.Email(error="Invalid email address")
    )
    
    password = fields.Str(
        required=True,
        validate=validate.Length(min=8, error="Password must be at least 8 characters")
    )
    
    @post_load
    def clean_data(self, data, **kwargs):
        """Clean and normalize data after validation"""
        # Strip whitespace
        for key, value in data.items():
            if isinstance(value, str):
                data[key] = value.strip()
        return data
    
    
