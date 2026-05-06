from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
from flask_cors import CORS
from flask_jwt_extended import JWTManager
from config import config

# Initialize extensions
db = SQLAlchemy()
migrate = Migrate()
jwt = JWTManager()


def _log_jwt_event(event_name, details):
    """Centralized JWT debug logging for auth troubleshooting."""
    try:
        print(f"[JWT_DEBUG] {event_name}: {details}")
    except Exception:
        # Never let debug logging break request handling
        pass

def create_app(config_name='development'):
    """Application factory pattern"""
    app = Flask(__name__)
    
    # Load configuration
    app.config.from_object(config[config_name])
    
    # Initialize extensions with app
    db.init_app(app)
    migrate.init_app(app, db)
    jwt.init_app(app)
    CORS(app)

    @jwt.unauthorized_loader
    def handle_missing_jwt(reason):
        _log_jwt_event("missing_token", reason)
        return {"msg": reason}, 401

    @jwt.invalid_token_loader
    def handle_invalid_jwt(reason):
        _log_jwt_event("invalid_token", reason)
        return {"msg": reason}, 401

    @jwt.expired_token_loader
    def handle_expired_jwt(jwt_header, jwt_payload):
        token_type = jwt_payload.get("type", "unknown")
        subject = jwt_payload.get("sub", "unknown")
        _log_jwt_event(
            "expired_token",
            f"type={token_type}, sub={subject}, header={jwt_header}",
        )
        return {"msg": "Token has expired"}, 401

    @jwt.revoked_token_loader
    def handle_revoked_jwt(jwt_header, jwt_payload):
        token_type = jwt_payload.get("type", "unknown")
        subject = jwt_payload.get("sub", "unknown")
        _log_jwt_event(
            "revoked_token",
            f"type={token_type}, sub={subject}, header={jwt_header}",
        )
        return {"msg": "Token has been revoked"}, 401
    
    # Import models
    from app.models import User, TrackerCategory, Tracker, TrackerField, FieldOption, TrackingData, PeriodCycle
    
    # Register blueprints
    from app.routes.auth import auth_bp
    from app.routes.trackers import trackers_bp
    from app.routes.data_tracking import data_tracking_bp
    app.register_blueprint(auth_bp, url_prefix='/api/auth')
    app.register_blueprint(trackers_bp, url_prefix='/api/trackers')
    app.register_blueprint(data_tracking_bp, url_prefix='/api/data-tracking')
    
    # Initialize prebuilt categories and their fields/options on startup
    with app.app_context():
        try:
            from app.services.category_service import CategoryService
            CategoryService.initialize_prebuilt_categories()
            CategoryService.initialize_period_tracker()
        except Exception as e:
            # Log error but don't crash app startup
            print(f"Warning: Failed to initialize prebuilt categories: {str(e)}")
    
    # Health check endpoint
    @app.route('/api/health')
    def health_check():
        return {'status': 'healthy', 'message': 'Health Tracker API is running'}
    
    return app