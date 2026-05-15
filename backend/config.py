import os
from datetime import timedelta
from dotenv import load_dotenv

load_dotenv()

class Config:
    SECRET_KEY = os.environ.get('SECRET_KEY') or 'dev-secret-key-change-in-production'
    
    # Database
    SQLALCHEMY_DATABASE_URI = os.environ.get('DATABASE_URL')
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    
    # JWT Configuration
    JWT_SECRET_KEY = os.environ.get('JWT_SECRET_KEY') or 'jwt-secret-key-change-in-production'
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(hours=1)
    # Sliding window: each /auth/refresh issues a new refresh token (rotation),
    # so the 90-day clock resets whenever the app is used.
    # Inactive users expire naturally after 90 days of no use.
    # Override with JWT_REFRESH_TOKEN_EXPIRES_DAYS in .env if needed.
    _refresh_days = os.environ.get('JWT_REFRESH_TOKEN_EXPIRES_DAYS')
    JWT_REFRESH_TOKEN_EXPIRES = timedelta(days=int(_refresh_days) if _refresh_days else 90)
    
    # Flask settings
    DEBUG = False
    TESTING = False

class DevelopmentConfig(Config):
    DEBUG = True

class ProductionConfig(Config):
    DEBUG = False

class TestingConfig(Config):
    TESTING = True
    SQLALCHEMY_DATABASE_URI = os.environ.get('TEST_DATABASE_URL')

config = {
    'development': DevelopmentConfig,
    'production': ProductionConfig,
    'testing': TestingConfig,
    'default': DevelopmentConfig
}
