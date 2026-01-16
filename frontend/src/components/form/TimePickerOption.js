import React, { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../../constants/colors";

const TimePickerOption = React.memo(({ value, onChange }) => {
  const [showPicker, setShowPicker] = useState(false);
  const [selectedHour, setSelectedHour] = useState(9);
  const [selectedMinute, setSelectedMinute] = useState(0);
  const [selectedPeriod, setSelectedPeriod] = useState("AM");
  const [hasInteracted, setHasInteracted] = useState(false);

  // Parse existing value if present
  React.useEffect(() => {
    if (value) {
      const match = value.match(/(\d+):(\d+)\s*(AM|PM)/i);
      if (match) {
        setSelectedHour(parseInt(match[1]));
        setSelectedMinute(parseInt(match[2]));
        setSelectedPeriod(match[3].toUpperCase());
        setHasInteracted(true); // User has a saved value
      }
    } else {
      // Reset to defaults when no value
      setSelectedHour(9);
      setSelectedMinute(0);
      setSelectedPeriod("AM");
      setHasInteracted(false);
    }
  }, [value]);

  // Reset interaction state when modal opens
  React.useEffect(() => {
    if (showPicker) {
      setHasInteracted(!!value); // If there's a value, user has interacted
    }
  }, [showPicker, value]);

  const formatTime = (hour, minute, period) => {
    // Format: "H:MM AM/PM" or "HH:MM AM/PM" (single digit hour is allowed)
    const h = hour.toString(); // Don't pad hour - allows 1-12
    const m = minute.toString().padStart(2, '0');
    return `${h}:${m} ${period}`;
  };

  const validateTime = () => {
    // Check if hour, minute, and period are all valid
    if (!selectedHour || selectedHour < 1 || selectedHour > 12) {
      return { isValid: false, error: "Please select a valid hour" };
    }
    if (selectedMinute === null || selectedMinute === undefined || selectedMinute < 0 || selectedMinute > 59) {
      return { isValid: false, error: "Please select a valid minute" };
    }
    if (!selectedPeriod || !["AM", "PM"].includes(selectedPeriod)) {
      return { isValid: false, error: "Please select AM or PM" };
    }
    return { isValid: true, error: null };
  };

  const handleSelection = (type, newValue) => {
    setHasInteracted(true);
    if (type === "hour") {
      setSelectedHour(newValue);
    } else if (type === "minute") {
      setSelectedMinute(newValue);
    } else if (type === "period") {
      setSelectedPeriod(newValue);
    }
  };

  const handleConfirm = () => {
    if (isConfirmDisabled) {
      return; // Don't proceed if validation fails
    }
    const timeString = formatTime(selectedHour, selectedMinute, selectedPeriod);
    onChange(timeString);
    setShowPicker(false);
  };

  const handleClear = () => {
    onChange(null);
    setShowPicker(false);
  };

  const handleCancel = () => {
    // Reset to original values
    if (value) {
      const match = value.match(/(\d+):(\d+)\s*(AM|PM)/i);
      if (match) {
        setSelectedHour(parseInt(match[1]));
        setSelectedMinute(parseInt(match[2]));
        setSelectedPeriod(match[3].toUpperCase());
      }
    } else {
      setSelectedHour(9);
      setSelectedMinute(0);
      setSelectedPeriod("AM");
    }
    setHasInteracted(!!value);
    setShowPicker(false);
  };

  const validation = validateTime();
  const isConfirmDisabled = !hasInteracted || !validation.isValid;

  const displayValue = value || "Select time";

  // Generate arrays for picker
  const hours = Array.from({ length: 12 }, (_, i) => i + 1);
  const minutes = Array.from({ length: 12 }, (_, i) => i * 5); // 0, 5, 10, 15, ..., 55
  const periods = ["AM", "PM"];

  return (
    <View>
      <TouchableOpacity
        style={styles.timeButton}
        onPress={() => setShowPicker(true)}
      >
        <Text style={[styles.timeButtonText, !value && styles.placeholderText]}>
          {displayValue}
        </Text>
        <Ionicons name="time-outline" size={20} color={colors.primary} />
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
              <Text style={styles.modalTitle}>Select Time</Text>
            </View>

            <View style={styles.pickerContainer}>
              {/* Hours */}
              <View style={styles.pickerColumn}>
                <Text style={styles.pickerLabel}>Hour</Text>
                <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
                  {hours.map((hour) => (
                    <TouchableOpacity
                      key={hour}
                      style={[
                        styles.pickerItem,
                        selectedHour === hour && styles.pickerItemSelected,
                      ]}
                      onPress={() => handleSelection("hour", hour)}
                    >
                      <Text
                        style={[
                          styles.pickerItemText,
                          selectedHour === hour && styles.pickerItemTextSelected,
                        ]}
                      >
                        {hour}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              {/* Minutes */}
              <View style={styles.pickerColumn}>
                <Text style={styles.pickerLabel}>Min</Text>
                <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
                  {minutes.map((minute) => (
                    <TouchableOpacity
                      key={minute}
                      style={[
                        styles.pickerItem,
                        selectedMinute === minute && styles.pickerItemSelected,
                      ]}
                      onPress={() => handleSelection("minute", minute)}
                    >
                      <Text
                        style={[
                          styles.pickerItemText,
                          selectedMinute === minute && styles.pickerItemTextSelected,
                        ]}
                      >
                        {minute.toString().padStart(2, '0')}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              {/* AM/PM */}
              <View style={styles.pickerColumn}>
                <Text style={styles.pickerLabel}>Period</Text>
                <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
                  {periods.map((period) => (
                    <TouchableOpacity
                      key={period}
                      style={[
                        styles.pickerItem,
                        selectedPeriod === period && styles.pickerItemSelected,
                      ]}
                      onPress={() => handleSelection("period", period)}
                    >
                      <Text
                        style={[
                          styles.pickerItemText,
                          selectedPeriod === period && styles.pickerItemTextSelected,
                        ]}
                      >
                        {period}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            </View>

            {/* Preview of selected time */}
            <View style={styles.previewContainer}>
              <Text style={styles.previewLabel}>Selected Time:</Text>
              <Text style={styles.previewTime}>
                {formatTime(selectedHour, selectedMinute, selectedPeriod)}
              </Text>
              {validation.error && (
                <Text style={styles.errorText}>{validation.error}</Text>
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
  return prevProps.value === nextProps.value && prevProps.onChange === nextProps.onChange;
});

TimePickerOption.displayName = "TimePickerOption";

const styles = StyleSheet.create({
  timeButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  timeButtonText: {
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
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: colors.text,
    textAlign: "center",
  },
  pickerContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 20,
    height: 200,
  },
  pickerColumn: {
    flex: 1,
    marginHorizontal: 4,
  },
  pickerLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.text,
    textAlign: "center",
    marginBottom: 8,
  },
  scrollView: {
    maxHeight: 180,
  },
  pickerItem: {
    padding: 12,
    alignItems: "center",
    borderRadius: 8,
    marginBottom: 4,
  },
  pickerItemSelected: {
    backgroundColor: colors.primary,
  },
  pickerItemText: {
    fontSize: 16,
    color: colors.text,
  },
  pickerItemTextSelected: {
    color: colors.textOnPrimary,
    fontWeight: "600",
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
  previewContainer: {
    marginBottom: 20,
    alignItems: "center",
  },
  previewLabel: {
    fontSize: 12,
    color: colors.textLight,
    marginBottom: 4,
  },
  previewTime: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.primary,
  },
  errorText: {
    fontSize: 12,
    color: colors.error,
    marginTop: 4,
    textAlign: "center",
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

export default TimePickerOption;

