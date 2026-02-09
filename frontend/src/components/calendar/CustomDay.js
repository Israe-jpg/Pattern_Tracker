import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../../constants/colors";

/**
 * Custom day component for period tracker calendars
 * Shows cycle day numbers, phase colors, and entry dots
 */
export const CustomDay = (props) => {
  const { date, state, marking, onPress, isEditMode, isSelected, isToggledPeriod, onDayPress } = props;
  const cycleDay = marking?.cycleDay;
  const phase = marking?.phase;
  const today = new Date().toISOString().split("T")[0];
  const isPastOrToday = date.dateString <= today;
  const showCycleDay = cycleDay !== null && cycleDay !== undefined && isPastOrToday && cycleDay > 0;
  const isToday = date.dateString === today || state === "today";
  
  // Check if this is the exact ovulation day (not just in ovulation phase)
  const isExactOvulationDay = marking?.isExactOvulationDay === true;
  const originalIsMenstrual = phase === "menstrual" || phase === "period";
  
  // In edit mode, determine the actual state based on toggles
  // isToggledPeriod: undefined = use original, false = toggle off (hide period), true = toggle on (show period)
  const isMenstrual = isEditMode
    ? (isToggledPeriod === false ? false : (isToggledPeriod === true ? true : originalIsMenstrual))
    : originalIsMenstrual;
  
  // In edit mode, determine if this day should have a colored circle (menstrual or ovulation only)
  // Show colored circle if:
  // 1. It's a menstrual day (original or toggled on)
  // 2. It's an ovulation day (ovulation days don't toggle)
  const shouldShowColoredCircle = isEditMode && (isMenstrual || isExactOvulationDay);
  const circleColor = isMenstrual ? colors.menstrual : (isExactOvulationDay ? colors.ovulation : null);

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

  // Handle press - use onDayPress if provided (edit mode), otherwise use onPress
  const handlePress = () => {
    if (isEditMode && onDayPress) {
      onDayPress(date);
    } else if (onPress) {
      onPress(date);
    }
  };

  return (
    <TouchableOpacity
      style={[
        styles.dayContainer,
        isToday && !isEditMode && [styles.todayContainer, { backgroundColor: todayBackgroundColor }],
        isExactOvulationDay && !isToday && !isEditMode && [styles.ovulationContainer, { backgroundColor: colors.ovulation }],
        isMenstrual && !isToday && !isExactOvulationDay && !isEditMode && [styles.menstrualContainer, { backgroundColor: colors.menstrual }],
        state === "selected" && !isToday && !isMenstrual && !isExactOvulationDay && !isEditMode && styles.selectedContainer,
        state === "disabled" && styles.disabledContainer,
        // Edit mode styling
        isEditMode && styles.editModeContainer,
        // Show colored circle (period/ovulation) only when NOT selected
        isEditMode && !isSelected && shouldShowColoredCircle && [styles.editModeColoredCircle, { borderColor: circleColor }],
        // Selected state in edit mode - always use red (menstrual) color border for selected days (no background)
        isEditMode && isSelected && [styles.editModeSelected, { borderColor: colors.menstrual }],
      ]}
      onPress={handlePress}
      disabled={state === "disabled"}
      activeOpacity={0.7}
    >
      <View style={styles.dayContent}>
        {showCycleDay && !isEditMode && (
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
            { 
              color: isEditMode 
                ? colors.text // Always use regular text color in edit mode (no background)
                : textColor 
            },
            (isToday || isExactOvulationDay || isMenstrual) && !isEditMode && styles.todayText,
            state === "selected" && !isEditMode && styles.selectedText,
            state === "disabled" && styles.disabledText,
          ]}
        >
          {date.day}
        </Text>
      </View>
      {/* Show dot if user logged data for this date (only in non-edit mode) */}
      {marking?.marked && !isEditMode && (
        <View
          style={[
            styles.dot,
            { backgroundColor: marking.dotColor || colors.primary },
            state === "selected" && styles.dotSelected,
          ]}
        />
      )}
      {/* Plus button in edit mode (only if not a menstrual day and not selected) */}
      {isEditMode && !isMenstrual && !isSelected && (
        <View style={styles.plusButtonContainer}>
          <Ionicons name="add" size={10} color={colors.textLight} />
        </View>
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
  // Edit mode styles
  editModeContainer: {
    borderRadius: 16,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.textLight,
    backgroundColor: "transparent",
  },
  editModeColoredCircle: {
    borderRadius: 16,
    borderWidth: 2,
    borderStyle: "solid",
    backgroundColor: "transparent",
  },
  editModeSelected: {
    borderRadius: 16,
    borderWidth: 2,
    borderStyle: "solid",
    backgroundColor: "transparent",
  },
  plusButtonContainer: {
    position: "absolute",
    bottom: 1,
    right: 1,
    width: 10,
    height: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "pink",
    borderRadius: 5,
    color: "red",
  },
});
