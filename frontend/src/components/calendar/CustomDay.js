import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { colors } from "../../constants/colors";

/**
 * Custom day component for period tracker calendars
 * Shows cycle day numbers, phase colors, and entry dots
 */
export const CustomDay = (props) => {
  const { date, state, marking, onPress } = props;
  const cycleDay = marking?.cycleDay;
  const phase = marking?.phase;
  const today = new Date().toISOString().split("T")[0];
  const isPastOrToday = date.dateString <= today;
  const showCycleDay = cycleDay !== null && cycleDay !== undefined && isPastOrToday && cycleDay > 0;
  const isToday = date.dateString === today || state === "today";
  
  // Check if this is the exact ovulation day (not just in ovulation phase)
  const isExactOvulationDay = marking?.isExactOvulationDay === true;
  const isMenstrual = phase === "menstrual" || phase === "period";

  // Determine cycle day text color based on phase
  let cycleDayColor = colors.textLight;
  if (phase === "menstrual" || phase === "period") {
    cycleDayColor = colors.menstrual;
  } else if (phase === "ovulation" || isExactOvulationDay) {
    cycleDayColor = colors.ovulation;
  } else if (phase === "follicular") {
    cycleDayColor = colors.follicular;
  } else if (phase === "luteal") {
    cycleDayColor = colors.luteal;
  }

  // Determine background color for today based on phase
  const todayPhase = marking?.phase || phase;
  let todayBackgroundColor = colors.primary;
  if (isToday) {
    if (todayPhase === "menstrual" || todayPhase === "period") {
      todayBackgroundColor = colors.menstrual;
    } else if (todayPhase === "ovulation" || isExactOvulationDay) {
      todayBackgroundColor = colors.ovulation;
    } else if (todayPhase === "follicular") {
      todayBackgroundColor = colors.follicular;
    } else if (todayPhase === "luteal") {
      todayBackgroundColor = colors.luteal;
    }
  }

  // Determine text color based on state
  let textColor = colors.text;
  if (state === "today" || isToday) {
    textColor = colors.textOnPrimary;
  } else if (state === "selected") {
    textColor = colors.textOnPrimary;
  } else if (state === "disabled") {
    textColor = colors.textLight;
  } else if (isExactOvulationDay || isMenstrual) {
    textColor = colors.textOnPrimary;
  }

  return (
    <TouchableOpacity
      style={[
        styles.dayContainer,
        isToday && [styles.todayContainer, { backgroundColor: todayBackgroundColor }],
        isExactOvulationDay && !isToday && [styles.ovulationContainer, { backgroundColor: colors.ovulation }],
        isMenstrual && !isToday && !isExactOvulationDay && [styles.menstrualContainer, { backgroundColor: colors.menstrual }],
        state === "selected" && !isToday && !isMenstrual && !isExactOvulationDay && styles.selectedContainer,
        state === "disabled" && styles.disabledContainer,
      ]}
      onPress={() => onPress && onPress(date)}
      disabled={state === "disabled"}
      activeOpacity={0.7}
    >
      <View style={styles.dayContent}>
        {showCycleDay && (
          <Text
            style={[
              styles.cycleDayText,
              { color: cycleDayColor },
              (state === "selected" || isToday || isExactOvulationDay || isMenstrual) && styles.cycleDayTextSelected,
            ]}
            numberOfLines={1}
          >
            {cycleDay}
          </Text>
        )}
        <Text
          style={[
            styles.dayText,
            { color: textColor },
            (isToday || isExactOvulationDay || isMenstrual) && styles.todayText,
            state === "selected" && styles.selectedText,
            state === "disabled" && styles.disabledText,
          ]}
        >
          {date.day}
        </Text>
      </View>
      {/* Show dot if user logged data for this date */}
      {marking?.marked && (
        <View
          style={[
            styles.dot,
            { backgroundColor: marking.dotColor || colors.primary },
            state === "selected" && styles.dotSelected,
          ]}
        />
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  dayContainer: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  dayContent: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  cycleDayText: {
    position: "absolute",
    top: 2,
    right: 4,
    fontSize: 10,
    fontWeight: "700",
    color: colors.textLight,
    lineHeight: 12,
    zIndex: 10,
  },
  cycleDayTextSelected: {
    color: colors.textOnPrimary,
    opacity: 0.8,
  },
  dayText: {
    fontSize: 14,
    fontWeight: "500",
  },
  todayContainer: {
    borderRadius: 16,
  },
  ovulationContainer: {
    borderRadius: 16,
    backgroundColor: colors.ovulation,
  },
  menstrualContainer: {
    borderRadius: 16,
    backgroundColor: colors.menstrual,
  },
  todayText: {
    fontWeight: "600",
    color: colors.textOnPrimary,
  },
  selectedContainer: {
    borderRadius: 16,
    backgroundColor: colors.selected,
  },
  selectedText: {
    fontWeight: "600",
  },
  disabledContainer: {
    opacity: 0.3,
  },
  disabledText: {
    // Color handled inline
  },
  dot: {
    position: "absolute",
    bottom: 2,
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  dotSelected: {
    backgroundColor: colors.textOnPrimary,
  },
});
