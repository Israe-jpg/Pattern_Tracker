/**
 * Utility functions for calculating cycle days and phases
 * Shared across calendar components
 */

/**
 * Calculate cycle day and phase for a given date
 * @param {string} dateString - Date in YYYY-MM-DD format
 * @param {Array} allCycles - Array of cycle objects
 * @returns {Object} { cycleDay, phase, isExactOvulationDay }
 */
export const calculateCycleDayForDate = (dateString, allCycles) => {
  if (!allCycles || allCycles.length === 0) {
    return { cycleDay: null, phase: null, isExactOvulationDay: false };
  }
  
  const today = new Date().toISOString().split("T")[0];
  if (dateString > today) {
    return { cycleDay: null, phase: null, isExactOvulationDay: false };
  }
  
  const currentDate = new Date(dateString);
  currentDate.setHours(0, 0, 0, 0);
  let foundCycle = null;
  
  // Find the current cycle first (the one without cycle_end_date)
  // There should only be one current cycle, but find the most recent one
  let currentCycle = null;
  let currentCycleStart = null;
  let latestCurrentCycleStart = null;
  
  for (const cycle of allCycles) {
    if (!cycle.cycle_end_date) {
      const cycleStartStr = cycle.cycle_start_date || cycle.period_start_date;
      if (cycleStartStr) {
        const cycleStart = new Date(cycleStartStr);
        cycleStart.setHours(0, 0, 0, 0);
        
        // Use the most recent current cycle (in case there are multiple)
        if (!latestCurrentCycleStart || cycleStart > latestCurrentCycleStart) {
          currentCycle = cycle;
          currentCycleStart = cycleStart;
          latestCurrentCycleStart = cycleStart;
        }
      }
    }
  }
  
  // Priority 1: If date is on or after current cycle start, use current cycle
  if (currentCycle && currentCycleStart && currentDate >= currentCycleStart) {
    foundCycle = currentCycle;
  } else {
    // Priority 2: Check completed cycles (sorted by start date, check most recent first)
    // Sort cycles by start date descending to check most recent first
    const completedCycles = allCycles
      .filter(cycle => cycle.cycle_end_date)
      .sort((a, b) => {
        const dateA = new Date(a.cycle_start_date || a.period_start_date);
        const dateB = new Date(b.cycle_start_date || b.period_start_date);
        return dateB - dateA; // Descending order
      });
    
    for (const cycle of completedCycles) {
      const cycleStartStr = cycle.cycle_start_date || cycle.period_start_date;
      if (!cycleStartStr) continue;
      
      const cycleStart = new Date(cycleStartStr);
      cycleStart.setHours(0, 0, 0, 0);
      const cycleEnd = new Date(cycle.cycle_end_date);
      cycleEnd.setHours(0, 0, 0, 0);
      
      if (currentDate >= cycleStart && currentDate <= cycleEnd) {
        foundCycle = cycle;
        break;
      }
    }
  }
  
  if (!foundCycle) {
    return { cycleDay: null, phase: null, isExactOvulationDay: false };
  }
  
  // Calculate day within this cycle
  const cycleStartStr = foundCycle.cycle_start_date || foundCycle.period_start_date;
  const cycleStart = new Date(cycleStartStr);
  cycleStart.setHours(0, 0, 0, 0);
  const diffTime = currentDate - cycleStart;
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;
  const cycleDay = diffDays > 0 ? diffDays : null;
  
  if (!cycleDay) {
    return { cycleDay: null, phase: null, isExactOvulationDay: false };
  }
  
  // Calculate ovulation date
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
  
  // Calculate phase
  const periodLength = foundCycle.period_length || 5;
  const cycleLength = foundCycle.cycle_length || 28;
  let phase = null;
  
  if (cycleDay <= periodLength) {
    phase = "menstrual";
  } else if (ovulationDate) {
    const cycleStart = new Date(foundCycle.cycle_start_date || foundCycle.period_start_date);
    cycleStart.setHours(0, 0, 0, 0);
    const diffTime = ovulationDate - cycleStart;
    const calculatedOvulationDay = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;
    
    if (cycleDay >= calculatedOvulationDay - 2 && cycleDay <= calculatedOvulationDay + 2) {
      phase = "ovulation";
      if (cycleDay === calculatedOvulationDay && !isExactOvulationDay) {
        isExactOvulationDay = true;
      }
    } else if (cycleDay < calculatedOvulationDay - 2) {
      phase = "follicular";
    } else {
      phase = "luteal";
    }
  } else {
    // Fallback
    const fallbackOvulationDay = cycleLength - 14;
    if (cycleDay >= fallbackOvulationDay - 2 && cycleDay <= fallbackOvulationDay + 2) {
      phase = "ovulation";
      if (cycleDay === fallbackOvulationDay) {
        isExactOvulationDay = true;
      }
    } else if (cycleDay < fallbackOvulationDay - 2) {
      phase = "follicular";
    } else {
      phase = "luteal";
    }
  }
  
  return { cycleDay, phase, isExactOvulationDay };
};

/**
 * Sort cycles by start date (oldest first)
 * @param {Array} cycles - Array of cycle objects
 * @returns {Array} Sorted cycles
 */
export const sortCyclesByStartDate = (cycles) => {
  return [...cycles].sort((a, b) => {
    const dateA = new Date(a.cycle_start_date || a.period_start_date);
    const dateB = new Date(b.cycle_start_date || b.period_start_date);
    return dateA - dateB;
  });
};
