import { useState } from "react";
import {
  getDaysInMonth,
  generateYears,
  generateMonths,
  generateDays,
  generateHeightValues,
  generateWeightValues,
  formatDateToYMD,
  heightSelectionToString,
  weightSelectionToString,
} from "../utils/pickerHelpers";

/**
 * Custom hook to manage date, height, and weight picker state and logic
 */
export const useHealthPickers = (initialUnitSystem = "metric") => {
  // Date picker state
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedDate, setSelectedDate] = useState(() => {
    const defaultDate = new Date();
    defaultDate.setFullYear(defaultDate.getFullYear() - 25);
    return defaultDate;
  });

  // Height picker state
  const [showHeightPicker, setShowHeightPicker] = useState(false);
  const [selectedHeight, setSelectedHeight] = useState({
    metric: 170, // Default 170 cm
    feet: 5,
    inches: 7,
  });

  // Weight picker state
  const [showWeightPicker, setShowWeightPicker] = useState(false);
  const [selectedWeight, setSelectedWeight] = useState({
    metric: 70, // Default 70 kg
    imperial: 154, // Default 154 lbs
  });

  /**
   * Generate picker columns for date selection
   */
  const getDatePickerColumns = () => {
    const months = generateMonths();
    return [
      {
        label: "Year",
        data: generateYears(),
        isSelected: (year) => selectedDate.getFullYear() === year,
        onSelect: (year) => {
          const newDate = new Date(selectedDate);
          newDate.setFullYear(year);
          const daysInMonth = getDaysInMonth(year, newDate.getMonth());
          if (newDate.getDate() > daysInMonth) {
            newDate.setDate(daysInMonth);
          }
          setSelectedDate(newDate);
        },
        formatValue: (year) => year.toString(),
      },
      {
        label: "Month",
        data: months.map((month, index) => ({ month, index })),
        isSelected: (item) => selectedDate.getMonth() === item.index,
        onSelect: (item) => {
          const newDate = new Date(selectedDate);
          newDate.setMonth(item.index);
          const daysInMonth = getDaysInMonth(newDate.getFullYear(), item.index);
          if (newDate.getDate() > daysInMonth) {
            newDate.setDate(daysInMonth);
          }
          setSelectedDate(newDate);
        },
        formatValue: (item) => item.month,
      },
      {
        label: "Day",
        data: generateDays(selectedDate.getFullYear(), selectedDate.getMonth()),
        isSelected: (day) => selectedDate.getDate() === day,
        onSelect: (day) => {
          const newDate = new Date(selectedDate);
          newDate.setDate(day);
          setSelectedDate(newDate);
        },
        formatValue: (day) => day.toString(),
      },
    ];
  };

  /**
   * Generate picker columns for height selection
   */
  const getHeightPickerColumns = (unitSystem) => {
    if (unitSystem === "metric") {
      return [
        {
          label: "Centimeters",
          data: generateHeightValues(unitSystem),
          key: "metric",
          isSelected: (value) => selectedHeight.metric === value,
          onSelect: (value) => {
            setSelectedHeight({ ...selectedHeight, metric: value });
          },
          formatValue: (value) => `${value} cm`,
        },
      ];
    } else {
      const heightValues = generateHeightValues(unitSystem);
      return [
        {
          label: "Feet",
          data: heightValues.feet,
          key: "feet",
          isSelected: (value) => selectedHeight.feet === value,
          onSelect: (value) => {
            setSelectedHeight({ ...selectedHeight, feet: value });
          },
          formatValue: (value) => `${value}'`,
        },
        {
          label: "Inches",
          data: heightValues.inches,
          key: "inches",
          isSelected: (value) => selectedHeight.inches === value,
          onSelect: (value) => {
            setSelectedHeight({ ...selectedHeight, inches: value });
          },
          formatValue: (value) => `${value}"`,
        },
      ];
    }
  };

  /**
   * Generate picker columns for weight selection
   */
  const getWeightPickerColumns = (unitSystem) => [
    {
      label: unitSystem === "metric" ? "Kilograms" : "Pounds",
      data: generateWeightValues(unitSystem),
      key: unitSystem === "metric" ? "metric" : "imperial",
      isSelected: (value) => {
        const currentValue =
          unitSystem === "metric"
            ? selectedWeight.metric
            : selectedWeight.imperial;
        return currentValue === value;
      },
      onSelect: (value) => {
        if (unitSystem === "metric") {
          setSelectedWeight({ ...selectedWeight, metric: value });
        } else {
          setSelectedWeight({ ...selectedWeight, imperial: value });
        }
      },
      formatValue: (value) =>
        `${value} ${unitSystem === "metric" ? "kg" : "lbs"}`,
    },
  ];

  /**
   * Handle date selection and return formatted date
   */
  const handleDateSelect = (onDateChange, onErrorClear) => {
    const formattedDate = formatDateToYMD(selectedDate);
    if (onDateChange) {
      onDateChange(formattedDate);
    }
    setShowDatePicker(false);
    if (onErrorClear) {
      onErrorClear();
    }
    return formattedDate;
  };

  /**
   * Handle height selection and return formatted height
   */
  const handleHeightSelect = (unitSystem, onHeightChange, onErrorClear) => {
    const heightValue = heightSelectionToString(selectedHeight, unitSystem);
    if (onHeightChange) {
      onHeightChange(heightValue);
    }
    setShowHeightPicker(false);
    if (onErrorClear) {
      onErrorClear();
    }
    return heightValue;
  };

  /**
   * Handle weight selection and return formatted weight
   */
  const handleWeightSelect = (unitSystem, onWeightChange, onErrorClear) => {
    const weightValue = weightSelectionToString(selectedWeight, unitSystem);
    if (onWeightChange) {
      onWeightChange(weightValue);
    }
    setShowWeightPicker(false);
    if (onErrorClear) {
      onErrorClear();
    }
    return weightValue;
  };

  /**
   * Initialize selected date from a date string
   */
  const initializeDate = (dateString) => {
    if (dateString) {
      const parsedDate = new Date(dateString);
      if (!isNaN(parsedDate.getTime())) {
        setSelectedDate(parsedDate);
      }
    }
  };

  /**
   * Initialize selected height from height value and unit system
   */
  const initializeHeight = (height, unitSystem) => {
    if (height) {
      const heightNum = parseFloat(height);
      if (!isNaN(heightNum)) {
        if (unitSystem === "metric") {
          setSelectedHeight((prev) => ({ ...prev, metric: heightNum }));
        } else {
          const feet = Math.floor(heightNum / 12);
          const inches = Math.round(heightNum % 12);
          setSelectedHeight((prev) => ({ ...prev, feet, inches }));
        }
      }
    }
  };

  /**
   * Initialize selected weight from weight value and unit system
   */
  const initializeWeight = (weight, unitSystem) => {
    if (weight) {
      const weightNum = parseFloat(weight);
      if (!isNaN(weightNum)) {
        if (unitSystem === "metric") {
          setSelectedWeight((prev) => ({ ...prev, metric: weightNum }));
        } else {
          setSelectedWeight((prev) => ({ ...prev, imperial: weightNum }));
        }
      }
    }
  };

  return {
    // Date picker
    showDatePicker,
    setShowDatePicker,
    selectedDate,
    setSelectedDate,
    getDatePickerColumns,
    handleDateSelect,
    initializeDate,

    // Height picker
    showHeightPicker,
    setShowHeightPicker,
    selectedHeight,
    setSelectedHeight,
    getHeightPickerColumns,
    handleHeightSelect,
    initializeHeight,

    // Weight picker
    showWeightPicker,
    setShowWeightPicker,
    selectedWeight,
    setSelectedWeight,
    getWeightPickerColumns,
    handleWeightSelect,
    initializeWeight,
  };
};
