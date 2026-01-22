import React, { useState, useEffect, useMemo, useRef } from "react";
import { useFocusEffect } from "@react-navigation/native";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Pressable,
  ActivityIndicator,
  Alert,
  Platform,
} from "react-native";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import DraggableFlatList, {
  ScaleDecorator,
} from "react-native-draggable-flatlist";
import * as Haptics from "expo-haptics";
import FormField from "../components/form/FormField";
import FormFieldEdit from "../components/form/FormFieldEdit";
import FieldCreationModal from "../components/FieldCreationModal";
import { Ionicons } from "@expo/vector-icons";
import { trackerService } from "../services/trackerService";
import { dataTrackingService } from "../services/dataTrackingService";
import { colors } from "../constants/colors";
import { buildZodSchema } from "../utils/formSchemaBuilder";

export default function LogSymptomsScreen({ route, navigation }) {
  const { trackerId } = route.params || {};
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [formSchema, setFormSchema] = useState(null);
  const [managementSchema, setManagementSchema] = useState(null);
  const [existingData, setExistingData] = useState(null);
  const [entryDate] = useState(new Date().toISOString().split("T")[0]); // Today's date
  const [isEditMode, setIsEditMode] = useState(false);
  const [showFieldModal, setShowFieldModal] = useState(false);
  const [editingField, setEditingField] = useState(null);
  const [showMaskedFields, setShowMaskedFields] = useState(false);
  const [hasEditModeChanges, setHasEditModeChanges] = useState(false);
  const [pendingChanges, setPendingChanges] = useState({
    fieldToggles: new Map(), // fieldId -> { activate: boolean }
    optionToggles: new Map(), // optionId -> { activate: boolean }
    fieldEdits: new Map(), // fieldId -> { fieldData, originalField }
    fieldCreates: [], // Array of { fieldData }
    fieldDeletes: new Set(), // Set of fieldIds to delete
    optionDeletes: new Set(), // Set of optionIds to delete
    fieldOrders: new Map(), // fieldId -> newOrder
    optionOrders: new Map(), // optionId -> newOrder
  });
  const scrollViewRef = useRef(null);
  const isHandlingNavigation = useRef(false);
  const formInitializedRef = useRef(false);

  useEffect(() => {
    initializeForm();
  }, [trackerId]);

  // Automatically detect if there are pending changes
  useEffect(() => {
    if (!pendingChanges) {
      setHasEditModeChanges(false);
      return;
    }
    const hasChanges =
      (pendingChanges.fieldToggles?.size || 0) > 0 ||
      (pendingChanges.optionToggles?.size || 0) > 0 ||
      (pendingChanges.fieldEdits?.size || 0) > 0 ||
      (pendingChanges.fieldCreates?.length || 0) > 0 ||
      (pendingChanges.fieldDeletes?.size || 0) > 0 ||
      (pendingChanges.optionDeletes?.size || 0) > 0 ||
      (pendingChanges.fieldOrders?.size || 0) > 0 ||
      (pendingChanges.optionOrders?.size || 0) > 0;
    setHasEditModeChanges(hasChanges);
  }, [pendingChanges]);

  /**
   * Reload existing data when screen comes into focus
   * This ensures the form shows the latest saved data when user returns to the screen
   */
  useFocusEffect(
    React.useCallback(() => {
      // Only reload if we're not in edit mode and form is already initialized
      if (!isEditMode && formSchema && !loading) {
        const reloadExistingData = async () => {
          try {
            const response = await dataTrackingService.getDataByDate(
              trackerId,
              entryDate
            );

            // The service returns response.data from axios
            // Backend returns: { message: "...", tracking_data: { id, tracker_id, entry_date, data: {...}, ... } }
            // But the response has nested data structure, so access: response.data.tracking_data
            const trackingData =
              response?.data?.tracking_data || response?.tracking_data;
            const data = trackingData?.data;

            if (data && Object.keys(data).length > 0) {
              setExistingData(data);
            } else {
              setExistingData(null);
            }
          } catch (error) {
            // 404 means no data exists - that's fine
            if (error.response?.status === 404) {
              setExistingData(null);
            } else {
              console.error("Error reloading existing data:", error);
            }
          }
        };
        reloadExistingData();
      }
    }, [isEditMode, formSchema, loading, trackerId, entryDate])
  );

  // Handle hardware back button navigation with unsaved changes check
  useEffect(() => {
    const unsubscribe = navigation.addListener("beforeRemove", (e) => {
      // If we're already handling navigation (from back button click), allow it
      if (isHandlingNavigation.current) {
        isHandlingNavigation.current = false;
        return;
      }

      if (!isEditMode || !hasEditModeChanges) {
        // No unsaved changes, allow navigation
        return;
      }

      // Prevent default behavior of leaving the screen
      e.preventDefault();

      // Show confirmation dialog
      Alert.alert(
        "Unsaved Changes",
        "You have unsaved changes. What would you like to do?",
        [
          {
            text: "Cancel",
            style: "cancel",
            onPress: () => {},
          },
          {
            text: "Don't Save",
            style: "destructive",
            onPress: () => {
              // Clear changes and navigate back
              setHasEditModeChanges(false);
              setPendingChanges({
                fieldToggles: new Map(),
                optionToggles: new Map(),
                fieldEdits: new Map(),
                fieldCreates: [],
                fieldDeletes: new Set(),
                optionDeletes: new Set(),
                fieldOrders: new Map(),
                optionOrders: new Map(),
              });
              setEditingField(null);
              setIsEditMode(false);
              loadManagementSchema(); // Reload to revert changes
              navigation.dispatch(e.data.action);
            },
          },
          {
            text: "Save",
            onPress: async () => {
              const success = await savePendingChanges();
              if (success) {
                setIsEditMode(false);
                navigation.dispatch(e.data.action);
              }
            },
          },
        ]
      );
    });

    return unsubscribe;
  }, [navigation, isEditMode, hasEditModeChanges, pendingChanges]);

  /**
   * Initialize form: Load schema and check for existing data
   */
  const initializeForm = async () => {
    try {
      setLoading(true);

      // Step 1: Load form schema
      const schemaResponse = await trackerService.getFormSchema(trackerId);
      setFormSchema(schemaResponse);

      // Step 2: Check if data exists for today
      try {
        const response = await dataTrackingService.getDataByDate(
          trackerId,
          entryDate
        );

        // The service returns response.data from axios
        // Backend returns: { message: "...", tracking_data: { id, tracker_id, entry_date, data: {...}, ... } }
        // But the response has nested data structure, so access: response.data.tracking_data
        const trackingData =
          response?.data?.tracking_data || response?.tracking_data;
        const data = trackingData?.data;

        if (data && typeof data === "object" && Object.keys(data).length > 0) {
          setExistingData(data);
        } else {
          setExistingData(null);
        }
      } catch (error) {
        // 404 means no data exists - that's fine
        if (error.response?.status === 404) {
          setExistingData(null);
        } else {
          throw error;
        }
      }

      setLoading(false);
    } catch (error) {
      console.error("Error initializing form:", error);
      setLoading(false);
      Alert.alert("Error", "Failed to load form. Please try again.", [
        { text: "Retry", onPress: initializeForm },
        { text: "Go Back", onPress: () => navigation.goBack() },
      ]);
    }
  };

  /**
   * Get default value based on option type
   */
  const getDefaultValue = (optionType) => {
    switch (optionType) {
      case "multiple_choice":
        return [];
      case "yes_no":
        return null;
      default:
        return null;
    }
  };

  /**
   * Convert database value to form-compatible type
   */
  const convertToFormType = (value, optionType) => {
    if (value === null || value === undefined) {
      return getDefaultValue(optionType);
    }

    switch (optionType) {
      case "rating":
      case "number_input":
        const num =
          typeof value === "string" ? parseFloat(value) : Number(value);
        return isNaN(num) ? null : num;

      case "yes_no":
        if (typeof value === "boolean") return value;
        if (typeof value === "string") return value === "true" || value === "1";
        return Boolean(value);

      case "multiple_choice":
        return Array.isArray(value) ? value : value ? [value] : [];

      case "text":
      case "notes":
      case "single_choice":
      case "time":
        return String(value);

      default:
        return value;
    }
  };

  /**
   * Build form default values from schema and existing data
   */
  const defaultValues = useMemo(() => {
    if (!formSchema?.field_groups) return {};

    const defaults = {};
    const fieldGroups = formSchema.field_groups;

    // Build structure from schema
    Object.keys(fieldGroups).forEach((groupName) => {
      const group = fieldGroups[groupName];
      if (!Array.isArray(group)) return;

      group.forEach((field) => {
        if (!field.options || field.options.length === 0) return;

        defaults[field.field_name] = {};

        field.options.forEach((option) => {
          const optionName = option.option_name;

          // Check if we have existing data for this field/option
          const existingValue = existingData?.[field.field_name]?.[optionName];

          if (existingValue !== undefined && existingValue !== null) {
            // Use existing data, converting to correct type
            defaults[field.field_name][optionName] = convertToFormType(
              existingValue,
              option.option_type
            );
          } else {
            // Use default for option type
            defaults[field.field_name][optionName] = getDefaultValue(
              option.option_type
            );
          }
        });
      });
    });

    return defaults;
  }, [formSchema, existingData]);

  const zodSchema = useMemo(() => {
    if (!formSchema) return null;
    return buildZodSchema(formSchema);
  }, [formSchema]);

  const {
    control,
    handleSubmit,
    formState: { errors, isDirty },
    reset,
    getValues,
    watch,
  } = useForm({
    resolver: zodSchema ? zodResolver(zodSchema) : undefined,
    defaultValues,
    mode: "onBlur",
  });

  // Reset form when defaultValues change (after existing data loads) - only once on initial load
  useEffect(() => {
    if (
      defaultValues &&
      Object.keys(defaultValues).length > 0 &&
      formSchema &&
      !loading &&
      !formInitializedRef.current
    ) {
      reset(defaultValues);
      formInitializedRef.current = true;
    }
  }, [defaultValues, reset, formSchema, loading]);

  /**
   * Handle form submission (create or update)
   */
  const onSubmit = async (data) => {
    try {
      setSubmitting(true);

      // Use getValues as fallback if handleSubmit data is empty
      const currentValues = getValues();
      const formData = Object.keys(data).length > 0 ? data : currentValues;

      // Filter out empty values
      const cleanedData = {};
      Object.keys(formData).forEach((fieldName) => {
        const fieldData = formData[fieldName];
        if (!fieldData || typeof fieldData !== "object") return;

        Object.keys(fieldData).forEach((optionName) => {
          const value = fieldData[optionName];

          // Skip empty values
          if (value === null || value === undefined || value === "") return;
          if (Array.isArray(value) && value.length === 0) return;

          if (!cleanedData[fieldName]) {
            cleanedData[fieldName] = {};
          }
          cleanedData[fieldName][optionName] = value;
        });
      });

      // Submit to backend (save endpoint handles both create and update)
      await dataTrackingService.saveData(trackerId, cleanedData, entryDate);

      // Update state to reflect that data now exists
      setExistingData(cleanedData);

      const message = existingData
        ? "Symptoms updated successfully!"
        : "Symptoms logged successfully!";

      Alert.alert("Success", message, [
        { text: "OK", onPress: () => navigation.goBack() },
      ]);
    } catch (error) {
      console.error("Error submitting form:", error);

      let errorMessage = "Failed to save symptoms. Please try again.";
      if (error.response?.data?.error) {
        errorMessage = error.response.data.error;
      }

      Alert.alert("Error", errorMessage);
    } finally {
      setSubmitting(false);
    }
  };

  /**
   * Edit mode handlers
   */
  const handleDeleteField = (field) => {
    Alert.alert(
      "Delete Field",
      `Are you sure you want to delete "${
        field.display_label || field.field_name
      }"? This will also delete all its options.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            // Store deletion in pending changes (don't save immediately)
            setPendingChanges((prev) => {
              const newFieldDeletes = new Set(prev.fieldDeletes);
              newFieldDeletes.add(field.id);
              // Remove from edits if it was being edited
              const newFieldEdits = new Map(prev.fieldEdits);
              newFieldEdits.delete(field.id);
              return {
                ...prev,
                fieldDeletes: newFieldDeletes,
                fieldEdits: newFieldEdits,
              };
            });

            // Update UI optimistically
            setManagementSchema((prevSchema) => {
              if (!prevSchema) return prevSchema;
              const updatedSchema = { ...prevSchema };
              const fieldArrays = [
                updatedSchema.baseline_fields,
                updatedSchema.category_fields,
                updatedSchema.custom_fields,
              ];
              for (const fieldArray of fieldArrays) {
                const index = fieldArray.findIndex((f) => f.id === field.id);
                if (index !== -1) {
                  fieldArray.splice(index, 1);
                  break;
                }
              }
              return updatedSchema;
            });

            setHasEditModeChanges(true);
          },
        },
      ]
    );
  };

  const handleEditField = async (field) => {
    try {
      // Fetch full field details including all options
      const fieldDetails = await trackerService.getFieldDetails(field.id);
      const fieldData = fieldDetails.field || fieldDetails.data?.field;
      if (fieldData) {
        setEditingField(fieldData);
        setShowFieldModal(true);
      } else {
        // Fallback to using the field from schema
        setEditingField(field);
        setShowFieldModal(true);
      }
    } catch (error) {
      console.error("Error loading field details:", error);
      // Fallback to using the field from schema
      setEditingField(field);
      setShowFieldModal(true);
    }
  };

  const handleFieldReorder = (fieldId, newOrder) => {
    // Store field order change in pending changes
    setPendingChanges((prev) => {
      const updated = new Map(prev.fieldOrders);
      updated.set(fieldId, newOrder);
      return {
        ...prev,
        fieldOrders: updated,
      };
    });
    // Force hasEditModeChanges to true immediately
    setHasEditModeChanges(true);
  };

  const handleOptionReorder = (fieldId, reorderedOptions) => {
    // Store option order changes in pending changes
    setPendingChanges((prev) => {
      const updated = new Map(prev.optionOrders);
      reorderedOptions.forEach((option, index) => {
        updated.set(option.id, index);
      });
      return {
        ...prev,
        optionOrders: updated,
      };
    });

    // Optimistically update managementSchema to maintain visual order
    setManagementSchema((prev) => {
      if (!prev) return prev;

      // Update the field's options array in the appropriate section
      const updateFieldOptions = (fields) => {
        return fields?.map((field) => {
          if (field.id === fieldId) {
            return { ...field, options: reorderedOptions };
          }
          return field;
        });
      };

      return {
        ...prev,
        baseline_fields: updateFieldOptions(prev.baseline_fields),
        category_fields: updateFieldOptions(prev.category_fields),
        custom_fields: updateFieldOptions(prev.custom_fields),
      };
    });
    // Force hasEditModeChanges to true immediately
    setHasEditModeChanges(true);
  };

  const handleDeleteOption = (field, option) => {
    Alert.alert(
      "Delete Option",
      `Are you sure you want to delete "${
        option.display_label || option.option_name
      }"?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            // Store deletion in pending changes (don't save immediately)
            setPendingChanges((prev) => {
              const newOptionDeletes = new Set(prev.optionDeletes);
              newOptionDeletes.add(option.id);
              return {
                ...prev,
                optionDeletes: newOptionDeletes,
              };
            });

            // Update UI optimistically
            setManagementSchema((prevSchema) => {
              if (!prevSchema) return prevSchema;
              const updatedSchema = { ...prevSchema };
              const fieldArrays = [
                updatedSchema.baseline_fields,
                updatedSchema.category_fields,
                updatedSchema.custom_fields,
              ];
              for (const fieldArray of fieldArrays) {
                const fieldIndex = fieldArray.findIndex(
                  (f) => f.id === field.id
                );
                if (fieldIndex !== -1) {
                  const updatedField = {
                    ...fieldArray[fieldIndex],
                    options: fieldArray[fieldIndex].options.filter(
                      (opt) => opt.id !== option.id
                    ),
                  };
                  fieldArray[fieldIndex] = updatedField;
                  break;
                }
              }
              return updatedSchema;
            });

            setHasEditModeChanges(true);
          },
        },
      ]
    );
  };

  const handleAddField = () => {
    setEditingField(null);
    setShowFieldModal(true);
  };

  const handleFieldSubmit = async (fieldData) => {
    try {
      if (editingField) {
        // Update mode: Store edit in pending changes
        setPendingChanges((prev) => {
          const newFieldEdits = new Map(prev.fieldEdits);
          newFieldEdits.set(editingField.id, {
            fieldData,
            originalField: editingField,
          });
          return {
            ...prev,
            fieldEdits: newFieldEdits,
          };
        });

        // Update UI optimistically
        setManagementSchema((prevSchema) => {
          if (!prevSchema) return prevSchema;
          const updatedSchema = { ...prevSchema };
          const fieldArrays = [
            updatedSchema.baseline_fields,
            updatedSchema.category_fields,
            updatedSchema.custom_fields,
          ];
          for (const fieldArray of fieldArrays) {
            const fieldIndex = fieldArray.findIndex(
              (f) => f.id === editingField.id
            );
            if (fieldIndex !== -1) {
              const updatedField = {
                ...fieldArray[fieldIndex],
                display_label: fieldData.display_label,
                field_name: fieldData.field_name,
                options: fieldData.options.map((opt, index) => ({
                  id: opt.optionId,
                  option_name: opt.option_name,
                  option_type: opt.option_type,
                  display_label: opt.display_label,
                  option_order: index,
                  choices: opt.choices,
                  min_value: opt.min_value,
                  max_value: opt.max_value,
                  is_active: true,
                })),
              };
              fieldArray[fieldIndex] = updatedField;
              break;
            }
          }
          return updatedSchema;
        });
      } else {
        // Create mode: Store creation in pending changes
        setPendingChanges((prev) => {
          return {
            ...prev,
            fieldCreates: [...prev.fieldCreates, fieldData],
          };
        });

        // Update UI optimistically - add to custom fields
        setManagementSchema((prevSchema) => {
          if (!prevSchema) return prevSchema;
          const newField = {
            id: `pending_${Date.now()}`, // Temporary ID
            field_name: fieldData.field_name,
            display_label: fieldData.display_label,
            field_group: "custom",
            is_user_field: true,
            is_active: true,
            options: fieldData.options.map((opt, index) => ({
              id: `pending_option_${Date.now()}_${index}`,
              option_name: opt.option_name,
              option_type: opt.option_type,
              display_label: opt.display_label,
              option_order: index,
              choices: opt.choices,
              min_value: opt.min_value,
              max_value: opt.max_value,
              is_active: true,
            })),
          };
          return {
            ...prevSchema,
            custom_fields: [...(prevSchema.custom_fields || []), newField],
          };
        });
      }

      setShowFieldModal(false);
      setEditingField(null);
      setHasEditModeChanges(true);
    } catch (error) {
      console.error("Error preparing field changes:", error);
      const errorMessage =
        error.response?.data?.error ||
        error.message ||
        `Failed to prepare ${
          editingField ? "update" : "create"
        } field. Please try again.`;
      Alert.alert("Error", errorMessage);
    }
  };

  const handleAddOption = (field) => {
    // TODO: Navigate to option creation screen or show modal
    // When implemented, mark changes here
    Alert.alert(
      "Add Option",
      `Add a new option to "${field.display_label || field.field_name}"`
    );
  };

  const handleToggleField = (field, activate) => {
    // Store change locally (don't save to backend yet)
    setPendingChanges((prev) => {
      const newFieldToggles = new Map(prev.fieldToggles);
      newFieldToggles.set(field.id, { activate });
      return {
        ...prev,
        fieldToggles: newFieldToggles,
      };
    });

    // Update UI optimistically
    setManagementSchema((prevSchema) => {
      if (!prevSchema) return prevSchema;

      const updatedSchema = {
        ...prevSchema,
        baseline_fields: prevSchema.baseline_fields
          ? prevSchema.baseline_fields.map((f) => ({ ...f }))
          : [],
        category_fields: prevSchema.category_fields
          ? prevSchema.category_fields.map((f) => ({ ...f }))
          : [],
        custom_fields: prevSchema.custom_fields
          ? prevSchema.custom_fields.map((f) => ({ ...f }))
          : [],
      };

      const fieldArrays = [
        updatedSchema.baseline_fields,
        updatedSchema.category_fields,
        updatedSchema.custom_fields,
      ];

      for (const fieldArray of fieldArrays) {
        const fieldIndex = fieldArray.findIndex((f) => f.id === field.id);
        if (fieldIndex !== -1) {
          fieldArray[fieldIndex] = {
            ...fieldArray[fieldIndex],
            is_active: activate,
          };
          break;
        }
      }

      return updatedSchema;
    });

    setHasEditModeChanges(true);
  };

  const handleToggleOption = (field, option, activate) => {
    // Store change locally (don't save to backend yet)
    setPendingChanges((prev) => {
      const newOptionToggles = new Map(prev.optionToggles);
      newOptionToggles.set(option.id, { activate });
      return {
        ...prev,
        optionToggles: newOptionToggles,
      };
    });

    // Update UI optimistically
    setManagementSchema((prevSchema) => {
      if (!prevSchema) return prevSchema;

      const updatedSchema = {
        ...prevSchema,
        baseline_fields: prevSchema.baseline_fields
          ? [...prevSchema.baseline_fields]
          : [],
        category_fields: prevSchema.category_fields
          ? [...prevSchema.category_fields]
          : [],
        custom_fields: prevSchema.custom_fields
          ? [...prevSchema.custom_fields]
          : [],
      };

      const fieldArrays = [
        updatedSchema.baseline_fields,
        updatedSchema.category_fields,
        updatedSchema.custom_fields,
      ];

      for (const fieldArray of fieldArrays) {
        const fieldIndex = fieldArray.findIndex((f) => f.id === field.id);
        if (fieldIndex !== -1) {
          const fieldToUpdate = { ...fieldArray[fieldIndex] };
          if (fieldToUpdate.options) {
            fieldToUpdate.options = fieldToUpdate.options.map((opt) =>
              opt.id === option.id
                ? { ...opt, is_active: activate }
                : { ...opt }
            );
          }
          fieldArray[fieldIndex] = fieldToUpdate;
          break;
        }
      }

      return updatedSchema;
    });

    setHasEditModeChanges(true);
  };

  /**
   * Load management schema for edit mode
   */
  const loadManagementSchema = async () => {
    try {
      const schema = await trackerService.getManagementSchema(trackerId);
      setManagementSchema(schema);
    } catch (error) {
      console.error("Error loading management schema:", error);
      Alert.alert("Error", "Failed to load form editor. Please try again.");
    }
  };

  /**
   * Toggle edit mode
   */
  const savePendingChanges = async () => {
    try {
      setSubmitting(true);

      // Save all pending field toggles
      for (const [fieldId, { activate }] of pendingChanges.fieldToggles) {
        await trackerService.toggleFieldActive(fieldId);
      }

      // Save all pending option toggles
      for (const [optionId, { activate }] of pendingChanges.optionToggles) {
        await trackerService.toggleOptionActive(optionId);
      }

      // Delete fields marked for deletion
      for (const fieldId of pendingChanges.fieldDeletes) {
        await trackerService.deleteField(fieldId);
      }

      // Delete options marked for deletion
      for (const optionId of pendingChanges.optionDeletes) {
        await trackerService.deleteOption(optionId);
      }

      // Create new fields
      for (const fieldData of pendingChanges.fieldCreates) {
        await trackerService.createNewField(trackerId, fieldData);
      }

      // Update edited fields
      for (const [
        fieldId,
        { fieldData, originalField },
      ] of pendingChanges.fieldEdits) {
        // Update field display label
        await trackerService.updateFieldLabel(fieldId, fieldData.display_label);

        // Get existing option IDs
        const existingOptionIds = new Set(
          (originalField.options || []).map((opt) => opt.id)
        );
        const newOptionIds = new Set(
          fieldData.options
            .map((opt) => opt.optionId)
            .filter((id) => id !== undefined)
        );

        // Delete options that were removed
        const optionsToDelete = Array.from(existingOptionIds).filter(
          (id) => !newOptionIds.has(id)
        );
        for (const optionId of optionsToDelete) {
          await trackerService.deleteOption(optionId);
        }

        // Update existing options and create new ones
        for (let i = 0; i < fieldData.options.length; i++) {
          const option = fieldData.options[i];
          const optionData = {
            option_name: option.option_name,
            option_type: option.option_type,
            display_label: option.display_label,
            option_order: i,
          };

          // Only include type-specific fields based on option_type
          if (
            option.option_type === "rating" ||
            option.option_type === "number_input"
          ) {
            if (option.min_value !== undefined && option.min_value !== null) {
              optionData.min_value = option.min_value;
            }
            if (option.max_value !== undefined && option.max_value !== null) {
              optionData.max_value = option.max_value;
            }
            if (option.step !== undefined && option.step !== null) {
              optionData.step = option.step;
            }
          } else if (
            option.option_type === "single_choice" ||
            option.option_type === "multiple_choice"
          ) {
            if (
              option.choices &&
              Array.isArray(option.choices) &&
              option.choices.length > 0
            ) {
              optionData.choices = option.choices;
            }
            if (
              option.choice_labels &&
              Object.keys(option.choice_labels).length > 0
            ) {
              optionData.choice_labels = option.choice_labels;
            }
          } else if (
            option.option_type === "text" ||
            option.option_type === "notes"
          ) {
            if (option.max_length !== undefined && option.max_length !== null) {
              optionData.max_length = option.max_length;
            }
          }
          // For 'yes_no' and 'time' types, no additional fields needed

          if (option.optionId) {
            // Update existing option
            await trackerService.updateOption(option.optionId, optionData);
          } else {
            // Create new option
            await trackerService.createOption(fieldId, optionData);
          }
        }
      }

      // Save field order changes
      if (pendingChanges.fieldOrders) {
        for (const [fieldId, newOrder] of pendingChanges.fieldOrders) {
          await trackerService.updateFieldOrder(fieldId, newOrder);
        }
      }

      // Save option order changes
      if (pendingChanges.optionOrders) {
        for (const [optionId, newOrder] of pendingChanges.optionOrders) {
          await trackerService.updateOptionOrder(optionId, newOrder);
        }
      }

      // Reload both schemas and existing data to sync with backend
      const [schemaResponse, dataResponse] = await Promise.all([
        // Reload form schema so the form reflects the changes
        trackerService.getFormSchema(trackerId),
        // Reload existing data to ensure form shows latest saved values
        dataTrackingService
          .getDataByDate(trackerId, entryDate)
          .catch((error) => {
            // 404 means no data exists - that's fine
            if (error.response?.status === 404) {
              return null;
            }
            throw error;
          }),
      ]);

      // Also reload management schema
      await loadManagementSchema();

      // Set form schema
      setFormSchema(schemaResponse);

      // Set existing data if available
      if (dataResponse) {
        // The service returns response.data from axios
        // Backend returns: { message: "...", tracking_data: { id, tracker_id, entry_date, data: {...}, ... } }
        // But the console shows response has nested data, so try: response.data.tracking_data
        const trackingData =
          dataResponse?.data?.tracking_data || dataResponse?.tracking_data;
        const data = trackingData?.data;
        if (data && typeof data === "object" && Object.keys(data).length > 0) {
          setExistingData(data);
        } else {
          setExistingData(null);
        }
      } else {
        setExistingData(null);
      }

      // Clear pending changes
      setPendingChanges({
        fieldToggles: new Map(),
        optionToggles: new Map(),
        fieldEdits: new Map(),
        fieldCreates: [],
        fieldDeletes: new Set(),
        optionDeletes: new Set(),
        fieldOrders: new Map(),
        optionOrders: new Map(),
      });
      setHasEditModeChanges(false);

      return true;
    } catch (error) {
      console.error("Error saving changes:", error);
      const errorMessage =
        error.response?.data?.error ||
        error.message ||
        "Failed to save changes. Please try again.";
      Alert.alert("Error", errorMessage);
      return false;
    } finally {
      setSubmitting(false);
    }
  };

  const toggleEditMode = async () => {
    // If clicking checkmark in edit mode, show save confirmation
    if (isEditMode) {
      if (hasEditModeChanges) {
        Alert.alert(
          "Save Changes?",
          "Your changes will be saved.",
          [
            {
              text: "Don't Save",
              style: "destructive",
              onPress: () => {
                // Discard changes and reload original schema
                setPendingChanges({
                  fieldToggles: new Map(),
                  optionToggles: new Map(),
                  fieldEdits: new Map(),
                  fieldCreates: [],
                  fieldDeletes: new Set(),
                  optionDeletes: new Set(),
                  fieldOrders: new Map(),
                  optionOrders: new Map(),
                });
                setHasEditModeChanges(false);
                setEditingField(null);
                loadManagementSchema(); // Reload to revert changes
                setIsEditMode(false);
                setShowMaskedFields(false);
              },
            },
            {
              text: "Cancel",
              style: "cancel",
            },
            {
              text: "Save",
              onPress: async () => {
                const success = await savePendingChanges();
                if (success) {
                  setIsEditMode(false);
                  setShowMaskedFields(false);
                }
              },
            },
          ],
          { cancelable: true }
        );
      } else {
        // No changes, just exit
        setIsEditMode(false);
        setShowMaskedFields(false);
      }
      return;
    }

    // Entering edit mode - load management schema if needed
    if (!managementSchema) {
      await loadManagementSchema();
    }

    setIsEditMode(true);
    setHasEditModeChanges(false);
    setShowMaskedFields(false);
    setPendingChanges({
      fieldToggles: new Map(),
      optionToggles: new Map(),
      fieldEdits: new Map(),
      fieldCreates: [],
      fieldDeletes: new Set(),
      optionDeletes: new Set(),
      fieldOrders: new Map(),
      optionOrders: new Map(),
    });

    // Scroll to top when entering edit mode
    setTimeout(() => {
      scrollViewRef.current?.scrollTo({ y: 0, animated: true });
    }, 300);
  };

  /**
   * Get unique fields from all field groups
   */
  const fields = useMemo(() => {
    // Use management schema in edit mode, regular schema otherwise
    const schema = isEditMode ? managementSchema : formSchema;

    if (isEditMode) {
      // Management schema has a different structure: baseline_fields, category_fields, custom_fields
      if (!schema) return [];

      const allFields = [
        ...(schema.baseline_fields || []),
        ...(schema.category_fields || []),
        ...(schema.custom_fields || []),
      ];

      // Filter by active/inactive status based on showMaskedFields toggle
      // Backend handles the logic: if you mask an option and the field still has active options,
      // the field itself is not automatically masked
      if (showMaskedFields) {
        // Show only inactive fields
        return allFields.filter((field) => field.is_active === false);
      } else {
        // Show only active fields
        return allFields.filter((field) => field.is_active !== false);
      }
    } else {
      // Regular form schema has field_groups
      if (!schema?.field_groups) return [];

      const uniqueFields = [];
      const seenIds = new Set();

      Object.values(schema.field_groups).forEach((group) => {
        if (!Array.isArray(group)) return;

        group.forEach((field) => {
          const key = field.id || field.field_name;
          if (key && !seenIds.has(key)) {
            seenIds.add(key);
            uniqueFields.push(field);
          }
        });
      });

      return uniqueFields;
    }
  }, [formSchema, managementSchema, isEditMode, showMaskedFields]);

  // Loading state - Professional skeleton loader
  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Ionicons
              name="arrow-back"
              size={24}
              color={colors.textOnPrimary}
            />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Log Symptoms</Text>
          <View style={styles.placeholder} />
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
        >
          {/* Date indicator skeleton */}
          <View style={styles.dateContainer}>
            <View style={styles.skeletonIcon} />
            <View style={styles.skeletonDateText} />
          </View>

          {/* Three skeleton field sections */}
          {[1, 2, 3].map((index) => (
            <View key={index} style={styles.skeletonFieldContainer}>
              {/* Field label skeleton */}
              <View style={styles.skeletonLabel} />

              {/* Option skeletons - varying sizes */}
              <View style={styles.skeletonOptionsContainer}>
                <View style={[styles.skeletonOption, { width: "45%" }]} />
                <View style={[styles.skeletonOption, { width: "45%" }]} />
              </View>
              <View style={styles.skeletonOptionsContainer}>
                <View style={[styles.skeletonOption, { width: "60%" }]} />
              </View>
            </View>
          ))}
        </ScrollView>
      </View>
    );
  }

  // Error state
  if (!formSchema && !loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Ionicons
              name="arrow-back"
              size={24}
              color={colors.textOnPrimary}
            />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Log Symptoms</Text>
          <View style={styles.placeholder} />
        </View>
        <View style={styles.centerContainer}>
          <Ionicons
            name="alert-circle-outline"
            size={64}
            color={colors.error}
          />
          <Text style={styles.errorText}>Failed to load form</Text>
          <TouchableOpacity style={styles.retryButton} onPress={initializeForm}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Main form
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => {
            // Check for unsaved changes when clicking back button
            if (isEditMode && hasEditModeChanges) {
              // Set flag to prevent navigation listener from showing duplicate dialog
              isHandlingNavigation.current = true;

              Alert.alert(
                "Unsaved Changes",
                "You have unsaved changes. What would you like to do?",
                [
                  {
                    text: "Cancel",
                    style: "cancel",
                    onPress: () => {
                      isHandlingNavigation.current = false;
                    },
                  },
                  {
                    text: "Don't Save",
                    style: "destructive",
                    onPress: () => {
                      // Discard changes and reload original schema
                      setPendingChanges({
                        fieldToggles: new Map(),
                        optionToggles: new Map(),
                        fieldEdits: new Map(),
                        fieldCreates: [],
                        fieldDeletes: new Set(),
                        optionDeletes: new Set(),
                        fieldOrders: new Map(),
                        optionOrders: new Map(),
                      });
                      setEditingField(null);
                      loadManagementSchema(); // Reload to revert changes
                      setIsEditMode(false);
                      setShowMaskedFields(false);
                      navigation.goBack();
                    },
                  },
                  {
                    text: "Save",
                    onPress: async () => {
                      const success = await savePendingChanges();
                      if (success) {
                        setIsEditMode(false);
                        setShowMaskedFields(false);
                        navigation.goBack();
                      } else {
                        isHandlingNavigation.current = false;
                      }
                    },
                  },
                ]
              );
            } else {
              navigation.goBack();
            }
          }}
        >
          <Ionicons name="arrow-back" size={24} color={colors.textOnPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {isEditMode ? "Edit Form" : existingData ? "Update" : "Log"} Symptoms
        </Text>
        <TouchableOpacity
          style={[
            styles.headerEditButton,
            isEditMode &&
              !hasEditModeChanges &&
              styles.headerEditButtonDisabled,
            submitting && styles.headerEditButtonDisabled,
          ]}
          onPress={toggleEditMode}
          disabled={(isEditMode && !hasEditModeChanges) || submitting}
        >
          {submitting ? (
            <ActivityIndicator size="small" color={colors.textOnPrimary} />
          ) : (
            <Ionicons
              name={isEditMode ? "checkmark" : "create-outline"}
              size={24}
              color={
                isEditMode && !hasEditModeChanges
                  ? colors.textLight
                  : colors.textOnPrimary
              }
            />
          )}
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={true}
      >
        {/* Date indicator - only show in normal mode */}
        {!isEditMode && (
          <View style={styles.dateContainer}>
            <Ionicons name="calendar" size={20} color={colors.primary} />
            <Text style={styles.dateText}>
              {new Date(entryDate).toLocaleDateString("en-US", {
                weekday: "long",
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </Text>
          </View>
        )}

        {/* Edit mode indicator */}
        {isEditMode && (
          <>
            <View style={styles.editModeIndicator}>
              <Ionicons name="build-outline" size={20} color={colors.primary} />
              <Text style={styles.editModeText}>
                Edit mode - Customize your form fields and options
              </Text>
            </View>

            {/* Active/Masked Fields Toggle Buttons */}
            <View style={styles.fieldsToggleContainer}>
              <TouchableOpacity
                style={[
                  styles.fieldToggleButton,
                  !showMaskedFields && styles.fieldToggleButtonSelected,
                ]}
                onPress={() => setShowMaskedFields(false)}
              >
                <Text
                  style={[
                    styles.fieldToggleButtonText,
                    !showMaskedFields && styles.fieldToggleButtonTextSelected,
                  ]}
                >
                  Active
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.fieldToggleButton,
                  showMaskedFields && styles.fieldToggleButtonSelected,
                ]}
                onPress={() => setShowMaskedFields(true)}
              >
                <Text
                  style={[
                    styles.fieldToggleButtonText,
                    showMaskedFields && styles.fieldToggleButtonTextSelected,
                  ]}
                >
                  Masked
                </Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* Form fields */}
        {isEditMode ? (
          // Edit mode - show field editor
          <>
            {(() => {
              // Separate fields into non-reorderable and reorderable
              const nonReorderableFields = fields.filter(
                (field) =>
                  field.field_group === "baseline" ||
                  (field.field_group !== "custom" && !field.is_user_field)
              );
              const reorderableFields = fields.filter(
                (field) => field.field_group === "custom" || field.is_user_field
              );

              return (
                <>
                  {/* Non-reorderable fields (baseline, tracker-specific) */}
                  {nonReorderableFields.map((field) => (
                    <FormFieldEdit
                      key={field.id || field.field_name}
                      field={field}
                      onDeleteField={handleDeleteField}
                      onEditField={handleEditField}
                      onDeleteOption={handleDeleteOption}
                      onAddOption={handleAddOption}
                      onToggleField={handleToggleField}
                      onToggleOption={handleToggleOption}
                    />
                  ))}

                  {/* Separator between non-reorderable and custom fields */}
                  {nonReorderableFields.length > 0 &&
                    reorderableFields.length > 0 && (
                      <View style={styles.fieldGroupSeparator}>
                        <View style={styles.separatorLine} />
                        <Text style={styles.separatorText}>Custom Fields</Text>
                        <View style={styles.separatorLine} />
                      </View>
                    )}

                  {/* Hint text for dragging */}
                  {reorderableFields.length > 0 && (
                    <Text style={styles.dragHintText}>
                      Long press field or option names to reorder
                    </Text>
                  )}

                  {/* Reorderable fields (custom/user) - using DraggableFlatList */}
                  {reorderableFields.length > 0 && (
                    <View style={styles.draggableFieldsContainer}>
                      <DraggableFlatList
                        data={reorderableFields}
                        onDragEnd={({ data }) => {
                          // Update order for each field based on new position
                          data.forEach((field, index) => {
                            handleFieldReorder(field.id, index);
                          });

                          // Optimistically update managementSchema to maintain visual order
                          setManagementSchema((prev) => {
                            if (!prev || !prev.custom_fields) return prev;

                            // Replace custom_fields with the reordered data
                            return {
                              ...prev,
                              custom_fields: data,
                            };
                          });
                        }}
                        keyExtractor={(item) =>
                          String(item.id || item.field_name)
                        }
                        renderItem={({ item: field, drag, isActive }) => (
                          <ScaleDecorator>
                            <View
                              style={[isActive && styles.draggableFieldActive]}
                            >
                              <FormFieldEdit
                                field={field}
                                onDeleteField={handleDeleteField}
                                onEditField={handleEditField}
                                onDeleteOption={handleDeleteOption}
                                onAddOption={handleAddOption}
                                onToggleField={handleToggleField}
                                onToggleOption={handleToggleOption}
                                onDragField={() => {
                                  Haptics.impactAsync(
                                    Haptics.ImpactFeedbackStyle.Medium
                                  );
                                  drag();
                                }}
                                onOptionReorder={handleOptionReorder}
                                isReorderable={true}
                              />
                            </View>
                          </ScaleDecorator>
                        )}
                        scrollEnabled={false}
                      />
                    </View>
                  )}
                </>
              );
            })()}

            {/* Add field button - smaller, on the right - only show for active fields */}
            {!showMaskedFields && (
              <View style={styles.addFieldButtonContainer}>
                <TouchableOpacity
                  style={styles.addFieldButtonSmall}
                  onPress={handleAddField}
                >
                  <Ionicons
                    name="add-circle-outline"
                    size={18}
                    color={colors.primary}
                  />
                  <Text style={styles.addFieldTextSmall}>Add New Field</Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        ) : (
          // Normal mode - show form
          fields.map((field) => (
            <FormField
              key={field.id || field.field_name}
              field={field}
              control={control}
            />
          ))
        )}

        {/* Submit and Edit buttons */}
        {!isEditMode && (
          <View style={styles.bottomButtonsContainer}>
            <TouchableOpacity
              style={[
                styles.submitButton,
                (!isDirty || submitting) && styles.submitButtonDisabled,
              ]}
              onPress={handleSubmit(onSubmit)}
              disabled={!isDirty || submitting}
            >
              {submitting ? (
                <ActivityIndicator size="small" color={colors.textOnPrimary} />
              ) : (
                <>
                  <Ionicons
                    name="checkmark"
                    size={20}
                    color={colors.textOnPrimary}
                    style={styles.buttonIcon}
                  />
                  <Text style={styles.submitButtonText}>
                    {existingData ? "Update" : "Submit"}
                  </Text>
                </>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.editFormButton}
              onPress={toggleEditMode}
            >
              <Ionicons
                name="create-outline"
                size={20}
                color={colors.primary}
              />
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* Field Creation Modal */}
      <FieldCreationModal
        visible={showFieldModal}
        onClose={() => {
          setShowFieldModal(false);
          setEditingField(null);
        }}
        onSubmit={handleFieldSubmit}
        editingField={editingField}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    paddingTop: 60,
    backgroundColor: colors.navigation,
    borderBottomWidth: 1,
    borderBottomColor: colors.navigation,
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: colors.textOnPrimary,
  },
  headerSubmitButton: {
    padding: 4,
    width: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  headerSubmitButtonDisabled: {
    opacity: 0.4,
  },
  headerEditButton: {
    padding: 4,
    width: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  headerEditButtonDisabled: {
    opacity: 0.4,
  },
  placeholder: {
    width: 32,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    backgroundColor: colors.formSchemaBackground,
  },
  dateContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.background,
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
  },
  dateText: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.text,
    marginLeft: 10,
  },
  editModeIndicator: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  editModeText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.text,
    marginLeft: 10,
    flex: 1,
  },
  fieldsToggleContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
    marginHorizontal: 20,
    gap: 8,
  },
  fieldToggleButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  fieldToggleButtonSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  fieldToggleButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.text,
  },
  fieldToggleButtonTextSelected: {
    color: colors.textOnPrimary,
  },
  bottomButtonsContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 20,
    marginBottom: 40,
    gap: 12,
  },
  bottomButtonsContainerCentered: {
    justifyContent: "center",
  },
  submitButton: {
    backgroundColor: colors.primary,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 50,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    alignSelf: "flex-start",
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  buttonIcon: {
    marginRight: 8,
  },
  submitButtonText: {
    color: colors.textOnPrimary,
    fontSize: 16,
    fontWeight: "600",
  },
  editFormButton: {
    backgroundColor: colors.surface,
    padding: 12,
    borderRadius: 50,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  editFormButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  addFieldButtonContainer: {
    alignItems: "flex-end",
    marginBottom: 16,
    marginHorizontal: 20,
  },
  addFieldButtonSmall: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.formFieldBackground,
    borderRadius: 50,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: colors.primary,
    gap: 8,
  },
  addFieldTextSmall: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.primary,
  },
  fieldGroupSeparator: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 24,
    marginHorizontal: 0,
  },
  separatorLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
    opacity: 0.3,
  },
  separatorText: {
    marginHorizontal: 16,
    fontSize: 11,
    fontWeight: "600",
    color: colors.textLight,
    textTransform: "uppercase",
    letterSpacing: 1.5,
    opacity: 0.6,
  },
  dragHintText: {
    fontSize: 11,
    color: colors.textLight,
    textAlign: "center",
    marginBottom: 16,
    opacity: 0.5,
    fontStyle: "italic",
  },
  draggableFieldsContainer: {
    paddingTop: 8,
  },
  draggableFieldActive: {
    opacity: 0.6,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: colors.textSecondary,
  },
  errorText: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.error,
    marginTop: 16,
    marginBottom: 24,
    textAlign: "center",
  },
  retryButton: {
    backgroundColor: colors.primary,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  retryButtonText: {
    color: colors.textOnPrimary,
    fontSize: 16,
    fontWeight: "600",
  },
  // Skeleton loader styles
  skeletonIcon: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.border,
    opacity: 0.3,
  },
  skeletonDateText: {
    width: 200,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.border,
    opacity: 0.3,
    marginLeft: 10,
  },
  skeletonFieldContainer: {
    backgroundColor: colors.formFieldBackground,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    marginHorizontal: 20,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  skeletonLabel: {
    width: 120,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.border,
    opacity: 0.3,
    marginBottom: 12,
  },
  skeletonOptionsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: 12,
    gap: 8,
  },
  skeletonOption: {
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.border,
    opacity: 0.2,
    marginBottom: 8,
  },
});
