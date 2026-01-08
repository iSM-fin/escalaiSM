import { ScheduleStore, LocationData, MonthKey, MonthAssignmentsMap, TemplateMap, Assignment, WeekDate, DateKey, Doctor } from '../types';
import { SCHEDULE_DATA, DEFAULT_FINANCIAL_RULES } from '../constants';
import { getWeeksForMonth } from './dateUtils';

// --- HELPERS ---

// Create a deep clone of assignments
const cloneAssignments = (assigns: Assignment[]): Assignment[] => {
  return JSON.parse(JSON.stringify(assigns));
};

// Helper to extract unique doctors from legacy data
export const extractDoctorsFromLegacy = (data: LocationData[]): Doctor[] => {
  const doctorNames = new Set<string>();

  data.forEach(loc => {
    loc.shifts.forEach(shift => {
      shift.schedule.forEach(day => {
        day.assignments.forEach(assign => {
          if (assign.name && assign.name.trim()) {
            doctorNames.add(assign.name.trim());
          }
        });
      });
    });
  });

  return Array.from(doctorNames).sort().map((name, index) => ({
    id: `doc-init-${index}`,
    name: name,
    type: 'Normal'
  }));
};

// Helper to repair store if doctors are missing (migration for existing localStorage)
export const repairStoreDoctors = (store: ScheduleStore): ScheduleStore => {
  if (!store.doctors || store.doctors.length === 0) {
    return {
      ...store,
      doctors: extractDoctorsFromLegacy(SCHEDULE_DATA)
    };
  }
  return store;
};

// Extract structure and template from legacy data
export const extractTemplateFromLegacy = (data: LocationData[]): { structure: LocationData[], template: TemplateMap } => {
  const structure: LocationData[] = data.map(loc => ({
    ...loc,
    shifts: loc.shifts.map(s => ({
      ...s,
      schedule: [] // Clear specific schedule, keep structure
    }))
  }));

  const template: TemplateMap = {};

  data.forEach(loc => {
    template[loc.id] = {};
    loc.shifts.forEach(shift => {
      template[loc.id][shift.id] = {};
      shift.schedule.forEach(day => {
        // Assume legacy data dayIndex 0-6 corresponds to Template DOW
        if (day.assignments.length > 0) {
          template[loc.id][shift.id][day.dayIndex] = cloneAssignments(day.assignments);
        }
      });
    });
  });

  return { structure, template };
};

// Initialize a new month based on the template
export const createMonthFromTemplate = (
  monthKey: MonthKey,
  template: TemplateMap,
  existingMonthData?: MonthAssignmentsMap,
  onlyFillEmpty: boolean = true
): MonthAssignmentsMap => {

  const newMonthData: MonthAssignmentsMap = existingMonthData ? JSON.parse(JSON.stringify(existingMonthData)) : {};
  const weeks = getWeeksForMonth(monthKey);
  const flatDates = weeks.flat();

  // Iterate over all days in the month (including padding days displayed in weeks)
  flatDates.forEach(dateObj => {
    // Determine Day of Week explicitly from YYYY-MM-DD
    const [y, m, d] = dateObj.dateKey.split('-').map(Number);
    const date = new Date(y, m - 1, d); // Month is 0-indexed in Date constructor
    const jsDay = date.getDay(); // 0(Sun), 1(Mon)...

    // Map to App: 0(Mon)...6(Sun)
    const templateDayIndex = jsDay === 0 ? 6 : jsDay - 1;

    // Apply template for every location/shift
    Object.keys(template).forEach(locId => {
      if (!newMonthData[locId]) newMonthData[locId] = {};

      Object.keys(template[locId]).forEach(shiftId => {
        if (!newMonthData[locId][shiftId]) newMonthData[locId][shiftId] = {};

        const templateAssigns = template[locId][shiftId][templateDayIndex];
        const existingAssigns = newMonthData[locId][shiftId][dateObj.dateKey];

        if (templateAssigns && templateAssigns.length > 0) {
          if (!onlyFillEmpty || !existingAssigns || existingAssigns.length === 0) {
            newMonthData[locId][shiftId][dateObj.dateKey] = cloneAssignments(templateAssigns);
          }
        }
      });
    });
  });

  return newMonthData;
};

// Project the Store Data into the UI-ready LocationData[] for a specific week
export const getWeekViewData = (
  structure: LocationData[],
  monthData: MonthAssignmentsMap,
  currentWeek: WeekDate[]
): LocationData[] => {

  return structure.map(loc => ({
    ...loc,
    shifts: loc.shifts.map(shift => {
      // Build the schedule array for the 7 days of this week
      const weekSchedule = currentWeek.map((dayDate, index) => {
        const assignments = monthData?.[loc.id]?.[shift.id]?.[dayDate.dateKey] || [];
        return {
          dayIndex: index,
          dateKey: dayDate.dateKey,
          isOutOfMonth: dayDate.isOutOfMonth,
          assignments: cloneAssignments(assignments)
        };
      });

      return {
        ...shift,
        schedule: weekSchedule
      };
    })
  }));
};

// Project the Template Store into UI-ready LocationData[] (Standard 7-day view)
export const getTemplateViewData = (
  structure: LocationData[],
  template: TemplateMap
): LocationData[] => {
  return structure.map(loc => ({
    ...loc,
    shifts: loc.shifts.map(shift => {
      // Build a generic 7-day schedule (Mon-Sun)
      const weekSchedule = Array.from({ length: 7 }).map((_, index) => {
        // Look up assignments in the template by day index (0-6)
        const assignments = template[loc.id]?.[shift.id]?.[index] || [];
        return {
          dayIndex: index,
          // We use a fake dateKey for the template view to satisfy types, though it's not a real date
          dateKey: `template-${index}`,
          isOutOfMonth: false,
          assignments: cloneAssignments(assignments)
        };
      });

      return {
        ...shift,
        schedule: weekSchedule
      };
    })
  }));
};

// Initial Migration
export const initializeStore = (): ScheduleStore => {
  const { structure, template } = extractTemplateFromLegacy(SCHEDULE_DATA);

  // Initialize current month with template
  // We'll use Jan 2026 as the starter since the original app was hardcoded to Jan 2026
  const startMonth = '2026-01';

  // Empty month initially, assignments only in Template.
  const initialMonthData: MonthAssignmentsMap = {};

  // Extract doctors from existing data
  const initialDoctors = extractDoctorsFromLegacy(SCHEDULE_DATA);

  return {
    structure,
    template,
    months: {
      [startMonth]: initialMonthData
    },
    // Initialize with extracted doctors
    doctors: initialDoctors,
    // Initialize with provided defaults
    financialRules: DEFAULT_FINANCIAL_RULES,
    // Initialize empty users list (Users Manager handles creation)
    users: [],
    companySettings: {
      name: 'ISM HEALTH SOLUTIONS',
      cnpj: '29.732.524/0001-59'
    }
  };
};
