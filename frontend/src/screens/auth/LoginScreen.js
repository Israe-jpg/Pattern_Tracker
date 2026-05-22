import React, { useState } from 'react';
import {
  View,
  Text,
  Image,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { colors, APP_NAME } from '../../constants/colors';

export default function LoginScreen({ navigation }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const [showPassword, setShowPassword] = useState(false);
  const [emailFocused, setEmailFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const { login } = useAuth();

  const clearFieldError = (field) => {
    if (errors[field]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  const validateEmail = (value) => {
    if (!value) return 'Email is required';
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(value)) return 'Please enter a valid email address';
    return null;
  };

  const handleLogin = async () => {
    setErrors({});

    const emailError = validateEmail(email);
    if (emailError) {
      setErrors({ email: emailError });
      return;
    }

    if (!password) {
      setErrors({ password: 'Password is required' });
      return;
    }

    setLoading(true);
    const result = await login(email, password);
    setLoading(false);

    if (!result.success) {
      const errorMsg = result.error || 'Login failed. Please try again.';
      const lowerError = errorMsg.toLowerCase();

      if (lowerError.includes('email') || lowerError.includes('user not found')) {
        setErrors({ email: errorMsg });
      } else if (lowerError.includes('password') || lowerError.includes('invalid')) {
        setErrors({ password: errorMsg });
      } else {
        setErrors({ general: errorMsg });
      }
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        {/* Header area */}
        <View style={styles.header}>
          <Image
            source={require('../../../assets/logo.png')}
            style={styles.logo}
            resizeMode="contain"
            accessibilityLabel={APP_NAME}
          />
        </View>

        {/* Form card */}
        <View style={styles.card}>
          <Text style={styles.title}>Welcome back</Text>
          <Text style={styles.subtitle}>Sign in to your account to continue</Text>

          {/* General error */}
          {errors.general && (
            <View style={styles.generalErrorContainer}>
              <Ionicons name="alert-circle-outline" size={16} color={colors.error} />
              <Text style={styles.generalErrorText}>{errors.general}</Text>
            </View>
          )}

          {/* Email field */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Email</Text>
            <View style={[
              styles.inputWrapper,
              emailFocused && styles.inputWrapperFocused,
              errors.email && styles.inputWrapperError,
            ]}>
              <Ionicons
                name="mail-outline"
                size={18}
                color={errors.email ? colors.error : emailFocused ? colors.primary : colors.textLight}
                style={styles.inputIcon}
              />
              <TextInput
                style={styles.input}
                placeholder="you@example.com"
                placeholderTextColor={colors.textLight}
                value={email}
                onChangeText={(value) => {
                  setEmail(value);
                  clearFieldError('email');
                  if (value) {
                    const error = validateEmail(value);
                    if (error) setErrors((prev) => ({ ...prev, email: error }));
                  }
                }}
                onFocus={() => setEmailFocused(true)}
                onBlur={() => {
                  setEmailFocused(false);
                  const error = validateEmail(email);
                  if (error) setErrors((prev) => ({ ...prev, email: error }));
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

          {/* Password field */}
          <View style={styles.fieldGroup}>
            <View style={styles.labelRow}>
              <Text style={styles.label}>Password</Text>
              <TouchableOpacity activeOpacity={0.7}>
                <Text style={styles.forgotText}>Forgot password?</Text>
              </TouchableOpacity>
            </View>
            <View style={[
              styles.inputWrapper,
              passwordFocused && styles.inputWrapperFocused,
              errors.password && styles.inputWrapperError,
            ]}>
              <Ionicons
                name="lock-closed-outline"
                size={18}
                color={errors.password ? colors.error : passwordFocused ? colors.primary : colors.textLight}
                style={styles.inputIcon}
              />
              <TextInput
                style={styles.input}
                placeholder="Your password"
                placeholderTextColor={colors.textLight}
                value={password}
                onChangeText={(value) => {
                  setPassword(value);
                  clearFieldError('password');
                }}
                onFocus={() => setPasswordFocused(true)}
                onBlur={() => {
                  setPasswordFocused(false);
                  if (!password) setErrors((prev) => ({ ...prev, password: 'Password is required' }));
                }}
                secureTextEntry={!showPassword}
                returnKeyType="done"
                onSubmitEditing={handleLogin}
              />
              <TouchableOpacity
                onPress={() => setShowPassword((v) => !v)}
                style={styles.eyeButton}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={showPassword ? 'eye-outline' : 'eye-off-outline'}
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

          {/* Sign In button */}
          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.buttonText}>Sign In</Text>
            )}
          </TouchableOpacity>

          {/* Divider */}
          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* Register link */}
          <TouchableOpacity
            style={styles.registerButton}
            onPress={() => navigation.navigate('Register')}
            activeOpacity={0.7}
          >
            <Text style={styles.registerText}>
              Don't have an account?{' '}
              <Text style={styles.registerTextBold}>Create one</Text>
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
    justifyContent: 'center',
    paddingVertical: 48,
  },

  // Header
  header: {
    alignItems: 'center',
    paddingBottom: 28,
    paddingHorizontal: 24,
  },
  logo: {
    width: 220,
    height: 68,
  },

  // Card
  card: {
    marginHorizontal: 20,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 28,
    shadowColor: '#354A2F',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 6,
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textLight,
    marginBottom: 28,
    lineHeight: 20,
  },

  // General error
  generalErrorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 10,
    padding: 12,
    marginBottom: 20,
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
    marginBottom: 20,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
    letterSpacing: 0.1,
  },
  forgotText: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.primary,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E5E0D8',
    paddingHorizontal: 14,
    height: 52,
  },
  inputWrapperFocused: {
    borderColor: colors.primary,
    backgroundColor: '#FAFFF7',
  },
  inputWrapperError: {
    borderColor: colors.error,
    backgroundColor: '#FFF9F9',
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
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    gap: 4,
  },
  fieldErrorText: {
    fontSize: 12,
    color: colors.error,
    flex: 1,
  },

  // Button
  button: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
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
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },

  // Divider
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 20,
    gap: 12,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#EDE8E0',
  },
  dividerText: {
    fontSize: 13,
    color: colors.textLight,
    fontWeight: '500',
  },

  // Register
  registerButton: {
    alignItems: 'center',
    paddingVertical: 4,
  },
  registerText: {
    fontSize: 14,
    color: colors.textLight,
  },
  registerTextBold: {
    color: colors.primary,
    fontWeight: '700',
  },
});
