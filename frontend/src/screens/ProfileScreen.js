import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, APP_NAME } from "../constants/colors";
import { useAuth } from "../context/AuthContext";
import Button from "../components/Button";
import PickerModal from "../components/PickerModal";
import { useHealthPickers } from "../hooks/useHealthPickers";
import {
  formatDateForDisplay,
  formatHeightForDisplay,
  formatWeightForDisplay,
} from "../utils/pickerHelpers";

export default function ProfileScreen({ navigation }) {
  const { user, logout, refreshUserProfile, submitUserInfo } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    first_name: "",
    last_name: "",
    username: "",
    email: "",
    date_of_birth: "",
    height: "",
    weight: "",
    unit_system: "metric",
  });
  const [errors, setErrors] = useState({});

  // Use custom health pickers hook
  const {
    showDatePicker,
    setShowDatePicker,
    selectedDate,
    getDatePickerColumns,
    handleDateSelect,
    initializeDate,
    showHeightPicker,
    setShowHeightPicker,
    selectedHeight,
    getHeightPickerColumns,
    handleHeightSelect,
    initializeHeight,
    showWeightPicker,
    setShowWeightPicker,
    selectedWeight,
    getWeightPickerColumns,
    handleWeightSelect,
    initializeWeight,
  } = useHealthPickers(formData.unit_system);

  useEffect(() => {
    if (user) {
      setFormData({
        first_name: user.first_name || "",
        last_name: user.last_name || "",
        username: user.username || "",
        email: user.email || "",
        date_of_birth: user.date_of_birth || "",
        height: user.height
          ? user.unit_system === "imperial"
            ? user.height_imperial
            : user.height_metric
          : "",
        weight: user.weight
          ? user.unit_system === "imperial"
            ? user.weight_imperial
            : user.weight_metric
          : "",
        unit_system: user.unit_system || "metric",
      });
    }
  }, [user]);

  const handleInputChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: null }));
    }
  };

  const validateForm = () => {
    const newErrors = {};

    if (formData.date_of_birth) {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(formData.date_of_birth)) {
        newErrors.date_of_birth = "Use format YYYY-MM-DD";
      }
    }

    if (
      formData.height &&
      (isNaN(parseFloat(formData.height)) || parseFloat(formData.height) <= 0)
    ) {
      newErrors.height = "Invalid height";
    }

    if (
      formData.weight &&
      (isNaN(parseFloat(formData.weight)) || parseFloat(formData.weight) <= 0)
    ) {
      newErrors.weight = "Invalid weight";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validateForm()) {
      return;
    }

    setLoading(true);
    try {
      const userInfoData = {
        unit_system: formData.unit_system,
      };

      // Only include fields that have values
      if (formData.date_of_birth && formData.date_of_birth.trim()) {
        userInfoData.date_of_birth = formData.date_of_birth.trim();
      }
      if (formData.height && formData.height.trim()) {
        userInfoData.height = parseFloat(formData.height);
      }
      if (formData.weight && formData.weight.trim()) {
        userInfoData.weight = parseFloat(formData.weight);
      }

      const result = await submitUserInfo(userInfoData);

      if (result.success) {
        // Refresh profile to get updated data - useEffect will update formData automatically
        await refreshUserProfile();

        setIsEditing(false);
        Alert.alert("Success", "Profile updated successfully");
      } else {
        Alert.alert(
          "Error",
          result.error || "Failed to update profile. Please try again."
        );
      }
    } catch (error) {
      console.error("Error updating profile:", error);
      Alert.alert(
        "Error",
        error.response?.data?.error ||
          "Failed to update profile. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  // Initialize pickers when modal opens
  const handleOpenDatePicker = () => {
    if (formData.date_of_birth) {
      initializeDate(formData.date_of_birth);
    }
    setShowDatePicker(true);
  };

  const handleOpenHeightPicker = () => {
    if (formData.height) {
      initializeHeight(formData.height, formData.unit_system);
    }
    setShowHeightPicker(true);
  };

  const handleOpenWeightPicker = () => {
    if (formData.weight) {
      initializeWeight(formData.weight, formData.unit_system);
    }
    setShowWeightPicker(true);
  };

  const handleLogout = () => {
    Alert.alert("Logout", "Are you sure you want to logout?", [
      {
        text: "Cancel",
        style: "cancel",
      },
      {
        text: "Logout",
        style: "destructive",
        onPress: async () => {
          try {
            await logout();
            navigation.reset({
              index: 0,
              routes: [{ name: "Login" }],
            });
          } catch (error) {
            console.error("Logout error:", error);
            Alert.alert("Error", "Failed to logout. Please try again.");
          }
        },
      },
    ]);
  };

  const renderField = (
    label,
    field,
    placeholder,
    keyboardType = "default",
    editable = true
  ) => (
    <View style={styles.fieldContainer}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {isEditing && editable ? (
        <TextInput
          style={[styles.input, errors[field] && styles.inputError]}
          value={formData[field]}
          onChangeText={(value) => handleInputChange(field, value)}
          placeholder={placeholder}
          placeholderTextColor={colors.textLight}
          editable={!loading}
          keyboardType={keyboardType}
        />
      ) : (
        <Text style={styles.fieldValue}>{formData[field] || "Not set"}</Text>
      )}
      {errors[field] && <Text style={styles.errorText}>{errors[field]}</Text>}
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color={colors.textOnPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Profile</Text>
        {!isEditing ? (
          <TouchableOpacity
            style={styles.editButton}
            onPress={() => setIsEditing(true)}
          >
            <Ionicons name="pencil" size={24} color={colors.textOnPrimary} />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={() => {
              setIsEditing(false);
              setErrors({});
              // Reset form data
              if (user) {
                setFormData({
                  first_name: user.first_name || "",
                  last_name: user.last_name || "",
                  username: user.username || "",
                  email: user.email || "",
                  date_of_birth: user.date_of_birth || "",
                  height: user.height
                    ? user.unit_system === "imperial"
                      ? user.height_imperial
                      : user.height_metric
                    : "",
                  weight: user.weight
                    ? user.unit_system === "imperial"
                      ? user.weight_imperial
                      : user.weight_metric
                    : "",
                  unit_system: user.unit_system || "metric",
                });
              }
            }}
          >
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Profile Header */}
        <View style={styles.profileHeader}>
          <View style={styles.avatarContainer}>
            <Ionicons name="person" size={60} color={colors.primary} />
          </View>
          <Text style={styles.profileName}>
            {user?.first_name && user?.last_name
              ? `${user.first_name} ${user.last_name}`
              : user?.username || user?.email || "User"}
          </Text>
          {user?.email && <Text style={styles.profileEmail}>{user.email}</Text>}
        </View>

        {/* Personal Information */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Personal Information</Text>
          {renderField(
            "First Name",
            "first_name",
            "Enter first name",
            "default",
            false
          )}
          {renderField(
            "Last Name",
            "last_name",
            "Enter last name",
            "default",
            false
          )}
          {renderField(
            "Username",
            "username",
            "Enter username",
            "default",
            true
          )}
          {renderField("Email", "email", "Enter email", "email-address", false)}
          {/* Date of Birth */}
          <View style={styles.fieldContainer}>
            <Text style={styles.fieldLabel}>Date of Birth</Text>
            {isEditing ? (
              <>
                <TouchableOpacity
                  style={[
                    styles.dateInput,
                    errors.date_of_birth && styles.dateInputError,
                  ]}
                  onPress={handleOpenDatePicker}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.dateInputText,
                      !formData.date_of_birth && styles.dateInputPlaceholder,
                    ]}
                  >
                    {formData.date_of_birth
                      ? formatDateForDisplay(formData.date_of_birth)
                      : "Select your date of birth"}
                  </Text>
                </TouchableOpacity>
                {errors.date_of_birth && (
                  <Text style={styles.errorText}>{errors.date_of_birth}</Text>
                )}
              </>
            ) : (
              <Text style={styles.fieldValue}>
                {formData.date_of_birth
                  ? formatDateForDisplay(formData.date_of_birth)
                  : "Not set"}
              </Text>
            )}
          </View>
        </View>

        {/* Health Information */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Health Information</Text>
          <View style={styles.unitToggle}>
            <Text style={styles.unitLabel}>Unit System</Text>
            <View style={styles.unitButtons}>
              <TouchableOpacity
                style={[
                  styles.unitButton,
                  formData.unit_system === "metric" && styles.unitButtonActive,
                  !isEditing && styles.unitButtonDisabled,
                ]}
                onPress={() =>
                  isEditing && handleInputChange("unit_system", "metric")
                }
                disabled={!isEditing}
              >
                <Text
                  style={[
                    styles.unitButtonText,
                    formData.unit_system === "metric" &&
                      styles.unitButtonTextActive,
                  ]}
                >
                  Metric
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.unitButton,
                  formData.unit_system === "imperial" &&
                    styles.unitButtonActive,
                  !isEditing && styles.unitButtonDisabled,
                ]}
                onPress={() =>
                  isEditing && handleInputChange("unit_system", "imperial")
                }
                disabled={!isEditing}
              >
                <Text
                  style={[
                    styles.unitButtonText,
                    formData.unit_system === "imperial" &&
                      styles.unitButtonTextActive,
                  ]}
                >
                  Imperial
                </Text>
              </TouchableOpacity>
            </View>
          </View>
          {/* Height */}
          <View style={styles.fieldContainer}>
            <Text style={styles.fieldLabel}>
              Height {formData.unit_system === "metric" ? "(cm)" : "(ft'in\")"}
            </Text>
            {isEditing ? (
              <>
                <TouchableOpacity
                  style={[
                    styles.dateInput,
                    errors.height && styles.dateInputError,
                  ]}
                  onPress={handleOpenHeightPicker}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.dateInputText,
                      !formData.height && styles.dateInputPlaceholder,
                    ]}
                  >
                    {formData.height
                      ? formatHeightForDisplay(
                          formData.height,
                          formData.unit_system
                        )
                      : "Select your height"}
                  </Text>
                </TouchableOpacity>
                {errors.height && (
                  <Text style={styles.errorText}>{errors.height}</Text>
                )}
              </>
            ) : (
              <Text style={styles.fieldValue}>
                {formData.height
                  ? formatHeightForDisplay(
                      formData.height,
                      formData.unit_system
                    )
                  : "Not set"}
              </Text>
            )}
          </View>

          {/* Weight */}
          <View style={styles.fieldContainer}>
            <Text style={styles.fieldLabel}>
              Weight {formData.unit_system === "metric" ? "(kg)" : "(lbs)"}
            </Text>
            {isEditing ? (
              <>
                <TouchableOpacity
                  style={[
                    styles.dateInput,
                    errors.weight && styles.dateInputError,
                  ]}
                  onPress={handleOpenWeightPicker}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.dateInputText,
                      !formData.weight && styles.dateInputPlaceholder,
                    ]}
                  >
                    {formData.weight
                      ? formatWeightForDisplay(
                          formData.weight,
                          formData.unit_system
                        )
                      : "Select your weight"}
                  </Text>
                </TouchableOpacity>
                {errors.weight && (
                  <Text style={styles.errorText}>{errors.weight}</Text>
                )}
              </>
            ) : (
              <Text style={styles.fieldValue}>
                {formData.weight
                  ? formatWeightForDisplay(
                      formData.weight,
                      formData.unit_system
                    )
                  : "Not set"}
              </Text>
            )}
          </View>
        </View>

        {/* Save Button (only when editing) */}
        {isEditing && (
          <TouchableOpacity
            style={[styles.saveButton, loading && styles.saveButtonDisabled]}
            onPress={handleSave}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator size="small" color={colors.textOnPrimary} />
            ) : (
              <Text style={styles.saveButtonText}>Save Changes</Text>
            )}
          </TouchableOpacity>
        )}

        {/* Logout Button */}
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={24} color={colors.error} />
          <Text style={styles.logoutButtonText}>Logout</Text>
        </TouchableOpacity>

        <View style={styles.footer}>
          <Text style={styles.footerText}>{APP_NAME}</Text>
          <Text style={styles.footerText}>Version 1.0.0</Text>
        </View>
      </ScrollView>

      {/* Date Picker Modal */}
      <PickerModal
        visible={showDatePicker}
        title="Select Date of Birth"
        onClose={() => setShowDatePicker(false)}
        onSelect={() =>
          handleDateSelect(
            (date) => handleInputChange("date_of_birth", date),
            () => setErrors((prev) => ({ ...prev, date_of_birth: null }))
          )
        }
        columns={getDatePickerColumns()}
        selectedValue={selectedDate}
      />

      {/* Height Picker Modal */}
      <PickerModal
        visible={showHeightPicker}
        title={`Select Height (${
          formData.unit_system === "metric" ? "cm" : "ft'in\""
        })`}
        onClose={() => setShowHeightPicker(false)}
        onSelect={() =>
          handleHeightSelect(
            formData.unit_system,
            (height) => handleInputChange("height", height),
            () => setErrors((prev) => ({ ...prev, height: null }))
          )
        }
        columns={getHeightPickerColumns(formData.unit_system)}
        selectedValue={selectedHeight}
      />

      {/* Weight Picker Modal */}
      <PickerModal
        visible={showWeightPicker}
        title={`Select Weight (${
          formData.unit_system === "metric" ? "kg" : "lbs"
        })`}
        onClose={() => setShowWeightPicker(false)}
        onSelect={() =>
          handleWeightSelect(
            formData.unit_system,
            (weight) => handleInputChange("weight", weight),
            () => setErrors((prev) => ({ ...prev, weight: null }))
          )
        }
        columns={getWeightPickerColumns(formData.unit_system)}
        selectedValue={selectedWeight}
      />
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
    alignItems: "center",
    justifyContent: "space-between",
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
    fontSize: 24,
    fontWeight: "bold",
    color: colors.textOnPrimary,
    flex: 1,
    textAlign: "center",
  },
  editButton: {
    padding: 4,
  },
  cancelButton: {
    padding: 4,
  },
  cancelButtonText: {
    fontSize: 16,
    color: colors.textOnPrimary,
    fontWeight: "600",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
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
  profileHeader: {
    alignItems: "center",
    marginBottom: 24,
  },
  avatarContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: colors.surface,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
    borderWidth: 3,
    borderColor: colors.primary,
  },
  profileName: {
    fontSize: 24,
    fontWeight: "bold",
    color: colors.text,
    marginBottom: 4,
  },
  profileEmail: {
    fontSize: 16,
    color: colors.textSecondary,
  },
  fieldContainer: {
    marginBottom: 16,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.text,
    marginBottom: 8,
  },
  fieldValue: {
    fontSize: 16,
    color: colors.text,
    paddingVertical: 16,
    paddingHorizontal: 16,
    backgroundColor: colors.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 50,
  },
  input: {
    fontSize: 16,
    color: colors.text,
    paddingVertical: 16,
    paddingHorizontal: 16,
    backgroundColor: colors.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 50,
  },
  inputError: {
    borderColor: colors.error,
  },
  errorText: {
    fontSize: 12,
    color: colors.error,
    marginTop: 4,
  },
  unitToggle: {
    marginBottom: 16,
  },
  unitLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.text,
    marginBottom: 12,
  },
  unitButtons: {
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
  unitButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  unitButtonDisabled: {
    opacity: 0.6,
  },
  unitButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.text,
  },
  unitButtonTextActive: {
    color: colors.textOnPrimary,
  },
  saveButton: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 10,
    marginBottom: 20,
    ...(Platform.OS === "web"
      ? {
          boxShadow: "0px 4px 8px rgba(0, 0, 0, 0.3)",
        }
      : {
          shadowColor: "#000",
          shadowOffset: {
            width: 0,
            height: 4,
          },
          shadowOpacity: 0.3,
          shadowRadius: 4,
          elevation: 8,
        }),
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.textOnPrimary,
  },
  logoutButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
    borderRadius: 12,
    paddingVertical: 16,
    marginTop: 20,
    marginBottom: 20,
    borderWidth: 2,
    borderColor: colors.error,
  },
  logoutButtonText: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.error,
    marginLeft: 8,
  },
  footer: {
    alignItems: "center",
    marginTop: 20,
    marginBottom: 40,
  },
  footerText: {
    fontSize: 12,
    color: colors.textLight,
    marginBottom: 4,
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
