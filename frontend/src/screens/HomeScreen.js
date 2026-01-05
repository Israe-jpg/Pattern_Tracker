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

export default function HomeScreen({ navigation }) {
  const { logout } = useAuth();
  const [menuVisible, setMenuVisible] = useState(false);

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
      <HomeHeader
        onMenuPress={() => setMenuVisible(true)}
        onProfilePress={() => navigation.navigate("UserInfo")}
        logout={logout}
      />

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
