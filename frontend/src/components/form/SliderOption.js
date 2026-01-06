import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet } from "react-native";
import { ReanimatedSlider } from "../ReanimatedSlider";
import { colors } from "../../constants/colors";

const SliderOption = React.memo(({ sliderId, minValue, maxValue, value, onChange }) => {
  // Display value for real-time updates
  const [displayValue, setDisplayValue] = useState(value ?? minValue);
  
  // Update display value when external value changes (form reset scenario)
  useEffect(() => {
    const numValue = typeof value === "number" && !isNaN(value) ? value : minValue;
    setDisplayValue(numValue);
  }, [value, minValue]);

  // Use ref to store onChange to prevent recreation
  const onChangeRef = React.useRef(onChange);
  React.useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // Handle value change in real-time (updates display immediately)
  const handleValueChange = React.useCallback(
    (newValue) => {
      setDisplayValue(newValue);
      // Also update React Hook Form in real-time
      if (onChangeRef.current) {
        onChangeRef.current(newValue);
      }
    },
    [] // Empty deps - onChangeRef is stable
  );

  return (
    <View style={styles.sliderContainer}>
      <Text style={styles.sliderValueDisplay}>{Math.round(displayValue)}</Text>
      <ReanimatedSlider
        minValue={minValue}
        maxValue={maxValue}
        value={value ?? minValue}
        onValueChange={handleValueChange}
        step={1}
        minimumTrackTintColor={colors.primary}
        maximumTrackTintColor={colors.background}
        thumbTintColor={colors.primary}
      />
      <View style={styles.sliderLabels}>
        <Text style={styles.sliderLabel}>{minValue}</Text>
        <Text style={styles.sliderLabel}>{maxValue}</Text>
      </View>
    </View>
  );
}, (prevProps, nextProps) => {
  // Only re-render if value or callbacks changed
  return (
    prevProps.minValue === nextProps.minValue &&
    prevProps.maxValue === nextProps.maxValue &&
    prevProps.value === nextProps.value &&
    prevProps.onChange === nextProps.onChange
  );
});

SliderOption.displayName = "SliderOption";

const styles = StyleSheet.create({
  sliderContainer: {
    marginTop: 8,
  },
  sliderValueDisplay: {
    fontSize: 24,
    fontWeight: "600",
    color: colors.primary,
    textAlign: "center",
    marginBottom: 12,
  },
  sliderLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 8,
  },
  sliderLabel: {
    fontSize: 12,
    color: colors.textOnSecondary,
    fontWeight: "500",
  },
});

export default SliderOption;

