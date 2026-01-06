import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { colors } from "../../constants/colors";

const ChoiceOption = React.memo(({ option, value, onChange }) => {
  const handlePress = React.useCallback(
    (choice) => {
      if (option.option_type === "multiple_choice") {
        const selectedChoices = value || [];
        const isSelected = selectedChoices.includes(choice);
        const newChoices = isSelected
          ? selectedChoices.filter((c) => c !== choice)
          : [...selectedChoices, choice];
        onChange(newChoices);
      } else if (option.option_type === "single_choice") {
        const isSelected = value === choice;
        onChange(isSelected ? null : choice);
      } else if (option.option_type === "yes_no") {
        const boolValue = choice === true || choice === "true";
        const isSelected = value === boolValue;
        onChange(isSelected ? null : boolValue);
      }
    },
    [option.option_type, value, onChange]
  );

  if (option.option_type === "yes_no") {
    return (
      <View style={styles.choiceButtons}>
        <TouchableOpacity
          style={[
            styles.choiceButton,
            value === true && styles.choiceButtonSelected,
          ]}
          onPress={() => handlePress(true)}
        >
          <Text
            style={[
              styles.choiceButtonText,
              value === true && styles.choiceButtonTextSelected,
            ]}
          >
            Yes
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.choiceButton,
            value === false && styles.choiceButtonSelected,
          ]}
          onPress={() => handlePress(false)}
        >
          <Text
            style={[
              styles.choiceButtonText,
              value === false && styles.choiceButtonTextSelected,
            ]}
          >
            No
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  const choices = option.choices || [];
  if (choices.length === 0) {
    return (
      <Text style={styles.emptyChoicesText}>
        No choices available for this option
      </Text>
    );
  }

  return (
    <View style={styles.choiceButtons}>
      {choices.map((choice) => {
        const isSelected =
          option.option_type === "multiple_choice"
            ? (value || []).includes(choice)
            : value === choice;

        return (
          <TouchableOpacity
            key={choice}
            style={[
              styles.choiceButton,
              isSelected && styles.choiceButtonSelected,
            ]}
            onPress={() => handlePress(choice)}
          >
            <Text
              style={[
                styles.choiceButtonText,
                isSelected && styles.choiceButtonTextSelected,
              ]}
            >
              {option.choice_labels?.[choice] || choice}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}, (prevProps, nextProps) => {
  // Custom comparison - only re-render if value or option changed
  if (prevProps.option.id !== nextProps.option.id) return false;
  if (prevProps.option.option_type !== nextProps.option.option_type) return false;
  
  // Deep comparison for multiple_choice arrays
  if (prevProps.option.option_type === "multiple_choice") {
    const prevArr = prevProps.value || [];
    const nextArr = nextProps.value || [];
    if (prevArr.length !== nextArr.length) return false;
    return prevArr.every((val) => nextArr.includes(val));
  }
  
  return prevProps.value === nextProps.value && prevProps.onChange === nextProps.onChange;
});

ChoiceOption.displayName = "ChoiceOption";

const styles = StyleSheet.create({
  choiceButtons: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
  },
  choiceButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: 8,
    marginBottom: 8,
    flexShrink: 0,
  },
  choiceButtonSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  choiceButtonText: {
    fontSize: 14,
    color: colors.text,
  },
  choiceButtonTextSelected: {
    color: colors.textOnPrimary,
    fontWeight: "600",
  },
  emptyChoicesText: {
    fontSize: 14,
    color: colors.textSecondary,
    fontStyle: "italic",
    marginTop: 8,
  },
});

export default ChoiceOption;

