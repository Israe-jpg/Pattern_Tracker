import React from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  ScrollView,
  TouchableOpacity,
} from "react-native";
import { colors } from "../constants/colors";
import Button from "./Button";

/**
 * Reusable Picker Modal Component
 *
 * @param {boolean} visible - Whether modal is visible
 * @param {string} title - Modal title
 * @param {function} onClose - Function to call when closing
 * @param {function} onSelect - Function to call when selecting (receives selected value)
 * @param {array|object} columns - Array of column configs or object for special cases
 * @param {any} selectedValue - Currently selected value(s)
 * @param {function} renderOption - Function to render each option (optional)
 */
export default function PickerModal({
  visible,
  title,
  onClose,
  onSelect,
  columns,
  selectedValue,
  renderOption,
}) {
  const handleSelect = () => {
    if (onSelect) {
      onSelect(selectedValue);
    }
    onClose();
  };

  const renderPickerColumn = (column, index) => {
    if (!column || !column.data) return null;

    return (
      <View key={index} style={styles.pickerColumn}>
        {column.label && <Text style={styles.pickerLabel}>{column.label}</Text>}
        <ScrollView style={styles.pickerScrollView}>
          {column.data.map((item, itemIndex) => {
            const isSelected = column.isSelected
              ? column.isSelected(item, selectedValue, itemIndex)
              : item === selectedValue ||
                (typeof selectedValue === "object" &&
                  selectedValue &&
                  selectedValue[column.key] === item);

            return (
              <TouchableOpacity
                key={itemIndex}
                style={[
                  styles.pickerOption,
                  isSelected && styles.pickerOptionSelected,
                ]}
                onPress={() => {
                  if (column.onSelect) {
                    column.onSelect(item, selectedValue, itemIndex);
                  }
                }}
              >
                {renderOption ? (
                  renderOption(item, isSelected, column)
                ) : (
                  <Text
                    style={[
                      styles.pickerOptionText,
                      isSelected && styles.pickerOptionTextSelected,
                    ]}
                  >
                    {column.formatValue
                      ? column.formatValue(item, itemIndex)
                      : typeof item === "object"
                      ? JSON.stringify(item)
                      : item}
                  </Text>
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>
    );
  };

  // Handle columns as array or object
  const columnsArray = Array.isArray(columns) ? columns : [columns];

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>{title}</Text>

          <View style={styles.datePickerContainer}>
            {columnsArray.map((column, index) =>
              renderPickerColumn(column, index)
            )}
          </View>

          <View style={styles.modalButtons}>
            <Button
              title="Cancel"
              onPress={onClose}
              variant="outline"
              style={styles.modalButton}
            />
            <Button
              title="Select"
              onPress={handleSelect}
              style={styles.modalButton}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    backgroundColor: colors.background,
    borderRadius: 20,
    padding: 24,
    width: "90%",
    maxWidth: 400,
    maxHeight: "80%",
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.text,
    marginBottom: 20,
    textAlign: "center",
  },
  datePickerContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 20,
    height: 300,
  },
  pickerColumn: {
    flex: 1,
    marginHorizontal: 4,
  },
  pickerLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.text,
    marginBottom: 8,
    textAlign: "center",
  },
  pickerScrollView: {
    flex: 1,
  },
  pickerOption: {
    padding: 12,
    borderRadius: 8,
    marginVertical: 2,
    alignItems: "center",
    backgroundColor: colors.surface,
  },
  pickerOptionSelected: {
    backgroundColor: colors.primary,
  },
  pickerOptionText: {
    fontSize: 16,
    color: colors.text,
  },
  pickerOptionTextSelected: {
    color: colors.textOnPrimary,
    fontWeight: "600",
  },
  modalButtons: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  modalButton: {
    flex: 1,
    marginHorizontal: 6,
  },
});
