import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  ScrollView,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../constants/colors";

const OPTION_TYPES = [
  { value: "rating", label: "Rating Scale" },
  { value: "single_choice", label: "Single Choice (pick one)" },
  { value: "multiple_choice", label: "Multiple Choice (pick many)" },
  { value: "yes_no", label: "Yes/No" },
  { value: "number_input", label: "Number Input" },
  { value: "text", label: "Text Input" },
  { value: "notes", label: "Notes (free text)" },
  { value: "time", label: "Time Picker" },
];

export default function FieldCreationModal({ visible, onClose, onSubmit }) {
  const [fieldName, setFieldName] = useState("");
  const [options, setOptions] = useState([
    {
      optionName: "",
      optionType: "",
      choices: [],
      currentChoiceInput: "",
      minValue: 0,
      maxValue: 10,
    },
  ]);

  const handleAddOption = () => {
    setOptions([
      ...options,
      {
        optionName: "",
        optionType: "",
        choices: [],
        currentChoiceInput: "",
        minValue: 0,
        maxValue: 10,
      },
    ]);
  };

  const handleRemoveOption = (index) => {
    if (options.length > 1) {
      setOptions(options.filter((_, i) => i !== index));
    }
  };

  const handleUpdateOption = (index, field, value) => {
    const updated = [...options];
    updated[index] = { ...updated[index], [field]: value };
    setOptions(updated);
  };

  const handleAddChoice = (optionIndex) => {
    const updated = [...options];
    const currentInput = updated[optionIndex].currentChoiceInput || "";
    if (!currentInput.trim()) return;

    if (!updated[optionIndex].choices) {
      updated[optionIndex].choices = [];
    }
    updated[optionIndex].choices.push(currentInput.trim());
    updated[optionIndex].currentChoiceInput = "";
    setOptions(updated);
  };

  const handleRemoveChoice = (optionIndex, choiceIndex) => {
    const updated = [...options];
    updated[optionIndex].choices = updated[optionIndex].choices.filter(
      (_, i) => i !== choiceIndex
    );
    setOptions(updated);
  };

  const handleSave = () => {
    // Validate field name
    if (!fieldName.trim()) {
      alert("Please enter a field name");
      return;
    }

    // Validate all options
    const validatedOptions = options
      .map((opt, index) => {
        if (!opt.optionName.trim()) {
          alert(`Please enter a name for option ${index + 1}`);
          return null;
        }
        if (!opt.optionType) {
          alert(`Please select a type for option ${index + 1}`);
          return null;
        }
        if (
          (opt.optionType === "multiple_choice" ||
            opt.optionType === "single_choice") &&
          (!opt.choices || opt.choices.length === 0)
        ) {
          alert(
            `Please add at least one choice for option ${index + 1} (${
              opt.optionType
            })`
          );
          return null;
        }

        const optionData = {
          option_name: opt.optionName.trim().toLowerCase().replace(/\s+/g, "_"),
          option_type: opt.optionType,
          display_label: opt.optionName.trim(),
        };

        if (
          opt.optionType === "multiple_choice" ||
          opt.optionType === "single_choice"
        ) {
          optionData.choices = opt.choices;
        }

        if (opt.optionType === "rating") {
          optionData.min_value = opt.minValue ?? 0;
          optionData.max_value = opt.maxValue ?? 10;
        }

        return optionData;
      })
      .filter((opt) => opt !== null);

    if (validatedOptions.length === 0) {
      alert("Please add at least one valid option");
      return;
    }

    const fieldData = {
      field_name: fieldName.trim().toLowerCase().replace(/\s+/g, "_"),
      display_label: fieldName.trim(),
      options: validatedOptions,
    };

    onSubmit(fieldData);
    handleReset();
  };

  const handleReset = () => {
    setFieldName("");
    setOptions([
      {
        optionName: "",
        optionType: "",
        choices: [],
        currentChoiceInput: "",
        minValue: 0,
        maxValue: 10,
      },
    ]);
  };

  const handleClose = () => {
    handleReset();
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="slide"
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.modalOverlay}
      >
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Create New Field</Text>
            <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color={colors.text} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.scrollView}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={true}
          >
            {/* Field Name Input */}
            <View style={styles.inputSection}>
              <Text style={styles.label}>Field Name</Text>
              <TextInput
                style={styles.textInput}
                placeholder="e.g., Mood, Energy, Sleep"
                value={fieldName}
                onChangeText={setFieldName}
                placeholderTextColor={colors.textLight}
              />
            </View>

            {/* Options */}
            {options.map((option, optionIndex) => (
              <View key={optionIndex} style={styles.optionSection}>
                <View style={styles.optionHeader}>
                  <Text style={styles.optionTitle}>
                    Option {optionIndex + 1}
                  </Text>
                  {options.length > 1 && (
                    <TouchableOpacity
                      onPress={() => handleRemoveOption(optionIndex)}
                      style={styles.removeOptionButton}
                    >
                      <Ionicons
                        name="trash-outline"
                        size={20}
                        color={colors.error}
                      />
                    </TouchableOpacity>
                  )}
                </View>

                {/* Option Name */}
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Option Name</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="e.g., overall, level, quality"
                    value={option.optionName}
                    onChangeText={(text) =>
                      handleUpdateOption(optionIndex, "optionName", text)
                    }
                    placeholderTextColor={colors.textLight}
                  />
                </View>

                {/* Option Type Picker */}
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Option Type</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={styles.typePicker}
                  >
                    {OPTION_TYPES.map((type) => (
                      <TouchableOpacity
                        key={type.value}
                        style={[
                          styles.typeOption,
                          option.optionType === type.value &&
                            styles.typeOptionSelected,
                        ]}
                        onPress={() =>
                          handleUpdateOption(
                            optionIndex,
                            "optionType",
                            type.value
                          )
                        }
                      >
                        <Text
                          style={[
                            styles.typeOptionText,
                            option.optionType === type.value &&
                              styles.typeOptionTextSelected,
                          ]}
                        >
                          {type.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>

                {/* Rating Scale Min/Max */}
                {option.optionType === "rating" && (
                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>Rating Scale Range</Text>
                    <View style={styles.rangeContainer}>
                      <View style={styles.rangeControl}>
                        <Text style={styles.rangeLabel}>Min Value</Text>
                        <View style={styles.incrementDecrementContainer}>
                          <TouchableOpacity
                            style={[
                              styles.incrementButton,
                              (option.minValue || 0) <= 0 &&
                                styles.incrementButtonDisabled,
                            ]}
                            onPress={() => {
                              const newMin = Math.max(
                                0,
                                (option.minValue || 0) - 1
                              );
                              handleUpdateOption(
                                optionIndex,
                                "minValue",
                                newMin
                              );
                            }}
                            disabled={(option.minValue || 0) <= 0}
                          >
                            <Ionicons
                              name="remove"
                              size={20}
                              color={
                                (option.minValue || 0) <= 0
                                  ? colors.textLight
                                  : "#FFFFFF"
                              }
                            />
                          </TouchableOpacity>
                          <View style={styles.valueDisplay}>
                            <Text style={styles.valueText}>
                              {option.minValue ?? 0}
                            </Text>
                          </View>
                          <TouchableOpacity
                            style={[
                              styles.incrementButton,
                              (option.minValue || 0) >=
                                (option.maxValue || 10) - 1 &&
                                styles.incrementButtonDisabled,
                            ]}
                            onPress={() => {
                              const newMin = Math.min(
                                (option.maxValue || 10) - 1,
                                (option.minValue || 0) + 1
                              );
                              handleUpdateOption(
                                optionIndex,
                                "minValue",
                                newMin
                              );
                            }}
                            disabled={
                              (option.minValue || 0) >=
                              (option.maxValue || 10) - 1
                            }
                          >
                            <Ionicons
                              name="add"
                              size={20}
                              color={
                                (option.minValue || 0) >=
                                (option.maxValue || 10) - 1
                                  ? colors.textLight
                                  : "#FFFFFF"
                              }
                            />
                          </TouchableOpacity>
                        </View>
                      </View>

                      <View style={styles.rangeControl}>
                        <Text style={styles.rangeLabel}>Max Value</Text>
                        <View style={styles.incrementDecrementContainer}>
                          <TouchableOpacity
                            style={[
                              styles.incrementButton,
                              (option.maxValue || 10) <=
                                (option.minValue || 0) + 1 &&
                                styles.incrementButtonDisabled,
                            ]}
                            onPress={() => {
                              const newMax = Math.max(
                                (option.minValue || 0) + 1,
                                (option.maxValue || 10) - 1
                              );
                              handleUpdateOption(
                                optionIndex,
                                "maxValue",
                                newMax
                              );
                            }}
                            disabled={
                              (option.maxValue || 10) <=
                              (option.minValue || 0) + 1
                            }
                          >
                            <Ionicons
                              name="remove"
                              size={20}
                              color={
                                (option.maxValue || 10) <=
                                (option.minValue || 0) + 1
                                  ? colors.textLight
                                  : "#FFFFFF"
                              }
                            />
                          </TouchableOpacity>
                          <View style={styles.valueDisplay}>
                            <Text style={styles.valueText}>
                              {option.maxValue ?? 10}
                            </Text>
                          </View>
                          <TouchableOpacity
                            style={styles.incrementButton}
                            onPress={() => {
                              const newMax = (option.maxValue || 10) + 1;
                              handleUpdateOption(
                                optionIndex,
                                "maxValue",
                                newMax
                              );
                            }}
                          >
                            <Ionicons name="add" size={20} color="#FFFFFF" />
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>
                  </View>
                )}

                {/* Multiple Choice Input */}
                {(option.optionType === "multiple_choice" ||
                  option.optionType === "single_choice") && (
                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>
                      Choices{" "}
                      {option.optionType === "single_choice"
                        ? "(pick one)"
                        : "(pick many)"}
                    </Text>

                    {/* Existing Choices */}
                    {option.choices && option.choices.length > 0 && (
                      <View style={styles.choicesContainer}>
                        {option.choices.map((choice, choiceIndex) => (
                          <View key={choiceIndex} style={styles.choiceChip}>
                            <Text style={styles.choiceChipText}>{choice}</Text>
                            <TouchableOpacity
                              onPress={() =>
                                handleRemoveChoice(optionIndex, choiceIndex)
                              }
                              style={styles.choiceRemoveButton}
                            >
                              <Ionicons
                                name="close-circle"
                                size={18}
                                color={colors.error}
                              />
                            </TouchableOpacity>
                          </View>
                        ))}
                      </View>
                    )}

                    {/* Choice Input */}
                    <View style={styles.choiceInputContainer}>
                      <TextInput
                        style={styles.choiceInput}
                        placeholder="Type a choice and press Enter"
                        value={option.currentChoiceInput || ""}
                        onChangeText={(text) =>
                          handleUpdateOption(
                            optionIndex,
                            "currentChoiceInput",
                            text
                          )
                        }
                        onSubmitEditing={() => {
                          handleAddChoice(optionIndex);
                        }}
                        returnKeyType="done"
                        placeholderTextColor={colors.textLight}
                      />
                      <TouchableOpacity
                        onPress={() => handleAddChoice(optionIndex)}
                        style={styles.addChoiceButton}
                        disabled={!option.currentChoiceInput?.trim()}
                      >
                        <Ionicons
                          name="add-circle"
                          size={24}
                          color={
                            option.currentChoiceInput?.trim()
                              ? colors.primary
                              : colors.textLight
                          }
                        />
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </View>
            ))}

            {/* Add Option Button */}
            <TouchableOpacity
              onPress={handleAddOption}
              style={styles.addOptionButton}
            >
              <Ionicons
                name="add-circle-outline"
                size={24}
                color={colors.primary}
              />
              <Text style={styles.addOptionText}>Add Another Option</Text>
            </TouchableOpacity>
          </ScrollView>

          {/* Action Buttons */}
          <View style={styles.modalButtons}>
            <TouchableOpacity
              onPress={handleClose}
              style={[styles.button, styles.cancelButton]}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleSave}
              style={[styles.button, styles.saveButton]}
            >
              <Text style={styles.saveButtonText}>Save Field</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "90%",
    paddingBottom: Platform.OS === "ios" ? 20 : 10,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: colors.text,
  },
  closeButton: {
    padding: 4,
  },
  scrollView: {
    maxHeight: "70%",
  },
  inputSection: {
    padding: 20,
    paddingBottom: 10,
  },
  optionSection: {
    padding: 20,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.formFieldBackground,
    marginHorizontal: 10,
    marginVertical: 8,
    borderRadius: 12,
  },
  optionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  optionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.text,
  },
  removeOptionButton: {
    padding: 4,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.text,
    marginBottom: 8,
  },
  textInput: {
    backgroundColor: colors.formFieldBackground,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
  },
  typePicker: {
    marginTop: 8,
  },
  typeOption: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: colors.surface,
    marginRight: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  typeOptionSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  typeOptionText: {
    fontSize: 14,
    fontWeight: "500",
    color: colors.text,
  },
  typeOptionTextSelected: {
    color: colors.textOnPrimary,
    fontWeight: "600",
  },
  choicesContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: 12,
    gap: 8,
  },
  choiceChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.calendar,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 6,
  },
  choiceChipText: {
    fontSize: 14,
    fontWeight: "500",
    color: colors.text,
  },
  choiceRemoveButton: {
    padding: 2,
  },
  choiceInputContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  choiceInput: {
    flex: 1,
    backgroundColor: colors.formFieldBackground,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
  },
  addChoiceButton: {
    padding: 4,
  },
  addOptionButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    margin: 20,
    marginTop: 10,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: "dashed",
    gap: 8,
  },
  addOptionText: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.primary,
  },
  modalButtons: {
    flexDirection: "row",
    padding: 20,
    paddingTop: 10,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  button: {
    flex: 1,
    padding: 14,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelButton: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.text,
  },
  saveButton: {
    backgroundColor: colors.primary,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.textOnPrimary,
  },
  rangeContainer: {
    flexDirection: "row",
    gap: 16,
    marginTop: 8,
  },
  rangeControl: {
    flex: 1,
  },
  rangeLabel: {
    fontSize: 12,
    fontWeight: "500",
    color: colors.textLight,
    marginBottom: 8,
    textAlign: "center",
  },
  incrementDecrementContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  incrementButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.slider,
    borderWidth: 1,
    borderColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  incrementButtonDisabled: {
    borderColor: colors.border,
    backgroundColor: colors.background,
    opacity: 0.5,
  },
  valueDisplay: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.calendar,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    minWidth: 60,
  },
  valueText: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.text,
  },
});
