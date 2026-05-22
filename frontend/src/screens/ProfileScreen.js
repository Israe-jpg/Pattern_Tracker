import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  Image,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, APP_NAME } from "../constants/colors";
import { useAuth } from "../context/AuthContext";
import PickerModal from "../components/PickerModal";
import { useHealthPickers } from "../hooks/useHealthPickers";
import {
  formatDateForDisplay,
  formatHeightForDisplay,
  formatWeightForDisplay,
} from "../utils/pickerHelpers";

const FIELD_ICONS = {
  first_name: "person-outline",
  last_name: "person-outline",
  username: "at-outline",
  email: "mail-outline",
  date_of_birth: "calendar-outline",
  height: "resize-outline",
  weight: "fitness-outline",
};

export default function ProfileScreen({ navigation }) {
  const { user, logout, refreshUserProfile, submitUserInfo } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState({});
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

  const resetFormFromUser = (u) => {
    if (!u) return;
    setFormData({
      first_name: u.first_name || "",
      last_name: u.last_name || "",
      username: u.username || "",
      email: u.email || "",
      date_of_birth: u.date_of_birth || "",
      height: u.height
        ? String(
            u.unit_system === "imperial" ? u.height_imperial : u.height_metric
          )
        : "",
      weight: u.weight
        ? String(
            u.unit_system === "imperial" ? u.weight_imperial : u.weight_metric
          )
        : "",
      unit_system: u.unit_system || "metric",
    });
  };

  useEffect(() => {
    resetFormFromUser(user);
  }, [user]);

  const setFocus = (field, val) =>
    setFocused((prev) => ({ ...prev, [field]: val }));

  const handleInputChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: String(value || "") }));
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
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
    if (!validateForm()) return;

    setLoading(true);
    try {
      const userInfoData = { unit_system: formData.unit_system };
      const username = String(formData.username || "").trim();
      const dob = String(formData.date_of_birth || "").trim();
      const heightStr = String(formData.height || "").trim();
      const weightStr = String(formData.weight || "").trim();

      if (username) userInfoData.username = username;
      if (dob) userInfoData.date_of_birth = dob;
      if (heightStr) {
        const heightValue = parseFloat(heightStr);
        if (!isNaN(heightValue) && heightValue > 0) {
          userInfoData.height = heightValue;
        }
      }
      if (weightStr) {
        const weightValue = parseFloat(weightStr);
        if (!isNaN(weightValue) && weightValue > 0) {
          userInfoData.weight = weightValue;
        }
      }

      const result = await submitUserInfo(userInfoData);

      if (result.success) {
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

  const handleCancelEdit = () => {
    setIsEditing(false);
    setErrors({});
    resetFormFromUser(user);
  };

  const handleOpenDatePicker = () => {
    if (formData.date_of_birth) initializeDate(formData.date_of_birth);
    setShowDatePicker(true);
  };

  const handleOpenHeightPicker = () => {
    if (formData.height) initializeHeight(formData.height, formData.unit_system);
    setShowHeightPicker(true);
  };

  const handleOpenWeightPicker = () => {
    if (formData.weight) initializeWeight(formData.weight, formData.unit_system);
    setShowWeightPicker(true);
  };

  const handleLogout = () => {
    Alert.alert("Logout", "Are you sure you want to logout?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Logout",
        style: "destructive",
        onPress: async () => {
          try {
            await logout();
            navigation.reset({ index: 0, routes: [{ name: "Login" }] });
          } catch (error) {
            console.error("Logout error:", error);
            Alert.alert("Error", "Failed to logout. Please try again.");
          }
        },
      },
    ]);
  };

  const displayName =
    user?.first_name && user?.last_name
      ? `${user.first_name} ${user.last_name}`
      : user?.username || user?.email || "User";

  const renderReadOnlyField = (label, field, displayValue, compact = false) => (
    <View style={[styles.fieldGroup, compact && styles.fieldGroupCompact]}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.valueWrapper}>
        <Ionicons
          name={FIELD_ICONS[field] || "information-circle-outline"}
          size={18}
          color={colors.textLight}
          style={styles.inputIcon}
        />
        <Text
          style={[
            styles.valueText,
            !displayValue && styles.valuePlaceholder,
          ]}
          numberOfLines={1}
        >
          {displayValue || "Not set"}
        </Text>
      </View>
    </View>
  );

  const renderTextField = (label, field, placeholder, keyboardType = "default") => (
    <View style={styles.fieldGroup}>
      <Text style={styles.label}>{label}</Text>
      <View
        style={[
          styles.inputWrapper,
          focused[field] && styles.inputWrapperFocused,
          errors[field] && styles.inputWrapperError,
        ]}
      >
        <Ionicons
          name={FIELD_ICONS[field] || "create-outline"}
          size={18}
          color={
            errors[field]
              ? colors.error
              : focused[field]
                ? colors.primary
                : colors.textLight
          }
          style={styles.inputIcon}
        />
        <TextInput
          style={styles.input}
          value={String(formData[field] || "")}
          onChangeText={(value) => handleInputChange(field, value)}
          placeholder={placeholder}
          placeholderTextColor={colors.textLight}
          editable={!loading}
          keyboardType={keyboardType}
          onFocus={() => setFocus(field, true)}
          onBlur={() => setFocus(field, false)}
          returnKeyType="done"
        />
      </View>
      {errors[field] && (
        <View style={styles.fieldError}>
          <Ionicons name="alert-circle" size={13} color={colors.error} />
          <Text style={styles.fieldErrorText}>{errors[field]}</Text>
        </View>
      )}
    </View>
  );

  const renderPickerField = (
    label,
    field,
    placeholder,
    displayValue,
    onPress
  ) => (
    <View style={styles.fieldGroup}>
      <Text style={styles.label}>{label}</Text>
      {isEditing ? (
        <>
          <TouchableOpacity
            style={[
              styles.inputWrapper,
              errors[field] && styles.inputWrapperError,
            ]}
            onPress={onPress}
            activeOpacity={0.7}
            disabled={loading}
          >
            <Ionicons
              name={FIELD_ICONS[field] || "chevron-down-outline"}
              size={18}
              color={errors[field] ? colors.error : colors.textLight}
              style={styles.inputIcon}
            />
            <Text
              style={[
                styles.pickerText,
                !displayValue && styles.pickerPlaceholder,
              ]}
              numberOfLines={1}
            >
              {displayValue || placeholder}
            </Text>
            <Ionicons name="chevron-down" size={18} color={colors.textLight} />
          </TouchableOpacity>
          {errors[field] && (
            <View style={styles.fieldError}>
              <Ionicons name="alert-circle" size={13} color={colors.error} />
              <Text style={styles.fieldErrorText}>{errors[field]}</Text>
            </View>
          )}
        </>
      ) : (
        <View style={styles.valueWrapper}>
          <Ionicons
            name={FIELD_ICONS[field] || "information-circle-outline"}
            size={18}
            color={colors.textLight}
            style={styles.inputIcon}
          />
          <Text
            style={[
              styles.valueText,
              !displayValue && styles.valuePlaceholder,
            ]}
            numberOfLines={1}
          >
            {displayValue || "Not set"}
          </Text>
        </View>
      )}
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        {/* Top navigation */}
        <View style={styles.topBar}>
          <TouchableOpacity
            style={styles.topBarButton}
            onPress={() => navigation.goBack()}
            activeOpacity={0.7}
          >
            <Ionicons name="arrow-back" size={22} color={colors.text} />
          </TouchableOpacity>
          {!isEditing ? (
            <TouchableOpacity
              style={styles.editChip}
              onPress={() => setIsEditing(true)}
              activeOpacity={0.7}
            >
              <Ionicons name="pencil" size={16} color={colors.primary} />
              <Text style={styles.editChipText}>Edit</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.topBarActions}>
              <TouchableOpacity
                style={styles.topBarButton}
                onPress={handleCancelEdit}
                disabled={loading}
                activeOpacity={0.7}
              >
                <Text style={styles.cancelTopText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Logo header */}
        <View style={styles.header}>
          <Image
            source={require("../../assets/logo.png")}
            style={styles.logo}
            resizeMode="contain"
            accessibilityLabel={APP_NAME}
          />
        </View>

        {/* Main card */}
        <View style={styles.card}>
          <Text style={styles.title}>Your profile</Text>
          <Text style={styles.subtitle}>
            Manage your account and health details
          </Text>

          {/* Profile summary */}
          <View style={styles.profileSummary}>
            <View style={styles.avatarContainer}>
              <Ionicons name="person" size={36} color={colors.primary} />
            </View>
            <View style={styles.profileSummaryText}>
              <Text style={styles.profileName} numberOfLines={1}>
                {displayName}
              </Text>
              {user?.email ? (
                <Text style={styles.profileEmail} numberOfLines={1}>
                  {user.email}
                </Text>
              ) : null}
            </View>
          </View>

          <View style={styles.sectionDivider}>
            <View style={styles.sectionDividerLine} />
            <Text style={styles.sectionDividerText}>Personal</Text>
            <View style={styles.sectionDividerLine} />
          </View>

          <View style={styles.nameRow}>
            <View style={styles.nameField}>
              {renderReadOnlyField(
                "First Name",
                "first_name",
                formData.first_name || null,
                true
              )}
            </View>
            <View style={styles.nameField}>
              {renderReadOnlyField(
                "Last Name",
                "last_name",
                formData.last_name || null,
                true
              )}
            </View>
          </View>

          {isEditing ? (
            renderTextField("Username", "username", "Your username")
          ) : (
            renderReadOnlyField(
              "Username",
              "username",
              formData.username || null
            )
          )}

          {renderReadOnlyField("Email", "email", formData.email || null)}

          {renderPickerField(
            "Date of Birth",
            "date_of_birth",
            "Select your date of birth",
            formData.date_of_birth
              ? formatDateForDisplay(formData.date_of_birth)
              : null,
            handleOpenDatePicker
          )}

          <View style={styles.sectionDivider}>
            <View style={styles.sectionDividerLine} />
            <Text style={styles.sectionDividerText}>Health</Text>
            <View style={styles.sectionDividerLine} />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Unit system</Text>
            <View style={styles.unitSegment}>
              <TouchableOpacity
                style={[
                  styles.unitSegmentButton,
                  formData.unit_system === "metric" && styles.unitSegmentActive,
                  !isEditing && styles.unitSegmentDisabled,
                ]}
                onPress={() =>
                  isEditing && handleInputChange("unit_system", "metric")
                }
                disabled={!isEditing || loading}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.unitSegmentText,
                    formData.unit_system === "metric" &&
                      styles.unitSegmentTextActive,
                  ]}
                >
                  Metric
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.unitSegmentButton,
                  formData.unit_system === "imperial" &&
                    styles.unitSegmentActive,
                  !isEditing && styles.unitSegmentDisabled,
                ]}
                onPress={() =>
                  isEditing && handleInputChange("unit_system", "imperial")
                }
                disabled={!isEditing || loading}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.unitSegmentText,
                    formData.unit_system === "imperial" &&
                      styles.unitSegmentTextActive,
                  ]}
                >
                  Imperial
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {renderPickerField(
            `Height ${formData.unit_system === "metric" ? "(cm)" : "(ft'in\")"}`,
            "height",
            "Select your height",
            formData.height
              ? formatHeightForDisplay(formData.height, formData.unit_system)
              : null,
            handleOpenHeightPicker
          )}

          {renderPickerField(
            `Weight ${formData.unit_system === "metric" ? "(kg)" : "(lbs)"}`,
            "weight",
            "Select your weight",
            formData.weight
              ? formatWeightForDisplay(formData.weight, formData.unit_system)
              : null,
            handleOpenWeightPicker
          )}

          {isEditing && (
            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleSave}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.buttonText}>Save Changes</Text>
              )}
            </TouchableOpacity>
          )}
        </View>

        {/* Actions card */}
        <View style={styles.cardSecondary}>
          <TouchableOpacity
            style={styles.logoutButton}
            onPress={handleLogout}
            activeOpacity={0.7}
          >
            <Ionicons name="log-out-outline" size={20} color={colors.error} />
            <Text style={styles.logoutButtonText}>Log out</Text>
          </TouchableOpacity>

          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
          </View>

          <Text style={styles.versionText}>Version 1.0.0</Text>
        </View>
      </ScrollView>

      <PickerModal
        visible={showDatePicker}
        title="Select Date of Birth"
        onClose={() => setShowDatePicker(false)}
        onSelect={() =>
          handleDateSelect(
            (date) => handleInputChange("date_of_birth", date),
            () =>
              setErrors((prev) => {
                const next = { ...prev };
                delete next.date_of_birth;
                return next;
              })
          )
        }
        columns={getDatePickerColumns()}
        selectedValue={selectedDate}
      />

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
            () =>
              setErrors((prev) => {
                const next = { ...prev };
                delete next.height;
                return next;
              })
          )
        }
        columns={getHeightPickerColumns(formData.unit_system)}
        selectedValue={selectedHeight}
      />

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
            () =>
              setErrors((prev) => {
                const next = { ...prev };
                delete next.weight;
                return next;
              })
          )
        }
        columns={getWeightPickerColumns(formData.unit_system)}
        selectedValue={selectedWeight}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 32,
  },

  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: Platform.OS === "ios" ? 56 : 16,
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  topBarButton: {
    padding: 8,
    marginLeft: -8,
  },
  topBarActions: {
    flexDirection: "row",
    alignItems: "center",
  },
  cancelTopText: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.textLight,
  },
  editChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: "#E5E0D8",
  },
  editChipText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.primary,
  },

  header: {
    alignItems: "center",
    paddingBottom: 20,
    paddingHorizontal: 24,
  },
  logo: {
    width: 160,
    height: 50,
  },

  card: {
    marginHorizontal: 20,
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 28,
    shadowColor: "#354A2F",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
    marginBottom: 16,
  },
  cardSecondary: {
    marginHorizontal: 20,
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 20,
    shadowColor: "#354A2F",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: colors.text,
    marginBottom: 6,
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textLight,
    marginBottom: 24,
    lineHeight: 20,
  },

  profileSummary: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.background,
    borderRadius: 14,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1.5,
    borderColor: "#E5E0D8",
  },
  avatarContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#FAFFF7",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: colors.primaryLight,
    marginRight: 14,
  },
  profileSummaryText: {
    flex: 1,
  },
  profileName: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.text,
    marginBottom: 4,
    letterSpacing: -0.2,
  },
  profileEmail: {
    fontSize: 14,
    color: colors.textLight,
  },

  sectionDivider: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20,
    gap: 12,
  },
  sectionDividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: "#EDE8E0",
  },
  sectionDividerText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.textLight,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },

  fieldGroup: {
    marginBottom: 16,
  },
  fieldGroupCompact: {
    marginBottom: 0,
  },
  nameRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 16,
  },
  nameField: {
    flex: 1,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.text,
    marginBottom: 8,
    letterSpacing: 0.1,
  },

  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.background,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#E5E0D8",
    paddingHorizontal: 14,
    minHeight: 52,
  },
  inputWrapperFocused: {
    borderColor: colors.primary,
    backgroundColor: "#FAFFF7",
  },
  inputWrapperError: {
    borderColor: colors.error,
    backgroundColor: "#FFF9F9",
  },
  valueWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.background,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#E5E0D8",
    paddingHorizontal: 14,
    minHeight: 52,
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: colors.text,
    paddingVertical: 12,
  },
  valueText: {
    flex: 1,
    fontSize: 15,
    color: colors.text,
  },
  valuePlaceholder: {
    color: colors.textLight,
  },
  pickerText: {
    flex: 1,
    fontSize: 15,
    color: colors.text,
    paddingVertical: 14,
  },
  pickerPlaceholder: {
    color: colors.textLight,
  },
  fieldError: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 6,
    gap: 4,
  },
  fieldErrorText: {
    fontSize: 12,
    color: colors.error,
    flex: 1,
  },

  unitSegment: {
    flexDirection: "row",
    backgroundColor: colors.background,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#E5E0D8",
    padding: 4,
    gap: 4,
  },
  unitSegmentButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  unitSegmentActive: {
    backgroundColor: colors.primary,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  unitSegmentDisabled: {
    opacity: 0.85,
  },
  unitSegmentText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.textLight,
  },
  unitSegmentTextActive: {
    color: "#FFFFFF",
  },

  button: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  buttonDisabled: {
    opacity: 0.6,
    shadowOpacity: 0,
    elevation: 0,
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 0.3,
  },

  logoutButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FEF2F2",
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#FECACA",
    height: 52,
    gap: 8,
  },
  logoutButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.error,
    letterSpacing: 0.2,
  },

  dividerRow: {
    marginTop: 16,
    marginBottom: 12,
  },
  dividerLine: {
    height: 1,
    backgroundColor: "#EDE8E0",
  },
  versionText: {
    fontSize: 12,
    color: colors.textLight,
    textAlign: "center",
    fontWeight: "500",
  },
});
