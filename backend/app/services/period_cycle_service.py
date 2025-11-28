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
from datetime import date
from typing import Dict, Any

class PeriodCycleService:
    @staticmethod
    def get_tracker_settings(tracker_id: int) -> Dict[str, Any]:
        try:
            settings = tracker.settings or {}
            return {
                'average_cycle_length': settings.get('average_cycle_length', 28),
                'average_period_length': settings.get('average_period_length', 5),
                'last_period_start_date': settings.get('last_period_start_date')
                **settings
            }
        except Exception as e:
            raise ValueError(f"Failed to get tracker settings: {str(e)}")
        
    @staticmethod
    def close_incomplete_cycles(tracker_id: int, new_period_date: date) -> None:
        try:
            incomplete_cycles = PeriodCycle.query.filter_by(
            tracker_id=tracker_id,
            cycle_end_date=None
            ).all()
            
            closed_cycles = []
            
            for cycle in incomplete_cycles:
                if new_period_date > cycle.cycle_start_date:
                    # Close this cycle
                    cycle.cycle_end_date = new_period_date - timedelta(days=1)
                    cycle.cycle_length = (cycle.cycle_end_date - cycle.cycle_start_date).days + 1
                    
                    # Estimate period end if not set
                    if not cycle.period_end_date:
                        tracker = Tracker.query.get(tracker_id)
                        settings = PeriodCycleService.get_tracker_settings(tracker)
                        
                        estimated_end = cycle.period_start_date + timedelta(
                            days=settings['average_period_length'] - 1
                        )
                        # Don't let estimated end exceed cycle end
                        cycle.period_end_date = min(estimated_end, cycle.cycle_end_date)
                        cycle.period_length = (cycle.period_end_date - cycle.period_start_date).days + 1
                    
                    closed_cycles.append(cycle)
            
                return closed_cycles
        except Exception as e:
            raise ValueError(f"Failed to close incomplete cycles: {str(e)}")
        
    @staticmethod
    def calculate_cycle_predictions(
        tracker_id: int,
        cycle_start_date: date,
        average_cycle_length: int
    ) -> Dict[str, Optional[date]]:
        try:
            cycle_datetime = datetime.combine(cycle_start_date, datetime.min.time())
            predicted_ovulation = predict_ovulation_date(cycle_datetime, average_cycle_length)
            predicted_next_period = predict_next_period_date(cycle_datetime, average_cycle_length)
            
            return {
                'predicted_ovulation': predicted_ovulation.date() if predicted_ovulation else None,
                'predicted_next_period': predicted_next_period.date() if predicted_next_period else None
            }
        except Exception as e:
            raise ValueError(f"Failed to calculate cycle predictions: {str(e)}")

        

            

    
    