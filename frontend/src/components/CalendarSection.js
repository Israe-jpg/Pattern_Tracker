import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native";
import { Calendar } from "react-native-calendars";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../constants/colors";

export default function CalendarSection({
  trackerName,
  selectedDate,
  calendarData,
  isPeriodTracker,
  loading,
  onDayPress,
  onLogPress,
}) {
  if (loading) {
    return (
      <View style={styles.calendarSection}>
        <ActivityIndicator
          size="small"
          color={colors.primary}
          style={styles.calendarLoader}
        />
      </View>
    );
  }

  return (
    <View style={styles.calendarSection}>
      <View style={{ position: "relative" }}>
        <Calendar
          current={selectedDate}
          onDayPress={onDayPress}
          markedDates={{
            ...calendarData,
            [selectedDate]: {
              ...calendarData[selectedDate],
              selected: true,
              selectedColor: colors.primary,
            },
          }}
          theme={{
            backgroundColor: colors.secondary,
            calendarBackground: colors.secondary,
            textSectionTitleColor: colors.textOnSecondary,
            selectedDayBackgroundColor: colors.primary,
            selectedDayTextColor: colors.textOnPrimary,
            todayTextColor: colors.primary,
            dayTextColor: colors.textOnSecondary,
            textDisabledColor: colors.textLight,
            dotColor: colors.primary,
            selectedDotColor: colors.textOnPrimary,
            arrowColor: colors.primary,
            monthTextColor: colors.textOnSecondary,
            textDayFontWeight: "500",
            textMonthFontWeight: "bold",
            textDayHeaderFontWeight: "600",
            textDayFontSize: 14,
            textMonthFontSize: 16,
            textDayHeaderFontSize: 13,
          }}
          style={styles.calendar}
        />
      </View>
      {/* Cycle Phase Legend - Only for Period Tracker */}
      {isPeriodTracker && (
        <View style={styles.legendContainer}>
          <Text style={styles.legendTitle}>Cycle Phases</Text>
          <View style={styles.legendRow}>
            <View style={styles.legendItem}>
              <View
                style={[
                  styles.legendColor,
                  { backgroundColor: colors.menstrual },
                ]}
              />
              <Text style={styles.legendText}>Menstrual</Text>
            </View>
            <View style={styles.legendItem}>
              <View
                style={[
                  styles.legendColor,
                  { backgroundColor: colors.follicular },
                ]}
              />
              <Text style={styles.legendText}>Follicular</Text>
            </View>
            <View style={styles.legendItem}>
              <View
                style={[
                  styles.legendColor,
                  { backgroundColor: colors.ovulation },
                ]}
              />
              <Text style={styles.legendText}>Ovulation</Text>
            </View>
            <View style={styles.legendItem}>
              <View
                style={[
                  styles.legendColor,
                  { backgroundColor: colors.luteal },
                ]}
              />
              <Text style={styles.legendText}>Luteal</Text>
            </View>
          </View>
        </View>
      )}
      <TouchableOpacity style={styles.logButton} onPress={onLogPress}>
        <Text style={styles.logButtonText}>Log Symptoms</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  calendarSection: {
    backgroundColor: colors.secondary,
    padding: 20,
    marginBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.secondaryDark,
  },
  calendarLoader: {
    padding: 20,
  },
  calendar: {
    borderRadius: 12,
    overflow: "hidden",
  },
  logButton: {
    backgroundColor: colors.primary,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 20,
  },
  logButtonText: {
    color: colors.textOnPrimary,
    fontSize: 16,
    fontWeight: "600",
  },
  legendContainer: {
    padding: 16,
    backgroundColor: colors.secondary,
    borderRadius: 12,
    marginTop: 12,
  },
  legendTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.textOnSecondary,
    marginBottom: 12,
  },
  legendRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    minWidth: "45%",
  },
  legendColor: {
    width: 16,
    height: 16,
    borderRadius: 8,
    marginRight: 8,
  },
  legendText: {
    fontSize: 12,
    color: colors.textOnSecondary,
    fontWeight: "500",
  },
});

