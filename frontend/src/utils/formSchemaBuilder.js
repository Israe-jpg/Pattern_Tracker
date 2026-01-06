import { z } from "zod";

/**
 * Builds a Zod schema dynamically from the form schema structure
 * @param {Object} formSchema - The form schema from the backend
 * @returns {z.ZodObject} - A Zod schema object
 */
export function buildZodSchema(formSchema) {
  if (!formSchema?.fieldGroups) {
    return z.object({});
  }

  const schemaShape = {};

  // Process all field groups
  for (const groupName in formSchema.fieldGroups) {
    const group = formSchema.fieldGroups[groupName];
    let fieldsToProcess = [];

    // Handle both array and object formats
    if (Array.isArray(group)) {
      fieldsToProcess = group;
    } else if (group && typeof group === "object") {
      // Convert schema format to fields format
      fieldsToProcess = convertSchemaToFields(group, groupName);
    }

    // Process each field
    for (const field of fieldsToProcess) {
      if (!field || !field.field_name) continue;

      const fieldSchema = {};

      // Process each option in the field
      if (field.options && Array.isArray(field.options)) {
        for (const option of field.options) {
          if (!option.option_name) continue;

          let optionSchema;

          switch (option.option_type) {
            case "rating":
            case "number_input":
              optionSchema = z
                .number()
                .nullable()
                .optional()
                .refine(
                  (val) => {
                    if (val === null || val === undefined) return true;
                    const min = option.min_value ?? 0;
                    const max = option.max_value ?? 10;
                    return val >= min && val <= max;
                  },
                  {
                    message: `Value must be between ${option.min_value ?? 0} and ${option.max_value ?? 10}`,
                  }
                );
              break;

            case "text":
            case "notes":
              optionSchema = z
                .string()
                .nullable()
                .optional()
                .refine(
                  (val) => {
                    if (!val) return true;
                    if (option.max_length) {
                      return val.length <= option.max_length;
                    }
                    return true;
                  },
                  {
                    message: option.max_length
                      ? `Text must be ${option.max_length} characters or less`
                      : "Invalid text",
                  }
                );
              break;

            case "yes_no":
              optionSchema = z.boolean().nullable().optional();
              break;

            case "single_choice":
              optionSchema = z
                .string()
                .nullable()
                .optional()
                .refine(
                  (val) => {
                    if (!val) return true;
                    return option.choices?.includes(val) ?? true;
                  },
                  { message: "Invalid choice selected" }
                );
              break;

            case "multiple_choice":
              optionSchema = z
                .array(z.string())
                .nullable()
                .optional()
                .refine(
                  (val) => {
                    if (!val || val.length === 0) return true;
                    return val.every((v) => option.choices?.includes(v) ?? true);
                  },
                  { message: "Invalid choices selected" }
                );
              break;

            default:
              optionSchema = z.any().nullable().optional();
          }

          fieldSchema[option.option_name] = optionSchema;
        }
      }

      // Create nested structure: fieldName.optionName
      if (Object.keys(fieldSchema).length > 0) {
        schemaShape[field.field_name] = z.object(fieldSchema).optional();
      }
    }
  }

  return z.object(schemaShape);
}

/**
 * Helper function to convert schema format to fields format
 * (Same as in LogSymptomsScreen)
 */
function convertSchemaToFields(schemaObj, groupName) {
  if (
    !schemaObj ||
    typeof schemaObj !== "object" ||
    Array.isArray(schemaObj)
  ) {
    return [];
  }

  const fields = [];

  for (const fieldName in schemaObj) {
    const fieldSchema = schemaObj[fieldName];
    if (!fieldSchema || typeof fieldSchema !== "object") continue;

    const options = [];
    let optionOrder = 0;

    for (const optionName in fieldSchema) {
      const optionSchema = fieldSchema[optionName];
      if (!optionSchema || typeof optionSchema !== "object") continue;

      let optionType = "text";
      if (optionSchema.type === "integer" || optionSchema.type === "float") {
        if (
          optionSchema.range &&
          optionSchema.range[0] !== null &&
          optionSchema.range[1] !== null
        ) {
          optionType = "rating";
        } else {
          optionType = "number_input";
        }
      } else if (optionSchema.type === "string") {
        if (optionSchema.enum) {
          optionType = "single_choice";
        } else {
          optionType = optionSchema.max_length ? "notes" : "text";
        }
      } else if (optionSchema.type === "array") {
        optionType = "multiple_choice";
      } else if (optionSchema.type === "boolean") {
        optionType = "yes_no";
      }

      const option = {
        id: `${fieldName}_${optionName}`,
        option_name: optionName,
        display_label:
          optionSchema.labels?.[optionName] ||
          optionName
            .split("_")
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
            .join(" "),
        option_type: optionType,
        option_order: optionOrder++,
        optional: optionSchema.optional || false,
      };

      if (optionType === "rating" || optionType === "number_input") {
        option.min_value = optionSchema.range?.[0] ?? 0;
        option.max_value = optionSchema.range?.[1] ?? 10;
        option.labels = optionSchema.labels || {};
      }

      if (
        optionType === "single_choice" ||
        optionType === "multiple_choice"
      ) {
        option.choices = optionSchema.enum || [];
        option.choice_labels = optionSchema.labels || {};
      }

      if (optionType === "text" || optionType === "notes") {
        option.max_length = optionSchema.max_length;
        option.placeholder = optionSchema.placeholder;
      }

      options.push(option);
    }

    if (options.length > 0) {
      fields.push({
        id: `${groupName}_${fieldName}`,
        field_name: fieldName,
        display_label: fieldName
          .split("_")
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(" "),
        field_group: groupName,
        options: options,
      });
    }
  }

  return fields;
}

