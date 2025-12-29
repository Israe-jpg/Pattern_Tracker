"""
Pattern Chart Service

Generates visual charts for recurring pattern analysis.
"""

import matplotlib
matplotlib.use('Agg')  # Use non-interactive backend
import matplotlib.pyplot as plt
import numpy as np
from io import BytesIO
from typing import Dict, Any, List
import seaborn as sns
from datetime import date, timedelta


class PatternChartService:
    """Service for generating pattern visualization charts."""
    
    @staticmethod
    def generate_pattern_chart(
        pattern_data: Dict[str, Any],
        tracker_id: int,
        field_name: str,
        chart_type: str = 'heatmap',
        months: int = 3
    ) -> bytes:
        """
        Generate pattern visualization chart.
        
        Args:
            pattern_data: Pattern data from PatternRecognitionService
            tracker_id: Tracker ID
            field_name: Field being analyzed
            chart_type: Type of chart ('heatmap', 'calendar', 'polar', 'bar')
            months: Number of months analyzed
        
        Returns:
            PNG image as bytes
        """
        # Check if patterns exist
        if pattern_data.get('message'):
            return PatternChartService._generate_no_data_chart(
                pattern_data.get('message', 'No patterns detected')
            )
        
        # Check has_patterns flag or patterns dictionary
        has_patterns = pattern_data.get('has_patterns', False)
        patterns = pattern_data.get('patterns', {})
        
        if not has_patterns and not patterns:
            return PatternChartService._generate_no_data_chart(
                'No patterns detected'
            )
        
        if chart_type == 'calendar':
            return PatternChartService._generate_calendar_chart(pattern_data, field_name)
        elif chart_type == 'polar':
            return PatternChartService._generate_polar_chart(pattern_data, field_name)
        elif chart_type == 'bar':
            return PatternChartService._generate_bar_chart(pattern_data, field_name)
        else:  # 'heatmap' (default)
            return PatternChartService._generate_heatmap_chart(pattern_data, field_name)
    
    @staticmethod
    def _generate_heatmap_chart(
        pattern_data: Dict[str, Any],
        field_name: str
    ) -> bytes:
        """Generate day-of-week pattern heatmap."""
        
        # Get patterns dictionary
        patterns = pattern_data.get('patterns', {})
        day_of_week_pattern = patterns.get('day_of_week')
        
        if not day_of_week_pattern:
            return PatternChartService._generate_no_data_chart(
                "No day-of-week patterns found"
            )
        
        # Ensure day_of_week_pattern is a dictionary
        if not isinstance(day_of_week_pattern, dict):
            return PatternChartService._generate_no_data_chart(
                f"Invalid pattern format: expected dict, got {type(day_of_week_pattern).__name__}"
            )
        
        # Prepare data for heatmap
        days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
        
        # Extract pattern data based on field type
        day_data = {}
        
        pattern_type = day_of_week_pattern.get('type', 'numeric')  # Default to numeric if not specified
        if pattern_type == 'numeric':
            # Numeric field - use day_statistics
            day_stats = day_of_week_pattern.get('day_statistics', {})
            if not isinstance(day_stats, dict):
                return PatternChartService._generate_no_data_chart(
                    "Invalid day statistics format"
                )
            
            for dow, stats in day_stats.items():
                # Ensure stats is a dictionary
                if not isinstance(stats, dict):
                    continue
                
                day_name = stats.get('day', '')
                if not day_name and isinstance(dow, int) and 0 <= dow < len(days):
                    day_name = days[dow]
                
                if day_name and day_name in days:
                    day_data[day_name] = {
                        'value': float(stats.get('mean', 0)),
                        'confidence': 0.7 if day_of_week_pattern.get('confidence') == 'high' else 0.5
                    }
        else:
            # Categorical field - use day_patterns (dict) or consistent_patterns (list)
            day_patterns_dict = day_of_week_pattern.get('day_patterns', {})
            consistent_patterns = day_of_week_pattern.get('consistent_patterns', [])
            
            # Try consistent_patterns first (list format)
            if isinstance(consistent_patterns, list) and consistent_patterns:
                for pattern in consistent_patterns:
                    if not isinstance(pattern, dict):
                        continue
                    
                    day = pattern.get('day', '')
                    count_str = pattern.get('frequency', '0/0')
                    # Parse frequency like "5/10" to get count
                    try:
                        count = int(count_str.split('/')[0]) if '/' in count_str else pattern.get('count', 0)
                    except:
                        count = pattern.get('count', 0)
                    
                    consistency = pattern.get('consistency', 0)
                    # Convert percentage to decimal if needed
                    if isinstance(consistency, (int, float)) and consistency > 1:
                        consistency = consistency / 100.0
                    
                    if day and day in days:
                        day_data[day] = {
                            'value': float(count),
                            'confidence': float(consistency) if isinstance(consistency, (int, float)) else 0.0
                        }
            # Fallback to day_patterns dict
            elif isinstance(day_patterns_dict, dict) and day_patterns_dict:
                for dow, pattern in day_patterns_dict.items():
                    if not isinstance(pattern, dict):
                        continue
                    
                    day = pattern.get('day', '')
                    if not day and isinstance(dow, int) and 0 <= dow < len(days):
                        day = days[dow]
                    
                    count = pattern.get('count', 0)
                    # Calculate consistency from frequency
                    frequency = pattern.get('frequency', {})
                    most_common = pattern.get('most_common', '')
                    if isinstance(frequency, dict) and most_common:
                        mode_count = frequency.get(most_common, 0)
                        consistency = mode_count / count if count > 0 else 0
                    else:
                        consistency = 0.5  # Default
                    
                    if day and day in days:
                        day_data[day] = {
                            'value': float(count),
                            'confidence': float(consistency)
                        }
            else:
                return PatternChartService._generate_no_data_chart(
                    "No day-of-week pattern data available"
                )
        
        # Check if we have any data
        if not day_data:
            return PatternChartService._generate_no_data_chart(
                f"No day-of-week data extracted. Pattern type: {pattern_type}, "
                f"Has day_statistics: {'day_statistics' in day_of_week_pattern}, "
                f"Has day_patterns: {'day_patterns' in day_of_week_pattern}"
            )
        
        # Create matrix (1 row x 7 columns)
        values = [day_data.get(day, {}).get('value', 0) for day in days]
        confidences = [day_data.get(day, {}).get('confidence', 0) for day in days]
        
        # Find highest and lowest days for annotations
        if values:
            max_val = max(values)
            min_val = min(values)
            max_day_idx = values.index(max_val)
            min_day_idx = values.index(min_val)
            max_day = days[max_day_idx]
            min_day = days[min_day_idx]
        else:
            max_day = min_day = None
        
        # Create figure with more space
        fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(14, 8), 
                                       gridspec_kw={'height_ratios': [3, 1]})
        
        # Main heatmap
        values_2d = np.array([values])
        im = ax1.imshow(values_2d, cmap='RdYlGn', aspect='auto', vmin=min(values) if values else 0, vmax=max(values) if values else 10)
        
        # Set ticks
        ax1.set_xticks(range(len(days)))
        ax1.set_xticklabels(days, rotation=0, ha='center', fontsize=11, fontweight='bold')
        ax1.set_yticks([])
        
        # Add value labels with annotations
        avg_val = np.mean(values) if values else 0
        for i, (day, val, conf) in enumerate(zip(days, values, confidences)):
            text_color = 'white' if val > avg_val else 'black'
            
            # Add day label with value
            label_text = f'{day}\n{val:.1f}'
            if conf > 0.6:
                label_text += f'\n✓ High confidence'
            
            ax1.text(i, 0, label_text, 
                    ha='center', va='center', color=text_color, fontsize=11, fontweight='bold',
                    bbox=dict(boxstyle='round,pad=0.5', facecolor='white', alpha=0.3, edgecolor='black', linewidth=1))
        
        # Add pattern insights
        title = f'Weekly Pattern: {field_name.replace(".", " ").title()}'
        if max_day and min_day and max_val != min_val:
            title += f'\nHighest on {max_day} ({max_val:.1f}), Lowest on {min_day} ({min_val:.1f})'
        
        ax1.set_title(title, fontsize=15, fontweight='bold', pad=15)
        
        # Colorbar with label
        cbar = plt.colorbar(im, ax=ax1, orientation='horizontal', pad=0.1)
        cbar.set_label('Value', fontsize=11, fontweight='bold')
        
        # Confidence bar chart with annotations
        bars = ax2.bar(range(len(days)), confidences, color='#2196F3', alpha=0.7, edgecolor='black', linewidth=1.5)
        ax2.set_xticks(range(len(days)))
        ax2.set_xticklabels(days, rotation=0, ha='center', fontsize=10)
        ax2.set_ylabel('Confidence Level', fontsize=11, fontweight='bold')
        ax2.set_ylim(0, 1.1)
        ax2.axhline(y=0.6, color='r', linestyle='--', linewidth=2, alpha=0.7, label='Reliability Threshold')
        
        # Add confidence labels on bars
        for i, (bar, conf) in enumerate(zip(bars, confidences)):
            height = bar.get_height()
            if conf > 0.6:
                label = '✓ Reliable'
                color = '#4CAF50'
            else:
                label = '⚠ Low'
                color = '#FF9800'
            
            ax2.text(bar.get_x() + bar.get_width()/2., height + 0.02,
                    label, ha='center', va='bottom', fontsize=9, fontweight='bold', color=color)
        
        ax2.legend(loc='upper right', fontsize=10)
        ax2.grid(axis='y', alpha=0.3, linestyle='--')
        ax2.set_axisbelow(True)
        
        # Add insight text if pattern is strong
        if day_of_week_pattern.get('insight'):
            insight = day_of_week_pattern.get('insight', '')
            if insight:
                ax1.text(0.02, 0.98, f"💡 {insight}", transform=ax1.transAxes,
                        fontsize=10, verticalalignment='top',
                        bbox=dict(boxstyle='round', facecolor='lightyellow', alpha=0.8, edgecolor='orange', linewidth=2))
        
        plt.tight_layout()
        
        # Save to bytes
        buffer = BytesIO()
        plt.savefig(buffer, format='png', dpi=100, bbox_inches='tight')
        buffer.seek(0)
        plt.close(fig)
        
        return buffer.getvalue()
    
    @staticmethod
    def _generate_bar_chart(
        pattern_data: Dict[str, Any],
        field_name: str
    ) -> bytes:
        """Generate bar chart showing pattern frequencies."""
        
        # Get patterns dictionary
        patterns = pattern_data.get('patterns', {})
        
        # Combine all pattern types
        all_patterns = []
        
        # Day-of-week patterns
        dow_pattern = patterns.get('day_of_week')
        if dow_pattern:
            if dow_pattern.get('type') == 'numeric':
                highest = dow_pattern.get('highest_day', {})
                lowest = dow_pattern.get('lowest_day', {})
                if highest.get('day'):
                    all_patterns.append({
                        'type': 'Day of Week',
                        'label': f"Highest: {highest.get('day', '')}",
                        'value': highest.get('average', 0),
                        'confidence': 0.7 if dow_pattern.get('confidence') == 'high' else 0.5
                    })
            else:
                # Categorical - handle both list and dict formats
                day_patterns_dict = dow_pattern.get('day_patterns', {})
                consistent_patterns = dow_pattern.get('consistent_patterns', [])
                
                # Try consistent_patterns first (list format)
                if isinstance(consistent_patterns, list) and consistent_patterns:
                    for pattern in consistent_patterns:
                        if isinstance(pattern, dict):
                            day = pattern.get('day', '')
                            most_common = pattern.get('value', pattern.get('most_common', ''))
                            count_str = pattern.get('frequency', '0/0')
                            try:
                                count = int(count_str.split('/')[0]) if '/' in count_str else pattern.get('count', 0)
                            except:
                                count = pattern.get('count', 0)
                            
                            consistency = pattern.get('consistency', 0)
                            if isinstance(consistency, (int, float)) and consistency > 1:
                                consistency = consistency / 100.0
                            
                            all_patterns.append({
                                'type': 'Day of Week',
                                'label': f"{day}: {most_common}",
                                'value': count,
                                'confidence': float(consistency) if isinstance(consistency, (int, float)) else 0.0
                            })
                # Fallback to day_patterns dict
                elif isinstance(day_patterns_dict, dict) and day_patterns_dict:
                    for dow, pattern in day_patterns_dict.items():
                        if isinstance(pattern, dict):
                            day = pattern.get('day', '')
                            most_common = pattern.get('most_common', '')
                            count = pattern.get('count', 0)
                            
                            # Calculate consistency
                            frequency = pattern.get('frequency', {})
                            if isinstance(frequency, dict) and most_common:
                                mode_count = frequency.get(most_common, 0)
                                consistency = mode_count / count if count > 0 else 0
                            else:
                                consistency = 0.5
                            
                            all_patterns.append({
                                'type': 'Day of Week',
                                'label': f"{day}: {most_common}",
                                'value': count,
                                'confidence': float(consistency)
                            })
        
        # Time-of-month patterns
        month_pattern = patterns.get('time_of_month')
        if month_pattern and isinstance(month_pattern, dict):
            periods = month_pattern.get('period_statistics', {})
            if isinstance(periods, dict):
                for period, stats in periods.items():
                    if isinstance(stats, dict):
                        all_patterns.append({
                            'type': 'Time of Month',
                            'label': period.replace('_', ' ').title(),
                            'value': stats.get('mean', stats.get('count', 0)),
                            'confidence': 0.7 if month_pattern.get('confidence') == 'high' else 0.5
                        })
        
        # Streak patterns
        streak_pattern = patterns.get('streaks')
        if streak_pattern and isinstance(streak_pattern, dict):
            streaks = streak_pattern.get('streaks', [])
            if isinstance(streaks, list):
                for streak in streaks:
                    if isinstance(streak, dict):
                        all_patterns.append({
                            'type': 'Streak',
                            'label': f"{streak.get('value', '')} ({streak.get('length', 0)} days)",
                            'value': streak.get('length', 0),
                            'confidence': streak.get('confidence', 0) if isinstance(streak.get('confidence'), (int, float)) else 0.0
                        })
        
        if not all_patterns:
            return PatternChartService._generate_no_data_chart(
                "No patterns to visualize"
            )
        
        # Sort by confidence
        all_patterns.sort(key=lambda x: x['confidence'], reverse=True)
        all_patterns = all_patterns[:10]  # Top 10
        
        # Create figure with more space
        fig, ax = plt.subplots(figsize=(14, max(8, len(all_patterns) * 0.8)))
        
        # Prepare data with better labels
        labels = []
        confidences = []
        colors = []
        annotations = []
        
        for p in all_patterns:
            pattern_type = p['type']
            pattern_label = p['label']
            conf = p['confidence']
            value = p['value']
            
            # Create user-friendly label
            if pattern_type == 'Day of Week':
                labels.append(f"📅 {pattern_label}")
                if conf >= 0.7:
                    annotations.append(f"Strong weekly pattern (observed {value:.0f} times)")
                else:
                    annotations.append(f"Weekly trend (confidence: {conf:.0%})")
            elif pattern_type == 'Time of Month':
                labels.append(f"📆 {pattern_label}")
                annotations.append(f"Monthly pattern (avg: {value:.1f})")
            elif pattern_type == 'Streak':
                labels.append(f"🔥 {pattern_label}")
                annotations.append(f"Consecutive pattern (length: {value} days)")
            else:
                labels.append(f"{pattern_type}: {pattern_label}")
                annotations.append(f"Confidence: {conf:.0%}")
            
            confidences.append(conf)
            
            # Color coding
            if conf >= 0.7:
                colors.append('#4CAF50')  # Green - High confidence
            elif conf >= 0.6:
                colors.append('#FFC107')  # Yellow - Medium confidence
            else:
                colors.append('#FF9800')  # Orange - Low confidence
        
        # Create horizontal bar chart
        y_pos = np.arange(len(labels))
        bars = ax.barh(y_pos, confidences, color=colors, alpha=0.7, edgecolor='black', linewidth=1.5)
        
        # Add confidence percentage labels
        for i, (bar, conf) in enumerate(zip(bars, confidences)):
            width = bar.get_width()
            ax.text(width + 0.02, i, f'{conf:.0%}', 
                   va='center', fontsize=11, fontweight='bold')
        
        # Add detailed annotations
        max_conf = max(confidences) if confidences else 1.0
        for i, (annotation, conf) in enumerate(zip(annotations, confidences)):
            ax.text(max_conf * 1.15, i, annotation, 
                   va='center', fontsize=10, style='italic',
                   bbox=dict(boxstyle='round,pad=0.5', facecolor='white', alpha=0.8, edgecolor=colors[i], linewidth=1.5))
        
        # Customize
        ax.set_yticks(y_pos)
        ax.set_yticklabels(labels, fontsize=11, fontweight='bold')
        ax.set_xlabel('Confidence Level', fontsize=12, fontweight='bold')
        ax.set_title(f'Detected Patterns: {field_name.replace(".", " ").title()}', 
                    fontsize=16, fontweight='bold', pad=20)
        ax.set_xlim(0, max_conf * 1.4)
        ax.axvline(x=0.6, color='r', linestyle='--', linewidth=2, alpha=0.7, label='Reliability Threshold (60%)')
        
        # Add legend
        from matplotlib.patches import Patch
        legend_elements = [
            Patch(facecolor='#4CAF50', alpha=0.7, label='High Confidence (≥70%)'),
            Patch(facecolor='#FFC107', alpha=0.7, label='Medium Confidence (60-70%)'),
            Patch(facecolor='#FF9800', alpha=0.7, label='Low Confidence (<60%)')
        ]
        ax.legend(handles=legend_elements, loc='lower right', fontsize=10)
        ax.grid(axis='x', alpha=0.3, linestyle='--')
        ax.set_axisbelow(True)
        
        # Add summary if available
        pattern_strength = pattern_data.get('pattern_strength', {})
        if pattern_strength:
            overall = pattern_strength.get('overall_strength', 'unknown')
            summary = f"Overall Pattern Strength: {overall.title()}"
            ax.text(0.98, 0.02, summary, transform=ax.transAxes,
                   fontsize=10, horizontalalignment='right', fontweight='bold',
                   bbox=dict(boxstyle='round', facecolor='lightblue', alpha=0.7))
        
        plt.tight_layout()
        
        # Save to bytes
        buffer = BytesIO()
        plt.savefig(buffer, format='png', dpi=100, bbox_inches='tight')
        buffer.seek(0)
        plt.close(fig)
        
        return buffer.getvalue()
    
    @staticmethod
    def _generate_polar_chart(
        pattern_data: Dict[str, Any],
        field_name: str
    ) -> bytes:
        """Generate polar/radar chart for cyclical patterns."""
        
        # Get patterns dictionary
        patterns = pattern_data.get('patterns', {})
        day_of_week_pattern = patterns.get('day_of_week')
        
        if not day_of_week_pattern:
            return PatternChartService._generate_no_data_chart(
                "No cyclical patterns found"
            )
        
        # Prepare data
        days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
        
        if day_of_week_pattern.get('type') == 'numeric':
            # Numeric field - use day_statistics
            day_stats = day_of_week_pattern.get('day_statistics', {})
            if not isinstance(day_stats, dict):
                return PatternChartService._generate_no_data_chart(
                    "Invalid day statistics format"
                )
            
            day_data = {}
            for dow, stats in day_stats.items():
                # Ensure stats is a dictionary
                if not isinstance(stats, dict):
                    continue
                
                day_name = stats.get('day', '')
                if not day_name and isinstance(dow, int) and 0 <= dow < len(days):
                    day_name = days[dow]
                
                if day_name:
                    day_data[day_name] = float(stats.get('mean', 0))
        else:
            # Categorical field - use day_patterns (dict) or consistent_patterns (list)
            day_patterns_dict = day_of_week_pattern.get('day_patterns', {})
            consistent_patterns = day_of_week_pattern.get('consistent_patterns', [])
            
            day_data = {}
            
            # Try consistent_patterns first (list format)
            if isinstance(consistent_patterns, list) and consistent_patterns:
                for pattern in consistent_patterns:
                    if not isinstance(pattern, dict):
                        continue
                    
                    day = pattern.get('day', '')
                    count_str = pattern.get('frequency', '0/0')
                    try:
                        count = int(count_str.split('/')[0]) if '/' in count_str else pattern.get('count', 0)
                    except:
                        count = pattern.get('count', 0)
                    
                    if day:
                        day_data[day] = float(count)
            # Fallback to day_patterns dict
            elif isinstance(day_patterns_dict, dict) and day_patterns_dict:
                for dow, pattern in day_patterns_dict.items():
                    if not isinstance(pattern, dict):
                        continue
                    
                    day = pattern.get('day', '')
                    if not day and isinstance(dow, int) and 0 <= dow < len(days):
                        day = days[dow]
                    
                    count = pattern.get('count', 0)
                    if day:
                        day_data[day] = float(count)
            
            if not day_data:
                return PatternChartService._generate_no_data_chart(
                    "No day-of-week pattern data available"
                )
        
        values = [float(day_data.get(day, 0)) for day in days]
        
        # Create polar plot
        fig, ax = plt.subplots(figsize=(10, 10), subplot_kw=dict(projection='polar'))
        
        # Angles for each day
        angles = np.linspace(0, 2 * np.pi, len(days), endpoint=False).tolist()
        values += values[:1]  # Complete the circle
        angles += angles[:1]
        
        # Plot
        ax.plot(angles, values, 'o-', linewidth=2, color='#2196F3', label='Average Value')
        ax.fill(angles, values, alpha=0.25, color='#2196F3')
        
        # Set labels
        ax.set_xticks(angles[:-1])
        ax.set_xticklabels(days)
        ax.set_title(f'Weekly Pattern Cycle: {field_name.replace(".", " ").title()}', 
                    fontsize=14, fontweight='bold', pad=20)
        ax.grid(True)
        ax.legend(loc='upper right', bbox_to_anchor=(1.3, 1.0))
        
        plt.tight_layout()
        
        # Save to bytes
        buffer = BytesIO()
        plt.savefig(buffer, format='png', dpi=100, bbox_inches='tight')
        buffer.seek(0)
        plt.close(fig)
        
        return buffer.getvalue()
    
    @staticmethod
    def _generate_calendar_chart(
        pattern_data: Dict[str, Any],
        field_name: str
    ) -> bytes:
        """Generate calendar-style visualization."""
        
        # Get patterns dictionary
        patterns = pattern_data.get('patterns', {})
        month_pattern = patterns.get('time_of_month')
        
        if not month_pattern:
            return PatternChartService._generate_no_data_chart(
                "No time-of-month patterns for calendar view"
            )
        
        # Create a 4x1 grid for month periods
        periods = ['early_month', 'mid_month', 'late_month', 'end_of_month']
        period_labels = ['Early', 'Mid', 'Late', 'End']
        
        period_stats = month_pattern.get('period_statistics', {})
        if not isinstance(period_stats, dict):
            return PatternChartService._generate_no_data_chart(
                "Invalid period statistics format"
            )
        
        values = []
        for period in periods:
            if period in period_stats:
                stats = period_stats[period]
                if isinstance(stats, dict):
                    values.append(float(stats.get('mean', stats.get('count', 0))))
                elif isinstance(stats, (int, float)):
                    values.append(float(stats))
                else:
                    values.append(0.0)
            else:
                values.append(0.0)
        
        # Create figure
        fig, ax = plt.subplots(figsize=(12, 4))
        
        # Create horizontal bar-like visualization
        colors = plt.cm.RdYlGn(np.linspace(0.3, 0.9, 4))
        bars = ax.barh(range(4), values, color=colors, alpha=0.7)
        
        # Add labels
        ax.set_yticks(range(4))
        ax.set_yticklabels(period_labels)
        ax.set_xlabel('Average Value')
        ax.set_title(f'Monthly Pattern: {field_name.replace(".", " ").title()}', 
                    fontsize=14, fontweight='bold')
        ax.grid(axis='x', alpha=0.3)
        
        # Add value labels
        for i, (bar, val) in enumerate(zip(bars, values)):
            ax.text(val + 0.1, i, f'{val:.1f}', va='center')
        
        plt.tight_layout()
        
        # Save to bytes
        buffer = BytesIO()
        plt.savefig(buffer, format='png', dpi=100, bbox_inches='tight')
        buffer.seek(0)
        plt.close(fig)
        
        return buffer.getvalue()
    
    @staticmethod
    def _generate_no_data_chart(message: str) -> bytes:
        """Generate a placeholder chart when no data is available."""
        fig, ax = plt.subplots(figsize=(10, 6))
        ax.text(0.5, 0.5, message, 
                horizontalalignment='center',
                verticalalignment='center',
                fontsize=14, color='gray',
                transform=ax.transAxes)
        ax.axis('off')
        
        buffer = BytesIO()
        plt.savefig(buffer, format='png', dpi=100, bbox_inches='tight')
        buffer.seek(0)
        plt.close(fig)
        
        return buffer.getvalue()

