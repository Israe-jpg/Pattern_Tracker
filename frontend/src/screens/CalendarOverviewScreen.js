import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Dimensions,
  Alert,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { CalendarList } from 'react-native-calendars';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../constants/colors';
import { dataTrackingService } from '../services/dataTrackingService';
import { trackerService } from '../services/trackerService';
import { useTracker } from '../context/TrackerContext';
import { CustomDay } from '../components/calendar/CustomDay';
import { calculateCycleDayForDate, sortCyclesByStartDate } from '../utils/cycleCalculations';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function CalendarOverviewScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { activeTracker } = useTracker();
  const tracker = route.params?.tracker || activeTracker;
  
  const [loading, setLoading] = useState(true);
  const [markedDates, setMarkedDates] = useState({});
  const [isEditMode, setIsEditMode] = useState(false);
  const [hasEditModeChanges, setHasEditModeChanges] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [pendingChanges, setPendingChanges] = useState(new Map()); // Track changes: dateString -> changes object
  const [trackerSettings, setTrackerSettings] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0); // Force refresh trigger
  const isHandlingNavigation = useRef(false);
  
  const isPeriodTracker = tracker?.category_name === "Period Tracker";
  
  // Create dayComponent for period trackers (same as CalendarSection)
  // Also use custom day component in edit mode for all trackers
  const dayComponent = useMemo(() => {
    // Use custom day component for period trackers or when in edit mode
    if (!isPeriodTracker && !isEditMode) return undefined;
    
    return (props) => {
      const { date, state, marking } = props;
      const dateString = date.dateString;
      // Get marking from markedDates - this should contain cycleDay, phase, etc.
      const dateMarking = markedDates[dateString] || {};
      
      // Merge: props.marking (from CalendarList) + dateMarking (from our state)
      // dateMarking takes precedence to ensure cycleDay/phase are included
      const fullMarking = {
        ...(marking || {}),
        ...dateMarking,
      };
      
      // Get pending changes for this date
      const dateChanges = pendingChanges.get(dateString);
      
      return (
        <CustomDay 
          {...props} 
          marking={fullMarking} 
          isEditMode={isEditMode}
          isSelected={dateChanges?.isSelected || false}
          // IMPORTANT: pass through undefined so original menstrual styling still shows
          isToggledPeriod={dateChanges?.isToggledPeriod}
          onDayPress={isEditMode ? handleDayPress : undefined}
        />
      );
    };
  }, [isPeriodTracker, markedDates, isEditMode, pendingChanges, handleDayPress, refreshKey]);

  useEffect(() => {
    if (tracker) {
      loadCalendarData();
      // Load tracker settings for period length
      if (isPeriodTracker) {
        loadTrackerSettings();
      }
    }
  }, [tracker]);

  const loadTrackerSettings = async () => {
    if (!tracker) return;
    try {
      const settingsResponse = await trackerService.getTrackerSettings(tracker.id);
      const settings = settingsResponse.data?.settings || settingsResponse.settings || {};
      setTrackerSettings(settings);
    } catch (error) {
      console.error('Error loading tracker settings:', error);
    }
  };

  // Automatically detect if there are pending changes
  useEffect(() => {
    const hasChanges = pendingChanges.size > 0;
    setHasEditModeChanges(hasChanges);
  }, [pendingChanges]);

  // Handle navigation with unsaved changes
  useEffect(() => {
    const unsubscribe = navigation.addListener("beforeRemove", (e) => {
      // If we're already handling navigation (from back button click), allow it
      if (isHandlingNavigation.current) {
        isHandlingNavigation.current = false;
        return;
      }

      if (!isEditMode || !hasEditModeChanges) {
        // No unsaved changes, allow navigation
        return;
      }

      // Prevent default behavior of leaving the screen
      e.preventDefault();

      // Show confirmation dialog
      Alert.alert(
        "Unsaved Changes",
        "You have unsaved changes. What would you like to do?",
        [
          {
            text: "Cancel",
            style: "cancel",
            onPress: () => {
              // Do nothing, stay on screen
            },
          },
          {
            text: "Don't Save",
            style: "destructive",
            onPress: () => {
              // Clear changes and navigate back
              setHasEditModeChanges(false);
              setPendingChanges(new Map());
              setIsEditMode(false);
              // Use navigation.goBack() instead of dispatch to avoid state issues
              navigation.goBack();
            },
          },
          {
            text: "Save",
            onPress: async () => {
              const success = await savePendingChanges();
              if (success) {
                setIsEditMode(false);
                // Use navigation.goBack() instead of dispatch to avoid state issues
                navigation.goBack();
              }
            },
          },
        ]
      );
    });

    return unsubscribe;
  }, [navigation, isEditMode, hasEditModeChanges]);

  const loadCalendarData = async (showLoading = true) => {
    if (!tracker) {
      setLoading(false);
      return;
    }
    
    try {
      if (showLoading) {
        setLoading(true);
      }
      const isPeriodTracker = tracker.category_name === "Period Tracker";
      const dates = {};
      const today = new Date();
      const startDate = new Date(today.getFullYear(), today.getMonth() - 11, 1);
      const endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      
      // Fetch all entries for the 12-month range
      try {
        const entriesResponse = await dataTrackingService.getDataRange(
          tracker.id,
          startDate.toISOString().split('T')[0],
          endDate.toISOString().split('T')[0],
          { params: { per_page: 100 } }
        );
        
        // Extract entries from response (handle different response structures)
        let allEntries = [];
        const pageData = entriesResponse?.data?.tracking_data || entriesResponse?.tracking_data || entriesResponse?.data || entriesResponse;
        
        if (Array.isArray(pageData)) {
          allEntries = pageData;
        }
        
        // Handle pagination
        const pagination = entriesResponse?.data?.pagination || entriesResponse?.pagination;
        if (pagination) {
          let currentPage = pagination.current_page || 1;
          const totalPages = pagination.total_pages || pagination.pages || 1;
          
          while (currentPage < totalPages) {
            currentPage++;
            try {
              const pageResponse = await dataTrackingService.getDataRange(
                tracker.id,
                startDate.toISOString().split('T')[0],
                endDate.toISOString().split('T')[0],
                { params: { per_page: 100, page: currentPage } }
              );
              
              const nextPageData = pageResponse?.data?.tracking_data || pageResponse?.tracking_data || pageResponse?.data || pageResponse;
              if (Array.isArray(nextPageData)) {
                allEntries = allEntries.concat(nextPageData);
              }
            } catch (error) {
              break;
            }
          }
        }
        
        // Mark dates that have entries
        allEntries.forEach(entry => {
          const entryDate = entry?.entry_date || entry?.date;
          if (entryDate) {
            const dateStr = typeof entryDate === 'string' 
              ? entryDate.split('T')[0] 
              : entryDate;
            dates[dateStr] = {
              marked: true,
              dotColor: colors.primary,
            };
          }
        });
      } catch (error) {
        console.error('Error loading entries:', error);
      }
      
      // For period trackers, fetch cycle history and calculate cycle days/phases
      if (isPeriodTracker) {
        try {
          // Fetch cycle history (same approach as useTrackerData)
          const cyclesResponse = await trackerService.getCyclesHistory(tracker.id, {
            params: { months: 12, include_current: true },
          });
          
          const allCycles = cyclesResponse.data?.cycles || cyclesResponse.cycles || [];
          
          // Sort cycles by start date (oldest first) using shared utility
          const sortedCycles = sortCyclesByStartDate(allCycles);
          
          // Calculate cycle day and phase for all dates in the range
          // IMPORTANT: Preserve existing marked and dotColor properties from entries
          const currentDate = new Date(startDate);
          let cycleDayCount = 0;
          while (currentDate <= endDate) {
            const dateStr = currentDate.toISOString().split('T')[0];
            // Use shared utility function
            const calculated = calculateCycleDayForDate(dateStr, sortedCycles);
            
            // Always set cycle day info if we have any calculated data
            // This ensures phase colors and cycle day numbers show
            const existingMarking = dates[dateStr] || {};
            
            // Only update if we have cycle data (cycleDay or phase)
            if (calculated.cycleDay || calculated.phase) {
              dates[dateStr] = {
                ...existingMarking, // Preserve marked, dotColor, etc.
                ...(calculated.cycleDay && { cycleDay: calculated.cycleDay }),
                ...(calculated.phase && { phase: calculated.phase }),
                ...(calculated.isExactOvulationDay && { isExactOvulationDay: true }),
              };
            } else {
              // Clear cycle data if it was previously set but no longer valid
              if (existingMarking.cycleDay || existingMarking.phase) {
                const { cycleDay, phase, isExactOvulationDay, ...rest } = existingMarking;
                dates[dateStr] = rest;
              }
            }
            
            currentDate.setDate(currentDate.getDate() + 1);
          }
        } catch (error) {
          console.error('Error loading cycle history:', error);
        }
      }

      setMarkedDates(dates);
    } catch (error) {
      console.error('Error loading calendar overview:', error);
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  };

  /**
   * Save pending changes
   */
  const savePendingChanges = async () => {
    if (!tracker || !isPeriodTracker) {
      // Not a period tracker, nothing to save
      setPendingChanges(new Map());
      setHasEditModeChanges(false);
      return true;
    }

    try {
      setSubmitting(true);
      
      // Get all cycles for this tracker
      const cyclesResponse = await trackerService.getCyclesHistory(tracker.id, {
        params: { months: 12, include_current: true },
      });
      
      const allCycles = cyclesResponse.data?.cycles || cyclesResponse.cycles || [];
      
      // Separate new period dates and deselected period dates
      const newPeriodDates = []; // Dates that are new period days (isToggledPeriod === true)
      const deselectedPeriodDates = []; // Dates that were originally period but are now toggled off
      
      for (const [dateString, changes] of pendingChanges.entries()) {
        const dateMarking = markedDates[dateString] || {};
        const originalIsMenstrual = dateMarking.phase === "menstrual" || dateMarking.phase === "period";
        
        // Check for new period dates (toggled on)
        if (!originalIsMenstrual && changes.isToggledPeriod === true) {
          newPeriodDates.push(dateString);
        }
        
        // Check for deselected period dates (toggled off)
        // Only process dates that are in an ACTUAL logged period range, not predicted dates
        if (originalIsMenstrual && changes.isToggledPeriod === false) {
          // Check if this date is in any cycle's actual period range (logged dates)
          let isActualPeriodDate = false;
          for (const cycle of allCycles) {
            if (!cycle.period_start_date) continue;
            
            const periodStartStr = typeof cycle.period_start_date === 'string' 
              ? cycle.period_start_date.split('T')[0] 
              : cycle.period_start_date;
            const periodEndStr = cycle.period_end_date 
              ? (typeof cycle.period_end_date === 'string' ? cycle.period_end_date.split('T')[0] : cycle.period_end_date)
              : null;
            
            // Check if date is within this cycle's actual period range
            const inPeriodRange = dateString >= periodStartStr && (!periodEndStr || dateString <= periodEndStr);
            if (inPeriodRange) {
              isActualPeriodDate = true;
              break;
            }
          }
          
          // Only add to deselectedPeriodDates if it's an actual logged period date
          if (isActualPeriodDate) {
            deselectedPeriodDates.push(dateString);
          }
          // If it's a predicted date, just ignore the toggle (will be cleared when pending changes reset)
        }
      }
      
      // Check if there's anything to process
      if (newPeriodDates.length === 0 && deselectedPeriodDates.length === 0) {
        // No period dates to process, just clear changes
        setPendingChanges(new Map());
        setHasEditModeChanges(false);
        // Still reload to ensure calendar is up to date
        try {
          await loadCalendarData(false);
        } catch (reloadError) {
          console.error('Error reloading calendar data:', reloadError);
        }
        return true;
      }
      
      // Process new period dates - check if they're adjacent to existing cycles
      if (newPeriodDates.length > 0) {
        // First, check which new dates are adjacent to existing period dates
        const datesToAddToExistingCycles = new Map(); // cycle_id -> [dates to add]
        const standaloneNewDates = [];
        
        for (const newDateStr of newPeriodDates) {
          let foundAdjacentCycle = false;
          
          // Check if this date is adjacent (day before or after) to any existing period date
          const newDate = new Date(newDateStr);
          const dayBefore = new Date(newDate);
          dayBefore.setDate(dayBefore.getDate() - 1);
          const dayBeforeStr = dayBefore.toISOString().split('T')[0];
          
          const dayAfter = new Date(newDate);
          dayAfter.setDate(dayAfter.getDate() + 1);
          const dayAfterStr = dayAfter.toISOString().split('T')[0];
          
          // Check all cycles to see if day before or after is a period date
          for (const cycle of allCycles) {
            if (!cycle.period_start_date) continue;
            
            const periodStartStr = typeof cycle.period_start_date === 'string' 
              ? cycle.period_start_date.split('T')[0] 
              : cycle.period_start_date;
            const periodEndStr = cycle.period_end_date 
              ? (typeof cycle.period_end_date === 'string' ? cycle.period_end_date.split('T')[0] : cycle.period_end_date)
              : null;
            
            // Check if day before or after is in this cycle's period range
            const dayBeforeIsPeriod = dayBeforeStr >= periodStartStr && (!periodEndStr || dayBeforeStr <= periodEndStr);
            const dayAfterIsPeriod = dayAfterStr >= periodStartStr && (!periodEndStr || dayAfterStr <= periodEndStr);
            
            if (dayBeforeIsPeriod || dayAfterIsPeriod) {
              // This date is adjacent to this cycle, add it to the cycle
              if (!datesToAddToExistingCycles.has(cycle.id)) {
                datesToAddToExistingCycles.set(cycle.id, []);
              }
              datesToAddToExistingCycles.get(cycle.id).push(newDateStr);
              foundAdjacentCycle = true;
              break;
            }
          }
          
          if (!foundAdjacentCycle) {
            standaloneNewDates.push(newDateStr);
          }
        }
        
        // Add adjacent dates to existing cycles
        for (const [cycleId, datesToAdd] of datesToAddToExistingCycles.entries()) {
          const cycle = allCycles.find(c => c.id === cycleId);
          if (!cycle) continue;
          
          const periodStartStr = typeof cycle.period_start_date === 'string' 
            ? cycle.period_start_date.split('T')[0] 
            : cycle.period_start_date;
          const periodEndStr = cycle.period_end_date 
            ? (typeof cycle.period_end_date === 'string' ? cycle.period_end_date.split('T')[0] : cycle.period_end_date)
            : null;
          
          // Generate all current period dates
          const allCurrentPeriodDates = [];
          const periodStart = new Date(periodStartStr);
          const periodEnd = periodEndStr ? new Date(periodEndStr) : new Date();
          const currentDate = new Date(periodStart);
          while (currentDate <= periodEnd) {
            allCurrentPeriodDates.push(currentDate.toISOString().split('T')[0]);
            currentDate.setDate(currentDate.getDate() + 1);
          }
          
          // Combine existing period dates with new dates, sort, and update
          const updatedPeriodDates = [...allCurrentPeriodDates, ...datesToAdd].sort();
          
          await trackerService.updateCycle(tracker.id, {
            cycle_id: cycleId,
            period_dates: updatedPeriodDates,
          });
        }
        
        // Process standalone new dates (not adjacent to existing cycles) - create new cycles
        if (standaloneNewDates.length > 0) {
          // Group standalone dates by consecutive days
          const newPeriodGroups = [];
          const sortedStandalone = [...standaloneNewDates].sort();
          
          let currentGroup = [sortedStandalone[0]];
          for (let i = 1; i < sortedStandalone.length; i++) {
            const prevDate = new Date(sortedStandalone[i - 1]);
            const currentDate = new Date(sortedStandalone[i]);
            const daysDiff = (currentDate - prevDate) / (1000 * 60 * 60 * 24);
            
            if (daysDiff === 1) {
              currentGroup.push(sortedStandalone[i]);
            } else {
              newPeriodGroups.push(currentGroup);
              currentGroup = [sortedStandalone[i]];
            }
          }
          if (currentGroup.length > 0) {
            newPeriodGroups.push(currentGroup);
          }
          
          // Log each new period group
          for (const periodGroup of newPeriodGroups) {
            const periodStartDate = periodGroup[0];
            
            try {
              await trackerService.logPeriod(tracker.id, periodStartDate);
              
              if (periodGroup.length > 1) {
                await trackerService.updateCycle(tracker.id, {
                  period_dates: periodGroup,
                });
              }
            } catch (error) {
              console.error(`Error logging period at ${periodStartDate}:`, error);
              if (error.response?.status === 409) {
                await trackerService.updateCycle(tracker.id, {
                  period_dates: periodGroup,
                });
              } else {
                throw error;
              }
            }
          }
        }
      }
      
      // Group deselected dates by cycle (only if there are deselected dates)
      const cycleChanges = new Map(); // cycle_id -> { cycle, deselectedDates: [] }
      
      for (const dateStr of deselectedPeriodDates) {
        // Find which cycle this date belongs to
        // First check if it's in a cycle's actual period range (logged period dates)
        // If not, check if it's in a cycle's full cycle range (predicted period dates)
        let foundCycle = false;
        
        for (const cycle of allCycles) {
          if (!cycle.period_start_date) {
            console.warn(`Cycle ${cycle.id} has no period_start_date`);
            continue;
          }
          
          // Extract date strings (handle both date and datetime formats)
          const periodStartStr = typeof cycle.period_start_date === 'string' 
            ? cycle.period_start_date.split('T')[0] 
            : cycle.period_start_date;
          const periodEndStr = cycle.period_end_date 
            ? (typeof cycle.period_end_date === 'string' ? cycle.period_end_date.split('T')[0] : cycle.period_end_date)
            : null;
          
          // Also get cycle start/end for checking predicted dates
          const cycleStartStr = cycle.cycle_start_date 
            ? (typeof cycle.cycle_start_date === 'string' ? cycle.cycle_start_date.split('T')[0] : cycle.cycle_start_date)
            : periodStartStr;
          const cycleEndStr = cycle.cycle_end_date 
            ? (typeof cycle.cycle_end_date === 'string' ? cycle.cycle_end_date.split('T')[0] : cycle.cycle_end_date)
            : null;
          
          // Check if date is within this cycle's ACTUAL period range (logged period dates)
          const inPeriodRange = dateStr >= periodStartStr && (!periodEndStr || dateStr <= periodEndStr);
          
          // Check if date is within this cycle's full cycle range (for predicted dates)
          const inCycleRange = dateStr >= cycleStartStr && (!cycleEndStr || dateStr <= cycleEndStr);
          
          // Only process dates that are in the actual period range (logged period dates)
          // Predicted period dates are calculated and not stored, so we can't update/delete them
          if (inPeriodRange) {
            if (!cycleChanges.has(cycle.id)) {
              cycleChanges.set(cycle.id, {
                cycle,
                deselectedDates: [],
              });
            }
            cycleChanges.get(cycle.id).deselectedDates.push(dateStr);
            foundCycle = true;
            break;
          }
        }
        
        // Note: foundCycle should always be true now since we pre-filter for actual period dates
        // If not found, it's a data inconsistency issue, but we'll handle it gracefully
      }
      
      // Process each cycle (only if there are deselected dates)
      if (deselectedPeriodDates.length > 0) {
        console.log(`Processing ${cycleChanges.size} cycles with deselected dates`);
        for (const [cycleId, { cycle, deselectedDates }] of cycleChanges.entries()) {
          try {
            console.log(`\nProcessing cycle ${cycleId}:`, {
              period_start: cycle.period_start_date,
              period_end: cycle.period_end_date,
              deselectedDates
            });
            
            // Extract date strings (handle both date and datetime formats)
            const periodStartStr = typeof cycle.period_start_date === 'string' 
              ? cycle.period_start_date.split('T')[0] 
              : cycle.period_start_date;
            const periodEndStr = cycle.period_end_date 
              ? (typeof cycle.period_end_date === 'string' ? cycle.period_end_date.split('T')[0] : cycle.period_end_date)
              : null;
            
            // Generate all period dates in this cycle
            const allPeriodDates = [];
            const periodStart = new Date(periodStartStr);
            const periodEnd = periodEndStr ? new Date(periodEndStr) : new Date(); // If no end date, use today as max
            
            const currentDate = new Date(periodStart);
            while (currentDate <= periodEnd) {
              const dateStr = currentDate.toISOString().split('T')[0];
              allPeriodDates.push(dateStr);
              currentDate.setDate(currentDate.getDate() + 1);
            }
            
            console.log(`All period dates in cycle ${cycleId}:`, allPeriodDates);
            
            // Check if all period dates are deselected
            const allDeselected = deselectedDates.length === allPeriodDates.length &&
              deselectedDates.every(d => allPeriodDates.includes(d));
            
            if (allDeselected) {
              // Delete the entire cycle
              console.log(`All dates deselected for cycle ${cycleId}, deleting cycle...`);
              await trackerService.deleteCycle(tracker.id, cycleId);
              console.log(`Cycle ${cycleId} deleted successfully`);
            } else {
              // Partial deselection - update cycle with remaining period dates
              const remainingPeriodDates = allPeriodDates.filter(
                dateStr => !deselectedDates.includes(dateStr)
              ).sort(); // Ensure dates are sorted (earliest first)
              
              console.log(`Remaining period dates for cycle ${cycleId}:`, remainingPeriodDates);
              
              if (remainingPeriodDates.length > 0) {
                // Send both cycle_id and period_dates to ensure we update the correct cycle
                const updateResponse = await trackerService.updateCycle(tracker.id, {
                  cycle_id: cycleId,
                  period_dates: remainingPeriodDates,
                });
                console.log(`Cycle ${cycleId} updated successfully:`, updateResponse);
              } else {
                // All dates deselected but check failed - delete cycle as fallback
                console.log(`No remaining dates for cycle ${cycleId}, deleting as fallback...`);
                await trackerService.deleteCycle(tracker.id, cycleId);
              }
            }
          } catch (cycleError) {
            console.error(`Error processing cycle ${cycleId}:`, cycleError);
            console.error('Error details:', cycleError.response?.data || cycleError.message);
            // Continue with other cycles
          }
        }
      }
      
      // Reload calendar data BEFORE clearing pending changes
      // This ensures the UI updates with fresh data before we reset state
      console.log('Reloading calendar data...');
      try {
        await loadCalendarData(false);
        console.log('Calendar data reloaded successfully');
      } catch (reloadError) {
        console.error('Error reloading calendar data after save:', reloadError);
        // Still continue to clear changes since save was successful
      }
      
      // Clear pending changes AFTER reload completes
      setPendingChanges(new Map());
      setHasEditModeChanges(false);
      
      // Force component refresh to ensure UI updates with new data
      setRefreshKey(prev => prev + 1);
      console.log('Pending changes cleared and UI refreshed');
      
      return true;
    } catch (error) {
      console.error('Error saving pending changes:', error);
      Alert.alert(
        "Error",
        error.response?.data?.error || error.message || "Failed to save changes. Please try again."
      );
      return false;
    } finally {
      setSubmitting(false);
    }
  };

  /**
   * Handle day press in edit mode - toggle selection or log new period
   */
  const handleDayPress = useCallback((day) => {
    if (!isEditMode) return;
    
    const dateString = day.dateString;
    setPendingChanges(prev => {
      const currentChanges = prev.get(dateString);
      const dateMarking = markedDates[dateString] || {};
      const originalIsMenstrual = dateMarking.phase === "menstrual" || dateMarking.phase === "period";
      
      const wasSelected = currentChanges?.isSelected || false;
      
      // If clicking a non-period day that's not selected, check if it's adjacent to existing period days
      if (!originalIsMenstrual && !wasSelected) {
        // Check if day before and after are period dates
        const date = new Date(dateString);
        const dayBefore = new Date(date);
        dayBefore.setDate(dayBefore.getDate() - 1);
        const dayBeforeStr = dayBefore.toISOString().split('T')[0];
        
        const dayAfter = new Date(date);
        dayAfter.setDate(dayAfter.getDate() + 1);
        const dayAfterStr = dayAfter.toISOString().split('T')[0];
        
        const dayBeforeMarking = markedDates[dayBeforeStr] || {};
        const dayAfterMarking = markedDates[dayAfterStr] || {};
        const dayBeforeIsPeriod = dayBeforeMarking.phase === "menstrual" || dayBeforeMarking.phase === "period";
        const dayAfterIsPeriod = dayAfterMarking.phase === "menstrual" || dayAfterMarking.phase === "period";
        
        // Check pending changes for day before/after
        const dayBeforeChanges = prev.get(dayBeforeStr);
        const dayAfterChanges = prev.get(dayAfterStr);
        const dayBeforeToggledPeriod = dayBeforeChanges?.isToggledPeriod;
        const dayAfterToggledPeriod = dayAfterChanges?.isToggledPeriod;
        
        // Day before is period if originally period OR toggled on (true), but not if toggled off (false)
        const dayBeforeIsActuallyPeriod = (dayBeforeIsPeriod && dayBeforeToggledPeriod !== false) || dayBeforeToggledPeriod === true;
        const dayAfterIsActuallyPeriod = (dayAfterIsPeriod && dayAfterToggledPeriod !== false) || dayAfterToggledPeriod === true;
        
        const newPendingChanges = new Map(prev);
        
        // If adjacent to existing period days, add this day to the period
        if (dayBeforeIsActuallyPeriod || dayAfterIsActuallyPeriod) {
          // Mark as a period day to be added to the adjacent cycle
          newPendingChanges.set(dateString, {
            isSelected: true,
            isToggledPeriod: true, // Add to adjacent period
          });
          return newPendingChanges;
        }
        
        // If NOT adjacent to any period days, this is a new period start
        // Get period length from settings (default to 5 days)
        const periodLength = trackerSettings?.average_period_length || 5;
        
        // Generate period dates starting from clicked day
        const periodDates = [];
        const currentDate = new Date(date);
        for (let i = 0; i < periodLength; i++) {
          const periodDateStr = currentDate.toISOString().split('T')[0];
          periodDates.push(periodDateStr);
          currentDate.setDate(currentDate.getDate() + 1);
        }
        
        // Add all period dates to pending changes as new period days
        periodDates.forEach(periodDateStr => {
          newPendingChanges.set(periodDateStr, {
            isSelected: true,
            isToggledPeriod: true, // Mark as new period day
          });
        });
        
        return newPendingChanges;
      }
      
      // Default behavior: toggle selection
      const newPendingChanges = new Map(prev);
      
      // For existing period days, toggle period state directly (not selection state)
      if (originalIsMenstrual) {
        const currentToggledPeriod = currentChanges?.isToggledPeriod;
        if (currentToggledPeriod === false) {
          // Period was toggled off, now toggle it back on (remove the change to restore original)
          newPendingChanges.delete(dateString);
        } else {
          // Period is currently on (original or toggled on), toggle it off
          newPendingChanges.set(dateString, {
            isSelected: false,
            isToggledPeriod: false, // Hide period styling, show as normal day
          });
        }
      } else {
        // For non-period days, toggle selection state
        const newIsSelected = !wasSelected;
        if (newIsSelected) {
          // Selected: show red border
          newPendingChanges.set(dateString, {
            isSelected: true,
            isToggledPeriod: undefined,
          });
        } else {
          // Unselected: remove the change
          newPendingChanges.delete(dateString);
        }
      }
      
      return newPendingChanges;
    });
  }, [isEditMode, markedDates, trackerSettings]);

  /**
   * Toggle edit mode
   */
  const toggleEditMode = async () => {
    // If clicking checkmark in edit mode, show save confirmation
    if (isEditMode) {
      if (hasEditModeChanges) {
        Alert.alert(
          "Save Changes?",
          "Your changes will be saved.",
          [
            {
              text: "Don't Save",
              style: "destructive",
              onPress: () => {
                // Discard changes
                setPendingChanges(new Map());
                setHasEditModeChanges(false);
                setIsEditMode(false);
              },
            },
            {
              text: "Cancel",
              style: "cancel",
            },
            {
              text: "Save",
              onPress: async () => {
                const success = await savePendingChanges();
                if (success) {
                  setIsEditMode(false);
                }
              },
            },
          ],
          { cancelable: true }
        );
      } else {
        // No changes, just exit
        setIsEditMode(false);
      }
      return;
    }

    // Entering edit mode
    setIsEditMode(true);
    setHasEditModeChanges(false);
    setPendingChanges(new Map());
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Calendar Overview</Text>
          <View style={styles.placeholder} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => {
            if (isEditMode && hasEditModeChanges) {
              // Show confirmation dialog
              Alert.alert(
                "Unsaved Changes",
                "You have unsaved changes. What would you like to do?",
                [
                  {
                    text: "Cancel",
                    style: "cancel",
                  },
                  {
                    text: "Don't Save",
                    style: "destructive",
                    onPress: () => {
                      isHandlingNavigation.current = true;
                      setHasEditModeChanges(false);
                      setPendingChanges(new Map());
                      setIsEditMode(false);
                      navigation.goBack();
                    },
                  },
                  {
                    text: "Save",
                    onPress: async () => {
                      const success = await savePendingChanges();
                      if (success) {
                        isHandlingNavigation.current = true;
                        setIsEditMode(false);
                        navigation.goBack();
                      }
                    },
                  },
                ]
              );
            } else {
              navigation.goBack();
            }
          }}
        >
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Calendar Overview</Text>
        <TouchableOpacity
          style={[
            styles.headerEditButton,
            isEditMode &&
              !hasEditModeChanges &&
              styles.headerEditButtonDisabled,
            submitting && styles.headerEditButtonDisabled,
          ]}
          onPress={toggleEditMode}
          disabled={(isEditMode && !hasEditModeChanges) || submitting}
        >
          {submitting ? (
            <ActivityIndicator size="small" color={colors.text} />
          ) : (
            <Ionicons
              name={isEditMode ? "checkmark" : "create-outline"}
              size={24}
              color={
                isEditMode && !hasEditModeChanges
                  ? colors.textLight
                  : colors.text
              }
            />
          )}
        </TouchableOpacity>
      </View>

      <CalendarList
        current={new Date().toISOString().split('T')[0]}
        pastScrollRange={11}
        futureScrollRange={0}
        markedDates={markedDates}
        hideExtraDays={false}
        scrollEnabled={true}
        showScrollIndicator={true}
        pagingEnabled={false}
        horizontal={false}
        calendarWidth={SCREEN_WIDTH - 40}
        calendarHeight={350}
        dayComponent={dayComponent}
        onDayPress={(day) => {
          if (isEditMode) {
            handleDayPress(day);
          } else {
          }
        }}
        contentContainerStyle={{
          paddingBottom: 100,
        }}
        removeClippedSubviews={false}
        scrollEventThrottle={16}
        nestedScrollEnabled={true}
        theme={{
          backgroundColor: colors.calendar,
          calendarBackground: colors.calendar,
          dayBackgroundColor: colors.calendar,
          todayBackgroundColor: "transparent",
          textSectionTitleColor: colors.text,
          selectedDayBackgroundColor: colors.selected,
          selectedDayTextColor: colors.textOnPrimary,
          todayTextColor: colors.primary,
          dayTextColor: colors.text,
          textDisabledColor: colors.textLight,
          dotColor: colors.primary,
          selectedDotColor: colors.textOnPrimary,
          arrowColor: colors.primary,
          monthTextColor: colors.text,
          textDayFontWeight: "500",
          textMonthFontWeight: "bold",
          textDayHeaderFontWeight: "600",
          textDayFontSize: 14,
          textMonthFontSize: 16,
          textDayHeaderFontSize: 13,
        }}
        style={styles.calendarList}
        calendarStyle={styles.calendarCard}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 50,
    paddingBottom: 16,
    backgroundColor: colors.background,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text,
  },
  placeholder: {
    width: 40,
  },
  headerEditButton: {
    padding: 4,
    width: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerEditButtonDisabled: {
    opacity: 0.4,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  calendarList: {
    paddingHorizontal: 20,
    paddingTop: 12,
    marginBottom: 30,
  },
  calendarCard: {
    backgroundColor: colors.calendar,
    borderRadius: 16,
    marginBottom: 20,
    // Shadow for iOS
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    // Shadow for Android
    elevation: 3,
  },
});