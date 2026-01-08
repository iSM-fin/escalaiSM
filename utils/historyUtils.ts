import { HistoryEntry, Assignment, ChangeAction, User, ScheduleStore } from '../types';

export const createHistoryEntry = (
    action: ChangeAction,
    currentUser: User | null,
    context: {
        locationId: string;
        locationName: string;
        shiftId: string;
        shiftName: string;
        dateKey?: string;
        dayIndex?: number;
        isTemplate: boolean;
    },
    before?: Assignment | null,
    after?: Assignment | null,
    moveTarget?: {
        locationId?: string;
        shiftId?: string;
        dateKey?: string;
        dayIndex?: number;
    }
): HistoryEntry => {
    return {
        id: `history-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: Date.now(),
        userId: currentUser?.id,
        userName: currentUser?.name || 'Sistema',
        userRole: currentUser?.role || 'ADM',
        action,
        ...context,
        before,
        after,
        ...moveTarget
    };
};

export const revertHistoryEntry = (
    entry: HistoryEntry,
    store: ScheduleStore
): ScheduleStore => {
    const newStore = JSON.parse(JSON.stringify(store));

    const { action, locationId, shiftId, dateKey, dayIndex, isTemplate, before, after } = entry;

    if (isTemplate) {
        // Revert in template
        if (!newStore.template[locationId]) newStore.template[locationId] = {};
        if (!newStore.template[locationId][shiftId]) newStore.template[locationId][shiftId] = {};
        if (dayIndex === undefined) return newStore;
        if (!newStore.template[locationId][shiftId][dayIndex]) newStore.template[locationId][shiftId][dayIndex] = [];

        const list = newStore.template[locationId][shiftId][dayIndex];

        switch (action) {
            case 'create':
                // Remove the created assignment
                if (after) {
                    const idx = list.findIndex((a: Assignment) =>
                        a.name === after.name &&
                        a.time === after.time &&
                        a.period === after.period
                    );
                    if (idx !== -1) list.splice(idx, 1);
                }
                break;

            case 'delete':
                // Restore the deleted assignment
                if (before) {
                    list.push(before);
                }
                break;

            case 'edit':
                // Restore the previous state
                if (before && after) {
                    const idx = list.findIndex((a: Assignment) =>
                        a.name === after.name ||
                        (a.time === after.time && a.period === after.period)
                    );
                    if (idx !== -1) {
                        list[idx] = before;
                    }
                }
                break;

            case 'move':
                // For move, we need to reverse the operation
                // This is complex and might need the target info from the entry
                break;
        }
    } else {
        // Revert in month data
        if (!dateKey) return newStore;

        const monthKey = dateKey.substring(0, 7); // Extract YYYY-MM
        if (!newStore.months[monthKey]) newStore.months[monthKey] = {};
        if (!newStore.months[monthKey][locationId]) newStore.months[monthKey][locationId] = {};
        if (!newStore.months[monthKey][locationId][shiftId]) newStore.months[monthKey][locationId][shiftId] = {};
        if (!newStore.months[monthKey][locationId][shiftId][dateKey]) newStore.months[monthKey][locationId][shiftId][dateKey] = [];

        const list = newStore.months[monthKey][locationId][shiftId][dateKey];

        switch (action) {
            case 'create':
                // Remove the created assignment
                if (after) {
                    const idx = list.findIndex((a: Assignment) =>
                        a.name === after.name &&
                        a.time === after.time &&
                        a.period === after.period
                    );
                    if (idx !== -1) list.splice(idx, 1);
                }
                break;

            case 'delete':
                // Restore the deleted assignment
                if (before) {
                    list.push(before);
                }
                break;

            case 'edit':
                // Restore the previous state
                if (before && after) {
                    const idx = list.findIndex((a: Assignment) =>
                        a.name === after.name ||
                        (a.time === after.time && a.period === after.period)
                    );
                    if (idx !== -1) {
                        list[idx] = before;
                    }
                }
                break;

            case 'move':
                // For move, we need to reverse the operation
                break;
        }
    }

    return newStore;
};

export const addHistoryEntry = (store: ScheduleStore, entry: HistoryEntry): ScheduleStore => {
    const history = store.history || [];

    // Keep only last 1000 entries to prevent excessive storage
    const maxEntries = 1000;
    const newHistory = [entry, ...history].slice(0, maxEntries);

    return {
        ...store,
        history: newHistory
    };
};
