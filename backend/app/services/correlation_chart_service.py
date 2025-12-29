"""
Correlation Chart Service

Generates visual charts for correlation analysis between fields.
"""

import matplotlib
matplotlib.use('Agg')  # Use non-interactive backend
import matplotlib.pyplot as plt
import numpy as np
from io import BytesIO
from typing import Dict, Any, List
import seaborn as sns


class CorrelationChartService:
    """Service for generating correlation visualization charts."""
    
    @staticmethod
    def generate_correlation_chart(
        correlation_data: Dict[str, Any],
        chart_type: str = 'network',
        tracker_id: int = None
    ) -> bytes:
        """
        Generate correlation visualization chart.
        
        Args:
            correlation_data: Correlation data from CorrelationService
            chart_type: Type of chart ('network', 'scatter', 'heatmap')
            tracker_id: Tracker ID for fetching additional data if needed
        
        Returns:
            PNG image as bytes
        """
        if not correlation_data.get('has_correlation', True) and not correlation_data.get('has_correlations', True):
            return CorrelationChartService._generate_no_data_chart(
                correlation_data.get('message', 'No correlations found')
            )
        
        # Get correlations list
        correlations = correlation_data.get('correlations', [])
        if not correlations:
            return CorrelationChartService._generate_no_data_chart(
                "No significant correlations detected"
            )
        
        if chart_type == 'bar' or chart_type == 'line':
            return CorrelationChartService._generate_bar_chart(correlations)
        elif chart_type == 'scatter':
            return CorrelationChartService._generate_scatter_chart(correlation_data, correlations)
        elif chart_type == 'heatmap':
            return CorrelationChartService._generate_heatmap_chart(correlations)
        else:  # 'network' (default)
            return CorrelationChartService._generate_bar_chart(correlations)  # Changed default to bar
    
    @staticmethod
    def _generate_network_chart(correlations: List[Dict[str, Any]]) -> bytes:
        """Generate network diagram showing correlation relationships."""
        
        fig, ax = plt.subplots(figsize=(12, 10))
        
        # Extract unique fields involved
        fields = set()
        edges = []
        
        for corr in correlations[:15]:  # Limit to top 15 correlations
            if corr.get('type') == 'triple':
                # Triple correlation: predictor1 + predictor2 → outcome
                fields.add(corr.get('predictor1', ''))
                fields.add(corr.get('predictor2', ''))
                fields.add(corr.get('outcome', ''))
                edges.append((
                    (corr.get('predictor1', ''), corr.get('predictor2', '')),
                    corr.get('outcome', ''),
                    corr.get('observation_count', 0)
                ))
            else:
                # Dual correlation
                field1 = corr.get('field1', corr.get('predictor1', ''))
                field2 = corr.get('field2', corr.get('outcome', ''))
                fields.add(field1)
                fields.add(field2)
                strength = corr.get('strength', corr.get('correlation', 0))
                edges.append((field1, field2, abs(strength)))
        
        fields = list(fields)
        n = len(fields)
        
        if n == 0:
            return CorrelationChartService._generate_no_data_chart(
                "No fields to visualize"
            )
        
        # Position nodes in a circle
        angles = np.linspace(0, 2 * np.pi, n, endpoint=False)
        positions = {field: (np.cos(angle), np.sin(angle)) 
                    for field, angle in zip(fields, angles)}
        
        # Draw edges
        for edge in edges:
            if isinstance(edge[0], tuple):  # Triple correlation
                # Draw from center of two predictors to outcome
                pred1, pred2 = edge[0]
                outcome = edge[1]
                strength = edge[2] / 10  # Normalize
                
                if pred1 in positions and pred2 in positions and outcome in positions:
                    mid_x = (positions[pred1][0] + positions[pred2][0]) / 2
                    mid_y = (positions[pred1][1] + positions[pred2][1]) / 2
                    
                    ax.plot([mid_x, positions[outcome][0]], 
                           [mid_y, positions[outcome][1]],
                           'g-', alpha=min(strength, 0.8), linewidth=2)
            else:  # Dual correlation
                field1, field2, strength = edge
                if field1 in positions and field2 in positions:
                    ax.plot([positions[field1][0], positions[field2][0]],
                           [positions[field1][1], positions[field2][1]],
                           'b-', alpha=min(abs(strength), 0.8), linewidth=2)
        
        # Draw nodes
        for field, (x, y) in positions.items():
            ax.plot(x, y, 'o', markersize=20, color='#2196F3', alpha=0.7)
            # Add label with word wrap
            label = field.replace('.', '\n').title()
            ax.text(x, y, label, fontsize=8, ha='center', va='center',
                   bbox=dict(boxstyle='round,pad=0.3', facecolor='white', alpha=0.7))
        
        ax.set_xlim(-1.5, 1.5)
        ax.set_ylim(-1.5, 1.5)
        ax.set_aspect('equal')
        ax.axis('off')
        ax.set_title('Correlation Network', fontsize=14, fontweight='bold', pad=20)
        
        # Add legend
        from matplotlib.lines import Line2D
        legend_elements = [
            Line2D([0], [0], color='b', linewidth=2, label='Dual Correlation'),
            Line2D([0], [0], color='g', linewidth=2, label='Triple Correlation')
        ]
        ax.legend(handles=legend_elements, loc='upper right')
        
        plt.tight_layout()
        
        # Save to bytes
        buffer = BytesIO()
        plt.savefig(buffer, format='png', dpi=100, bbox_inches='tight')
        buffer.seek(0)
        plt.close(fig)
        
        return buffer.getvalue()
    
    @staticmethod
    def _generate_bar_chart(correlations: List[Dict[str, Any]]) -> bytes:
        """Generate user-friendly bar chart with annotations showing correlations."""
        
        if not correlations:
            return CorrelationChartService._generate_no_data_chart(
                "No correlations to display"
            )
        
        # Limit to top 10 correlations for clarity
        top_correlations = correlations[:10]
        
        # Prepare data
        labels = []
        strengths = []
        colors = []
        annotations = []
        correlation_types = []
        
        for corr in top_correlations:
            corr_type = corr.get('type', 'dual')
            correlation_types.append(corr_type)
            
            if corr_type == 'triple':
                # Triple: "When A AND B, then C"
                pred1 = corr.get('predictor1', '').replace('.', ' ').title()
                pred2 = corr.get('predictor2', '').replace('.', ' ').title()
                outcome = corr.get('outcome', '').replace('.', ' ').title()
                pred1_val = corr.get('predictor1_value', '')
                pred2_val = corr.get('predictor2_value', '')
                outcome_val = corr.get('outcome_value', '')
                count = corr.get('observation_count', 0)
                
                label = f"When {pred1} = {pred1_val}\nAND {pred2} = {pred2_val}"
                labels.append(label)
                strength = corr.get('strength', 0)
                strengths.append(abs(float(strength)) * 100)  # Convert to percentage
                colors.append('#4CAF50')  # Green for triple
                annotations.append(f"→ {outcome} = {outcome_val}\n({count} times observed)")
                
            else:
                # Dual correlation: "When A, then B"
                field1 = corr.get('field1', corr.get('predictor1', '')).replace('.', ' ').title()
                field2 = corr.get('field2', corr.get('outcome', '')).replace('.', ' ').title()
                
                # Get correlation strength
                strength = corr.get('strength', corr.get('correlation', 0))
                strength_abs = abs(float(strength))
                
                # Determine direction
                if float(strength) > 0:
                    label = f"{field1} ↑"
                    annotation = f"→ {field2} ↑\n(Stronger together)"
                    color = '#2196F3'  # Blue for positive
                else:
                    label = f"{field1} ↑"
                    annotation = f"→ {field2} ↓\n(Opposite relationship)"
                    color = '#F44336'  # Red for negative
                
                labels.append(label)
                strengths.append(strength_abs * 100)  # Convert to percentage
                colors.append(color)
                
                # Add strength label
                if strength_abs > 0.7:
                    strength_label = "Strong"
                elif strength_abs > 0.4:
                    strength_label = "Moderate"
                else:
                    strength_label = "Weak"
                
                annotations.append(f"{annotation}\n{strength_label} ({strength_abs*100:.0f}%)")
        
        # Create figure with more space for annotations
        fig, ax = plt.subplots(figsize=(14, max(8, len(labels) * 1.2)))
        
        # Create horizontal bar chart
        y_pos = np.arange(len(labels))
        bars = ax.barh(y_pos, strengths, color=colors, alpha=0.7, edgecolor='black', linewidth=1.5)
        
        # Add value labels on bars
        for i, (bar, strength, annotation) in enumerate(zip(bars, strengths, annotations)):
            # Position annotation to the right of the bar
            width = bar.get_width()
            
            # Add correlation strength percentage
            ax.text(width + 1, i, f'{strength:.0f}%', 
                   va='center', fontsize=10, fontweight='bold')
            
            # Add detailed annotation below the bar
            ax.text(width + 1, i - 0.15, annotation, 
                   va='top', fontsize=9, style='italic',
                   bbox=dict(boxstyle='round,pad=0.5', facecolor='wheat', alpha=0.7))
        
        # Customize axes
        ax.set_yticks(y_pos)
        ax.set_yticklabels(labels, fontsize=11, fontweight='bold')
        ax.set_xlabel('Correlation Strength (%)', fontsize=12, fontweight='bold')
        ax.set_title('Field Correlations - What Affects What', 
                    fontsize=16, fontweight='bold', pad=20)
        
        # Set x-axis limit to accommodate annotations
        max_strength = max(strengths) if strengths else 100
        ax.set_xlim(0, max_strength * 1.4)
        
        # Add grid for better readability
        ax.grid(axis='x', alpha=0.3, linestyle='--')
        ax.set_axisbelow(True)
        
        # Add legend
        from matplotlib.patches import Patch
        legend_elements = [
            Patch(facecolor='#4CAF50', alpha=0.7, label='Triple Correlation (When A AND B, then C)'),
            Patch(facecolor='#2196F3', alpha=0.7, label='Positive Correlation (A ↑ → B ↑)'),
            Patch(facecolor='#F44336', alpha=0.7, label='Negative Correlation (A ↑ → B ↓)')
        ]
        ax.legend(handles=legend_elements, loc='lower right', fontsize=10)
        
        # Add explanation text
        explanation = "Higher percentage = Stronger relationship\n" \
                     "Triple correlations show combined effects"
        ax.text(0.02, 0.98, explanation, transform=ax.transAxes,
               fontsize=9, verticalalignment='top',
               bbox=dict(boxstyle='round', facecolor='lightblue', alpha=0.5))
        
        plt.tight_layout()
        
        # Save to bytes
        buffer = BytesIO()
        plt.savefig(buffer, format='png', dpi=100, bbox_inches='tight')
        buffer.seek(0)
        plt.close(fig)
        
        return buffer.getvalue()
    
    @staticmethod
    def _generate_scatter_chart(
        correlation_data: Dict[str, Any],
        correlations: List[Dict[str, Any]]
    ) -> bytes:
        """Generate scatter plot for numeric correlation."""
        
        # This would need actual data points - for now, show correlation strength
        fig, ax = plt.subplots(figsize=(10, 8))
        
        # Extract field names and strengths
        fields_x = []
        fields_y = []
        strengths = []
        
        for corr in correlations[:10]:
            field1 = corr.get('field1', corr.get('predictor1', ''))
            field2 = corr.get('field2', corr.get('outcome', ''))
            strength = corr.get('strength', corr.get('correlation', 0))
            
            if field1 and field2:
                fields_x.append(field1.replace('.', ' ').title())
                fields_y.append(field2.replace('.', ' ').title())
                strengths.append(abs(float(strength)))
        
        if not strengths:
            return CorrelationChartService._generate_no_data_chart(
                "No numeric correlations available for scatter plot"
            )
        
        # Create bubble chart showing correlation strengths
        colors = ['#4CAF50' if s > 0.5 else '#FFC107' if s > 0.3 else '#F44336' 
                 for s in strengths]
        sizes = [s * 1000 for s in strengths]
        
        y_positions = range(len(fields_x))
        ax.scatter(strengths, y_positions, s=sizes, c=colors, alpha=0.6)
        
        # Add labels
        ax.set_yticks(y_positions)
        ax.set_yticklabels([f'{x} ↔ {y}' for x, y in zip(fields_x, fields_y)])
        ax.set_xlabel('Correlation Strength')
        ax.set_title('Correlation Strength Visualization', fontsize=14, fontweight='bold')
        ax.grid(axis='x', alpha=0.3)
        ax.set_xlim(0, 1)
        
        plt.tight_layout()
        
        # Save to bytes
        buffer = BytesIO()
        plt.savefig(buffer, format='png', dpi=100, bbox_inches='tight')
        buffer.seek(0)
        plt.close(fig)
        
        return buffer.getvalue()
    
    @staticmethod
    def _generate_heatmap_chart(correlations: List[Dict[str, Any]]) -> bytes:
        """Generate correlation heatmap."""
        
        # Extract all unique fields
        fields = set()
        for corr in correlations:
            field1 = corr.get('field1', corr.get('predictor1', ''))
            field2 = corr.get('field2', corr.get('outcome', ''))
            if field1:
                fields.add(field1)
            if field2:
                fields.add(field2)
        
        fields = sorted(list(fields))
        n = len(fields)
        
        if n < 2:
            return CorrelationChartService._generate_no_data_chart(
                "Need at least 2 fields for heatmap"
            )
        
        # Create correlation matrix
        matrix = np.zeros((n, n))
        
        for corr in correlations:
            field1 = corr.get('field1', corr.get('predictor1', ''))
            field2 = corr.get('field2', corr.get('outcome', ''))
            strength = corr.get('strength', corr.get('correlation', 0))
            
            if field1 in fields and field2 in fields:
                i = fields.index(field1)
                j = fields.index(field2)
                matrix[i, j] = float(strength)
                matrix[j, i] = float(strength)  # Symmetric
        
        # Create heatmap
        fig, ax = plt.subplots(figsize=(10, 8))
        
        sns.heatmap(matrix, 
                   xticklabels=[f.replace('.', ' ').title() for f in fields],
                   yticklabels=[f.replace('.', ' ').title() for f in fields],
                   annot=True, fmt='.2f', cmap='RdYlGn', center=0,
                   square=True, linewidths=0.5, cbar_kws={"shrink": 0.8},
                   ax=ax)
        
        ax.set_title('Correlation Heatmap', fontsize=14, fontweight='bold', pad=20)
        plt.xticks(rotation=45, ha='right')
        plt.yticks(rotation=0)
        
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

