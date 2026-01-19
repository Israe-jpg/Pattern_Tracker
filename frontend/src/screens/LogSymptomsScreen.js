import React, { useState, useEffect, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
} from "react-native";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import FormField from "../components/form/FormField";
import FormFieldEdit from "../components/form/FormFieldEdit";
import { Ionicons } from "@expo/vector-icons";
import { trackerService } from "../services/trackerService";
import { dataTrackingService } from "../services/dataTrackingService";
import { colors } from "../constants/colors";
import { buildZodSchema } from "../utils/formSchemaBuilder";

export default function LogSymptomsScreen({ route, navigation }) {
  const { trackerId } = route.params || {};
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [formSchema, setFormSchema] = useState(null);
  const [managementSchema, setManagementSchema] = useState(null);
  const [existingData, setExistingData] = useState(null);
  const [entryDate] = useState(new Date().toISOString().split("T")[0]); // Today's date
  const [isEditMode, setIsEditMode] = useState(false);

  useEffect(() => {
    initializeForm();
  }, [trackerId]);

  /**
   * Initialize form: Load schema and check for existing data
   */
  const initializeForm = async () => {
    try {
      setLoading(true);

      // Step 1: Load form schema
      const schemaResponse = await trackerService.getFormSchema(trackerId);
      setFormSchema(schemaResponse);

      // Step 2: Check if data exists for today
      try {
        const response = await dataTrackingService.getDataByDate(
          trackerId,
          entryDate
        );

        // The service returns response.data, which contains { tracking_data: {...}, message: "..." }
        const trackingData =
          response?.data?.tracking_data || response?.tracking_data;
        const data = trackingData?.data;

        if (data && Object.keys(data).length > 0) {
          setExistingData(data);
        } else {
          setExistingData(null);
        }
      } catch (error) {
        // 404 means no data exists - that's fine
        if (error.response?.status === 404) {
          setExistingData(null);
        } else {
          throw error;
        }
      }

      setLoading(false);
    } catch (error) {
      console.error("Error initializing form:", error);
      setLoading(false);
      Alert.alert("Error", "Failed to load form. Please try again.", [
        { text: "Retry", onPress: initializeForm },
        { text: "Go Back", onPress: () => navigation.goBack() },
      ]);
    }
  };

  /**
   * Get default value based on option type
   */
  const getDefaultValue = (optionType) => {
    switch (optionType) {
      case "multiple_choice":
        return [];
      case "yes_no":
        return null;
      default:
        return null;
    }
  };

  /**
   * Convert database value to form-compatible type
   */
  const convertToFormType = (value, optionType) => {
    if (value === null || value === undefined) {
      return getDefaultValue(optionType);
    }

    switch (optionType) {
      case "rating":
      case "number_input":
        const num =
          typeof value === "string" ? parseFloat(value) : Number(value);
        return isNaN(num) ? null : num;

      case "yes_no":
        if (typeof value === "boolean") return value;
        if (typeof value === "string") return value === "true" || value === "1";
        return Boolean(value);

      case "multiple_choice":
        return Array.isArray(value) ? value : value ? [value] : [];

      case "text":
      case "notes":
      case "single_choice":
      case "time":
        return String(value);

      default:
        return value;
    }
  };

  /**
   * Build form default values from schema and existing data
   */
  const defaultValues = useMemo(() => {
    if (!formSchema?.field_groups) return {};

    const defaults = {};
    const fieldGroups = formSchema.field_groups;

    // Build structure from schema
    Object.keys(fieldGroups).forEach((groupName) => {
      const group = fieldGroups[groupName];
      if (!Array.isArray(group)) return;

      group.forEach((field) => {
        if (!field.options || field.options.length === 0) return;

        defaults[field.field_name] = {};

        field.options.forEach((option) => {
          const optionName = option.option_name;

          // Check if we have existing data for this field/option
          const existingValue = existingData?.[field.field_name]?.[optionName];

          if (existingValue !== undefined && existingValue !== null) {
            // Use existing data, converting to correct type
            defaults[field.field_name][optionName] = convertToFormType(
              existingValue,
              option.option_type
            );
          } else {
            // Use default for option type
            defaults[field.field_name][optionName] = getDefaultValue(
              option.option_type
            );
          }
        });
      });
    });

    return defaults;
  }, [formSchema, existingData]);

  const zodSchema = useMemo(() => {
    if (!formSchema) return null;
    return buildZodSchema(formSchema);
  }, [formSchema]);

  const {
    control,
    handleSubmit,
    formState: { errors, isDirty },
    reset,
  } = useForm({
    resolver: zodSchema ? zodResolver(zodSchema) : undefined,
    defaultValues,
    mode: "onBlur",
  });

  // Reset form when defaultValues change (after existing data loads)
  useEffect(() => {
    if (defaultValues && Object.keys(defaultValues).length > 0) {
      reset(defaultValues);
    }
  }, [defaultValues, reset]);

  /**
   * Handle form submission (create or update)
   */
  const onSubmit = async (data) => {
    try {
      setSubmitting(true);

      // Filter out empty values
      const cleanedData = {};
      Object.keys(data).forEach((fieldName) => {
        const fieldData = data[fieldName];
        if (!fieldData || typeof fieldData !== "object") return;

        Object.keys(fieldData).forEach((optionName) => {
          const value = fieldData[optionName];

          // Skip empty values
          if (value === null || value === undefined || value === "") return;
          if (Array.isArray(value) && value.length === 0) return;

          if (!cleanedData[fieldName]) {
            cleanedData[fieldName] = {};
          }
          cleanedData[fieldName][optionName] = value;
        });
      });

      // Submit to backend (save endpoint handles both create and update)
      await dataTrackingService.saveData(trackerId, cleanedData, entryDate);

      // Update state to reflect that data now exists
      if (!existingData) {
        setExistingData(cleanedData);
      }

      const message = existingData
        ? "Symptoms updated successfully!"
        : "Symptoms logged successfully!";

      Alert.alert("Success", message, [
        { text: "OK", onPress: () => navigation.goBack() },
      ]);
    } catch (error) {
      console.error("Error submitting form:", error);

      let errorMessage = "Failed to save symptoms. Please try again.";
      if (error.response?.data?.error) {
        errorMessage = error.response.data.error;
      }

      Alert.alert("Error", errorMessage);
    } finally {
      setSubmitting(false);
    }
  };

  /**
   * Edit mode handlers
   */
  const handleDeleteField = (field) => {
    Alert.alert(
      "Delete Field",
      `Are you sure you want to delete "${
        field.display_label || field.field_name
      }"?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            // TODO: Implement field deletion API call
          },
        },
      ]
    );
  };

  const handleEditField = (field) => {
    // TODO: Navigate to field edit screen or show modal
    Alert.alert(
      "Edit Field",
      `Editing "${field.display_label || field.field_name}"`
    );
  };

  const handleDeleteOption = (field, option) => {
    Alert.alert(
      "Delete Option",
      `Delete "${option.display_label || option.option_name}" from "${
        field.display_label || field.field_name
      }"?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            // TODO: Implement option deletion API call
          },
        },
      ]
    );
  };

  const handleEditOption = (field, option) => {
    // TODO: Navigate to option edit screen or show modal
    Alert.alert(
      "Edit Option",
      `Editing "${option.display_label || option.option_name}"`
    );
  };

  const handleAddField = () => {
    // TODO: Navigate to field creation screen or show modal
    Alert.alert("Add Field", "Create a new field for this form");
  };

  const handleAddOption = (field) => {
    // TODO: Navigate to option creation screen or show modal
    Alert.alert(
      "Add Option",
      `Add a new option to "${field.display_label || field.field_name}"`
    );
  };

  const handleToggleField = (field, activate) => {
    const action = activate ? "Show" : "Hide";
    Alert.alert(
      `${action} Field`,
      `${action} "${field.display_label || field.field_name}" in the form?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: action,
          onPress: () => {
            // TODO: Implement field toggle API call
          },
        },
      ]
    );
  };

  const handleToggleOption = (field, option, activate) => {
    const action = activate ? "Show" : "Hide";
    Alert.alert(
      `${action} Option`,
      `${action} "${option.display_label || option.option_name}" in "${
        field.display_label || field.field_name
      }"?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: action,
          onPress: () => {
            // TODO: Implement option toggle API call
          },
        },
      ]
    );
  };

  /**
   * Load management schema for edit mode
   */
  const loadManagementSchema = async () => {
    try {
      const schema = await trackerService.getManagementSchema(trackerId);
      setManagementSchema(schema);
    } catch (error) {
      console.error("Error loading management schema:", error);
      Alert.alert("Error", "Failed to load form editor. Please try again.");
    }
  };

  /**
   * Toggle edit mode
   */
  const toggleEditMode = async () => {
    if (!isEditMode && !managementSchema) {
      // Entering edit mode - load management schema
      await loadManagementSchema();
    }
    setIsEditMode(!isEditMode);
  };

  /**
   * Get unique fields from all field groups
   */
  const fields = useMemo(() => {
    // Use management schema in edit mode, regular schema otherwise
    const schema = isEditMode ? managementSchema : formSchema;

    if (isEditMode) {
      // Management schema has a different structure: baseline_fields, category_fields, custom_fields
      if (!schema) return [];

      const allFields = [
        ...(schema.baseline_fields || []),
        ...(schema.category_fields || []),
        ...(schema.custom_fields || []),
      ];

      return allFields;
    } else {
      // Regular form schema has field_groups
      if (!schema?.field_groups) return [];

      const uniqueFields = [];
      const seenIds = new Set();

      Object.values(schema.field_groups).forEach((group) => {
        if (!Array.isArray(group)) return;

        group.forEach((field) => {
          const key = field.id || field.field_name;
          if (key && !seenIds.has(key)) {
            seenIds.add(key);
            uniqueFields.push(field);
          }
        });
      });

      return uniqueFields;
    }
  }, [formSchema, managementSchema, isEditMode]);

  // Loading state - Professional skeleton loader
  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Ionicons
              name="arrow-back"
              size={24}
              color={colors.textOnPrimary}
            />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Log Symptoms</Text>
          <View style={styles.placeholder} />
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
        >
          {/* Date indicator skeleton */}
          <View style={styles.dateContainer}>
            <View style={styles.skeletonIcon} />
            <View style={styles.skeletonDateText} />
          </View>

          {/* Three skeleton field sections */}
          {[1, 2, 3].map((index) => (
            <View key={index} style={styles.skeletonFieldContainer}>
              {/* Field label skeleton */}
              <View style={styles.skeletonLabel} />

              {/* Option skeletons - varying sizes */}
              <View style={styles.skeletonOptionsContainer}>
                <View style={[styles.skeletonOption, { width: "45%" }]} />
                <View style={[styles.skeletonOption, { width: "45%" }]} />
              </View>
              <View style={styles.skeletonOptionsContainer}>
                <View style={[styles.skeletonOption, { width: "60%" }]} />
              </View>
            </View>
          ))}
        </ScrollView>
      </View>
    );
  }

  // Error state
  if (!formSchema && !loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Ionicons
              name="arrow-back"
              size={24}
              color={colors.textOnPrimary}
            />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Log Symptoms</Text>
          <View style={styles.placeholder} />
        </View>
        <View style={styles.centerContainer}>
          <Ionicons
            name="alert-circle-outline"
            size={64}
            color={colors.error}
          />
          <Text style={styles.errorText}>Failed to load form</Text>
          <TouchableOpacity style={styles.retryButton} onPress={initializeForm}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Main form
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color={colors.textOnPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {isEditMode ? "Edit Form" : existingData ? "Update" : "Log"} Symptoms
        </Text>
        {!isEditMode && (
          <TouchableOpacity
            style={[
              styles.headerSubmitButton,
              (!isDirty || submitting) && styles.headerSubmitButtonDisabled,
            ]}
            onPress={handleSubmit(onSubmit)}
            disabled={!isDirty || submitting}
          >
            {submitting ? (
              <ActivityIndicator size="small" color={colors.textOnPrimary} />
            ) : (
              <Ionicons
                name="checkmark"
                size={24}
                color={colors.textOnPrimary}
              />
            )}
          </TouchableOpacity>
        )}
        {isEditMode && <View style={styles.placeholder} />}
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={true}
      >
        {/* Date indicator - only show in normal mode */}
        {!isEditMode && (
          <View style={styles.dateContainer}>
            <Ionicons name="calendar" size={20} color={colors.primary} />
            <Text style={styles.dateText}>
              {new Date(entryDate).toLocaleDateString("en-US", {
                weekday: "long",
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </Text>
          </View>
        )}

        {/* Edit mode indicator */}
        {isEditMode && (
          <View style={styles.editModeIndicator}>
            <Ionicons name="build-outline" size={20} color={colors.primary} />
            <Text style={styles.editModeText}>
              Edit mode - Customize your form fields and options
            </Text>
          </View>
        )}

        {/* Form fields */}
        {isEditMode ? (
          // Edit mode - show field editor
          <>
            {fields.map((field) => (
              <FormFieldEdit
                key={field.id || field.field_name}
                field={field}
                onDeleteField={handleDeleteField}
                onEditField={handleEditField}
                onDeleteOption={handleDeleteOption}
                onEditOption={handleEditOption}
                onAddOption={handleAddOption}
                onToggleField={handleToggleField}
                onToggleOption={handleToggleOption}
              />
            ))}
            {/* Add field button */}
            <TouchableOpacity
              style={styles.addFieldButton}
              onPress={handleAddField}
            >
              <Ionicons
                name="add-circle-outline"
                size={24}
                color={colors.primary}
              />
              <Text style={styles.addFieldText}>Add New Field</Text>
            </TouchableOpacity>
          </>
        ) : (
          // Normal mode - show form
          fields.map((field) => (
            <FormField
              key={field.id || field.field_name}
              field={field}
              control={control}
            />
          ))
        )}

        {/* Submit and Edit buttons */}
        <View
          style={[
            styles.bottomButtonsContainer,
            isEditMode && styles.bottomButtonsContainerCentered,
          ]}
        >
          {!isEditMode && (
            <TouchableOpacity
              style={[
                styles.submitButton,
                (!isDirty || submitting) && styles.submitButtonDisabled,
              ]}
              onPress={handleSubmit(onSubmit)}
              disabled={!isDirty || submitting}
            >
              {submitting ? (
                <ActivityIndicator size="small" color={colors.textOnPrimary} />
              ) : (
                <>
                  <Ionicons
                    name="checkmark"
                    size={20}
                    color={colors.textOnPrimary}
                    style={styles.buttonIcon}
                  />
                  <Text style={styles.submitButtonText}>
                    {existingData ? "Update" : "Submit"}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[
              styles.editFormButton,
              isEditMode && styles.editFormButtonActive,
            ]}
            onPress={toggleEditMode}
          >
            <Ionicons
              name={isEditMode ? "checkmark" : "create-outline"}
              size={20}
              color={isEditMode ? colors.textOnPrimary : colors.primary}
            />
          </TouchableOpacity>
        </View>
      </ScrollView>
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
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    paddingTop: 60,
    backgroundColor: colors.navigation,
    borderBottomWidth: 1,
    borderBottomColor: colors.navigation,
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: colors.textOnPrimary,
  },
  headerSubmitButton: {
    padding: 4,
    width: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  headerSubmitButtonDisabled: {
    opacity: 0.4,
  },
  placeholder: {
    width: 32,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    backgroundColor: colors.formSchemaBackground,
  },
  dateContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.background,
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
  },
  dateText: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.text,
    marginLeft: 10,
  },
  editModeIndicator: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  editModeText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.text,
    marginLeft: 10,
    flex: 1,
  },
  bottomButtonsContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 20,
    marginBottom: 40,
    gap: 12,
  },
  bottomButtonsContainerCentered: {
    justifyContent: "center",
  },
  submitButton: {
    backgroundColor: colors.primary,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 50,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    alignSelf: "flex-start",
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  buttonIcon: {
    marginRight: 8,
  },
  submitButtonText: {
    color: colors.textOnPrimary,
    fontSize: 16,
    fontWeight: "600",
  },
  editFormButton: {
    backgroundColor: colors.surface,
    padding: 12,
    borderRadius: 50,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  editFormButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  addFieldButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.formFieldBackground,
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    marginHorizontal: 20,
    borderWidth: 2,
    borderColor: colors.primary,
    borderStyle: "dashed",
    gap: 8,
  },
  addFieldText: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.primary,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: colors.textSecondary,
  },
  errorText: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.error,
    marginTop: 16,
    marginBottom: 24,
    textAlign: "center",
  },
  retryButton: {
    backgroundColor: colors.primary,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  retryButtonText: {
    color: colors.textOnPrimary,
    fontSize: 16,
    fontWeight: "600",
  },
  // Skeleton loader styles
  skeletonIcon: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.border,
    opacity: 0.3,
  },
  skeletonDateText: {
    width: 200,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.border,
    opacity: 0.3,
    marginLeft: 10,
  },
  skeletonFieldContainer: {
    backgroundColor: colors.formFieldBackground,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    marginHorizontal: 20,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  skeletonLabel: {
    width: 120,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.border,
    opacity: 0.3,
    marginBottom: 12,
  },
  skeletonOptionsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: 12,
    gap: 8,
  },
  skeletonOption: {
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.border,
    opacity: 0.2,
    marginBottom: 8,
  },
});
