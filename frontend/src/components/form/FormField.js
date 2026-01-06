import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Controller } from "react-hook-form";
import { colors } from "../../constants/colors";
import FormOption from "./FormOption";

const FormField = React.memo(({ field, control }) => {
  if (!field.options || field.options.length === 0) return null;

  const sortedOptions = React.useMemo(
    () =>
      [...field.options].sort(
        (a, b) => (a.option_order || 0) - (b.option_order || 0)
      ),
    [field.options]
  );

  return (
    <View 
      style={styles.fieldContainer}
      // ✅ iOS FIX: Ensure touch events work properly
      collapsable={false}
    >
      {field.display_label && (
        <Text style={styles.fieldLabel}>{field.display_label}</Text>
      )}
      {sortedOptions.map((option) => (
        <Controller
          key={option.id}
          name={`${field.field_name}.${option.option_name}`}
          control={control}
          defaultValue={
            option.option_type === "multiple_choice"
              ? []
              : option.option_type === "yes_no"
              ? false
              : null
          }
          shouldUnregister={false}
          render={({ field: { onChange, value } }) => (
            <FormOption
              field={field}
              option={option}
              value={value}
              onChange={onChange}
            />
          )}
        />
      ))}
    </View>
  );
}, (prevProps, nextProps) => {
  // Only re-render if field changed
  return (
    prevProps.field.id === nextProps.field.id &&
    prevProps.field.field_name === nextProps.field.field_name &&
    prevProps.control === nextProps.control
  );
});

FormField.displayName = "FormField";

const styles = StyleSheet.create({
  fieldContainer: {
    backgroundColor: colors.secondary,
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  fieldLabel: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.textOnSecondary,
    marginBottom: 12,
  },
});

export default FormField;

