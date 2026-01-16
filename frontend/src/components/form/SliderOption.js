import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet } from "react-native";
import { ReanimatedSlider } from "../ReanimatedSlider";
import { colors } from "../../constants/colors";

const SliderOption = React.memo(
  ({ sliderId, minValue, maxValue, value, onChange }) => {
    // Track if slider has been set (not null)
    const isSet = value !== null && value !== undefined;

    // Slider internal range: minValue-1 to maxValue
    // minValue-1 = "not set", minValue onwards = actual values
    const sliderMin = minValue - 1;
    const sliderMax = maxValue;

    // Internal slider position (includes the "not set" position)
    const [sliderPosition, setSliderPosition] = useState(
      isSet ? value : sliderMin
    );

    // Update slider position when external value changes (form reset scenario)
    useEffect(() => {
      if (
        value !== null &&
        value !== undefined &&
        typeof value === "number" &&
        !isNaN(value)
      ) {
        setSliderPosition(value);
      } else {
        setSliderPosition(sliderMin);
      }
    }, [value, sliderMin]);

    // Use ref to store onChange to prevent recreation
    const onChangeRef = React.useRef(onChange);
    React.useEffect(() => {
      onChangeRef.current = onChange;
    }, [onChange]);

    // Handle slider change
    const handleValueChange = React.useCallback(
      (newPosition) => {
        setSliderPosition(newPosition);

        // If at the leftmost position (sliderMin), set to null
        // Otherwise, use the actual value
        const actualValue = newPosition <= sliderMin ? null : newPosition;

        if (onChangeRef.current) {
          onChangeRef.current(actualValue);
        }
      },
      [sliderMin]
    );

    // Check if currently at "not set" position
    const isAtNotSetPosition = sliderPosition <= sliderMin;

    return (
      <View style={styles.sliderContainer}>
        <View style={styles.valueRow}>
          {isAtNotSetPosition ? (
            <Text style={styles.sliderValuePlaceholder}>Not set</Text>
          ) : (
            <Text style={styles.sliderValueDisplay}>
              {Math.round(sliderPosition)}
            </Text>
          )}
        </View>
        <ReanimatedSlider
          minValue={sliderMin}
          maxValue={sliderMax}
          value={sliderPosition}
          onValueChange={handleValueChange}
          step={1}
          minimumTrackTintColor={
            isAtNotSetPosition ? colors.surface : colors.primary
          }
          maximumTrackTintColor={colors.surface}
          thumbTintColor={isAtNotSetPosition ? colors.border : colors.primary}
        />
        <View style={styles.sliderLabels}>
          <Text style={styles.sliderLabel}>{minValue}</Text>
          <Text style={styles.sliderLabel}>{maxValue}</Text>
        </View>
      </View>
    );
  },
  (prevProps, nextProps) => {
    // Only re-render if value or callbacks changed
    return (
      prevProps.minValue === nextProps.minValue &&
      prevProps.maxValue === nextProps.maxValue &&
      prevProps.value === nextProps.value &&
      prevProps.onChange === nextProps.onChange
    );
  }
);

SliderOption.displayName = "SliderOption";

const styles = StyleSheet.create({
  sliderContainer: {
    marginTop: 4,
  },
  valueRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
    minHeight: 28,
  },
  sliderValueDisplay: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.primary,
  },
  sliderValuePlaceholder: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.textLight,
    fontStyle: "italic",
  },
  sliderLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 6,
    paddingHorizontal: 4,
  },
  sliderLabel: {
    fontSize: 11,
    color: colors.textLight,
    fontWeight: "500",
  },
});

export default SliderOption;
