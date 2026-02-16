import { useState, useCallback, useRef } from "react";
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
  const [cycleHistory, setCycleHistory] = useState([]); // Store cycle history for dynamic calculation
  const cycleDayCacheRef = useRef(new Map()); // Cache for calculated cycle days to avoid recalculation
  const cycleHistoryHashRef = useRef(null); // Track cycle history version for cache invalidation
  const entriesCacheRef = useRef(new Map()); // Cache for dates that have entries: key = date (YYYY-MM-DD), value = boolean (has entry)
  const entriesDataCacheRef = useRef(new Map()); // Cache for tracking entries data by month: key = "YYYY-MM", value = array of entries

  const loadCalendarData = useCallback(async (tracker, month = null) => {
    if (!tracker) return;

    try {
      // Use provided month or default to current month
      const targetMonth = month || new Date().toISOString().slice(0, 7); // YYYY-MM format

      // Check if it's a Period Tracker
      const isPeriodTracker = tracker.category_name === "Period Tracker";

      let response;
      if (isPeriodTracker) {
        const apiResponse = await dataTrackingService.getCalendar(tracker.id, {
          params: { month: targetMonth },
        });
        // The API returns { data: { ... }, message: "..." }
        // dataTrackingService.getCalendar already returns response.data
        // But if it's still wrapped, unwrap it
        response = apiResponse.data || apiResponse;
      } else {
        response = await dataTrackingService.getTrackerCalendar(tracker.id, {
          params: { month: targetMonth },
        });
      }

      // Format calendar data for react-native-calendars
      // Backend returns data in calendar_grid.days (array) or days (array/object) format
      const markedDates = {};
      const today = new Date().toISOString().split("T")[0];
      
      // Handle both response formats: array (calendar_grid.days or days) or object (days)
      let daysData = {};
      let allCalendarDates = []; // Store all dates in calendar view
      
      if (response.calendar_grid?.days && Array.isArray(response.calendar_grid.days)) {
        // Convert array to object keyed by date and collect all dates
        response.calendar_grid.days.forEach((day) => {
          if (day.date) {
            daysData[day.date] = day;
            allCalendarDates.push(day.date);
          }
        });
      } else if (response.days) {
        if (Array.isArray(response.days)) {
          // Convert array to object keyed by date and collect all dates
          response.days.forEach((day) => {
            if (day.date) {
              daysData[day.date] = day;
              allCalendarDates.push(day.date);
            }
          });
        } else {
          // Already an object
          daysData = response.days;
          allCalendarDates = Object.keys(daysData);
        }
      }


      if (isPeriodTracker && allCalendarDates.length > 0) {
        // Get all cycles to calculate sequential day numbers across cycle history
        let allCycles = [];
        let firstCycleStartDate = null;
        
        // ============================================================
        // SIMPLE ENTRIES FETCHING: Fetch entries for visible months
        // ============================================================
        // Strategy: Fetch entries for each visible month separately, cache by month+year
        // This ensures lightweight requests and proper caching across years
        
        // Step 1: Determine which months are visible in the calendar
        const visibleMonths = new Set();
        allCalendarDates.forEach(dateStr => {
          const dateParts = dateStr.split('-');
          if (dateParts.length === 3) {
            const year = dateParts[0];
            const month = dateParts[1];
            visibleMonths.add(`${year}-${month}`);
          }
        });
        
        // Step 2: Load ALL cached entries for visible months into entriesCacheRef FIRST
        // This ensures entries are available when we process dates
        Array.from(visibleMonths).forEach(monthKey => {
          const cachedEntries = entriesDataCacheRef.current.get(monthKey) || [];
          cachedEntries.forEach(entry => {
            // Handle both 'entry_date' and 'date' field names
            const dateValue = entry.entry_date || entry.date;
            if (dateValue) {
              const entryDate = typeof dateValue === 'string' 
                ? dateValue.split('T')[0] 
                : dateValue;
              entriesCacheRef.current.set(entryDate, true);
            }
          });
        });
        
        // Step 3: Fetch missing months and cache them
        const monthsToFetch = Array.from(visibleMonths).filter(monthKey => {
          return !entriesDataCacheRef.current.has(monthKey);
        });
        
        if (monthsToFetch.length > 0) {
          try {
            // Fetch each month separately (one request per month)
            const fetchPromises = monthsToFetch.map(async (monthKey) => {
              const [year, month] = monthKey.split('-');
              const yearNum = parseInt(year, 10);
              const monthNum = parseInt(month, 10);
              
              // Calculate first and last day of the month
              const monthStart = new Date(yearNum, monthNum - 1, 1);
              const monthEnd = new Date(yearNum, monthNum, 0);
              const startDate = monthStart.toISOString().split('T')[0];
              const endDate = monthEnd.toISOString().split('T')[0];
              
              // Fetch all pages for this month
              let allEntries = [];
              let currentPage = 1;
              let hasMore = true;
              
              while (hasMore) {
                const response = await dataTrackingService.getDataRange(tracker.id, startDate, endDate, {
                  params: { per_page: 100, page: currentPage }
                });
                
                const pageData = response.data?.tracking_data || response.tracking_data || [];
                const pagination = response.data?.pagination || response.pagination;
                
                allEntries = allEntries.concat(pageData);
                
                if (pagination) {
                  const totalPages = pagination.total_pages || pagination.pages;
                  hasMore = pagination.has_next || (currentPage < totalPages);
                  if (hasMore) currentPage++;
                } else {
                  hasMore = false;
                }
              }
              
              return { monthKey, entries: allEntries };
            });
            
            const results = await Promise.all(fetchPromises);
            
            // Step 4: Cache entries by month and add to entriesCacheRef
            results.forEach(({ monthKey, entries }) => {
              // Cache by month+year for future use
              entriesDataCacheRef.current.set(monthKey, entries);
              
              // Add to quick lookup cache
              entries.forEach(entry => {
                if (entry.entry_date) {
                  // Handle both 'entry_date' and 'date' field names
                  const dateValue = entry.entry_date || entry.date;
                  if (dateValue) {
                    const entryDate = typeof dateValue === 'string' 
                      ? dateValue.split('T')[0] 
                      : dateValue;
                    entriesCacheRef.current.set(entryDate, true);
                  }
                }
              });
            });
          } catch (error) {
            console.error("Error fetching tracking entries:", error);
          }
        }
        
        try {
          const cyclesResponse = await trackerService.getCyclesHistory(tracker.id, {
            params: { months: 12, include_current: true }, // Get last 12 months of cycles, including current
          });
          // Backend returns { data: { cycles: [...], total_count: ..., filters_applied: {...} } }
          allCycles = cyclesResponse.data?.cycles || cyclesResponse.cycles || [];
          
          // Sort cycles by start date (oldest first)
          allCycles.sort((a, b) => {
            const dateA = new Date(a.cycle_start_date || a.period_start_date);
            const dateB = new Date(b.cycle_start_date || b.period_start_date);
            return dateA - dateB;
          });
          
          // Store cycle history for dynamic calculation in calendar
          setCycleHistory(allCycles);
          
          // Generate hash of cycle data for cache invalidation
          // This ensures cache clears if cycles are updated (not just added/removed)
          const cycleHash = allCycles.length > 0 
            ? allCycles.map(c => `${c.id || ''}_${c.cycle_start_date || c.period_start_date}_${c.cycle_end_date || 'current'}_${c.predicted_ovulation_date || ''}`).join('|')
            : 'empty';
          
          // Clear cache if cycle history actually changed (not just re-render)
          if (cycleHistoryHashRef.current !== cycleHash) {
            cycleDayCacheRef.current.clear();
            cycleHistoryHashRef.current = cycleHash;
          }
          
          // Get the first cycle start date for sequential numbering
          if (allCycles.length > 0) {
            firstCycleStartDate = new Date(
              allCycles[0].cycle_start_date || allCycles[0].period_start_date
            );
          }
        } catch (error) {
          console.error("Error fetching cycle history:", error);
          // Fallback to current cycle only
        }
        
        // Get current cycle info as fallback
        const currentCycleInfo = response.current_cycle_info || {};
        const currentCycleDay = currentCycleInfo.cycle_day;
        
        // Calculate cycle start date from today's cycle day (fallback if no history)
        let cycleStartDate = null;
        if (currentCycleDay && !firstCycleStartDate) {
          const todayDate = new Date(today);
          cycleStartDate = new Date(todayDate);
          cycleStartDate.setDate(todayDate.getDate() - (currentCycleDay - 1));
        } else if (firstCycleStartDate) {
          cycleStartDate = firstCycleStartDate;
        }
        
        // For period tracker, mark different cycle phases with colored dots
        // Also calculate cycle day for each date
        // Process ALL dates in the calendar view (including buffer days from previous/next months)
        allCalendarDates.forEach((date) => {
          const dayData = daysData[date] || null;
          
          // Calculate cycle day - find which cycle this date belongs to
          let cycleDay = null;
          let foundCycle = null; // Declare outside blocks so it's available for phase calculation
          
          if (dayData && dayData.cycle && dayData.cycle.cycle_start_date) {
            // Use cycle data from day if available
            const cycleStart = new Date(dayData.cycle.cycle_start_date);
            const currentDate = new Date(date);
            const diffTime = currentDate - cycleStart;
            const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;
            cycleDay = diffDays > 0 ? diffDays : null;
            // Try to find the matching cycle in allCycles to get cycle_end_date
            if (allCycles.length > 0) {
              const cycleStartStr = dayData.cycle.cycle_start_date;
              foundCycle = allCycles.find(c => 
                (c.cycle_start_date || c.period_start_date) === cycleStartStr
              ) || null;
            }
          } else if (allCycles.length > 0 && date <= today) {
            // Find which cycle this date belongs to from cycle history
            const currentDate = new Date(date);
            
            // Find the current cycle first (the one without cycle_end_date)
            let currentCycle = null;
            let currentCycleStart = null;
            
            for (const cycle of allCycles) {
              if (!cycle.cycle_end_date) {
                const cycleStartStr = cycle.cycle_start_date || cycle.period_start_date;
                if (cycleStartStr) {
                  currentCycle = cycle;
                  currentCycleStart = new Date(cycleStartStr);
                  // Reset time to avoid timezone issues
                  currentCycleStart.setHours(0, 0, 0, 0);
                  break;
                }
              }
            }
            
            // Reset time for date comparison to avoid timezone issues
            const dateForComparison = new Date(currentDate);
            dateForComparison.setHours(0, 0, 0, 0);
            
            // Priority 1: If date is on or after current cycle start, ALWAYS use current cycle
            // This ensures days 1-66 of current cycle all show numbers
            if (currentCycle && currentCycleStart && dateForComparison >= currentCycleStart) {
              foundCycle = currentCycle;
            } else {
              // Priority 2: Check completed cycles for dates before current cycle
              for (const cycle of allCycles) {
                if (cycle.cycle_end_date) {
                  const cycleStartStr = cycle.cycle_start_date || cycle.period_start_date;
                  if (!cycleStartStr) continue;
                  
                  const cycleStart = new Date(cycleStartStr);
                  cycleStart.setHours(0, 0, 0, 0);
                  const cycleEnd = new Date(cycle.cycle_end_date);
                  cycleEnd.setHours(0, 0, 0, 0);
                  
                  // Check if date is within this completed cycle's range
                  if (dateForComparison >= cycleStart && dateForComparison <= cycleEnd) {
                    foundCycle = cycle;
                    break;
                  }
                }
              }
            }
            
            if (foundCycle) {
              // Calculate day within this specific cycle
              const cycleStartStr = foundCycle.cycle_start_date || foundCycle.period_start_date;
              const cycleStart = new Date(cycleStartStr);
              cycleStart.setHours(0, 0, 0, 0);
              const diffTime = dateForComparison - cycleStart;
              const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;
              cycleDay = diffDays > 0 ? diffDays : null;
            }
          } else if (cycleStartDate && date <= today) {
            // Fallback: Calculate from current cycle start date for past/today dates
            const currentDate = new Date(date);
            const diffTime = currentDate - cycleStartDate;
            const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;
            cycleDay = diffDays > 0 ? diffDays : null;
          }
          
          // Build the marking object
          const marking = {};
          
          // Check if user logged data for this date (use cache first, then dayData)
          // Dots now indicate logged data, not phase
          let hasEntry = false;
          
          // Check cache first (populated from visible month fetch)
          if (entriesCacheRef.current.has(date)) {
            hasEntry = entriesCacheRef.current.get(date) === true;
          } else if (dayData?.has_entry === true || dayData?.has_entry === 1) {
            // Fallback to dayData if available
            hasEntry = true;
            entriesCacheRef.current.set(date, true);
          }
          
          if (hasEntry) {
            marking.marked = true;
            marking.dotColor = colors.primary; // Use primary color for logged data dots
          }
          
          // Always include cycle day for past/today dates if we calculated it
          if (cycleDay && date <= today) {
            marking.cycleDay = cycleDay;
            
            // ALWAYS check for exact ovulation day, even if phase was already set
            let isExactOvulationDay = false;
            let ovulationDate = null;
            
            // Priority 1: For ended cycles, calculate ovulation date from cycle_end (cycle_end - 14 days)
            if (foundCycle && foundCycle.cycle_end_date) {
              const cycleEnd = new Date(foundCycle.cycle_end_date);
              cycleEnd.setHours(0, 0, 0, 0);
              // Calculate ovulation date: 14 days before cycle end
              ovulationDate = new Date(cycleEnd);
              ovulationDate.setDate(ovulationDate.getDate() - 14);
              ovulationDate.setHours(0, 0, 0, 0);
            }
            // Priority 2: For current cycles, use predicted_ovulation_date
            else if (foundCycle && foundCycle.predicted_ovulation_date) {
              ovulationDate = new Date(foundCycle.predicted_ovulation_date);
              ovulationDate.setHours(0, 0, 0, 0);
            }
            
            // Check if this date matches the ovulation date
            if (ovulationDate) {
              const currentDate = new Date(date);
              currentDate.setHours(0, 0, 0, 0);
              if (currentDate.getTime() === ovulationDate.getTime()) {
                isExactOvulationDay = true;
                marking.isExactOvulationDay = true; // Set it here, outside the phase calculation
              }
            }
            
            // Determine phase based on cycle day
            // For ended cycles, always recalculate phase using calculated ovulation date (overrides dayData phase)
            // For current cycles, use pre-set phase from dayData if available, otherwise calculate
            const isEndedCycle = foundCycle && foundCycle.cycle_end_date;
            const shouldRecalculatePhase = isEndedCycle || !marking.phase;
            
            if (shouldRecalculatePhase) {
              let periodLength = 5; // default
              let cycleLength = 28; // default
              
              if (foundCycle) {
                // Use the cycle's actual values
                periodLength = foundCycle.period_length || 5;
                cycleLength = foundCycle.cycle_length || 28;
              } else {
                // Fallback to settings or defaults
                const settings = response.settings || {};
                cycleLength = settings.average_cycle_length || currentCycleInfo.average_cycle_length || 28;
                periodLength = settings.average_period_length || currentCycleInfo.average_period_length || 5;
              }
              
              // CRITICAL FIX: Use ACTUAL period dates from DB, not cycleDay calculation
              const currentDate = new Date(date);
              currentDate.setHours(0, 0, 0, 0);
              
              let isInActualPeriod = false;
              if (foundCycle && foundCycle.period_start_date) {
                const periodStart = new Date(foundCycle.period_start_date);
                periodStart.setHours(0, 0, 0, 0);
                const periodEnd = foundCycle.period_end_date 
                  ? new Date(foundCycle.period_end_date) 
                  : new Date(periodStart);
                periodEnd.setHours(0, 0, 0, 0);
                
                isInActualPeriod = currentDate >= periodStart && currentDate <= periodEnd;
              }
              
              if (isInActualPeriod) {
                marking.phase = "menstrual";
              } else {
                // Calculate ovulation day (fallback if ovulation date not available)
                const ovulationDay = cycleLength - 14;
                
                // Use ovulation date (calculated for ended cycles or predicted for current cycles)
                if (ovulationDate) {
                  const cycleStart = new Date(foundCycle.cycle_start_date || foundCycle.period_start_date);
                  cycleStart.setHours(0, 0, 0, 0);
                  const diffTime = ovulationDate - cycleStart;
                  const calculatedOvulationDay = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;
                  
                  // Ovulation phase is 5 days around the ovulation day
                  if (cycleDay >= calculatedOvulationDay - 2 && cycleDay <= calculatedOvulationDay + 2) {
                    marking.phase = "ovulation";
                    // Mark the exact ovulation day (already set above if it matches ovulation date)
                    if (cycleDay === calculatedOvulationDay && !isExactOvulationDay) {
                      marking.isExactOvulationDay = true;
                    }
                  } else if (cycleDay < calculatedOvulationDay - 2) {
                    marking.phase = "follicular";
                  } else {
                    marking.phase = "luteal";
                  }
                } else {
                  // Fallback to calculated ovulation day
                  const fallbackOvulationDay = cycleLength - 14;
                  if (cycleDay >= fallbackOvulationDay - 2 && cycleDay <= fallbackOvulationDay + 2) {
                    marking.phase = "ovulation";
                    // Mark the exact ovulation day (calculated)
                    if (cycleDay === fallbackOvulationDay) {
                      marking.isExactOvulationDay = true;
                    }
                  } else if (cycleDay < fallbackOvulationDay - 2) {
                    marking.phase = "follicular";
                  } else {
                    marking.phase = "luteal";
                  }
                }
              }
              
              // Phase is stored for background colors, but dots are now for logged data only
              // So we don't set marking.marked or dotColor here based on phase
            }
          }
          
          // Check if user logged data for this date (if not already checked above)
          // This handles cases where phase wasn't set but entry exists
          if (!marking.marked) {
            let hasEntry = false;
            
            // Check cache first - explicitly check for true value
            if (entriesCacheRef.current.has(date)) {
              const cachedValue = entriesCacheRef.current.get(date);
              hasEntry = cachedValue === true; // Explicitly check for true
            } else if (dayData?.has_entry === true || dayData?.has_entry === 1) {
              hasEntry = true;
              entriesCacheRef.current.set(date, true);
            }
            
            if (hasEntry) {
              marking.marked = true;
              marking.dotColor = colors.primary;
            }
          }
          
          // Always add to markedDates if we have cycleDay OR marked phase OR marked entry
          if (marking.cycleDay !== undefined || marking.marked || marking.phase) {
            markedDates[date] = marking;
          }
        });
        
        // Mark all visible dates that have entries (final pass to ensure all dates are marked)
        allCalendarDates.forEach(date => {
          const hasEntry = entriesCacheRef.current.get(date) === true;
          if (hasEntry) {
            if (!markedDates[date]) {
              markedDates[date] = {
                marked: true,
                dotColor: colors.primary
              };
            } else {
              markedDates[date].marked = true;
              markedDates[date].dotColor = colors.primary;
            }
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
      setCycleHistory([]); // Clear cycle history on error
      cycleDayCacheRef.current.clear(); // Clear cache on error
      cycleHistoryHashRef.current = null; // Reset hash on error
      entriesCacheRef.current.clear(); // Clear entries cache on error
    }
  }, []);
  
  // Helper function to calculate cycle day and phase for any date (used dynamically in calendar)
  const calculateCycleDayForDate = useCallback((dateString, allCyclesOverride = null) => {
    const allCycles = allCyclesOverride || cycleHistory;
    if (!allCycles || allCycles.length === 0) return { cycleDay: null, phase: null, isExactOvulationDay: false };
    
    const today = new Date().toISOString().split("T")[0];
    if (dateString > today) return { cycleDay: null, phase: null, isExactOvulationDay: false }; // Don't show cycle day for future dates
    
    // Check cache first - use dateString as key (cache is cleared when cycles change)
    // Using just dateString is safe because we clear cache when cycle history changes
    const cacheKey = dateString;
    const cached = cycleDayCacheRef.current.get(cacheKey);
    if (cached !== undefined) {
      return cached;
    }
    
    // Optional: Limit cache size to prevent unbounded growth (keep last 500 entries)
    const MAX_CACHE_SIZE = 500;
    if (cycleDayCacheRef.current.size >= MAX_CACHE_SIZE) {
      // Remove oldest entries (first 100) - simple FIFO approach
      const keysToDelete = Array.from(cycleDayCacheRef.current.keys()).slice(0, 100);
      keysToDelete.forEach(key => cycleDayCacheRef.current.delete(key));
    }
    
    const currentDate = new Date(dateString);
    currentDate.setHours(0, 0, 0, 0);
    let foundCycle = null;
    
    // Find the current cycle first (the one without cycle_end_date)
    let currentCycle = null;
    let currentCycleStart = null;
    
    for (const cycle of allCycles) {
      if (!cycle.cycle_end_date) {
        const cycleStartStr = cycle.cycle_start_date || cycle.period_start_date;
        if (cycleStartStr) {
          currentCycle = cycle;
          currentCycleStart = new Date(cycleStartStr);
          currentCycleStart.setHours(0, 0, 0, 0);
          break;
        }
      }
    }
    
    // Priority 1: If date is on or after current cycle start, ALWAYS use current cycle
    if (currentCycle && currentCycleStart && currentDate >= currentCycleStart) {
      foundCycle = currentCycle;
    } else {
      // Priority 2: Check completed cycles for dates before current cycle
      for (const cycle of allCycles) {
        if (cycle.cycle_end_date) {
          const cycleStartStr = cycle.cycle_start_date || cycle.period_start_date;
          if (!cycleStartStr) continue;
          
          const cycleStart = new Date(cycleStartStr);
          cycleStart.setHours(0, 0, 0, 0);
          const cycleEnd = new Date(cycle.cycle_end_date);
          cycleEnd.setHours(0, 0, 0, 0);
          
          // Check if date is within this completed cycle's range
          if (currentDate >= cycleStart && currentDate <= cycleEnd) {
            foundCycle = cycle;
            break;
          }
        }
      }
    }
    
    if (foundCycle) {
      // Calculate day within this specific cycle
      const cycleStartStr = foundCycle.cycle_start_date || foundCycle.period_start_date;
      const cycleStart = new Date(cycleStartStr);
      cycleStart.setHours(0, 0, 0, 0);
      const diffTime = currentDate - cycleStart;
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;
      const cycleDay = diffDays > 0 ? diffDays : null;
      
      if (!cycleDay) {
        return { cycleDay: null, phase: null, isExactOvulationDay: false };
      }
      
      // Calculate phase based on cycle day
      // Use cycle's period_length if available, otherwise default to 5
      const periodLength = foundCycle.period_length || 5;
      // Use cycle's cycle_length if available, otherwise default to 28
      const cycleLength = foundCycle.cycle_length || 28;
      
      // Check for exact ovulation day
      // Priority 1: For ended cycles, calculate ovulation date from cycle_end (cycle_end - 14 days)
      // Priority 2: For current cycles, use predicted_ovulation_date
      let isExactOvulationDay = false;
      let ovulationDate = null;
      
      if (foundCycle.cycle_end_date) {
        // Ended cycle: calculate ovulation date (14 days before cycle end)
        const cycleEnd = new Date(foundCycle.cycle_end_date);
        cycleEnd.setHours(0, 0, 0, 0);
        ovulationDate = new Date(cycleEnd);
        ovulationDate.setDate(ovulationDate.getDate() - 14);
        ovulationDate.setHours(0, 0, 0, 0);
      } else if (foundCycle.predicted_ovulation_date) {
        // Current cycle: use predicted ovulation date
        ovulationDate = new Date(foundCycle.predicted_ovulation_date);
        ovulationDate.setHours(0, 0, 0, 0);
      }
      
      if (ovulationDate && currentDate.getTime() === ovulationDate.getTime()) {
        isExactOvulationDay = true;
      }
      
      let phase = null;
      
      // CRITICAL FIX: Use ACTUAL period dates from DB, not cycleDay calculation
      const periodStart = new Date(foundCycle.period_start_date);
      periodStart.setHours(0, 0, 0, 0);
      const periodEnd = foundCycle.period_end_date 
        ? new Date(foundCycle.period_end_date) 
        : new Date(periodStart);
      periodEnd.setHours(0, 0, 0, 0);
      
      if (currentDate >= periodStart && currentDate <= periodEnd) {
        phase = "menstrual";
      } else {
        // Calculate ovulation day (fallback if predicted_ovulation_date not available)
        const ovulationDay = cycleLength - 14; // Typically 14 days before next period
        
        // Use ovulation date (calculated for ended cycles or predicted for current cycles)
        if (ovulationDate) {
          const cycleStart = new Date(foundCycle.cycle_start_date || foundCycle.period_start_date);
          cycleStart.setHours(0, 0, 0, 0);
          const diffTime = ovulationDate - cycleStart;
          const calculatedOvulationDay = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;
          
          // Ovulation phase is 5 days around the ovulation day
          if (cycleDay >= calculatedOvulationDay - 2 && cycleDay <= calculatedOvulationDay + 2) {
            phase = "ovulation";
            // Mark the exact ovulation day
            if (cycleDay === calculatedOvulationDay && !isExactOvulationDay) {
              isExactOvulationDay = true;
            }
          } else if (cycleDay < calculatedOvulationDay - 2) {
            phase = "follicular";
          } else {
            phase = "luteal";
          }
        } else {
          // Fallback to calculated ovulation day
          const fallbackOvulationDay = cycleLength - 14;
          if (cycleDay >= fallbackOvulationDay - 2 && cycleDay <= fallbackOvulationDay + 2) {
            phase = "ovulation";
            // Mark the exact ovulation day (calculated)
            if (cycleDay === fallbackOvulationDay) {
              isExactOvulationDay = true;
            }
          } else if (cycleDay < fallbackOvulationDay - 2) {
            phase = "follicular";
          } else {
            phase = "luteal";
          }
        }
      }
      
      const result = { cycleDay, phase, isExactOvulationDay };
      // Cache the result for future use
      cycleDayCacheRef.current.set(cacheKey, result);
      return result;
    }
    
    const result = { cycleDay: null, phase: null, isExactOvulationDay: false };
    // Cache null results too to avoid recalculating invalid dates
    cycleDayCacheRef.current.set(cacheKey, result);
    return result;
  }, [cycleHistory]);

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
      // 404 is expected when there's not enough data for insights yet
      // Only log non-404 errors
      if (error.response?.status !== 404) {
        console.error("Error loading insights:", error);
      }
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
          loadInsights(tracker);
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
    cycleHistory,
    loadTrackers,
    // Expose functions to load data for a specific tracker
    loadCalendarData,
    loadInsights,
    checkPeriodTrackerSetup,
    calculateCycleDayForDate,
  };
};
