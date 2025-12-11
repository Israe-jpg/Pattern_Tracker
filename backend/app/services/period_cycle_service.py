"""
specialized service for cycle operations
"""

from app.models.period_cycle import PeriodCycle
from app.models.tracker import Tracker
from app.models.tracker_category import TrackerCategory
from datetime import date, datetime, timedelta
from typing import Dict, Any, Optional, List
from app import db
from sqlalchemy.orm.attributes import flag_modified
from app.utils.menstruation_calculations import (
    calculate_cycle_day,
    determine_cycle_phase,
    predict_ovulation_date,
    predict_next_period_date,
    predict_period_end_date
)

class PeriodCycleService:
    @staticmethod
    def get_tracker_settings(tracker_id: int) -> Dict[str, Any]:
        try:
            tracker = Tracker.query.get(tracker_id)
            if not tracker:
                raise ValueError("Tracker not found")
            settings = tracker.settings or {}
            return {
                'average_cycle_length': settings.get('average_cycle_length', 28),
                'average_period_length': settings.get('average_period_length', 5),
                'last_period_start_date': settings.get('last_period_start_date'),
                'predicted_ovulation': settings.get('predicted_ovulation'),
                'predicted_next_period': settings.get('predicted_next_period'),
                'predicted_period_end_date': settings.get('predicted_period_end_date'),
                'predicted_period_length': settings.get('predicted_period_length')
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
        cycle_start_date: date,
        average_cycle_length: int
    ) -> Dict[str, Optional[date]]:
        try:
            # Convert date to datetime for prediction functions
            cycle_start_datetime = datetime.combine(cycle_start_date, datetime.min.time())
            predicted_ovulation = predict_ovulation_date(cycle_start_datetime, average_cycle_length)
            predicted_next_period = predict_next_period_date(cycle_start_datetime, average_cycle_length)
            
            # Extract date from datetime results (or return date if already a date)
            predicted_ovulation_date_obj = predicted_ovulation.date() if predicted_ovulation else None
            predicted_next_period_date_obj = predicted_next_period.date() if predicted_next_period else None
            
            return {
                'predicted_ovulation': predicted_ovulation_date_obj,
                'predicted_next_period': predicted_next_period_date_obj
            }
        except Exception as e:
            raise ValueError(f"Failed to calculate cycle predictions: {str(e)}")
    
    @staticmethod
    def create_cycle(tracker_id: int, cycle_start_date: date, settings: Dict[str, Any]) -> PeriodCycle:
        try:
            existing_cycle = PeriodCycle.query.filter_by(
                tracker_id=tracker_id,
                cycle_start_date=cycle_start_date
            ).first()
            
            if existing_cycle:
                raise ValueError(f"A cycle already exists for {cycle_start_date.isoformat()}")
            
            predictions = PeriodCycleService.calculate_cycle_predictions(
            cycle_start_date,
            settings['average_cycle_length']
            )
            
            # Estimate period end date
            estimated_period_end = cycle_start_date + timedelta(
                days=settings['average_period_length'] - 1
            )
            
            new_cycle = PeriodCycle(
                tracker_id=tracker_id,
                cycle_start_date=cycle_start_date,
                period_start_date=cycle_start_date,
                period_end_date=estimated_period_end,
                period_length=settings['average_period_length'],
                predicted_ovulation_date=predictions['predicted_ovulation'],
                predicted_next_period_date=predictions['predicted_next_period'],
            )
            
            db.session.add(new_cycle)
            
            return new_cycle
        except Exception as e:
            raise ValueError(f"Failed to create cycle: {str(e)}")
    
    @staticmethod
    def finalize_cycle(cycle: PeriodCycle, tracker_id: int) -> None:
        try: 
            # Find next cycle
            next_cycle = PeriodCycle.query.filter_by(
                tracker_id=tracker_id
            ).filter(
                PeriodCycle.cycle_start_date > cycle.cycle_start_date
            ).order_by(PeriodCycle.cycle_start_date.asc()).first()
            
            # If there's a next cycle, this cycle should be complete
            if next_cycle:
                cycle.cycle_end_date = next_cycle.cycle_start_date - timedelta(days=1)
                cycle.cycle_length = (cycle.cycle_end_date - cycle.cycle_start_date).days + 1
                
                # Ensure period end doesn't exceed cycle end
                if cycle.period_end_date and cycle.period_end_date > cycle.cycle_end_date:
                    cycle.period_end_date = cycle.cycle_end_date
                    cycle.period_length = (cycle.period_end_date - cycle.period_start_date).days + 1
            else:
                # No next cycle - this is current/active
                cycle.cycle_end_date = None
                cycle.cycle_length = None
            
            # Update previous cycle
            previous_cycle = PeriodCycle.query.filter_by(
                tracker_id=tracker_id
            ).filter(
                PeriodCycle.cycle_start_date < cycle.cycle_start_date
            ).order_by(PeriodCycle.cycle_start_date.desc()).first()
            
            if previous_cycle and not previous_cycle.cycle_end_date:
                previous_cycle.cycle_end_date = cycle.cycle_start_date - timedelta(days=1)
                previous_cycle.cycle_length = (
                    previous_cycle.cycle_end_date - previous_cycle.cycle_start_date
                ).days + 1
                
                # Update previous period end if needed
                if not previous_cycle.period_end_date or \
                previous_cycle.period_end_date > previous_cycle.cycle_end_date:
                    tracker = Tracker.query.get(tracker_id)
                    settings = PeriodCycleService.get_tracker_settings(tracker)
                    
                    estimated_end = previous_cycle.period_start_date + timedelta(
                        days=settings['average_period_length'] - 1
                    )
                    previous_cycle.period_end_date = min(estimated_end, previous_cycle.cycle_end_date)
                    previous_cycle.period_length = (
                        previous_cycle.period_end_date - previous_cycle.period_start_date
                    ).days + 1
        except Exception as e:
            raise ValueError(f"Failed to finalize cycle: {str(e)}")
    
    @staticmethod
    def update_tracker_settings(
        tracker: Tracker,
        cycle: PeriodCycle
    ) -> None:
        try:
            # Check if this is the most recent cycle
            next_cycle = PeriodCycle.query.filter_by(
                tracker_id=tracker.id
            ).filter(
                PeriodCycle.cycle_start_date > cycle.cycle_start_date
            ).first()
            
            if next_cycle:
                # Not the most recent cycle, don't update settings
                return
            
            settings = tracker.settings or {}
            settings['last_period_start_date'] = cycle.period_start_date.isoformat()
            
            if cycle.predicted_ovulation_date:
                settings['predicted_ovulation'] = cycle.predicted_ovulation_date.isoformat()
            
            if cycle.predicted_next_period_date:
                settings['predicted_next_period'] = cycle.predicted_next_period_date.isoformat()
            
            tracker.settings = settings
            flag_modified(tracker, 'settings')
        except Exception as e:
            raise ValueError(f"Failed to update tracker settings: {str(e)}")

    @staticmethod
    def get_cycle_info_dict(cycle: PeriodCycle, settings: Dict[str, Any]) -> Dict[str, Any]:
        try:
            cycle_dict = cycle.to_dict()
            
            # Calculate current cycle day and phase
            cycle_day = calculate_cycle_day(cycle.cycle_start_date.isoformat())
            cycle_phase = determine_cycle_phase(
                cycle_day,
                settings['average_period_length'],
                settings['average_cycle_length']
            )
            
            # Add current state
            cycle_dict['current_cycle_day'] = cycle_day
            cycle_dict['current_cycle_phase'] = cycle_phase
            cycle_dict['is_menstruating'] = cycle_phase == 'menstruation'
            
            # Add fresh predictions (may differ from stored if settings changed)
            fresh_predictions = PeriodCycleService.calculate_cycle_predictions(
                cycle.cycle_start_date,
                settings['average_cycle_length']
            )
            
            cycle_dict['updated_predictions'] = {
                'predicted_ovulation_date': fresh_predictions['predicted_ovulation'].isoformat() 
                    if fresh_predictions['predicted_ovulation'] else None,
                'predicted_next_period_date': fresh_predictions['predicted_next_period'].isoformat() 
                    if fresh_predictions['predicted_next_period'] else None
            }
            
            return cycle_dict
        
        except Exception as e:
            raise ValueError(f"Failed to get cycle info dictionary: {str(e)}")
    
    @staticmethod
    def recalculate_all_cycles(tracker_id: int) -> Dict[str, Any]:
        try:
            tracker = Tracker.query.get(tracker_id)
            if not tracker:
                raise ValueError("Tracker not found")
            
            settings = PeriodCycleService.get_tracker_settings(tracker_id)
            
            # Get all cycles ordered by start date
            cycles = PeriodCycle.query.filter_by(
                tracker_id=tracker_id
            ).order_by(PeriodCycle.cycle_start_date.asc()).all()
            
            if not cycles:
                return {
                    'cycles_processed': 0,
                    'changes_made': 0,
                    'message': 'No cycles to recalculate'
                }
            
            changes_made = 0
            
            # Process each cycle
            for i, cycle in enumerate(cycles):
                # Recalculate predictions
                predictions = PeriodCycleService.calculate_cycle_predictions(
                    cycle.cycle_start_date,
                    settings['average_cycle_length']
                )
                
                if cycle.predicted_ovulation_date != predictions['predicted_ovulation']:
                    cycle.predicted_ovulation_date = predictions['predicted_ovulation']
                    changes_made += 1
                
                if cycle.predicted_next_period_date != predictions['predicted_next_period']:
                    cycle.predicted_next_period_date = predictions['predicted_next_period']
                    changes_made += 1
                
                # Fix period end if missing
                if not cycle.period_end_date:
                    estimated_end = cycle.period_start_date + timedelta(
                        days=settings['average_period_length'] - 1
                    )
                    cycle.period_end_date = estimated_end
                    cycle.period_length = settings['average_period_length']
                    changes_made += 1
                
                # Fix cycle end/length based on next cycle
                if i < len(cycles) - 1:
                    # Not the last cycle - should be complete
                    next_cycle = cycles[i + 1]
                    correct_end_date = next_cycle.cycle_start_date - timedelta(days=1)
                    
                    if cycle.cycle_end_date != correct_end_date:
                        cycle.cycle_end_date = correct_end_date
                        cycle.cycle_length = (cycle.cycle_end_date - cycle.cycle_start_date).days + 1
                        changes_made += 1
                    
                    # Ensure period end doesn't exceed cycle end
                    if cycle.period_end_date and cycle.period_end_date > cycle.cycle_end_date:
                        cycle.period_end_date = cycle.cycle_end_date
                        cycle.period_length = (cycle.period_end_date - cycle.period_start_date).days + 1
                        changes_made += 1
                else:
                    # Last cycle - should be open
                    if cycle.cycle_end_date is not None:
                        cycle.cycle_end_date = None
                        cycle.cycle_length = None
                        changes_made += 1
            
            # Update tracker settings with most recent cycle
            if cycles:
                latest_cycle = cycles[-1]
                PeriodCycleService.update_tracker_settings(tracker, latest_cycle)
            
            db.session.commit()
            
            return {
                'cycles_processed': len(cycles),
                'changes_made': changes_made,
                'message': f'Recalculated {len(cycles)} cycles with {changes_made} changes'
            }
        except Exception as e:
            raise ValueError(f"Failed to recalculate all cycles: {str(e)}")

    @staticmethod
    def find_cycle_for_date(tracker_id: int, target_date: date) -> Optional[PeriodCycle]:
        try:
            all_cycles = PeriodCycle.query.filter_by(
                tracker_id=tracker_id
            ).order_by(PeriodCycle.cycle_start_date.asc()).all()
            
            for cycle in all_cycles:
                # Find next cycle after this one
                next_start = None
                for c in all_cycles:
                    if c.cycle_start_date > cycle.cycle_start_date:
                        if next_start is None or c.cycle_start_date < next_start:
                            next_start = c.cycle_start_date
                
                # Check if target date falls in this cycle
                if cycle.cycle_start_date <= target_date:
                    if next_start is None or target_date < next_start:
                        return cycle
            
            return None
        except Exception as e:
            raise ValueError(f"Failed to find cycle for date: {str(e)}")

    @staticmethod
    def get_cycle_history(tracker_id: int, limit: int = 100, start_date: date = None, end_date: date = None) -> List[PeriodCycle]:
        try:
            tracker = Tracker.query.get(tracker_id)
            if not tracker:
                raise ValueError("Tracker not found")
            category = TrackerCategory.query.filter_by(id=tracker.category_id).first()
            if not category or category.name != 'Period Tracker':
                raise ValueError("This endpoint is only available for Period Tracker")
            
            if limit:
                cycles = PeriodCycle.query.filter_by(tracker_id=tracker_id).order_by(PeriodCycle.cycle_start_date.desc()).limit(limit).all()
            elif start_date and end_date:
                cycles = PeriodCycle.query.filter(
                    PeriodCycle.tracker_id == tracker_id,
                    PeriodCycle.cycle_start_date >= start_date,
                    PeriodCycle.cycle_start_date <= end_date
                ).order_by(PeriodCycle.cycle_start_date.desc()).all()
            elif start_date and not end_date:
                cycles = PeriodCycle.query.filter(
                    PeriodCycle.tracker_id == tracker_id,
                    PeriodCycle.cycle_start_date >= start_date
                ).order_by(PeriodCycle.cycle_start_date.desc()).all()
            elif end_date and not start_date:
                cycles = PeriodCycle.query.filter(
                    PeriodCycle.tracker_id == tracker_id,
                    PeriodCycle.cycle_start_date <= end_date
                ).order_by(PeriodCycle.cycle_start_date.desc()).all()
            else:
                cycles = PeriodCycle.query.filter_by(tracker_id=tracker_id).order_by(PeriodCycle.cycle_start_date.desc()).all()
            
            return cycles
        except Exception as e:
            raise ValueError(f"Failed to get cycle history: {str(e)}")

    @staticmethod
    def get_current_cycle(tracker_id: int) -> Optional[PeriodCycle]:
        try:
            current_cycle = PeriodCycle.query.filter_by(
                tracker_id=tracker_id,
                cycle_end_date=None
            ).order_by(PeriodCycle.cycle_start_date.desc()).first()
            return current_cycle
        except Exception as e:
            raise ValueError(f"Failed to get current cycle: {str(e)}")

    @staticmethod
    def get_last_finished_cycle(tracker_id: int) -> Optional[PeriodCycle]:
        try:
            last_finished_cycle = PeriodCycle.query.filter_by(
                tracker_id=tracker_id,
            ).filter(
                PeriodCycle.cycle_end_date.isnot(None)
            ).order_by(PeriodCycle.cycle_end_date.desc()).first()
            return last_finished_cycle
        except Exception as e:
            raise ValueError(f"Failed to get last finished cycle: {str(e)}")

    @staticmethod
    def get_cycle_phases_dates(tracker_id: int, cycle_id: int) -> Dict[str, Any]:
        try:
            cycle = PeriodCycle.query.filter_by(tracker_id=tracker_id, id=cycle_id).first()
            if not cycle:
                raise ValueError("Cycle not found")
            
            # Get cycle boundaries with fallbacks
            cycle_start = cycle.cycle_start_date
            cycle_end = cycle.cycle_end_date or cycle.predicted_next_period_date
            
            # Get period dates with fallbacks
            period_start = cycle.period_start_date
            period_end = cycle.period_end_date
            if not period_end and cycle.period_length:
                period_end = period_start + timedelta(days=cycle.period_length - 1)
            elif not period_end:
                # Fallback: estimate 5 days if no period_end or period_length
                period_end = period_start + timedelta(days=4)
            
            # Get ovulation date with fallback
            ovulation_date = cycle.predicted_ovulation_date
            if not ovulation_date and cycle_end:
                # Estimate ovulation: typically 14 days before next period
                ovulation_date = cycle_end - timedelta(days=14)
            elif not ovulation_date:
                avg_cycle_length = Tracker.query.get(tracker_id).settings['average_cycle_length']
                ovulation_date = cycle_start + timedelta(days=avg_cycle_length - 14)
            
            # 1. Menstrual phase: period_start to period_end
            menstrual_phase = []
            if period_start and period_end:
                current = period_start
                while current <= period_end:
                    menstrual_phase.append(current.isoformat())
                    current += timedelta(days=1)
            
            # 2. Follicular phase: period_end + 1 day to ovulation_date - 1 day
            follicular_phase = []
            if period_end and ovulation_date:
                follicular_start = period_end + timedelta(days=1)
                follicular_end = ovulation_date - timedelta(days=1)
                if follicular_start <= follicular_end:
                    current = follicular_start
                    while current <= follicular_end:
                        follicular_phase.append(current.isoformat())
                        current += timedelta(days=1)
            
            # 3. Ovulation phase: 1 day before to 1 day after ovulation (3 days total)
            ovulation_phase = []
            if ovulation_date:
                ovulation_start = ovulation_date - timedelta(days=1)
                ovulation_end = ovulation_date + timedelta(days=1)
                current = ovulation_start
                while current <= ovulation_end:
                    ovulation_phase.append(current.isoformat())
                    current += timedelta(days=1)
            
            # 4. Luteal phase: ovulation_date + 2 days to cycle_end - 1 day
            luteal_phase = []
            if ovulation_date and cycle_end:
                luteal_start = ovulation_date + timedelta(days=2)
                luteal_end = cycle_end - timedelta(days=1)
                if luteal_start <= luteal_end:
                    current = luteal_start
                    while current <= luteal_end:
                        luteal_phase.append(current.isoformat())
                        current += timedelta(days=1)
            
            return {
                'menstrual_phase': menstrual_phase,
                'follicular_phase': follicular_phase,
                'ovulation_phase': ovulation_phase,
                'luteal_phase': luteal_phase,
                'cycle_info': {
                    'cycle_start': cycle_start.isoformat() if cycle_start else None,
                    'cycle_end': cycle_end.isoformat() if cycle_end else None,
                    'period_start': period_start.isoformat() if period_start else None,
                    'period_end': period_end.isoformat() if period_end else None,
                    'ovulation_date': ovulation_date.isoformat() if ovulation_date else None
                },
                'cycle_predictions': {
                    'predicted_cycle_length': Tracker.query.get(tracker_id).settings['average_cycle_length'],
                    'predicted_period_length': Tracker.query.get(tracker_id).settings['average_period_length'],
                    'predicted_ovulation_date': cycle.predicted_ovulation_date.isoformat() if cycle.predicted_ovulation_date else None,
                    'predicted_next_period_date': cycle.predicted_next_period_date.isoformat() if cycle.predicted_next_period_date else None
                }
            }
        except Exception as e:
            raise ValueError(f"Failed to get cycle phases dates: {str(e)}")