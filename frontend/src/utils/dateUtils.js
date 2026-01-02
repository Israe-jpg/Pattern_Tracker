/**
 * Date utility functions
 */

/**
 * Format date to YYYY-MM-DD
 */
export const formatDate = (date) => {
  if (!date) return null;
  
  const d = date instanceof Date ? date : new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  
  return `${year}-${month}-${day}`;
};

/**
 * Get today's date in YYYY-MM-DD format
 */
export const getToday = () => {
  return formatDate(new Date());
};

/**
 * Get date string for display (e.g., "Jan 15, 2025")
 */
export const formatDateDisplay = (date) => {
  if (!date) return '';
  
  const d = date instanceof Date ? date : new Date(date);
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

/**
 * Add days to a date
 */
export const addDays = (date, days) => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};

/**
 * Get start and end of week for a given date
 */
export const getWeekRange = (date) => {
  const d = date instanceof Date ? date : new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
  
  const start = new Date(d.setDate(diff));
  const end = addDays(start, 6);
  
  return {
    start: formatDate(start),
    end: formatDate(end),
  };
};

/**
 * Get start and end of month for a given date
 */
export const getMonthRange = (date) => {
  const d = date instanceof Date ? date : new Date(date);
  const start = new Date(d.getFullYear(), d.getMonth(), 1);
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  
  return {
    start: formatDate(start),
    end: formatDate(end),
  };
};

