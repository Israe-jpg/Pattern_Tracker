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

  // Data Tracking
  SAVE_DATA: (id) => `/data-tracking/${id}/save-tracking-data`,
  GET_DATA_BY_DATE: (id) => `/data-tracking/${id}/get-tracking-data-by-date`,
  GET_DATA_RANGE: (id) => `/data-tracking/${id}/get-tracking-data-range`,

  // Calendar
  CALENDAR: (id) => `/data-tracking/${id}/calendar`,
  CALENDAR_OVERVIEW: (id) => `/data-tracking/${id}/calendar/overview`,
  TRACKER_CALENDAR: (id) => `/data-tracking/${id}/tracker-calendar`,

  // Analytics
  GET_INSIGHTS: (id) => `/data-tracking/${id}/get-all-insights`,
  UNIFIED_ANALYSIS: (id) => `/data-tracking/${id}/analyze`,
  GENERAL_ANALYSIS: (id) => `/data-tracking/${id}/general-tracker-analysis`,

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
