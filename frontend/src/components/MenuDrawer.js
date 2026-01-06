import React, { useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  FlatList,
  Dimensions,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../constants/colors";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const DRAWER_WIDTH = (SCREEN_WIDTH * 5) / 6; // 5/6 of screen width

// Prebuilt tracker category names (matches backend)
const PREBUILT_CATEGORIES = [
  "Workout Tracker",
  "Symptom Tracker",
  "Period Tracker",
];

// Helper function to check if a tracker is prebuilt
const isPrebuiltTracker = (tracker) => {
  const categoryName = tracker.category_name || tracker.name;
  return PREBUILT_CATEGORIES.includes(categoryName);
};

export default function MenuDrawer({
  visible,
  onClose,
  trackers,
  onTrackerPress,
  onCreateCustomTracker,
}) {
  const slideAnim = useRef(new Animated.Value(-DRAWER_WIDTH)).current;

  useEffect(() => {
    if (visible) {
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: false, // Set to false to avoid native module warning
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: -DRAWER_WIDTH,
        duration: 300,
        useNativeDriver: false, // Set to false to avoid native module warning
      }).start();
    }
  }, [visible, slideAnim]);

  if (!visible) return null;

  const customTrackers = trackers?.filter((tracker) => !isPrebuiltTracker(tracker)) || [];
  const prebuiltTrackers = trackers?.filter((tracker) => isPrebuiltTracker(tracker)) || [];

  const renderTracker = ({ item }) => (
    <TouchableOpacity
      style={styles.trackerItem}
      onPress={() => {
        onTrackerPress(item);
        onClose();
      }}
    >
      <Text style={styles.trackerItemName}>{item.name}</Text>
      <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
    </TouchableOpacity>
  );

  return (
    <>
      {/* Backdrop */}
      <TouchableOpacity
        style={styles.backdrop}
        activeOpacity={1}
        onPress={onClose}
      />

      {/* Drawer */}
      <Animated.View
        style={[
          styles.drawer,
          {
            transform: [{ translateX: slideAnim }],
          },
        ]}
      >
        <View style={styles.drawerHeader}>
          <Text style={styles.drawerTitle}>Trackt</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Ionicons name="close" size={24} color={colors.text} />
          </TouchableOpacity>
        </View>

        <View style={styles.drawerContent}>
          <Text style={styles.sectionTitle}>My trackers:</Text>

          {/* Prebuilt Section */}
          <View style={styles.sectionContainer}>
            <Text style={styles.sectionSubtitle}>Prebuilt</Text>
            {prebuiltTrackers.length === 0 ? (
              <Text style={styles.emptyText}>No trackers yet</Text>
            ) : (
              <FlatList
                data={prebuiltTrackers}
                renderItem={renderTracker}
                keyExtractor={(item) => item.id.toString()}
                style={styles.trackersList}
                contentContainerStyle={styles.trackersListContent}
                showsVerticalScrollIndicator={false}
                scrollEnabled={false}
              />
            )}
          </View>

          {/* User-created Section - Only show if there are custom trackers */}
          {customTrackers.length > 0 && (
            <View style={styles.sectionContainer}>
              <Text style={styles.sectionSubtitle}>User-created</Text>
              <FlatList
                data={customTrackers}
                renderItem={renderTracker}
                keyExtractor={(item) => item.id.toString()}
                style={styles.trackersList}
                contentContainerStyle={styles.trackersListContent}
                showsVerticalScrollIndicator={false}
                scrollEnabled={false}
              />
            </View>
          )}

          <TouchableOpacity
            style={styles.createButton}
            onPress={() => {
              onCreateCustomTracker();
              onClose();
            }}
          >
            <Ionicons
              name="add-circle-outline"
              size={24}
              color={colors.primary}
            />
            <Text style={styles.createButtonText}>+ create custom tracker</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    zIndex: 998,
  },
  drawer: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: DRAWER_WIDTH,
    backgroundColor: colors.primary,
    zIndex: 999,
    ...(Platform.OS === "web"
      ? {
          boxShadow: "2px 0px 3.84px rgba(0, 0, 0, 0.25)",
        }
      : {
          shadowColor: "#000",
          shadowOffset: {
            width: 2,
            height: 0,
          },
          shadowOpacity: 0.25,
          shadowRadius: 3.84,
          elevation: 5,
        }),
  },
  drawerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    paddingTop: 60,
    borderBottomWidth: 1,
    borderBottomColor: colors.primaryDark,
  },
  drawerTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: colors.textOnPrimary,
  },
  closeButton: {
    padding: 4,
  },
  drawerContent: {
    flex: 1,
    padding: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.textOnPrimary,
    marginBottom: 16,
  },
  sectionContainer: {
    marginBottom: 20,
  },
  sectionSubtitle: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.textOnPrimary,
    marginBottom: 12,
    marginTop: 4,
  },
  trackersList: {
    marginBottom: 0,
  },
  trackersListContent: {
    paddingBottom: 0,
  },
  trackerItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: colors.background,
    padding: 16,
    borderRadius: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  trackerItemName: {
    fontSize: 16,
    color: colors.text,
    flex: 1,
  },
  emptyText: {
    fontSize: 14,
    color: colors.textSecondary,
    fontStyle: "italic",
    marginBottom: 20,
  },
  createButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.background,
    padding: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.primary,
    borderStyle: "dashed",
  },
  createButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.primary,
    marginLeft: 8,
  },
});