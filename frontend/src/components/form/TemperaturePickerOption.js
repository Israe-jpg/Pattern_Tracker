import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
  TextInput,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../../constants/colors";
import {
  convertToBackendFormat,
  convertFromBackendFormat,
  getTemperatureRange,
} from "../../utils/temperatureConverter";

const TemperaturePickerOption = React.memo(({ value, onChange }) => {
  const [showPicker, setShowPicker] = useState(false);
  const [unit, setUnit] = useState("fahrenheit"); // 'celsius' or 'fahrenheit'
  const [inputValue, setInputValue] = useState("");

  // Convert backend value (Fahrenheit) to display unit
  useEffect(() => {
    if (value !== null && value !== undefined) {
      const displayValue = convertFromBackendFormat(value, unit);
      setInputValue(displayValue?.toFixed(1) || "");
    } else {
      setInputValue("");
    }
  }, [value, unit]);

  const handleConfirm = () => {
    if (isConfirmDisabled) {
      return; // Don't proceed if validation fails
    }

    const numValue = parseFloat(inputValue);
    // Convert to backend format (Fahrenheit)
    const backendValue = convertToBackendFormat(numValue, unit);
    onChange(backendValue);
    setShowPicker(false);
  };

  const handleClear = () => {
    onChange(null);
    setShowPicker(false);
  };

  const handleCancel = () => {
    // Reset input to current value
    if (value !== null && value !== undefined) {
      const displayValue = convertFromBackendFormat(value, unit);
      setInputValue(displayValue?.toFixed(1) || "");
    } else {
      setInputValue("");
    }
    setShowPicker(false);
  };

  const toggleUnit = () => {
    const newUnit = unit === "fahrenheit" ? "celsius" : "fahrenheit";
    setUnit(newUnit);

    // Convert current input value to new unit
    if (inputValue) {
      const numValue = parseFloat(inputValue);
      if (!isNaN(numValue)) {
        if (unit === "fahrenheit") {
          // Converting from F to C
          const celsius = ((numValue - 32) * 5) / 9;
          setInputValue(celsius.toFixed(1));
        } else {
          // Converting from C to F
          const fahrenheit = (numValue * 9) / 5 + 32;
          setInputValue(fahrenheit.toFixed(1));
        }
      }
    }
  };

  const range = getTemperatureRange(unit);
  
  // Validate input
  const validateInput = () => {
    if (!inputValue || inputValue.trim() === "") {
      return { isValid: false, error: null };
    }
    
    const numValue = parseFloat(inputValue);
    if (isNaN(numValue)) {
      return { isValid: false, error: "Please enter a valid number" };
    }
    
    if (numValue < range.min || numValue > range.max) {
      return {
        isValid: false,
        error: `Temperature must be between ${range.min} and ${range.max} ${unit === "celsius" ? "°C" : "°F"}`,
      };
    }
    
    return { isValid: true, error: null };
  };

  const validation = validateInput();
  const isConfirmDisabled = !validation.isValid || !inputValue || inputValue.trim() === "";
  
  const displayValue =
    value !== null && value !== undefined
      ? `${convertFromBackendFormat(value, unit).toFixed(1)}°${unit === "celsius" ? "C" : "F"}`
      : "Select temperature";

  return (
    <View>
      <TouchableOpacity
        style={styles.temperatureButton}
        onPress={() => setShowPicker(true)}
      >
        <Text
          style={[
            styles.temperatureButtonText,
            !value && styles.placeholderText,
          ]}
        >
          {displayValue}
        </Text>
        <Ionicons name="thermometer-outline" size={20} color={colors.primary} />
      </TouchableOpacity>

      <Modal
        visible={showPicker}
        transparent
        animationType="fade"
        onRequestClose={handleCancel}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Basal Temperature</Text>
              <TouchableOpacity
                style={styles.unitToggle}
                onPress={toggleUnit}
              >
                <Text style={styles.unitToggleText}>
                  {unit === "celsius" ? "°C" : "°F"}
                </Text>
                <Ionicons
                  name="swap-horizontal"
                  size={16}
                  color={colors.primary}
                />
              </TouchableOpacity>
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>
                Temperature ({unit === "celsius" ? "°C" : "°F"})
              </Text>
              <TextInput
                style={[
                  styles.temperatureInput,
                  inputValue && !validation.isValid && styles.temperatureInputError,
                  inputValue && validation.isValid && styles.temperatureInputValid,
                ]}
                keyboardType="decimal-pad"
                placeholder={`${range.min} - ${range.max}`}
                value={inputValue}
                onChangeText={(text) => {
                  // Allow only numbers and one decimal point
                  const cleaned = text.replace(/[^0-9.]/g, "");
                  // Ensure only one decimal point
                  const parts = cleaned.split(".");
                  if (parts.length > 2) {
                    setInputValue(parts[0] + "." + parts.slice(1).join(""));
                  } else {
                    setInputValue(cleaned);
                  }
                }}
                autoFocus
              />
              {validation.error ? (
                <Text style={styles.errorText}>{validation.error}</Text>
              ) : (
                <Text style={styles.rangeText}>
                  Range: {range.min} - {range.max} {unit === "celsius" ? "°C" : "°F"}
                </Text>
              )}
            </View>

            {/* Clear button - only show if there's an existing value */}
            {value && (
              <TouchableOpacity
                style={styles.clearButton}
                onPress={handleClear}
              >
                <Ionicons name="close-circle" size={18} color={colors.error} />
                <Text style={styles.clearButtonText}>Clear Selection</Text>
              </TouchableOpacity>
            )}

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={handleCancel}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalButton,
                  styles.confirmButton,
                  isConfirmDisabled && styles.confirmButtonDisabled,
                ]}
                onPress={handleConfirm}
                disabled={isConfirmDisabled}
              >
                <Text
                  style={[
                    styles.confirmButtonText,
                    isConfirmDisabled && styles.confirmButtonTextDisabled,
                  ]}
                >
                  Confirm
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}, (prevProps, nextProps) => {
  return (
    prevProps.value === nextProps.value &&
    prevProps.onChange === nextProps.onChange
  );
});

TemperaturePickerOption.displayName = "TemperaturePickerOption";

const styles = StyleSheet.create({
  temperatureButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  temperatureButtonText: {
    fontSize: 16,
    color: colors.text,
  },
  placeholderText: {
    color: colors.textLight,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 20,
    width: "85%",
    maxWidth: 400,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: colors.text,
  },
  unitToggle: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: colors.surface,
    gap: 6,
  },
  unitToggleText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.primary,
  },
  inputContainer: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.text,
    marginBottom: 8,
  },
  temperatureInput: {
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
    fontSize: 24,
    fontWeight: "600",
    color: colors.text,
    textAlign: "center",
    marginBottom: 8,
  },
  temperatureInputError: {
    borderColor: colors.error,
    borderWidth: 2,
  },
  temperatureInputValid: {
    borderColor: colors.success,
    borderWidth: 2,
  },
  rangeText: {
    fontSize: 12,
    color: colors.textLight,
    textAlign: "center",
  },
  errorText: {
    fontSize: 12,
    color: colors.error,
    textAlign: "center",
    marginTop: 4,
  },
  clearButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    marginBottom: 12,
    gap: 6,
  },
  clearButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.error,
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  modalButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  cancelButton: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  confirmButton: {
    backgroundColor: colors.primary,
  },
  confirmButtonDisabled: {
    backgroundColor: colors.surface,
    opacity: 0.5,
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.text,
  },
  confirmButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.textOnPrimary,
  },
  confirmButtonTextDisabled: {
    color: colors.textLight,
  },
});

export default TemperaturePickerOption;

