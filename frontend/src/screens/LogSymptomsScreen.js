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

  const loadFormSchema = async () => {
    try {
      setLoading(true);
      const response = await trackerService.getFormSchema(trackerId);
      const fieldGroups = response.field_groups || {};
      const initialData = {};

      for (const groupName in fieldGroups) {
        const group = fieldGroups[groupName];
        if (!Array.isArray(group)) continue;

        for (const field of group) {
          if (!field.options || field.options.length === 0) continue;

          const fieldData = {};
          for (const option of field.options) {
            fieldData[option.option_name] =
              option.option_type === "multiple_choice" ? [] : null;
          }
          initialData[field.field_name] = fieldData;
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

  const zodSchema = useMemo(() => {
    if (!formSchema) return null;
    return buildZodSchema(formSchema);
  }, [formSchema]);

  const defaultValues = useMemo(() => {
    if (!formSchema?.fieldGroups) return {};

    const defaults = {};
    for (const groupName in formSchema.fieldGroups) {
      const group = formSchema.fieldGroups[groupName];
      if (!Array.isArray(group)) continue;

      for (const field of group) {
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

  const {
    control,
    handleSubmit: rhfHandleSubmit,
    formState: { errors },
  } = useForm({
    resolver: zodSchema ? zodResolver(zodSchema) : undefined,
    defaultValues,
    mode: "onBlur",
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

  const uniqueFields = useMemo(() => {
    if (!formSchema?.fieldGroups) return [];

    const fieldMap = new Map();
    const seenFieldNames = new Set();

    for (const groupName in formSchema.fieldGroups) {
      const group = formSchema.fieldGroups[groupName];

      if (!Array.isArray(group)) {
        console.warn(`Field group '${groupName}' is not an array`);
        continue;
      }

      for (const field of group) {
        if (field) {
          const key = field.id || field.field_name;
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
        scrollEnabled={true}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        bounces={true}
        bouncesZoom={false}
        showsVerticalScrollIndicator={true}
        showsHorizontalScrollIndicator={false}
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
    backgroundColor: colors.surface,
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
