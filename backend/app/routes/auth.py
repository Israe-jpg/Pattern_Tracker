from flask import Blueprint, request, jsonify
from marshmallow import ValidationError
from app import db
from app.models.user import User
from app.schemas import UserRegistrationSchema

auth_bp = Blueprint('auth', __name__)

@auth_bp.route('/register', methods=['POST'])
def register():
    schema = UserRegistrationSchema()
    
    try:
        # Validate and deserialize input
        data = schema.load(request.get_json() or {})
        
        # Check if user already exists
        if User.query.filter_by(username=data['username']).first():
            return jsonify({
                'error': 'Validation failed',
                'details': {'username': ['Username already exists']}
            }), 409
        
        if User.query.filter_by(email=data['email']).first():
            return jsonify({
                'error': 'Validation failed',
                'details': {'email': ['Email already exists']}
            }), 409
        
        # Create new user
        user = User(
            username=data['username'],
            email=data['email'],
            first_name=data['first_name'],
            last_name=data['last_name']
        )
        user.set_password(data['password'])
        
        # Save to database
        db.session.add(user)
        db.session.commit()
        
        return jsonify({
            'message': 'User registered successfully',
            'user': user.to_dict()
        }), 201
        
    except ValidationError as e:
        return jsonify({
            'error': 'Validation failed',
            'details': e.messages
        }), 400
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': 'Registration failed'}), 500
