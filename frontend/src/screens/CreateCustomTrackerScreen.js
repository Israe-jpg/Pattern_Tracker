import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../constants/colors";
import { useTracker } from "../context/TrackerContext";
import { trackerService } from "../services/trackerService";
import FieldCreationModal from "../components/FieldCreationModal";

const OPTION_TYPE_LABELS = {
  rating: "Rating Scale",
  single_choice: "Single Choice",
  multiple_choice: "Multiple Choice",
  yes_no: "Yes / No",
  number_input: "Number Input",
  text: "Text Input",
  notes: "Notes",
  time: "Time Picker",
};

function FieldPreviewCard({ field, index, onEdit, onDelete }) {
  const optionLabels = (field.options || [])
    .map((o) => OPTION_TYPE_LABELS[o.option_type] || o.option_type)
    .filter(Boolean);

  return (
    <View style={styles.fieldCard}>
      <View style={styles.fieldCardLeft}>
        <Text style={styles.fieldCardLabel} numberOfLines={1}>
          {field.display_label || field.field_name}
        </Text>
        <View style={styles.chipRow}>
          {optionLabels.map((label, i) => (
            <View key={i} style={styles.chip}>
              <Text style={styles.chipText}>{label}</Text>
            </View>
          ))}
        </View>
      </View>
      <View style={styles.fieldCardActions}>
        <TouchableOpacity
          style={styles.iconButton}
          onPress={() => onEdit(field, index)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="pencil-outline" size={20} color={colors.primary} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.iconButton, { marginLeft: 8 }]}
          onPress={() => onDelete(index)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="trash-outline" size={20} color={colors.error} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function CreateCustomTrackerScreen({ navigation }) {
  const { loadTrackers, setActiveTracker } = useTracker();

  const [trackerName, setTrackerName] = useState("");
  const [pendingFields, setPendingFields] = useState([]);
  const [showFieldModal, setShowFieldModal] = useState(false);
  const [editingField, setEditingField] = useState(null);
  const [editingIndex, setEditingIndex] = useState(null);
  const [loading, setLoading] = useState(false);
  const [nameError, setNameError] = useState("");
  const [fieldsError, setFieldsError] = useState("");

  const handleAddField = () => {
    setEditingField(null);
    setEditingIndex(null);
    setShowFieldModal(true);
  };

  const handleEditField = (field, index) => {
    setEditingField(field);
    setEditingIndex(index);
    setShowFieldModal(true);
  };

  const handleDeleteField = (index) => {
    Alert.alert("Remove Field", "Remove this field from the tracker?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () =>
          setPendingFields((prev) => prev.filter((_, i) => i !== index)),
      },
    ]);
  };

  const handleFieldSubmit = (fieldData) => {
    setFieldsError("");
    if (editingIndex !== null) {
      setPendingFields((prev) =>
        prev.map((f, i) => (i === editingIndex ? fieldData : f))
      );
    } else {
      setPendingFields((prev) => [...prev, fieldData]);
    }
    setShowFieldModal(false);
    setEditingField(null);
    setEditingIndex(null);
  };

  const handleCreate = async () => {
    let valid = true;

    if (!trackerName.trim()) {
      setNameError("Please enter a tracker name.");
      valid = false;
    } else {
      setNameError("");
    }

    if (pendingFields.length === 0) {
      setFieldsError("Add at least one field to your tracker.");
      valid = false;
    } else {
      setFieldsError("");
    }

    if (!valid) return;

    setLoading(true);
    try {
      const payload = {
        name: trackerName.trim(),
        custom_fields: pendingFields,
      };
      const result = await trackerService.createCustomTracker(payload);
      if (result.tracker_id) {
        await setActiveTracker({ id: result.tracker_id });
      }
      await loadTrackers();
      navigation.navigate("Home");
    } catch (err) {
      const message =
        err?.response?.data?.message ||
        err?.message ||
        "Something went wrong. Please try again.";
      Alert.alert("Error", message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.backButton}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="chevron-back" size={26} color={colors.textOnPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Create Custom Tracker</Text>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Tracker Name */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Tracker Name</Text>
            <TextInput
              style={[styles.nameInput, nameError ? styles.inputError : null]}
              placeholder="e.g. Sleep Quality, Mood Journal…"
              placeholderTextColor={colors.textLight}
              value={trackerName}
              onChangeText={(t) => {
                setTrackerName(t);
                if (t.trim()) setNameError("");
              }}
              returnKeyType="done"
              maxLength={80}
            />
            {nameError ? (
              <Text style={styles.errorText}>{nameError}</Text>
            ) : null}
          </View>

          {/* Fields Section */}
          <View style={styles.section}>
            <View style={styles.fieldsSectionHeader}>
              <Text style={styles.sectionLabel}>
                Fields{pendingFields.length > 0 ? ` (${pendingFields.length})` : ""}
              </Text>
            </View>

            {fieldsError ? (
              <Text style={[styles.errorText, { marginBottom: 8 }]}>
                {fieldsError}
              </Text>
            ) : null}

            {pendingFields.length === 0 ? (
              <View style={styles.emptyFieldsCard}>
                <Ionicons
                  name="list-outline"
                  size={32}
                  color={colors.textLight}
                />
                <Text style={styles.emptyFieldsText}>No fields added yet.</Text>
                <Text style={styles.emptyFieldsSubText}>
                  Tap "Add Field" below to define what you want to track.
                </Text>
              </View>
            ) : (
              pendingFields.map((field, index) => (
                <FieldPreviewCard
                  key={index}
                  field={field}
                  index={index}
                  onEdit={handleEditField}
                  onDelete={handleDeleteField}
                />
              ))
            )}

            {/* Add Field Button */}
            <TouchableOpacity
              style={styles.addFieldButton}
              onPress={handleAddField}
              activeOpacity={0.75}
            >
              <Ionicons name="add-circle-outline" size={20} color={colors.primary} />
              <Text style={styles.addFieldButtonText}>Add Field</Text>
            </TouchableOpacity>
          </View>

          {/* Create Tracker Button */}
          <TouchableOpacity
            style={[
              styles.createButton,
              loading && styles.createButtonDisabled,
            ]}
            onPress={handleCreate}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color={colors.textOnPrimary} size="small" />
            ) : (
              <>
                <Ionicons
                  name="checkmark-circle-outline"
                  size={20}
                  color={colors.textOnPrimary}
                  style={{ marginRight: 8 }}
                />
                <Text style={styles.createButtonText}>Create Tracker</Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>

      <FieldCreationModal
        visible={showFieldModal}
        onClose={() => {
          setShowFieldModal(false);
          setEditingField(null);
          setEditingIndex(null);
        }}
        onSubmit={handleFieldSubmit}
        editingField={editingField}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.navigation,
  },
  flex: {
    flex: 1,
  },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: colors.navigation,
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: 18,
    fontWeight: "700",
    color: colors.textOnPrimary,
    letterSpacing: 0.3,
  },
  headerSpacer: {
    width: 34,
  },

  // Scroll
  scroll: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    paddingTop: 24,
    paddingBottom: 48,
  },

  // Sections
  section: {
    marginHorizontal: 20,
    marginBottom: 28,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  fieldsSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },

  // Tracker name input
  nameInput: {
    backgroundColor: colors.formFieldBackground,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: colors.text,
    borderWidth: 1.5,
    borderColor: "transparent",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  inputError: {
    borderColor: colors.error,
  },
  errorText: {
    marginTop: 6,
    fontSize: 13,
    color: colors.error,
    fontWeight: "500",
  },

  // Empty fields placeholder
  emptyFieldsCard: {
    backgroundColor: colors.formFieldBackground,
    borderRadius: 12,
    padding: 28,
    alignItems: "center",
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  emptyFieldsText: {
    marginTop: 10,
    fontSize: 15,
    fontWeight: "600",
    color: colors.textSecondary,
  },
  emptyFieldsSubText: {
    marginTop: 4,
    fontSize: 13,
    color: colors.textLight,
    textAlign: "center",
    lineHeight: 18,
  },

  // Field preview card (mirrors FormField container style)
  fieldCard: {
    backgroundColor: colors.formFieldBackground,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  fieldCardLeft: {
    flex: 1,
    marginRight: 12,
  },
  fieldCardLabel: {
    fontSize: 17,
    fontWeight: "600",
    color: colors.text,
    marginBottom: 6,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  chip: {
    backgroundColor: colors.background,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  chipText: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: "500",
  },
  fieldCardActions: {
    flexDirection: "row",
    alignItems: "center",
  },
  iconButton: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: colors.background,
  },

  // Add Field button
  addFieldButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 13,
    borderRadius: 12,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: colors.primary,
    marginTop: 4,
  },
  addFieldButtonText: {
    marginLeft: 6,
    fontSize: 15,
    fontWeight: "600",
    color: colors.primary,
  },

  // Create Tracker button
  createButton: {
    marginHorizontal: 20,
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: colors.primaryDark,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
  },
  createButtonDisabled: {
    opacity: 0.65,
  },
  createButtonText: {
    color: colors.textOnPrimary,
    fontSize: 17,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
});
