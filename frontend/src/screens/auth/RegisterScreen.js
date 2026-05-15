import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { useAuth } from "../../context/AuthContext";
import { colors } from "../../constants/colors";

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

  const { register, login } = useAuth();

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

  // Validate a single field and update errors via functional setState (no stale closures)
  const validateField = (field, value) => {
    setErrors((prev) => {
      const next = { ...prev };
      switch (field) {
        case "username":
          if (!value) {
            next.username = "Username is required";
          } else if (value.length < 3) {
            next.username = "Username must be at least 3 characters";
          } else if (!/^[a-zA-Z0-9_]+$/.test(value)) {
            next.username = "Username can only contain letters, numbers, and underscores";
          } else {
            delete next.username;
          }
          break;
        case "email":
          if (!value) {
            next.email = "Email is required";
          } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
            next.email = "Please enter a valid email address";
          } else {
            delete next.email;
          }
          break;
        case "password":
          if (!value) {
            next.password = "Password is required";
          } else if (value.length < 8) {
            next.password = "Password must be at least 8 characters";
          } else {
            delete next.password;
          }
          break;
        case "confirmPassword":
          if (!value) {
            next.confirmPassword = "Please confirm your password";
          } else if (value !== formData.password) {
            next.confirmPassword = "Passwords do not match";
          } else {
            delete next.confirmPassword;
          }
          break;
      }
      return next;
    });
  };

  // Validate all required fields synchronously — returns true if form is valid.
  // Computes errors locally so the result never depends on stale state.
  const validateAll = () => {
    const newErrors = {};

    if (!formData.username) {
      newErrors.username = "Username is required";
    } else if (formData.username.length < 3) {
      newErrors.username = "Username must be at least 3 characters";
    } else if (!/^[a-zA-Z0-9_]+$/.test(formData.username)) {
      newErrors.username = "Username can only contain letters, numbers, and underscores";
    }

    if (!formData.email) {
      newErrors.email = "Email is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = "Please enter a valid email address";
    }

    if (!formData.password) {
      newErrors.password = "Password is required";
    } else if (formData.password.length < 8) {
      newErrors.password = "Password must be at least 8 characters";
    }

    if (!formData.confirmPassword) {
      newErrors.confirmPassword = "Please confirm your password";
    } else if (formData.confirmPassword !== formData.password) {
      newErrors.confirmPassword = "Passwords do not match";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
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
    if (!validateAll()) {
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
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
    >
      <View style={styles.content}>
        <Text style={styles.title}>Create Account</Text>
        <Text style={styles.subtitle}>Sign up to get started</Text>

        <View style={styles.form}>
          {errors.general && (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{errors.general}</Text>
            </View>
          )}

          <View>
            <TextInput
              style={[styles.input, errors.username && styles.inputError]}
              placeholder="Username *"
              placeholderTextColor={colors.textLight}
              value={formData.username}
              onChangeText={(value) => {
                updateField("username", value);
                if (value) validateField("username", value);
              }}
              onBlur={() => {
                if (formData.username) validateField("username", formData.username);
              }}
              autoCapitalize="none"
              returnKeyType="next"
              blurOnSubmit={false}
            />
            {errors.username && (
              <Text style={styles.errorText}>{errors.username}</Text>
            )}
          </View>

          <View>
            <TextInput
              style={[styles.input, errors.email && styles.inputError]}
              placeholder="Email *"
              placeholderTextColor={colors.textLight}
              value={formData.email}
              onChangeText={(value) => {
                updateField("email", value);
                if (value) validateField("email", value);
              }}
              onBlur={() => {
                if (formData.email) validateField("email", formData.email);
              }}
              keyboardType="email-address"
              autoCapitalize="none"
              returnKeyType="next"
              blurOnSubmit={false}
            />
            {errors.email && (
              <Text style={styles.errorText}>{errors.email}</Text>
            )}
          </View>

          <View>
            <TextInput
              style={[styles.input, errors.password && styles.inputError]}
              placeholder="Password *"
              placeholderTextColor={colors.textLight}
              value={formData.password}
              onChangeText={(value) => {
                updateField("password", value);
                if (value) validateField("password", value);
              }}
              onBlur={() => {
                if (formData.password) validateField("password", formData.password);
              }}
              secureTextEntry
              returnKeyType="next"
              blurOnSubmit={false}
            />
            {errors.password && (
              <Text style={styles.errorText}>{errors.password}</Text>
            )}
          </View>

          <View>
            <TextInput
              style={[
                styles.input,
                errors.confirmPassword && styles.inputError,
              ]}
              placeholder="Confirm Password *"
              placeholderTextColor={colors.textLight}
              value={formData.confirmPassword}
              onChangeText={(value) => {
                updateField("confirmPassword", value);
                if (value) validateField("confirmPassword", value);
              }}
              returnKeyType="next"
              blurOnSubmit={false}
              onBlur={() => {
                if (formData.confirmPassword)
                  validateField("confirmPassword", formData.confirmPassword);
              }}
              secureTextEntry
            />
            {errors.confirmPassword && (
              <Text style={styles.errorText}>{errors.confirmPassword}</Text>
            )}
          </View>

          <View>
            <TextInput
              style={[styles.input, errors.first_name && styles.inputError]}
              placeholder="First Name"
              placeholderTextColor={colors.textLight}
              value={formData.first_name}
              onChangeText={(value) => {
                updateField("first_name", value);
                if (value && errors.first_name)
                  validateField("first_name", value);
              }}
              returnKeyType="next"
              blurOnSubmit={false}
              onBlur={() => {
                if (formData.first_name && errors.first_name) {
                  validateField("first_name", formData.first_name);
                }
              }}
            />
            {errors.first_name && (
              <Text style={styles.errorText}>{errors.first_name}</Text>
            )}
          </View>

          <View>
            <TextInput
              style={[styles.input, errors.last_name && styles.inputError]}
              placeholder="Last Name"
              placeholderTextColor={colors.textLight}
              value={formData.last_name}
              onChangeText={(value) => {
                updateField("last_name", value);
                if (value && errors.last_name)
                  validateField("last_name", value);
              }}
              returnKeyType="done"
              blurOnSubmit={true}
              onBlur={() => {
                if (formData.last_name && errors.last_name) {
                  validateField("last_name", formData.last_name);
                }
              }}
            />
            {errors.last_name && (
              <Text style={styles.errorText}>{errors.last_name}</Text>
            )}
          </View>

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleRegister}
            disabled={loading}
            activeOpacity={0.7}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Sign Up</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.linkButton}
            onPress={() => navigation.navigate("Login")}
          >
            <Text style={styles.linkText}>
              Already have an account? Sign in
            </Text>
          </TouchableOpacity>
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
    paddingTop: 60,
  },
  content: {
    width: "100%",
  },
  title: {
    fontSize: 32,
    fontWeight: "bold",
    color: colors.text,
    textAlign: "center",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: "center",
    marginBottom: 40,
  },
  form: {
    width: "100%",
  },
  input: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    padding: 16,
    fontSize: 16,
    color: colors.text,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  inputError: {
    borderColor: colors.error,
    borderWidth: 1,
  },
  errorContainer: {
    backgroundColor: "#FEE2E2",
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.error,
  },
  errorText: {
    color: colors.error,
    fontSize: 12,
    marginTop: 4,
    marginBottom: 8,
    marginLeft: 4,
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    padding: 16,
    alignItems: "center",
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  linkButton: {
    marginTop: 20,
    alignItems: "center",
  },
  linkText: {
    color: colors.primary,
    fontSize: 14,
  },
});
