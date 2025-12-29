"""
Comparison Chart Service

Generates visual charts for comparison data between periods.
"""

import matplotlib
matplotlib.use('Agg')  # Use non-interactive backend
import matplotlib.pyplot as plt
import numpy as np
from io import BytesIO
from typing import Dict, Any, Optional, List
import seaborn as sns


class ComparisonChartService:
    """Service for generating comparison visualization charts."""
    
    @staticmethod
    def generate_comparison_chart(
        comparison_data: Dict[str, Any],
        chart_type: str = 'bar',
        field_name: Optional[str] = None
    ) -> bytes:
        """
        Generate comparison chart showing current vs previous period.
        
        Args:
            comparison_data: Comparison data from ComparisonService
            chart_type: Type of chart ('bar', 'grouped_bar', 'delta')
            field_name: Optional specific field to visualize
        
        Returns:
            PNG image as bytes
        """
        if not comparison_data.get('has_comparison', False):
            return ComparisonChartService._generate_no_data_chart(
                "No comparison data available"
            )
        
        if chart_type == 'delta':
            return ComparisonChartService._generate_delta_chart(comparison_data, field_name)
        elif chart_type == 'grouped_bar':
            return ComparisonChartService._generate_grouped_bar_chart(comparison_data, field_name)
        else:  # 'bar' (default)
            return ComparisonChartService._generate_bar_chart(comparison_data, field_name)
    
    @staticmethod
    def _generate_bar_chart(
        comparison_data: Dict[str, Any],
        field_name: Optional[str] = None
    ) -> bytes:
        """Generate user-friendly comparison chart with annotations."""
        
        # Extract top changes
        top_changes = comparison_data.get('top_changes', {})
        if not top_changes:
            return ComparisonChartService._generate_no_data_chart(
                "No significant changes detected"
            )
        
        # Filter to specific field if requested
        if field_name and field_name in top_changes:
            top_changes = {field_name: top_changes[field_name]}
        elif field_name:
            return ComparisonChartService._generate_no_data_chart(
                f"Field '{field_name}' not found in changes"
            )
        
        # Limit to top 10 changes
        top_changes = dict(list(top_changes.items())[:10])
        
        # Get period info
        target_period = comparison_data.get('target_period', {})
        comparison_period = comparison_data.get('comparison_period', {})
        target_label = comparison_data.get('current_week', comparison_data.get('current_month', {}))
        comparison_label = comparison_data.get('previous_week', comparison_data.get('previous_month', {}))
        
        # Prepare data with annotations
        fields = []
        target_values = []
        comparison_values = []
        annotations = []
        change_directions = []
        
        for field, data in top_changes.items():
            field_display = field.replace('.', ' ').title()
            fields.append(field_display)
            
            # Handle numeric data
            if 'target_average' in data and data['target_average'] is not None:
                target_val = float(data['target_average'])
                comparison_val = float(data['comparison_average'])
                target_values.append(target_val)
                comparison_values.append(comparison_val)
                
                # Calculate change
                percent_change = data.get('percent_change')
                if percent_change is not None:
                    change_pct = float(percent_change)
                    if change_pct > 0:
                        direction = '↑'
                        change_directions.append('#4CAF50')  # Green for increase
                        annotations.append(f"+{change_pct:.1f}% increase")
                    elif change_pct < 0:
                        direction = '↓'
                        change_directions.append('#F44336')  # Red for decrease
                        annotations.append(f"{change_pct:.1f}% decrease")
                    else:
                        direction = '→'
                        change_directions.append('#FF9800')  # Orange for no change
                        annotations.append("No change")
                else:
                    diff = target_val - comparison_val
                    if diff > 0:
                        direction = '↑'
                        change_directions.append('#4CAF50')
                        annotations.append(f"+{diff:.1f} higher")
                    elif diff < 0:
                        direction = '↓'
                        change_directions.append('#F44336')
                        annotations.append(f"{abs(diff):.1f} lower")
                    else:
                        direction = '→'
                        change_directions.append('#FF9800')
                        annotations.append("Same")
            else:
                # Categorical data
                target_most = data.get('target_most_common', 'N/A')
                comparison_most = data.get('comparison_most_common', 'N/A')
                target_values.append(1.0)
                comparison_values.append(0.8)
                
                if target_most != comparison_most:
                    direction = '↔'
                    change_directions.append('#9C27B0')  # Purple for categorical change
                    annotations.append(f"Changed: {comparison_most} → {target_most}")
                else:
                    direction = '→'
                    change_directions.append('#FF9800')
                    annotations.append(f"Same: {target_most}")
        
        # Create figure with more space
        fig, ax = plt.subplots(figsize=(14, max(8, len(fields) * 1.0)))
        
        # Set positions
        y_pos = np.arange(len(fields))
        width = 0.35
        
        # Create bars
        bars1 = ax.barh(y_pos - width/2, target_values, width, 
                        label='Current Period', color='#4CAF50', alpha=0.8, edgecolor='black', linewidth=1.5)
        bars2 = ax.barh(y_pos + width/2, comparison_values, width, 
                        label='Previous Period', color='#2196F3', alpha=0.8, edgecolor='black', linewidth=1.5)
        
        # Add value labels on bars
        for i, (bar1, bar2, target_val, comp_val) in enumerate(zip(bars1, bars2, target_values, comparison_values)):
            # Target period value
            width1 = bar1.get_width()
            ax.text(width1 + 0.02, i - width/2, f'{target_val:.1f}', 
                   va='center', fontsize=10, fontweight='bold', color='#2E7D32')
            
            # Comparison period value
            width2 = bar2.get_width()
            ax.text(width2 + 0.02, i + width/2, f'{comp_val:.1f}', 
                   va='center', fontsize=10, fontweight='bold', color='#1565C0')
        
        # Add change annotations
        max_val = max(max(target_values) if target_values else [0], max(comparison_values) if comparison_values else [0])
        for i, (annotation, direction, color) in enumerate(zip(annotations, change_directions, change_directions)):
            ax.text(max_val * 1.15, i, f"{direction} {annotation}", 
                   va='center', fontsize=10, fontweight='bold', color=color,
                   bbox=dict(boxstyle='round,pad=0.5', facecolor='white', edgecolor=color, linewidth=2))
        
        # Customize
        ax.set_yticks(y_pos)
        ax.set_yticklabels(fields, fontsize=11, fontweight='bold')
        ax.set_xlabel('Value', fontsize=12, fontweight='bold')
        
        # Title with period info
        period_type = comparison_data.get('comparison_type', 'general')
        if period_type == 'week_over_week':
            title = 'Week-over-Week Comparison'
        elif period_type == 'month_over_month':
            title = 'Month-over-Month Comparison'
        else:
            title = 'Period Comparison'
        
        ax.set_title(title, fontsize=16, fontweight='bold', pad=20)
        ax.legend(loc='upper right', fontsize=11)
        ax.grid(axis='x', alpha=0.3, linestyle='--')
        ax.set_axisbelow(True)
        
        # Add period date ranges if available
        if target_period and comparison_period:
            target_start = target_period.get('start_date', '')
            target_end = target_period.get('end_date', '')
            comp_start = comparison_period.get('start_date', '')
            comp_end = comparison_period.get('end_date', '')
            
            if target_start and target_end:
                period_info = f"Current: {target_start} to {target_end}\nPrevious: {comp_start} to {comp_end}"
                ax.text(0.02, 0.98, period_info, transform=ax.transAxes,
                       fontsize=9, verticalalignment='top',
                       bbox=dict(boxstyle='round', facecolor='lightblue', alpha=0.7))
        
        # Add summary stats if available
        fields_increased = comparison_data.get('fields_increased', 0)
        fields_decreased = comparison_data.get('fields_decreased', 0)
        fields_stable = comparison_data.get('fields_stable', 0)
        
        if fields_increased or fields_decreased or fields_stable:
            summary = f"Summary: {fields_increased} increased, {fields_decreased} decreased, {fields_stable} stable"
            ax.text(0.98, 0.02, summary, transform=ax.transAxes,
                   fontsize=9, horizontalalignment='right',
                   bbox=dict(boxstyle='round', facecolor='wheat', alpha=0.7))
        
        plt.tight_layout()
        
        # Save to bytes
        buffer = BytesIO()
        plt.savefig(buffer, format='png', dpi=100, bbox_inches='tight')
        buffer.seek(0)
        plt.close(fig)
        
        return buffer.getvalue()
    
    @staticmethod
    def _generate_delta_chart(
        comparison_data: Dict[str, Any],
        field_name: Optional[str] = None
    ) -> bytes:
        """Generate user-friendly delta/change visualization chart with annotations."""
        
        top_changes = comparison_data.get('top_changes', {})
        if not top_changes:
            return ComparisonChartService._generate_no_data_chart(
                "No significant changes detected"
            )
        
        # Filter to specific field if requested
        if field_name and field_name in top_changes:
            top_changes = {field_name: top_changes[field_name]}
        elif field_name:
            return ComparisonChartService._generate_no_data_chart(
                f"Field '{field_name}' not found in changes"
            )
        
        # Limit to top 10 changes
        top_changes = dict(list(top_changes.items())[:10])
        
        # Prepare data with detailed annotations
        fields = []
        changes = []
        colors = []
        annotations = []
        
        for field, data in top_changes.items():
            field_display = field.replace('.', ' ').title()
            fields.append(field_display)
            
            # Get change value and create annotation
            if 'percent_change' in data and data['percent_change'] is not None:
                change = float(data['percent_change'])
                target_val = data.get('target_average', 'N/A')
                comp_val = data.get('comparison_average', 'N/A')
                
                if change > 0:
                    colors.append('#4CAF50')  # Green
                    annotations.append(f"↑ Increased from {comp_val:.1f} to {target_val:.1f}")
                elif change < 0:
                    colors.append('#F44336')  # Red
                    annotations.append(f"↓ Decreased from {comp_val:.1f} to {target_val:.1f}")
                else:
                    colors.append('#FF9800')  # Orange
                    annotations.append(f"→ No change ({target_val:.1f})")
            elif 'difference' in data:
                # Categorical change
                change = float(data.get('difference', 0)) * 30  # Normalize
                target_most = data.get('target_most_common', 'N/A')
                comp_most = data.get('comparison_most_common', 'N/A')
                
                if target_most != comp_most:
                    colors.append('#9C27B0')  # Purple
                    annotations.append(f"↔ Changed from '{comp_most}' to '{target_most}'")
                else:
                    colors.append('#FF9800')
                    annotations.append(f"→ Same: '{target_most}'")
                    change = 0
            else:
                change = 0
                colors.append('#9E9E9E')  # Gray
                annotations.append("No data")
            
            changes.append(change)
        
        # Create figure
        fig, ax = plt.subplots(figsize=(14, max(8, len(fields) * 1.0)))
        
        # Create horizontal bar chart
        y_pos = np.arange(len(fields))
        bars = ax.barh(y_pos, changes, color=colors, alpha=0.7, edgecolor='black', linewidth=1.5)
        
        # Add value labels and annotations
        max_change = max(abs(c) for c in changes) if changes else 10
        for i, (bar, change, annotation) in enumerate(zip(bars, changes, annotations)):
            width = bar.get_width()
            
            # Add percentage label
            if abs(change) > 0.1:
                label = f'{change:+.1f}%' if abs(change) > 1 else f'{change:+.2f}%'
                text_color = 'white' if abs(width) > max_change * 0.3 else 'black'
                ax.text(width, i, f' {label}', va='center', fontsize=11, fontweight='bold', color=text_color)
            
            # Add detailed annotation
            annotation_x = max_change * 1.2 if max_change > 0 else 10
            ax.text(annotation_x, i, annotation, 
                   va='center', fontsize=10, style='italic',
                   bbox=dict(boxstyle='round,pad=0.5', facecolor='white', alpha=0.8, edgecolor=colors[i], linewidth=1.5))
        
        # Customize
        ax.set_yticks(y_pos)
        ax.set_yticklabels(fields, fontsize=11, fontweight='bold')
        ax.set_xlabel('Change (%)', fontsize=12, fontweight='bold')
        
        # Title
        period_type = comparison_data.get('comparison_type', 'general')
        if period_type == 'week_over_week':
            title = 'Week-over-Week Changes'
        elif period_type == 'month_over_month':
            title = 'Month-over-Month Changes'
        else:
            title = 'Period Changes'
        
        ax.set_title(title, fontsize=16, fontweight='bold', pad=20)
        ax.axvline(x=0, color='black', linewidth=2, linestyle='-', alpha=0.5)
        ax.grid(axis='x', alpha=0.3, linestyle='--')
        ax.set_axisbelow(True)
        
        # Set x-axis limits to accommodate annotations
        if changes:
            max_abs_change = max(abs(c) for c in changes)
            ax.set_xlim(-max_abs_change * 1.5, max_abs_change * 1.8)
        
        # Add legend
        from matplotlib.patches import Patch
        legend_elements = [
            Patch(facecolor='#4CAF50', alpha=0.7, label='Increase'),
            Patch(facecolor='#F44336', alpha=0.7, label='Decrease'),
            Patch(facecolor='#FF9800', alpha=0.7, label='No Change'),
            Patch(facecolor='#9C27B0', alpha=0.7, label='Categorical Change')
        ]
        ax.legend(handles=legend_elements, loc='lower right', fontsize=10)
        
        plt.tight_layout()
        
        # Save to bytes
        buffer = BytesIO()
        plt.savefig(buffer, format='png', dpi=100, bbox_inches='tight')
        buffer.seek(0)
        plt.close(fig)
        
        return buffer.getvalue()
    
    @staticmethod
    def _generate_grouped_bar_chart(
        comparison_data: Dict[str, Any],
        field_name: Optional[str] = None
    ) -> bytes:
        """Generate grouped bar chart for multiple fields."""
        # Similar to bar chart but with different grouping
        # This is a simplified version - can be enhanced later
        return ComparisonChartService._generate_bar_chart(comparison_data, field_name)
    
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

