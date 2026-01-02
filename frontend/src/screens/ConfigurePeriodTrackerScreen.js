import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { trackerService } from "../services/trackerService";
import { colors } from "../constants/colors";

export default function ConfigurePeriodTrackerScreen({ route, navigation }) {
  const { trackerId } = route.params || {};
  const [loading, setLoading] = useState(false);

  // Debug: Log trackerId
  useEffect(() => {
    console.log("ConfigurePeriodTrackerScreen mounted with trackerId:", trackerId);
    if (!trackerId) {
      Alert.alert("Error", "Tracker ID is missing. Please go back and try again.");
    }
  }, [trackerId]);
  
  // Form state
  const [averageCycleLength, setAverageCycleLength] = useState("28");
  const [averagePeriodLength, setAveragePeriodLength] = useState("5");
  const [lastPeriodDate, setLastPeriodDate] = useState("");
  const [showDatePicker, setShowDatePicker] = useState(false);

  // Generate date picker values (last 120 days)
  const generateDateValues = () => {
    const today = new Date();
    const dates = [];
    for (let i = 0; i < 120; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      dates.push({
        label: date.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        }),
        value: date.toISOString().split("T")[0],
      });
    }
    return dates;
  };

  const dateOptions = generateDateValues();

  const handleSubmit = async () => {
    // Validation
    if (!trackerId) {
      Alert.alert("Error", "Tracker ID is missing. Please go back and try again.");
      return;
    }

    if (!averageCycleLength || !averagePeriodLength || !lastPeriodDate) {
      Alert.alert("Missing Information", "Please fill in all fields");
      return;
    }

    const cycleLength = parseInt(averageCycleLength, 10);
    const periodLength = parseInt(averagePeriodLength, 10);

    if (isNaN(cycleLength) || cycleLength < 21 || cycleLength > 45) {
      Alert.alert(
        "Invalid Cycle Length",
        "Average cycle length should be between 21 and 45 days"
      );
      return;
    }

    if (isNaN(periodLength) || periodLength < 2 || periodLength > 10) {
      Alert.alert(
        "Invalid Period Length",
        "Average period length should be between 2 and 10 days"
      );
      return;
    }

    if (!lastPeriodDate || !lastPeriodDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
      Alert.alert(
        "Invalid Date",
        "Please select a valid last period start date"
      );
      return;
    }

    try {
      setLoading(true);
      const settings = {
        average_cycle_length: cycleLength,  // Ensure it's an integer
        average_period_length: periodLength, // Ensure it's an integer
        last_period_start_date: lastPeriodDate, // String in ISO format
      };

      console.log("Submitting settings:", settings);
      console.log("Settings types:", {
        average_cycle_length: typeof settings.average_cycle_length,
        average_period_length: typeof settings.average_period_length,
        last_period_start_date: typeof settings.last_period_start_date,
      });
      
      const response = await trackerService.updateTrackerSettings(trackerId, settings);
      console.log("Settings update response:", response);
      console.log("Response data:", JSON.stringify(response, null, 2));

      // Navigate back immediately on success
      navigation.goBack();
      
      // Show success message after a brief delay to allow navigation
      setTimeout(() => {
        Alert.alert("Success", "Period Tracker configured successfully!");
      }, 300);
    } catch (error) {
      console.error("Error configuring tracker:", error);
      console.error("Error details:", {
        status: error.response?.status,
        data: error.response?.data,
        message: error.message,
        request: {
          url: error.config?.url,
          method: error.config?.method,
          data: error.config?.data,
        },
      });
      
      let errorMessage = "Failed to configure tracker. Please try again.";
      
      if (error.response?.data) {
        // Check for validation errors
        if (error.response.data.error) {
          errorMessage = error.response.data.error;
        } else if (error.response.data.message) {
          errorMessage = error.response.data.message;
        } else if (typeof error.response.data === 'object') {
          // Validation errors might be in the data object
          const validationErrors = Object.values(error.response.data).flat();
          if (validationErrors.length > 0) {
            errorMessage = `Validation failed: ${validationErrors.join(', ')}`;
          }
        }
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      Alert.alert("Error", errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color={colors.textOnPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Configure Period Tracker</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <View style={styles.infoBox}>
          <Ionicons name="information-circle" size={24} color={colors.primary} />
          <Text style={styles.infoText}>
            Help us personalize your period tracking by providing some basic information about your cycle.
          </Text>
        </View>

        <View style={styles.form}>
          {/* Average Cycle Length */}
          <View style={styles.fieldContainer}>
            <Text style={styles.fieldLabel}>Average Cycle Length (days)</Text>
            <Text style={styles.fieldHint}>
              How many days between the start of one period and the start of the next? (Typically 21-35 days)
            </Text>
            <TextInput
              style={styles.numberInput}
              keyboardType="numeric"
              placeholder="28"
              value={averageCycleLength}
              onChangeText={setAverageCycleLength}
            />
          </View>

          {/* Average Period Length */}
          <View style={styles.fieldContainer}>
            <Text style={styles.fieldLabel}>Average Period Length (days)</Text>
            <Text style={styles.fieldHint}>
              How many days does your period usually last? (Typically 3-7 days)
            </Text>
            <TextInput
              style={styles.numberInput}
              keyboardType="numeric"
              placeholder="5"
              value={averagePeriodLength}
              onChangeText={setAveragePeriodLength}
            />
          </View>

          {/* Last Period Start Date */}
          <View style={styles.fieldContainer}>
            <Text style={styles.fieldLabel}>Last Period Start Date</Text>
            <Text style={styles.fieldHint}>
              When did your last period start?
            </Text>
            
            {!showDatePicker ? (
              <TouchableOpacity
                style={styles.dateButton}
                onPress={() => setShowDatePicker(true)}
              >
                <Text style={styles.dateButtonText}>
                  {lastPeriodDate
                    ? new Date(lastPeriodDate).toLocaleDateString("en-US", {
                        month: "long",
                        day: "numeric",
                        year: "numeric",
                      })
                    : "Select date"}
                </Text>
                <Ionicons name="calendar-outline" size={20} color={colors.primary} />
              </TouchableOpacity>
            ) : (
              <View style={styles.datePickerContainer}>
                <ScrollView style={styles.datePicker} nestedScrollEnabled>
                  {dateOptions.map((date) => (
                    <TouchableOpacity
                      key={date.value}
                      style={[
                        styles.dateOption,
                        lastPeriodDate === date.value && styles.dateOptionSelected,
                      ]}
                      onPress={() => {
                        setLastPeriodDate(date.value);
                        setShowDatePicker(false);
                      }}
                    >
                      <Text
                        style={[
                          styles.dateOptionText,
                          lastPeriodDate === date.value && styles.dateOptionTextSelected,
                        ]}
                      >
                        {date.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                <TouchableOpacity
                  style={styles.cancelDateButton}
                  onPress={() => setShowDatePicker(false)}
                >
                  <Text style={styles.cancelDateButtonText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>

        <TouchableOpacity
          style={[styles.submitButton, loading && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={loading}
        >
          <Text style={styles.submitButtonText}>
            {loading ? "Configuring..." : "Start Tracking"}
          </Text>
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
  infoBox: {
    flexDirection: "row",
    backgroundColor: colors.secondary,
    padding: 16,
    borderRadius: 12,
    marginBottom: 24,
    alignItems: "flex-start",
  },
  infoText: {
    flex: 1,
    marginLeft: 12,
    fontSize: 14,
    color: colors.textOnSecondary,
    lineHeight: 20,
  },
  form: {
    marginBottom: 20,
  },
  fieldContainer: {
    marginBottom: 24,
  },
  fieldLabel: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.text,
    marginBottom: 8,
  },
  fieldHint: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 12,
    lineHeight: 20,
  },
  numberInput: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    fontSize: 16,
    color: colors.text,
  },
  dateButton: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dateButtonText: {
    fontSize: 16,
    color: colors.text,
  },
  datePickerContainer: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    maxHeight: 300,
  },
  datePicker: {
    maxHeight: 250,
  },
  dateOption: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  dateOptionSelected: {
    backgroundColor: colors.primary,
  },
  dateOptionText: {
    fontSize: 16,
    color: colors.text,
  },
  dateOptionTextSelected: {
    color: colors.textOnPrimary,
    fontWeight: "600",
  },
  cancelDateButton: {
    padding: 12,
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  cancelDateButtonText: {
    fontSize: 16,
    color: colors.primary,
    fontWeight: "600",
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
});

