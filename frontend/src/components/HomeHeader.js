import React, { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Alert, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../constants/colors";

export default function HomeHeader({ onMenuPress, onProfilePress, logout }) {
  const [profileDropdownVisible, setProfileDropdownVisible] = useState(false);

  const handleProfilePress = () => {
    setProfileDropdownVisible(!profileDropdownVisible);
  };

  const handleProfileOption = (action) => {
    setProfileDropdownVisible(false);
    if (action === "profile") {
      onProfilePress();
    } else if (action === "logout") {
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
    }
  };

  return (
    <>
      <View style={styles.header}>
        <TouchableOpacity style={styles.menuButton} onPress={onMenuPress}>
          <Ionicons name="menu" size={28} color={colors.textOnPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>Trackt</Text>
        <View style={styles.profileContainer}>
          <TouchableOpacity
            style={styles.profileButton}
            onPress={handleProfilePress}
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
                onPress={() => handleProfileOption("profile")}
              >
                <Ionicons name="person-outline" size={20} color={colors.text} />
                <Text style={styles.dropdownItemText}>Profile</Text>
              </TouchableOpacity>
              <View style={styles.dropdownDivider} />
              <TouchableOpacity
                style={styles.dropdownItem}
                onPress={() => handleProfileOption("logout")}
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
    </>
  );
}

const styles = StyleSheet.create({
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
    ...(Platform.OS === "web"
      ? {
          boxShadow: "0px 2px 3.84px rgba(0, 0, 0, 0.25)",
        }
      : {
          shadowColor: "#000",
          shadowOffset: {
            width: 0,
            height: 2,
          },
          shadowOpacity: 0.25,
          shadowRadius: 3.84,
          elevation: 5,
        }),
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
});

