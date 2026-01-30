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
  const [menuVisible, setMenuVisible] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [tempSelectedTracker, setTempSelectedTracker] = useState(null); // Temporary selection, resets on app restart

  const {
    trackers,
    loading,
    isInitialLoad,
    defaultTracker,
    calendarData,
    selectedDate,
    setSelectedDate,
    needsSetup,
    insights,
    isPeriodTracker,
    loadTrackers,
    loadCalendarData,
    loadInsights,
    checkPeriodTrackerSetup,
  } = useTrackerData();

  // Use temporary selected tracker if available, otherwise use default
  const activeTracker = tempSelectedTracker || defaultTracker;
  
  // Track the previous tracker ID to ensure we reload when it changes
  const prevActiveTrackerIdRef = useRef(null);

  // Reload trackers when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      loadTrackers();
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
    setSelectedDate(day.dateString);
    if (activeTracker) {
      navigation.navigate("TrackerDetail", { trackerId: activeTracker.id });
    }
  };

  const handleLogPress = () => {
    if (activeTracker) {
      navigation.navigate("LogSymptoms", {
        trackerId: activeTracker.id,
      });
    }
  };

  const handleConfigurePress = () => {
    if (activeTracker) {
      navigation.navigate("ConfigurePeriodTracker", {
        trackerId: activeTracker.id,
      });
    }
  };

  const handleTrackerPress = (tracker) => {
    setTempSelectedTracker(tracker);
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
  if (loading && trackers.length === 0 && isInitialLoad) {
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
                />
              ) : (
                <CalendarSection
                  trackerName={defaultTracker.name}
                  selectedDate={selectedDate}
                  calendarData={calendarData}
                  isPeriodTracker={isPeriodTracker}
                  loading={true}
                  onDayPress={onDayPress}
                  onLogPress={handleLogPress}
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
          trackers={trackers}
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
                      loadTrackers(); // Reload trackers after deletion
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
          onToggleDefault={async (trackerId) => {
            Alert.alert(
              "Set Default Tracker",
              "Are you sure you want to set this tracker as your default?",
              [
                {
                  text: "Cancel",
                  style: "cancel",
                },
                {
                  text: "Confirm",
                  onPress: async () => {
                    try {
                      await trackerService.setDefaultTracker(trackerId);
                      loadTrackers(); // Reload trackers after update
                    } catch (error) {
                      console.error("Error updating default tracker:", error);
                      Alert.alert(
                        "Error",
                        error.response?.data?.message ||
                          "Failed to update default tracker. Please try again."
                      );
                    }
                  },
                },
              ]
            );
          }}
          defaultTrackerId={defaultTracker?.id}
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
