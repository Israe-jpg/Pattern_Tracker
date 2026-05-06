import React, { useState, useCallback, useRef, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
  Dimensions,
} from "react-native";
import { PanGestureHandler, State } from "react-native-gesture-handler";
import { useFocusEffect } from "@react-navigation/native";
import { useAuth } from "../context/AuthContext";
import { useTracker } from "../context/TrackerContext";
import { colors } from "../constants/colors";
import MenuDrawer from "../components/MenuDrawer";
import HomeHeader from "../components/HomeHeader";
import SetupPrompt from "../components/SetupPrompt";
import CalendarSection from "../components/CalendarSection";
import InsightsSection from "../components/InsightsSection";
import { useTrackerData } from "../hooks/useTrackerData";
import { trackerService } from "../services/trackerService";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const SWIPE_THRESHOLD = 50; // Minimum distance to trigger swipe

export default function HomeScreen({ navigation }) {
  const { logout } = useAuth();
  const { activeTracker, trackers: contextTrackers, loadTrackers: loadContextTrackers, setActiveTracker } = useTracker();
  const [menuVisible, setMenuVisible] = useState(false);
  const [editMode, setEditMode] = useState(false);

  const {
    loading,
    isInitialLoad,
    calendarData,
    selectedDate,
    setSelectedDate,
    needsSetup,
    insights,
    isPeriodTracker,
    loadCalendarData,
    loadInsights,
    checkPeriodTrackerSetup,
    calculateCycleDayForDate,
  } = useTrackerData();

  // Track the previous tracker ID to ensure we reload when it changes
  const prevActiveTrackerIdRef = useRef(null);

  // Reload trackers from context when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      loadContextTrackers();
      // Reset the ref when trackers are reloaded to allow re-triggering
      prevActiveTrackerIdRef.current = null;
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
  );

  // Reload calendar and insights when active tracker changes
  useEffect(() => {
    if (!activeTracker || !activeTracker.id) return;
    
    // Skip if this is the same tracker we just loaded
    if (prevActiveTrackerIdRef.current === activeTracker.id) return;
    
    // Update the ref to track this tracker
    prevActiveTrackerIdRef.current = activeTracker.id;

    // checkPeriodTrackerSetup handles both period and non-period trackers
    // It will load calendar and insights appropriately based on tracker type
    checkPeriodTrackerSetup(activeTracker);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTracker?.id, activeTracker]);

  const onDayPress = (day) => {
    // Toggle selection: if clicking the same day, deselect it
    if (selectedDate === day.dateString) {
      setSelectedDate(null);
    } else {
      setSelectedDate(day.dateString);
    }
    // Removed navigation to TrackerDetail - just select the date
  };

  const handleLogPress = () => {
    if (activeTracker) {
      navigation.navigate("LogSymptoms", {
        trackerId: activeTracker.id,
      });
    }
  };

  const handleLogPeriod = useCallback((dateString) => {
    if (!activeTracker) return;
    
    Alert.alert(
      "Log Period",
      "Do you want to log your period for today?",
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Yes",
          onPress: async () => {
            try {
              await trackerService.logPeriod(activeTracker.id, dateString);
              
              // Extract month from the logged date to reload that specific month
              const loggedMonth = dateString.slice(0, 7); // YYYY-MM format
              
              // Reload calendar data for the month where period was logged
              // This will fetch updated cycles and recalculate all dates with period days and ovulation
              if (loadCalendarData) {
                await loadCalendarData(activeTracker, loggedMonth);
              }
              
              // Also reload insights to update cycle predictions
              if (loadInsights) {
                await loadInsights(activeTracker);
              }
              
              // Reload current month as well to ensure UI updates
              const currentMonth = new Date().toISOString().slice(0, 7);
              if (currentMonth !== loggedMonth && loadCalendarData) {
                await loadCalendarData(activeTracker, currentMonth);
              }
            } catch (error) {
              console.error('Error logging period:', error);
              Alert.alert(
                "Error",
                error.response?.data?.error || error.message || "Failed to log period. Please try again."
              );
            }
          },
        },
      ]
    );
  }, [activeTracker, loadCalendarData, loadInsights]);

  const handleConfigurePress = () => {
    if (activeTracker) {
      navigation.navigate("ConfigurePeriodTracker", {
        trackerId: activeTracker.id,
      });
    }
  };

  const handleTrackerPress = (tracker) => {
    setActiveTracker(tracker);
  };

  const saveDefaultTrackerChange = async (trackerId) => {
    try {
      await trackerService.setDefaultTracker(trackerId);

      const selectedTracker =
        contextTrackers.find((tracker) => tracker.id === trackerId) || {
          id: trackerId,
        };

      // Keep Home populated by directly switching the active tracker.
      await setActiveTracker(selectedTracker);
      await loadContextTrackers();
      return true;
    } catch (error) {
      console.error("Error updating default tracker:", error);
      Alert.alert(
        "Error",
        error.response?.data?.message ||
          "Failed to update default tracker. Please try again."
      );
      return false;
    }
  };

  // Handle swipe-to-open gesture from left edge
  const swipeStartX = useRef(0);

  const onSwipeGestureEvent = (event) => {
    const { translationX, x } = event.nativeEvent;

    // Only respond to swipes starting from the left edge
    if (swipeStartX.current < SWIPE_THRESHOLD && translationX > 0) {
      // Swipe is from left edge to right
      if (translationX > SWIPE_THRESHOLD && !menuVisible) {
        setMenuVisible(true);
      }
    }
  };

  const onSwipeHandlerStateChange = (event) => {
    if (event.nativeEvent.state === State.BEGAN) {
      swipeStartX.current = event.nativeEvent.x;
    }
  };

  // Only show loading screen on initial load when we have no data
  if (loading && contextTrackers.length === 0 && isInitialLoad) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <PanGestureHandler
      onGestureEvent={onSwipeGestureEvent}
      onHandlerStateChange={onSwipeHandlerStateChange}
      activeOffsetX={[-10, 10]} // Format: [negative, positive] - we check direction in handler
      failOffsetY={[-10, 10]} // Prevent conflicts with vertical scrolling
    >
      <View style={styles.container}>
        <HomeHeader
          onMenuPress={() => setMenuVisible(true)}
          trackerName={activeTracker?.name}
        />

        <ScrollView style={styles.scrollView}>
          {activeTracker && (
            <>
              {needsSetup === true ? (
                <SetupPrompt
                  trackerId={activeTracker.id}
                  onConfigure={handleConfigurePress}
                />
              ) : needsSetup === false ? (
                <CalendarSection
                  trackerName={activeTracker.name}
                  selectedDate={selectedDate}
                  calendarData={calendarData}
                  isPeriodTracker={isPeriodTracker}
                  loading={false}
                  onDayPress={onDayPress}
                  onLogPress={handleLogPress}
                  onLogPeriod={handleLogPeriod}
                  calculateCycleDayForDate={calculateCycleDayForDate}
                  onMonthChange={(month) => {
                    loadCalendarData(activeTracker, month);
                  }}
                  navigation={navigation}
                  tracker={activeTracker}
                />
              ) : (
                <CalendarSection
                  trackerName={activeTracker?.name || "Loading..."}
                  selectedDate={selectedDate}
                  calendarData={calendarData}
                  isPeriodTracker={isPeriodTracker}
                  loading={true}
                  navigation={navigation}
                  tracker={activeTracker}
                  onDayPress={onDayPress}
                  onLogPeriod={handleLogPeriod}
                  onLogPress={handleLogPress}
                  calculateCycleDayForDate={calculateCycleDayForDate}
                  onMonthChange={(month) => {
                    if (activeTracker) {
                      loadCalendarData(activeTracker, month);
                    }
                  }}
                />
              )}
              {/* Insights Section - Show for all configured trackers */}
              {needsSetup === false && (
                <InsightsSection
                  insights={insights}
                  isPeriodTracker={isPeriodTracker}
                />
              )}
            </>
          )}
        </ScrollView>

        <MenuDrawer
          visible={menuVisible}
          onClose={() => {
            setMenuVisible(false);
            setEditMode(false); // Reset edit mode when closing drawer
          }}
          trackers={contextTrackers}
          onTrackerPress={handleTrackerPress}
          onCreateCustomTracker={() => {
            // TODO: Navigate to create custom tracker screen
            Alert.alert(
              "Create Custom Tracker",
              "This feature will be implemented soon. You'll be able to create your own custom tracker with custom fields.",
              [{ text: "OK" }]
            );
          }}
          onEditTrackersList={() => {
            // This is handled by setEditMode in the dropdown
          }}
          editMode={editMode}
          setEditMode={setEditMode}
          onSaveDefaultChange={saveDefaultTrackerChange}
          onDeleteTracker={async (tracker) => {
            Alert.alert(
              "Delete Tracker",
              `Are you sure you want to delete "${tracker.name}"? This action cannot be undone.`,
              [
                {
                  text: "Cancel",
                  style: "cancel",
                },
                {
                  text: "Delete",
                  style: "destructive",
                  onPress: async () => {
                    try {
                      // TODO: Implement delete tracker API call
                      // await trackerService.deleteTracker(tracker.id);
                      Alert.alert("Success", "Tracker deleted successfully");
                      loadContextTrackers(); // Reload trackers after deletion
                    } catch (error) {
                      Alert.alert(
                        "Error",
                        "Failed to delete tracker. Please try again."
                      );
                    }
                  },
                },
              ]
            );
          }}
          defaultTrackerId={contextTrackers.find(t => t.is_default)?.id}
          onProfilePress={() => navigation.navigate("Profile")}
          onLogout={logout}
        />
      </View>
    </PanGestureHandler>
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
  scrollView: {
    flex: 1,
  },
});
