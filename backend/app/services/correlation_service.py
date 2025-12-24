"""
Correlation analysis service for detecting relationships between tracked fields.

Supports:
- Numeric-to-numeric correlations (Pearson correlation)
- Numeric-to-categorical correlations (group comparisons)
- Categorical-to-categorical correlations (association analysis)
- Time-lagged correlations (e.g., yesterday's sleep → today's energy)
"""

from typing import Dict, List, Any, Optional, Tuple
from datetime import date, timedelta
from collections import defaultdict, Counter
from itertools import combinations
import numpy as np
from scipy import stats

from app.models.tracker import Tracker
from app.models.tracking_data import TrackingData
from app.services.analytics_base import (
    AnalyticsDataExtractor,
    FieldTypeDetector
)


class CorrelationService:
    """Detect and analyze correlations between tracked fields."""
    
    # Correlation strength thresholds
    WEAK_CORRELATION = 0.3
    MODERATE_CORRELATION = 0.5
    STRONG_CORRELATION = 0.7
    
    # Minimum data points for reliable correlations
    MIN_DATA_POINTS = 10
    MIN_OBSERVATIONS = 3  # Pattern must be observed at least 3 times
    MIN_SIGNIFICANCE_P_VALUE = 0.05  # 95% confidence
    
    @staticmethod
    def _to_json_serializable(value):
        """Convert numpy types to JSON-serializable Python types."""
        if isinstance(value, (np.integer, np.int64, np.int32)):
            return int(value)
        elif isinstance(value, (np.floating, np.float64, np.float32)):
            return float(value)
        elif isinstance(value, np.bool_):
            return bool(value)
        elif isinstance(value, np.ndarray):
            return value.tolist()
        return value
    
    @staticmethod
    def analyze_all_correlations(
        tracker_id: int,
        months: int = 3,
        min_correlation: float = 0.3,
        include_lagged: bool = True
    ) -> Dict[str, Any]:
        """
        Find the top 3 most meaningful correlations.
        
        Priority:
        1. Triple correlations (When A AND B, then C) - most insightful
        2. Dual correlations (When A, then B) - still useful
        3. Ranked by observation frequency (most observed = most meaningful)
        
        Args:
            tracker_id: Tracker ID
            months: How many months of data to analyze
            min_correlation: Minimum correlation strength to report
            include_lagged: Include time-lagged correlations (yesterday → today)
        
        Returns:
            Top 3 most meaningful correlations
        """
        tracker = Tracker.query.get(tracker_id)
        if not tracker:
            raise ValueError(f"Tracker {tracker_id} not found")
        
        # Get entries
        cutoff_date = date.today() - timedelta(days=months * 30)
        entries = TrackingData.query.filter_by(
            tracker_id=tracker_id
        ).filter(
            TrackingData.entry_date >= cutoff_date
        ).order_by(TrackingData.entry_date.asc()).all()
        
        if len(entries) < CorrelationService.MIN_DATA_POINTS:
            return {
                'message': f'Need at least {CorrelationService.MIN_DATA_POINTS} entries for correlation analysis',
                'entries_available': len(entries),
                'has_correlations': False
            }
        
        # Get all fields tracked
        fields = CorrelationService._get_all_fields(entries)
        
        # Exclude notes/text fields
        fields = [f for f in fields if not f.endswith('.notes') and 'notes' not in f.lower()]
        
        if len(fields) < 2:
            return {
                'message': 'Need at least 2 fields to detect correlations',
                'fields_available': len(fields),
                'has_correlations': False
            }
        
        # Extract all field data organized by date
        field_data_by_date = CorrelationService._extract_all_field_data(
            entries, fields, tracker_id
        )
        
        all_correlations = []
        
        # 1. Find triple correlations (highest priority - most insightful)
        if len(fields) >= 3:
            triple_corrs = CorrelationService._find_triple_correlations(
                field_data_by_date, fields, tracker_id
            )
            all_correlations.extend(triple_corrs)
        
        # 2. Find dual correlations (standard pairwise)
        dual_corrs = CorrelationService._find_dual_correlations(
            field_data_by_date, fields, tracker_id, min_correlation
        )
        all_correlations.extend(dual_corrs)
        
        # 3. Sort by priority: triple first, then by observation count, then strength
        all_correlations.sort(
            key=lambda x: (
                2 if x.get('type') == 'triple' else 1,  # Triple correlations first
                x.get('observation_count', 0),  # Then by observation frequency
                abs(x.get('strength', 0))  # Then by strength
            ),
            reverse=True
        )
        
        # Return only top 3 most meaningful correlations
        top_correlations = all_correlations[:3]
        
        return {
            'tracker_id': tracker_id,
            'analysis_period': {
                'start_date': entries[0].entry_date.isoformat(),
                'end_date': entries[-1].entry_date.isoformat(),
                'months': months,
                'entries_analyzed': len(entries)
            },
            'fields_analyzed': fields,
            'total_correlations_found': len(all_correlations),
            'correlations': top_correlations,
            'has_correlations': len(top_correlations) > 0
        }
    
    @staticmethod
    def analyze_field_correlations(
        tracker_id: int,
        field_name: str,
        months: int = 3,
        min_correlation: float = 0.3,
        include_lagged: bool = True,
        correlation_type: str = 'dual'
    ) -> Dict[str, Any]:
        """
        Find all correlations for a specific field (treated as the outcome).
        
        Args:
            correlation_type: 'triple' for (When A AND B → field) or 'dual' for (When A → field)
        
        Example: "What affects my sleep quality?"
        """
        tracker = Tracker.query.get(tracker_id)
        if not tracker:
            raise ValueError(f"Tracker {tracker_id} not found")
        
        # Get entries
        cutoff_date = date.today() - timedelta(days=months * 30)
        entries = TrackingData.query.filter_by(
            tracker_id=tracker_id
        ).filter(
            TrackingData.entry_date >= cutoff_date
        ).order_by(TrackingData.entry_date.asc()).all()
        
        if len(entries) < CorrelationService.MIN_DATA_POINTS:
            return {
                'message': f'Need at least {CorrelationService.MIN_DATA_POINTS} entries',
                'has_correlations': False
            }
        
        # Resolve field name (handles parent fields like 'mood' → 'mood.overall')
        try:
            resolved_field_name = CorrelationService._resolve_field_name(field_name, entries)
            if resolved_field_name != field_name:
                # Inform user about the resolution
                original_field_name = field_name
                field_name = resolved_field_name
        except ValueError as e:
            raise ValueError(str(e))
        
        # Get all other fields (exclude the target field and notes)
        all_fields = CorrelationService._get_all_fields(entries)
        all_fields = [f for f in all_fields if f != field_name and not f.endswith('.notes')]
        
        # Extract all field data organized by date (needed for triple correlations)
        all_fields_with_target = all_fields + [field_name]
        field_data_by_date = CorrelationService._extract_all_field_data(
            entries, all_fields_with_target, tracker_id
        )
        
        correlations = []
        
        if correlation_type == 'triple':
            # TRIPLE CORRELATIONS: When field1 AND field2 → field_name
            for (field1, field2) in combinations(all_fields, 2):
                # Skip if predictors share same parent
                if '.' in field1 and '.' in field2:
                    if field1.split('.')[0] == field2.split('.')[0]:
                        continue
                
                # Skip if either predictor shares parent with outcome
                field_name_parent = field_name.split('.')[0] if '.' in field_name else field_name
                field1_parent = field1.split('.')[0] if '.' in field1 else field1
                field2_parent = field2.split('.')[0] if '.' in field2 else field2
                
                if field_name_parent == field1_parent or field_name_parent == field2_parent:
                    continue
                
                # Same-day triple correlation
                correlation = CorrelationService._analyze_triple_pattern(
                    field_data_by_date, field1, field2, field_name, tracker_id
                )
                
                if correlation and CorrelationService._is_meaningful_correlation(correlation, min_correlation):
                    correlations.append(correlation)
                
                if len(correlations) >= 3:
                    break
        
        else:
            # DUAL CORRELATIONS: When field → field_name
            for other_field in all_fields:
                # Skip same-parent fields
                if '.' in field_name and '.' in other_field:
                    if field_name.split('.')[0] == other_field.split('.')[0]:
                        continue
                
                # Same-day dual correlation
                correlation = CorrelationService._analyze_field_pair(
                    entries, other_field, field_name, tracker_id, lag_days=0
                )
                
                if correlation and CorrelationService._is_meaningful_correlation(correlation, min_correlation):
                    correlations.append(correlation)
                
                if len(correlations) >= 3:
                    break
                
                # Lagged dual correlation
                if include_lagged and len(correlations) < 3:
                    for lag in [1, 2, 3]:
                        lagged = CorrelationService._analyze_field_pair(
                            entries, other_field, field_name, tracker_id, lag_days=lag
                        )
                        
                        if lagged and CorrelationService._is_meaningful_correlation(lagged, min_correlation):
                            correlations.append(lagged)
                            break
                
                if len(correlations) >= 3:
                    break
        
        # Sort correlations by observation count (most frequent patterns first)
        if correlation_type == 'triple':
            # For triple correlations, sort by observation_count
            correlations.sort(
                key=lambda x: x.get('observation_count', 0),
                reverse=True
            )
        else:
            # For dual correlations, sort by type and strength
            correlations.sort(
                key=lambda x: (
                    2 if x.get('correlation_type') == 'numeric_numeric' else 
                    1 if 'numeric' in x.get('correlation_type', '') else 0,
                    abs(x.get('strength', 0))
                ),
                reverse=True
            )
        
        # Return only top 3 correlations
        top_correlations = correlations[:3]
        
        result = {
            'field_name': field_name,
            'correlation_type': correlation_type,
            'correlations_found': len(top_correlations),
            'correlations': top_correlations,
            'has_correlations': len(top_correlations) > 0,
            'analysis_period': {
                'months': months,
                'start_date': cutoff_date.isoformat(),
                'end_date': date.today().isoformat(),
                'entries_analyzed': len(entries)
            }
        }
        
        # Add note if field was resolved from parent
        if 'original_field_name' in locals():
            result['field_resolved'] = {
                'requested': original_field_name,
                'resolved_to': field_name
            }
        
        return result
    
    @staticmethod
    def analyze_specific_correlation(
        tracker_id: int,
        field1: str,
        field2: str,
        months: int = 3,
        lag_days: int = 0,
        field3: str = None
    ) -> Dict[str, Any]:
        """
        Analyze correlation between specific fields.
        
        - If field3 is None: Dual correlation (field1 → field2)
        - If field3 is provided: Triple correlation (field1 AND field2 → field3)
        
        Examples:
        - Dual: "Does sleep.hours affect mood.overall?"
        - Triple: "When sleep.hours=6 AND stress.level=high, what happens to mood.overall?"
        """
        tracker = Tracker.query.get(tracker_id)
        if not tracker:
            raise ValueError(f"Tracker {tracker_id} not found")
        
        # Get entries
        cutoff_date = date.today() - timedelta(days=months * 30)
        entries = TrackingData.query.filter_by(
            tracker_id=tracker_id
        ).filter(
            TrackingData.entry_date >= cutoff_date
        ).order_by(TrackingData.entry_date.asc()).all()
        
        if len(entries) < CorrelationService.MIN_DATA_POINTS:
            return {
                'message': f'Need at least {CorrelationService.MIN_DATA_POINTS} entries',
                'has_correlation': False
            }
        
        # Resolve field names (handles parent fields like 'mood' → 'mood.overall')
        try:
            field1 = CorrelationService._resolve_field_name(field1, entries)
            field2 = CorrelationService._resolve_field_name(field2, entries)
            if field3:
                field3 = CorrelationService._resolve_field_name(field3, entries)
        except ValueError as e:
            raise ValueError(str(e))
        
        # Triple correlation
        if field3:
            # Extract all field data organized by date
            field_data_by_date = CorrelationService._extract_all_field_data(
                entries, [field1, field2, field3], tracker_id
            )
            
            correlation = CorrelationService._analyze_triple_pattern(
                field_data_by_date, field1, field2, field3, tracker_id
            )
            
            if not correlation:
                return {
                    'message': 'Could not calculate triple correlation (insufficient data or no clear pattern)',
                    'has_correlation': False,
                    'correlation_type': 'triple'
                }
            
            return {
                **correlation,
                'has_correlation': True,
                'analysis_period': {
                    'months': months,
                    'start_date': cutoff_date.isoformat(),
                    'end_date': date.today().isoformat(),
                    'entries_analyzed': len(entries)
                }
            }
        
        # Dual correlation
        else:
            correlation = CorrelationService._analyze_field_pair(
                entries, field1, field2, tracker_id, lag_days
            )
            
            if not correlation:
                return {
                    'message': 'Could not calculate correlation (insufficient data)',
                    'has_correlation': False,
                    'correlation_type': 'dual'
                }
            
            return {
                **correlation,
                'has_correlation': True,
                'analysis_period': {
                    'months': months,
                    'start_date': cutoff_date.isoformat(),
                    'end_date': date.today().isoformat(),
                    'entries_analyzed': len(entries)
                }
            }
    
    # ========================================================================
    # PRIVATE HELPER METHODS
    # ========================================================================
    
    @staticmethod
    def _analyze_field_pair(
        entries: List[TrackingData],
        field1: str,
        field2: str,
        tracker_id: int,
        lag_days: int = 0
    ) -> Optional[Dict[str, Any]]:
        """
        Analyze correlation between two fields.
        
        lag_days: 
            0 = same-day correlation
            1 = field1 yesterday → field2 today
        """
        # Detect field types
        type1, _ = FieldTypeDetector.detect_field_type(field1, tracker_id)
        type2, _ = FieldTypeDetector.detect_field_type(field2, tracker_id)
        
        # Extract values
        extracted1 = AnalyticsDataExtractor.extract_field_values(
            entries, field1, None, tracker_id
        )
        extracted2 = AnalyticsDataExtractor.extract_field_values(
            entries, field2, None, tracker_id
        )
        
        if not extracted1 or not extracted2:
            return None
        
        # Create date-indexed dictionaries
        data1_by_date = {item['entry_date']: item['value'] for item in extracted1}
        data2_by_date = {item['entry_date']: item['value'] for item in extracted2}
        
        # Fallback: Re-detect type based on actual values
        # Sometimes field type detection fails for numeric fields stored as values
        sample_values1 = [v for v in list(data1_by_date.values())[:20] if v is not None]
        sample_values2 = [v for v in list(data2_by_date.values())[:20] if v is not None]
        
        # Check if values are actually numeric
        if sample_values1 and all(isinstance(v, (int, float)) for v in sample_values1):
            type1 = 'numeric'
        if sample_values2 and all(isinstance(v, (int, float)) for v in sample_values2):
            type2 = 'numeric'
        
        # Apply lag if needed
        if lag_days > 0:
            # field1 is lagged (yesterday's value)
            lagged_data1 = {}
            for entry_date, value in data1_by_date.items():
                future_date = entry_date + timedelta(days=lag_days)
                lagged_data1[future_date] = value
            data1_by_date = lagged_data1
        
        # Find overlapping dates
        common_dates = set(data1_by_date.keys()) & set(data2_by_date.keys())
        
        if len(common_dates) < CorrelationService.MIN_DATA_POINTS:
            return None
        
        # Get paired values
        paired_values = [
            (data1_by_date[d], data2_by_date[d])
            for d in sorted(common_dates)
            if data1_by_date[d] is not None and data2_by_date[d] is not None
        ]
        
        if len(paired_values) < CorrelationService.MIN_DATA_POINTS:
            return None
        
        # Analyze based on field types
        if type1 == 'numeric' and type2 == 'numeric':
            return CorrelationService._analyze_numeric_numeric(
                paired_values, field1, field2, lag_days
            )
        elif type1 == 'numeric' and type2 == 'categorical':
            return CorrelationService._analyze_numeric_categorical(
                paired_values, field1, field2, lag_days, reverse=False
            )
        elif type1 == 'categorical' and type2 == 'numeric':
            return CorrelationService._analyze_numeric_categorical(
                [(v2, v1) for v1, v2 in paired_values],
                field2, field1, lag_days, reverse=True
            )
        else:  # Both categorical
            return CorrelationService._analyze_categorical_categorical(
                paired_values, field1, field2, lag_days
            )
    
    @staticmethod
    def _analyze_numeric_numeric(
        paired_values: List[Tuple],
        field1: str,
        field2: str,
        lag_days: int
    ) -> Dict[str, Any]:
        """Analyze correlation between two numeric fields using Pearson correlation."""
        values1 = [float(v1) for v1, v2 in paired_values]
        values2 = [float(v2) for v1, v2 in paired_values]
        
        # Calculate Pearson correlation
        correlation, p_value = stats.pearsonr(values1, values2)
        
        # Check significance
        is_significant = p_value < CorrelationService.MIN_SIGNIFICANCE_P_VALUE
        
        # Determine strength
        abs_corr = abs(correlation)
        if abs_corr >= CorrelationService.STRONG_CORRELATION:
            strength_label = 'strong'
        elif abs_corr >= CorrelationService.MODERATE_CORRELATION:
            strength_label = 'moderate'
        elif abs_corr >= CorrelationService.WEAK_CORRELATION:
            strength_label = 'weak'
        else:
            strength_label = 'very_weak'
        
        # Determine direction
        if correlation > 0:
            direction = 'positive'
            relationship = f"When {field1} increases, {field2} tends to increase"
        else:
            direction = 'negative'
            relationship = f"When {field1} increases, {field2} tends to decrease"
        
        # Calculate effect size
        # For every 1 unit change in field1, how much does field2 change?
        if np.std(values1) > 0:
            slope = correlation * (np.std(values2) / np.std(values1))
        else:
            slope = 0
        
        return {
            'field1': field1,
            'field2': field2,
            'correlation_type': 'numeric_numeric',
            'correlation': float(round(correlation, 3)),
            'strength': float(abs_corr),
            'strength_label': strength_label,
            'direction': direction,
            'p_value': float(round(p_value, 4)),
            'is_significant': bool(is_significant),
            'sample_size': int(len(paired_values)),
            'lag_days': int(lag_days),
            'slope': float(round(slope, 3)),
            'relationship': relationship,
            'insight': CorrelationService._generate_numeric_insight(
                field1, field2, correlation, slope, lag_days
            )
        }
    
    @staticmethod
    def _analyze_numeric_categorical(
        paired_values: List[Tuple],
        numeric_field: str,
        categorical_field: str,
        lag_days: int,
        reverse: bool = False
    ) -> Dict[str, Any]:
        """
        Analyze relationship between numeric and categorical field.
        
        Example: "mood.overall (numeric) when energy.consistency is 'steady' vs 'crashed'"
        """
        if reverse:
            # Swap back for correct analysis
            paired_values = [(v2, v1) for v1, v2 in paired_values]
        
        # Group numeric values by categorical value
        groups = defaultdict(list)
        for numeric_val, categorical_val in paired_values:
            if categorical_val is not None:
                # Handle lists (multiple choice fields)
                if isinstance(categorical_val, list):
                    for val in categorical_val:
                        groups[str(val)].append(float(numeric_val))
                else:
                    groups[str(categorical_val)].append(float(numeric_val))
        
        # Need at least 2 groups to compare
        if len(groups) < 2:
            return None
        
        # Calculate statistics for each group
        group_stats = {}
        for category, values in groups.items():
            if len(values) >= 3:  # Need at least 3 values per group
                group_stats[category] = {
                    'mean': float(np.mean(values)),
                    'std': float(np.std(values)),
                    'count': int(len(values))
                }
        
        if len(group_stats) < 2:
            return None
        
        # Find highest and lowest groups
        sorted_groups = sorted(
            group_stats.items(),
            key=lambda x: x[1]['mean'],
            reverse=True
        )
        
        highest_group = sorted_groups[0]
        lowest_group = sorted_groups[-1]
        
        difference = highest_group[1]['mean'] - lowest_group[1]['mean']
        percent_diff = (difference / lowest_group[1]['mean'] * 100) if lowest_group[1]['mean'] != 0 else 0
        
        # Perform ANOVA to test if differences are significant
        group_values = [values for values in groups.values() if len(values) >= 3]
        if len(group_values) >= 2:
            f_stat, p_value = stats.f_oneway(*group_values)
            is_significant = p_value < CorrelationService.MIN_SIGNIFICANCE_P_VALUE
        else:
            f_stat, p_value = 0, 1.0
            is_significant = False
        
        # Calculate effect size (eta-squared for ANOVA)
        all_values = [v for values in groups.values() for v in values]
        grand_mean = np.mean(all_values)
        ss_between = sum(
            len(values) * (np.mean(values) - grand_mean) ** 2
            for values in groups.values()
        )
        ss_total = sum((v - grand_mean) ** 2 for v in all_values)
        eta_squared = ss_between / ss_total if ss_total > 0 else 0
        
        # Determine strength from eta-squared
        if eta_squared >= 0.14:
            strength_label = 'strong'
        elif eta_squared >= 0.06:
            strength_label = 'moderate'
        elif eta_squared >= 0.01:
            strength_label = 'weak'
        else:
            strength_label = 'very_weak'
        
        return {
            'field1': categorical_field if reverse else numeric_field,
            'field2': numeric_field if reverse else categorical_field,
            'correlation_type': 'numeric_categorical',
            'strength': float(eta_squared),
            'strength_label': strength_label,
            'p_value': float(round(p_value, 4)),
            'is_significant': bool(is_significant),
            'sample_size': int(len(paired_values)),
            'lag_days': int(lag_days),
            'group_stats': group_stats,
            'highest_group': {
                'category': str(highest_group[0]),
                'average': float(round(highest_group[1]['mean'], 2)),
                'count': int(highest_group[1]['count'])
            },
            'lowest_group': {
                'category': str(lowest_group[0]),
                'average': float(round(lowest_group[1]['mean'], 2)),
                'count': int(lowest_group[1]['count'])
            },
            'difference': float(round(difference, 2)),
            'percent_difference': float(round(percent_diff, 1)),
            'insight': CorrelationService._generate_categorical_numeric_insight(
                categorical_field, numeric_field, highest_group, lowest_group,
                difference, percent_diff, lag_days, reverse
            )
        }
    
    @staticmethod
    def _analyze_categorical_categorical(
        paired_values: List[Tuple],
        field1: str,
        field2: str,
        lag_days: int
    ) -> Optional[Dict[str, Any]]:
        """Analyze association between two categorical fields."""
        # Need minimum data for reliable categorical associations
        if len(paired_values) < 12:
            return None
        
        # Create contingency table
        contingency = defaultdict(lambda: defaultdict(int))
        
        for val1, val2 in paired_values:
            # Handle lists
            vals1 = val1 if isinstance(val1, list) else [val1]
            vals2 = val2 if isinstance(val2, list) else [val2]
            
            for v1 in vals1:
                for v2 in vals2:
                    if v1 is not None and v2 is not None:
                        contingency[str(v1)][str(v2)] += 1
        
        if len(contingency) < 2:
            return None
        
        # Convert to matrix for chi-square test
        categories1 = sorted(contingency.keys())
        categories2 = sorted(set(
            cat2 for cats in contingency.values() for cat2 in cats.keys()
        ))
        
        observed = []
        for cat1 in categories1:
            row = [contingency[cat1].get(cat2, 0) for cat2 in categories2]
            observed.append(row)
        
        observed = np.array(observed)
        
        # Chi-square test
        try:
            chi2, p_value, dof, expected = stats.chi2_contingency(observed)
            
            # Cramér's V (effect size for categorical associations)
            n = observed.sum()
            min_dim = min(len(categories1), len(categories2)) - 1
            cramers_v = np.sqrt(chi2 / (n * min_dim)) if min_dim > 0 else 0
            
            is_significant = p_value < CorrelationService.MIN_SIGNIFICANCE_P_VALUE
            
            # Determine strength from Cramér's V
            if cramers_v >= 0.5:
                strength_label = 'strong'
            elif cramers_v >= 0.3:
                strength_label = 'moderate'
            elif cramers_v >= 0.1:
                strength_label = 'weak'
            else:
                strength_label = 'very_weak'
            
            # Find strongest associations
            associations = []
            for i, cat1 in enumerate(categories1):
                for j, cat2 in enumerate(categories2):
                    if observed[i, j] > 0:
                        # Calculate residual (observed vs expected)
                        residual = (observed[i, j] - expected[i, j]) / np.sqrt(expected[i, j]) if expected[i, j] > 0 else 0
                        # Only include meaningful associations (observed multiple times with strong residual)
                        if abs(residual) > 2 and observed[i, j] >= 2:  # At least 2 observations (not just 1)
                            associations.append({
                                'category1': str(cat1),
                                'category2': str(cat2),
                                'count': int(observed[i, j]),
                                'expected': float(round(expected[i, j], 1)),
                                'residual': float(round(residual, 2))
                            })
            
            # Only return if there are meaningful associations
            if not associations:
                return None
            
            return {
                'field1': field1,
                'field2': field2,
                'correlation_type': 'categorical_categorical',
                'strength': float(cramers_v),
                'strength_label': strength_label,
                'chi_square': float(round(chi2, 3)),
                'p_value': float(round(p_value, 4)),
                'is_significant': bool(is_significant),
                'sample_size': int(len(paired_values)),
                'lag_days': int(lag_days),
                'categories1': [str(c) for c in categories1],
                'categories2': [str(c) for c in categories2],
                'strong_associations': sorted(
                    associations,
                    key=lambda x: abs(x['residual']),
                    reverse=True
                )[:5],
                'insight': CorrelationService._generate_categorical_insight(
                    field1, field2, associations, lag_days
                )
            }
        
        except Exception:
            return None
    
    @staticmethod
    def _generate_numeric_insight(
        field1: str,
        field2: str,
        correlation: float,
        slope: float,
        lag_days: int
    ) -> str:
        """Generate user-friendly insight for numeric correlation."""
        lag_text = ""
        if lag_days == 1:
            lag_text = " the next day"
        elif lag_days > 1:
            lag_text = f" {lag_days} days later"
        
        if abs(correlation) >= CorrelationService.STRONG_CORRELATION:
            strength = "strongly"
        elif abs(correlation) >= CorrelationService.MODERATE_CORRELATION:
            strength = "moderately"
        else:
            strength = "weakly"
        
        if correlation > 0:
            direction_word = "increases"
            relationship = "linked"
        else:
            direction_word = "decreases"
            relationship = "inversely linked"
        
        # User-friendly phrasing
        if abs(slope) >= 1:
            return f"Higher {field1} is {relationship} with higher {field2}{lag_text} (for every 1-point increase in {field1}, {field2} {direction_word} by ~{abs(slope):.1f} points)"
        else:
            return f"{field1} and {field2} are {strength} {relationship}{lag_text} (correlation: {correlation:+.2f})"
    
    @staticmethod
    def _generate_categorical_numeric_insight(
        categorical_field: str,
        numeric_field: str,
        highest_group: Tuple,
        lowest_group: Tuple,
        difference: float,
        percent_diff: float,
        lag_days: int,
        reverse: bool
    ) -> str:
        """Generate user-friendly insight for categorical-numeric correlation."""
        lag_text = ""
        if lag_days == 1:
            lag_text = " the next day"
        elif lag_days > 1:
            lag_text = f" {lag_days} days later"
        
        # Simplify category names for readability
        high_cat = str(highest_group[0])
        low_cat = str(lowest_group[0])
        
        if reverse:
            insight = f"When {numeric_field} is tracked{lag_text}, {categorical_field} tends to be '{high_cat}' (avg: {highest_group[1]['mean']:.1f}) rather than '{low_cat}' (avg: {lowest_group[1]['mean']:.1f})"
        else:
            if abs(difference) >= 2:
                # Significant difference - emphasize it
                better_worse = "higher" if difference > 0 else "lower"
                insight = f"{numeric_field} is {better_worse} when {categorical_field} is '{high_cat}' ({highest_group[1]['mean']:.1f}) compared to '{low_cat}' ({lowest_group[1]['mean']:.1f}){lag_text}"
            else:
                insight = f"{categorical_field} = '{high_cat}' shows slightly different {numeric_field} ({highest_group[1]['mean']:.1f}) vs '{low_cat}' ({lowest_group[1]['mean']:.1f}){lag_text}"
        
        return insight
    
    @staticmethod
    def _generate_categorical_insight(
        field1: str,
        field2: str,
        associations: List[Dict],
        lag_days: int
    ) -> str:
        """Generate user-friendly insight for categorical-categorical correlation."""
        if not associations:
            return f"{field1} and {field2} show no strong associations"
        
        lag_text = ""
        if lag_days == 1:
            lag_text = " the next day"
        elif lag_days > 1:
            lag_text = f" {lag_days} days later"
        
        top = associations[0]
        
        # More user-friendly phrasing based on frequency
        count = top['count']
        if count >= 10:
            frequency = "consistently"
        elif count >= 6:
            frequency = "frequently"
        elif count >= 4:
            frequency = "often"
        elif count >= 2:
            frequency = "sometimes"
        else:
            # This shouldn't happen with our filter, but handle it
            return f"{field1} and {field2} show weak association"
        
        insight = f"When {field1} is '{top['category1']}', {field2} is {frequency} '{top['category2']}'{lag_text} ({count} times)"
        
        return insight
    
    @staticmethod
    def _generate_correlation_insights(
        field_name: str,
        correlations: List[Dict]
    ) -> List[str]:
        """Generate summary insights for a field's correlations."""
        insights = []
        
        if not correlations:
            insights.append(f"No significant correlations found for {field_name}")
            return insights
        
        # Top positive correlation
        positive = [c for c in correlations if c.get('direction') == 'positive' or c.get('correlation', 0) > 0]
        if positive:
            top_pos = positive[0]
            insights.append(f"Strongest positive link: {top_pos.get('insight', '')}")
        
        # Top negative correlation
        negative = [c for c in correlations if c.get('direction') == 'negative' or c.get('correlation', 0) < 0]
        if negative:
            top_neg = negative[0]
            insights.append(f"Strongest negative link: {top_neg.get('insight', '')}")
        
        # Time-lagged correlations
        lagged = [c for c in correlations if c.get('lag_days', 0) > 0]
        if lagged:
            insights.append(f"Found {len(lagged)} time-lagged correlation(s) (yesterday → today effects)")
        
        return insights
    
    @staticmethod
    def _is_meaningful_correlation(correlation: Dict[str, Any], min_correlation: float) -> bool:
        """
        Filter out spurious/meaningless correlations.
        
        Returns True if correlation is meaningful and should be reported.
        """
        if not correlation:
            return False
        
        # Must meet minimum strength
        if correlation.get('strength', 0) < min_correlation:
            return False
        
        # Must be statistically significant
        if not correlation.get('is_significant', False):
            return False
        
        # Filter out perfect correlations between similar fields (likely spurious)
        # Example: mood.overall and body.body_satisfaction both ratings 1-10
        if correlation.get('correlation_type') == 'categorical_categorical':
            strength = correlation.get('strength', 0)
            
            # Perfect correlation (1.0) between categorical fields is suspicious
            # Usually means identical or near-identical data patterns
            if strength >= 0.99:
                return False
            
            # Must have meaningful associations (not just single observations)
            strong_assoc = correlation.get('strong_associations', [])
            if not strong_assoc:
                return False
            
            # Check that at least one association has meaningful count (>= 2, not just 1)
            max_count = max((a.get('count', 0) for a in strong_assoc), default=0)
            if max_count < 2:
                return False
            
            # Skip correlations between fields with very similar names
            field1 = correlation.get('field1', '')
            field2 = correlation.get('field2', '')
            
            # Skip if both fields are from same parent (e.g., sleep.quality vs sleep.hours)
            # These are expected to correlate and not insightful
            if '.' in field1 and '.' in field2:
                parent1 = field1.split('.')[0]
                parent2 = field2.split('.')[0]
                if parent1 == parent2:
                    # Allow some within-parent correlations but be selective
                    if strength < 0.6:
                        return False
        
        # For numeric correlations, avoid very weak ones
        if correlation.get('correlation_type') == 'numeric_numeric':
            if abs(correlation.get('correlation', 0)) < 0.35:
                return False
        
        return True
    
    @staticmethod
    def _find_triple_correlations(
        field_data_by_date: Dict,
        all_fields: List[str],
        tracker_id: int
    ) -> List[Dict[str, Any]]:
        """
        Find triple correlations: When field1=A AND field2=B, then field3=C
        
        All three fields must be from DIFFERENT parents (no same-domain correlations).
        
        Valid examples:
        - "When sleep.hours is 'low' AND workout.did_workout is 'no', mood.overall is 'low'"
        - "When stress.level is 'high' AND hydration.water_glasses is 'low', sleep.quality is 'low'"
        
        Invalid (filtered out):
        - "When discharge.consistency is 'dry' AND discharge.amount is 'none', mood is X"
          (discharge.consistency and discharge.amount are same parent - tautological)
        """
        triple_correlations = []
        
        # Limit fields to avoid explosion (focus on most tracked ones)
        frequent_fields = all_fields[:15] if len(all_fields) > 15 else all_fields
        
        # Try each field as outcome
        for outcome_field in frequent_fields:
            outcome_parent = outcome_field.split('.')[0] if '.' in outcome_field else outcome_field
            
            # Try pairs of other fields as predictors
            predictor_candidates = [
                f for f in frequent_fields 
                if f != outcome_field and 
                (f.split('.')[0] if '.' in f else f) != outcome_parent  # Different parent from outcome
            ]
            
            if len(predictor_candidates) < 2:
                continue
            
            # Limit predictor combinations to avoid explosion
            for pred1, pred2 in list(combinations(predictor_candidates, 2))[:20]:
                # Ensure all three fields are from different parents
                pred1_parent = pred1.split('.')[0] if '.' in pred1 else pred1
                pred2_parent = pred2.split('.')[0] if '.' in pred2 else pred2
                
                # Skip if predictors share same parent (e.g., sleep.hours AND sleep.quality)
                if pred1_parent == pred2_parent:
                    continue
                
                # Skip if outcome shares parent with either predictor
                if outcome_parent == pred1_parent or outcome_parent == pred2_parent:
                    continue
                
                pattern = CorrelationService._analyze_triple_pattern(
                    field_data_by_date, pred1, pred2, outcome_field, tracker_id
                )
                
                if pattern:
                    triple_correlations.append(pattern)
        
        return triple_correlations
    
    @staticmethod
    def _analyze_triple_pattern(
        field_data_by_date: Dict,
        predictor1: str,
        predictor2: str,
        outcome: str,
        tracker_id: int
    ) -> Optional[Dict[str, Any]]:
        """Analyze triple pattern: When pred1=A AND pred2=B, outcome=C"""
        pred1_data = field_data_by_date.get(predictor1, {})
        pred2_data = field_data_by_date.get(predictor2, {})
        outcome_data = field_data_by_date.get(outcome, {})
        
        # Find dates where all three have data
        common_dates = set(pred1_data.keys()) & set(pred2_data.keys()) & set(outcome_data.keys())
        
        if len(common_dates) < 10:
            return None
        
        # Group by predictor combinations
        patterns = defaultdict(list)
        
        for date_key in common_dates:
            pred1_val = CorrelationService._categorize_value(pred1_data[date_key], predictor1)
            pred2_val = CorrelationService._categorize_value(pred2_data[date_key], predictor2)
            outcome_val = CorrelationService._categorize_value(outcome_data[date_key], outcome)
            
            if pred1_val and pred2_val and outcome_val:
                key = (pred1_val, pred2_val)
                patterns[key].append(outcome_val)
        
        # Find most frequent pattern (highest observation count)
        best_pattern = None
        best_count = 0
        best_outcome = None
        
        for (pred1_val, pred2_val), outcome_vals in patterns.items():
            if len(outcome_vals) >= CorrelationService.MIN_OBSERVATIONS:
                most_common_outcome = Counter(outcome_vals).most_common(1)[0]
                outcome_val, count_in_pattern = most_common_outcome
                
                # Total observations of this pattern
                total_count = len(outcome_vals)
                
                if total_count > best_count:
                    best_count = total_count
                    best_pattern = (pred1_val, pred2_val)
                    best_outcome = outcome_val
        
        if not best_pattern or best_count < CorrelationService.MIN_OBSERVATIONS:
            return None
        
        return {
            'type': 'triple',
            'predictor1': predictor1,
            'predictor1_value': best_pattern[0],
            'predictor2': predictor2,
            'predictor2_value': best_pattern[1],
            'outcome': outcome,
            'outcome_value': best_outcome,
            'observation_count': int(best_count),
            'strength': float(best_count / len(common_dates)),
            'insight': f"When {predictor1} is '{best_pattern[0]}' AND {predictor2} is '{best_pattern[1]}', {outcome} is typically '{best_outcome}' ({best_count} times)"
        }
    
    @staticmethod
    def _find_dual_correlations(
        field_data_by_date: Dict,
        all_fields: List[str],
        tracker_id: int,
        min_correlation: float
    ) -> List[Dict[str, Any]]:
        """Find dual correlations ranked by observation frequency."""
        dual_correlations = []
        
        # Analyze pairs
        for field1, field2 in combinations(all_fields[:15], 2):
            # Skip same-parent fields
            if '.' in field1 and '.' in field2:
                if field1.split('.')[0] == field2.split('.')[0]:
                    continue
            
            pattern = CorrelationService._analyze_dual_frequent_pattern(
                field_data_by_date, field1, field2, tracker_id, min_correlation
            )
            
            if pattern:
                dual_correlations.append(pattern)
        
        return dual_correlations
    
    @staticmethod
    def _analyze_dual_frequent_pattern(
        field_data_by_date: Dict,
        field1: str,
        field2: str,
        tracker_id: int,
        min_correlation: float
    ) -> Optional[Dict[str, Any]]:
        """Analyze dual pattern focusing on most frequent observations."""
        field1_data = field_data_by_date.get(field1, {})
        field2_data = field_data_by_date.get(field2, {})
        
        common_dates = set(field1_data.keys()) & set(field2_data.keys())
        
        if len(common_dates) < 10:
            return None
        
        # Detect types
        type1, _ = FieldTypeDetector.detect_field_type(field1, tracker_id)
        type2, _ = FieldTypeDetector.detect_field_type(field2, tracker_id)
        
        # Check actual values
        sample1 = [field1_data[d] for d in list(common_dates)[:10]]
        sample2 = [field2_data[d] for d in list(common_dates)[:10]]
        if all(isinstance(v, (int, float)) for v in sample1 if v is not None):
            type1 = 'numeric'
        if all(isinstance(v, (int, float)) for v in sample2 if v is not None):
            type2 = 'numeric'
        
        # Both numeric - use correlation coefficient
        if type1 == 'numeric' and type2 == 'numeric':
            values1 = [float(field1_data[d]) for d in common_dates if isinstance(field1_data[d], (int, float))]
            values2 = [float(field2_data[d]) for d in common_dates if isinstance(field2_data[d], (int, float))]
            
            if len(values1) < 10:
                return None
            
            correlation, p_value = stats.pearsonr(values1, values2)
            
            if p_value >= 0.05 or abs(correlation) < min_correlation:
                return None
            
            direction = "increases" if correlation > 0 else "decreases"
            
            return {
                'type': 'dual',
                'field1': field1,
                'field2': field2,
                'correlation_type': 'numeric',
                'correlation': float(round(correlation, 2)),
                'observation_count': len(values1),
                'strength': float(abs(correlation)),
                'insight': f"Higher {field1} → {field2} {direction} (observed {len(values1)} times, correlation: {correlation:+.2f})"
            }
        
        # Categorical - find most frequent pattern
        patterns = defaultdict(int)
        
        for date_key in common_dates:
            val1 = CorrelationService._categorize_value(field1_data[date_key], field1)
            val2 = CorrelationService._categorize_value(field2_data[date_key], field2)
            
            if val1 and val2:
                patterns[(val1, val2)] += 1
        
        if not patterns:
            return None
        
        # Get most frequent pattern
        (val1, val2), count = max(patterns.items(), key=lambda x: x[1])
        
        if count < CorrelationService.MIN_OBSERVATIONS:
            return None
        
        return {
            'type': 'dual',
            'field1': field1,
            'field1_value': val1,
            'field2': field2,
            'field2_value': val2,
            'correlation_type': 'categorical',
            'observation_count': int(count),
            'strength': float(count / len(common_dates)),
            'insight': f"When {field1} is '{val1}', {field2} is often '{val2}' ({count} times)"
        }
    
    @staticmethod
    def _categorize_value(value: Any, field_name: str) -> Optional[str]:
        """Categorize a value for pattern detection."""
        if value is None:
            return None
        
        # Handle lists (multiple choice)
        if isinstance(value, list):
            if not value:
                return None
            return ', '.join(sorted(str(v) for v in value))
        
        # Numeric values - categorize ratings into meaningful groups
        if isinstance(value, (int, float)):
            # For ratings (1-10), create meaningful groups
            option_name = field_name.split('.')[-1] if '.' in field_name else field_name
            if option_name in ['overall', 'level', 'quality', 'satisfaction', 'health']:
                if value >= 8:
                    return 'high'
                elif value >= 5:
                    return 'medium'
                else:
                    return 'low'
            # For counts/hours, use ranges
            elif option_name in ['hours', 'glasses', 'cups', 'servings', 'count']:
                return str(value)  # Keep actual value
            else:
                return str(value)
        
        # Boolean
        if isinstance(value, bool):
            return 'yes' if value else 'no'
        
        return str(value)
    
    @staticmethod
    def _extract_all_field_data(
        entries: List[TrackingData],
        fields: List[str],
        tracker_id: int
    ) -> Dict[str, Dict[date, Any]]:
        """Extract all field data indexed by date."""
        field_data = {}
        
        for field in fields:
            extracted = AnalyticsDataExtractor.extract_field_values(
                entries, field, None, tracker_id
            )
            
            if extracted:
                field_data[field] = {
                    item['entry_date']: item['value']
                    for item in extracted
                    if item['value'] is not None
                }
        
        return field_data
    
    @staticmethod
    def _resolve_field_name(
        field_name: str,
        entries: List[TrackingData]
    ) -> str:
        """
        Resolve field name to actual field path.
        
        If user provides parent field (e.g., 'mood'), resolve to first child field (e.g., 'mood.overall').
        Excludes notes fields.
        
        Args:
            field_name: Field name provided by user (can be parent or full path)
            entries: List of tracking entries to extract available fields from
        
        Returns:
            Resolved field path
        
        Raises:
            ValueError: If field doesn't exist or only has notes fields
        """
        # Get all available fields
        all_fields = CorrelationService._get_all_fields(entries)
        
        # Check if field_name exists as-is
        if field_name in all_fields:
            return field_name
        
        # Check if it's a parent field (has children)
        matching_fields = [
            f for f in all_fields 
            if f.startswith(f"{field_name}.") and not f.endswith('.notes')
        ]
        
        if matching_fields:
            # Return first valid child field (alphabetically)
            resolved = sorted(matching_fields)[0]
            return resolved
        
        # Field doesn't exist at all
        available_parents = sorted(set(f.split('.')[0] for f in all_fields if '.' in f))
        raise ValueError(
            f"Field '{field_name}' not found. Available parent fields: {', '.join(available_parents)}"
        )
    
    @staticmethod
    def _get_all_fields(entries: List[TrackingData]) -> List[str]:
        """Extract all unique field paths from entries."""
        fields = set()
        
        def flatten_fields(data: Dict[str, Any], prefix: str = "") -> None:
            for key, value in data.items():
                field_path = f"{prefix}.{key}" if prefix else key
                if isinstance(value, dict) and value:
                    flatten_fields(value, field_path)
                elif value is not None:
                    fields.add(field_path)
        
        for entry in entries:
            if entry.data:
                flatten_fields(entry.data)
        
        return sorted(fields)

