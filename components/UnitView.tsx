import React from 'react';
import { LocationData, WeekDate, MonthAssignmentsMap, Assignment, ThemeColor, User, Doctor } from '../types';
import { getThemeStyles } from '../utils/themeUtils';
// @ts-ignore
import * as XLSX from 'xlsx-js-style';

const THEME_COLORS: Record<string, { header: string; cell: string; text: string }> = {
    green: { header: "16a34a", cell: "dcfce7", text: "14532d" },
    purple: { header: "9333ea", cell: "f3e8ff", text: "581c87" },
    slate: { header: "475569", cell: "e2e8f0", text: "0f172a" },
    blue: { header: "2563eb", cell: "dbeafe", text: "1e3a8a" },
    orange: { header: "f97316", cell: "ffedd5", text: "7c2d12" },
    pink: { header: "db2777", cell: "fce7f3", text: "831843" },
    indigo: { header: "4f46e5", cell: "e0e7ff", text: "312e81" },
    sky: { header: "0284c7", cell: "e0f2fe", text: "0c4a6e" },
    yellow: { header: "eab308", cell: "fef9c3", text: "713f12" },
    neutral: { header: "525252", cell: "e5e5e5", text: "171717" },
    emerald: { header: "059669", cell: "d1fae5", text: "064e3b" },
    fuchsia: { header: "c026d3", cell: "fae8ff", text: "701a75" },
    lime: { header: "65a30d", cell: "ecfccb", text: "365314" },
};

interface UnitViewProps {
    locations: LocationData[];
    monthData: MonthAssignmentsMap;
    weeks: WeekDate[][];
    currentUser: User;
    doctors: Doctor[];
    onCellClick: (locationId: string, shiftId: string, dayIndex: number, assignmentIndex?: number, weekIdxOverride?: number) => void;
}

const UnitView: React.FC<UnitViewProps> = ({
    locations,
    monthData,
    weeks,
    currentUser,
    doctors,
    onCellClick
}) => {
    const canEditAssignments = currentUser?.role === 'ADM' || currentUser?.role === 'Assistente';
    const canAddAssignments = currentUser?.role === 'ADM';
    const [selectedHospitalId, setSelectedHospitalId] = React.useState<string | 'all'>('all');

    const filteredLocations = selectedHospitalId === 'all'
        ? locations
        : locations.filter(loc => loc.id === selectedHospitalId);

    const exportToExcel = () => {
        const wb = XLSX.utils.book_new();
        const rows: any[][] = [];
        const merges: any[] = [];

        // Try to get month name from the middle of the first week or similar
        const firstActiveDay = weeks[0].find(d => !d.isOutOfMonth) || weeks[1].find(d => !d.isOutOfMonth);
        const monthYear = firstActiveDay ? firstActiveDay.date.substring(3) : '';

        // Title Row
        rows.push([{ v: `ESCALA DE ANESTESIOLOGIA - ${monthYear}`, s: { font: { bold: true, sz: 14 } } }]);
        rows.push([]);

        filteredLocations.forEach(location => {
            const themeColors = THEME_COLORS[location.theme] || THEME_COLORS.slate;

            // Location Header
            const startRow = rows.length;
            const headerCell = {
                v: location.name.toUpperCase(),
                s: {
                    fill: { fgColor: { rgb: themeColors.header } },
                    font: { color: { rgb: "FFFFFF" }, bold: true, sz: 12 },
                    alignment: { horizontal: "center", vertical: "center" },
                    border: { top: { style: "thin", color: { rgb: themeColors.header } }, bottom: { style: "thin", color: { rgb: themeColors.header } }, left: { style: "thin", color: { rgb: themeColors.header } }, right: { style: "thin", color: { rgb: themeColors.header } } }
                }
            };

            const headerRow = [headerCell];
            // Fill rest of row for merge style
            for (let i = 1; i < 8; i++) {
                headerRow.push({ v: "", s: { fill: { fgColor: { rgb: themeColors.header } }, border: { top: { style: "thin", color: { rgb: themeColors.header } }, bottom: { style: "thin", color: { rgb: themeColors.header } }, left: { style: "thin", color: { rgb: themeColors.header } }, right: { style: "thin", color: { rgb: themeColors.header } } } } } as any);
            }
            rows.push(headerRow);
            merges.push({ s: { r: startRow, c: 0 }, e: { r: startRow, c: 7 } });

            weeks.forEach((week) => {
                const weekActiveShifts = location.shifts.filter(shift => {
                    return week.some(day => {
                        if (day.isOutOfMonth) return false;
                        const dayAssignments = monthData[location.id]?.[shift.id]?.[day.dateKey];
                        return Array.isArray(dayAssignments) && dayAssignments.length > 0;
                    });
                });

                if (weekActiveShifts.length === 0) return;

                // Simple spacer before week
                rows.push([]);

                // Days header row
                const borderStyle = { style: "thin", color: { rgb: "CBD5E1" } };
                const dayHeaderStyle = {
                    font: { bold: true, color: { rgb: "334155" } },
                    fill: { fgColor: { rgb: "F1F5F9" } },
                    border: { top: borderStyle, bottom: borderStyle, left: borderStyle, right: borderStyle },
                    alignment: { horizontal: "center", vertical: "center" }
                };

                const dayHeader = [{ v: 'TURNO', s: dayHeaderStyle }];

                week.forEach(day => {
                    const dayAbbr = (() => {
                        const name = day.dayName;
                        if (name.includes('Segunda')) return 'SEG';
                        if (name.includes('Terça')) return 'TER';
                        if (name.includes('Quarta')) return 'QUA';
                        if (name.includes('Quinta')) return 'QUI';
                        if (name.includes('Sexta')) return 'SEX';
                        if (name.includes('Sábado')) return 'SÁB';
                        if (name.includes('Domingo')) return 'DOM';
                        return name.substring(0, 3).toUpperCase();
                    })();
                    dayHeader.push({ v: `${day.date.split('/')[0]} - ${dayAbbr}`, s: dayHeaderStyle });
                });
                rows.push(dayHeader);

                // Shifts rows
                weekActiveShifts.forEach(shift => {
                    const shiftNameStyle = {
                        font: { bold: true, sz: 10, color: { rgb: "64748B" } }, // slate-500
                        alignment: { horizontal: "center", vertical: "center" },
                        border: { top: { style: "thin", color: { rgb: "E2E8F0" } }, bottom: { style: "thin", color: { rgb: "E2E8F0" } }, left: { style: "thin", color: { rgb: "E2E8F0" } }, right: { style: "thin", color: { rgb: "E2E8F0" } } }
                    };

                    const shiftRow: any[] = [{ v: shift.name.toUpperCase(), s: shiftNameStyle }];

                    week.forEach(day => {
                        const assignments = monthData[location.id]?.[shift.id]?.[day.dateKey] || [];
                        const names = assignments.map(a => `${a.name}${a.time ? ` (${a.time})` : ''}`).join(' / ');

                        const hasRed = assignments.some(a => a.isRed);

                        let cellStyle;
                        if (hasRed) {
                            cellStyle = {
                                fill: { fgColor: { rgb: "EF4444" } },
                                font: { color: { rgb: "FFFFFF" }, bold: true },
                                border: borderStyle,
                                alignment: { horizontal: "center", vertical: "center", wrapText: true }
                            };
                        } else {
                            cellStyle = {
                                fill: { fgColor: { rgb: themeColors.cell } },
                                font: { color: { rgb: themeColors.text } },
                                border: borderStyle,
                                alignment: { horizontal: "center", vertical: "center", wrapText: true }
                            };
                        }

                        shiftRow.push({ v: names || '-', s: cellStyle });
                    });
                    rows.push(shiftRow);
                });
            });
            rows.push([]); // Spacer between locations
            rows.push([]);
        });

        const ws = XLSX.utils.aoa_to_sheet(rows);
        ws['!merges'] = merges;

        // Basic column widths
        const wscols = [
            { wch: 20 }, // Turno
            { wch: 25 }, { wch: 25 }, { wch: 25 }, { wch: 25 }, { wch: 25 }, { wch: 25 }, { wch: 25 }
        ];
        ws['!cols'] = wscols;

        // Add row heights? Optional but good for wrapping text
        // ws['!rows'] = rows.map(() => ({ hpx: 30 })); // Approx height

        if (!wb.SheetNames.includes("Escala")) XLSX.utils.book_append_sheet(wb, ws, "Escala");

        // Use manual Blob download to strictly enforce filename
        try {
            const safeMonthYear = monthYear ? monthYear.replace('/', '_') : 'Export';
            const fileName = `Escala_Unidade_${safeMonthYear}.xlsx`;

            const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
            const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

            // Create download link element
            const url = window.URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            anchor.href = url;
            anchor.download = fileName;
            anchor.style.display = 'none';
            document.body.appendChild(anchor);

            // Trigger click
            anchor.click();

            // Cleanup
            window.setTimeout(() => {
                document.body.removeChild(anchor);
                window.URL.revokeObjectURL(url);
            }, 100);
        } catch (error) {
            console.error("Error downloading Excel:", error);
            alert("Erro ao baixar o arquivo. Tente novamente.");
        }
    };

    return (
        <div className="space-y-16 pb-20 bg-white dark:bg-slate-950 min-h-screen pt-4">
            {/* Hospital Selector Dropdown */}
            <div className="px-8 mb-12 flex justify-center">
                <div className="relative w-full max-w-[300px]">
                    <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                        <svg className="h-4 w-4 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                        </svg>
                    </div>
                    <select
                        value={selectedHospitalId}
                        onChange={(e) => setSelectedHospitalId(e.target.value)}
                        className={`
                            w-full pl-12 pr-10 py-3 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all appearance-none
                            bg-slate-50/80 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 shadow-sm backdrop-blur-md
                            text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/30
                            hover:bg-white dark:hover:bg-slate-800 cursor-pointer
                        `}
                    >
                        <option value="all">Todos os Hospitais</option>
                        {locations.map(loc => (
                            <option key={loc.id} value={loc.id}>
                                {loc.name} {loc.nickname ? `(${loc.nickname})` : ''}
                            </option>
                        ))}
                    </select>
                    <div className="absolute inset-y-0 right-4 flex items-center pointer-events-none">
                        <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                    </div>
                </div>

                {/* Export Button */}
                <button
                    onClick={exportToExcel}
                    className="flex items-center gap-2 px-5 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-black uppercase tracking-widest transition-all shadow-md shadow-emerald-200 dark:shadow-emerald-900/20 active:scale-95"
                >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Excel
                </button>
            </div>

            {/* Main Grid - Week > Locations */}
            <div className="overflow-x-auto custom-scrollbar no-border px-8 pb-12">
                <div className="min-w-[1200px]">
                    {weeks.map((week, weekIdx) => {
                        // Identify locations that have activity in this specific week
                        const activeLocs = filteredLocations.map(loc => {
                            const activeShifts = loc.shifts.filter(shift => {
                                return week.some(day => {
                                    if (day.isOutOfMonth) return false;
                                    const dayAssignments = monthData[loc.id]?.[shift.id]?.[day.dateKey];
                                    return Array.isArray(dayAssignments) && dayAssignments.length > 0;
                                });
                            });
                            return { loc, activeShifts };
                        }).filter(item => item.activeShifts.length > 0);

                        if (activeLocs.length === 0) return null;

                        return (
                            <div key={weekIdx} className="mb-16">
                                {activeLocs.map(({ loc, activeShifts }, locIdx) => {
                                    const isFirstLocation = locIdx === 0;
                                    const theme = getThemeStyles(loc.theme);

                                    return (
                                        <div key={loc.id} className="flex group">
                                            {/* Left Sidebar Fixed for this week block */}
                                            <div className={`flex w-[240px] flex-shrink-0 ${isFirstLocation ? 'pt-[44px]' : 'pt-0'}`}>
                                                <div className={`w-[140px] ${theme.primaryBg} ${theme.primaryText} p-2 flex flex-col items-center justify-center text-center border border-slate-200 dark:border-slate-800 rounded-l-md gap-1`}>
                                                    {loc.logo && (
                                                        <img src={loc.logo} alt="" className="w-8 h-8 object-contain bg-white rounded-sm shadow-sm" />
                                                    )}
                                                    <h2 className="text-[11px] font-black uppercase tracking-widest leading-tight">{loc.nickname || loc.name}</h2>
                                                </div>
                                                <div className="w-[100px] bg-slate-50/50 dark:bg-slate-900/50 flex flex-col divide-y divide-slate-200 dark:divide-slate-800 border-y border-r border-slate-200 dark:border-slate-800">
                                                    {activeShifts.map(shift => (
                                                        <div key={shift.id} className="h-12 flex items-center px-2 justify-center text-center">
                                                            <span className="text-[9px] font-bold uppercase text-slate-400 tracking-tighter leading-tight">
                                                                {shift.name}
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>

                                            {/* Days Grid */}
                                            <div className="flex-1 grid grid-cols-7 gap-0">
                                                {week.map((day, dIdx) => {
                                                    const isOutOfMonth = day.isOutOfMonth;
                                                    // Determine if we need a left border (first active day of the week)
                                                    const isFirstActiveDay = !isOutOfMonth && (dIdx === 0 || week[dIdx - 1].isOutOfMonth);
                                                    // Determine if we need a right border (last active day of the week)
                                                    const isLastActiveDay = !isOutOfMonth && (dIdx === 6 || week[dIdx + 1].isOutOfMonth);

                                                    return (
                                                        <div
                                                            key={dIdx}
                                                            className={`flex flex-col ${isOutOfMonth ? 'border-none' : ''}`}
                                                        >
                                                            {/* Day Header - Only show for first location in the stack */}
                                                            <div className={`
                                                                text-center h-[44px] flex flex-col justify-center mb-0 
                                                                ${!isFirstLocation ? 'hidden' : (isOutOfMonth ? 'opacity-0' : '')}
                                                            `}>
                                                                <p className="text-[11px] font-black text-slate-800 dark:text-slate-200 leading-none mb-0.5">{day.date.split('/')[0]}</p>
                                                                <p
                                                                    translate="no"
                                                                    className="text-[8px] font-bold text-slate-400 uppercase tracking-widest leading-none"
                                                                >
                                                                    {(() => {
                                                                        const name = day.dayName;
                                                                        if (name.includes('Segunda')) return 'SEG';
                                                                        if (name.includes('Terça')) return 'TER';
                                                                        if (name.includes('Quarta')) return 'QUA';
                                                                        if (name.includes('Quinta')) return 'QUI';
                                                                        if (name.includes('Sexta')) return 'SEX';
                                                                        if (name.includes('Sábado')) return 'SÁB';
                                                                        if (name.includes('Domingo')) return 'DOM';
                                                                        return name.substring(0, 3);
                                                                    })()}
                                                                </p>
                                                            </div>

                                                            {/* Shift Cells - Full grid for active days */}
                                                            <div className={`
                                                                flex flex-col divide-y divide-slate-200 dark:divide-slate-800
                                                                ${isOutOfMonth ? 'border-none' : 'border-y border-l border-slate-200 dark:border-slate-800'}
                                                                ${isLastActiveDay ? 'border-r border-slate-200 dark:border-slate-800' : ''}
                                                            `}>
                                                                {activeShifts.map((shift) => {
                                                                    const assignments = monthData[loc.id]?.[shift.id]?.[day.dateKey] || [];

                                                                    return (
                                                                        <div
                                                                            key={shift.id}
                                                                            onClick={() => canAddAssignments && !isOutOfMonth && onCellClick(loc.id, shift.id, dIdx, undefined, weekIdx)}
                                                                            className={`
                                                                                h-12 p-0.5 flex flex-col gap-0.5 transition-colors
                                                                                ${isOutOfMonth ? 'opacity-0 pointer-events-none' : (canAddAssignments ? 'hover:bg-slate-50/80 dark:hover:bg-white/5 cursor-pointer' : 'cursor-default')}
                                                                                bg-transparent
                                                                            `}
                                                                        >
                                                                            {assignments.map((assignment, aIdx) => (
                                                                                <div
                                                                                    key={aIdx}
                                                                                    onClick={(e) => {
                                                                                        e.stopPropagation();
                                                                                        if (canEditAssignments) onCellClick(loc.id, shift.id, dIdx, aIdx, weekIdx);
                                                                                    }}
                                                                                    className={`
                                                                                        flex-1 px-2 py-0.5 flex flex-col justify-center items-center text-center rounded-sm shadow-none
                                                                                        ${assignment.isRed ? 'bg-red-500 text-white' : theme.shiftBg}
                                                                                        ${assignment.isRed ? '' : theme.shiftText}
                                                                                        ${assignment.isBold ? 'font-black' : 'font-medium'}
                                                                                        ${canEditAssignments ? 'transition-transform active:scale-95 cursor-pointer' : 'cursor-default'}
                                                                                    `}
                                                                                >
                                                                                    <span className="text-[10px] truncate w-full">
                                                                                        {(() => {
                                                                                            const doc = (doctors || []).find(d => d.name === assignment.name);
                                                                                            return doc?.nickname || assignment.name;
                                                                                        })()}
                                                                                    </span>
                                                                                    {assignment.time && (
                                                                                        <span className="text-[8px] opacity-70 font-bold leading-none">{assignment.time}</span>
                                                                                    )}
                                                                                </div>
                                                                            ))}
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
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

export default UnitView;
