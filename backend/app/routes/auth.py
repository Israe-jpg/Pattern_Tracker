from flask import Blueprint, request, jsonify, render_template_string
from flask_jwt_extended import create_access_token, create_refresh_token, get_jwt_identity, jwt_required
from marshmallow import ValidationError
from app import db
from app.models.user import User
from app.schemas.user_schemas import UserRegistrationSchema, UserLoginSchema
from app.utils.unit_conversion import (
    convert_weight_to_metric,
    convert_height_to_metric,
    convert_weight_from_metric,
    convert_height_from_metric
)



auth_bp = Blueprint('auth', __name__)

@auth_bp.route('/register', methods=['POST'])
def register():
    try:
        # Get JSON data from request
        data = request.get_json()
        
        # Validate input using schema
        schema = UserRegistrationSchema()
        try:
            validated_data = schema.load(data)
        except ValidationError as err:
            return jsonify({'error': 'Validation failed', 'details': err.messages}), 400
        
        username = validated_data['username']
        email = validated_data['email']
        password = validated_data['password']
        
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
        
        # Validate input using schema
        schema = UserLoginSchema()
        try:
            validated_data = schema.load(data)
        except ValidationError as err:
            return jsonify({'error': 'Validation failed', 'details': err.messages}), 400
        
        email = validated_data['email']  # Already cleaned by schema
        password = validated_data['password']
        
        # Find user by email
        user = User.query.filter_by(email=email).first()
        
        # Check if user exists and password is correct
        if not user or not user.check_password(password):
            return jsonify({'error': 'Invalid email or password'}), 401
        
        
        # Create JWT tokens 
        user_identity = str(user.id)
        access_token = create_access_token(identity=user_identity)
        refresh_token = create_refresh_token(identity=user_identity)
        
        return jsonify({
            'message': 'Login successful',
            'access_token': access_token,
            'refresh_token': refresh_token,
            'user': user.to_dict()
        }), 200
        
    except Exception as e:
        return jsonify({'error': 'Login failed'}), 500

@auth_bp.route('/profile', methods=['GET'])
@jwt_required()
def get_user_profile():
    """
    Get current user's profile with measurements in their preferred unit system.
    """
    try:
        current_user_id = get_jwt_identity()
        user = User.query.filter_by(id=current_user_id).first()
        
        if not user:
            return jsonify({'error': 'User not found'}), 404
        
        return jsonify({
            'message': 'Profile retrieved successfully',
            'user': user.to_dict(include_measurements=True)
        }), 200
    except Exception as e:
        return jsonify({'error': f'Failed to retrieve profile: {str(e)}'}), 500


@auth_bp.route('/logout', methods=['POST'])
@jwt_required()
def logout():
    """
    Logout endpoint - for JWT tokens, this is mainly for client-side cleanup.
    In a stateless JWT system, the client should simply delete the token.
    """
    current_user_id = get_jwt_identity()  
    
    # Since JWT is stateless, we can't truly "logout" server-side without a blacklist
    # For now, it just returns success - client should delete the token
    return jsonify({
        'message': 'Logout successful',
        'user_id': current_user_id,
        'note': 'Please delete the JWT token from client storage'
    }), 200

@auth_bp.route('/refresh', methods=['POST'])
@jwt_required(refresh=True)
def refresh():
    """Issue new access + refresh tokens (rotation extends the session)."""
    current_user_id = get_jwt_identity()
    new_access_token = create_access_token(identity=current_user_id)
    new_refresh_token = create_refresh_token(identity=current_user_id)

    return jsonify({
        'message': 'Token refreshed successfully',
        'access_token': new_access_token,
        'refresh_token': new_refresh_token,
    }), 200

#Get User sex info
@auth_bp.route('/obtain-user-sex-info', methods=['POST'])
@jwt_required()
def get_user_sex_info():
    try:
        data = request.get_json()
        gender = data.get('gender')
        if not gender:
            return jsonify({'error': 'Gender is required'}), 400
        current_user_id = get_jwt_identity()
        user = User.query.filter_by(id=current_user_id).first()
        if not user:
            return jsonify({'error': 'User not found'}), 404
        user.gender = gender
        db.session.commit()
    except Exception as e:
        return jsonify({'error': 'Failed to obtain user sex info'}), 500
    return jsonify({'message': 'User sex info obtained successfully'}), 200

#Get optional additional user data
@auth_bp.route('/obtain-optional-user-info', methods=['POST'])
@jwt_required()
def obtain_optional_user_info():
    """
    Update user profile information (username, height, weight, DOB, unit preference).
    Height and weight are automatically converted to metric for storage.
    """
    try:
        data = request.get_json()
        current_user_id = get_jwt_identity()
        user = User.query.filter_by(id=current_user_id).first()
        if not user:
            return jsonify({'error': 'User not found'}), 404
        
        # Update username if provided and different from current
        if data.get('username') and data.get('username').strip():
            new_username = data.get('username').strip()
            if new_username != user.username:
                # Check if username is already taken by another user
                existing_user = User.query.filter_by(username=new_username).first()
                if existing_user and existing_user.id != user.id:
                    return jsonify({'error': 'Username already taken'}), 400
                user.username = new_username
        
        # Update unit system preference (must come before height/weight conversion)
        unit_system = data.get('unit_system', user.unit_system or 'metric')
        if unit_system not in ['metric', 'imperial']:
            return jsonify({'error': 'Invalid unit_system. Must be "metric" or "imperial"'}), 400
        user.unit_system = unit_system
        
        # Update date of birth
        if data.get('date_of_birth'):
            user.date_of_birth = data.get('date_of_birth')
        
        # Convert and store height (always stored as cm in DB)
        if data.get('height') is not None:
            user.height = convert_height_to_metric(data.get('height'), unit_system)
        
        # Convert and store weight (always stored as kg in DB)
        if data.get('weight') is not None:
            user.weight = convert_weight_to_metric(data.get('weight'), unit_system)
        
        db.session.commit()
        
        return jsonify({
            'message': 'Optional user info updated successfully',
            'user': user.to_dict(include_measurements=True)
        }), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': f'Failed to update user info: {str(e)}'}), 500


@auth_bp.route('/delete-account', methods=['DELETE'])
@jwt_required()
def delete_account():
    """
    Permanently delete the authenticated user's account and all associated data.
    Requires a valid JWT access token.
    """
    try:
        current_user_id = get_jwt_identity()
        user = User.query.filter_by(id=current_user_id).first()

        if not user:
            return jsonify({'error': 'User not found'}), 404

        db.session.delete(user)
        db.session.commit()

        return jsonify({'message': 'Account and all associated data have been permanently deleted.'}), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': f'Failed to delete account: {str(e)}'}), 500


_DELETE_PAGE_HTML = """
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Delete Account – Health Tracker</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #f5f7fa;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 24px;
    }
    .card {
      background: #fff;
      border-radius: 16px;
      box-shadow: 0 4px 24px rgba(0,0,0,0.08);
      max-width: 480px;
      width: 100%;
      padding: 40px 36px;
    }
    .icon { font-size: 48px; text-align: center; margin-bottom: 16px; }
    h1 { font-size: 22px; font-weight: 700; color: #1a1a2e; text-align: center; margin-bottom: 8px; }
    .subtitle { font-size: 14px; color: #666; text-align: center; margin-bottom: 28px; line-height: 1.5; }
    label { display: block; font-size: 13px; font-weight: 600; color: #444; margin-bottom: 6px; }
    input[type=email], input[type=password] {
      width: 100%;
      padding: 12px 14px;
      border: 1.5px solid #e0e0e0;
      border-radius: 10px;
      font-size: 14px;
      margin-bottom: 16px;
      outline: none;
      transition: border-color 0.2s;
    }
    input:focus { border-color: #e05a5a; }
    .warning {
      background: #fff3f3;
      border: 1px solid #f8c6c6;
      border-radius: 10px;
      padding: 12px 14px;
      font-size: 13px;
      color: #c0392b;
      margin-bottom: 20px;
      line-height: 1.5;
    }
    button {
      width: 100%;
      padding: 14px;
      background: #e05a5a;
      color: #fff;
      border: none;
      border-radius: 10px;
      font-size: 15px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.2s;
    }
    button:hover { background: #c0392b; }
    .success {
      background: #f0fff4;
      border: 1px solid #b2f2c6;
      border-radius: 10px;
      padding: 16px;
      color: #217a4a;
      font-size: 14px;
      text-align: center;
      display: none;
    }
    .error-msg {
      color: #c0392b;
      font-size: 13px;
      margin-bottom: 12px;
      display: none;
    }
    .data-list { font-size: 13px; color: #555; margin: 0 0 20px 18px; line-height: 1.8; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">⚠️</div>
    <h1>Delete Your Account</h1>
    <p class="subtitle">Health Tracker &mdash; Account &amp; Data Deletion</p>

    <div class="warning">
      This action is <strong>permanent and cannot be undone</strong>. All your data will be deleted immediately.
    </div>

    <p style="font-size:13px;color:#444;margin-bottom:8px;font-weight:600;">Data that will be deleted:</p>
    <ul class="data-list">
      <li>Your account and profile information</li>
      <li>All health tracking data and logs</li>
      <li>Custom trackers and settings</li>
      <li>Period cycle and wellness data</li>
    </ul>

    <div id="errorMsg" class="error-msg"></div>

    <form id="deleteForm">
      <label for="email">Email address</label>
      <input type="email" id="email" placeholder="you@example.com" required />

      <label for="password">Password</label>
      <input type="password" id="password" placeholder="Your password" required />

      <button type="submit">Permanently Delete My Account</button>
    </form>

    <div id="successMsg" class="success">
      ✅ Your account and all associated data have been permanently deleted.
    </div>
  </div>

  <script>
    const form = document.getElementById('deleteForm');
    const errorMsg = document.getElementById('errorMsg');
    const successMsg = document.getElementById('successMsg');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errorMsg.style.display = 'none';

      const email = document.getElementById('email').value.trim();
      const password = document.getElementById('password').value;

      try {
        const loginRes = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });
        const loginData = await loginRes.json();

        if (!loginRes.ok) {
          errorMsg.textContent = loginData.error || 'Invalid email or password.';
          errorMsg.style.display = 'block';
          return;
        }

        const deleteRes = await fetch('/api/auth/delete-account', {
          method: 'DELETE',
          headers: { 'Authorization': 'Bearer ' + loginData.access_token }
        });
        const deleteData = await deleteRes.json();

        if (!deleteRes.ok) {
          errorMsg.textContent = deleteData.error || 'Failed to delete account. Please try again.';
          errorMsg.style.display = 'block';
          return;
        }

        form.style.display = 'none';
        successMsg.style.display = 'block';

      } catch (err) {
        errorMsg.textContent = 'Network error. Please check your connection and try again.';
        errorMsg.style.display = 'block';
      }
    });
  </script>
</body>
</html>
"""


@auth_bp.route('/delete-account-page', methods=['GET'])
def delete_account_page():
    """Serves the account deletion web page required by Google Play Store."""
    return render_template_string(_DELETE_PAGE_HTML)