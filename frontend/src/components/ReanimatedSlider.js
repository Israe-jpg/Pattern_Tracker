import React, { useState, useEffect, useRef, useCallback } from "react";
import { View, StyleSheet, Platform } from "react-native";
import Slider from "@react-native-community/slider";

let instanceCounter = 0;

export const ReanimatedSlider = React.memo(
  ({
    minValue = 0,
    maxValue = 10,
    value = 0,
    onValueChange,
    step = 1,
    minimumTrackTintColor = "#007AFF",
    maximumTrackTintColor = "#E5E5EA",
    thumbTintColor = "#007AFF",
  }) => {
    const instanceIdRef = useRef(`slider-${instanceCounter++}`);

    // ✅ FIX #1: Round initial value to step
    const [currentValue, setCurrentValue] = useState(() => {
      const initialValue =
        typeof value === "number" && !isNaN(value) ? value : minValue;
      return Math.round(initialValue / step) * step;
    });

    const isDraggingRef = useRef(false);
    const lastExternalValueRef = useRef(value);
    const isGesturingRef = useRef(false);

    // Initialize on mount
    useEffect(() => {
      const initialValue =
        typeof value === "number" && !isNaN(value) ? value : minValue;
      const roundedValue = Math.round(initialValue / step) * step;
      setCurrentValue(roundedValue);
      lastExternalValueRef.current = roundedValue;
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
      if (isGesturingRef.current) return;

      const numValue =
        typeof value === "number" && !isNaN(value) ? value : minValue;
      const roundedValue = Math.round(numValue / step) * step;

      if (Math.abs(lastExternalValueRef.current - roundedValue) >= step / 2) {
        setCurrentValue(roundedValue);
        lastExternalValueRef.current = roundedValue;
      }
    }, [value, minValue, step]);

    const onValueChangeRef = useRef(onValueChange);
    useEffect(() => {
      onValueChangeRef.current = onValueChange;
    }, [onValueChange]);

    const handleValueChange = useCallback(
      (newValue) => {
        const roundedValue = Math.round(newValue / step) * step;
        setCurrentValue(roundedValue);
        lastExternalValueRef.current = roundedValue;

        if (onValueChangeRef.current) {
          onValueChangeRef.current(roundedValue);
        }
      },
      [step]
    );

    const handleSlidingStart = useCallback(() => {
      isGesturingRef.current = true;
      isDraggingRef.current = true;
    }, []);

    const handleSlidingComplete = useCallback(
      (newValue) => {
        const roundedValue = Math.round(newValue / step) * step;
        lastExternalValueRef.current = roundedValue;

        isDraggingRef.current = false;
        isGesturingRef.current = false;

        setCurrentValue(roundedValue);

        if (onValueChangeRef.current) {
          onValueChangeRef.current(roundedValue);
        }
      },
      [step]
    );

    return (
      <View
        style={styles.wrapper}
        collapsable={false}
        // ✅ iOS FIX: Prevent parent ScrollView from intercepting touches
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderTerminationRequest={() => false}
      >
        <Slider
          style={styles.slider}
          minimumValue={minValue}
          maximumValue={maxValue}
          value={Math.max(minValue, Math.min(maxValue, currentValue))}
          step={step}
          onValueChange={handleValueChange}
          onSlidingStart={handleSlidingStart}
          onSlidingComplete={handleSlidingComplete}
          minimumTrackTintColor={minimumTrackTintColor}
          maximumTrackTintColor={maximumTrackTintColor}
          thumbTintColor={thumbTintColor}
          disabled={false}
          // ✅ iOS FIX: Critical iOS-specific props
          {...(Platform.OS === "ios" && {
            tapToSeek: true,
          })}
        />
      </View>
    );
  },
  (prevProps, nextProps) => {
    const prevRounded =
      Math.round((prevProps.value ?? 0) / (prevProps.step || 1)) *
      (prevProps.step || 1);
    const nextRounded =
      Math.round((nextProps.value ?? 0) / (nextProps.step || 1)) *
      (nextProps.step || 1);

    if (Math.abs(prevRounded - nextRounded) >= (prevProps.step || 1) / 2) {
      return false;
    }

    return (
      prevProps.minValue === nextProps.minValue &&
      prevProps.maxValue === nextProps.maxValue &&
      prevProps.step === nextProps.step &&
      prevProps.onValueChange === nextProps.onValueChange &&
      prevProps.minimumTrackTintColor === nextProps.minimumTrackTintColor &&
      prevProps.maximumTrackTintColor === nextProps.maximumTrackTintColor &&
      prevProps.thumbTintColor === nextProps.thumbTintColor
    );
  }
);

const styles = StyleSheet.create({
  wrapper: {
    width: "100%",
    justifyContent: "center",
    alignItems: "center",
    minHeight: 50,
    paddingHorizontal: 5,
    paddingVertical: 5,
  },
  slider: {
    width: "100%",
    height: 40,
    minHeight: 40,
  },
});
