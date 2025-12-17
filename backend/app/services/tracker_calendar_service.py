"""
Calendar service for regular (non-period) trackers.

Provides calendar grid views showing tracking activity and entry data.
"""

from typing import Dict, List, Any
from datetime import date, timedelta
from collections import defaultdict
import calendar

from app.models.tracker import Tracker
from app.models.tracking_data import TrackingData


class TrackerCalendarService:
    """Calendar visualization service for normal trackers."""
    
    @staticmethod
    def get_calendar_data(
        tracker_id: int,
        target_date: date
    ) -> Dict[str, Any]:
        """
        Get calendar data for a specific month showing which days have entries.
        
        Returns:
        - Calendar grid structure
        - Days with entries marked
        - Entry summaries for each day
        - Tracking streak information
        """
        # Get month boundaries
        year, month = target_date.year, target_date.month
        month_start = date(year, month, 1)
        _, last_day = calendar.monthrange(year, month)
        month_end = date(year, month, last_day)
        
        # Build calendar grid
        calendar_grid = TrackerCalendarService.build_calendar_grid(
            month_start, month_end
        )
        
        # Get all entries for this month (including buffer days)
        start_date = date.fromisoformat(calendar_grid['calendar_start'])
        end_date = date.fromisoformat(calendar_grid['calendar_end'])
        
        entries = TrackingData.query.filter_by(
            tracker_id=tracker_id
        ).filter(
            TrackingData.entry_date >= start_date,
            TrackingData.entry_date <= end_date
        ).all()
        
        # Group entries by date
        entries_by_date = defaultdict(list)
        for entry in entries:
            entries_by_date[entry.entry_date].append(entry)
        
        # Annotate days with entry information
        annotated_days = TrackerCalendarService._annotate_calendar_days(
            calendar_grid['days'],
            entries_by_date
        )
        
        # Calculate tracking streaks
        current_streak, longest_streak = TrackerCalendarService._calculate_streaks(
            tracker_id,
            target_date
        )
        
        # Get tracker info
        tracker = Tracker.query.get(tracker_id)
        
        return {
            'month': {
                'year': year,
                'month': month,
                'month_name': target_date.strftime('%B'),
                'month_name_short': target_date.strftime('%b')
            },
            'calendar_grid': calendar_grid,
            'days': annotated_days,
            'stats': {
                'total_entries_in_month': len([
                    e for e in entries 
                    if month_start <= e.entry_date <= month_end
                ]),
                'days_tracked_in_month': len([
                    d for d in annotated_days
                    if d['is_current_month'] and d['has_entry']
                ]),
                'total_days_in_month': (month_end - month_start).days + 1,
                'current_streak': current_streak,
                'longest_streak': longest_streak
            },
            'tracker_info': {
                'tracker_id': tracker.id,
                'tracker_name': tracker.name if hasattr(tracker, 'name') else None
            }
        }
    
    @staticmethod
    def build_calendar_grid(month_start: date, month_end: date) -> Dict[str, Any]:
        """Build calendar grid including buffer days to complete weeks."""
        # Include days from previous month to start on Monday
        start_weekday = month_start.weekday()  # 0=Monday
        calendar_start = month_start - timedelta(days=start_weekday)
        
        # Include days from next month to complete last week
        end_weekday = month_end.weekday()
        days_to_add = 6 - end_weekday  # Complete to Sunday
        calendar_end = month_end + timedelta(days=days_to_add)
        
        # Generate all days
        days = []
        current = calendar_start
        while current <= calendar_end:
            days.append({
                'date': current.isoformat(),
                'day': current.day,
                'weekday': current.weekday(),  # 0=Monday
                'weekday_name': current.strftime('%A'),
                'weekday_short': current.strftime('%a'),
                'is_today': current == date.today(),
                'is_current_month': month_start <= current <= month_end,
                'week_of_month': ((current - month_start).days // 7) + 1 if current >= month_start else 0
            })
            current += timedelta(days=1)
        
        # Group into weeks
        weeks = []
        for i in range(0, len(days), 7):
            weeks.append(days[i:i+7])
        
        return {
            'calendar_start': calendar_start.isoformat(),
            'calendar_end': calendar_end.isoformat(),
            'days': days,
            'weeks': weeks,
            'total_weeks': len(weeks)
        }
    
    @staticmethod
    def _annotate_calendar_days(
        days: List[Dict],
        entries_by_date: Dict[date, List[TrackingData]]
    ) -> List[Dict]:
        """Annotate each day with entry information."""
        annotated = []
        
        for day in days:
            day_date = date.fromisoformat(day['date'])
            day_entries = entries_by_date.get(day_date, [])
            
            # Build day annotation
            day_info = {
                **day,
                'has_entry': len(day_entries) > 0,
                'entry_count': len(day_entries),
                'entry_ids': [e.id for e in day_entries]
            }
            
            # Add summary of data if entries exist
            if day_entries:
                # Collect field names that have data
                fields_tracked = set()
                for entry in day_entries:
                    if entry.data:
                        fields_tracked.update(entry.data.keys())
                
                day_info['fields_tracked'] = list(fields_tracked)
                day_info['summary'] = TrackerCalendarService._create_day_summary(day_entries)
            
            annotated.append(day_info)
        
        return annotated
    
    @staticmethod
    def _create_day_summary(entries: List[TrackingData]) -> Dict[str, Any]:
        """Create a summary of data for a day."""
        if not entries:
            return {}
        
        # For simplicity, use the first entry's data
        # (most days will only have 1 entry)
        entry = entries[0]
        
        if not entry.data:
            return {}
        
        # Create a simple summary
        summary = {}
        for field, values in entry.data.items():
            if isinstance(values, dict):
                # Show key metrics for nested fields
                summary[field] = {
                    k: v for k, v in list(values.items())[:3]  # First 3 items
                }
            else:
                summary[field] = values
        
        return summary
    
    @staticmethod
    def _calculate_streaks(tracker_id: int, reference_date: date) -> tuple:
        """Calculate current and longest tracking streaks."""
        # Get all entries for this tracker (last year)
        one_year_ago = reference_date - timedelta(days=365)
        
        entries = TrackingData.query.filter_by(
            tracker_id=tracker_id
        ).filter(
            TrackingData.entry_date >= one_year_ago,
            TrackingData.entry_date <= reference_date
        ).order_by(TrackingData.entry_date.desc()).all()
        
        if not entries:
            return 0, 0
        
        # Get unique dates
        entry_dates = sorted(set(e.entry_date for e in entries))
        
        # Calculate current streak (from today backwards)
        current_streak = 0
        check_date = reference_date
        
        while check_date in entry_dates:
            current_streak += 1
            check_date -= timedelta(days=1)
        
        # Calculate longest streak
        longest_streak = 0
        current_run = 0
        
        for i in range(len(entry_dates)):
            if i == 0:
                current_run = 1
            else:
                # Check if consecutive
                if (entry_dates[i] - entry_dates[i-1]).days == 1:
                    current_run += 1
                else:
                    longest_streak = max(longest_streak, current_run)
                    current_run = 1
        
        longest_streak = max(longest_streak, current_run)
        
        return current_streak, longest_streak
    
    @staticmethod
    def get_calendar_overview(
        tracker_id: int,
        months: int = 12
    ) -> Dict[str, Any]:
        """
        Get overview of tracking activity over time.
        
        Returns monthly tracking statistics and overall patterns.
        """
        today = date.today()
        start_date = today - timedelta(days=months * 30)
        
        # Get all entries in time range
        entries = TrackingData.query.filter_by(
            tracker_id=tracker_id
        ).filter(
            TrackingData.entry_date >= start_date,
            TrackingData.entry_date <= today
        ).all()
        
        # Group by month
        monthly_stats = defaultdict(lambda: {'entries': 0, 'days_tracked': set()})
        
        for entry in entries:
            month_key = entry.entry_date.strftime('%Y-%m')
            monthly_stats[month_key]['entries'] += 1
            monthly_stats[month_key]['days_tracked'].add(entry.entry_date)
        
        # Convert to list format
        monthly_data = []
        for month_key in sorted(monthly_stats.keys()):
            stats = monthly_stats[month_key]
            year, month = map(int, month_key.split('-'))
            _, days_in_month = calendar.monthrange(year, month)
            
            monthly_data.append({
                'year': year,
                'month': month,
                'month_name': date(year, month, 1).strftime('%B'),
                'entries': stats['entries'],
                'days_tracked': len(stats['days_tracked']),
                'days_in_month': days_in_month,
                'tracking_percentage': round(
                    len(stats['days_tracked']) / days_in_month * 100, 1
                )
            })
        
        # Calculate overall stats
        unique_dates = set(e.entry_date for e in entries)
        total_days_in_period = (today - start_date).days
        
        current_streak, longest_streak = TrackerCalendarService._calculate_streaks(
            tracker_id,
            today
        )
        
        return {
            'time_range': {
                'start_date': start_date.isoformat(),
                'end_date': today.isoformat(),
                'months': months
            },
            'overall_stats': {
                'total_entries': len(entries),
                'total_days_tracked': len(unique_dates),
                'total_days_in_period': total_days_in_period,
                'tracking_percentage': round(
                    len(unique_dates) / total_days_in_period * 100, 1
                ) if total_days_in_period > 0 else 0,
                'current_streak': current_streak,
                'longest_streak': longest_streak,
                'average_entries_per_day': round(
                    len(entries) / len(unique_dates), 2
                ) if unique_dates else 0
            },
            'monthly_breakdown': monthly_data
        }

