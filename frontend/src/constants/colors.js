// App Color Palette
// Main Colors (from provided palette, excluding black):
// #F5F5D5, #C7B793, #A3B68A, #5C724A, #354A2F

// App Name
export const APP_NAME = "Trackt.";

export const colors = {
  // Primary Colors (for buttons, headers, main actions)
  primary: "#5C724A", // Earthy olive green
  primaryDark: "#354A2F", // Deep green
  primaryLight: "#A3B68A", // Soft sage

  // Secondary/Accent Colors
  secondary: "#C7B793", // Warm sand
  secondaryDark: "#A89A79", // Deeper sand
  secondaryLight: "#E0D5BC", // Light sand

  // Background & Surface Colors
  background: "#FFFCF7", // Blanc casse (off-white) background
  surface: "#C7B793", // Warm surface tone
  border: "#A3B68A", // Muted green border
  
  // Specific UI Element Colors
  navigation: "#354A2F", // Deep green for nav/header
  navigationDark: "#2A3B26", // Darker green for separators
  navigationLight: "#5C724A", // Lighter navigation state
  trackerItem: "#5C724A", // Tracker chips/buttons
  trackerItemLight: "#7E946A", // Lighter tracker borders/dividers
  calendar: "#FFFCF7", // Match off-white app background
  calendarShadow: "#DDE8CC", // Soft light green shadow for calendar edges
  formSchemaBackground: "#FFFCF7", // Off-white for Log Symptoms background
  formFieldBackground: "#FFFFFF", // White for form fields
  insightsCard: "#FFF3DD", // Bright beige cream for insights cards
  selected: "#A3B68A", // Sage for selected items
  slider: "#5C724A", // Green for sliders

  // Text Colors
  text: "#354A2F", // Deep green text
  textSecondary: "#5C724A", // Secondary green text
  textLight: "#7E946A", // Muted light text
  textOnPrimary: "#FFFFFF", // White text on primary background
  textOnSecondary: "#354A2F", // Dark green text on sand background

  // Status Colors
  success: "#10B981",
  warning: "#F59E0B",
  error: "#EF4444",
  info: "#5C724A", // Use primary green for info

  // Health Tracker Specific - Cycle Phases
  menstrual: "#8B1538", // Red burgundy for period
  ovulation: "#BFD7A5", // More apparent autumn sage
  exactOvulation: "#10B981", // Green for exact ovulation day (using success green)
  follicular: "#DDB9C1", // Pastel burgundy
  luteal: "#C8A88F", // Brownish autumn tone
  // Legacy support
  period: "#EF4444",
  fertile: "#F59E0B",

  // Chart Colors (using main palette)
  chart1: "#5C724A", // Primary green
  chart2: "#C7B793", // Sand
  chart3: "#A3B68A", // Sage
  chart4: "#354A2F", // Deep green
  chart5: "#FFF7E6", // Cream
};
