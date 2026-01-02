import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { colors } from "../../constants/colors";
import { useAuth } from "../../context/AuthContext";
import Button from "../../components/Button";

export default function GenderScreen({ navigation }) {
  const { submitGender } = useAuth();
  const [selectedGender, setSelectedGender] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const genderOptions = [
    { value: "male", label: "Male" },
    { value: "female", label: "Female" },
    { value: "other", label: "Other" },
  ];

  const handleSubmit = async () => {
    if (!selectedGender) {
      setError("Please select your biological sex");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const result = await submitGender(selectedGender);
      if (result.success) {
        // Navigate to UserInfoScreen after successful gender submission
        navigation.navigate("UserInfo");
      } else {
        setError(result.error || "Failed to save gender information");
      }
    } catch (err) {
      setError("An error occurred. Please try again.");
      console.error("Gender submission error:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>What is your biological sex?</Text>
        <Text style={styles.subtitle}>
          This information helps us provide personalized health tracking
          features.
        </Text>

        <View style={styles.optionsContainer}>
          {genderOptions.map((option) => (
            <TouchableOpacity
              key={option.value}
              style={[
                styles.optionButton,
                selectedGender === option.value && styles.optionButtonSelected,
              ]}
              onPress={() => {
                setSelectedGender(option.value);
                setError("");
              }}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.optionText,
                  selectedGender === option.value && styles.optionTextSelected,
                ]}
              >
                {option.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <Button
          title="Continue"
          onPress={handleSubmit}
          loading={loading}
          disabled={!selectedGender || loading}
          style={styles.submitButton}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: 20,
  },
  content: {
    flex: 1,
    justifyContent: "center",
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
  optionsContainer: {
    marginBottom: 24,
  },
  optionButton: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 18,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: "center",
  },
  optionButtonSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  optionText: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.text,
  },
  optionTextSelected: {
    color: colors.textOnPrimary,
  },
  errorText: {
    fontSize: 14,
    color: colors.error,
    marginBottom: 16,
    textAlign: "center",
  },
  submitButton: {
    marginTop: 8,
  },
});
