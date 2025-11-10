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
    
    # Import models
    from app.models import User, TrackerCategory, Tracker, TrackerField, FieldOption, TrackingData
    
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