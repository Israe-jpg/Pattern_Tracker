import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../constants/colors";

export default function SetupPrompt({ trackerId, onConfigure }) {
  return (
    <View style={styles.calendarSection}>
      <View style={styles.setupPrompt}>
        <Ionicons name="settings-outline" size={48} color={colors.primary} />
        <Text style={styles.setupTitle}>Setup Required</Text>
        <Text style={styles.setupText}>
          Configure your Period Tracker to start logging your symptoms and
          tracking your cycle.
        </Text>
        <TouchableOpacity style={styles.configureButton} onPress={onConfigure}>
          <Text style={styles.configureButtonText}>Configure Tracker</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  calendarSection: {
    backgroundColor: colors.secondary,
    padding: 20,
    marginBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.secondaryDark,
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
});

