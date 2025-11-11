from datetime import datetime
from app import db

class Tracker(db.Model):
    __tablename__ = 'trackers'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    category_id = db.Column(db.Integer, db.ForeignKey('tracker_categories.id'), nullable=False)
    data = db.relationship('TrackingData', backref='tracker', lazy=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    is_default = db.Column(db.Boolean, default=False)
    # Tracker model
    settings = db.Column(db.JSON, nullable=True)  # Store tracker-specific configurations

    def to_dict(self):
        return {    
            'id': self.id,
            'user_id': self.user_id,
            'category_id': self.category_id,
            'created_at': self.created_at.isoformat(),
            'is_default': self.is_default,
            'entries_count': len(self.data),
            'settings': self.settings,
            'is_configured': self._is_configured()
        }
    
    def _is_configured(self) -> bool:
        """
        Check if tracker has required configuration.
        For Period Tracker, requires cycle settings.
        For other trackers, always considered configured.
        """
        # Get category to check tracker type
        from app.models.tracker_category import TrackerCategory
        category = TrackerCategory.query.filter_by(id=self.category_id).first()
        
        if not category:
            return False
        
        # Period Tracker requires settings
        if category.name == 'Period Tracker':
            if not self.settings:
                return False
            # Check if essential settings exist
            required_keys = ['average_cycle_length', 'last_period_start_date']
            return all(key in self.settings for key in required_keys)
        
        # Other trackers don't require settings
        return True
    
    def __repr__(self):
        return f'<Tracker {self.id}>'