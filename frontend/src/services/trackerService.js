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
};
