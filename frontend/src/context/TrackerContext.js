import React, { createContext, useState, useEffect, useContext, useCallback, useRef, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { trackerService } from '../services/trackerService';
import { useAuth } from './AuthContext';

const TrackerContext = createContext({});

const ACTIVE_TRACKER_ID_KEY = 'active_tracker_id';

export const useTracker = () => {
  const context = useContext(TrackerContext);
  if (!context) {
    throw new Error('useTracker must be used within TrackerProvider');
  }
  return context;
};

export const TrackerProvider = ({ children }) => {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const [activeTrackerId, setActiveTrackerId] = useState(null);
  const [trackers, setTrackers] = useState([]);
  const [loading, setLoading] = useState(true);
  const isInitialMount = useRef(true);
  const activeTrackerIdRef = useRef(null);

  useEffect(() => {
    activeTrackerIdRef.current = activeTrackerId;
  }, [activeTrackerId]);

  // On app start, clear persisted tracker and load trackers after auth is ready
  useEffect(() => {
    const initializeApp = async () => {
      if (authLoading) {
        return;
      }

      if (!isAuthenticated) {
        setLoading(false);
        return;
      }

      if (isInitialMount.current) {
        isInitialMount.current = false;
        try {
          await AsyncStorage.removeItem(ACTIVE_TRACKER_ID_KEY);
        } catch (error) {
          console.error('Error clearing persisted tracker on app start:', error);
        }
        await loadTrackers();
      }
    };

    initializeApp();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, isAuthenticated]);

  // Load trackers and determine active tracker
  const loadTrackers = useCallback(async () => {
    try {
      setLoading(true);
      const response = await trackerService.getMyTrackers();
      const trackersList = response.trackers || [];

      // Map to format expected by the UI
      const formattedTrackers = trackersList.map((item) => ({
        id: item.tracker_info?.id,
        name:
          item.tracker_name ||
          item.tracker_info?.category_name ||
          'Unknown Tracker',
        category_name: item.tracker_name || 'Unknown',
        ...item.tracker_info,
      }));

      setTrackers(formattedTrackers);

      // Determine active tracker:
      // 1. Get current activeTrackerId from state (may be null on first load)
      // 2. If no state tracker, check AsyncStorage for persisted tracker (from navigation)
      // 3. Otherwise, use the default tracker
      // 4. Otherwise, use the first tracker
      let activeTracker = null;
      const currentActiveId = activeTrackerIdRef.current;

      if (currentActiveId) {
        // Check if the current active tracker still exists in the list
        activeTracker = formattedTrackers.find((t) => t.id === currentActiveId);
      }

      if (!activeTracker) {
        // Check AsyncStorage for persisted tracker (from navigation)
        try {
          const persistedId = await AsyncStorage.getItem(ACTIVE_TRACKER_ID_KEY);
          if (persistedId) {
            const trackerId = parseInt(persistedId, 10);
            activeTracker = formattedTrackers.find((t) => t.id === trackerId);
          }
        } catch (error) {
          console.error('Error reading persisted tracker:', error);
        }
      }

      if (!activeTracker && formattedTrackers.length > 0) {
        // Reset to default tracker (or first tracker if no default)
        activeTracker =
          formattedTrackers.find((t) => t.is_default) || formattedTrackers[0];
      }

      if (activeTracker) {
        // Only update state if it's different to avoid unnecessary re-renders
        if (activeTracker.id !== currentActiveId) {
          setActiveTrackerId(activeTracker.id);
        }
        // Persist to AsyncStorage for navigation persistence
        await AsyncStorage.setItem(ACTIVE_TRACKER_ID_KEY, String(activeTracker.id));
      } else if (formattedTrackers.length === 0) {
        // No trackers available - clear active tracker
        setActiveTrackerId(null);
        await AsyncStorage.removeItem(ACTIVE_TRACKER_ID_KEY);
      }
    } catch (error) {
      console.error('Error loading trackers:', error);
      setTrackers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Set active tracker (persists to AsyncStorage for navigation, but resets on app restart)
  // If tracker is null, it will reset to default on next loadTrackers call
  const setActiveTracker = useCallback(async (tracker) => {
    try {
      if (!tracker || !tracker.id) {
        // Clear the active tracker ID to reset to default
        setActiveTrackerId(null);
        await AsyncStorage.removeItem(ACTIVE_TRACKER_ID_KEY);
        // Reload to get default tracker
        await loadTrackers();
        return;
      }

      setActiveTrackerId(tracker.id);
      // Persist to AsyncStorage for navigation persistence
      await AsyncStorage.setItem(ACTIVE_TRACKER_ID_KEY, String(tracker.id));
    } catch (error) {
      console.error('Error setting active tracker:', error);
    }
  }, [loadTrackers]);

  // Get the current active tracker object (memoized to avoid recalculations)
  const activeTracker = useMemo(() => {
    if (!activeTrackerId || trackers.length === 0) return null;
    return trackers.find((t) => t.id === activeTrackerId) || null;
  }, [activeTrackerId, trackers]);

  // Clear active tracker (resets to default)
  const clearActiveTracker = useCallback(async () => {
    try {
      setActiveTrackerId(null);
      await AsyncStorage.removeItem(ACTIVE_TRACKER_ID_KEY);
      // Reload trackers to get the default
      await loadTrackers();
    } catch (error) {
      console.error('Error clearing active tracker:', error);
    }
  }, [loadTrackers]);

  return (
    <TrackerContext.Provider
      value={{
        activeTrackerId,
        activeTracker,
        trackers,
        loading,
        loadTrackers,
        setActiveTracker,
        clearActiveTracker,
      }}
    >
      {children}
    </TrackerContext.Provider>
  );
};

