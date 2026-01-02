import api from './api';
import { API_ENDPOINTS } from '../constants/config';

export const dataTrackingService = {
  // Save tracking data
  saveData: async (trackerId, data, entryDate = null) => {
    const payload = { data };
    if (entryDate) {
      payload.entry_date = entryDate;
    }
    const response = await api.post(API_ENDPOINTS.SAVE_DATA(trackerId), payload);
    return response.data;
  },

  // Get data for a specific date
  getDataByDate: async (trackerId, entryDate) => {
    const response = await api.get(API_ENDPOINTS.GET_DATA_BY_DATE(trackerId), {
      params: { entry_date: entryDate },
    });
    return response.data;
  },

  // Get data for a date range
  getDataRange: async (trackerId, startDate, endDate) => {
    const response = await api.get(API_ENDPOINTS.GET_DATA_RANGE(trackerId), {
      params: { start_date: startDate, end_date: endDate },
    });
    return response.data;
  },

  // Get calendar data (for period tracker)
  getCalendar: async (trackerId) => {
    const response = await api.get(API_ENDPOINTS.CALENDAR(trackerId));
    return response.data;
  },

  // Get calendar overview
  getCalendarOverview: async (trackerId) => {
    const response = await api.get(API_ENDPOINTS.CALENDAR_OVERVIEW(trackerId));
    return response.data;
  },

  // Get tracker calendar (for regular trackers)
  getTrackerCalendar: async (trackerId) => {
    const response = await api.get(API_ENDPOINTS.TRACKER_CALENDAR(trackerId));
    return response.data;
  },
};

