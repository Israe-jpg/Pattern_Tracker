import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import DraggableFlatList, {
  ScaleDecorator,
  NestableDraggableFlatList,
} from "react-native-draggable-flatlist";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../../constants/colors";

// User-friendly option type labels (matching backend OPTION_TYPE_LABELS)
const OPTION_TYPE_LABELS = {
  'rating': 'Rating Scale',
  'single_choice': 'Single Choice',
  'multiple_choice': 'Multiple Choice',
  'yes_no': 'Yes/No',
  'number_input': 'Number Input',
  'text': 'Text Input',
  'notes': 'Notes',
  'time': 'Time Picker',
};

// Helper function to get user-friendly option type label
const getOptionTypeLabel = (optionType) => {
  return OPTION_TYPE_LABELS[optionType] || optionType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
};

const FormFieldEdit = React.memo(
  ({
    field,
    onDeleteField,
    onEditField,
    onDeleteOption,
    onAddOption,
    onToggleField,
    onToggleOption,
    onDragField,
    onOptionReorder,
    isReorderable = false,
  }) => {
    if (!field.options || field.options.length === 0) return null;

    // Check if this is a custom field (editable/deletable)
    const isCustomField =
      field.field_group === "custom" || field.is_user_field === true;

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
            <Ionicons name="add-circle" size={20} color={colors.success} />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.toggleButtonOutside}
            onPress={() => {
              // For all fields, mask them (set inactive)
              onToggleField && onToggleField(field, false);
            }}
          >
            <Ionicons name="remove-circle" size={20} color={colors.error} />
          </TouchableOpacity>
        )}

        {/* Field container */}
        <View
          style={[
            styles.fieldContainer,
            styles.fieldContainerWithBorder,
            // Active custom fields: red border
            isCustomField && !isMasked && styles.fieldContainerCustomActive,
            // Masked custom fields: green border
            isCustomField && isMasked && styles.fieldContainerCustomMasked,
            // Non-custom fields (baseline/tracker-specific): grey border
            !isCustomField && styles.fieldContainerNonCustom,
            // Non-reorderable fields: solid border style
            !isReorderable && styles.fieldContainerNonReorderable,
          ]}
        >
          {/* Field header with edit and trash icons */}
          <View style={styles.fieldHeader}>
            <View style={styles.fieldTitleContainer}>
              {field.display_label &&
                (onDragField && isReorderable ? (
                  <TouchableOpacity
                    onLongPress={onDragField}
                    delayLongPress={500}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.fieldLabel,
                        isMasked && styles.fieldLabelMasked,
                      ]}
                    >
                      {field.display_label}
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <Text
                    style={[
                      styles.fieldLabel,
                      isMasked && styles.fieldLabelMasked,
                    ]}
                  >
                    {field.display_label}
                  </Text>
                ))}
              {!isCustomField && !isMasked && (
                <View style={styles.readOnlyBadge}>
                  <Ionicons
                    name="lock-closed"
                    size={12}
                    color={colors.textLight}
                  />
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
                    <Ionicons
                      name="create-outline"
                      size={20}
                      color={colors.primary}
                    />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.iconButton}
                    onPress={() => onDeleteField(field)}
                  >
                    <Ionicons
                      name="trash-outline"
                      size={20}
                      color={colors.error}
                    />
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>

          {/* Options */}
          <View style={styles.optionsContainer}>
            {isReorderable && onOptionReorder ? (
              // Reorderable options (custom fields in edit mode)
              // Use field.options directly (already in correct order from state)
              // Don't use sortedOptions to avoid mismatch with drag operation
              <NestableDraggableFlatList
                data={field.options || []}
                onDragEnd={({ data }) => {
                  // Pass the field ID and reordered options array immediately
                  // The delay for optimistic update is handled in handleOptionReorder
                  onOptionReorder(field.id, data);
                }}
                keyExtractor={(item) => String(item.id)}
                scrollEnabled={false}
                dragItemOverflow={true}
                renderItem={({ item: option, drag, isActive }) => {
                  const isOptionMasked = option.is_active === false;
                  // Disable drag for masked options
                  const canDrag = !isOptionMasked;
                  return (
                    <ScaleDecorator>
                      <View
                        style={[
                          styles.optionRow,
                          isOptionMasked && styles.optionRowMasked,
                          isActive && styles.optionRowActive,
                        ]}
                        collapsable={false}
                      >
                        {/* Show plus for masked options, minus for active options */}
                        {isOptionMasked ? (
                          <TouchableOpacity
                            style={styles.addOptionIconButton}
                            onPress={() =>
                              onToggleOption &&
                              onToggleOption(field, option, true)
                            }
                          >
                            <Ionicons
                              name="add-circle"
                              size={16}
                              color={colors.success}
                            />
                          </TouchableOpacity>
                        ) : (
                          <TouchableOpacity
                            style={styles.deleteOptionButton}
                            onPress={() => {
                              // For all options, mask them (set inactive)
                              onToggleOption &&
                                onToggleOption(field, option, false);
                            }}
                          >
                            <Ionicons
                              name="remove-circle"
                              size={16}
                              color={colors.error}
                            />
                          </TouchableOpacity>
                        )}
                        <View style={styles.optionContent}>
                          {canDrag ? (
                            <TouchableOpacity
                              onLongPress={drag}
                              delayLongPress={500}
                              activeOpacity={0.7}
                            >
                              <Text style={styles.optionLabel}>
                                {option.display_label || option.option_name}
                              </Text>
                            </TouchableOpacity>
                          ) : (
                            // Masked options are not draggable
                            <Text
                              style={[
                                styles.optionLabel,
                                styles.optionLabelMasked,
                              ]}
                            >
                              {option.display_label || option.option_name}
                            </Text>
                          )}
                          <Text
                            style={[
                              styles.optionType,
                              isOptionMasked && styles.optionTypeMasked,
                            ]}
                          >
                            {getOptionTypeLabel(option.option_type)}
                            {isOptionMasked && " • Hidden"}
                          </Text>
                        </View>
                        {/* Fading line separator */}
                        <View style={styles.optionSeparator} />
                        {isCustomField && !isOptionMasked && (
                          <TouchableOpacity
                            style={styles.iconButton}
                            onPress={() => onDeleteOption(field, option)}
                          >
                            <Ionicons
                              name="trash-outline"
                              size={16}
                              color={colors.error}
                            />
                          </TouchableOpacity>
                        )}
                      </View>
                    </ScaleDecorator>
                  );
                }}
                scrollEnabled={false}
              />
            ) : (
              // Non-reorderable options (baseline, tracker-specific, or non-edit mode)
              sortedOptions.map((option) => {
                const isOptionMasked = option.is_active === false;
                return (
                  <View
                    key={option.id}
                    style={[
                      styles.optionRow,
                      isOptionMasked && styles.optionRowMasked,
                    ]}
                  >
                    {/* Show plus for masked options, minus for active options */}
                    {isOptionMasked ? (
                      <TouchableOpacity
                        style={styles.addOptionIconButton}
                        onPress={() =>
                          onToggleOption && onToggleOption(field, option, true)
                        }
                      >
                        <Ionicons
                          name="add-circle"
                          size={16}
                          color={colors.success}
                        />
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity
                        style={styles.deleteOptionButton}
                        onPress={() => {
                          // For all options, mask them (set inactive)
                          onToggleOption &&
                            onToggleOption(field, option, false);
                        }}
                      >
                        <Ionicons
                          name="remove-circle"
                          size={16}
                          color={colors.error}
                        />
                      </TouchableOpacity>
                    )}
                    <View style={styles.optionContent}>
                      <Text
                        style={[
                          styles.optionLabel,
                          isOptionMasked && styles.optionLabelMasked,
                        ]}
                      >
                        {option.display_label || option.option_name}
                      </Text>
                      <Text
                        style={[
                          styles.optionType,
                          isOptionMasked && styles.optionTypeMasked,
                        ]}
                          >
                            {getOptionTypeLabel(option.option_type)}
                            {isOptionMasked && " • Hidden"}
                          </Text>
                    </View>
                    {/* Fading line separator */}
                    <View style={styles.optionSeparator} />
                    {isCustomField && !isOptionMasked && (
                      <TouchableOpacity
                        style={styles.iconButton}
                        onPress={() => onDeleteOption(field, option)}
                      >
                        <Ionicons
                          name="trash-outline"
                          size={16}
                          color={colors.error}
                        />
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })
            )}
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
    marginLeft: -20, // Negative margin to position toggle button outside, aligned with scrollContent padding
    marginRight: 0, // Align with header elements (scrollContent padding handles spacing)
  },
  toggleButtonOutside: {
    marginRight: 6, // Reduced to minimize width impact
    marginTop: 8,
    padding: 4, // Slightly increased for better touch target
    marginLeft: 20, // Offset the negative margin to position icon outside field
    alignItems: "center",
    justifyContent: "center",
    minWidth: 28, // Ensure consistent size without affecting field width much
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
    borderWidth: 1, // Very thin border
  },
  fieldContainerCustomActive: {
    // Active custom fields: red dashed border
    borderColor: colors.error,
    borderStyle: "dashed",
  },
  fieldContainerCustomMasked: {
    // Masked custom fields: green dashed border
    borderColor: colors.success,
    borderStyle: "dashed",
    opacity: 0.6,
  },
  fieldContainerNonCustom: {
    // Non-custom fields (baseline/tracker-specific): very light grey solid border
    borderColor: "#E5E7EB", // Much lighter grey
    borderStyle: "solid",
  },
  fieldContainerNonReorderable: {
    borderStyle: "solid", // Continuous line for non-reorderable fields
  },
  fieldHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  fieldTitleContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
  },
  fieldLabel: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.text,
    marginRight: 8, // Space before badge
  },
  fieldLabelMasked: {
    color: colors.textLight,
  },
  readOnlyBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: colors.surface,
    borderRadius: 12,
    alignSelf: "flex-start", // Wrap just the content
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
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: colors.background,
    borderRadius: 12,
    alignSelf: "flex-start", // Wrap just the content
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
    backgroundColor: "#E6F2FF", // Light light blue background
    borderRadius: 8,
    padding: 12,
    gap: 8,
    marginBottom: 8,
    marginHorizontal: 8, // Reduce width by adding horizontal margins
    position: "relative",
  },
  optionRowMasked: {
    opacity: 0.9, // High opacity for visibility
    backgroundColor: "#F3F4F6", // Universal grey background for masked options
  },
  optionRowActive: {
    opacity: 0.6,
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
    fontSize: 16, // Bigger font size
    fontWeight: "600",
    color: colors.text,
    marginBottom: 4,
  },
  optionLabelMasked: {
    color: colors.text, // Clear black writing for masked options
    opacity: 1, // Full opacity for better visibility
  },
  optionType: {
    fontSize: 14, // Bigger font size
    color: colors.textLight,
    fontStyle: "italic",
  },
  optionSeparator: {
    position: "absolute",
    bottom: 0,
    left: 12,
    right: 12,
    height: 1,
    backgroundColor: colors.border,
    opacity: 0.3, // Fading effect
  },
  optionTypeMasked: {
    color: colors.text, // Clear black writing for masked options
    opacity: 0.7, // Slightly reduced opacity but still clear
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
