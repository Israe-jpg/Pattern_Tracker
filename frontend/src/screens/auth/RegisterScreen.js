import React, { useState } from "react";
import {
  View,
  Text,
  Image,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../context/AuthContext";
import { colors, APP_NAME } from "../../constants/colors";

export default function RegisterScreen({ navigation }) {
  const [formData, setFormData] = useState({
    username: "",
    email: "",
    password: "",
    confirmPassword: "",
    first_name: "",
    last_name: "",
  });
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [focused, setFocused] = useState({});

  const { register, login } = useAuth();

  const setFocus = (field, val) =>
    setFocused((prev) => ({ ...prev, [field]: val }));

  // Clear field error when user starts typing
  const clearFieldError = (field) => {
    if (errors[field]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  const updateField = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    clearFieldError(field);
  };

  // Validate individual field with real-time feedback
  const validateField = (field, value) => {
    const fieldErrors = { ...errors };

    switch (field) {
      case "username":
        if (!value) {
          fieldErrors.username = "Username is required";
        } else if (value.length < 3) {
          fieldErrors.username = "Username must be at least 3 characters";
        } else if (!/^[a-zA-Z0-9_]+$/.test(value)) {
          fieldErrors.username =
            "Username can only contain letters, numbers, and underscores";
        } else {
          delete fieldErrors.username;
        }
        break;

      case "email":
        if (!value) {
          fieldErrors.email = "Email is required";
        } else {
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!emailRegex.test(value)) {
            fieldErrors.email = "Please enter a valid email address";
          } else {
            delete fieldErrors.email;
          }
        }
        break;

      case "password":
        if (!value) {
          fieldErrors.password = "Password is required";
        } else if (value.length < 8) {
          fieldErrors.password = "Password must be at least 8 characters";
        } else {
          delete fieldErrors.password;
          // Re-validate confirm password when password changes
          if (formData.confirmPassword) {
            validateField("confirmPassword", formData.confirmPassword);
          }
        }
        break;

      case "confirmPassword":
        if (!value) {
          fieldErrors.confirmPassword = "Please confirm your password";
        } else if (value !== formData.password) {
          fieldErrors.confirmPassword = "Passwords do not match";
        } else {
          delete fieldErrors.confirmPassword;
        }
        break;
    }

    setErrors(fieldErrors);
  };

  // Validate all fields before submission
  const validateAll = () => {
    const newErrors = {};

    validateField("username", formData.username);
    validateField("email", formData.email);
    validateField("password", formData.password);
    validateField("confirmPassword", formData.confirmPassword);

    // Check required fields
    if (!formData.username) newErrors.username = "Username is required";
    if (!formData.email) newErrors.email = "Email is required";
    if (!formData.password) newErrors.password = "Password is required";
    if (!formData.confirmPassword)
      newErrors.confirmPassword = "Please confirm your password";

    setErrors((prev) => ({ ...prev, ...newErrors }));
    return (
      Object.keys(newErrors).length === 0 && Object.keys(errors).length === 0
    );
  };

  // Parse backend validation errors and map to form fields
  const parseBackendErrors = (errorMessage, details = null) => {
    const newErrors = {};

    // Use raw details from backend if available (more reliable)
    if (details && typeof details === "object") {
      Object.entries(details).forEach(([field, fieldErrors]) => {
        const fieldMap = {
          username: "username",
          email: "email",
          password: "password",
          first_name: "first_name",
          last_name: "last_name",
        };

        const mappedField = fieldMap[field] || field;
        const errorText = Array.isArray(fieldErrors)
          ? fieldErrors.join(", ")
          : String(fieldErrors);
        newErrors[mappedField] = errorText;
      });
      return newErrors;
    }

    // Fallback: Parse from formatted error message string
    if (errorMessage.includes("Validation failed:")) {
      const parts = errorMessage.split("|");
      parts.forEach((part) => {
        const trimmed = part.trim();
        if (trimmed.includes(":")) {
          const [fieldPart, ...errorParts] = trimmed.split(":");
          const field = fieldPart.trim().toLowerCase().replace(/\s+/g, "_");
          const error = errorParts.join(":").trim();

          const fieldMap = {
            username: "username",
            email: "email",
            password: "password",
            first_name: "first_name",
            "first name": "first_name",
            last_name: "last_name",
            "last name": "last_name",
          };

          const mappedField = fieldMap[field] || field;
          newErrors[mappedField] = error;
        }
      });
    } else {
      // Try to infer field from error message content
      const lowerError = errorMessage.toLowerCase();
      if (lowerError.includes("username")) {
        newErrors.username = errorMessage;
      } else if (lowerError.includes("email")) {
        newErrors.email = errorMessage;
      } else if (lowerError.includes("password")) {
        newErrors.password = errorMessage;
      }
    }

    return newErrors;
  };

  const handleRegister = async () => {
    setErrors({});

    if (!validateAll()) {
      // Re-validate all fields to show all errors
      validateField("username", formData.username);
      validateField("email", formData.email);
      validateField("password", formData.password);
      validateField("confirmPassword", formData.confirmPassword);
      return;
    }

    setLoading(true);
    try {
      // Remove confirmPassword before sending (client-side only)
      const { confirmPassword, ...dataToSend } = formData;
      const result = await register(dataToSend);

      if (result && result.success) {
        // Auto-login after successful registration
        try {
          const loginResult = await login(formData.email, formData.password);

          if (loginResult && loginResult.success) {
            setLoading(false);
            // Navigation will automatically switch to Home via AppNavigator
            // when isAuthenticated becomes true
          } else {
            setLoading(false);
            Alert.alert(
              "Account Created",
              "Your account has been created successfully! Please log in.",
              [{ text: "OK", onPress: () => navigation.navigate("Login") }]
            );
          }
        } catch (loginError) {
          setLoading(false);
          Alert.alert(
            "Account Created",
            "Your account has been created successfully! Please log in.",
            [{ text: "OK", onPress: () => navigation.navigate("Login") }]
          );
        }
      } else {
        setLoading(false);
        const errorMsg =
          result?.error || "Registration failed. Please try again.";
        const errorDetails = result?.details || null;

        // Display backend validation errors inline
        const backendErrors = parseBackendErrors(errorMsg, errorDetails);
        if (Object.keys(backendErrors).length > 0) {
          setErrors((prev) => ({ ...prev, ...backendErrors }));
        } else {
          setErrors({ general: errorMsg });
        }
      }
    } catch (error) {
      setLoading(false);
      const errorMsg =
        error.response?.data?.error ||
        error.response?.data?.message ||
        error.message ||
        "An unexpected error occurred. Please try again.";

      const backendErrors = parseBackendErrors(errorMsg);
      if (Object.keys(backendErrors).length > 0) {
        setErrors((prev) => ({ ...prev, ...backendErrors }));
      } else {
        setErrors({ general: errorMsg });
      }
    }
  };

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
        {/* Header */}
        <View style={styles.header}>
          <Image
            source={require("../../../assets/logo.png")}
            style={styles.logo}
            resizeMode="contain"
            accessibilityLabel={APP_NAME}
          />
        </View>

        {/* Form card */}
        <View style={styles.card}>
          <Text style={styles.title}>Create your account</Text>
          <Text style={styles.subtitle}>
            Join Trackt to start your health journey
          </Text>

          {/* General error */}
          {errors.general && (
            <View style={styles.generalErrorContainer}>
              <Ionicons name="alert-circle-outline" size={16} color={colors.error} />
              <Text style={styles.generalErrorText}>{errors.general}</Text>
            </View>
          )}

          {/* Username */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Username <Text style={styles.required}>*</Text></Text>
            <View style={[
              styles.inputWrapper,
              focused.username && styles.inputWrapperFocused,
              errors.username && styles.inputWrapperError,
            ]}>
              <Ionicons
                name="person-outline"
                size={18}
                color={errors.username ? colors.error : focused.username ? colors.primary : colors.textLight}
                style={styles.inputIcon}
              />
              <TextInput
                style={styles.input}
                placeholder="e.g. john_doe"
                placeholderTextColor={colors.textLight}
                value={formData.username}
                onChangeText={(value) => {
                  updateField("username", value);
                  if (value) validateField("username", value);
                }}
                onFocus={() => setFocus("username", true)}
                onBlur={() => {
                  setFocus("username", false);
                  validateField("username", formData.username);
                }}
                autoCapitalize="none"
                returnKeyType="next"
                blurOnSubmit={false}
              />
            </View>
            {errors.username && (
              <View style={styles.fieldError}>
                <Ionicons name="alert-circle" size={13} color={colors.error} />
                <Text style={styles.fieldErrorText}>{errors.username}</Text>
              </View>
            )}
          </View>

          {/* Email */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Email <Text style={styles.required}>*</Text></Text>
            <View style={[
              styles.inputWrapper,
              focused.email && styles.inputWrapperFocused,
              errors.email && styles.inputWrapperError,
            ]}>
              <Ionicons
                name="mail-outline"
                size={18}
                color={errors.email ? colors.error : focused.email ? colors.primary : colors.textLight}
                style={styles.inputIcon}
              />
              <TextInput
                style={styles.input}
                placeholder="you@example.com"
                placeholderTextColor={colors.textLight}
                value={formData.email}
                onChangeText={(value) => {
                  updateField("email", value);
                  if (value) validateField("email", value);
                }}
                onFocus={() => setFocus("email", true)}
                onBlur={() => {
                  setFocus("email", false);
                  validateField("email", formData.email);
                }}
                keyboardType="email-address"
                autoCapitalize="none"
                returnKeyType="next"
                blurOnSubmit={false}
              />
            </View>
            {errors.email && (
              <View style={styles.fieldError}>
                <Ionicons name="alert-circle" size={13} color={colors.error} />
                <Text style={styles.fieldErrorText}>{errors.email}</Text>
              </View>
            )}
          </View>

          {/* Password */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Password <Text style={styles.required}>*</Text></Text>
            <View style={[
              styles.inputWrapper,
              focused.password && styles.inputWrapperFocused,
              errors.password && styles.inputWrapperError,
            ]}>
              <Ionicons
                name="lock-closed-outline"
                size={18}
                color={errors.password ? colors.error : focused.password ? colors.primary : colors.textLight}
                style={styles.inputIcon}
              />
              <TextInput
                style={styles.input}
                placeholder="Min. 8 characters"
                placeholderTextColor={colors.textLight}
                value={formData.password}
                onChangeText={(value) => {
                  updateField("password", value);
                  if (value) validateField("password", value);
                }}
                onFocus={() => setFocus("password", true)}
                onBlur={() => {
                  setFocus("password", false);
                  validateField("password", formData.password);
                }}
                secureTextEntry={!showPassword}
                returnKeyType="next"
                blurOnSubmit={false}
              />
              <TouchableOpacity
                onPress={() => setShowPassword((v) => !v)}
                style={styles.eyeButton}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={showPassword ? "eye-outline" : "eye-off-outline"}
                  size={18}
                  color={colors.textLight}
                />
              </TouchableOpacity>
            </View>
            {errors.password && (
              <View style={styles.fieldError}>
                <Ionicons name="alert-circle" size={13} color={colors.error} />
                <Text style={styles.fieldErrorText}>{errors.password}</Text>
              </View>
            )}
          </View>

          {/* Confirm Password */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Confirm Password <Text style={styles.required}>*</Text></Text>
            <View style={[
              styles.inputWrapper,
              focused.confirmPassword && styles.inputWrapperFocused,
              errors.confirmPassword && styles.inputWrapperError,
            ]}>
              <Ionicons
                name="shield-checkmark-outline"
                size={18}
                color={errors.confirmPassword ? colors.error : focused.confirmPassword ? colors.primary : colors.textLight}
                style={styles.inputIcon}
              />
              <TextInput
                style={styles.input}
                placeholder="Repeat your password"
                placeholderTextColor={colors.textLight}
                value={formData.confirmPassword}
                onChangeText={(value) => {
                  updateField("confirmPassword", value);
                  if (value) validateField("confirmPassword", value);
                }}
                onFocus={() => setFocus("confirmPassword", true)}
                onBlur={() => {
                  setFocus("confirmPassword", false);
                  validateField("confirmPassword", formData.confirmPassword);
                }}
                secureTextEntry={!showConfirmPassword}
                returnKeyType="next"
                blurOnSubmit={false}
              />
              <TouchableOpacity
                onPress={() => setShowConfirmPassword((v) => !v)}
                style={styles.eyeButton}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={showConfirmPassword ? "eye-outline" : "eye-off-outline"}
                  size={18}
                  color={colors.textLight}
                />
              </TouchableOpacity>
            </View>
            {errors.confirmPassword && (
              <View style={styles.fieldError}>
                <Ionicons name="alert-circle" size={13} color={colors.error} />
                <Text style={styles.fieldErrorText}>{errors.confirmPassword}</Text>
              </View>
            )}
          </View>

          {/* First & Last name row */}
          <View style={styles.nameRow}>
            <View style={[styles.fieldGroup, styles.nameField]}>
              <Text style={styles.label}>First Name</Text>
              <View style={[
                styles.inputWrapper,
                focused.first_name && styles.inputWrapperFocused,
                errors.first_name && styles.inputWrapperError,
              ]}>
                <Ionicons
                  name="person-outline"
                  size={18}
                  color={errors.first_name ? colors.error : focused.first_name ? colors.primary : colors.textLight}
                  style={styles.inputIcon}
                />
                <TextInput
                  style={styles.input}
                  placeholder="Jane"
                  placeholderTextColor={colors.textLight}
                  value={formData.first_name}
                  onChangeText={(value) => updateField("first_name", value)}
                  onFocus={() => setFocus("first_name", true)}
                  onBlur={() => setFocus("first_name", false)}
                  returnKeyType="next"
                  blurOnSubmit={false}
                />
              </View>
              {errors.first_name && (
                <View style={styles.fieldError}>
                  <Ionicons name="alert-circle" size={13} color={colors.error} />
                  <Text style={styles.fieldErrorText}>{errors.first_name}</Text>
                </View>
              )}
            </View>

            <View style={[styles.fieldGroup, styles.nameField]}>
              <Text style={styles.label}>Last Name</Text>
              <View style={[
                styles.inputWrapper,
                focused.last_name && styles.inputWrapperFocused,
                errors.last_name && styles.inputWrapperError,
              ]}>
                <Ionicons
                  name="person-outline"
                  size={18}
                  color={errors.last_name ? colors.error : focused.last_name ? colors.primary : colors.textLight}
                  style={styles.inputIcon}
                />
                <TextInput
                  style={styles.input}
                  placeholder="Doe"
                  placeholderTextColor={colors.textLight}
                  value={formData.last_name}
                  onChangeText={(value) => updateField("last_name", value)}
                  onFocus={() => setFocus("last_name", true)}
                  onBlur={() => setFocus("last_name", false)}
                  returnKeyType="done"
                  onSubmitEditing={handleRegister}
                />
              </View>
              {errors.last_name && (
                <View style={styles.fieldError}>
                  <Ionicons name="alert-circle" size={13} color={colors.error} />
                  <Text style={styles.fieldErrorText}>{errors.last_name}</Text>
                </View>
              )}
            </View>
          </View>

          {/* Submit button */}
          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleRegister}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.buttonText}>Create Account</Text>
            )}
          </TouchableOpacity>

          {/* Divider */}
          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* Login link */}
          <TouchableOpacity
            style={styles.loginButton}
            onPress={() => navigation.navigate("Login")}
            activeOpacity={0.7}
          >
            <Text style={styles.loginText}>
              Already have an account?{" "}
              <Text style={styles.loginTextBold}>Sign in</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
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

  // Header
  header: {
    alignItems: "center",
    paddingTop: 56,
    paddingBottom: 24,
    paddingHorizontal: 24,
  },
  logo: {
    width: 180,
    height: 56,
  },

  // Card
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
  required: {
    color: colors.error,
  },

  // General error
  generalErrorContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
    gap: 8,
  },
  generalErrorText: {
    color: colors.error,
    fontSize: 13,
    flex: 1,
    lineHeight: 18,
  },

  // Fields
  fieldGroup: {
    marginBottom: 16,
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
    height: 50,
  },
  inputWrapperFocused: {
    borderColor: colors.primary,
    backgroundColor: "#FAFFF7",
  },
  inputWrapperError: {
    borderColor: colors.error,
    backgroundColor: "#FFF9F9",
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: colors.text,
    paddingVertical: 0,
  },
  eyeButton: {
    padding: 4,
    marginLeft: 6,
  },
  fieldError: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 5,
    gap: 4,
  },
  fieldErrorText: {
    fontSize: 12,
    color: colors.error,
    flex: 1,
  },

  // Name row
  nameRow: {
    flexDirection: "row",
    gap: 12,
  },
  nameField: {
    flex: 1,
  },

  // Button
  button: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
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

  // Divider
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 24,
    marginBottom: 20,
    gap: 12,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: "#EDE8E0",
  },
  dividerText: {
    fontSize: 13,
    color: colors.textLight,
    fontWeight: "500",
  },

  // Login link
  loginButton: {
    alignItems: "center",
    paddingVertical: 4,
  },
  loginText: {
    fontSize: 14,
    color: colors.textLight,
  },
  loginTextBold: {
    color: colors.primary,
    fontWeight: "700",
  },
});
