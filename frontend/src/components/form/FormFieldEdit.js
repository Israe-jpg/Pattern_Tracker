import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../../constants/colors";

const FormFieldEdit = React.memo(
  ({ field, onDeleteField, onEditField, onDeleteOption, onAddOption, onToggleField, onToggleOption }) => {
    if (!field.options || field.options.length === 0) return null;

    // Check if this is a custom field (editable/deletable)
    const isCustomField = field.field_group === 'custom' || field.is_user_field === true;
    
    // Check if field is masked (inactive)
    const isMasked = field.is_active === false;

    const sortedOptions = React.useMemo(
      () =>
        [...field.options].sort(
          (a, b) => (a.option_order || 0) - (b.option_order || 0)
        ),
      [field.options]
    );

    return (
      <View style={styles.fieldWrapper}>
        {/* Toggle button outside the field container */}
        {isMasked ? (
          <TouchableOpacity
            style={styles.toggleButtonOutside}
            onPress={() => onToggleField && onToggleField(field, true)}
          >
            <Ionicons name="add-circle" size={24} color={colors.success} />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.toggleButtonOutside}
            onPress={() => {
              // For all fields, mask them (set inactive)
              onToggleField && onToggleField(field, false);
            }}
          >
            <Ionicons name="remove-circle" size={24} color={colors.error} />
          </TouchableOpacity>
        )}

        {/* Field container */}
        <View style={[
          styles.fieldContainer,
          styles.fieldContainerWithBorder,
          isCustomField && styles.fieldContainerCustom,
          isMasked && styles.fieldContainerMasked,
        ]}>
          {/* Field header with edit and trash icons */}
          <View style={styles.fieldHeader}>
            <View style={styles.fieldTitleContainer}>
              {field.display_label && (
                <Text style={[
                  styles.fieldLabel,
                  isMasked && styles.fieldLabelMasked,
                ]}>{field.display_label}</Text>
              )}
              {!isCustomField && !isMasked && (
                <View style={styles.readOnlyBadge}>
                  <Ionicons name="lock-closed" size={12} color={colors.textLight} />
                  <Text style={styles.readOnlyText}>Read-only</Text>
                </View>
              )}
              {isMasked && (
                <View style={styles.maskedBadge}>
                  <Ionicons name="eye-off" size={12} color={colors.textLight} />
                  <Text style={styles.maskedText}>Hidden</Text>
                </View>
              )}
            </View>
            <View style={styles.fieldActions}>
            {isCustomField && !isMasked && (
              <>
                <TouchableOpacity
                  style={styles.iconButton}
                  onPress={() => onEditField(field)}
                >
                  <Ionicons name="create-outline" size={20} color={colors.primary} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.iconButton}
                  onPress={() => onDeleteField(field)}
                >
                  <Ionicons name="trash-outline" size={20} color={colors.error} />
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>

        {/* Options */}
        <View style={styles.optionsContainer}>
          {sortedOptions.map((option) => {
            const isOptionMasked = option.is_active === false;
            return (
              <View key={option.id} style={[
                styles.optionRow,
                isOptionMasked && styles.optionRowMasked,
              ]}>
                {/* Show plus for masked options, minus for active options */}
                {isOptionMasked ? (
                  <TouchableOpacity
                    style={styles.addOptionIconButton}
                    onPress={() => onToggleOption && onToggleOption(field, option, true)}
                  >
                    <Ionicons name="add-circle" size={16} color={colors.success} />
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={styles.deleteOptionButton}
                    onPress={() => {
                      // For all options, mask them (set inactive)
                      onToggleOption && onToggleOption(field, option, false);
                    }}
                  >
                    <Ionicons name="remove-circle" size={16} color={colors.error} />
                  </TouchableOpacity>
                )}
                <View style={styles.optionContent}>
                  <Text style={[
                    styles.optionLabel,
                    isOptionMasked && styles.optionLabelMasked,
                  ]}>
                    {option.display_label || option.option_name}
                  </Text>
                  <Text style={[
                    styles.optionType,
                    isOptionMasked && styles.optionTypeMasked,
                  ]}>
                    {option.option_type}
                    {isOptionMasked && " • Hidden"}
                  </Text>
                </View>
                {isCustomField && !isOptionMasked && (
                  <TouchableOpacity
                    style={styles.iconButton}
                    onPress={() => onDeleteOption(field, option)}
                  >
                    <Ionicons name="trash-outline" size={16} color={colors.error} />
                  </TouchableOpacity>
                )}
              </View>
            );
          })}
        </View>
      </View>
      </View>
    );
  },
  (prevProps, nextProps) => {
    // Check if field properties changed
    if (
      prevProps.field.id !== nextProps.field.id ||
      prevProps.field.field_name !== nextProps.field.field_name ||
      prevProps.field.is_active !== nextProps.field.is_active
    ) {
      return false;
    }

    // Check if options changed (count or active status)
    const prevOptions = prevProps.field.options || [];
    const nextOptions = nextProps.field.options || [];
    
    if (prevOptions.length !== nextOptions.length) {
      return false;
    }

    // Check if any option's active status changed
    for (let i = 0; i < prevOptions.length; i++) {
      const prevOption = prevOptions[i];
      const nextOption = nextOptions[i];
      
      if (
        prevOption.id !== nextOption.id ||
        prevOption.is_active !== nextOption.is_active
      ) {
        return false;
      }
    }

    return true;
  }
);

FormFieldEdit.displayName = "FormFieldEdit";

const styles = StyleSheet.create({
  fieldWrapper: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 16,
    marginLeft: 0,
    marginRight: 20,
  },
  toggleButtonOutside: {
    marginRight: 8,
    marginTop: 8,
    padding: 4,
    marginLeft: 12,
  },
  fieldContainer: {
    flex: 1,
    backgroundColor: colors.formFieldBackground,
    borderRadius: 12,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  fieldContainerWithBorder: {
    borderWidth: 2,
    borderColor: colors.error,
    borderStyle: "dashed",
  },
  fieldContainerCustom: {
    // Custom fields keep the red dashed border
  },
  fieldContainerMasked: {
    opacity: 0.6,
    borderColor: colors.textLight,
  },
  fieldHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  fieldTitleContainer: {
    flex: 1,
  },
  fieldLabel: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.text,
    marginBottom: 4,
  },
  fieldLabelMasked: {
    color: colors.textLight,
  },
  readOnlyBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: colors.surface,
    borderRadius: 12,
    alignSelf: "flex-start",
  },
  readOnlyText: {
    fontSize: 11,
    fontWeight: "500",
    color: colors.textLight,
  },
  maskedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: colors.background,
    borderRadius: 12,
    alignSelf: "flex-start",
  },
  maskedText: {
    fontSize: 11,
    fontWeight: "500",
    color: colors.textLight,
  },
  fieldActions: {
    flexDirection: "row",
    gap: 8,
  },
  iconButton: {
    padding: 4,
  },
  optionsContainer: {
    gap: 8,
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.calendar, // Light blue
    borderRadius: 8,
    padding: 12,
    gap: 8,
  },
  optionRowMasked: {
    opacity: 0.4,
    backgroundColor: colors.surface,
  },
  deleteOptionButton: {
    padding: 2,
  },
  addOptionIconButton: {
    padding: 2,
  },
  optionContent: {
    flex: 1,
  },
  optionLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.text,
    marginBottom: 2,
  },
  optionLabelMasked: {
    color: colors.textLight,
    opacity: 0.5,
  },
  optionType: {
    fontSize: 12,
    color: colors.textLight,
    fontStyle: "italic",
  },
  optionTypeMasked: {
    opacity: 0.5,
  },
  optionActions: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  noOptionsText: {
    fontSize: 14,
    color: colors.textLight,
    fontStyle: "italic",
    textAlign: "center",
    paddingVertical: 12,
  },
});

export default FormFieldEdit;

