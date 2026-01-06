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
import { Ionicons } from "@expo/vector-icons";
import { trackerService } from "../services/trackerService";
import { dataTrackingService } from "../services/dataTrackingService";
import { colors } from "../constants/colors";
import { buildZodSchema } from "../utils/formSchemaBuilder";

export default function LogSymptomsScreen({ route, navigation }) {
  const { trackerId, selectedDate } = route.params || {};
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [formSchema, setFormSchema] = useState(null);

  useEffect(() => {
    loadFormSchema();
  }, [trackerId]);

  // Convert nested schema structure to field/option format
  const convertSchemaToFields = (schemaObj, groupName) => {
    if (
      !schemaObj ||
      typeof schemaObj !== "object" ||
      Array.isArray(schemaObj)
    ) {
      return [];
    }

    const fields = [];

    // Iterate over top-level keys (field names)
    for (const fieldName in schemaObj) {
      const fieldSchema = schemaObj[fieldName];
      if (!fieldSchema || typeof fieldSchema !== "object") continue;

      const options = [];
      let optionOrder = 0;

      // Iterate over nested keys (option names)
      for (const optionName in fieldSchema) {
        const optionSchema = fieldSchema[optionName];
        if (!optionSchema || typeof optionSchema !== "object") continue;

        // Determine option type from schema
        let optionType = "text";
        if (optionSchema.type === "integer" || optionSchema.type === "float") {
          if (
            optionSchema.range &&
            optionSchema.range[0] !== null &&
            optionSchema.range[1] !== null
          ) {
            optionType = "rating";
          } else {
            optionType = "number_input";
          }
        } else if (optionSchema.type === "string") {
          if (optionSchema.enum) {
            optionType = "single_choice";
          } else {
            optionType = optionSchema.max_length ? "notes" : "text";
          }
        } else if (optionSchema.type === "array") {
          if (optionSchema.items === "string" && optionSchema.enum) {
            optionType = "multiple_choice";
          } else {
            optionType = "multiple_choice";
          }
        } else if (optionSchema.type === "boolean") {
          optionType = "yes_no";
        }

        // Build option object
        const option = {
          id: `${fieldName}_${optionName}`,
          option_name: optionName,
          display_label:
            optionSchema.labels?.[optionName] ||
            optionName
              .split("_")
              .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
              .join(" "),
          option_type: optionType,
          option_order: optionOrder++,
          optional: optionSchema.optional || false,
        };

        // Add type-specific properties
        if (optionType === "rating" || optionType === "number_input") {
          option.min_value = optionSchema.range?.[0] ?? 0;
          option.max_value = optionSchema.range?.[1] ?? 10;
          option.labels = optionSchema.labels || {};
        }

        if (
          optionType === "single_choice" ||
          optionType === "multiple_choice"
        ) {
          option.choices = optionSchema.enum || [];
          option.choice_labels = optionSchema.labels || {};
        }

        if (optionType === "text" || optionType === "notes") {
          option.max_length = optionSchema.max_length;
          option.placeholder = optionSchema.placeholder;
        }

        options.push(option);
      }

      if (options.length > 0) {
        fields.push({
          id: `${groupName}_${fieldName}`,
          field_name: fieldName,
          display_label: fieldName
            .split("_")
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
            .join(" "),
          field_group: groupName,
          options: options,
        });
      }
    }

    return fields;
  };

  const loadFormSchema = async () => {
    try {
      setLoading(true);
      const response = await trackerService.getFormSchema(trackerId);

      // Backend returns data merged at top level
      // Handle both 'field-groups' (hyphen) and 'field_groups' (underscore)
      const fieldGroups =
        response["field-groups"] || response.field_groups || {};
      // Initialize form data structure - optimized
      const initialData = {};

      // Helper to process fields (either from array or converted from schema)
      const processFields = (fields) => {
        for (const field of fields) {
          if (!field.options || field.options.length === 0) continue;

          const fieldData = {};
          for (const option of field.options) {
            fieldData[option.option_name] =
              option.option_type === "multiple_choice" ? [] : null;
          }
          initialData[field.field_name] = fieldData;
        }
      };

      // Process all field groups (handle both array and schema formats)
      for (const groupName in fieldGroups) {
        const group = fieldGroups[groupName];
        if (Array.isArray(group)) {
          processFields(group);
        } else if (group && typeof group === "object") {
          // Convert schema to fields format
          const convertedFields = convertSchemaToFields(group, groupName);
          processFields(convertedFields);
        }
      }

      // Calculate unique fields count
      const tempFieldMap = new Map();
      const tempSeenNames = new Set();
      for (const groupName in fieldGroups) {
        const group = fieldGroups[groupName];
        let fieldsToProcess = [];

        if (Array.isArray(group)) {
          fieldsToProcess = group;
        } else if (group && typeof group === "object") {
          fieldsToProcess = convertSchemaToFields(group, groupName);
        }

        for (const field of fieldsToProcess) {
          if (field) {
            const key = field.field_name || field.id;
            if (key && !tempSeenNames.has(key)) {
              tempSeenNames.add(key);
              tempFieldMap.set(key, field);
            }
          }
        }
      }

      setFormSchema({
        ...response,
        fieldGroups: fieldGroups,
      });
      setLoading(false);
    } catch (error) {
      console.error("Error loading form schema:", error);
      console.error("Error details:", {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        message: error.message,
      });

      // Don't show alert immediately - let the error state UI handle it
      // This prevents blocking the UI
      setLoading(false);

      // Only show alert for network errors, not for 500s (backend issues)
      if (!error.response || error.response.status !== 500) {
        const errorMessage =
          error.response?.data?.error ||
          error.message ||
          "Failed to load form. Please try again.";
        Alert.alert("Error Loading Form", errorMessage, [
          {
            text: "Retry",
            onPress: () => loadFormSchema(),
          },
          {
            text: "Go Back",
            style: "cancel",
            onPress: () => navigation.goBack(),
          },
        ]);
      }
    }
  };

  // Build Zod schema and initialize react-hook-form
  // Rule A: Memoize schema creation strictly - only rebuild when formSchema changes
  const zodSchema = useMemo(() => {
    if (!formSchema) return null;
    return buildZodSchema(formSchema);
  }, [formSchema]); // Only depends on formSchema, not any other state

  // Build default values for the form
  const defaultValues = useMemo(() => {
    if (!formSchema?.fieldGroups) return {};

    const defaults = {};
    for (const groupName in formSchema.fieldGroups) {
      const group = formSchema.fieldGroups[groupName];
      let fieldsToProcess = [];

      if (Array.isArray(group)) {
        fieldsToProcess = group;
      } else if (group && typeof group === "object") {
        fieldsToProcess = convertSchemaToFields(group, groupName);
      }

      for (const field of fieldsToProcess) {
        if (!field.options || field.options.length === 0) continue;

        const fieldDefaults = {};
        for (const option of field.options) {
          if (option.option_type === "multiple_choice") {
            fieldDefaults[option.option_name] = [];
          } else if (option.option_type === "yes_no") {
            fieldDefaults[option.option_name] = false;
          } else {
            fieldDefaults[option.option_name] = null;
          }
        }
        defaults[field.field_name] = fieldDefaults;
      }
    }
    return defaults;
  }, [formSchema]);

  // Initialize react-hook-form
  // Use "onBlur" mode to reduce re-renders during typing/dragging
  const {
    control,
    handleSubmit: rhfHandleSubmit,
    formState: { errors },
  } = useForm({
    resolver: zodSchema ? zodResolver(zodSchema) : undefined,
    defaultValues,
    mode: "onBlur", // Changed from "onChange" to reduce re-renders
    reValidateMode: "onBlur",
  });

  const onSubmit = async (data) => {
    try {
      setSubmitting(true);

      // Format data for backend (same structure as before)
      const formattedData = {};
      Object.keys(data).forEach((fieldName) => {
        const fieldData = data[fieldName];
        if (!fieldData || typeof fieldData !== "object") return;

        Object.keys(fieldData).forEach((optionName) => {
          const value = fieldData[optionName];
          if (value !== null && value !== undefined && value !== "") {
            if (!formattedData[fieldName]) {
              formattedData[fieldName] = {};
            }
            formattedData[fieldName][optionName] = value;
          }
        });
      });

      const payload = {
        data: formattedData,
      };

      if (selectedDate) {
        payload.entry_date = selectedDate;
      }

      await dataTrackingService.saveData(
        trackerId,
        payload.data,
        payload.entry_date
      );

      Alert.alert("Success", "Symptoms logged successfully!", [
        {
          text: "OK",
          onPress: () => navigation.goBack(),
        },
      ]);
    } catch (error) {
      console.error("Error submitting form:", error);
      Alert.alert(
        "Error",
        error.response?.data?.error ||
          "Failed to save symptoms. Please try again."
      );
    } finally {
      setSubmitting(false);
    }
  };

  // Memoize the unique fields list to prevent recalculation on every render
  const uniqueFields = useMemo(() => {
    if (!formSchema?.fieldGroups) return [];

    const fieldMap = new Map();
    const seenFieldNames = new Set();

    for (const groupName in formSchema.fieldGroups) {
      const group = formSchema.fieldGroups[groupName];
      let fieldsToProcess = [];

      if (Array.isArray(group)) {
        fieldsToProcess = group;
      } else if (group && typeof group === "object") {
        fieldsToProcess = convertSchemaToFields(group, groupName);
      }

      for (const field of fieldsToProcess) {
        if (field) {
          const key = field.field_name || field.id;
          if (key && !seenFieldNames.has(key)) {
            seenFieldNames.add(key);
            fieldMap.set(key, field);
          }
        }
      }
    }

    return Array.from(fieldMap.values());
  }, [formSchema]);

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading form...</Text>
      </View>
    );
  }

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
          <Text style={styles.errorSubtext}>
            The server encountered an error. Please try again.
          </Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => loadFormSchema()}
          >
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.backButtonStyle}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.backButtonTextStyle}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color={colors.textOnPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Log Symptoms</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        // ✅ iOS FIX: Disable scroll when slider is being touched
        scrollEnabled={true}
        // ✅ iOS FIX: Keyboard handling
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        // ✅ iOS FIX: Reduce over-scroll to prevent gesture conflicts
        bounces={true}
        bouncesZoom={false}
        // ✅ iOS FIX: Indicator configuration
        showsVerticalScrollIndicator={true}
        showsHorizontalScrollIndicator={false}
        // ✅ iOS FIX: Content inset for iOS safe areas
        {...(Platform.OS === "ios" && {
          automaticallyAdjustContentInsets: false,
          contentInsetAdjustmentBehavior: "automatic",
        })}
      >
        {uniqueFields.map((field) => (
          <FormField
            key={field.id || field.field_name}
            field={field}
            control={control}
          />
        ))}

        <TouchableOpacity
          style={[
            styles.submitButton,
            submitting && styles.submitButtonDisabled,
          ]}
          onPress={rhfHandleSubmit(onSubmit)}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator size="small" color={colors.textOnPrimary} />
          ) : (
            <Text style={styles.submitButtonText}>Submit</Text>
          )}
        </TouchableOpacity>
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
    backgroundColor: colors.primary,
    borderBottomWidth: 1,
    borderBottomColor: colors.primaryDark,
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: colors.textOnPrimary,
  },
  placeholder: {
    width: 32,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
  },
  fieldContainer: {
    backgroundColor: colors.secondary,
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  fieldLabel: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.textOnSecondary,
    marginBottom: 12,
  },
  optionContainer: {
    marginBottom: 16,
  },
  optionLabel: {
    fontSize: 14,
    fontWeight: "500",
    color: colors.textOnSecondary,
    marginBottom: 8,
  },
  choiceButtons: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
  },
  choiceButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: 8,
    marginBottom: 8,
    flexShrink: 0,
  },
  choiceButtonSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  choiceButtonText: {
    fontSize: 14,
    color: colors.text,
  },
  choiceButtonTextSelected: {
    color: colors.textOnPrimary,
    fontWeight: "600",
  },
  numberInput: {
    backgroundColor: colors.background,
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
    fontSize: 16,
    color: colors.text,
  },
  textInput: {
    backgroundColor: colors.background,
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
    fontSize: 16,
    color: colors.text,
    minHeight: 40,
    textAlignVertical: "top",
  },
  emptyChoicesText: {
    fontSize: 14,
    color: colors.textSecondary,
    fontStyle: "italic",
    marginTop: 8,
  },
  sliderContainer: {
    marginTop: 8,
  },
  sliderValueDisplay: {
    fontSize: 24,
    fontWeight: "600",
    color: colors.primary,
    textAlign: "center",
    marginBottom: 12,
  },
  slider: {
    width: "100%",
    height: 40,
  },
  sliderLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 8,
  },
  sliderLabel: {
    fontSize: 12,
    color: colors.textOnSecondary,
    fontWeight: "500",
  },
  submitButton: {
    backgroundColor: colors.primary,
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 20,
    marginBottom: 40,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: colors.textOnPrimary,
    fontSize: 16,
    fontWeight: "600",
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
    marginBottom: 8,
    textAlign: "center",
  },
  errorSubtext: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 24,
    textAlign: "center",
    paddingHorizontal: 40,
  },
  retryButton: {
    backgroundColor: colors.primary,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    marginBottom: 12,
    minWidth: 120,
  },
  retryButtonText: {
    color: colors.textOnPrimary,
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
  },
  backButtonStyle: {
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  backButtonTextStyle: {
    color: colors.textSecondary,
    fontSize: 16,
    textAlign: "center",
  },
});
