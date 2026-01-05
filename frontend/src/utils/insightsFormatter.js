/**
 * Utility functions for formatting insights data for display
 */

/**
 * Format insights for display based on tracker type
 * @param {Object} rawInsights - Raw insights data from API
 * @param {boolean} isPeriod - Whether this is a period tracker
 * @returns {Array} Formatted insights array
 */
export const formatInsights = (rawInsights, isPeriod) => {
  if (!rawInsights) {
    return [];
  }

  const formatted = [];

  if (isPeriod) {
    // Format cycle analysis insights - show all, even if no data

    // Regularity
    if (rawInsights.regularity) {
      const regularity = rawInsights.regularity;
      const message =
        regularity.medical_note ||
        `Regularity: ${regularity.regularity_level} (${
          regularity.regularity_score?.toFixed(1) || "N/A"
        } score)`;
      formatted.push({
        id: "regularity",
        title: "Cycle Regularity",
        message: message,
        details: regularity,
      });
    }

    // Prediction Accuracy
    if (rawInsights.prediction_accuracy) {
      const prediction = rawInsights.prediction_accuracy;
      const message =
        prediction.recommendation ||
        `Accuracy: ${prediction.accuracy_level} (${
          prediction.average_error_days?.toFixed(1) || "N/A"
        } days avg error)`;
      formatted.push({
        id: "prediction",
        title: "Prediction Accuracy",
        message: message,
        details: prediction,
      });
    }

    // Comparison with Previous
    if (rawInsights.comparison_with_previous?.has_comparison) {
      const comparison = rawInsights.comparison_with_previous;
      const message =
        comparison.cycle_insights?.[0] ||
        comparison.insights?.[0] ||
        "Compared to previous cycle";
      formatted.push({
        id: "comparison_previous",
        title: "Cycle Comparison",
        message: message,
        details: comparison,
      });
    }

    // Comparison with Average
    if (rawInsights.comparison_with_average?.has_comparison) {
      const comparison = rawInsights.comparison_with_average;
      const message =
        comparison.interpretation?.[0] || "Compared to average cycle";
      formatted.push({
        id: "comparison_average",
        title: "Average Comparison",
        message: message,
        details: comparison,
      });
    }

    // Correlations - only show if has_correlations is true
    if (
      rawInsights.correlations?.has_correlations &&
      rawInsights.correlations.top_correlations
    ) {
      formatted.push({
        id: "correlations",
        title: "Correlations",
        message: `${rawInsights.correlations.top_correlations.length} correlation patterns found`,
        details: rawInsights.correlations,
      });
    }
  } else {
    // Format general tracker analysis insights - only show what's available

    // Tracking Summary
    if (rawInsights.tracking_summary) {
      formatted.push({
        id: "summary",
        title: "Tracking Summary",
        message: `${rawInsights.tracking_summary.total_entries} entries over ${rawInsights.tracking_summary.tracking_days} days`,
        details: rawInsights.tracking_summary,
      });
    }

    // Comparison
    if (rawInsights.comparison?.has_comparison) {
      formatted.push({
        id: "comparison",
        title: "Comparison",
        message:
          rawInsights.comparison.message || "Comparison analysis available",
        details: rawInsights.comparison,
      });
    }

    // Correlations - only show if has_correlations is true
    if (
      rawInsights.correlations?.has_correlations &&
      rawInsights.correlations.top_correlations
    ) {
      formatted.push({
        id: "correlations",
        title: "Correlations",
        message: `${rawInsights.correlations.top_correlations.length} correlation patterns found`,
        details: rawInsights.correlations,
      });
    }
  }

  return formatted;
};

