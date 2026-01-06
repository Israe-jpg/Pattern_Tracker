import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  FlatList,
  Dimensions,
  Platform,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../constants/colors";
import { useAuth } from "../context/AuthContext";

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
  onEditTrackersList,
  editMode,
  setEditMode,
  onDeleteTracker,
  onToggleDefault,
  defaultTrackerId,
  onProfilePress,
  onLogout,
}) {
  const slideAnim = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  const [showDropdown, setShowDropdown] = useState(false);
  const [hidePrebuilt, setHidePrebuilt] = useState(false);
  const [profileDropdownVisible, setProfileDropdownVisible] = useState(false);
  const { user } = useAuth();

  useEffect(() => {
    if (visible) {
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: false,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: -DRAWER_WIDTH,
        duration: 300,
        useNativeDriver: false,
      }).start();
      // Close dropdown when drawer closes
      setShowDropdown(false);
    }
  }, [visible, slideAnim]);

  if (!visible) return null;

  const customTrackers =
    trackers?.filter((tracker) => !isPrebuiltTracker(tracker)) || [];
  const prebuiltTrackers =
    trackers?.filter((tracker) => isPrebuiltTracker(tracker)) || [];

  const handleDelete = (tracker) => {
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
          onPress: () => {
            if (onDeleteTracker) {
              onDeleteTracker(tracker.id);
            }
          },
        },
      ]
    );
  };

  const handleToggleDefault = (tracker) => {
    const isCurrentlyDefault = defaultTrackerId === tracker.id;

    // If it's already the default, do nothing
    if (isCurrentlyDefault) {
      return;
    }

    // Call the parent handler which will show the alert
    if (onToggleDefault) {
      onToggleDefault(tracker.id);
    }
  };

  const renderTracker = ({ item }) => (
    <View style={styles.trackerItemWrapper}>
      {editMode && (
        <View style={styles.editIcons}>
          {!isPrebuiltTracker(item) && (
            <TouchableOpacity
              style={styles.deleteButton}
              onPress={() => handleDelete(item)}
            >
              <View style={styles.deleteIconContainer}>
                <Ionicons name="remove" size={14} color="white" />
              </View>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={styles.starButton}
            onPress={() => handleToggleDefault(item)}
          >
            <Ionicons
              name={defaultTrackerId === item.id ? "star" : "star-outline"}
              size={24}
              color={
                defaultTrackerId === item.id ? "#FFD700" : colors.textOnPrimary
              }
            />
          </TouchableOpacity>
        </View>
      )}
      <TouchableOpacity
        style={styles.trackerItem}
        onPress={() => {
          if (!editMode) {
            onTrackerPress(item);
            onClose();
          }
        }}
        disabled={editMode}
      >
        <Text style={styles.trackerItemName}>{item.name}</Text>
        {!editMode && (
          <Ionicons
            name="chevron-forward"
            size={20}
            color={colors.textSecondary}
          />
        )}
      </TouchableOpacity>
    </View>
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
          <View style={styles.sectionTitleContainer}>
            <Text style={styles.sectionTitle}>My trackers:</Text>
          </View>

          {/* Prebuilt Section */}
          {!hidePrebuilt && (
            <View style={styles.sectionContainer}>
              <View style={styles.sectionSubtitleContainer}>
                <Text style={styles.sectionSubtitle}>Prebuilt</Text>
                {editMode && (
                  <TouchableOpacity
                    style={styles.hideButton}
                    onPress={() => setHidePrebuilt(true)}
                  >
                    <Text style={styles.hideButtonText}>Hide</Text>
                  </TouchableOpacity>
                )}
              </View>
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
          )}

          {/* Show button when prebuilt is hidden */}
          {hidePrebuilt && editMode && (
            <View style={styles.sectionContainer}>
              <View style={styles.sectionSubtitleContainer}>
                <Text style={styles.sectionSubtitle}>Prebuilt</Text>
                <TouchableOpacity
                  style={styles.hideButton}
                  onPress={() => setHidePrebuilt(false)}
                >
                  <Text style={styles.hideButtonText}>Show</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* User-created Section - Only show if there are custom trackers */}
          {customTrackers.length > 0 && (
            <View style={styles.sectionContainer}>
              <View style={styles.sectionSubtitleContainer}>
                <Text style={styles.sectionSubtitle}>User-created</Text>
              </View>
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
        </View>

        {/* Bottom Bar - Profile on left, Edit/Done on right */}
        <View style={styles.bottomBar}>
          {/* Profile Section - Left */}
          <View style={styles.profileSection}>
            <TouchableOpacity
              style={styles.profileButton}
              onPress={() => setProfileDropdownVisible(!profileDropdownVisible)}
            >
              <Ionicons
                name="person-circle-outline"
                size={24}
                color={colors.textOnPrimary}
              />
              {user && (
                <Text style={styles.userName} numberOfLines={1}>
                  {user.first_name && user.last_name
                    ? `${user.first_name} ${user.last_name}`
                    : user.first_name || user.username || user.email || "User"}
                </Text>
              )}
            </TouchableOpacity>

            {profileDropdownVisible && (
              <View style={styles.profileDropdown}>
                <TouchableOpacity
                  style={styles.profileDropdownItem}
                  onPress={() => {
                    setProfileDropdownVisible(false);
                    if (onProfilePress) {
                      onProfilePress();
                    }
                  }}
                >
                  <Ionicons
                    name="person-outline"
                    size={20}
                    color={colors.textOnPrimary}
                    style={styles.profileDropdownIcon}
                  />
                  <Text style={styles.profileDropdownText}>Profile</Text>
                </TouchableOpacity>
                <View style={styles.profileDropdownDivider} />
                <TouchableOpacity
                  style={styles.profileDropdownItem}
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
                        onPress: () => {
                          if (onLogout) {
                            onLogout();
                          }
                        },
                      },
                    ]);
                  }}
                >
                  <Ionicons
                    name="log-out-outline"
                    size={20}
                    color={colors.textOnPrimary}
                    style={styles.profileDropdownIcon}
                  />
                  <Text style={styles.profileDropdownText}>Logout</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* Edit/Done Button - Right */}
          {editMode ? (
            <TouchableOpacity
              style={styles.editButton}
              onPress={() => setEditMode(false)}
            >
              <Text style={styles.doneButtonText}>Done</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.editButton}
              onPress={() => setShowDropdown(!showDropdown)}
            >
              <Ionicons name="pencil" size={32} color={colors.textOnPrimary} />
            </TouchableOpacity>
          )}
        </View>

        {/* Profile Dropdown Backdrop */}
        {profileDropdownVisible && (
          <TouchableOpacity
            style={styles.profileDropdownBackdrop}
            activeOpacity={1}
            onPress={() => setProfileDropdownVisible(false)}
          />
        )}

        {/* Dropdown Menu - Left Side */}
        {showDropdown && (
          <>
            <TouchableOpacity
              style={styles.dropdownBackdrop}
              activeOpacity={1}
              onPress={() => setShowDropdown(false)}
            />
            <View style={styles.dropdown}>
              <TouchableOpacity
                style={styles.dropdownItem}
                onPress={() => {
                  setEditMode(true);
                  setShowDropdown(false);
                }}
              >
                <Ionicons
                  name="list"
                  size={20}
                  color={colors.textOnPrimary}
                  style={styles.dropdownIcon}
                />
                <Text style={styles.dropdownText}>Edit trackers list</Text>
              </TouchableOpacity>
              <View style={styles.dropdownDivider} />
              <TouchableOpacity
                style={styles.dropdownItem}
                onPress={() => {
                  onCreateCustomTracker();
                  setShowDropdown(false);
                  onClose();
                }}
              >
                <Ionicons
                  name="add-circle"
                  size={20}
                  color={colors.textOnPrimary}
                  style={styles.dropdownIcon}
                />
                <Text style={styles.dropdownText}>Add a custom tracker</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
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
  sectionTitleContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.textOnPrimary,
  },
  doneButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.textOnPrimary,
  },
  sectionContainer: {
    marginBottom: 20,
  },
  sectionSubtitleContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
    marginTop: 4,
  },
  sectionSubtitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "rgba(255, 255, 255, 0.7)", // White/greyish color
  },
  hideButton: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: colors.primaryLight,
  },
  hideButtonText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.textOnPrimary,
  },
  trackersList: {
    marginBottom: 0,
  },
  trackersListContent: {
    paddingBottom: 0,
  },
  trackerItemWrapper: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  trackerItem: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: colors.background,
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  trackerItemName: {
    fontSize: 16,
    color: colors.text,
    flex: 1,
  },
  editIcons: {
    flexDirection: "row",
    alignItems: "center",
    marginRight: 12,
  },
  deleteButton: {
    padding: 2,
    marginRight: 12,
  },
  deleteIconContainer: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#FF4444",
    justifyContent: "center",
    alignItems: "center",
  },
  starButton: {
    padding: 2,
  },
  emptyText: {
    fontSize: 14,
    color: colors.textSecondary,
    fontStyle: "italic",
    marginBottom: 20,
  },
  bottomBar: {
    position: "absolute",
    bottom: 30,
    left: 20,
    right: 20,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    zIndex: 1000,
  },
  profileSection: {
    position: "relative",
    flex: 1,
    marginRight: 12,
  },
  profileButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.primaryDark,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    maxWidth: "100%",
  },
  userName: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.textOnPrimary,
    marginLeft: 8,
    flex: 1,
  },
  profileDropdown: {
    position: "absolute",
    bottom: 50,
    left: 0,
    backgroundColor: colors.primaryDark,
    borderRadius: 12,
    minWidth: 180,
    zIndex: 1003,
    borderWidth: 1,
    borderColor: colors.primaryLight,
    overflow: "hidden",
    ...(Platform.OS === "web"
      ? {
          boxShadow: "0px 4px 12px rgba(0, 0, 0, 0.4)",
        }
      : {
          shadowColor: "#000",
          shadowOffset: {
            width: 0,
            height: 4,
          },
          shadowOpacity: 0.4,
          shadowRadius: 8,
          elevation: 10,
        }),
  },
  profileDropdownItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    paddingHorizontal: 18,
    backgroundColor: "transparent",
  },
  profileDropdownIcon: {
    marginRight: 12,
  },
  profileDropdownText: {
    fontSize: 16,
    fontWeight: "500",
    color: colors.textOnPrimary,
    flex: 1,
  },
  profileDropdownDivider: {
    height: 1,
    backgroundColor: colors.primaryLight,
    marginHorizontal: 16,
  },
  profileDropdownBackdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1002,
  },
  editButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primaryDark,
    justifyContent: "center",
    alignItems: "center",
    ...(Platform.OS === "web"
      ? {
          boxShadow: "0px 4px 8px rgba(0, 0, 0, 0.3)",
        }
      : {
          shadowColor: "#000",
          shadowOffset: {
            width: 0,
            height: 4,
          },
          shadowOpacity: 0.3,
          shadowRadius: 4,
          elevation: 8,
        }),
  },
  dropdownBackdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1001,
  },
  dropdown: {
    position: "absolute",
    right: 20,
    bottom: 96,
    backgroundColor: colors.primaryDark,
    borderRadius: 12,
    minWidth: 220,
    zIndex: 1002,
    borderWidth: 1,
    borderColor: colors.primaryLight,
    overflow: "hidden",
    ...(Platform.OS === "web"
      ? {
          boxShadow: "0px 4px 12px rgba(0, 0, 0, 0.4)",
        }
      : {
          shadowColor: "#000",
          shadowOffset: {
            width: 0,
            height: 4,
          },
          shadowOpacity: 0.4,
          shadowRadius: 8,
          elevation: 10,
        }),
  },
  dropdownItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    paddingHorizontal: 18,
    backgroundColor: "transparent",
  },
  dropdownIcon: {
    marginRight: 12,
  },
  dropdownText: {
    fontSize: 16,
    fontWeight: "500",
    color: colors.textOnPrimary,
    flex: 1,
  },
  dropdownDivider: {
    height: 1,
    backgroundColor: colors.primaryLight,
    marginHorizontal: 16,
  },
});
