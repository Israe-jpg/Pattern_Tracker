from datetime import datetime, date
from sqlalchemy import event
from sqlalchemy.orm.attributes import flag_modified
from app import db


class TrackingData(db.Model):
    """
    Stores daily tracking entries for user trackers.
    
    Data structure:
    {
        "field_name": {
            "option_name": value,
            "option_name2": value
        }
    }
    """
    __tablename__ = 'tracking_data'
    
    # Primary key and relationships
    id = db.Column(db.Integer, primary_key=True)
    tracker_id = db.Column(
        db.Integer,
        db.ForeignKey('trackers.id', ondelete='CASCADE'),
        nullable=False,
        index=True
    )
    
    # Entry date - the actual date being tracked
    entry_date = db.Column(db.Date, nullable=False, default=date.today, index=True)
    
    # Flexible JSON data structure
    data = db.Column(db.JSON, nullable=False, default=dict)
    
    # AI-generated insights
    ai_insights = db.Column(db.JSON, nullable=True)
    
    # Timestamp when entry was created
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    
    # Indexes and constraints
    __table_args__ = (
        # Composite index for common queries
        db.Index('idx_tracker_entry_date', 'tracker_id', 'entry_date'),
        # Prevent duplicate entries for same tracker and date
        db.UniqueConstraint('tracker_id', 'entry_date', name='uq_tracker_date'),
    )
    
    def to_dict(self):
        return {
            'id': self.id,
            'tracker_id': self.tracker_id,
            'entry_date': self.entry_date.isoformat() if self.entry_date else None,
            'data': self.data or {},
            'ai_insights': self.ai_insights,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }
    
    def __repr__(self):
        return f'<TrackingData {self.id} - Tracker {self.tracker_id} - {self.entry_date}>'


# Event listeners to ensure JSON changes are tracked
@event.listens_for(TrackingData.data, 'set', propagate=True)
def track_data_changes(target, value, oldvalue, initiator):
    """Flag data field as modified for SQLAlchemy."""
    flag_modified(target, 'data')


@event.listens_for(TrackingData.ai_insights, 'set', propagate=True)
def track_insights_changes(target, value, oldvalue, initiator):
    """Flag ai_insights field as modified for SQLAlchemy."""
    flag_modified(target, 'ai_insights')