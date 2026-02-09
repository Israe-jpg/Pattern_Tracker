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
  }, [isPeriodTracker, markedDates, isEditMode, pendingChanges, handleDayPress]);

  useEffect(() => {
    if (tracker) {
      loadCalendarData();
    }
  }, [tracker]);

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

  const loadCalendarData = async () => {
    if (!tracker) {
      setLoading(false);
      return;
    }
    
    try {
      setLoading(true);
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
      setLoading(false);
    }
  };

  /**
   * Save pending changes
   */
  const savePendingChanges = async () => {
    try {
      setSubmitting(true);
      
      // TODO: Implement actual save logic here
      // For now, just clear pending changes
      console.log('Saving pending changes:', Array.from(pendingChanges.entries()));
      
      // Simulate save delay
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Clear pending changes after successful save
      setPendingChanges(new Map());
      setHasEditModeChanges(false);
      
      return true;
    } catch (error) {
      console.error('Error saving pending changes:', error);
      Alert.alert(
        "Error",
        "Failed to save changes. Please try again."
      );
      return false;
    } finally {
      setSubmitting(false);
    }
  };

  /**
   * Handle day press in edit mode - toggle selection
   */
  const handleDayPress = useCallback((day) => {
    if (!isEditMode) return;
    
    const dateString = day.dateString;
    setPendingChanges(prev => {
      const currentChanges = prev.get(dateString);
      const dateMarking = markedDates[dateString] || {};
      const originalIsMenstrual = dateMarking.phase === "menstrual" || dateMarking.phase === "period";
      
      const wasSelected = currentChanges?.isSelected || false;
      
      // Simple toggle: selected <-> unselected
      const newIsSelected = !wasSelected;
      
      // Update pending changes
      const newPendingChanges = new Map(prev);
      
      if (newIsSelected) {
        // Selected: show red border, keep period state as original
        newPendingChanges.set(dateString, {
          isSelected: true,
          isToggledPeriod: undefined,
        });
      } else {
        // Unselected: for period days, toggle off period styling to show as normal (dashed)
        if (originalIsMenstrual) {
          newPendingChanges.set(dateString, {
            isSelected: false,
            isToggledPeriod: false, // Hide period styling, show as normal day
          });
        } else {
          // Non-period day: just remove the change
          newPendingChanges.delete(dateString);
        }
      }
      
      return newPendingChanges;
    });
  }, [isEditMode, markedDates]);

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
        pagingEnabled={true}
        horizontal={false}
        calendarWidth={SCREEN_WIDTH - 40}
        calendarHeight={350}
        dayComponent={dayComponent}
        onDayPress={(day) => {
          if (isEditMode) {
            handleDayPress(day);
          } else {
            console.log('Selected day:', day);
          }
        }}
        contentContainerStyle={{
          paddingBottom: 100,
        }}
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