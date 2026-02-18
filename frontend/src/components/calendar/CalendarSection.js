import React, { useMemo } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native";
import { Calendar } from "react-native-calendars";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../../constants/colors";
import { CustomDay } from "./CustomDay";

export default function CalendarSection({
  trackerName,
  selectedDate,
  calendarData,
  isPeriodTracker,
  loading,
  onDayPress,
  onLogPress,
  onLogPeriod,
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
    // Only mark as selected if it's not today (today uses phase color) and selectedDate is not null
    ...(selectedDate && selectedDate !== today && {
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
      
      // Override with selected state if this is the selected date (and selectedDate is not null)
      const isSelected = selectedDate && dateString === selectedDate;
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
          onLogPeriod={isPeriodTracker ? onLogPeriod : undefined}
          markedDates={calendarData}
        />
      );
    };
  }, [isPeriodTracker, calendarData, calculateCycleDayForDate, selectedDate, onDayPress, onLogPeriod, today]);
  
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
          current={selectedDate || today}
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
});

