import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
} from "react-native";
import { colors } from "../../constants/colors";
import { useAuth } from "../../context/AuthContext";
import Button from "../../components/Button";
import PickerModal from "../../components/PickerModal";
import { useHealthPickers } from "../../hooks/useHealthPickers";
import {
  formatDateForDisplay,
  formatHeightForDisplay,
  formatWeightForDisplay,
} from "../../utils/pickerHelpers";

export default function UserInfoScreen({ navigation }) {
  const { submitUserInfo, user } = useAuth();
  const [unitSystem, setUnitSystem] = useState(user?.unit_system || "metric");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [height, setHeight] = useState("");
  const [weight, setWeight] = useState("");
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});

  // Use custom health pickers hook
  const {
    showDatePicker,
    setShowDatePicker,
    selectedDate,
    getDatePickerColumns,
    handleDateSelect,
    showHeightPicker,
    setShowHeightPicker,
    selectedHeight,
    getHeightPickerColumns,
    handleHeightSelect,
    showWeightPicker,
    setShowWeightPicker,
    selectedWeight,
    getWeightPickerColumns,
    handleWeightSelect,
  } = useHealthPickers(unitSystem);

  const handleSkip = () => {
    // Navigate to Home screen, skipping user info
    navigation.navigate("Home");
  };

  const validateAndSubmit = async () => {
    const newErrors = {};

    // Validate date of birth (only if provided)
    if (dateOfBirth.trim()) {
      // Validate date format (YYYY-MM-DD)
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(dateOfBirth)) {
        newErrors.dateOfBirth =
          "Please use format YYYY-MM-DD (e.g., 1990-11-11)";
      } else {
        const date = new Date(dateOfBirth);
        if (isNaN(date.getTime())) {
          newErrors.dateOfBirth = "Invalid date";
        } else if (date > new Date()) {
          newErrors.dateOfBirth = "Date cannot be in the future";
        }
      }
    }

    // Validate height (only if provided)
    if (height.trim()) {
      const heightNum = parseFloat(height);
      if (isNaN(heightNum) || heightNum <= 0) {
        newErrors.height = "Please enter a valid height";
      } else if (unitSystem === "metric" && heightNum > 300) {
        newErrors.height = "Height cannot exceed 300 cm";
      } else if (unitSystem === "imperial" && heightNum > 120) {
        newErrors.height = "Height cannot exceed 120 inches";
      }
    }

    // Validate weight (only if provided)
    if (weight.trim()) {
      const weightNum = parseFloat(weight);
      if (isNaN(weightNum) || weightNum <= 0) {
        newErrors.weight = "Please enter a valid weight";
      } else if (unitSystem === "metric" && weightNum > 500) {
        newErrors.weight = "Weight cannot exceed 500 kg";
      } else if (unitSystem === "imperial" && weightNum > 1100) {
        newErrors.weight = "Weight cannot exceed 1100 lbs";
      }
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    // If no fields are filled, just skip
    if (!dateOfBirth.trim() && !height.trim() && !weight.trim()) {
      handleSkip();
      return;
    }

    setLoading(true);
    setErrors({});

    try {
      const userInfoData = {
        unit_system: unitSystem,
      };

      // Only include fields that have values
      if (dateOfBirth.trim()) {
        userInfoData.date_of_birth = dateOfBirth.trim();
      }
      if (height.trim()) {
        userInfoData.height = parseFloat(height);
      }
      if (weight.trim()) {
        userInfoData.weight = parseFloat(weight);
      }

      const result = await submitUserInfo(userInfoData);

      if (result.success) {
        // Navigate to Home after successful submission
        navigation.navigate("Home");
      } else {
        setErrors({ submit: result.error || "Failed to save information" });
      }
    } catch (err) {
      setErrors({ submit: "An error occurred. Please try again." });
      console.error("User info submission error:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
    >
      <View style={styles.content}>
        <Text style={styles.title}>Tell us about yourself</Text>
        <Text style={styles.subtitle}>
          This information helps us provide personalized health insights.
          {"\n"}All fields are optional.
        </Text>

        {/* Unit System Selector */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Unit System</Text>
          <View style={styles.unitSelector}>
            <TouchableOpacity
              style={[
                styles.unitButton,
                unitSystem === "metric" && styles.unitButtonSelected,
              ]}
              onPress={() => {
                setUnitSystem("metric");
                // Clear height and weight when switching units
                setHeight("");
                setWeight("");
                setErrors({});
              }}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.unitText,
                  unitSystem === "metric" && styles.unitTextSelected,
                ]}
              >
                Metric
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.unitButton,
                unitSystem === "imperial" && styles.unitButtonSelected,
              ]}
              onPress={() => {
                setUnitSystem("imperial");
                // Clear height and weight when switching units
                setHeight("");
                setWeight("");
                setErrors({});
              }}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.unitText,
                  unitSystem === "imperial" && styles.unitTextSelected,
                ]}
              >
                Imperial
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Date of Birth */}
        <View style={styles.dateContainer}>
          <Text style={styles.label}>Date of Birth</Text>
          <TouchableOpacity
            style={[
              styles.dateInput,
              errors.dateOfBirth && styles.dateInputError,
            ]}
            onPress={() => setShowDatePicker(true)}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.dateInputText,
                !dateOfBirth && styles.dateInputPlaceholder,
              ]}
            >
              {dateOfBirth
                ? formatDateForDisplay(dateOfBirth)
                : "Select your date of birth"}
            </Text>
          </TouchableOpacity>
          {errors.dateOfBirth && (
            <Text style={styles.errorText}>{errors.dateOfBirth}</Text>
          )}
        </View>

        {/* Date Picker Modal */}
        <PickerModal
          visible={showDatePicker}
          title="Select Date of Birth"
          onClose={() => setShowDatePicker(false)}
          onSelect={() =>
            handleDateSelect(setDateOfBirth, () =>
              setErrors({ ...errors, dateOfBirth: "" })
            )
          }
          columns={getDatePickerColumns()}
          selectedValue={selectedDate}
        />

        {/* Height */}
        <View style={styles.dateContainer}>
          <Text style={styles.label}>
            Height {unitSystem === "metric" ? "(cm)" : "(ft'in\")"}
          </Text>
          <TouchableOpacity
            style={[styles.dateInput, errors.height && styles.dateInputError]}
            onPress={() => setShowHeightPicker(true)}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.dateInputText,
                !height && styles.dateInputPlaceholder,
              ]}
            >
              {height
                ? formatHeightForDisplay(height, unitSystem)
                : `Select your height`}
            </Text>
          </TouchableOpacity>
          {errors.height && (
            <Text style={styles.errorText}>{errors.height}</Text>
          )}
        </View>

        {/* Height Picker Modal */}
        <PickerModal
          visible={showHeightPicker}
          title={`Select Height (${
            unitSystem === "metric" ? "cm" : "ft'in\""
          })`}
          onClose={() => setShowHeightPicker(false)}
          onSelect={() =>
            handleHeightSelect(unitSystem, setHeight, () =>
              setErrors({ ...errors, height: "" })
            )
          }
          columns={getHeightPickerColumns(unitSystem)}
          selectedValue={selectedHeight}
        />

        {/* Weight */}
        <View style={styles.dateContainer}>
          <Text style={styles.label}>
            Weight {unitSystem === "metric" ? "(kg)" : "(lbs)"}
          </Text>
          <TouchableOpacity
            style={[styles.dateInput, errors.weight && styles.dateInputError]}
            onPress={() => setShowWeightPicker(true)}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.dateInputText,
                !weight && styles.dateInputPlaceholder,
              ]}
            >
              {weight
                ? formatWeightForDisplay(weight, unitSystem)
                : `Select your weight`}
            </Text>
          </TouchableOpacity>
          {errors.weight && (
            <Text style={styles.errorText}>{errors.weight}</Text>
          )}
        </View>

        {/* Weight Picker Modal */}
        <PickerModal
          visible={showWeightPicker}
          title={`Select Weight (${unitSystem === "metric" ? "kg" : "lbs"})`}
          onClose={() => setShowWeightPicker(false)}
          onSelect={() =>
            handleWeightSelect(unitSystem, setWeight, () =>
              setErrors({ ...errors, weight: "" })
            )
          }
          columns={getWeightPickerColumns(unitSystem)}
          selectedValue={selectedWeight}
        />

        {errors.submit ? (
          <Text style={styles.errorText}>{errors.submit}</Text>
        ) : null}

        <View style={styles.buttonContainer}>
          <Button
            title="Continue"
            onPress={validateAndSubmit}
            loading={loading}
            disabled={loading}
            style={styles.submitButton}
          />
          <Button
            title="Skip"
            onPress={handleSkip}
            variant="outline"
            disabled={loading}
            style={styles.skipButton}
          />
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  contentContainer: {
    flexGrow: 1,
    justifyContent: "center",
    padding: 20,
    paddingBottom: 40,
  },
  content: {
    maxWidth: 400,
    alignSelf: "center",
    width: "100%",
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: colors.text,
    marginBottom: 12,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 16,
    color: colors.textSecondary,
    marginBottom: 32,
    textAlign: "center",
    lineHeight: 22,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.text,
    marginBottom: 12,
  },
  unitSelector: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  unitButton: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: "center",
    marginHorizontal: 6,
  },
  unitButtonSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  unitText: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.text,
  },
  unitTextSelected: {
    color: colors.textOnPrimary,
  },
  errorText: {
    fontSize: 14,
    color: colors.error,
    marginBottom: 16,
    textAlign: "center",
  },
  buttonContainer: {
    marginTop: 8,
  },
  submitButton: {
    marginBottom: 12,
  },
  skipButton: {
    marginTop: 0,
  },
  dateContainer: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.text,
    marginBottom: 8,
  },
  dateInput: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 50,
    justifyContent: "center",
  },
  dateInputError: {
    borderColor: colors.error,
  },
  dateInputText: {
    fontSize: 16,
    color: colors.text,
  },
  dateInputPlaceholder: {
    color: colors.textLight,
  },
});
