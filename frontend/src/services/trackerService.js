import api from "./api";
import { API_ENDPOINTS } from "../constants/config";

export const trackerService = {
  // Get all user's trackers
  getMyTrackers: async () => {
    const response = await api.get(API_ENDPOINTS.MY_TRACKERS);
    return response.data;
  },

  // Get tracker details
  getTrackerDetails: async (trackerId) => {
    const response = await api.get(API_ENDPOINTS.TRACKER_DETAILS(trackerId));
    return response.data;
  },

  // Get form schema for a tracker
  getFormSchema: async (trackerId) => {
    const response = await api.get(API_ENDPOINTS.FORM_SCHEMA(trackerId));
    return response.data;
  },

  // Get management schema (all fields including baseline for editing)
  getManagementSchema: async (trackerId) => {
    const response = await api.get(API_ENDPOINTS.MANAGEMENT_SCHEMA(trackerId));
    return response.data;
  },

  // Create custom tracker
  createCustomTracker: async (trackerData) => {
    const response = await api.post(
      API_ENDPOINTS.CREATE_CUSTOM_TRACKER,
      trackerData
    );
    return response.data;
  },

  // Get tracker settings
  getTrackerSettings: async (trackerId) => {
    const response = await api.get(API_ENDPOINTS.TRACKER_SETTINGS(trackerId));
    return response.data;
  },

  // Update tracker settings
  updateTrackerSettings: async (trackerId, settings) => {
    const response = await api.put(API_ENDPOINTS.TRACKER_SETTINGS(trackerId), {
      settings,
    });
    return response.data;
  },

  // Set tracker as default
  setDefaultTracker: async (trackerId) => {
    const response = await api.put(API_ENDPOINTS.UPDATE_DEFAULT_TRACKER(trackerId));
    return response.data;
  },

  // Create new field for a tracker
  createNewField: async (trackerId, fieldData) => {
    const response = await api.post(API_ENDPOINTS.CREATE_NEW_FIELD(trackerId), {
      field_data: {
        field_name: fieldData.field_name,
        display_label: fieldData.display_label,
      },
      options: fieldData.options,
    });
    return response.data;
  },

  // Toggle field active status (mask/unmask)
  toggleFieldActive: async (fieldId) => {
    const response = await api.patch(API_ENDPOINTS.TOGGLE_FIELD_ACTIVE(fieldId));
    return response.data;
  },

  // Toggle option active status (mask/unmask)
  toggleOptionActive: async (optionId) => {
    const response = await api.patch(API_ENDPOINTS.TOGGLE_OPTION_ACTIVE(optionId));
    return response.data;
  },
};
