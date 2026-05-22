import React, { useState, useEffect, useRef } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { ReanimatedSlider } from "../ReanimatedSlider";
import { colors } from "../../constants/colors";

// Interpolate: sage-light (#A3B68A) → deep-green (#354A2F)
const interpolateColor = (ratio) => {
  const s = { r: 163, g: 182, b: 138 };
  const e = { r: 53, g: 74, b: 47 };
  return `rgb(${Math.round(s.r + (e.r - s.r) * ratio)},${Math.round(
    s.g + (e.g - s.g) * ratio
  )},${Math.round(s.b + (e.b - s.b) * ratio)})`;
};

const SliderOption = React.memo(
  ({ sliderId, minValue, maxValue, value, onChange, lowLabel, highLabel }) => {
    const min = minValue ?? 0;
    const max = maxValue ?? 10;

    const isSet = value !== null && value !== undefined;

    // Slider internal range: min-1 (= "not set") to max
    const sliderMin = min - 1;
    const sliderMax = max;

    const [sliderPosition, setSliderPosition] = useState(
      isSet ? value : sliderMin
    );

    // Sync when external value changes (e.g. form reset)
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

    const onChangeRef = useRef(onChange);
    useEffect(() => {
      onChangeRef.current = onChange;
    }, [onChange]);

    const handleValueChange = React.useCallback(
      (newPosition) => {
        setSliderPosition(newPosition);
        const actual = newPosition <= sliderMin ? null : newPosition;
        if (onChangeRef.current) onChangeRef.current(actual);
      },
      [sliderMin]
    );

    const handleClear = () => {
      setSliderPosition(sliderMin);
      if (onChangeRef.current) onChangeRef.current(null);
    };

    const isAtNotSet = sliderPosition <= sliderMin;
    const ratio = isAtNotSet
      ? 0
      : (sliderPosition - min) / Math.max(max - min, 1);
    const activeColor = isAtNotSet ? colors.border : interpolateColor(ratio);

    // Tick marks — up to 11
    const tickCount = Math.min(max - min + 1, 11);
    const ticks = Array.from({ length: tickCount }, (_, i) =>
      Math.round(min + (i * (max - min)) / Math.max(tickCount - 1, 1))
    );

    return (
      <View style={styles.container}>
        {/* Value row: badge on left, clear on far right */}
        <View style={styles.valueRow}>
          {isAtNotSet ? (
            <View style={styles.notSetPill}>
              <Text style={styles.notSetText}>Not set</Text>
            </View>
          ) : (
            <View style={[styles.valueBadge, { backgroundColor: activeColor }]}>
              <Text style={styles.valueNumber}>
                {Math.round(sliderPosition)}
              </Text>
            </View>
          )}

          <View style={{ flex: 1 }} />

          {!isAtNotSet && (
            <TouchableOpacity
              style={styles.clearButton}
              onPress={handleClear}
              activeOpacity={0.7}
            >
              <Text style={styles.clearText}>Clear</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Slider */}
        <View style={styles.sliderWrapper}>
          <ReanimatedSlider
            minValue={sliderMin}
            maxValue={sliderMax}
            value={sliderPosition}
            onValueChange={handleValueChange}
            step={1}
            minimumTrackTintColor={activeColor}
            maximumTrackTintColor="#DDE8CC"
            thumbTintColor={isAtNotSet ? "#DDE8CC" : activeColor}
          />
        </View>

        {/* Tick marks */}
        <View style={styles.tickRow}>
          {ticks.map((tick, i) => (
            <View key={i} style={styles.tickItem}>
              <View
                style={[
                  styles.tick,
                  !isAtNotSet && tick <= Math.round(sliderPosition)
                    ? { backgroundColor: activeColor }
                    : { backgroundColor: "#DDE8CC" },
                ]}
              />
            </View>
          ))}
        </View>

        {/* Min / Max labels */}
        <View style={styles.labelsRow}>
          <Text style={styles.labelMin}>
            {lowLabel ? `${min} · ${lowLabel}` : String(min)}
          </Text>
          <Text style={styles.labelMax}>
            {highLabel ? `${max} · ${highLabel}` : String(max)}
          </Text>
        </View>
      </View>
    );
  },
  (prev, next) =>
    prev.minValue === next.minValue &&
    prev.maxValue === next.maxValue &&
    prev.value === next.value &&
    prev.onChange === next.onChange &&
    prev.lowLabel === next.lowLabel &&
    prev.highLabel === next.highLabel
);

SliderOption.displayName = "SliderOption";

const styles = StyleSheet.create({
  container: {
    marginTop: 4,
  },
  valueRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    minHeight: 36,
  },
  valueBadge: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    minWidth: 48,
    alignItems: "center",
  },
  valueNumber: {
    fontSize: 22,
    fontWeight: "800",
    color: "#FFFFFF",
    lineHeight: 26,
  },
  notSetPill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: "#F0EDE6",
    borderWidth: 1,
    borderColor: "#DDE8CC",
  },
  notSetText: {
    fontSize: 14,
    fontWeight: "500",
    color: colors.textLight,
    fontStyle: "italic",
  },
  clearButton: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 10,
    backgroundColor: colors.error + "15",
  },
  clearText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.error,
  },
  sliderWrapper: {
    marginHorizontal: -4,
  },
  tickRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    marginTop: 2,
  },
  tickItem: {
    alignItems: "center",
  },
  tick: {
    width: 2,
    height: 6,
    borderRadius: 1,
  },
  labelsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    marginTop: 6,
  },
  labelMin: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.textLight,
  },
  labelMax: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.textLight,
  },
});

export default SliderOption;
