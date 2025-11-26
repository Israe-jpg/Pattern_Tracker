from datetime import datetime, date
from app import db


class PeriodCycle(db.Model):
    """
    Model to track individual period cycles for a tracker.
    Each cycle represents one complete menstrual cycle from period start to next period start.
    """
    __tablename__ = 'period_cycles'

    id = db.Column(db.Integer, primary_key=True)
    tracker_id = db.Column(db.Integer, db.ForeignKey('trackers.id'), nullable=False)

    # Cycle dates
    cycle_start_date = db.Column(db.Date, nullable=False, index=True)
    cycle_end_date = db.Column(db.Date, nullable=True)  # Null until next period starts

    # Period within this cycle
    period_start_date = db.Column(db.Date, nullable=False)
    period_end_date = db.Column(db.Date, nullable=True)  # Calculated when flow stops

    # Calculated metrics
    cycle_length = db.Column(db.Integer, nullable=True)  # Days (calculated when cycle ends)
    period_length = db.Column(db.Integer, nullable=True)  # Days (calculated when period ends)

    # Predictions made at start of this cycle
    predicted_ovulation_date = db.Column(db.Date, nullable=True)
    predicted_next_period_date = db.Column(db.Date, nullable=True)

    # Timestamps
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    tracker = db.relationship('Tracker', backref='period_cycles')

    def __repr__(self):
        return f'<PeriodCycle {self.id} tracker={self.tracker_id} start={self.cycle_start_date}>'

    @property
    def is_complete(self) -> bool:
        """Check if cycle is complete (next period has started)."""
        return self.cycle_end_date is not None

    @property
    def is_current(self) -> bool:
        """Check if this is the current active cycle."""
        return self.cycle_end_date is None

    def to_dict(self):
        """Convert to dictionary for API responses."""
        return {
            'id': self.id,
            'tracker_id': self.tracker_id,
            'cycle_start_date': self.cycle_start_date.isoformat() if self.cycle_start_date else None,
            'cycle_end_date': self.cycle_end_date.isoformat() if self.cycle_end_date else None,
            'period_start_date': self.period_start_date.isoformat() if self.period_start_date else None,
            'period_end_date': self.period_end_date.isoformat() if self.period_end_date else None,
            'cycle_length': self.cycle_length,
            'period_length': self.period_length,
            'predicted_ovulation_date': self.predicted_ovulation_date.isoformat() if self.predicted_ovulation_date else None,
            'predicted_next_period_date': self.predicted_next_period_date.isoformat() if self.predicted_next_period_date else None,
            'is_complete': self.is_complete,
            'is_current': self.is_current,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }

