/**
 * Temperature conversion utilities
 * Backend stores temperature in Fahrenheit (range: 95.0 - 102.0)
 * Frontend can display/input in either Celsius or Fahrenheit
 */

/**
 * Convert Celsius to Fahrenheit
 * @param {number} celsius - Temperature in Celsius
 * @returns {number} Temperature in Fahrenheit
 */
export function celsiusToFahrenheit(celsius) {
  if (celsius === null || celsius === undefined) return null;
  return Math.round(((celsius * 9) / 5 + 32) * 10) / 10;
}

/**
 * Convert Fahrenheit to Celsius
 * @param {number} fahrenheit - Temperature in Fahrenheit
 * @returns {number} Temperature in Celsius
 */
export function fahrenheitToCelsius(fahrenheit) {
  if (fahrenheit === null || fahrenheit === undefined) return null;
  return Math.round((((fahrenheit - 32) * 5) / 9) * 10) / 10;
}

/**
 * Convert temperature to backend format (Fahrenheit)
 * @param {number} value - Temperature value
 * @param {string} unit - 'celsius' or 'fahrenheit'
 * @returns {number} Temperature in Fahrenheit
 */
export function convertToBackendFormat(value, unit) {
  if (value === null || value === undefined) return null;
  if (unit === "celsius") {
    return celsiusToFahrenheit(value);
  }
  return value; // Already in Fahrenheit
}

/**
 * Convert temperature from backend format (Fahrenheit) to display unit
 * @param {number} value - Temperature in Fahrenheit (from backend)
 * @param {string} unit - 'celsius' or 'fahrenheit'
 * @returns {number} Temperature in requested unit
 */
export function convertFromBackendFormat(value, unit) {
  if (value === null || value === undefined) return null;
  if (unit === "celsius") {
    return fahrenheitToCelsius(value);
  }
  return value; // Already in Fahrenheit
}

/**
 * Get temperature range for input based on unit
 * @param {string} unit - 'celsius' or 'fahrenheit'
 * @returns {object} { min, max } range
 */
export function getTemperatureRange(unit) {
  // Backend range: 95.0 - 102.0 Fahrenheit
  if (unit === "celsius") {
    return {
      min: Math.round(fahrenheitToCelsius(95.0) * 10) / 10, // ~35.0°C
      max: Math.round(fahrenheitToCelsius(102.0) * 10) / 10, // ~38.9°C
    };
  }
  return {
    min: 95.0,
    max: 102.0,
  };
}

