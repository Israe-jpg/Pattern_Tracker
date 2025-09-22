from flask import Blueprint, request, jsonify
from flask_jwt_extended import create_access_token, create_refresh_token
from app import db
from app.models.user import User



auth_bp = Blueprint('auth', __name__)

@auth_bp.route('/register', methods=['POST'])
def register():
    try:
        # Get JSON data from request
        data = request.get_json()
        
        # Basic validation
        if not data:
            return jsonify({'error': 'No data provided'}), 400
        
        if not data.get('username'):
            return jsonify({'error': 'Username is required'}), 400
            
        if not data.get('email'):
            return jsonify({'error': 'Email is required'}), 400
            
        if not data.get('password'):
            return jsonify({'error': 'Password is required'}), 400
        
        username = data['username'].strip()
        email = data['email'].strip().lower()
        password = data['password']
        
        # Check if user already exists
        if User.query.filter_by(username=username).first():
            return jsonify({'error': 'Username already exists'}), 409
        
        if User.query.filter_by(email=email).first():
            return jsonify({'error': 'Email already exists'}), 409
        
        # Create new user
        user = User(
            username=username,
            email=email,
            first_name=data.get('first_name', '').strip(),
            last_name=data.get('last_name', '').strip()
        )
        user.set_password(password)
        
        # Save to database
        db.session.add(user)
        db.session.commit()
        
        return jsonify({
            'message': 'User registered successfully',
            'user': user.to_dict()
        }), 201
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': 'Registration failed'}), 500

@auth_bp.route('/login', methods=['POST'])
def login():
    try:
        # Get JSON data from request
        data = request.get_json()
        
        # Basic validation
        if not data:
            return jsonify({'error': 'No data provided'}), 400
        
        if not data.get('email'):
            return jsonify({'error': 'Email is required'}), 400
            
        if not data.get('password'):
            return jsonify({'error': 'Password is required'}), 400
        
        email = data['email'].strip().lower()
        password = data['password']
        
        # Find user by email
        user = User.query.filter_by(email=email).first()
        
        # Check if user exists and password is correct
        if not user or not user.check_password(password):
            return jsonify({'error': 'Invalid email or password'}), 401
        
        
        # Create JWT tokens
        access_token = create_access_token(identity=user.id)
        refresh_token = create_refresh_token(identity=user.id)
        
        return jsonify({
            'message': 'Login successful',
            'access_token': access_token,
            'refresh_token': refresh_token,
            'user': user.to_dict()
        }), 200
        
    except Exception as e:
        return jsonify({'error': 'Login failed'}), 500