import React, { useMemo } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native";
import { Calendar } from "react-native-calendars";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../constants/colors";

// Custom day component for period tracker to show cycle day numbers
const CustomDay = (props) => {
  const { date, state, marking, onPress } = props;
  const cycleDay = marking?.cycleDay;
  const phase = marking?.phase;
  const today = new Date().toISOString().split("T")[0];
  const isPastOrToday = date.dateString <= today;
  const showCycleDay = cycleDay !== null && cycleDay !== undefined && isPastOrToday && cycleDay > 0;
  const isToday = date.dateString === today || state === "today";
  
  // Check if this is the exact ovulation day (not just in ovulation phase)
  // The marking object will have isExactOvulationDay set to true for the exact day
  const isExactOvulationDay = marking?.isExactOvulationDay === true;
  
  const isMenstrual = phase === "menstrual" || phase === "period";

  // Determine cycle day text color based on phase
  let cycleDayColor = colors.textLight;
  if (phase === "menstrual" || phase === "period") {
    cycleDayColor = colors.menstrual;
  } else if (phase === "ovulation" || isExactOvulationDay) {
    cycleDayColor = colors.ovulation; // Blue for ovulation phase and exact ovulation day
  } else if (phase === "follicular") {
    cycleDayColor = colors.follicular;
  } else if (phase === "luteal") {
    cycleDayColor = colors.luteal;
  }

  // Determine background color for today based on phase
  // ALWAYS use phase color for today, never brown/selected color
  const todayPhase = marking?.phase || phase;
  let todayBackgroundColor = colors.primary; // Default fallback (blue-gray, not brown)
  if (isToday) {
    if (todayPhase === "menstrual" || todayPhase === "period") {
      todayBackgroundColor = colors.menstrual;
    } else if (todayPhase === "ovulation" || isExactOvulationDay) {
      todayBackgroundColor = colors.ovulation; // Blue for ovulation phase and exact ovulation day
    } else if (todayPhase === "follicular") {
      todayBackgroundColor = colors.follicular;
    } else if (todayPhase === "luteal") {
      todayBackgroundColor = colors.luteal;
    }
  }

  // Determine text color based on state
  let textColor = colors.text;
  if (state === "today" || isToday) {
    // Use white text on colored background for today
    textColor = colors.textOnPrimary;
  } else if (state === "selected") {
    textColor = colors.textOnPrimary;
  } else if (state === "disabled") {
    textColor = colors.textLight;
  } else if (isExactOvulationDay || isMenstrual) {
    // Use white text on colored backgrounds (exact ovulation day or menstrual)
    textColor = colors.textOnPrimary;
  }

  return (
    <TouchableOpacity
      style={[
        styles.dayContainer,
        // Today's phase color takes precedence over everything
        isToday && [styles.todayContainer, { backgroundColor: todayBackgroundColor }],
        // Apply ovulation background for exact ovulation day (not today)
        // Phase colors take precedence over selected state
        isExactOvulationDay && !isToday && [styles.ovulationContainer, { backgroundColor: colors.ovulation }],
        // Apply menstrual background for menstrual days (not today, not ovulation)
        // Phase colors take precedence over selected state
        isMenstrual && !isToday && !isExactOvulationDay && [styles.menstrualContainer, { backgroundColor: colors.menstrual }],
        // Only apply selected style if it's not today and not a phase-colored day
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
      {/* Show dot if user logged data for this date (not for phase colors) */}
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

export default function CalendarSection({
  trackerName,
  selectedDate,
  calendarData,
  isPeriodTracker,
  loading,
  onDayPress,
  onLogPress,
  calculateCycleDayForDate,
  onMonthChange,
  navigation,
  tracker,
}) {
  // Memoize today's date to avoid recalculating
  const today = useMemo(() => new Date().toISOString().split("T")[0], []);
  
  // Memoize markedDates - must be at top level, not conditional
  const markedDates = useMemo(() => ({
    ...calendarData,
    // Only mark as selected if it's not today (today uses phase color)
    ...(selectedDate !== today && {
      [selectedDate]: {
        ...calendarData[selectedDate],
        selected: true,
        selectedColor: colors.selected,
      },
    }),
  }), [calendarData, selectedDate, today]);
  
  // Memoize the dayComponent function - must be at top level, not conditional
  const dayComponent = useMemo(() => {
    if (!isPeriodTracker) return undefined;
    
    return (props) => {
      const { date, state, marking } = props;
      // Get the marking data from markedDates to ensure cycleDay is included
      const dateString = date.dateString;
      const dateMarking = calendarData[dateString] || {};
      
      // If cycleDay is not in calendarData, calculate it dynamically
      // This allows cycle day numbers to show for dates in previous months
      // Also ensure today always has phase calculated
      const isTodayDate = dateString === today;
      let calculated = null;
      
      // Preserve isExactOvulationDay from original marking if it exists
      const originalIsExactOvulationDay = marking?.isExactOvulationDay || dateMarking?.isExactOvulationDay;
      
      // Always check for exact ovulation day if we need to calculate cycle day or phase
      // OR if isExactOvulationDay is not already set (to ensure we don't miss it)
      const needsCalculation = (!dateMarking.cycleDay || (isTodayDate && !dateMarking.phase)) && calculateCycleDayForDate;
      const needsOvulationCheck = !originalIsExactOvulationDay && calculateCycleDayForDate;
      
      if (needsCalculation || needsOvulationCheck) {
        calculated = calculateCycleDayForDate(dateString);
        if (calculated && calculated.cycleDay) {
          dateMarking.cycleDay = calculated.cycleDay;
          // Also set phase if not already set (especially important for today)
          if (calculated.phase && !dateMarking.phase) {
            dateMarking.phase = calculated.phase;
          }
          // Set exact ovulation day marker (preserve from original or set from calculated)
          if (calculated.isExactOvulationDay) {
            dateMarking.isExactOvulationDay = true;
          }
        }
      }
      
      const fullMarking = {
        ...(marking || {}),
        ...dateMarking, // Override with our marking data (includes cycleDay and phase)
        // Ensure isExactOvulationDay is preserved from either source
        isExactOvulationDay: originalIsExactOvulationDay || dateMarking.isExactOvulationDay || calculated?.isExactOvulationDay || false,
      };
      
      // Ensure today always has phase calculated (use already calculated value if available)
      if (isTodayDate && !fullMarking.phase && calculateCycleDayForDate) {
        const todayCalculated = calculated || calculateCycleDayForDate(dateString);
        if (todayCalculated && todayCalculated.phase) {
          fullMarking.phase = todayCalculated.phase;
          if (todayCalculated.cycleDay) {
            fullMarking.cycleDay = todayCalculated.cycleDay;
          }
          // Also preserve isExactOvulationDay for today
          if (todayCalculated.isExactOvulationDay) {
            fullMarking.isExactOvulationDay = true;
          }
        }
      }
      
      // Override with selected state if this is the selected date
      const isSelected = dateString === selectedDate;
      if (isSelected) {
        fullMarking.selected = true;
        fullMarking.selectedColor = colors.selected;
      }
      
      
      return (
        <CustomDay
          date={date}
          state={isSelected ? "selected" : state}
          marking={fullMarking}
          onPress={onDayPress}
        />
      );
    };
  }, [isPeriodTracker, calendarData, calculateCycleDayForDate, selectedDate, onDayPress, today]);
  
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
          onMonthChange={(month) => {
            if (onMonthChange) {
              onMonthChange(month.dateString.slice(0, 7)); // Pass YYYY-MM format
            }
          }}
          markedDates={markedDates}
          dayComponent={dayComponent}
          theme={{
            backgroundColor: colors.calendar,
            calendarBackground: colors.calendar,
            dayBackgroundColor: colors.calendar,
            todayBackgroundColor: "transparent", // Let our CustomDay component handle today's background color
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

      {/* Cycle Phase Legend - Compact, Right-Aligned (Only for Period Tracker) */}
      {isPeriodTracker && (
        <View style={styles.legendContainer}>
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

      {/* Buttons Section - Calendar on left, Log Symptoms on right */}
      <View style={styles.buttonContainer}>
        <TouchableOpacity
          style={styles.calendarButton}
          onPress={() => {
            if (navigation && tracker) {
              navigation.navigate("CalendarOverview", { tracker: tracker });
            }
          }}
        >
          <Ionicons name="calendar-outline" size={24} color={colors.textOnPrimary} />
        </TouchableOpacity>
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
    padding: 8,
    marginTop: 12,
    marginHorizontal: 20,
    alignItems: "flex-end",
  },
  legendRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-end",
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    marginLeft: 12,
  },
  legendColor: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 4,
  },
  legendText: {
    fontSize: 10,
    color: colors.textLight,
    fontWeight: "400",
  },
  buttonContainer: {
    marginTop: 16,
    marginHorizontal: 20,
    marginBottom: 20,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  calendarButton: {
    backgroundColor: colors.primary,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 9999, // 50% border radius (pill shape)
    justifyContent: "center",
    alignItems: "center",
  },
  logButton: {
    backgroundColor: colors.primary,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 9999, // 50% border radius (pill shape)
  },
  logButtonText: {
    color: colors.textOnPrimary,
    fontSize: 16,
    fontWeight: "600",
  },
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
    // backgroundColor will be set inline based on phase
  },
  ovulationContainer: {
    borderRadius: 16,
    backgroundColor: colors.ovulation, // Blue for exact ovulation day
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

