
export type ThemeColor =
  | 'green'
  | 'purple'
  | 'slate'
  | 'blue'
  | 'orange'
  | 'pink'
  | 'indigo'
  | 'sky'
  | 'yellow'
  | 'neutral'
  | 'emerald'
  | 'lime'
  | 'fuchsia'
  | 'red'
  | 'rose'
  | 'amber'
  | 'teal'
  | 'cyan'
  | 'violet'
  | 'gray'
  | 'zinc'
  | 'stone';

export type MonthKey = string; // "YYYY-MM"
export type DateKey = string; // "YYYY-MM-DD"

export interface Assignment {
  name: string;
  time?: string;
  period?: string; // Selected shift period
  isBold?: boolean;
  isRed?: boolean;
  subName?: string;
  note?: string;
  isFlagged?: boolean;

  // Financial Fields
  value?: number;
  isVerified?: boolean;
  extraValue?: number;
  extraValueReason?: string;
}

export interface DaySchedule {
  dayIndex: number; // 0 = Monday, 6 = Sunday (Relative to the week view)
  dateKey?: DateKey; // Specific date for this cell
  isOutOfMonth?: boolean; // Visual flag for days belonging to adjacent months
  assignments: Assignment[];
}

export interface Shift {
  id: string;
  name: string;
  schedule: DaySchedule[];
}

export interface LocationData {
  id: string;
  name: string;        // Full Hospital Name
  nickname?: string;   // For use in the scale/tables
  logo?: string;       // Base64 or URL
  theme: ThemeColor;
  shifts: Shift[];
}

export interface WeekDate {
  dayName: string;
  date: string; // Display string DD/MM/YYYY
  dateKey: DateKey; // ISO string YYYY-MM-DD
  isOutOfMonth: boolean;
}

export interface ColorTheme {
  primaryBg: string;
  primaryText: string;
  border: string;
  shiftBg: string;
  shiftText: string;
  cellBg: string;
  cellContentBg: string;
  cellText: string;
}

// --- DOCTOR & FINANCIAL TYPES ---

export type DoctorType = 'Normal' | 'Dif';

export interface Doctor {
  id: string;
  name: string;       // Used as unique identifier/alias in assignments (Legacy/Simplified)
  fullName?: string;  // Full name for Timesheets
  nickname?: string;  // Short name for the scale display
  type: DoctorType;
  email?: string; // Email for notifications
  phoneNumber?: string; // Optional phone for future SMS
  receiveNotifications?: boolean; // Opt-in/out
  crm?: string;
  specialty?: string;
}

export interface TimesheetEntry {
  id: string;
  date: DateKey;
  entry1: string; // HH:mm
  exit1: string;  // HH:mm
  entry2?: string;
  exit2?: string;
  totalHours: number;
  value: number;
  description?: string; // e.g. "Plantão 12h"
}

export interface Timesheet {
  id: string;
  doctorId: string;
  doctorName: string;
  doctorCRM: string;
  doctorSpecialty: string;
  hospitalId: string;
  hospitalName: string;
  month: MonthKey; // YYYY-MM
  companyName: string;
  companyCNPJ: string;
  entries: TimesheetEntry[];
  totalValue: number;
  createdAt: number;
  status: 'draft' | 'finalized';
}

export interface FinancialRule {
  id: string;
  hospitalName: string; // Linking by name allows flexibility if IDs change or new ones are added
  shiftName: string;
  isDif: boolean;
  value: number;
}

// --- AUTH TYPES ---

export type UserRole = 'ADM' | 'Coordenador' | 'Medico' | 'Assistente';

export interface User {
  id?: string;
  username: string;
  name: string;
  role: UserRole;
  linkedDoctorId?: string; // For 'Medico' or 'Coordenador' specific view
  password?: string; // Stored locally for this MVP
}

// --- HISTORY TYPES ---

export type ChangeAction = 'create' | 'edit' | 'delete' | 'move';

export interface HistoryEntry {
  id: string;
  timestamp: number; // Date.now()
  userId?: string;
  userName: string;
  userRole: UserRole;
  action: ChangeAction;

  // Context
  locationId: string;
  locationName: string;
  shiftId: string;
  shiftName: string;
  dateKey?: DateKey; // For month data
  dayIndex?: number; // For template data
  isTemplate: boolean;

  // Change details
  before?: Assignment | null; // null for create
  after?: Assignment | null; // null for delete

  // For move operations
  targetLocationId?: string;
  targetShiftId?: string;
  targetDateKey?: DateKey;
  targetDayIndex?: number;
}

// --- STORE ARCHITECTURE ---

// Keyed by LocationID -> ShiftID -> DayOfWeek (0-6)
export type TemplateMap = Record<string, Record<string, Record<number, Assignment[]>>>;

// Keyed by LocationID -> ShiftID -> DateKey (YYYY-MM-DD)
export type MonthAssignmentsMap = Record<string, Record<string, Record<DateKey, Assignment[]>>>;

export interface ScheduleStore {
  // Structural Definitions (Ordered lists of Hospitals/Shifts)
  structure: LocationData[];

  // The "Standard" Pattern (Assignments by DOW)
  template: TemplateMap;

  // Materialized Data (Assignments by Date)
  months: Record<MonthKey, MonthAssignmentsMap>;

  // Resources
  doctors: Doctor[];
  financialRules: FinancialRule[];
  users: User[];

  // History tracking
  history?: HistoryEntry[];

  // Notification tracking
  notificationLogs?: NotificationLog[];
  notificationSettings?: NotificationSettings;

  // Timesheets
  timesheets?: Timesheet[];
  companySettings?: CompanySettings;
}

export interface CompanySettings {
  name: string;
  cnpj: string;
  logo1?: string;
  logo2?: string;
}

// --- NOTIFICATION TYPES ---

export type NotificationType =
  | 'schedule_reminder' // 24h before shift
  | 'schedule_change'   // When assignment is edited
  | 'schedule_delete'   // When assignment is deleted
  | 'schedule_flag'     // When assignment is flagged
  | 'schedule_create';  // When new assignment is created

export interface NotificationLog {
  id: string;
  timestamp: number;
  type: NotificationType;
  recipientEmail: string;
  recipientName: string;
  subject: string;
  body: string;
  status: 'pending' | 'sent' | 'failed';
  error?: string;

  // Context
  dateKey?: DateKey;
  locationName?: string;
  shiftName?: string;
  doctorName?: string;
}

export interface NotificationSettings {
  enableDailyReminders: boolean; // 24h before shifts
  enableChangeNotifications: boolean; // For ADM/Assistente
  reminderTime: string; // HH:mm format (e.g., "18:00")
  adminEmails: string[]; // Emails to receive change notifications
}