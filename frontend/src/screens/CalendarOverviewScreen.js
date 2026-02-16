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
  const [submitting, setSubmitting] = useState(false);
  const [refreshing, setRefreshing] = useState(false); // Track calendar refresh
  const [selectedPeriodDates, setSelectedPeriodDates] = useState(new Set()); // Simple set of date strings
  const [initialPeriodDates, setInitialPeriodDates] = useState(new Set()); // For detecting changes
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
      
      // In edit mode, determine if this date is selected as a period date
      const isSelectedPeriodDate = selectedPeriodDates.has(dateString);
      const originalIsMenstrual = dateMarking.phase === "menstrual" || dateMarking.phase === "period";
      
      // isToggledPeriod logic:
      // - If selected and not originally menstrual: true (adding new period)
      // - If not selected and originally menstrual: false (removing period)
      // - Otherwise: undefined (no change)
      let isToggledPeriod = undefined;
      if (isEditMode) {
        if (isSelectedPeriodDate && !originalIsMenstrual) {
          isToggledPeriod = true; // New period date
        } else if (!isSelectedPeriodDate && originalIsMenstrual) {
          isToggledPeriod = false; // Removing period date
        }
      }
      
      return (
        <CustomDay 
          {...props} 
          marking={fullMarking} 
          isEditMode={isEditMode}
          isSelected={isEditMode && isSelectedPeriodDate}
          isToggledPeriod={isToggledPeriod}
          onDayPress={isEditMode ? handleDayPress : undefined}
        />
      );
    };
  }, [isPeriodTracker, markedDates, isEditMode, selectedPeriodDates, handleDayPress, refreshKey]);

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
  const hasEditModeChanges = useMemo(() => {
    if (!isEditMode) return false;
    
    // Compare current selection with initial state
    if (selectedPeriodDates.size !== initialPeriodDates.size) return true;
    
    for (const date of selectedPeriodDates) {
      if (!initialPeriodDates.has(date)) return true;
    }
    
    return false;
  }, [isEditMode, selectedPeriodDates, initialPeriodDates]);

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
              setSelectedPeriodDates(new Set());
              setInitialPeriodDates(new Set());
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
      const endDate = new Date(today.getFullYear(), today.getMonth() + 2, 0); // +1 month future
      
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
          
          const currentCycle = sortedCycles.find(cycle => !cycle.cycle_end_date);
          const todayStr = new Date().toISOString().split('T')[0];
          
          if (currentCycle) {
            const periodStart = new Date(currentCycle.period_start_date);
            periodStart.setHours(0, 0, 0, 0);
            const cycleStart = new Date(currentCycle.cycle_start_date || currentCycle.period_start_date);
            cycleStart.setHours(0, 0, 0, 0);
            const periodLength = currentCycle.period_length || 5;
            const cycleLength = currentCycle.cycle_length || 28;
            const ovulationDayNum = cycleLength - 14;
            
            // 1) Show full current period: period_start through period_start + (period_length - 1)
            for (let i = 0; i < periodLength; i++) {
              const d = new Date(periodStart);
              d.setDate(d.getDate() + i);
              const dateStr = d.toISOString().split('T')[0];
              const diffDays = Math.floor((d - cycleStart) / (1000 * 60 * 60 * 24)) + 1;
              const cycleDay = diffDays > 0 ? diffDays : i + 1;
              const existingMarking = dates[dateStr] || {};
              dates[dateStr] = {
                ...existingMarking,
                cycleDay,
                phase: "menstrual",
              };
            }
            
            // 2) Annotations from today until day before predicted next period
            const predNext = currentCycle.predicted_next_period_date
              ? new Date(currentCycle.predicted_next_period_date)
              : null;
            const predOvulationDate = currentCycle.predicted_ovulation_date
              ? new Date(currentCycle.predicted_ovulation_date)
              : null;
            if (predOvulationDate) predOvulationDate.setHours(0, 0, 0, 0);
            if (predNext) {
              predNext.setHours(0, 0, 0, 0);
              const endAnnot = new Date(predNext);
              endAnnot.setDate(endAnnot.getDate() - 1);
              const endAnnotStr = endAnnot.toISOString().split('T')[0];
              
              let d = new Date(todayStr);
              d.setHours(0, 0, 0, 0);
              const endD = new Date(endAnnotStr);
              endD.setHours(0, 0, 0, 0);
              
              while (d <= endD) {
                const dateStr = d.toISOString().split('T')[0];
                const diffDays = Math.floor((d - cycleStart) / (1000 * 60 * 60 * 24)) + 1;
                const cycleDay = diffDays > 0 ? diffDays : null;
                if (!cycleDay) { d.setDate(d.getDate() + 1); continue; }
                
                const periodEnd = new Date(periodStart);
                periodEnd.setDate(periodEnd.getDate() + periodLength - 1);
                const inPeriod = d >= periodStart && d <= periodEnd;
                let phase = "menstrual";
                let isExactOvulationDay = false;
                if (!inPeriod) {
                  // Only the single predicted ovulation date gets ovulation styling (step 3). Here we use follicular/luteal only.
                  if (predOvulationDate && d.getTime() === predOvulationDate.getTime()) {
                    phase = "ovulation";
                    isExactOvulationDay = true;
                  } else if (cycleDay < ovulationDayNum - 2) {
                    phase = "follicular";
                  } else if (cycleDay > ovulationDayNum + 2) {
                    phase = "luteal";
                  } else {
                    phase = cycleDay <= ovulationDayNum ? "follicular" : "luteal";
                  }
                }
                
                const existingMarking = dates[dateStr] || {};
                dates[dateStr] = {
                  ...existingMarking,
                  cycleDay,
                  phase,
                  ...(isExactOvulationDay && { isExactOvulationDay: true }),
                };
                d.setDate(d.getDate() + 1);
              }
            }
            
            // 3) Predicted ovulation (only if not inside current period range)
            if (currentCycle.predicted_ovulation_date) {
              const ovulationDate = new Date(currentCycle.predicted_ovulation_date);
              ovulationDate.setHours(0, 0, 0, 0);
              const periodEnd = new Date(periodStart);
              periodEnd.setDate(periodEnd.getDate() + periodLength - 1);
              const ovulationInPeriod = ovulationDate >= periodStart && ovulationDate <= periodEnd;
              if (!ovulationInPeriod) {
                const ovulationDateStr = ovulationDate.toISOString().split('T')[0];
                const existingMarking = dates[ovulationDateStr] || {};
                dates[ovulationDateStr] = {
                  ...existingMarking,
                  phase: "ovulation",
                  isExactOvulationDay: true,
                  isPredictedOvulation: true,
                };
              }
            }
            
            // 4) Predicted next period
            if (currentCycle.predicted_next_period_date) {
              const predictedStartDate = new Date(currentCycle.predicted_next_period_date);
              
              for (let i = 0; i < periodLength; i++) {
                const predictedDate = new Date(predictedStartDate);
                predictedDate.setDate(predictedDate.getDate() + i);
                const dateStr = predictedDate.toISOString().split('T')[0];
                
                const existingMarking = dates[dateStr] || {};
                dates[dateStr] = {
                  ...existingMarking,
                  cycleDay: i + 1,
                  phase: "menstrual",
                  isPredictedPeriod: true,
                };
              }
            }
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
  /**
   * Save pending changes using the new smart bulk update API
   * Simply send all selected period dates; backend handles all logic
   */
  const savePendingChanges = async () => {
    if (!tracker || !isPeriodTracker) {
      // Not a period tracker, nothing to save
      setSelectedPeriodDates(new Set());
      setInitialPeriodDates(new Set());
      return true;
    }

    try {
      setSubmitting(true);
      setRefreshing(true);
      
      // Convert Set to sorted array
      const periodDatesArray = Array.from(selectedPeriodDates).sort();
      
      // Call the smart bulk update API
      await trackerService.bulkUpdatePeriods(tracker.id, periodDatesArray);
      
      // Exit edit mode FIRST to prevent any stale UI
      setIsEditMode(false);
      setSelectedPeriodDates(new Set());
      setInitialPeriodDates(new Set());
      
      // Small delay to ensure backend commits
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Reload data first, then force refresh
      await loadCalendarData(true);
      
      // Wait for state to settle
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Force remount with new key
      setRefreshKey(Date.now());
      
      // Final delay for render
      await new Promise(resolve => setTimeout(resolve, 200));
      
      return true;
    } catch (error) {
      console.error('Error saving period changes:', error);
      Alert.alert(
        "Error",
        error.response?.data?.error || error.message || "Failed to save changes. Please try again."
      );
      return false;
    } finally {
      setSubmitting(false);
      setRefreshing(false);
    }
  };

  /**
   * Handle day press in edit mode - simply toggle date in/out of period set
   * Backend handles all complex logic (create/update/delete/split/merge cycles)
   */
  const handleDayPress = useCallback((day) => {
    if (!isEditMode) return;
    
    const dateString = day.dateString;
    
    setSelectedPeriodDates(prev => {
      const next = new Set(prev);
      
      if (next.has(dateString)) {
        // Already selected as period date - deselect it
        next.delete(dateString);
      } else {
        // Not selected - add it as period date
        next.add(dateString);
      }
      
      return next;
    });
  }, [isEditMode]);

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
                setSelectedPeriodDates(new Set());
                setInitialPeriodDates(new Set());
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
        setSelectedPeriodDates(new Set());
        setInitialPeriodDates(new Set());
      }
      return;
    }

    // Entering edit mode - initialize with ACTUAL logged period dates from cycles
    const currentPeriodDates = new Set();
    
    // Fetch actual period dates from cycles (not predicted)
    try {
      const cyclesResponse = await trackerService.getCyclesHistory(tracker.id, {
        params: { months: 12, include_current: true },
      });
      
      const allCycles = cyclesResponse.data?.cycles || cyclesResponse.cycles || [];
      
      // Extract all ACTUAL period dates from cycles
      for (const cycle of allCycles) {
        if (!cycle.period_start_date) continue;
        
        const periodStartStr = typeof cycle.period_start_date === 'string' 
          ? cycle.period_start_date.split('T')[0] 
          : cycle.period_start_date;
        const periodEndStr = cycle.period_end_date 
          ? (typeof cycle.period_end_date === 'string' ? cycle.period_end_date.split('T')[0] : cycle.period_end_date)
          : periodStartStr;
        
        // Add all dates from period_start to period_end
        const periodStart = new Date(periodStartStr);
        const periodEnd = new Date(periodEndStr);
        const currentDate = new Date(periodStart);
        
        while (currentDate <= periodEnd) {
          currentPeriodDates.add(currentDate.toISOString().split('T')[0]);
          currentDate.setDate(currentDate.getDate() + 1);
        }
      }
      
      setSelectedPeriodDates(new Set(currentPeriodDates));
      setInitialPeriodDates(new Set(currentPeriodDates));
      setIsEditMode(true);
    } catch (error) {
      console.error('Error loading cycles for edit mode:', error);
      Alert.alert('Error', 'Failed to load period data for editing.');
    }
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
                      setSelectedPeriodDates(new Set());
                      setInitialPeriodDates(new Set());
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

      {refreshing ? (
        <View style={styles.refreshingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.refreshingText}>Updating calendar...</Text>
        </View>
      ) : (
      <CalendarList
        key={`calendar-${refreshKey}`}
        current={new Date().toISOString().split('T')[0]}
        pastScrollRange={11}
        futureScrollRange={1}
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
      )}
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
  refreshingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 100,
  },
  refreshingText: {
    marginTop: 16,
    fontSize: 16,
    color: colors.textLight,
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