import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../../constants/colors";

/**
 * Custom day component for period tracker calendars
 * Shows cycle day numbers, phase colors, and entry dots
 */
export const CustomDay = (props) => {
  const { date, state, marking, onPress, isEditMode, isSelected, isToggledPeriod, onDayPress, onLogPeriod, markedDates } = props;
  const cycleDay = marking?.cycleDay;
  const phase = marking?.phase;
  const isPredictedPeriod = marking?.isPredictedPeriod === true;
  const isPredictedOvulation = marking?.isPredictedOvulation === true;
  const today = new Date().toISOString().split("T")[0];
  const isPastOrToday = date.dateString <= today;
  const isFutureDate = date.dateString > today;
  const originalIsMenstrual = phase === "menstrual" || phase === "period";
  
  // In edit mode: past/today are editable; future is editable only if it's a sure period day (current period extending into future), not predicted
  const isFutureSurePeriodDay = isFutureDate && originalIsMenstrual && !isPredictedPeriod;
  const isEditableInEditMode = isEditMode && (isPastOrToday || isFutureSurePeriodDay);
  
  // Show cycle day whenever we have one (past, today, current period, gap to next period, or predicted period)
  const showCycleDay = cycleDay !== null && cycleDay !== undefined && cycleDay > 0 && !isEditMode;
  const isToday = date.dateString === today || state === "today";
  
  // Check if this is the exact ovulation day (not just in ovulation phase)
  const isExactOvulationDay = marking?.isExactOvulationDay === true;
  
  // In edit mode, determine the actual state based on toggles
  // isToggledPeriod: undefined = use original, false = toggle off (hide period), true = toggle on (show period)
  const isMenstrual = isEditMode
    ? (isToggledPeriod === false ? false : (isToggledPeriod === true ? true : originalIsMenstrual))
    : originalIsMenstrual;
  
  // In edit mode, determine if this day should have a colored circle (menstrual or ovulation only)
  // Show colored circle only for past/today (not future)
  const shouldShowColoredCircle = isEditableInEditMode && (isMenstrual || isExactOvulationDay);
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
  } else if ((isExactOvulationDay || isMenstrual) && !isPredictedPeriod && !isPredictedOvulation) {
    textColor = colors.textOnPrimary;
  } else if (isPredictedPeriod || isPredictedOvulation) {
    textColor = colors.text; // Regular text for predicted dates (dashed border, no background)
  }

  // Check if selected day can show log period button
  // Only show if: selected, not edit mode, not a *real* period day (predicted period/ovulation can show), and not adjacent to real period days
  const isDaySelected = state === "selected" || isSelected || marking?.selected === true;
  const isRealPeriodDay = isMenstrual && !isPredictedPeriod;
  const canShowLogPeriodButton = isDaySelected && !isEditMode && !isRealPeriodDay && onLogPeriod;
  let showLogPeriodButton = false;
  
  if (canShowLogPeriodButton) {
    // Check if day before or after is a *real* period day (not predicted) - only those block the button
    const dateObj = new Date(date.dateString);
    const dayBefore = new Date(dateObj);
    dayBefore.setDate(dayBefore.getDate() - 1);
    const dayBeforeStr = dayBefore.toISOString().split('T')[0];
    
    const dayAfter = new Date(dateObj);
    dayAfter.setDate(dayAfter.getDate() + 1);
    const dayAfterStr = dayAfter.toISOString().split('T')[0];
    
    const dayBeforeMarking = markedDates?.[dayBeforeStr] || {};
    const dayAfterMarking = markedDates?.[dayAfterStr] || {};
    const dayBeforeIsRealPeriod = (dayBeforeMarking.phase === "menstrual" || dayBeforeMarking.phase === "period") && !dayBeforeMarking.isPredictedPeriod;
    const dayAfterIsRealPeriod = (dayAfterMarking.phase === "menstrual" || dayAfterMarking.phase === "period") && !dayAfterMarking.isPredictedPeriod;
    
    // Show button only if neither day before nor day after is a real period day
    showLogPeriodButton = !dayBeforeIsRealPeriod && !dayAfterIsRealPeriod;
  }

  // Handle press - use onDayPress if provided (edit mode: past/today or future sure period days only)
  const handlePress = () => {
    if (isEditMode && onDayPress && (isPastOrToday || isFutureSurePeriodDay)) {
      onDayPress(date);
    } else if (!isEditMode && onPress) {
      onPress(date);
    }
  };

  // Handle log period button press
  const handleLogPeriodPress = (e) => {
    e.stopPropagation(); // Prevent triggering the day press
    if (onLogPeriod) {
      onLogPeriod(date.dateString);
    }
  };

  return (
    <TouchableOpacity
      style={[
        styles.dayContainer,
        isToday && !isEditMode && !isPredictedPeriod && !isPredictedOvulation && [styles.todayContainer, { backgroundColor: todayBackgroundColor }],
        isExactOvulationDay && !isToday && !isEditMode && !isPredictedPeriod && !isPredictedOvulation && [styles.ovulationContainer, { backgroundColor: colors.ovulation }],
        isMenstrual && !isToday && !isExactOvulationDay && !isEditMode && !isPredictedPeriod && !isPredictedOvulation && [styles.menstrualContainer, { backgroundColor: colors.menstrual }],
        // Selected: use brown background for normal days and for predicted period/ovulation (so text is visible)
        state === "selected" && !isToday && !isEditMode && ((!isMenstrual && !isExactOvulationDay) || isPredictedPeriod || isPredictedOvulation) && styles.selectedContainer,
        state === "disabled" && styles.disabledContainer,
        // Predicted period styling (dashed border) - when not selected; when selected, selectedContainer gives background
        isPredictedPeriod && !isEditMode && !(state === "selected") && [styles.predictedPeriodContainer, { borderColor: colors.menstrual }],
        // Predicted ovulation styling (dashed border)
        isPredictedOvulation && !isEditMode && !(state === "selected") && [styles.predictedOvulationContainer, { borderColor: colors.ovulation }],
        // Edit mode styling (only for past/today - no dashed or selection for future)
        isEditableInEditMode && styles.editModeContainer,
        // Show colored circle (period/ovulation) only when NOT selected
        isEditableInEditMode && !isSelected && shouldShowColoredCircle && [styles.editModeColoredCircle, { borderColor: circleColor }],
        // Selected state in edit mode - always use red (menstrual) color border for selected days (no background)
        isEditableInEditMode && isSelected && [styles.editModeSelected, { borderColor: colors.menstrual }],
      ]}
      onPress={handlePress}
      disabled={state === "disabled" || (isEditMode && isFutureDate && !isFutureSurePeriodDay)}
      activeOpacity={0.7}
    >
      <View style={styles.dayContent}>
        {showCycleDay && !isEditMode && (
          <Text
            style={[
              styles.cycleDayText,
              { color: cycleDayColor },
              // Light text on filled background: selected (including predicted), or today/ovulation/menstrual when not predicted
              (state === "selected" || ((isToday || isExactOvulationDay || isMenstrual) && !isPredictedPeriod && !isPredictedOvulation)) && styles.cycleDayTextSelected,
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
            (isToday || isExactOvulationDay || isMenstrual) && !isEditMode && !isPredictedPeriod && !isPredictedOvulation && styles.todayText,
            // Selected: bold and visible (textColor already set to textOnPrimary for selected above)
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
      {/* Plus button in edit mode (only if past/today, not a menstrual day, and not selected) */}
      {isEditableInEditMode && !isMenstrual && !isSelected && (
        <View style={styles.plusButtonContainer}>
          <Ionicons name="add" size={11} color={colors.textLight} />
        </View>
      )}
      {/* Log period button on selected day (only if not period day and not adjacent to period days) */}
      {showLogPeriodButton && (
        <TouchableOpacity
          style={[styles.logPeriodButton, { backgroundColor: colors.menstrual }]}
          onPress={handleLogPeriodPress}
          activeOpacity={0.7}
        >
          <Ionicons name="add" size={16} color={colors.textOnPrimary} style={styles.logPeriodPlusIcon} />
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  dayContainer: {
    width: 36,
    height: 36,
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
    right: 3.5,
    fontSize: 11,
    fontWeight: "700",
    color: colors.textLight,
    lineHeight: 13,
    zIndex: 10,
  },
  cycleDayTextSelected: {
    color: colors.textOnPrimary,
    opacity: 0.8,
  },
  dayText: {
    fontSize: 16,
    fontWeight: "500",
  },
  todayContainer: {
    borderRadius: 17,
  },
  ovulationContainer: {
    borderRadius: 17,
    backgroundColor: colors.ovulation,
  },
  menstrualContainer: {
    borderRadius: 17,
    backgroundColor: colors.menstrual,
  },
  predictedPeriodContainer: {
    borderRadius: 17,
    borderWidth: 2,
    borderStyle: "dashed",
    backgroundColor: "transparent",
  },
  predictedOvulationContainer: {
    borderRadius: 17,
    borderWidth: 2,
    borderStyle: "dashed",
    backgroundColor: "transparent",
  },
  todayText: {
    fontWeight: "600",
    color: colors.textOnPrimary,
  },
  selectedContainer: {
    borderRadius: 17,
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
    bottom: 1,
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  dotSelected: {
    backgroundColor: colors.textOnPrimary,
  },
  // Edit mode styles
  editModeContainer: {
    borderRadius: 17,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.textLight,
    backgroundColor: "transparent",
  },
  editModeColoredCircle: {
    borderRadius: 17,
    borderWidth: 2,
    borderStyle: "solid",
    backgroundColor: "transparent",
  },
  editModeSelected: {
    borderRadius: 17,
    borderWidth: 2,
    borderStyle: "solid",
    backgroundColor: "transparent",
  },
  plusButtonContainer: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 11,
    height: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "pink",
    borderRadius: 6,
    color: "red",
  },
  logPeriodButton: {
    position: "absolute",
    right: -8,
    top: "55%",
    marginTop: -10,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  logPeriodPlusIcon: {
    fontWeight: "bold",
  },
});
