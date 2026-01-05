import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../constants/colors";
import { formatInsights } from "../utils/insightsFormatter";

export default function InsightsSection({ insights, isPeriodTracker }) {
  const formattedInsights = formatInsights(insights, isPeriodTracker);

  return (
    <View style={styles.insightsSection}>
      <Text style={styles.insightsTitle}>Insights</Text>
      {formattedInsights.length > 0 ? (
        <>
          {formattedInsights.map((insight) => (
            <View
              key={insight.id}
              style={[
                styles.insightCard,
                !insight.details && styles.insightCardEmpty,
              ]}
            >
              <Text style={styles.insightFieldName}>{insight.title}</Text>
              <Text
                style={[
                  styles.insightMessage,
                  !insight.details && styles.insightMessageEmpty,
                ]}
              >
                {insight.message}
              </Text>
            </View>
          ))}
        </>
      ) : (
        <View style={styles.noInsightsCard}>
          <Ionicons
            name="analytics-outline"
            size={48}
            color={colors.textLight}
          />
          <Text style={styles.noInsightsTitle}>No insights yet</Text>
          <Text style={styles.noInsightsText}>
            Log at least 4 entries to start seeing insights about your tracking
            patterns and trends.
          </Text>
          <Text style={styles.noInsightsSubtext}>
            Keep logging consistently to unlock more detailed analytics!
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  insightsSection: {
    padding: 20,
    backgroundColor: colors.background,
  },
  insightsTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: colors.text,
    marginBottom: 16,
  },
  insightCard: {
    backgroundColor: colors.secondary,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  insightFieldName: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.textOnSecondary,
    marginBottom: 8,
  },
  insightMessage: {
    fontSize: 14,
    color: colors.textOnSecondary,
    marginBottom: 8,
    lineHeight: 20,
  },
  insightCardEmpty: {
    opacity: 0.7,
    borderStyle: "dashed",
  },
  insightMessageEmpty: {
    fontStyle: "italic",
    color: colors.textLight,
  },
  noInsightsCard: {
    backgroundColor: colors.secondary,
    borderRadius: 12,
    padding: 24,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: "dashed",
  },
  noInsightsTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.textOnSecondary,
    marginTop: 16,
    marginBottom: 8,
  },
  noInsightsText: {
    fontSize: 14,
    color: colors.textOnSecondary,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 8,
  },
  noInsightsSubtext: {
    fontSize: 12,
    color: colors.textLight,
    textAlign: "center",
    fontStyle: "italic",
  },
});

