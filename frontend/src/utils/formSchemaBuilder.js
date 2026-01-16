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

  for (const groupName in formSchema.fieldGroups) {
    const group = formSchema.fieldGroups[groupName];
    if (!Array.isArray(group)) continue;
    for (const field of group) {
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

            case "time":
              optionSchema = z
                .string()
                .nullable()
                .optional()
                .refine(
                  (val) => {
                    if (!val) return true;
                    // Validate time format: HH:MM AM/PM
                    return /^(0?[1-9]|1[0-2]):[0-5][0-9]\s?(AM|PM)$/i.test(val);
                  },
                  {
                    message: "Invalid time format. Use HH:MM AM/PM",
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
