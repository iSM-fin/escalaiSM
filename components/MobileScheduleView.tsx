import React from 'react';
import { LocationData, WeekDate, User, Doctor } from '../types';
import { getThemeStyles } from '../utils/themeUtils';

interface MobileScheduleViewProps {
    locations: LocationData[]; // Already filtered by parent if needed
    weekDays: WeekDate[];
    currentUser: User;
    doctors: Doctor[];
    onCellClick?: (locationId: string, shiftId: string, dayIndex: number, assignmentIndex?: number) => void;
}

const MobileScheduleView: React.FC<MobileScheduleViewProps> = ({
    locations,
    weekDays,
    currentUser,
    doctors,
    onCellClick,
}) => {
    const canEditAssignments = currentUser?.role === 'ADM' || currentUser?.role === 'Assistente';

    return (
        <div className="flex flex-col gap-6 pb-20">
            {weekDays.map((day, dayIndex) => {
                // Find if this day has ANY events across all locations for the filtered view
                const hasEvents = locations.some(loc =>
                    loc.shifts.some(shift =>
                        shift.schedule[dayIndex]?.assignments.length > 0
                    )
                );

                if (!hasEvents) return null; // Skip empty days to keep it clean

                return (
                    <div key={day.dateKey} className="flex flex-col gap-2">

                        {/* Day Header */}
                        <div className={`sticky top-0 z-10 py-2 px-4 shadow-sm border-b flex justify-between items-baseline mb-2 backdrop-blur-md
                ${day.isOutOfMonth ? 'bg-slate-100/90 dark:bg-slate-800/90 text-slate-500' : 'bg-white/90 dark:bg-slate-800/90 text-slate-800 dark:text-slate-100'}
            `}>
                            <h3 className="text-lg font-bold capitalize">{day.dayName} <span className="text-sm font-normal text-slate-500 ml-1">{day.date}</span></h3>
                        </div>

                        {/* List of Shifts for this Day */}
                        <div className="px-4 space-y-3">
                            {locations.map(loc => {
                                const theme = getThemeStyles(loc.theme);

                                // Get relevant shifts for this day matching the filter
                                const activeShifts = loc.shifts.filter(shift =>
                                    shift.schedule[dayIndex]?.assignments && shift.schedule[dayIndex].assignments.length > 0
                                );

                                if (activeShifts.length === 0) return null;

                                return (
                                    <div key={loc.id} className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 shadow-sm bg-white dark:bg-slate-800 flex flex-col">
                                        {/* Hospital Header */}
                                        <div className={`px-4 py-2 font-semibold text-sm flex items-center gap-2 ${theme.primaryBg} ${theme.primaryText}`}>
                                            {loc.logo && (
                                                <img src={loc.logo} alt="" className="w-5 h-5 rounded-sm object-contain bg-white" />
                                            )}
                                            <span>{loc.nickname || loc.name}</span>
                                        </div>

                                        <div className="divide-y divide-slate-100 dark:divide-slate-700">
                                            {activeShifts.map(shift => {
                                                const assignments = shift.schedule[dayIndex].assignments;
                                                return (
                                                    <div key={shift.id} className="p-3 flex flex-col gap-2">
                                                        <div className="flex items-center gap-2">
                                                            <span className={`text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded ${theme.shiftBg} ${theme.shiftText}`}>
                                                                {shift.name}
                                                            </span>
                                                        </div>

                                                        <div className="space-y-2">
                                                            {assignments.map((assign, aIdx) => (
                                                                <div
                                                                    key={aIdx}
                                                                    onClick={() => canEditAssignments && onCellClick?.(loc.id, shift.id, dayIndex, aIdx)}
                                                                    className={`
                                                    relative p-3 rounded-lg border border-slate-100 dark:border-slate-700
                                                    ${assign.isVerified ? 'bg-green-50/50 dark:bg-green-900/10 border-green-100 dark:border-green-900/30' : 'bg-slate-50 dark:bg-slate-700/50'}
                                                    ${canEditAssignments ? 'active:scale-[0.98] transition-transform cursor-pointer' : 'cursor-default'}
                                                `}
                                                                >
                                                                    <div className="flex justify-between items-start">
                                                                        <div className="font-semibold text-slate-800 dark:text-slate-100">
                                                                            {(() => {
                                                                                const doc = (doctors || []).find(d => d.name === assign.name);
                                                                                return doc?.nickname || assign.name;
                                                                            })()}
                                                                        </div>
                                                                        {assign.time && (
                                                                            <div className="text-xs font-mono bg-white dark:bg-slate-600 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-500 text-slate-600 dark:text-slate-300">
                                                                                {assign.time}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                    {assign.subName && (
                                                                        <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{assign.subName}</div>
                                                                    )}
                                                                    {assign.note && (
                                                                        <div className="text-xs text-amber-600 dark:text-amber-400 mt-1 italic flex items-center gap-1">
                                                                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                                                            {assign.note}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                );
            })}

            {/* Empty State Help */}
            {!weekDays.some(day => locations.some(l => l.shifts.some(s => s.schedule.find(d => d.dateKey === day.dateKey)?.assignments.length ?? 0 > 0))) && (
                <div className="p-8 text-center text-slate-500">
                    <p>Nenhum plantão encontrado nesta semana.</p>
                </div>
            )}
        </div>
    );
};

export default MobileScheduleView;
