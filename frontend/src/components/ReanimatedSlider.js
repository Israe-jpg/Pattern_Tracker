import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
} from "react-native-reanimated";
import {
  GestureDetector,
  Gesture,
  GestureHandlerRootView,
} from "react-native-gesture-handler";

const SLIDER_WIDTH = 300; // Adjust based on your needs
const THUMB_SIZE = 24;

export const ReanimatedSlider = ({
  minValue = 0,
  maxValue = 10,
  value = 0,
  onValueChange,
  step = 1,
  minimumTrackTintColor = "#007AFF",
  maximumTrackTintColor = "#E5E5EA",
  thumbTintColor = "#007AFF",
}) => {
  const [sliderWidth, setSliderWidth] = useState(SLIDER_WIDTH);
  const sliderWidthShared = useSharedValue(SLIDER_WIDTH);

  // Calculate initial position - inline calculation
  const getInitialPosition = () => {
    if (sliderWidth === 0) return 0;
    return ((value - minValue) / (maxValue - minValue)) * sliderWidth;
  };

  const translationX = useSharedValue(getInitialPosition());

  // Update position when value changes externally
  useEffect(() => {
    if (sliderWidth > 0) {
      const newPosition =
        ((value - minValue) / (maxValue - minValue)) * sliderWidth;
      translationX.value = withSpring(newPosition);
    }
  }, [value, sliderWidth]);

  // Update slider width shared value when layout changes
  useEffect(() => {
    sliderWidthShared.value = sliderWidth;
  }, [sliderWidth]);

  const startX = useSharedValue(0);

  const pan = Gesture.Pan()
    .onStart(() => {
      "worklet";
      startX.value = translationX.value;
    })
    .onUpdate((event) => {
      "worklet";
      const width = sliderWidthShared.value;
      if (width === 0) return;
      const newValue = startX.value + event.translationX;
      translationX.value = Math.max(0, Math.min(width, newValue));
    })
    .onEnd(() => {
      "worklet";
      const width = sliderWidthShared.value;
      if (width === 0) return;

      // Calculate value from position (inline in worklet)
      const percentage = translationX.value / width;
      const rawValue = minValue + percentage * (maxValue - minValue);
      const newValue = Math.round(rawValue / step) * step;

      // Calculate position from value (inline in worklet)
      const newPosition =
        ((newValue - minValue) / (maxValue - minValue)) * width;
      translationX.value = withSpring(newPosition);

      if (onValueChange) {
        runOnJS(onValueChange)(newValue);
      }
    });

  const thumbStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateX: translationX.value }],
    };
  });

  const activeTrackStyle = useAnimatedStyle(() => {
    return {
      width: translationX.value,
    };
  });

  return (
    <GestureHandlerRootView style={styles.container}>
      <View
        onLayout={(event) => {
          const { width } = event.nativeEvent.layout;
          setSliderWidth(width - THUMB_SIZE);
        }}
        style={{ flex: 1 }}
      >
        <View style={styles.sliderContainer}>
          <View
            style={[styles.track, { backgroundColor: maximumTrackTintColor }]}
          />
          <Animated.View
            style={[
              styles.activeTrack,
              { backgroundColor: minimumTrackTintColor },
              activeTrackStyle,
            ]}
          />
          <GestureDetector gesture={pan}>
            <Animated.View
              style={[
                styles.thumb,
                { backgroundColor: thumbTintColor },
                thumbStyle,
              ]}
            />
          </GestureDetector>
        </View>
      </View>
    </GestureHandlerRootView>
  );
};

const styles = StyleSheet.create({
  container: {
    width: "100%",
    height: 40,
    justifyContent: "center",
  },
  sliderContainer: {
    height: 4,
    position: "relative",
    justifyContent: "center",
  },
  track: {
    height: 4,
    borderRadius: 2,
    width: "100%",
  },
  activeTrack: {
    height: 4,
    borderRadius: 2,
    position: "absolute",
    left: 0,
  },
  thumb: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    position: "absolute",
    top: -10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
});
