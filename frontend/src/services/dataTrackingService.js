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
  getDataRange: async (trackerId, startDate, endDate, options = {}) => {
    const params = { 
      start_date: startDate, 
      end_date: endDate,
      ...options.params
    };
    const response = await api.get(API_ENDPOINTS.GET_DATA_RANGE(trackerId), {
      params,
    });
    return response.data;
  },

  // Fetch all pages for a date range (backend caps per_page at 100)
  fetchAllTrackingEntries: async (trackerId, startDate, endDate) => {
    const all = [];
    let page = 1;
    while (page <= 50) {
      const response = await api.get(API_ENDPOINTS.GET_DATA_RANGE(trackerId), {
        params: { start_date: startDate, end_date: endDate, per_page: 100, page },
      });
      const payload = response.data?.data || response.data;
      const batch = payload?.tracking_data || [];
      all.push(...batch);
      const pagination = payload?.pagination;
      if (!pagination?.has_next || batch.length === 0) break;
      page += 1;
    }
    return all;
  },

  // Get calendar data (for period tracker)
  getCalendar: async (trackerId, options = {}) => {
    const response = await api.get(API_ENDPOINTS.CALENDAR(trackerId), {
      params: options.params || {},
    });
    return response.data;
  },

  // Get calendar overview
  getCalendarOverview: async (trackerId, options = {}) => {
    const response = await api.get(API_ENDPOINTS.CALENDAR_OVERVIEW(trackerId), {
      params: options.params || {},
    });
    return response.data;
  },

  // Get tracker calendar (for regular trackers)
  getTrackerCalendar: async (trackerId, options = {}) => {
    const response = await api.get(API_ENDPOINTS.TRACKER_CALENDAR(trackerId), {
      params: options.params || {},
    });
    return response.data;
  },

  // Get tracker calendar overview (for regular trackers)
  getTrackerCalendarOverview: async (trackerId, options = {}) => {
    const response = await api.get(API_ENDPOINTS.TRACKER_CALENDAR_OVERVIEW(trackerId), {
      params: options.params || {},
    });
    return response.data;
  },

  // Get all insights for a tracker
  getAllInsights: async (trackerId) => {
    const response = await api.get(API_ENDPOINTS.GET_INSIGHTS(trackerId));
    return response.data;
  },

  // Get general tracker analysis (for normal trackers)
  getGeneralAnalysis: async (trackerId) => {
    const response = await api.get(API_ENDPOINTS.GENERAL_ANALYSIS(trackerId));
    return response.data;
  },

  // Get cycle analysis (for period trackers)
  getCycleAnalysis: async (trackerId) => {
    const response = await api.get(API_ENDPOINTS.CYCLE_ANALYSIS(trackerId));
    return response.data;
  },

  // Get comparison data (week/month/general)
  getCompare: async (trackerId, params = {}) => {
    const response = await api.get(API_ENDPOINTS.COMPARE(trackerId), { params });
    return response.data;
  },

  // Get top correlations
  getCorrelations: async (trackerId, params = {}) => {
    const response = await api.get(API_ENDPOINTS.CORRELATIONS(trackerId), { params });
    return response.data;
  },

  // Get pattern summary for a list of fields
  getPatternSummary: async (trackerId, fields = [], months = 3) => {
    const params = { months };
    if (fields.length > 0) params.fields = fields.join(",");
    const response = await api.get(API_ENDPOINTS.PATTERN_SUMMARY(trackerId), { params });
    return response.data;
  },

  // Get symptom analysis by cycle phase (period tracker only)
  getSymptomsbyPhase: async (trackerId, symptomField, months = 6, option = null) => {
    const params = { symptom_field: symptomField, months };
    if (option) params.option = option;
    const response = await api.get(API_ENDPOINTS.SYMPTOMS_BY_PHASE(trackerId), { params });
    return response.data;
  },

  // Compare two arbitrary date ranges
  getCompareCustom: async (trackerId, { target_start, target_end, comparison_start, comparison_end }) => {
    const response = await api.get(API_ENDPOINTS.COMPARE_CUSTOM(trackerId), {
      params: { target_start, target_end, comparison_start, comparison_end },
    });
    return response.data;
  },
};

