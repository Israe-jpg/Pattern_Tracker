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
    <>
      {/* Calendar Section - Separate */}
      <View style={styles.calendarSection}>
        <Calendar
          current={selectedDate}
          onDayPress={onDayPress}
          markedDates={{
            ...calendarData,
            [selectedDate]: {
              ...calendarData[selectedDate],
              selected: true,
              selectedColor: colors.selected,
            },
          }}
          theme={{
            backgroundColor: colors.calendar,
            calendarBackground: colors.calendar,
            dayBackgroundColor: colors.calendar,
            todayBackgroundColor: colors.calendar,
            textSectionTitleColor: colors.text,
            selectedDayBackgroundColor: colors.selected,
            selectedDayTextColor: colors.textOnPrimary,
            todayTextColor: colors.primary,
            dayTextColor: colors.text,
            textDisabledColor: colors.textLight,
            dotColor: colors.primary,
            selectedDotColor: colors.textOnPrimary,
            arrowColor: colors.primary,
            monthTextColor: colors.text,
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

      {/* Cycle Phase Legend - Separate Section (Only for Period Tracker) */}
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

      {/* Log Symptoms Button - Separate Section */}
      <View style={styles.buttonContainer}>
        <TouchableOpacity style={styles.logButton} onPress={onLogPress}>
          <Text style={styles.logButtonText}>Log Symptoms</Text>
        </TouchableOpacity>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  calendarSection: {
    backgroundColor: colors.calendar,
    padding: 20,
    marginTop: 20,
    marginHorizontal: 20,
    borderRadius: 12,
  },
  calendarLoader: {
    padding: 20,
  },
  calendar: {
    borderRadius: 12,
    overflow: "hidden",
  },
  legendContainer: {
    padding: 16,
    backgroundColor: colors.background,
    borderRadius: 12,
    marginTop: 16,
    marginHorizontal: 20,
  },
  legendTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.text,
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
    color: colors.text,
    fontWeight: "500",
  },
  buttonContainer: {
    marginTop: 16,
    marginHorizontal: 20,
    marginBottom: 20,
    alignItems: "flex-end",
  },
  logButton: {
    backgroundColor: colors.primary,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 9999, // 50% border radius (pill shape)
    alignSelf: "flex-end",
  },
  logButtonText: {
    color: colors.textOnPrimary,
    fontSize: 16,
    fontWeight: "600",
  },
});

