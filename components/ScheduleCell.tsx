
import React from 'react';
import { Assignment, ColorTheme, User, Doctor } from '../types';

interface ScheduleCellProps {
  assignments: Assignment[];
  themeStyles: ColorTheme;
  isSpacer?: boolean;
  isOutOfMonth?: boolean;
  isToday?: boolean;
  locationId: string;
  shiftId: string;
  dayIndex: number;
  currentUser: User;
  doctors: Doctor[]; // Add doctors to look up nicknames
  onEditAssignment: (assignmentIndex: number) => void;
  onAddAssignment: () => void;
  onMoveAssignment: (
    source: { locationId: string, shiftId: string, dayIndex: number, assignmentIndex: number },
    target: { locationId: string, shiftId: string, dayIndex: number }
  ) => void;
}

const ScheduleCell: React.FC<ScheduleCellProps> = ({
  assignments,
  themeStyles,
  isSpacer,
  isOutOfMonth,
  isToday,
  locationId,
  shiftId,
  dayIndex,
  currentUser,
  doctors,
  onEditAssignment,
  onAddAssignment,
  onMoveAssignment
}) => {
  const [isOver, setIsOver] = React.useState(false);
  const canEditAssignments = currentUser?.role === 'ADM' || currentUser?.role === 'Assistente';
  const canAddAssignments = currentUser?.role === 'ADM';

  const handleDragStart = (e: React.DragEvent, index: number) => {
    if (!canEditAssignments) return;
    e.dataTransfer.setData('sourceAssignment', JSON.stringify({
      locationId,
      shiftId,
      dayIndex,
      assignmentIndex: index
    }));
    e.dataTransfer.effectAllowed = 'move';

    // Create a ghost image or just set style
    const target = e.currentTarget as HTMLElement;
    target.style.opacity = '0.5';
  };

  const handleDragEnd = (e: React.DragEvent) => {
    const target = e.currentTarget as HTMLElement;
    target.style.opacity = '1';
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (isSpacer || !canEditAssignments) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setIsOver(true);
  };

  const handleDragLeave = () => {
    setIsOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsOver(false);
    if (!canEditAssignments) return;

    const data = e.dataTransfer.getData('sourceAssignment');
    if (!data) return;

    try {
      const source = JSON.parse(data);
      // Don't move if source and target are the same
      if (
        source.locationId === locationId &&
        source.shiftId === shiftId &&
        source.dayIndex === dayIndex
      ) return;

      onMoveAssignment(source, { locationId, shiftId, dayIndex });
    } catch (err) {
      console.error('Failed to parse drag data', err);
    }
  };

  if (isSpacer) {
    return (
      <td className={`${themeStyles.cellBg} border-r border-white dark:border-slate-800 p-1 min-h-[40px]`}></td>
    );
  }

  // Visual cues for out of month dates
  // Overrides the theme background with a neutral/faded background
  const bgClass = isOutOfMonth
    ? 'bg-slate-100 dark:bg-slate-800/60 opacity-60 grayscale'
    : themeStyles.cellBg;

  return (
    <td
      className={`
        ${bgClass} border-r border-white dark:border-slate-800 p-1 align-top group transition-all relative
        ${canAddAssignments ? 'cursor-pointer' : 'cursor-default'}
        ${canEditAssignments && isOver ? 'ring-2 ring-inset ring-indigo-500 bg-indigo-50/30' : (canAddAssignments ? 'hover:brightness-95 dark:hover:brightness-110' : '')}
        ${isToday ? 'bg-indigo-100/40 dark:bg-indigo-900/30 ring-2 ring-inset ring-indigo-500/20' : ''}
      `}
      onClick={() => canAddAssignments && onAddAssignment()}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className={`flex flex-col gap-1 min-h-[32px] ${isOutOfMonth ? 'opacity-70' : ''}`}>
        {assignments.map((assignment, index) => (
          <div
            key={index}
            draggable={canEditAssignments}
            onDragStart={(e) => handleDragStart(e, index)}
            onDragEnd={handleDragEnd}
            onClick={(e) => {
              e.stopPropagation();
              if (canEditAssignments) onEditAssignment(index);
            }}
            title={assignment.note}
            className={`
              relative flex flex-col justify-center px-2 py-1.5 rounded text-xs shadow-sm transform transition-all duration-200 overflow-hidden
              ${canEditAssignments ? 'hover:shadow-md hover:-translate-y-0.5 cursor-grab active:cursor-grabbing' : 'cursor-default'}
              ${assignment.isRed ? 'bg-red-600 text-white' : themeStyles.cellContentBg}
              ${assignment.isRed ? '' : themeStyles.cellText}
              ${assignment.isFlagged ? 'ring-2 ring-amber-400 dark:ring-amber-500 ring-offset-1 ring-offset-transparent' : ''}
              ${assignment.isVerified ? 'border-l-4 border-emerald-500' : ''}
            `}
          >
            {/* Warning/Info Corner Ribbons or Icons */}
            <div className="absolute top-0 right-0 flex">
              {!assignment.isFlagged && assignment.note && (
                <div className="p-0.5">
                  <svg className={`w-3 h-3 ${assignment.isRed ? 'text-white/80' : 'text-indigo-500 dark:text-indigo-300'}`} fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" /></svg>
                </div>
              )}
              {assignment.isFlagged && (
                <div className="p-0.5 bg-amber-400 rounded-bl shadow-sm z-10">
                  <svg className="w-2.5 h-2.5 text-amber-900" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                </div>
              )}
            </div>

            <div className="flex justify-between items-center w-full relative z-0">
              <span className={`${assignment.isBold ? 'font-bold' : ''} truncate pr-3 flex items-center gap-1`}>
                {(() => {
                  const doc = (doctors || []).find(d => d.name === assignment.name);
                  return doc?.nickname || assignment.name;
                })()}
              </span>
              {assignment.time && !assignment.subName && (
                <span className={`text-[10px] ml-1 flex-shrink-0 ${assignment.isRed ? 'opacity-90' : 'opacity-70'}`}>
                  {assignment.time}
                </span>
              )}
            </div>

            {assignment.subName && (
              <div className="flex justify-between items-center w-full mt-0.5">
                <span className="truncate pr-1">{assignment.subName}</span>
                {assignment.time && (
                  <span className={`text-[10px] ml-1 flex-shrink-0 ${assignment.isRed ? 'opacity-90' : 'opacity-70'}`}>
                    {assignment.time}
                  </span>
                )}
              </div>
            )}

            {/* Verified Icon - Bottom Right */}
            {assignment.isVerified && (
              <div className="absolute bottom-0.5 right-0.5">
                <svg className={`w-3.5 h-3.5 ${assignment.isRed ? 'text-white' : 'text-emerald-600 dark:text-emerald-400'}`} fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
              </div>
            )}
          </div>
        ))}
        {/* Placeholder for empty cells */}
        {assignments.length === 0 && !isOutOfMonth && canAddAssignments && (
          <div className="h-8 w-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            <span className="text-slate-400 dark:text-slate-500 text-lg font-light">+</span>
          </div>
        )}
      </div>
    </td>
  );
};

export default ScheduleCell;
