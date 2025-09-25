from datetime import datetime
from app import db

class TrackingData(db.Model):
    __tablename__ = 'tracking_data'
    
    id = db.Column(db.Integer, primary_key=True)
    tracker_id = db.Column(db.Integer, db.ForeignKey('trackers.id'), nullable=False)
    data = db.Column(db.JSON, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    def to_dict(self):
        return {
            'id': self.id,
            'tracker_id': self.tracker_id,
            'data': self.data,
            'created_at': self.created_at.isoformat()
        }
    
    def __repr__(self):
        return f'<TrackingData {self.id}>'