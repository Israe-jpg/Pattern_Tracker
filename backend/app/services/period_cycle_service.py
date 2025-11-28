"""
specialized service for cycle operations
"""

from app.models.period_cycle import PeriodCycle
from app.models.tracker import Tracker
from app.models.tracking_data import TrackingData
from app.models.tracker_category import TrackerCategory
from app.models.tracker_field import TrackerField
from app.models.tracker_user_field import TrackerUserField
from app.models.field_option import FieldOption
from app.models.tracker_user import TrackerUser
from app.models.tracker_user_role import TrackerUserRole
from app.models.tracker_user_permission import TrackerUserPermission

class PeriodCycleService:
    @staticmethod
    def get_tracker_settings(tracker_id: int) -> Dict[str, Any]:
        try:
            tracker = Tracker.query.get(tracker_id)
            if not tracker:
                raise ValueError(f"Tracker {tracker_id} not found")
            settings = tracker.settings or {}
            return {
                'average_cycle_length': settings.get('average_cycle_length', 28),
                'average_period_length': settings.get('average_period_length', 5),
                'last_period_start_date': settings.get('last_period_start_date')
                **settings
            }
        except Exception as e:
            raise ValueError(f"Failed to get tracker settings: {str(e)}")

    
    