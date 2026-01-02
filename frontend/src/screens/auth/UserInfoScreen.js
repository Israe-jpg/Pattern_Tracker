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
import Input from "../../components/Input";

export default function UserInfoScreen({ navigation }) {
  const { submitUserInfo, user } = useAuth();
  const [unitSystem, setUnitSystem] = useState(user?.unit_system || "metric");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [height, setHeight] = useState("");
  const [weight, setWeight] = useState("");
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});

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

  const formatDateInput = (text) => {
    // Remove non-numeric characters
    const numbers = text.replace(/\D/g, "");

    // Format as YYYY-MM-DD
    let formatted = numbers;
    if (numbers.length > 4) {
      formatted = numbers.slice(0, 4) + "-" + numbers.slice(4);
    }
    if (numbers.length > 6) {
      formatted =
        numbers.slice(0, 4) +
        "-" +
        numbers.slice(4, 6) +
        "-" +
        numbers.slice(6, 8);
    }

    return formatted;
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
        <Input
          label="Date of Birth"
          placeholder="YYYY-MM-DD (e.g., 1990-11-11)"
          value={dateOfBirth}
          onChangeText={(text) => {
            setDateOfBirth(formatDateInput(text));
            if (errors.dateOfBirth) {
              setErrors({ ...errors, dateOfBirth: "" });
            }
          }}
          keyboardType="numeric"
          maxLength={10}
          error={errors.dateOfBirth}
        />

        {/* Height */}
        <Input
          label={`Height ${unitSystem === "metric" ? "(cm)" : "(inches)"}`}
          placeholder={
            unitSystem === "metric"
              ? "Enter height in centimeters"
              : "Enter height in inches"
          }
          value={height}
          onChangeText={(text) => {
            // Allow only numbers and one decimal point
            const cleaned = text.replace(/[^0-9.]/g, "");
            // Ensure only one decimal point
            const parts = cleaned.split(".");
            const formatted =
              parts.length > 2
                ? parts[0] + "." + parts.slice(1).join("")
                : cleaned;
            setHeight(formatted);
            if (errors.height) {
              setErrors({ ...errors, height: "" });
            }
          }}
          keyboardType="decimal-pad"
          error={errors.height}
        />

        {/* Weight */}
        <Input
          label={`Weight ${unitSystem === "metric" ? "(kg)" : "(lbs)"}`}
          placeholder={
            unitSystem === "metric"
              ? "Enter weight in kilograms"
              : "Enter weight in pounds"
          }
          value={weight}
          onChangeText={(text) => {
            // Allow only numbers and one decimal point
            const cleaned = text.replace(/[^0-9.]/g, "");
            // Ensure only one decimal point
            const parts = cleaned.split(".");
            const formatted =
              parts.length > 2
                ? parts[0] + "." + parts.slice(1).join("")
                : cleaned;
            setWeight(formatted);
            if (errors.weight) {
              setErrors({ ...errors, weight: "" });
            }
          }}
          keyboardType="decimal-pad"
          error={errors.weight}
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
    gap: 12,
  },
  unitButton: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: "center",
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
});
