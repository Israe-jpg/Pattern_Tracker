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

    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'category_id': self.category_id,
            'created_at': self.created_at.isoformat(),
            'is_default': self.is_default,
            'entries_count': len(self.data)  
        }
    
    def __repr__(self):
        return f'<Tracker {self.id}>'