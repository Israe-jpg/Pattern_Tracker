from datetime import datetime
from app import db


class TrackerFieldOverride(db.Model):
    __tablename__ = "tracker_field_overrides"

    id = db.Column(db.Integer, primary_key=True)
    tracker_id = db.Column(
        db.Integer, db.ForeignKey("trackers.id", ondelete="CASCADE"), nullable=False
    )
    tracker_field_id = db.Column(
        db.Integer, db.ForeignKey("tracker_fields.id", ondelete="CASCADE"), nullable=False
    )

    display_label = db.Column(db.String(200), nullable=True)
    field_order = db.Column(db.Integer, nullable=True)
    is_hidden = db.Column(db.Boolean, nullable=False, default=False)
    is_active = db.Column(db.Boolean, nullable=True)

    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        db.UniqueConstraint(
            "tracker_id",
            "tracker_field_id",
            name="uq_tracker_field_override_tracker_field",
        ),
    )

