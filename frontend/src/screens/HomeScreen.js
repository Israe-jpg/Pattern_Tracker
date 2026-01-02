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
  Modal,
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
  const [loading, setLoading] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [menuVisible, setMenuVisible] = useState(false);
  const [profileDropdownVisible, setProfileDropdownVisible] = useState(false);
  const [defaultTracker, setDefaultTracker] = useState(null);
  const [calendarData, setCalendarData] = useState({});
  const [selectedDate, setSelectedDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [needsSetup, setNeedsSetup] = useState(null); // null = checking, true = needs setup, false = configured
  const [insights, setInsights] = useState(null);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [isPeriodTracker, setIsPeriodTracker] = useState(false);

  const loadTrackers = async () => {
    try {
      // Only show full-screen loading on initial load AND if we have no trackers yet
      if (isInitialLoad && trackers.length === 0) {
        setLoading(true);
      }
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

      // Check if Period Tracker needs setup
      if (defaultTracker && defaultTracker.category_name === "Period Tracker") {
        // Don't load calendar until we confirm settings exist
        checkPeriodTrackerSetup(defaultTracker);
      } else if (defaultTracker) {
        // Load calendar data for non-period trackers
        loadCalendarData(defaultTracker);
        loadInsights(defaultTracker);
        setNeedsSetup(false);
      } else {
        setNeedsSetup(false);
      }
    } catch (error) {
      console.error("Error loading trackers:", error);
      console.error("Error details:", error.response?.data);
      setTrackers([]);
    } finally {
      setLoading(false);
      setIsInitialLoad(false);
    }
  };

  const checkPeriodTrackerSetup = async (tracker) => {
    // Only check setup for Period Trackers
    if (!tracker || tracker.category_name !== "Period Tracker") {
      setNeedsSetup(false);
      if (tracker) {
        loadCalendarData(tracker);
      }
      return;
    }

    try {
      // Check tracker settings directly from backend
      const response = await trackerService.getTrackerSettings(tracker.id);

      // The backend returns { settings: {...} } or { settings: {} } if null
      const settings = response.settings || {};

      // Check if settings is null, empty object, or missing required fields
      const isSettingsNull = !settings || Object.keys(settings).length === 0;
      const hasRequiredSettings =
        settings.average_cycle_length &&
        settings.average_period_length &&
        settings.last_period_start_date;

      if (isSettingsNull || !hasRequiredSettings) {
        setNeedsSetup(true);
      } else {
        setNeedsSetup(false);
        loadCalendarData(tracker);
        loadInsights(tracker);
      }
    } catch (error) {
      console.error("Error checking tracker setup:", error);
      console.error("Error details:", {
        status: error.response?.status,
        data: error.response?.data,
      });
      // If error, assume setup is needed for Period Tracker
      setNeedsSetup(true);
    }
  };

  const loadCalendarData = async (tracker) => {
    if (!tracker) return;

    try {
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
        // For period tracker, mark different cycle phases with colored dots
        Object.keys(response.days).forEach((date) => {
          const dayData = response.days[date];
          if (dayData && dayData.phase) {
            const phase = dayData.phase.phase || dayData.phase;
            let dotColor = colors.primary;

            if (phase === "menstrual" || phase === "period") {
              dotColor = colors.menstrual;
            } else if (phase === "ovulation") {
              dotColor = colors.ovulation;
            } else if (phase === "follicular") {
              dotColor = colors.follicular;
            } else if (phase === "luteal") {
              dotColor = colors.luteal;
            }

            markedDates[date] = {
              marked: true,
              dotColor: dotColor,
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
      console.error("Calendar error details:", {
        status: error.response?.status,
        data: error.response?.data,
      });
      // Silently fail for calendar - don't block the UI
      setCalendarData({});
    }
  };

  const loadInsights = async (tracker) => {
    if (!tracker) return;

    try {
      setInsightsLoading(true);
      const isPeriod = tracker.category_name === "Period Tracker";
      setIsPeriodTracker(isPeriod);

      let response;
      if (isPeriod) {
        // Use cycle analysis for period trackers
        response = await dataTrackingService.getCycleAnalysis(tracker.id);
      } else {
        // Use general tracker analysis for normal trackers
        response = await dataTrackingService.getGeneralAnalysis(tracker.id);
      }

      // Backend returns { message: "...", data: {...} }
      // Service returns response.data which is { message: "...", data: {...} }
      // So we need to extract the nested data object
      const insightsData = response.data || response;
      setInsights(insightsData);
    } catch (error) {
      console.error("Error loading insights:", error);
      // Silently fail - don't block the UI
      setInsights(null);
    } finally {
      setInsightsLoading(false);
    }
  };

  // Format insights for display based on tracker type
  const formatInsights = (rawInsights, isPeriod) => {
    if (!rawInsights) {
      return [];
    }

    const formatted = [];

    if (isPeriod) {
      // Format cycle analysis insights - show all, even if no data

      // Regularity
      if (rawInsights.regularity) {
        const regularity = rawInsights.regularity;
        const message =
          regularity.medical_note ||
          `Regularity: ${regularity.regularity_level} (${
            regularity.regularity_score?.toFixed(1) || "N/A"
          } score)`;
        formatted.push({
          id: "regularity",
          title: "Cycle Regularity",
          message: message,
          details: regularity,
        });
      }

      // Prediction Accuracy
      if (rawInsights.prediction_accuracy) {
        const prediction = rawInsights.prediction_accuracy;
        const message =
          prediction.recommendation ||
          `Accuracy: ${prediction.accuracy_level} (${
            prediction.average_error_days?.toFixed(1) || "N/A"
          } days avg error)`;
        formatted.push({
          id: "prediction",
          title: "Prediction Accuracy",
          message: message,
          details: prediction,
        });
      }

      // Comparison with Previous
      if (rawInsights.comparison_with_previous?.has_comparison) {
        const comparison = rawInsights.comparison_with_previous;
        const message =
          comparison.cycle_insights?.[0] ||
          comparison.insights?.[0] ||
          "Compared to previous cycle";
        formatted.push({
          id: "comparison_previous",
          title: "Cycle Comparison",
          message: message,
          details: comparison,
        });
      }

      // Comparison with Average
      if (rawInsights.comparison_with_average?.has_comparison) {
        const comparison = rawInsights.comparison_with_average;
        const message =
          comparison.interpretation?.[0] || "Compared to average cycle";
        formatted.push({
          id: "comparison_average",
          title: "Average Comparison",
          message: message,
          details: comparison,
        });
      }

      // Correlations - only show if has_correlations is true
      if (
        rawInsights.correlations?.has_correlations &&
        rawInsights.correlations.top_correlations
      ) {
        formatted.push({
          id: "correlations",
          title: "Correlations",
          message: `${rawInsights.correlations.top_correlations.length} correlation patterns found`,
          details: rawInsights.correlations,
        });
      }
    } else {
      // Format general tracker analysis insights - only show what's available

      // Tracking Summary
      if (rawInsights.tracking_summary) {
        formatted.push({
          id: "summary",
          title: "Tracking Summary",
          message: `${rawInsights.tracking_summary.total_entries} entries over ${rawInsights.tracking_summary.tracking_days} days`,
          details: rawInsights.tracking_summary,
        });
      }

      // Comparison
      if (rawInsights.comparison?.has_comparison) {
        formatted.push({
          id: "comparison",
          title: "Comparison",
          message:
            rawInsights.comparison.message || "Comparison analysis available",
          details: rawInsights.comparison,
        });
      }

      // Correlations - only show if has_correlations is true
      if (
        rawInsights.correlations?.has_correlations &&
        rawInsights.correlations.top_correlations
      ) {
        formatted.push({
          id: "correlations",
          title: "Correlations",
          message: `${rawInsights.correlations.top_correlations.length} correlation patterns found`,
          details: rawInsights.correlations,
        });
      }
    }

    return formatted;
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

  // Only show loading screen on initial load when we have no data
  if (loading && trackers.length === 0 && isInitialLoad) {
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
        <View style={styles.profileContainer}>
          <TouchableOpacity
            style={styles.profileButton}
            onPress={() => setProfileDropdownVisible(!profileDropdownVisible)}
          >
            <Ionicons
              name="person-circle-outline"
              size={28}
              color={colors.textOnPrimary}
            />
          </TouchableOpacity>

          {profileDropdownVisible && (
            <View style={styles.dropdown}>
              <TouchableOpacity
                style={styles.dropdownItem}
                onPress={() => {
                  setProfileDropdownVisible(false);
                  navigation.navigate("UserInfo");
                }}
              >
                <Ionicons name="person-outline" size={20} color={colors.text} />
                <Text style={styles.dropdownItemText}>Profile</Text>
              </TouchableOpacity>
              <View style={styles.dropdownDivider} />
              <TouchableOpacity
                style={styles.dropdownItem}
                onPress={() => {
                  setProfileDropdownVisible(false);
                  Alert.alert("Logout", "Are you sure you want to logout?", [
                    {
                      text: "Cancel",
                      style: "cancel",
                    },
                    {
                      text: "Logout",
                      style: "destructive",
                      onPress: () => logout(),
                    },
                  ]);
                }}
              >
                <Ionicons
                  name="log-out-outline"
                  size={20}
                  color={colors.text}
                />
                <Text style={styles.dropdownItemText}>Logout</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>

      {profileDropdownVisible && (
        <TouchableOpacity
          style={styles.dropdownOverlay}
          activeOpacity={1}
          onPress={() => setProfileDropdownVisible(false)}
        />
      )}

      <ScrollView style={styles.scrollView}>
        {defaultTracker && (
          <>
            <View style={styles.titleSection}>
              <Text style={styles.calendarTitle}>{defaultTracker.name}</Text>
            </View>
            {needsSetup === true ? (
              // Show configure button when setup is needed
              <View style={styles.calendarSection}>
                <View style={styles.setupPrompt}>
                  <Ionicons
                    name="settings-outline"
                    size={48}
                    color={colors.primary}
                  />
                  <Text style={styles.setupTitle}>Setup Required</Text>
                  <Text style={styles.setupText}>
                    Configure your Period Tracker to start logging your symptoms
                    and tracking your cycle.
                  </Text>
                  <TouchableOpacity
                    style={styles.configureButton}
                    onPress={() => {
                      navigation.navigate("ConfigurePeriodTracker", {
                        trackerId: defaultTracker.id,
                      });
                    }}
                  >
                    <Text style={styles.configureButtonText}>
                      Configure Tracker
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : needsSetup === false ? (
              // Show calendar and log button when configured
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
                <TouchableOpacity
                  style={styles.logButton}
                  onPress={() => {
                    if (defaultTracker) {
                      navigation.navigate("LogSymptoms", {
                        trackerId: defaultTracker.id,
                      });
                    }
                  }}
                >
                  <Text style={styles.logButtonText}>Log Symptoms</Text>
                </TouchableOpacity>
              </View>
            ) : (
              // Show loading while checking setup status
              <View style={styles.calendarSection}>
                <ActivityIndicator
                  size="small"
                  color={colors.primary}
                  style={styles.calendarLoader}
                />
              </View>
            )}
            {/* Insights Section - Show for all configured trackers */}
            {needsSetup === false && (
              <View style={styles.insightsSection}>
                <Text style={styles.insightsTitle}>Insights</Text>
                {insights ? (
                  (() => {
                    const formattedInsights = formatInsights(
                      insights,
                      isPeriodTracker
                    );
                    return formattedInsights.length > 0 ? (
                      <>
                        {formattedInsights.map((insight) => (
                          <View
                            key={insight.id}
                            style={[
                              styles.insightCard,
                              !insight.details && styles.insightCardEmpty,
                            ]}
                          >
                            <Text style={styles.insightFieldName}>
                              {insight.title}
                            </Text>
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
                        <Text style={styles.noInsightsTitle}>
                          No insights yet
                        </Text>
                        <Text style={styles.noInsightsText}>
                          Log at least 4 entries to start seeing insights about
                          your tracking patterns and trends.
                        </Text>
                        <Text style={styles.noInsightsSubtext}>
                          Keep logging consistently to unlock more detailed
                          analytics!
                        </Text>
                      </View>
                    );
                  })()
                ) : (
                  <View style={styles.noInsightsCard}>
                    <Ionicons
                      name="analytics-outline"
                      size={48}
                      color={colors.textLight}
                    />
                    <Text style={styles.noInsightsTitle}>No insights yet</Text>
                    <Text style={styles.noInsightsText}>
                      Log at least 4 entries to start seeing insights about your
                      tracking patterns and trends.
                    </Text>
                    <Text style={styles.noInsightsSubtext}>
                      Keep logging consistently to unlock more detailed
                      analytics!
                    </Text>
                  </View>
                )}
              </View>
            )}
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
  profileContainer: {
    position: "relative",
  },
  profileButton: {
    padding: 4,
  },
  dropdown: {
    position: "absolute",
    top: 40,
    right: 0,
    backgroundColor: colors.background,
    borderRadius: 8,
    minWidth: 150,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
    zIndex: 1000,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dropdownItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    paddingHorizontal: 16,
  },
  dropdownItemText: {
    fontSize: 16,
    color: colors.text,
    marginLeft: 12,
  },
  dropdownDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginHorizontal: 8,
  },
  dropdownOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 999,
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
  setupPrompt: {
    alignItems: "center",
    padding: 32,
  },
  setupTitle: {
    fontSize: 22,
    fontWeight: "bold",
    color: colors.textOnSecondary,
    marginTop: 16,
    marginBottom: 12,
  },
  setupText: {
    fontSize: 16,
    color: colors.textOnSecondary,
    textAlign: "center",
    marginBottom: 24,
    lineHeight: 24,
    paddingHorizontal: 20,
  },
  configureButton: {
    backgroundColor: colors.primary,
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 8,
    minWidth: 200,
  },
  configureButtonText: {
    color: colors.textOnPrimary,
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
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
  insightMeta: {
    flexDirection: "row",
    marginTop: 8,
  },
  insightMetaText: {
    fontSize: 12,
    color: colors.textLight,
  },
  moreInsightsText: {
    fontSize: 14,
    color: colors.primary,
    textAlign: "center",
    marginTop: 8,
    fontWeight: "500",
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
  insightCardEmpty: {
    opacity: 0.7,
    borderStyle: "dashed",
  },
  insightMessageEmpty: {
    fontStyle: "italic",
    color: colors.textLight,
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
