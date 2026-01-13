/**
 * Helper functions for date, height, and weight pickers
 */

/**
 * Get the number of days in a specific month
 */
export const getDaysInMonth = (year, month) => {
  return new Date(year, month + 1, 0).getDate();
};

/**
 * Generate array of years (current year to 120 years ago)
 */
export const generateYears = () => {
  const currentYear = new Date().getFullYear();
  const years = [];
  for (let i = currentYear; i >= currentYear - 120; i--) {
    years.push(i);
  }
  return years;
};

/**
 * Generate array of month names
 */
export const generateMonths = () => {
  return [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
};

/**
 * Generate array of days for a specific year and month
 */
export const generateDays = (year, month) => {
  const daysInMonth = getDaysInMonth(year, month);
  const days = [];
  for (let i = 1; i <= daysInMonth; i++) {
    days.push(i);
  }
  return days;
};

/**
 * Generate height values based on unit system
 */
export const generateHeightValues = (unitSystem) => {
  if (unitSystem === "metric") {
    // Generate cm values from 120 to 250
    const values = [];
    for (let i = 120; i <= 250; i++) {
      values.push(i);
    }
    return values;
  } else {
    // Generate feet (4-8) and inches (0-11)
    return {
      feet: [4, 5, 6, 7, 8],
      inches: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    };
  }
};

/**
 * Generate weight values based on unit system
 */
export const generateWeightValues = (unitSystem) => {
  if (unitSystem === "metric") {
    // Generate kg values from 30 to 300
    const values = [];
    for (let i = 30; i <= 300; i++) {
      values.push(i);
    }
    return values;
  } else {
    // Generate lbs values from 66 to 700
    // 30 kg ≈ 66 lbs
    const values = [];
    for (let i = 66; i <= 700; i++) {
      values.push(i);
    }
    return values;
  }
};

/**
 * Format date string for display
 */
export const formatDateForDisplay = (dateString) => {
  if (!dateString) return "";
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
};

/**
 * Format height for display based on unit system
 */
export const formatHeightForDisplay = (height, unitSystem) => {
  if (!height) return "";
  if (unitSystem === "metric") {
    return `${height} cm`;
  } else {
    // Convert inches to feet and inches
    const totalInches = parseFloat(height);
    if (isNaN(totalInches)) return "";
    const feet = Math.floor(totalInches / 12);
    const inches = Math.round(totalInches % 12);
    return `${feet}'${inches}"`;
  }
};

/**
 * Format weight for display based on unit system
 */
export const formatWeightForDisplay = (weight, unitSystem) => {
  if (!weight) return "";
  return unitSystem === "metric" ? `${weight} kg` : `${weight} lbs`;
};

/**
 * Convert date object to YYYY-MM-DD string
 */
export const formatDateToYMD = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

/**
 * Convert height selection to string value
 */
export const heightSelectionToString = (selectedHeight, unitSystem) => {
  if (unitSystem === "metric") {
    return selectedHeight.metric?.toString() || "";
  } else {
    const totalInches = selectedHeight.feet * 12 + selectedHeight.inches;
    return totalInches.toString();
  }
};

/**
 * Convert weight selection to string value
 */
export const weightSelectionToString = (selectedWeight, unitSystem) => {
  return unitSystem === "metric"
    ? selectedWeight.metric?.toString() || ""
    : selectedWeight.imperial?.toString() || "";
};

