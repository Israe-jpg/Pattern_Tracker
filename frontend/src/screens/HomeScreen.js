import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Calendar } from "react-native-calendars";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../context/AuthContext";
import { trackerService } from "../services/trackerService";
import { dataTrackingService } from "../services/dataTrackingService";
import { colors } from "../constants/colors";
import MenuDrawer from "../components/MenuDrawer";

export default function HomeScreen({ navigation }) {
  const { user, logout } = useAuth();
  const [trackers, setTrackers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [menuVisible, setMenuVisible] = useState(false);
  const [defaultTracker, setDefaultTracker] = useState(null);
  const [calendarData, setCalendarData] = useState({});
  const [selectedDate, setSelectedDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [calendarLoading, setCalendarLoading] = useState(false);

  const loadTrackers = async () => {
    try {
      setLoading(true);
      const response = await trackerService.getMyTrackers();
      // Backend returns { message: '...', trackers: [...], total_count: ... }
      // (data is merged into response, not nested)
      const trackersList = response.trackers || [];

      // Map to format expected by the UI
      const formattedTrackers = trackersList.map((item) => ({
        id: item.tracker_info?.id,
        name:
          item.tracker_name ||
          item.tracker_info?.category_name ||
          "Unknown Tracker",
        category_name: item.tracker_name || "Unknown",
        ...item.tracker_info,
      }));

      setTrackers(formattedTrackers);

      // Find default tracker
      const defaultTracker =
        formattedTrackers.find((t) => t.is_default) || formattedTrackers[0];
      setDefaultTracker(defaultTracker);

      // Load calendar data for default tracker
      if (defaultTracker) {
        loadCalendarData(defaultTracker);
      }
    } catch (error) {
      console.error("Error loading trackers:", error);
      console.error("Error details:", error.response?.data);
      setTrackers([]);
    } finally {
      setLoading(false);
    }
  };

  const loadCalendarData = async (tracker) => {
    if (!tracker) return;

    try {
      setCalendarLoading(true);
      const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM format

      // Check if it's a Period Tracker
      const isPeriodTracker = tracker.category_name === "Period Tracker";

      let response;
      if (isPeriodTracker) {
        response = await dataTrackingService.getCalendar(tracker.id, {
          params: { month: currentMonth },
        });
      } else {
        response = await dataTrackingService.getTrackerCalendar(tracker.id, {
          params: { month: currentMonth },
        });
      }

      // Format calendar data for react-native-calendars
      // Backend returns data merged at top level (not nested)
      const markedDates = {};
      const calendarResponse =
        response.days || response.calendar_grid?.days || {};

      if (isPeriodTracker && response.days) {
        // For period tracker, mark different cycle phases
        Object.keys(response.days).forEach((date) => {
          const dayData = response.days[date];
          if (dayData && dayData.phase) {
            markedDates[date] = {
              marked: true,
              dotColor:
                dayData.phase === "period"
                  ? colors.period
                  : dayData.phase === "ovulation"
                  ? colors.ovulation
                  : dayData.phase === "fertile"
                  ? colors.fertile
                  : colors.primary,
            };
          }
        });
      } else if (response.days) {
        // For regular trackers, mark days with entries
        Object.keys(response.days).forEach((date) => {
          const dayData = response.days[date];
          if (dayData && dayData.has_entry) {
            markedDates[date] = {
              marked: true,
              dotColor: colors.primary,
            };
          }
        });
      }

      setCalendarData(markedDates);
    } catch (error) {
      console.error("Error loading calendar data:", error);
      setCalendarData({});
    } finally {
      setCalendarLoading(false);
    }
  };

  // Reload trackers when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      loadTrackers();
    }, [])
  );

  const onDayPress = (day) => {
    setSelectedDate(day.dateString);
    if (defaultTracker) {
      navigation.navigate("TrackerDetail", { trackerId: defaultTracker.id });
    }
  };

  const renderTracker = ({ item }) => (
    <TouchableOpacity
      style={styles.trackerCard}
      onPress={() =>
        navigation.navigate("TrackerDetail", { trackerId: item.id })
      }
    >
      <Text style={styles.trackerName}>{item.name}</Text>
      <Text style={styles.trackerType}>{item.category_name}</Text>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.menuButton}
          onPress={() => setMenuVisible(true)}
        >
          <Ionicons name="menu" size={28} color={colors.textOnPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>Trackt</Text>
        <TouchableOpacity
          style={styles.profileButton}
          onPress={() => {
            // Navigate to profile/user info screen
            navigation.navigate("UserInfo");
          }}
        >
          <Ionicons
            name="person-circle-outline"
            size={28}
            color={colors.textOnPrimary}
          />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scrollView}>
        {defaultTracker && (
          <>
            <View style={styles.titleSection}>
              <Text style={styles.calendarTitle}>{defaultTracker.name}</Text>
            </View>
            <View style={styles.calendarSection}>
              {calendarLoading ? (
                <ActivityIndicator
                  size="small"
                  color={colors.primary}
                  style={styles.calendarLoader}
                />
              ) : (
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
              )}
              <TouchableOpacity
                style={styles.logButton}
                onPress={() => {
                  if (defaultTracker) {
                    navigation.navigate("TrackerDetail", {
                      trackerId: defaultTracker.id,
                    });
                  }
                }}
              >
                <Text style={styles.logButtonText}>Log Symptoms</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </ScrollView>

      <MenuDrawer
        visible={menuVisible}
        onClose={() => setMenuVisible(false)}
        trackers={trackers}
        onTrackerPress={(tracker) => {
          navigation.navigate("TrackerDetail", { trackerId: tracker.id });
        }}
        onCreateCustomTracker={() => {
          // TODO: Navigate to create custom tracker screen
          Alert.alert(
            "Create Custom Tracker",
            "This feature will be implemented soon. You'll be able to create your own custom tracker with custom fields.",
            [{ text: "OK" }]
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    paddingTop: 60,
    backgroundColor: colors.primary,
    borderBottomWidth: 1,
    borderBottomColor: colors.primaryDark,
  },
  menuButton: {
    padding: 4,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: colors.textOnPrimary,
    flex: 1,
    textAlign: "center",
  },
  profileButton: {
    padding: 4,
  },
  scrollView: {
    flex: 1,
  },
  titleSection: {
    backgroundColor: colors.background,
    paddingVertical: 20,
    paddingHorizontal: 20,
    alignItems: "center",
  },
  calendarTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: colors.text,
    textAlign: "center",
  },
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
  trackersSection: {
    padding: 20,
    paddingTop: 0,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: colors.text,
    marginBottom: 16,
  },
  list: {
    padding: 20,
  },
  trackerCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  trackerName: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.text,
    marginBottom: 4,
  },
  trackerType: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingTop: 100,
  },
  emptyText: {
    fontSize: 16,
    color: colors.textSecondary,
  },
});
