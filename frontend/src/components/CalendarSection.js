import React, { useMemo } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native";
import { Calendar } from "react-native-calendars";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../constants/colors";
import { CustomDay } from "./calendar/CustomDay";

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
    return (props) => {
      const { date, state, marking } = props;
      const dateString = date.dateString;
      const dateMarking = calendarData[dateString] || {};
      const isTodayDate = dateString === today;
      let calculated = null;

      if (isPeriodTracker) {
        const originalIsExactOvulationDay =
          marking?.isExactOvulationDay || dateMarking?.isExactOvulationDay;

        const needsCalculation =
          (!dateMarking.cycleDay || (isTodayDate && !dateMarking.phase)) &&
          calculateCycleDayForDate;
        const needsOvulationCheck =
          !originalIsExactOvulationDay && calculateCycleDayForDate;

        if (needsCalculation || needsOvulationCheck) {
          calculated = calculateCycleDayForDate(dateString);
          if (calculated?.cycleDay) {
            dateMarking.cycleDay = calculated.cycleDay;
            if (calculated.phase && !dateMarking.phase) {
              dateMarking.phase = calculated.phase;
            }
            if (calculated.isExactOvulationDay) {
              dateMarking.isExactOvulationDay = true;
            }
          }
        }

        if (isTodayDate && !dateMarking.phase && calculateCycleDayForDate) {
          const todayCalculated = calculated || calculateCycleDayForDate(dateString);
          if (todayCalculated?.phase) {
            dateMarking.phase = todayCalculated.phase;
            if (todayCalculated.cycleDay) {
              dateMarking.cycleDay = todayCalculated.cycleDay;
            }
            if (todayCalculated.isExactOvulationDay) {
              dateMarking.isExactOvulationDay = true;
            }
          }
        }
      }

      const fullMarking = {
        ...(marking || {}),
        ...dateMarking,
        isExactOvulationDay:
          marking?.isExactOvulationDay ||
          dateMarking.isExactOvulationDay ||
          calculated?.isExactOvulationDay ||
          false,
      };

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
          dayBackgroundColor={colors.background}
          highlightToday
        />
      );
    };
  }, [
    isPeriodTracker,
    calendarData,
    calculateCycleDayForDate,
    selectedDate,
    onDayPress,
    onLogPeriod,
    today,
  ]);
  
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
        <View style={styles.calendarClip}>
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
            backgroundColor: "transparent",
            calendarBackground: "transparent",
            dayBackgroundColor: "transparent",
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
            // Make every internal layer transparent so the cream parent shows through.
            "stylesheet.calendar.main": {
              container: {
                backgroundColor: "transparent",
              },
              week: {
                marginTop: 7,
                marginBottom: 7,
                flexDirection: "row",
                justifyContent: "space-around",
                backgroundColor: "transparent",
              },
              monthView: {
                backgroundColor: "transparent",
              },
              dayContainer: {
                backgroundColor: "transparent",
                flex: 1,
                alignItems: "center",
              },
              emptyDayContainer: {
                backgroundColor: "transparent",
                flex: 1,
              },
            },
            "stylesheet.calendar.header": {
              header: {
                flexDirection: "row",
                justifyContent: "space-between",
                paddingLeft: 10,
                paddingRight: 10,
                marginTop: 6,
                alignItems: "center",
                backgroundColor: "transparent",
              },
              monthText: {
                fontSize: 16,
                fontWeight: "bold",
                color: colors.text,
              },
              dayHeader: {
                marginTop: 2,
                marginBottom: 7,
                width: 32,
                textAlign: "center",
                fontSize: 13,
                fontWeight: "600",
                color: colors.text,
                backgroundColor: "transparent",
              },
              week: {
                marginTop: 7,
                flexDirection: "row",
                justifyContent: "space-around",
                backgroundColor: "transparent",
              },
            },
            "stylesheet.day.basic": {
              base: {
                width: 32,
                height: 32,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "transparent",
              },
              today: {
                borderRadius: 16,
                backgroundColor: "transparent",
              },
              todayText: {
                color: colors.primary,
                fontWeight: "600",
              },
            },
            "stylesheet.day.single": {
              base: {
                width: 32,
                height: 32,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "transparent",
              },
              text: {
                color: colors.text,
              },
            },
          }}
          style={styles.calendar}
        />
        </View>
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
    backgroundColor: colors.background,
    padding: 20,
    marginTop: 20,
    marginHorizontal: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.calendarShadow,
    shadowColor: colors.calendarShadow,
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.55,
    shadowRadius: 10,
    elevation: 5,
  },
  calendarLoader: {
    padding: 20,
  },
  calendarClip: {
    backgroundColor: colors.background,
    borderRadius: 12,
    overflow: "hidden",
  },
  calendar: {
    backgroundColor: "transparent",
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

