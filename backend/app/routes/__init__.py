# Routes package
from .auth import auth_bp
from .trackers import trackers_bp
from .data_tracking import data_tracking_bp

__all__ = ['auth_bp', 'trackers_bp', 'data_tracking_bp']
