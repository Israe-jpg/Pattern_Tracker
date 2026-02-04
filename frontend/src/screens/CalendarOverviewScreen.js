import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { CalendarList } from 'react-native-calendars';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../constants/colors';
import { dataTrackingService } from '../services/dataTrackingService';
import { useTracker } from '../context/TrackerContext';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function CalendarOverviewScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { activeTracker } = useTracker();
  const tracker = route.params?.tracker || activeTracker;
  
  const [loading, setLoading] = useState(true);
  const [markedDates, setMarkedDates] = useState({});

  useEffect(() => {
    if (tracker) {
      loadCalendarData();
    }
  }, [tracker]);

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
        
        let allEntries = [];
        if (entriesResponse?.data && Array.isArray(entriesResponse.data)) {
          allEntries = entriesResponse.data;
        } else if (Array.isArray(entriesResponse)) {
          allEntries = entriesResponse;
        }
        
        // Handle pagination
        if (entriesResponse?.pagination) {
          let currentPage = entriesResponse.pagination.current_page || 1;
          const totalPages = entriesResponse.pagination.total_pages || 1;
          
          while (currentPage < totalPages) {
            currentPage++;
            try {
              const pageResponse = await dataTrackingService.getDataRange(
                tracker.id,
                startDate.toISOString().split('T')[0],
                endDate.toISOString().split('T')[0],
                { params: { per_page: 100, page: currentPage } }
              );
              
              if (pageResponse?.data && Array.isArray(pageResponse.data)) {
                allEntries = allEntries.concat(pageResponse.data);
              } else if (Array.isArray(pageResponse)) {
                allEntries = allEntries.concat(pageResponse);
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
      
      // For period trackers, also fetch calendar overview for cycle information
      if (isPeriodTracker) {
        try {
          const overviewResponse = await dataTrackingService.getCalendarOverview(tracker.id, {
            params: { months: 12 },
          });
          
          const overviewData = overviewResponse?.data || overviewResponse;
          
          // Mark period dates from timeline
          if (overviewData?.timeline) {
            overviewData.timeline.forEach(cycle => {
              // Mark period start
              if (cycle.period_start) {
                const startStr = cycle.period_start.split('T')[0];
                if (!dates[startStr]) {
                  dates[startStr] = { marked: true, dotColor: colors.menstrual };
                } else {
                  dates[startStr].dotColor = colors.menstrual;
                }
              }
              
              // Mark period end
              if (cycle.period_end) {
                const endStr = cycle.period_end.split('T')[0];
                if (!dates[endStr]) {
                  dates[endStr] = { marked: true, dotColor: colors.menstrual };
                } else {
                  dates[endStr].dotColor = colors.menstrual;
                }
              }
              
              // Mark predicted ovulation
              if (cycle.predicted_ovulation) {
                const ovStr = cycle.predicted_ovulation.split('T')[0];
                if (!dates[ovStr]) {
                  dates[ovStr] = { marked: true, dotColor: colors.ovulation };
                } else {
                  dates[ovStr].dotColor = colors.ovulation;
                }
              }
            });
          }
        } catch (error) {
          console.error('Error loading period overview:', error);
        }
      }

      setMarkedDates(dates);
    } catch (error) {
      console.error('Error loading calendar overview:', error);
    } finally {
      setLoading(false);
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
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Calendar Overview</Text>
        <View style={styles.placeholder} />
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
        onDayPress={(day) => {
          console.log('Selected day:', day);
        }}
        contentContainerStyle={{
          paddingBottom: 100,
        }}
        theme={{
          backgroundColor: colors.background,
          calendarBackground: colors.calendar,
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
          indicatorColor: colors.primary,
          textDayFontFamily: 'System',
          textMonthFontFamily: 'System',
          textDayHeaderFontFamily: 'System',
          textDayFontWeight: '400',
          textMonthFontWeight: '600',
          textDayHeaderFontWeight: '600',
          textDayFontSize: 15,
          textMonthFontSize: 18,
          textDayHeaderFontSize: 13,
          'stylesheet.calendar.main': {
            container: {
              paddingLeft: 12,
              paddingRight: 12,
              paddingTop: 8,
              paddingBottom: 12,
            },
            week: {
              marginTop: 4,
              marginBottom: 4,
              flexDirection: 'row',
              justifyContent: 'space-around',
            },
          },
          'stylesheet.calendar.header': {
            header: {
              flexDirection: 'row',
              justifyContent: 'space-between',
              paddingLeft: 12,
              paddingRight: 12,
              paddingTop: 12,
              paddingBottom: 8,
              alignItems: 'center',
            },
            monthText: {
              fontSize: 18,
              fontWeight: '600',
              color: colors.text,
            },
            week: {
              marginTop: 8,
              marginBottom: 4,
              flexDirection: 'row',
              justifyContent: 'space-around',
              paddingHorizontal: 4,
            },
            dayHeader: {
              marginTop: 2,
              marginBottom: 4,
              width: 40,
              textAlign: 'center',
              fontSize: 13,
              fontWeight: '600',
              color: colors.textLight,
            },
          },
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
    borderBottomWidth: 1,
    borderBottomColor: colors.border || 'rgba(0,0,0,0.08)',
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  calendarList: {
    paddingHorizontal: 20,
    paddingTop: 12,
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