import Constants from "expo-constants";

let Platform;
try {
  Platform = require("react-native").Platform;
} catch (e) {
  Platform = { OS: "web" };
}

const isDev =
  typeof __DEV__ !== "undefined"
    ? __DEV__
    : process.env.NODE_ENV !== "production";

const COMPUTER_IP = Constants.expoConfig?.extra?.computerIp;
const PRODUCTION_URL = Constants.expoConfig?.extra?.productionApiUrl;

let baseURL;
if (isDev) {
  if (Platform.OS === "web") {
    baseURL = "http://localhost:5000/api";
  } else {
    if (!COMPUTER_IP) {
      throw new Error(
        "COMPUTER_IP is not set. Please create a .env file in the frontend folder with:\n" +
          "COMPUTER_IP=your_computer_ip_address\n\n" +
          "To find your IP:\n" +
          "Windows: Run 'ipconfig' and look for IPv4 Address\n" +
          "Mac/Linux: Run 'ifconfig' or 'ip addr' and look for inet"
      );
    }
    baseURL = `http://${COMPUTER_IP}:5000/api`;
  }
} else {
  if (!PRODUCTION_URL) {
    throw new Error(
      "PRODUCTION_API_URL is not set. Please create a .env file with:\n" +
        "PRODUCTION_API_URL=https://your-production-api-url.com/api"
    );
  }
  baseURL = PRODUCTION_URL;
}

export const API_BASE_URL = baseURL;

// API Endpoints
export const API_ENDPOINTS = {
  // Auth
  REGISTER: "/auth/register",
  LOGIN: "/auth/login",
  LOGOUT: "/auth/logout",
  USER_SEX: (id) => `/auth/${id}/obtain-user-sex-info`,
  USER_OPTIONAL_INFO: (id) => `/auth/${id}/obtain-optional-user-info`,
  PROFILE: "/auth/profile",
  REFRESH: "/auth/refresh",

  // Trackers
  MY_TRACKERS: "/trackers/my-trackers",
  SETUP_DEFAULT_TRACKERS: "/trackers/setup-default-trackers",
  TRACKER_DETAILS: (id) => `/trackers/${id}/tracker-details`,
  FORM_SCHEMA: (id) => `/trackers/${id}/form-schema`,
  MANAGEMENT_SCHEMA: (id) => `/trackers/${id}/management-schema`,
  CREATE_CUSTOM_TRACKER: "/trackers/create-custom-category",
  TRACKER_SETTINGS: (id) => `/trackers/${id}/tracker-settings`,
  UPDATE_DEFAULT_TRACKER: (id) => `/trackers/update-default-tracker/${id}`,
  CREATE_NEW_FIELD: (id) => `/trackers/${id}/create-new-field`,
  DELETE_FIELD: (fieldId) => `/trackers/${fieldId}/delete-field`,
  DELETE_OPTION: (optionId) => `/trackers/${optionId}/delete-option`,
  GET_FIELD_DETAILS: (fieldId) => `/trackers/${fieldId}/field-details`,
  UPDATE_FIELD_LABEL: (fieldId) => `/trackers/${fieldId}/update-field-display-label`,
  UPDATE_OPTION: (optionId) => `/trackers/${optionId}/update-option-info`,
  CREATE_OPTION: (fieldId) => `/trackers/${fieldId}/create-new-option`,
  TOGGLE_FIELD_ACTIVE: (fieldId) => `/trackers/${fieldId}/toggle-field-active-status`,
  TOGGLE_OPTION_ACTIVE: (optionId) => `/trackers/${optionId}/toggle-option-active-status`,
  UPDATE_FIELD_ORDER: (fieldId) => `/trackers/${fieldId}/update-field-order`,
  UPDATE_OPTION_ORDER: (optionId) => `/trackers/${optionId}/update-option-order`,
  COMPLETE_SCHEMA: (id) => `/trackers/${id}/complete-schema`,
  // User-facing config export (PDF) – matches backend route /export-config
  EXPORT_SCHEMA: (id) => `/trackers/${id}/export-config`,
  // Period Tracker cycles history
  CYCLES_HISTORY: (id) => `/trackers/${id}/cycles-history`,
  UPDATE_CYCLE: (id) => `/trackers/${id}/update-cycle`,
  DELETE_CYCLE: (id, cycleId) => `/trackers/${id}/cycles/${cycleId}`,
  LOG_PERIOD: (id) => `/trackers/${id}/log-period`,

  // Data Tracking
  SAVE_DATA: (id) => `/data-tracking/${id}/save-tracking-data`,
  GET_DATA_BY_DATE: (id) => `/data-tracking/${id}/get-tracking-data-by-date`,
  GET_DATA_RANGE: (id) => `/data-tracking/${id}/get-tracking-data-range`,

  // Calendar
  CALENDAR: (id) => `/data-tracking/${id}/calendar`,
  CALENDAR_OVERVIEW: (id) => `/data-tracking/${id}/calendar/overview`,
  TRACKER_CALENDAR: (id) => `/data-tracking/${id}/tracker-calendar`,
  TRACKER_CALENDAR_OVERVIEW: (id) => `/data-tracking/${id}/tracker-calendar/overview`,

  // Analytics
  GET_INSIGHTS: (id) => `/data-tracking/${id}/get-all-insights`,
  UNIFIED_ANALYSIS: (id) => `/data-tracking/${id}/analyze`,
  GENERAL_ANALYSIS: (id) => `/data-tracking/${id}/general-tracker-analysis`,
  CYCLE_ANALYSIS: (id) => `/data-tracking/${id}/general-cycle-analysis`,

  // Comparisons
  COMPARE: (id) => `/data-tracking/${id}/compare`,

  // Correlations
  CORRELATIONS: (id) => `/data-tracking/${id}/correlations`,
  FIELD_CORRELATIONS: (id) => `/data-tracking/${id}/correlations/field`,

  // Patterns
  PATTERN_SUMMARY: (id) => `/data-tracking/${id}/pattern-summary`,
  DETECT_PATTERNS: (id) => `/data-tracking/${id}/detect-patterns`,

  // Charts
  CHART: (id) => `/data-tracking/${id}/chart`,
  TIME_EVOLUTION_CHART: (id) => `/data-tracking/${id}/time-evolution-chart`,
  COMPARISON_CHART: (id) => `/data-tracking/${id}/comparison-chart`,
  CORRELATION_CHART: (id) => `/data-tracking/${id}/correlation-chart`,
  PATTERN_CHART: (id) => `/data-tracking/${id}/pattern-chart`,
};
