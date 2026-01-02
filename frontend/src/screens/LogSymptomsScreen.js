import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  Alert,
} from "react-native";
import Slider from "@react-native-community/slider";
import { Ionicons } from "@expo/vector-icons";
import { trackerService } from "../services/trackerService";
import { dataTrackingService } from "../services/dataTrackingService";
import { colors } from "../constants/colors";

export default function LogSymptomsScreen({ route, navigation }) {
  const { trackerId, selectedDate } = route.params || {};
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [formSchema, setFormSchema] = useState(null);
  const [formData, setFormData] = useState({});

  useEffect(() => {
    loadFormSchema();
  }, [trackerId]);

  const loadFormSchema = async () => {
    try {
      setLoading(true);
      const startTime = Date.now();
      const response = await trackerService.getFormSchema(trackerId);
      console.log("API call took:", Date.now() - startTime, "ms");
      
      // Backend returns data merged at top level
      // Handle both 'field-groups' (hyphen) and 'field_groups' (underscore)
      const fieldGroups = response["field-groups"] || response.field_groups || {};
      
      const processStartTime = Date.now();
      // Initialize form data structure - optimized
      const initialData = {};
      const allGroups = Object.values(fieldGroups);
      
      for (const group of allGroups) {
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
      
      console.log("Data processing took:", Date.now() - processStartTime, "ms");
      
      // Calculate unique fields count for logging
      const tempFieldMap = new Map();
      const tempSeenNames = new Set();
      for (const group of Object.values(fieldGroups)) {
        if (Array.isArray(group)) {
          for (const field of group) {
            if (field) {
              const key = field.field_name || field.id;
              if (key && !tempSeenNames.has(key)) {
                tempSeenNames.add(key);
                tempFieldMap.set(key, field);
              }
            }
          }
        }
      }
      
      setFormSchema({
        ...response,
        fieldGroups: fieldGroups,
      });
      setFormData(initialData);
      
      console.log("Total load time:", Date.now() - startTime, "ms");
      console.log("Fields loaded:", tempFieldMap.size, "unique fields");
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
        const errorMessage = error.response?.data?.error || error.message || "Failed to load form. Please try again.";
        Alert.alert(
          "Error Loading Form",
          errorMessage,
          [
            {
              text: "Retry",
              onPress: () => loadFormSchema(),
            },
            {
              text: "Go Back",
              style: "cancel",
              onPress: () => navigation.goBack(),
            },
          ]
        );
      }
    }
  };

  const updateFieldValue = (fieldName, optionName, value) => {
    setFormData((prev) => ({
      ...prev,
      [fieldName]: {
        ...prev[fieldName],
        [optionName]: value,
      },
    }));
  };

  const SliderComponent = ({ field, option, minValue, maxValue, currentValue, onValueChange }) => {
    const [localValue, setLocalValue] = useState(currentValue !== null && currentValue !== undefined ? currentValue : minValue);
    const displayValue = currentValue !== null && currentValue !== undefined ? currentValue : minValue;

    // Update local value when currentValue changes externally
    useEffect(() => {
      if (currentValue !== null && currentValue !== undefined) {
        setLocalValue(currentValue);
      }
    }, [currentValue]);

    const handleValueChange = (value) => {
      setLocalValue(value);
      onValueChange(value);
    };

    return (
      <View style={styles.sliderContainer}>
        <Text style={styles.sliderValueDisplay}>{localValue}</Text>
        <Slider
          style={styles.slider}
          minimumValue={minValue}
          maximumValue={maxValue}
          value={localValue}
          onValueChange={handleValueChange}
          step={1}
          minimumTrackTintColor={colors.primary}
          maximumTrackTintColor={colors.background}
          thumbTintColor={colors.primary}
          animateTransitions={true}
        />
        <View style={styles.sliderLabels}>
          <Text style={styles.sliderLabel}>{minValue}</Text>
          <Text style={styles.sliderLabel}>{maxValue}</Text>
        </View>
      </View>
    );
  };

  const handleSubmit = async () => {
    try {
      setSubmitting(true);
      
      // Format data for backend
      const formattedData = {};
      Object.keys(formData).forEach((fieldName) => {
        const fieldData = formData[fieldName];
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

      await dataTrackingService.saveData(trackerId, payload.data, payload.entry_date);
      
      Alert.alert("Success", "Symptoms logged successfully!", [
        {
          text: "OK",
          onPress: () => navigation.goBack(),
        },
      ]);
    } catch (error) {
      console.error("Error submitting form:", error);
      Alert.alert("Error", error.response?.data?.error || "Failed to save symptoms. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const renderOption = (field, option) => {
    const optionLabel = option.display_label || option.option_name;
    const currentValue = formData[field.field_name]?.[option.option_name];

    switch (option.option_type) {
      case "yes_no":
        return (
          <View key={option.id} style={styles.optionContainer}>
            <Text style={styles.optionLabel}>{optionLabel}</Text>
            <View style={styles.choiceButtons}>
              <TouchableOpacity
                style={[
                  styles.choiceButton,
                  currentValue === true && styles.choiceButtonSelected,
                ]}
                onPress={() => updateFieldValue(field.field_name, option.option_name, true)}
              >
                <Text
                  style={[
                    styles.choiceButtonText,
                    currentValue === true && styles.choiceButtonTextSelected,
                  ]}
                >
                  Yes
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.choiceButton,
                  currentValue === false && styles.choiceButtonSelected,
                ]}
                onPress={() => updateFieldValue(field.field_name, option.option_name, false)}
              >
                <Text
                  style={[
                    styles.choiceButtonText,
                    currentValue === false && styles.choiceButtonTextSelected,
                  ]}
                >
                  No
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        );

      case "single_choice":
        return (
          <View key={option.id} style={styles.optionContainer}>
            <Text style={styles.optionLabel}>{optionLabel}</Text>
            <View style={styles.choiceButtons}>
              {option.choices?.map((choice) => {
                const isSelected = currentValue === choice;
                return (
                  <TouchableOpacity
                    key={choice}
                    style={[
                      styles.choiceButton,
                      isSelected && styles.choiceButtonSelected,
                    ]}
                    onPress={() => updateFieldValue(field.field_name, option.option_name, choice)}
                  >
                    <Text
                      style={[
                        styles.choiceButtonText,
                        isSelected && styles.choiceButtonTextSelected,
                      ]}
                    >
                      {option.choice_labels?.[choice] || choice}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        );

      case "multiple_choice":
        const choices = option.choices || [];
        if (choices.length === 0) {
          console.warn(`Multiple choice option "${optionLabel}" has no choices:`, option);
        }
        return (
          <View key={option.id} style={styles.optionContainer}>
            <Text style={styles.optionLabel}>{optionLabel}</Text>
            {choices.length > 0 ? (
              <View style={styles.choiceButtons}>
                {choices.map((choice) => {
                  const selectedChoices = currentValue || [];
                  const isSelected = selectedChoices.includes(choice);
                  return (
                    <TouchableOpacity
                      key={choice}
                      style={[
                        styles.choiceButton,
                        isSelected && styles.choiceButtonSelected,
                      ]}
                      onPress={() => {
                        const newChoices = isSelected
                          ? selectedChoices.filter((c) => c !== choice)
                          : [...selectedChoices, choice];
                        updateFieldValue(field.field_name, option.option_name, newChoices);
                      }}
                    >
                      <Text
                        style={[
                          styles.choiceButtonText,
                          isSelected && styles.choiceButtonTextSelected,
                        ]}
                      >
                        {option.choice_labels?.[choice] || choice}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : (
              <Text style={styles.emptyChoicesText}>
                No choices available for this option
              </Text>
            )}
          </View>
        );

      case "rating":
        return (
          <View key={option.id} style={styles.optionContainer}>
            <Text style={styles.optionLabel}>{optionLabel}</Text>
            <SliderComponent
              field={field}
              option={option}
              minValue={option.min_value || 0}
              maxValue={option.max_value || 10}
              currentValue={currentValue}
              onValueChange={(value) => updateFieldValue(field.field_name, option.option_name, value)}
            />
          </View>
        );

      case "number_input":
        return (
          <View key={option.id} style={styles.optionContainer}>
            <Text style={styles.optionLabel}>{optionLabel}</Text>
            <TextInput
              style={styles.numberInput}
              keyboardType="numeric"
              placeholder={option.placeholder || `Enter ${optionLabel}`}
              value={currentValue?.toString() || ""}
              onChangeText={(text) => {
                const numValue = text ? parseFloat(text) : null;
                updateFieldValue(field.field_name, option.option_name, numValue);
              }}
            />
          </View>
        );

      case "text":
      case "notes":
        return (
          <View key={option.id} style={styles.optionContainer}>
            <Text style={styles.optionLabel}>{optionLabel}</Text>
            <TextInput
              style={styles.textInput}
              multiline={option.option_type === "notes"}
              numberOfLines={option.option_type === "notes" ? 4 : 1}
              placeholder={option.placeholder || `Enter ${optionLabel}`}
              value={currentValue || ""}
              onChangeText={(text) => updateFieldValue(field.field_name, option.option_name, text)}
              maxLength={option.max_length}
            />
          </View>
        );

      default:
        return null;
    }
  };

  const renderField = (field) => {
    if (!field.options || field.options.length === 0) return null;

    return (
      <View key={field.id} style={styles.fieldContainer}>
        {field.display_label && (
          <Text style={styles.fieldLabel}>{field.display_label}</Text>
        )}
        
        {field.options
          .sort((a, b) => (a.option_order || 0) - (b.option_order || 0))
          .map((option) => renderOption(field, option))}
      </View>
    );
  };

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
            <Ionicons name="arrow-back" size={24} color={colors.textOnPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Log Symptoms</Text>
          <View style={styles.placeholder} />
        </View>
        <View style={styles.centerContainer}>
          <Ionicons name="alert-circle-outline" size={64} color={colors.error} />
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

  const fieldGroups = formSchema.fieldGroups || {};
  // Handle both period_tracker (for Period Tracker) and category_specific (for other trackers)
  // Use Map for faster deduplication - key by both id and field_name to catch all duplicates
  const fieldMap = new Map();
  const seenFieldNames = new Set();
  
  const groupsToProcess = [
    fieldGroups.baseline,
    fieldGroups.category_specific,
    fieldGroups.period_tracker,
    fieldGroups.custom,
  ];
  
  for (const group of groupsToProcess) {
    if (Array.isArray(group)) {
      for (const field of group) {
        if (!field) continue;
        
        // Use field_name as primary key (more reliable than id for deduplication)
        const key = field.field_name || field.id;
        if (key && !seenFieldNames.has(key)) {
          seenFieldNames.add(key);
          fieldMap.set(key, field);
        }
      }
    }
  }
  
  const uniqueFields = Array.from(fieldMap.values());

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

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {uniqueFields.map((field) => renderField(field))}
        
        <TouchableOpacity
          style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
          onPress={handleSubmit}
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

