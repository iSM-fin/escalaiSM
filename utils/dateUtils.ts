
import { WeekDate, MonthKey, DateKey } from '../types';

// Helper to format Date to YYYY-MM-DD using Local Time
export const toDateKey = (date: Date): DateKey => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

// Helper to format Date to DD/MM/YYYY
export const formatDisplayDate = (date: Date): string => {
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const y = date.getFullYear();
  return `${d}/${m}/${y}`;
};

export const getMonthKey = (date: Date): MonthKey => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
};

export const getMonthName = (monthKey: MonthKey): string => {
  const [year, month] = monthKey.split('-').map(Number);
  const date = new Date(year, month - 1, 1);
  return date.toLocaleString('pt-BR', { month: 'long', year: 'numeric' });
};

/**
 * Returns an array of weeks (arrays of 7 days) that cover the entire month.
 * Starts on the Monday on or before the 1st of the month.
 * Ends on the Sunday on or after the last day of the month.
 */
export const getWeeksForMonth = (monthKey: MonthKey): WeekDate[][] => {
  const [year, month] = monthKey.split('-').map(Number);
  
  // First day of the month
  const firstDayOfMonth = new Date(year, month - 1, 1);
  
  // Determine start date (Previous Monday)
  const startDate = new Date(firstDayOfMonth);
  const dayOfWeek = startDate.getDay(); // 0 = Sun, 1 = Mon
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  startDate.setDate(startDate.getDate() + diffToMonday);

  // Last day of the month
  const lastDayOfMonth = new Date(year, month, 0);
  
  // Determine end date (Next Sunday)
  const endDate = new Date(lastDayOfMonth);
  const endDayOfWeek = endDate.getDay();
  const diffToSunday = endDayOfWeek === 0 ? 0 : 7 - endDayOfWeek;
  endDate.setDate(endDate.getDate() + diffToSunday);

  const weeks: WeekDate[][] = [];
  let currentWeek: WeekDate[] = [];
  const iterator = new Date(startDate);

  // Safety break to prevent infinite loops
  let count = 0;
  while (iterator <= endDate && count < 100) {
    const isOutOfMonth = iterator.getMonth() !== (month - 1);
    
    currentWeek.push({
      dayName: getDayName(iterator.getDay()),
      date: formatDisplayDate(iterator),
      dateKey: toDateKey(iterator),
      isOutOfMonth
    });

    if (currentWeek.length === 7) {
      weeks.push(currentWeek);
      currentWeek = [];
    }

    iterator.setDate(iterator.getDate() + 1);
    count++;
  }

  return weeks;
};

const getDayName = (dayIndex: number): string => {
  const names = ['Domingo', 'Segunda-Feira', 'Terça-Feira', 'Quarta-Feira', 'Quinta-Feira', 'Sexta-Feira', 'Sábado'];
  return names[dayIndex];
};

export const getWeekRangeString = (weekDays: WeekDate[]): string => {
    if (weekDays.length === 0) return '';
    const start = weekDays[0].date.substring(0, 5); // DD/MM
    const end = weekDays[6].date.substring(0, 5);
    return `${start} - ${end}`;
};

// Helper to get today's MonthKey
export const getCurrentMonthKey = (): MonthKey => {
  return getMonthKey(new Date());
};
