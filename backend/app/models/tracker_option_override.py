from datetime import datetime
from app import db


class TrackerOptionOverride(db.Model):
    __tablename__ = "tracker_option_overrides"

    id = db.Column(db.Integer, primary_key=True)
    tracker_id = db.Column(
        db.Integer, db.ForeignKey("trackers.id", ondelete="CASCADE"), nullable=False
    )
    field_option_id = db.Column(
        db.Integer, db.ForeignKey("field_options.id", ondelete="CASCADE"), nullable=False
    )

    option_name = db.Column(db.String(100), nullable=True)
    option_order = db.Column(db.Integer, nullable=True)
    is_hidden = db.Column(db.Boolean, nullable=False, default=False)
    is_active = db.Column(db.Boolean, nullable=True)

    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        db.UniqueConstraint(
            "tracker_id",
            "field_option_id",
            name="uq_tracker_option_override_tracker_option",
        ),
    )

