import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, TextInput } from "react-native";
import { colors } from "../../constants/colors";
import SliderOption from "./SliderOption";
import ChoiceOption from "./ChoiceOption";

const FormOption = React.memo(({ field, option, value, onChange }) => {
  const optionLabel = option.display_label || option.option_name;

  switch (option.option_type) {
    case "rating":
      const sliderId = `${field.field_name}-${option.option_name}`;
      return (
        <View style={styles.optionContainer}>
          <Text style={styles.optionLabel}>{optionLabel}</Text>
          <SliderOption
            sliderId={sliderId}
            minValue={option.min_value || 0}
            maxValue={option.max_value || 10}
            value={value}
            onChange={onChange}
          />
        </View>
      );

    case "yes_no":
    case "single_choice":
    case "multiple_choice":
      return (
        <View style={styles.optionContainer}>
          <Text style={styles.optionLabel}>{optionLabel}</Text>
          <ChoiceOption
            option={option}
            value={value}
            onChange={onChange}
          />
        </View>
      );

    case "number_input":
      return (
        <View style={styles.optionContainer}>
          <Text style={styles.optionLabel}>{optionLabel}</Text>
          <TextInput
            style={styles.numberInput}
            keyboardType="numeric"
            placeholder={option.placeholder || `Enter ${optionLabel}`}
            value={value?.toString() || ""}
            onChangeText={(text) => {
              const numValue = text ? parseFloat(text) : null;
              onChange(numValue);
            }}
          />
        </View>
      );

    case "text":
    case "notes":
      return (
        <View style={styles.optionContainer}>
          <Text style={styles.optionLabel}>{optionLabel}</Text>
          <TextInput
            style={styles.textInput}
            multiline={option.option_type === "notes"}
            numberOfLines={option.option_type === "notes" ? 4 : 1}
            placeholder={option.placeholder || `Enter ${optionLabel}`}
            value={value || ""}
            onChangeText={onChange}
            maxLength={option.max_length}
          />
        </View>
      );

    default:
      return null;
  }
}, (prevProps, nextProps) => {
  // Custom comparison function for React.memo
  // Only re-render if the value actually changed or option changed
  if (prevProps.option.id !== nextProps.option.id) return false;
  if (prevProps.option.option_type !== nextProps.option.option_type) return false;
  
  // Deep comparison for multiple_choice arrays
  if (prevProps.option.option_type === "multiple_choice") {
    const prevArr = prevProps.value || [];
    const nextArr = nextProps.value || [];
    if (prevArr.length !== nextArr.length) return false;
    const prevSet = new Set(prevArr);
    const nextSet = new Set(nextArr);
    if (prevSet.size !== nextSet.size) return false;
    for (const val of prevSet) {
      if (!nextSet.has(val)) return false;
    }
    return prevProps.onChange === nextProps.onChange;
  }
  
  // For other types, simple value comparison
  return (
    prevProps.value === nextProps.value &&
    prevProps.onChange === nextProps.onChange
  );
});

FormOption.displayName = "FormOption";

const styles = StyleSheet.create({
  optionContainer: {
    marginBottom: 16,
  },
  optionLabel: {
    fontSize: 14,
    fontWeight: "500",
    color: colors.textOnSecondary,
    marginBottom: 8,
  },
  numberInput: {
    backgroundColor: colors.background,
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
    fontSize: 16,
    color: colors.text,
  },
  textInput: {
    backgroundColor: colors.background,
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
    fontSize: 16,
    color: colors.text,
    minHeight: 40,
    textAlignVertical: "top",
  },
});

export default FormOption;

