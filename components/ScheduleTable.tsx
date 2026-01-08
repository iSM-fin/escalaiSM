import React from 'react';
import { LocationData, WeekDate, User, Doctor } from '../types';
import { getThemeStyles } from '../utils/themeUtils';
import ScheduleCell from './ScheduleCell';

interface ScheduleTableProps {
  locations: LocationData[];
  weekDays: WeekDate[];
  currentUser: User;
  onCellClick: (locationId: string, shiftId: string, dayIndex: number, assignmentIndex?: number) => void;
  onAddShift: (locationId: string) => void;
  onAddLocation: () => void;
  onLocationClick: (locationId: string) => void;
  onShiftClick: (locationId: string, shiftId: string) => void;
  doctors: Doctor[];
  onMoveAssignment: (
    source: { locationId: string, shiftId: string, dayIndex: number, assignmentIndex: number },
    target: { locationId: string, shiftId: string, dayIndex: number }
  ) => void;
  hideFooter?: boolean;
}

const ScheduleTable: React.FC<ScheduleTableProps> = ({
  locations,
  weekDays,
  currentUser,
  onCellClick,
  onAddShift,
  onAddLocation,
  onLocationClick,
  onShiftClick,
  doctors,
  onMoveAssignment,
  hideFooter = false
}) => {
  const canManageStructure = currentUser?.role === 'ADM' || currentUser?.role === 'Assistente';

  return (
    <div className="w-full overflow-hidden bg-surface-light dark:bg-surface-dark rounded-xl shadow-lg border border-slate-200 dark:border-slate-700 flex flex-col transition-colors duration-200">
      <div className="overflow-x-auto custom-scrollbar pb-12">
        <table className="w-full min-w-[1400px] border-collapse text-sm">
          <thead>
            <tr className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 transition-colors duration-200">
              <th className="sticky-cell sticky left-0 z-20 bg-white dark:bg-slate-800 min-w-[140px] p-3 text-left font-semibold text-slate-500 dark:text-slate-400 border-r border-slate-200 dark:border-slate-700 transition-colors duration-200">
                Hospital
              </th>
              <th className="sticky-cell sticky left-[140px] z-20 bg-white dark:bg-slate-800 min-w-[120px] p-3 text-left font-semibold text-slate-500 dark:text-slate-400 border-r border-slate-200 dark:border-slate-700 shadow-[4px_0_4px_-2px_rgba(0,0,0,0.1)] dark:shadow-none transition-colors duration-200">
                Turno
              </th>
              {weekDays.map((day, idx) => {
                const today = new Date();
                const y = today.getFullYear();
                const m = String(today.getMonth() + 1).padStart(2, '0');
                const d = String(today.getDate()).padStart(2, '0');
                const todayKey = `${y}-${m}-${d}`;
                const isToday = day.dateKey === todayKey;

                return (
                  <th
                    key={idx}
                    className={`min-w-[160px] p-3 text-center border-r border-slate-100 dark:border-slate-700 last:border-r-0 transition-colors duration-200 
                      ${day.isOutOfMonth ? 'bg-slate-50/80 dark:bg-slate-900/50 opacity-50' : ''}
                      ${isToday ? 'bg-indigo-100 dark:bg-indigo-900/40 ring-4 ring-inset ring-indigo-500/10' : ''}
                    `}
                  >
                    <div className={`font-medium 
                      ${day.isOutOfMonth ? 'text-slate-500 dark:text-slate-500' : 'text-slate-900 dark:text-white'}
                      ${isToday ? 'text-indigo-800 dark:text-indigo-200 font-bold' : ''}
                    `}>
                      {day.dayName}
                    </div>
                    <div className={`text-xs ${isToday ? 'text-indigo-600 dark:text-indigo-300 font-bold' : 'text-slate-400'}`}>
                      {day.date}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700 transition-colors duration-200">
            {locations.map((location) => {
              const themeStyles = getThemeStyles(location.theme);

              return (
                <React.Fragment key={location.id}>
                  {location.shifts.map((shift, shiftIdx) => {
                    const isFirstShift = shiftIdx === 0;

                    let rowClasses = "group transition-colors duration-200";
                    if (isFirstShift && location.id !== locations[0].id) {
                      rowClasses += " border-t-2 border-white dark:border-slate-700";
                    }

                    return (
                      <tr key={`${location.id}-${shift.id}`} className={rowClasses}>
                        {/* Location Column */}
                        {isFirstShift && (
                          <td
                            className={`sticky-cell sticky left-0 z-10 p-3 font-medium ${themeStyles.primaryBg} ${themeStyles.primaryText} ${themeStyles.border} border-r align-top transition-colors duration-200 group-hover:brightness-95`}
                            rowSpan={location.shifts.length}
                          >
                            <div className="flex flex-col justify-between h-full min-h-[80px]">
                              <button
                                onClick={() => canManageStructure && onLocationClick(location.id)}
                                className={`text-left font-bold underline-offset-4 outline-none rounded p-0.5 -m-0.5 ${canManageStructure ? 'hover:underline decoration-white/50 cursor-pointer focus:ring-2 focus:ring-white/50' : 'cursor-default'}`}
                                title={canManageStructure ? "Editar Hospital" : ""}
                              >
                                <div className="flex items-center gap-2">
                                  {location.logo && (
                                    <img src={location.logo} alt="" className="w-5 h-5 rounded-sm object-contain bg-white flex-shrink-0" />
                                  )}
                                  <span className="truncate">{location.nickname || location.name}</span>
                                </div>
                              </button>
                              {canManageStructure && (
                                <button
                                  onClick={() => onAddShift(location.id)}
                                  className="mt-2 text-[10px] bg-white/20 hover:bg-white/30 text-inherit px-2 py-1 rounded flex items-center justify-center gap-1 transition-colors w-full"
                                  title="Adicionar Novo Turno (Linha)"
                                >
                                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                                  Turno
                                </button>
                              )}
                            </div>
                          </td>
                        )}

                        {/* Shift Name Column */}
                        <td
                          onClick={() => canManageStructure && onShiftClick(location.id, shift.id)}
                          className={`sticky-cell sticky left-[140px] z-10 ${themeStyles.shiftBg} ${themeStyles.shiftText} p-2 text-xs font-semibold border-r border-slate-200 dark:border-slate-700 shadow-[4px_0_4px_-2px_rgba(0,0,0,0.1)] dark:shadow-none transition-colors duration-200 ${canManageStructure ? 'cursor-pointer hover:brightness-95 dark:hover:brightness-110' : 'cursor-default'}`}
                          title={canManageStructure ? "Clique para Editar ou Excluir esta linha" : ""}
                        >
                          <div className="flex items-center justify-between group/shift gap-1">
                            <span className="truncate">{shift.name}</span>
                            {canManageStructure && (
                              <svg className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 group-hover/shift:text-inherit transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                            )}
                          </div>
                        </td>

                        {/* Schedule Cells */}
                        {weekDays.map((_, dayIndex) => {
                          const daySchedule = shift.schedule.find(s => s.dayIndex === dayIndex);
                          const assignments = daySchedule ? daySchedule.assignments : [];
                          const isOutOfMonth = daySchedule?.isOutOfMonth ?? weekDays[dayIndex].isOutOfMonth;

                          const today = new Date();
                          const y = today.getFullYear();
                          const m = String(today.getMonth() + 1).padStart(2, '0');
                          const d = String(today.getDate()).padStart(2, '0');
                          const todayKey = `${y}-${m}-${d}`;
                          const isToday = weekDays[dayIndex].dateKey === todayKey;

                          return (
                            <ScheduleCell
                              key={`${shift.id}-${dayIndex}`}
                              assignments={assignments}
                              themeStyles={themeStyles}
                              isSpacer={shift.name === ''}
                              isOutOfMonth={isOutOfMonth}
                              isToday={isToday}
                              locationId={location.id}
                              shiftId={shift.id}
                              dayIndex={dayIndex}
                              currentUser={currentUser}
                              doctors={doctors}
                              onEditAssignment={(assignIdx) => onCellClick(location.id, shift.id, dayIndex, assignIdx)}
                              onAddAssignment={() => onCellClick(location.id, shift.id, dayIndex)}
                              onMoveAssignment={onMoveAssignment}
                            />
                          );
                        })}
                      </tr>
                    );
                  })}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>

        {/* Add Location Button Area */}
        {!hideFooter && canManageStructure && (
          <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 flex justify-center">
            <button
              onClick={onAddLocation}
              className="flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium shadow-md transition-all hover:scale-105"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Adicionar Novo Hospital
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ScheduleTable;
