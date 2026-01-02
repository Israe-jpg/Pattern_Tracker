import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../context/AuthContext";
import { trackerService } from "../services/trackerService";
import { colors } from "../constants/colors";
import MenuDrawer from "../components/MenuDrawer";

export default function HomeScreen({ navigation }) {
  const { user, logout } = useAuth();
  const [trackers, setTrackers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [menuVisible, setMenuVisible] = useState(false);

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
    } catch (error) {
      console.error("Error loading trackers:", error);
      console.error("Error details:", error.response?.data);
      setTrackers([]);
    } finally {
      setLoading(false);
    }
  };

  // Reload trackers when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      loadTrackers();
    }, [])
  );

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
          <Ionicons name="menu" size={28} color={colors.text} />
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
            color={colors.text}
          />
        </TouchableOpacity>
      </View>

      <FlatList
        data={trackers}
        renderItem={renderTracker}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No trackers yet</Text>
          </View>
        }
      />

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
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  menuButton: {
    padding: 4,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: colors.text,
    flex: 1,
    textAlign: "center",
  },
  profileButton: {
    padding: 4,
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
