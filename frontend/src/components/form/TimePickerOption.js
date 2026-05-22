import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
  Animated,
  Dimensions,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../../constants/colors";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");

const ITEM_HEIGHT = 52;
const VISIBLE_ITEMS = 5; // odd number so selection is centered
const DRUM_HEIGHT = ITEM_HEIGHT * VISIBLE_ITEMS;

// ----- Drum Column -----
const DrumColumn = React.memo(({ items, selectedIndex, onSelect, format }) => {
  const scrollRef = useRef(null);
  const [localIndex, setLocalIndex] = useState(selectedIndex);
  // Guard: prevent cascading snaps (scrollTo → event → scrollTo → crash)
  const isSnappingRef = useRef(false);

  // Snap to item on mount and when selectedIndex changes externally
  useEffect(() => {
    setLocalIndex(selectedIndex);
    // Use requestAnimationFrame so we don't snap while a previous snap is animating
    const raf = requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ y: selectedIndex * ITEM_HEIGHT, animated: false });
    });
    return () => cancelAnimationFrame(raf);
  }, [selectedIndex]);

  const snapToIndex = useCallback(
    (rawY) => {
      // Guard against re-entrant snaps
      if (isSnappingRef.current) return;

      // Clamp y to the valid scroll range before computing index
      const maxY = (items.length - 1) * ITEM_HEIGHT;
      const safeY = Math.max(0, Math.min(isFinite(rawY) ? rawY : 0, maxY));
      const index = Math.round(safeY / ITEM_HEIGHT);
      const clamped = Math.max(0, Math.min(index, items.length - 1));

      isSnappingRef.current = true;
      setLocalIndex(clamped);
      scrollRef.current?.scrollTo({ y: clamped * ITEM_HEIGHT, animated: true });
      onSelect(items[clamped]);

      // Release guard after the snap animation finishes (~300 ms)
      setTimeout(() => {
        isSnappingRef.current = false;
      }, 350);
    },
    [items, onSelect]
  );

  // Fired when momentum naturally ends — main snap handler
  const handleMomentumScrollEnd = useCallback(
    (e) => snapToIndex(e.nativeEvent.contentOffset.y),
    [snapToIndex]
  );

  // Fired when user lifts finger with no momentum (slow drag) — fallback snap
  const handleScrollEndDrag = useCallback(
    (e) => {
      // Only snap here if there will be no momentum event following this
      // We do this by checking velocity: if it's effectively zero, snap now.
      const vy = e.nativeEvent.velocity?.y ?? 0;
      if (Math.abs(vy) < 0.1) {
        snapToIndex(e.nativeEvent.contentOffset.y);
      }
      // Otherwise let onMomentumScrollEnd handle it
    },
    [snapToIndex]
  );

  const padding = Math.floor(VISIBLE_ITEMS / 2) * ITEM_HEIGHT;

  return (
    <View style={drumStyles.columnWrapper}>
      {/* Selection highlight window */}
      <View style={drumStyles.selectionWindow} pointerEvents="none" />

      {/* Top fade */}
      <View style={drumStyles.fadeTop} pointerEvents="none" />
      {/* Bottom fade */}
      <View style={drumStyles.fadeBottom} pointerEvents="none" />

      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_HEIGHT}
        decelerationRate="fast"
        bounces={false}
        overScrollMode="never"
        onMomentumScrollEnd={handleMomentumScrollEnd}
        onScrollEndDrag={handleScrollEndDrag}
        contentContainerStyle={{ paddingVertical: padding }}
        style={{ height: DRUM_HEIGHT }}
      >
        {items.map((item, idx) => {
          const isSelected = idx === localIndex;
          return (
            <TouchableOpacity
              key={item}
              style={drumStyles.drumItem}
              onPress={() => {
                setLocalIndex(idx);
                scrollRef.current?.scrollTo({ y: idx * ITEM_HEIGHT, animated: true });
                onSelect(item);
              }}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  drumStyles.drumItemText,
                  isSelected && drumStyles.drumItemTextSelected,
                ]}
              >
                {format ? format(item) : item}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
});

DrumColumn.displayName = "DrumColumn";

const drumStyles = StyleSheet.create({
  columnWrapper: {
    flex: 1,
    position: "relative",
    overflow: "hidden",
    borderRadius: 12,
  },
  selectionWindow: {
    position: "absolute",
    top: ITEM_HEIGHT * Math.floor(VISIBLE_ITEMS / 2),
    left: 0,
    right: 0,
    height: ITEM_HEIGHT,
    backgroundColor: colors.primaryLight + "28", // very subtle fill
    borderTopWidth: 1.5,
    borderBottomWidth: 1.5,
    borderColor: colors.primaryLight,
    borderRadius: 8,
    zIndex: 1,
  },
  fadeTop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: ITEM_HEIGHT * Math.floor(VISIBLE_ITEMS / 2),
    backgroundColor: "transparent",
    zIndex: 2,
    // Simulate gradient via nested views
  },
  fadeBottom: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: ITEM_HEIGHT * Math.floor(VISIBLE_ITEMS / 2),
    backgroundColor: "transparent",
    zIndex: 2,
  },
  drumItem: {
    height: ITEM_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
  },
  drumItemText: {
    fontSize: 20,
    fontWeight: "400",
    color: colors.textLight,
    letterSpacing: 0.5,
  },
  drumItemTextSelected: {
    fontSize: 24,
    fontWeight: "700",
    color: colors.text,
    letterSpacing: 0.3,
  },
});

// ----- Main Component -----
const TimePickerOption = React.memo(
  ({ value, onChange }) => {
    const [showPicker, setShowPicker] = useState(false);
    const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
    const backdropAnim = useRef(new Animated.Value(0)).current;

    // Internal state
    const [selectedHour, setSelectedHour] = useState(9);
    const [selectedMinute, setSelectedMinute] = useState(0);
    const [selectedPeriod, setSelectedPeriod] = useState("AM");

    // Derive display value
    const formatTime = (h, m, p) =>
      `${h}:${m.toString().padStart(2, "0")} ${p}`;

    const displayValue = value || null;

    // Parse existing value
    const parseValue = useCallback((val) => {
      if (!val) return { hour: 9, minute: 0, period: "AM" };
      const match = val.match(/(\d+):(\d+)\s*(AM|PM)/i);
      if (match) {
        return {
          hour: parseInt(match[1]),
          minute: parseInt(match[2]),
          period: match[3].toUpperCase(),
        };
      }
      return { hour: 9, minute: 0, period: "AM" };
    }, []);

    // Lists
    const hours = Array.from({ length: 12 }, (_, i) => i + 1);
    const minutes = Array.from({ length: 12 }, (_, i) => i * 5);
    const periods = ["AM", "PM"];

    const hourIndex = hours.indexOf(selectedHour);
    const minuteIndex = minutes.indexOf(selectedMinute);
    const periodIndex = periods.indexOf(selectedPeriod);

    const openPicker = () => {
      const parsed = parseValue(value);
      setSelectedHour(parsed.hour);
      setSelectedMinute(parsed.minute);
      setSelectedPeriod(parsed.period);
      setShowPicker(true);
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0,
          friction: 10,
          tension: 80,
          useNativeDriver: true,
        }),
        Animated.timing(backdropAnim, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start();
    };

    const closePicker = (save = false) => {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: SCREEN_HEIGHT,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(backdropAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setShowPicker(false);
        if (save) {
          onChange(formatTime(selectedHour, selectedMinute, selectedPeriod));
        }
      });
    };

    const handleClear = () => {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: SCREEN_HEIGHT,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(backdropAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setShowPicker(false);
        onChange(null);
      });
    };

    return (
      <View>
        {/* Trigger button */}
        <TouchableOpacity
          style={[styles.triggerButton, displayValue && styles.triggerButtonFilled]}
          onPress={openPicker}
          activeOpacity={0.8}
        >
          <View style={styles.triggerLeft}>
            <View style={[styles.iconCircle, displayValue && styles.iconCircleFilled]}>
              <Ionicons
                name="time-outline"
                size={18}
                color={displayValue ? "#fff" : colors.primary}
              />
            </View>
            <Text style={[styles.triggerText, !displayValue && styles.triggerPlaceholder]}>
              {displayValue || "Select time"}
            </Text>
          </View>
          <Ionicons
            name="chevron-forward"
            size={16}
            color={displayValue ? colors.primary : colors.textLight}
          />
        </TouchableOpacity>

        {/* Bottom Sheet Modal */}
        <Modal
          visible={showPicker}
          transparent
          animationType="none"
          onRequestClose={() => closePicker(false)}
          statusBarTranslucent
        >
          {/* Backdrop */}
          <Animated.View
            style={[styles.backdrop, { opacity: backdropAnim }]}
          >
            <TouchableOpacity
              style={{ flex: 1 }}
              activeOpacity={1}
              onPress={() => closePicker(false)}
            />
          </Animated.View>

          {/* Sheet */}
          <Animated.View
            style={[
              styles.sheet,
              { transform: [{ translateY: slideAnim }] },
            ]}
          >
            {/* Handle */}
            <View style={styles.sheetHandle} />

            {/* Header */}
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Select Time</Text>
              {displayValue && (
                <TouchableOpacity onPress={handleClear} style={styles.clearBtn}>
                  <Text style={styles.clearBtnText}>Clear</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Big time preview */}
            <View style={styles.previewRow}>
              <Text style={styles.previewTime}>
                {formatTime(selectedHour, selectedMinute, selectedPeriod)}
              </Text>
            </View>

            {/* Drum columns */}
            <View style={styles.drumRow}>
              {/* Column labels */}
              <View style={styles.columnLabels}>
                <Text style={styles.columnLabel}>Hour</Text>
                <Text style={styles.columnLabel}>Min</Text>
                <Text style={styles.columnLabel}>AM/PM</Text>
              </View>

              <View style={styles.drumContainer}>
                <DrumColumn
                  items={hours}
                  selectedIndex={Math.max(0, hourIndex)}
                  onSelect={(h) => setSelectedHour(h)}
                  format={(h) => String(h)}
                />

                <View style={styles.colonSeparator}>
                  <Text style={styles.colonText}>:</Text>
                </View>

                <DrumColumn
                  items={minutes}
                  selectedIndex={Math.max(0, minuteIndex)}
                  onSelect={(m) => setSelectedMinute(m)}
                  format={(m) => m.toString().padStart(2, "0")}
                />

                <View style={styles.colonSeparator} />

                <DrumColumn
                  items={periods}
                  selectedIndex={Math.max(0, periodIndex)}
                  onSelect={(p) => setSelectedPeriod(p)}
                />
              </View>
            </View>

            {/* Actions */}
            <View style={styles.actions}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => closePicker(false)}
                activeOpacity={0.8}
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.confirmButton}
                onPress={() => closePicker(true)}
                activeOpacity={0.85}
              >
                <Ionicons name="checkmark" size={18} color="#fff" style={{ marginRight: 6 }} />
                <Text style={styles.confirmText}>Done</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </Modal>
      </View>
    );
  },
  (prev, next) =>
    prev.value === next.value && prev.onChange === next.onChange
);

TimePickerOption.displayName = "TimePickerOption";

const styles = StyleSheet.create({
  // Trigger button
  triggerButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FAFAF8",
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderWidth: 1.5,
    borderColor: "#DDE8CC",
  },
  triggerButtonFilled: {
    borderColor: colors.primaryLight,
    backgroundColor: colors.primaryLight + "18",
  },
  triggerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  iconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.primaryLight + "30",
    alignItems: "center",
    justifyContent: "center",
  },
  iconCircleFilled: {
    backgroundColor: colors.primary,
  },
  triggerText: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.text,
  },
  triggerPlaceholder: {
    color: colors.textLight,
    fontWeight: "400",
    fontStyle: "italic",
  },

  // Modal
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  sheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#FFFCF7",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: Platform.OS === "ios" ? 36 : 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 24,
  },
  sheetHandle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#DDE8CC",
    marginTop: 12,
    marginBottom: 4,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingVertical: 16,
    position: "relative",
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.text,
    letterSpacing: 0.2,
  },
  clearBtn: {
    position: "absolute",
    right: 24,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: colors.error + "15",
  },
  clearBtnText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.error,
  },

  // Preview
  previewRow: {
    alignItems: "center",
    marginBottom: 8,
  },
  previewTime: {
    fontSize: 42,
    fontWeight: "300",
    color: colors.primary,
    letterSpacing: 2,
  },

  // Drum
  drumRow: {
    paddingHorizontal: 24,
    marginBottom: 24,
  },
  columnLabels: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingHorizontal: 12,
    marginBottom: 6,
  },
  columnLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.textLight,
    textTransform: "uppercase",
    letterSpacing: 1,
    flex: 1,
    textAlign: "center",
  },
  drumContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#DDE8CC",
    paddingHorizontal: 8,
    overflow: "hidden",
  },
  colonSeparator: {
    width: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  colonText: {
    fontSize: 24,
    fontWeight: "300",
    color: colors.textLight,
  },

  // Actions
  actions: {
    flexDirection: "row",
    paddingHorizontal: 24,
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F0EDE6",
    borderWidth: 1,
    borderColor: "#DDE8CC",
  },
  cancelText: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.textSecondary,
  },
  confirmButton: {
    flex: 2,
    flexDirection: "row",
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary,
  },
  confirmText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#fff",
    letterSpacing: 0.3,
  },
});

export default TimePickerOption;
