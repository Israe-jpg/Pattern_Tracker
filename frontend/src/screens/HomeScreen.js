import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
} from "react-native";
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

export default function HomeScreen({ navigation }) {
  const { logout } = useAuth();
  const [menuVisible, setMenuVisible] = useState(false);
  const [editMode, setEditMode] = useState(false);

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
  } = useTrackerData();

  // Reload trackers when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      loadTrackers();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
  );

  const onDayPress = (day) => {
    setSelectedDate(day.dateString);
    if (defaultTracker) {
      navigation.navigate("TrackerDetail", { trackerId: defaultTracker.id });
    }
  };

  const handleLogPress = () => {
    if (defaultTracker) {
      navigation.navigate("LogSymptoms", {
        trackerId: defaultTracker.id,
      });
    }
  };

  const handleConfigurePress = () => {
    if (defaultTracker) {
      navigation.navigate("ConfigurePeriodTracker", {
        trackerId: defaultTracker.id,
      });
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
    <View style={styles.container}>
      <HomeHeader onMenuPress={() => setMenuVisible(true)} />

      <ScrollView style={styles.scrollView}>
        {defaultTracker && (
          <>
            <View style={styles.titleSection}>
              <Text style={styles.calendarTitle}>{defaultTracker.name}</Text>
            </View>
            {needsSetup === true ? (
              <SetupPrompt
                trackerId={defaultTracker.id}
                onConfigure={handleConfigurePress}
              />
            ) : needsSetup === false ? (
              <CalendarSection
                trackerName={defaultTracker.name}
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
        onTrackerPress={(tracker) => {
          if (!editMode) {
            navigation.navigate("TrackerDetail", { trackerId: tracker.id });
          }
        }}
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
        onProfilePress={() => navigation.navigate("UserInfo")}
        onLogout={logout}
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
});
