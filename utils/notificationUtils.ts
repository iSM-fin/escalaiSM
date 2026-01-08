import { ScheduleStore, Assignment, NotificationSettings, Doctor } from '../types';
import {
    createNotificationLog,
    generateReminderEmail,
    generateChangeNotificationEmail,
    queueNotification
} from '../services/emailService';

/**
 * Find all shifts for a specific doctor on a specific date
 */
export const findDoctorShiftsForDate = (
    store: ScheduleStore,
    doctorName: string,
    dateKey: string
): Array<{
    locationId: string;
    locationName: string;
    shiftId: string;
    shiftName: string;
    assignment: Assignment;
}> => {
    const results: Array<{
        locationId: string;
        locationName: string;
        shiftId: string;
        shiftName: string;
        assignment: Assignment;
    }> = [];

    const monthKey = dateKey.substring(0, 7); // Extract YYYY-MM
    const monthData = store.months[monthKey];
    if (!monthData) return results;

    store.structure.forEach(location => {
        const locationData = monthData[location.id];
        if (!locationData) return;

        location.shifts.forEach(shift => {
            const shiftData = locationData[shift.id];
            if (!shiftData) return;

            const dayAssignments = shiftData[dateKey];
            if (!dayAssignments) return;

            dayAssignments.forEach(assignment => {
                if (assignment.name === doctorName) {
                    results.push({
                        locationId: location.id,
                        locationName: location.name,
                        shiftId: shift.id,
                        shiftName: shift.name,
                        assignment
                    });
                }
            });
        });
    });

    return results;
};

/**
 * Get tomorrow's date key
 */
export const getTomorrowDateKey = (): string => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const year = tomorrow.getFullYear();
    const month = String(tomorrow.getMonth() + 1).padStart(2, '0');
    const day = String(tomorrow.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

/**
 * Format date for display in Portuguese
 */
export const formatDatePT = (dateKey: string): string => {
    const [year, month, day] = dateKey.split('-');
    return `${day}/${month}/${year}`;
};

/**
 * Send daily reminders to all doctors with shifts tomorrow
 */
export const sendDailyReminders = async (store: ScheduleStore): Promise<ScheduleStore> => {
    const settings = store.notificationSettings;
    if (!settings?.enableDailyReminders) return store;

    const tomorrowDateKey = getTomorrowDateKey();
    const tomorrowFormatted = formatDatePT(tomorrowDateKey);

    let updatedStore = { ...store };

    // Group shifts by doctor
    type ShiftInfo = Array<{
        locationId: string;
        locationName: string;
        shiftId: string;
        shiftName: string;
        assignment: Assignment;
    }>;
    const doctorShifts = new Map<string, ShiftInfo>();

    store.doctors.forEach(doctor => {
        if (!doctor.email || doctor.receiveNotifications === false) return;

        const shifts = findDoctorShiftsForDate(store, doctor.name, tomorrowDateKey);
        if (shifts.length > 0) {
            doctorShifts.set(doctor.name, shifts);
        }
    });

    // Send email to each doctor
    for (const [doctorName, shifts] of doctorShifts.entries()) {
        const doctor = store.doctors.find(d => d.name === doctorName);
        if (!doctor?.email) continue;

        const shiftsForEmail = shifts.map(s => ({
            locationName: s.locationName,
            shiftName: s.shiftName,
            time: s.assignment.time || 'Horário não especificado'
        }));

        const emailContent = generateReminderEmail(
            doctorName,
            tomorrowFormatted,
            shiftsForEmail
        );

        const log = createNotificationLog(
            'schedule_reminder',
            doctor.email,
            doctorName,
            emailContent.subject,
            emailContent.body,
            {
                dateKey: tomorrowDateKey,
                doctorName
            }
        );

        updatedStore = await queueNotification(updatedStore, log);
    }

    return updatedStore;
};

/**
 * Send change notification to admins/assistants
 */
export const sendChangeNotification = async (
    store: ScheduleStore,
    action: 'create' | 'edit' | 'delete' | 'flag',
    userName: string,
    doctorName: string,
    locationName: string,
    shiftName: string,
    dateKey: string,
    details?: string
): Promise<ScheduleStore> => {
    const settings = store.notificationSettings;
    if (!settings?.enableChangeNotifications) return store;
    if (!settings.adminEmails || settings.adminEmails.length === 0) return store;

    const dateFormatted = formatDatePT(dateKey);
    const emailContent = generateChangeNotificationEmail(
        action,
        userName,
        doctorName,
        locationName,
        shiftName,
        dateFormatted,
        details
    );

    let updatedStore = { ...store };

    // Send to all admin emails
    for (const email of settings.adminEmails) {
        const notifType = action === 'flag' ? 'schedule_flag'
            : action === 'create' ? 'schedule_create'
                : action === 'delete' ? 'schedule_delete'
                    : 'schedule_change';
        const log = createNotificationLog(
            notifType,
            email,
            'Administrador',
            emailContent.subject,
            emailContent.body,
            {
                dateKey,
                locationName,
                shiftName,
                doctorName
            }
        );

        updatedStore = await queueNotification(updatedStore, log);
    }

    return updatedStore;
};

/**
 * Initialize notification settings with defaults
 */
export const initializeNotificationSettings = (store: ScheduleStore): ScheduleStore => {
    if (store.notificationSettings) return store;

    return {
        ...store,
        notificationSettings: {
            enableDailyReminders: true,
            enableChangeNotifications: true,
            reminderTime: '18:00',
            adminEmails: []
        }
    };
};
