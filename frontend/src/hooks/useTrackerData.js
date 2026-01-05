import { useState, useCallback } from "react";
import { trackerService } from "../services/trackerService";
import { dataTrackingService } from "../services/dataTrackingService";
import { colors } from "../constants/colors";

/**
 * Custom hook to manage tracker data, calendar, and insights
 */
export const useTrackerData = () => {
  const [trackers, setTrackers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [defaultTracker, setDefaultTracker] = useState(null);
  const [calendarData, setCalendarData] = useState({});
  const [selectedDate, setSelectedDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [needsSetup, setNeedsSetup] = useState(null); // null = checking, true = needs setup, false = configured
  const [insights, setInsights] = useState(null);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [isPeriodTracker, setIsPeriodTracker] = useState(false);

  const loadCalendarData = useCallback(async (tracker) => {
    if (!tracker) return;

    try {
      const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM format

      // Check if it's a Period Tracker
      const isPeriodTracker = tracker.category_name === "Period Tracker";

      let response;
      if (isPeriodTracker) {
        response = await dataTrackingService.getCalendar(tracker.id, {
          params: { month: currentMonth },
        });
      } else {
        response = await dataTrackingService.getTrackerCalendar(tracker.id, {
          params: { month: currentMonth },
        });
      }

      // Format calendar data for react-native-calendars
      // Backend returns data merged at top level (not nested)
      const markedDates = {};
      const calendarResponse =
        response.days || response.calendar_grid?.days || {};

      if (isPeriodTracker && response.days) {
        // For period tracker, mark different cycle phases with colored dots
        Object.keys(response.days).forEach((date) => {
          const dayData = response.days[date];
          if (dayData && dayData.phase) {
            const phase = dayData.phase.phase || dayData.phase;
            let dotColor = colors.primary;

            if (phase === "menstrual" || phase === "period") {
              dotColor = colors.menstrual;
            } else if (phase === "ovulation") {
              dotColor = colors.ovulation;
            } else if (phase === "follicular") {
              dotColor = colors.follicular;
            } else if (phase === "luteal") {
              dotColor = colors.luteal;
            }

            markedDates[date] = {
              marked: true,
              dotColor: dotColor,
            };
          }
        });
      } else if (response.days) {
        // For regular trackers, mark days with entries
        Object.keys(response.days).forEach((date) => {
          const dayData = response.days[date];
          if (dayData && dayData.has_entry) {
            markedDates[date] = {
              marked: true,
              dotColor: colors.primary,
            };
          }
        });
      }

      setCalendarData(markedDates);
    } catch (error) {
      console.error("Error loading calendar data:", error);
      console.error("Calendar error details:", {
        status: error.response?.status,
        data: error.response?.data,
      });
      // Silently fail for calendar - don't block the UI
      setCalendarData({});
    }
  }, []);

  const loadInsights = useCallback(async (tracker) => {
    if (!tracker) return;

    try {
      setInsightsLoading(true);
      const isPeriod = tracker.category_name === "Period Tracker";
      setIsPeriodTracker(isPeriod);

      let response;
      if (isPeriod) {
        // Use cycle analysis for period trackers
        response = await dataTrackingService.getCycleAnalysis(tracker.id);
      } else {
        // Use general tracker analysis for normal trackers
        response = await dataTrackingService.getGeneralAnalysis(tracker.id);
      }

      // Backend returns { message: "...", data: {...} }
      // Service returns response.data which is { message: "...", data: {...} }
      // So we need to extract the nested data object
      const insightsData = response.data || response;
      setInsights(insightsData);
    } catch (error) {
      console.error("Error loading insights:", error);
      // Silently fail - don't block the UI
      setInsights(null);
    } finally {
      setInsightsLoading(false);
    }
  }, []);

  const checkPeriodTrackerSetup = useCallback(
    async (tracker) => {
      // Only check setup for Period Trackers
      if (!tracker || tracker.category_name !== "Period Tracker") {
        setNeedsSetup(false);
        if (tracker) {
          loadCalendarData(tracker);
        }
        return;
      }

      try {
        // Check tracker settings directly from backend
        const response = await trackerService.getTrackerSettings(tracker.id);

        // The backend returns { settings: {...} } or { settings: {} } if null
        const settings = response.settings || {};

        // Check if settings is null, empty object, or missing required fields
        const isSettingsNull = !settings || Object.keys(settings).length === 0;
        const hasRequiredSettings =
          settings.average_cycle_length &&
          settings.average_period_length &&
          settings.last_period_start_date;

        if (isSettingsNull || !hasRequiredSettings) {
          setNeedsSetup(true);
        } else {
          setNeedsSetup(false);
          loadCalendarData(tracker);
          loadInsights(tracker);
        }
      } catch (error) {
        console.error("Error checking tracker setup:", error);
        console.error("Error details:", {
          status: error.response?.status,
          data: error.response?.data,
        });
        // If error, assume setup is needed for Period Tracker
        setNeedsSetup(true);
      }
    },
    [loadCalendarData, loadInsights]
  );

  const loadTrackers = useCallback(async () => {
    try {
      setLoading(true);
      const response = await trackerService.getMyTrackers();
      // Backend returns { message: '...', trackers: [...], total_count: ... }
      // (data is merged into response, not nested)
      const trackersList = response.trackers || [];

      // Map to format expected by the UI
      const formattedTrackers = trackersList.map((item) => ({
        id: item.tracker_info?.id,
        name:
          item.tracker_name ||
          item.tracker_info?.category_name ||
          "Unknown Tracker",
        category_name: item.tracker_name || "Unknown",
        ...item.tracker_info,
      }));

      setTrackers(formattedTrackers);

      // Find default tracker
      const defaultTracker =
        formattedTrackers.find((t) => t.is_default) || formattedTrackers[0];
      setDefaultTracker(defaultTracker);

      // Check if Period Tracker needs setup
      if (defaultTracker && defaultTracker.category_name === "Period Tracker") {
        // Don't load calendar until we confirm settings exist
        checkPeriodTrackerSetup(defaultTracker);
      } else if (defaultTracker) {
        // Load calendar data for non-period trackers
        loadCalendarData(defaultTracker);
        loadInsights(defaultTracker);
        setNeedsSetup(false);
      } else {
        setNeedsSetup(false);
      }
    } catch (error) {
      console.error("Error loading trackers:", error);
      console.error("Error details:", error.response?.data);
      setTrackers([]);
    } finally {
      setLoading(false);
      setIsInitialLoad(false);
    }
  }, [checkPeriodTrackerSetup, loadCalendarData, loadInsights]);

  return {
    trackers,
    loading,
    isInitialLoad,
    defaultTracker,
    calendarData,
    selectedDate,
    setSelectedDate,
    needsSetup,
    insights,
    insightsLoading,
    isPeriodTracker,
    loadTrackers,
  };
};
