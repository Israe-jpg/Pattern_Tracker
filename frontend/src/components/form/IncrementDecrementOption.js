import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../../constants/colors";

const IncrementDecrementOption = React.memo(
  ({ value, onChange, minValue = 0, maxValue = 24, step = 0.5 }) => {
    const [hasInteracted, setHasInteracted] = React.useState(
      value !== null && value !== undefined
    );

    // Update interaction state when value changes externally (e.g., form reset)
    React.useEffect(() => {
      setHasInteracted(value !== null && value !== undefined);
    }, [value]);

    // Default display value is 7 if not set, otherwise use actual value
    const displayValue = value === null || value === undefined ? 7 : value;

    const handleIncrement = () => {
      setHasInteracted(true); // Mark as interacted
      const newValue = (displayValue + step).toFixed(1);
      const numValue = parseFloat(newValue);

      // Check max limit
      if (numValue > maxValue) {
        return; // Don't go above max
      }

      onChange(numValue);
    };

    const handleDecrement = () => {
      setHasInteracted(true); // Mark as interacted
      const newValue = (displayValue - step).toFixed(1);
      const numValue = parseFloat(newValue);

      // Check min limit
      if (numValue < minValue) {
        onChange(null);
        setHasInteracted(false);
        return;
      }

      onChange(numValue);
    };

    const handleReset = () => {
      onChange(null);
      setHasInteracted(false);
    };

    // Check if we're at limits based on current display value
    const isAtMin = displayValue <= minValue;
    const isAtMax = displayValue >= maxValue;
    const hasValue = value !== null && value !== undefined;

    return (
      <View style={styles.container}>
        <View style={styles.controlsRow}>
          {/* Minus button on the left */}
          <TouchableOpacity
            style={[styles.button, isAtMin && styles.buttonDisabled]}
            onPress={handleDecrement}
            disabled={isAtMin}
          >
            <Ionicons
              name="remove"
              size={20}
              color={isAtMin ? colors.textLight : "#FFFFFF"}
            />
          </TouchableOpacity>

          {/* Display value square in the middle */}
          <View style={styles.valueContainer}>
            <Text style={styles.valueText}>
              {displayValue === 0 ? "0" : displayValue.toFixed(1)}
            </Text>
            <Text style={styles.unitText}>hrs</Text>
          </View>

          {/* Plus button on the right */}
          <TouchableOpacity
            style={[styles.button, isAtMax && styles.buttonDisabled]}
            onPress={handleIncrement}
            disabled={isAtMax}
          >
            <Ionicons
              name="add"
              size={20}
              color={isAtMax ? colors.textLight : "#FFFFFF"}
            />
          </TouchableOpacity>
        </View>

        {/* Reset button - only show if user has interacted */}
        {hasInteracted && (
          <TouchableOpacity style={styles.resetButton} onPress={handleReset}>
            <Ionicons name="refresh" size={14} color={colors.textLight} />
            <Text style={styles.resetButtonText}>Reset</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  },
  (prevProps, nextProps) => {
    return (
      prevProps.value === nextProps.value &&
      prevProps.onChange === nextProps.onChange &&
      prevProps.minValue === nextProps.minValue &&
      prevProps.maxValue === nextProps.maxValue &&
      prevProps.step === nextProps.step
    );
  }
);

IncrementDecrementOption.displayName = "IncrementDecrementOption";

const styles = StyleSheet.create({
  container: {
    width: "100%",
  },
  controlsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  valueContainer: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#D2E2EC", // Blueish background
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 50,
  },
  button: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.slider, // Blueish background
    borderWidth: 1,
    borderColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonDisabled: {
    borderColor: colors.border,
    backgroundColor: colors.background,
    opacity: 0.5,
  },
  valueText: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.text,
  },
  unitText: {
    fontSize: 10,
    fontWeight: "500",
    color: colors.textLight,
    marginTop: 2,
  },
  resetButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
    paddingVertical: 6,
    gap: 4,
  },
  resetButtonText: {
    fontSize: 12,
    fontWeight: "500",
    color: colors.textLight,
  },
});

export default IncrementDecrementOption;
