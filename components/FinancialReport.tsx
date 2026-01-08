
import React, { useMemo } from 'react';
import { ScheduleStore, MonthKey } from '../types';
import { exportToCSV, exportToPDF } from '../utils/exportUtils';
import { getMonthName, getMonthKey } from '../utils/dateUtils';

interface FinancialReportProps {
    store: ScheduleStore;
    activeMonth: MonthKey;
    onMonthChange: (month: MonthKey) => void;
    onClose: () => void;
    filterDoctorName?: string; // If present, strictly filters the report
}

interface FinancialRow {
    dateSortable: number;
    date: string;
    hospitalName: string;
    in1: string;
    out1: string;
    in2: string;
    out2: string;
    durationLabel: string;
    value: number;
    doctorName: string;
    obs: string;
}

const FinancialReport: React.FC<FinancialReportProps> = ({ store, activeMonth, onMonthChange, onClose, filterDoctorName }) => {

    const parseTime = (timeStr: string | undefined) => {
        if (!timeStr) return { start: '', end: '' };
        const matches = timeStr.match(/(\d{1,2})[^\d]*(\d{1,2})/);
        if (matches) {
            return {
                start: matches[1].padStart(2, '0') + ':00',
                end: matches[2].padStart(2, '0') + ':00'
            };
        }
        return { start: '', end: '' };
    };

    const handlePrevMonth = () => {
        const [year, month] = activeMonth.split('-').map(Number);
        const date = new Date(year, month - 2, 1);
        onMonthChange(getMonthKey(date));
    };

    const handleNextMonth = () => {
        const [year, month] = activeMonth.split('-').map(Number);
        const date = new Date(year, month, 1);
        onMonthChange(getMonthKey(date));
    };
    const reportData = useMemo(() => {
        const rows: FinancialRow[] = [];
        const groupedData: Record<string, any> = {};

        const monthAssignments = store.months[activeMonth];
        if (!monthAssignments) return [];

        store.structure.forEach(location => {
            const locAssignments = monthAssignments[location.id];
            if (!locAssignments) return;

            Object.entries(locAssignments).forEach(([shiftId, dateMap]) => {
                Object.entries(dateMap).forEach(([dateKey, assignments]) => {
                    if (!dateKey.startsWith(activeMonth)) return;

                    const [y, m, d] = dateKey.split('-');
                    const displayDate = `${d}/${m}/${y}`;
                    const dateSortable = parseInt(`${y}${m}${d}`);

                    assignments.forEach(assign => {
                        // FILTER: If filterDoctorName is set, skip non-matching doctors
                        if (filterDoctorName && assign.name !== filterDoctorName) return;

                        const totalValue = (assign.value || 0) + (assign.extraValue || 0);

                        if (totalValue > 0) {
                            const key = `${dateKey}-${assign.name.trim()}-${location.id}`;
                            // ... rest is same
                            if (!groupedData[key]) {
                                groupedData[key] = {
                                    dateSortable,
                                    date: displayDate,
                                    doctor: assign.name,
                                    locationName: location.name,
                                    assignments: []
                                };
                            }
                            groupedData[key].assignments.push({
                                ...assign,
                                parsedTime: parseTime(assign.time)
                            });
                        }
                    });
                });
            });
        });
        // ...

        Object.values(groupedData).forEach((group: any) => {
            const { dateSortable, date, doctor, locationName, assignments } = group;

            assignments.sort((a: any, b: any) => {
                return a.parsedTime.start.localeCompare(b.parsedTime.start);
            });

            const first = assignments[0];
            const second = assignments.length > 1 ? assignments[1] : null;

            let totalHours = 0;
            assignments.forEach((assign: any) => {
                const { start, end } = assign.parsedTime;
                if (start && end) {
                    const h1 = parseInt(start.split(':')[0], 10);
                    const h2 = parseInt(end.split(':')[0], 10);
                    let diff = h2 - h1;
                    if (diff <= 0) diff += 24;
                    totalHours += diff;
                } else {
                    totalHours += 12;
                }
            });

            const durationLabel = `${totalHours} horas`;
            const totalValue = assignments.reduce((sum: number, a: any) => sum + (a.value || 0) + (a.extraValue || 0), 0);

            const obsParts: string[] = [];
            assignments.forEach((a: any) => {
                if (a.extraValueReason && !obsParts.includes(a.extraValueReason)) {
                    obsParts.push(a.extraValueReason);
                }
                if (a.note && !obsParts.includes(a.note)) {
                    obsParts.push(a.note);
                }
            });
            const obs = obsParts.join('; ');

            rows.push({
                dateSortable,
                date,
                hospitalName: locationName,
                in1: first.parsedTime.start,
                out1: first.parsedTime.end,
                in2: second ? second.parsedTime.start : '',
                out2: second ? second.parsedTime.end : '',
                durationLabel,
                value: totalValue,
                doctorName: doctor,
                obs
            });
        });

        return rows.sort((a, b) => a.dateSortable - b.dateSortable);
    }, [store, activeMonth]);

    const dashboardData = useMemo(() => {
        const byHospital: Record<string, number> = {};
        const byDoctor: Record<string, number> = {};

        reportData.forEach(row => {
            byHospital[row.hospitalName] = (byHospital[row.hospitalName] || 0) + row.value;
            byDoctor[row.doctorName] = (byDoctor[row.doctorName] || 0) + row.value;
        });

        return {
            hospitals: Object.entries(byHospital)
                .map(([name, value]) => ({ name, value }))
                .sort((a, b) => b.value - a.value),
            doctors: Object.entries(byDoctor)
                .map(([name, value]) => ({ name, value }))
                .sort((a, b) => b.value - a.value)
        };
    }, [reportData]);

    const totalSum = reportData.reduce((acc, row) => acc + row.value, 0);

    const handleExportPDF = () => {
        exportToPDF(reportData, `relatorio_financeiro_${activeMonth}.pdf`, totalSum);
    };

    const handleExportCSV = () => {
        exportToCSV(reportData, `relatorio_financeiro_${activeMonth}.csv`);
    };

    const formatCurrency = (val: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

    return (
        <div className="bg-white dark:bg-slate-900 min-h-screen rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 flex flex-col">
            {/* Header */}
            <div className="p-6 border-b border-slate-200 dark:border-slate-700 flex flex-col xl:flex-row justify-between items-center bg-slate-50 dark:bg-slate-800/50 rounded-t-xl gap-4">
                <div className="flex items-center gap-4">
                    <button
                        onClick={onClose}
                        className="mr-2 p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors text-slate-500"
                    >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                    </button>
                    <div>
                        <h2 className="text-2xl font-bold text-slate-800 dark:text-white">Módulo Financeiro</h2>
                        <div className="flex items-center gap-2 mt-1">
                            <button onClick={handlePrevMonth} className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors text-slate-500">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                            </button>
                            <span className="text-slate-600 dark:text-slate-300 font-semibold min-w-[140px] text-center capitalize">
                                {getMonthName(activeMonth)}
                            </span>
                            <button onClick={handleNextMonth} className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors text-slate-500">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                            </button>
                        </div>
                    </div>
                </div>

                {/* Global Total */}
                <div className="flex items-center gap-6">
                    <div className="flex flex-col items-end">
                        <span className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider font-semibold">Total do Mês</span>
                        <span className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(totalSum)}</span>
                    </div>
                    <div className="h-10 w-px bg-slate-300 dark:bg-slate-600 hidden md:block"></div>
                    <div className="flex gap-2">
                        <button
                            onClick={handleExportCSV}
                            className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors text-sm font-medium shadow-sm"
                        >
                            <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                            CSV
                        </button>
                        <button
                            onClick={handleExportPDF}
                            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors text-sm font-bold shadow-md shadow-emerald-200 dark:shadow-emerald-900/20"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                            PDF
                        </button>
                    </div>
                </div>
            </div>

            {/* Dashboard Summary */}
            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-50/50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700">
                {/* Hospitals Summary */}
                <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-5 flex flex-col">
                    <h3 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
                        Por Hospital
                    </h3>
                    <div className="flex-1 overflow-y-auto max-h-[160px] custom-scrollbar pr-2 space-y-3">
                        {dashboardData.hospitals.map((item, idx) => (
                            <div key={idx} className="flex justify-between items-center text-sm group">
                                <span className="text-slate-700 dark:text-slate-300 font-medium group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">{item.name}</span>
                                <div className="flex items-center gap-3">
                                    <div className="w-24 h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                                        <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${(item.value / totalSum) * 100}%` }}></div>
                                    </div>
                                    <span className="font-bold text-slate-800 dark:text-white w-24 text-right">{formatCurrency(item.value)}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Doctors Summary */}
                <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-5 flex flex-col">
                    <h3 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                        Por Médico
                    </h3>
                    <div className="flex-1 overflow-y-auto max-h-[160px] custom-scrollbar pr-2 space-y-3">
                        {dashboardData.doctors.map((item, idx) => (
                            <div key={idx} className="flex justify-between items-center text-sm group">
                                <span className="text-slate-700 dark:text-slate-300 font-medium group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors truncate max-w-[150px]">{item.name}</span>
                                <div className="flex items-center gap-3">
                                    <div className="w-24 h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                                        <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${(item.value / totalSum) * 100}%` }}></div>
                                    </div>
                                    <span className="font-bold text-slate-800 dark:text-white w-24 text-right">{formatCurrency(item.value)}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <div className="overflow-x-auto flex-1 p-6">
                <table className="w-full text-sm text-left border-collapse">
                    <thead translate="no">
                        <tr className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 uppercase text-xs tracking-wider font-bold">
                            <th className="p-3 border border-slate-300 dark:border-slate-700">DATA</th>
                            <th className="p-3 border border-slate-300 dark:border-slate-700">HOSPITAL</th>
                            <th className="p-3 border border-slate-300 dark:border-slate-700 text-center bg-blue-50/50 dark:bg-blue-900/10">ENTRADA</th>
                            <th className="p-3 border border-slate-300 dark:border-slate-700 text-center bg-blue-50/50 dark:bg-blue-900/10">SAÍDA</th>
                            <th className="p-3 border border-slate-300 dark:border-slate-700 text-center bg-purple-50/50 dark:bg-purple-900/10">ENTRADA</th>
                            <th className="p-3 border border-slate-300 dark:border-slate-700 text-center bg-purple-50/50 dark:bg-purple-900/10">SAÍDA</th>
                            <th className="p-3 border border-slate-300 dark:border-slate-700 text-center">PLANTÃO</th>
                            <th className="p-3 border border-slate-300 dark:border-slate-700 text-right">VALOR</th>
                            <th className="p-3 border border-slate-300 dark:border-slate-700">MÉDICO (PLANTONISTA)</th>
                            <th className="p-3 border border-slate-300 dark:border-slate-700">OBS</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                        {reportData.map((row, idx) => (
                            <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors text-slate-800 dark:text-slate-200">
                                <td className="p-3 border border-slate-200 dark:border-slate-700 font-medium whitespace-nowrap">{row.date}</td>
                                <td className="p-3 border border-slate-200 dark:border-slate-700 font-bold text-slate-700 dark:text-slate-300">{row.hospitalName}</td>
                                <td className="p-3 border border-slate-200 dark:border-slate-700 text-center text-slate-500 dark:text-slate-400">{row.in1}</td>
                                <td className="p-3 border border-slate-200 dark:border-slate-700 text-center text-slate-500 dark:text-slate-400">{row.out1}</td>
                                <td className="p-3 border border-slate-200 dark:border-slate-700 text-center text-slate-500 dark:text-slate-400">{row.in2}</td>
                                <td className="p-3 border border-slate-200 dark:border-slate-700 text-center text-slate-500 dark:text-slate-400">{row.out2}</td>
                                <td className="p-3 border border-slate-200 dark:border-slate-700 text-center">
                                    <span className={`px-2 py-1 rounded text-xs font-semibold ${row.durationLabel.includes('24') ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300' : 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'}`}>
                                        {row.durationLabel}
                                    </span>
                                </td>
                                <td className="p-3 border border-slate-200 dark:border-slate-700 text-right font-mono font-medium text-emerald-600 dark:text-emerald-400">
                                    {formatCurrency(row.value)}
                                </td>
                                <td className="p-3 border border-slate-200 dark:border-slate-700 font-medium">
                                    {row.doctorName}
                                </td>
                                <td className="p-3 border border-slate-200 dark:border-slate-700 text-sm text-slate-500 dark:text-slate-400 max-w-[200px] truncate" title={row.obs}>
                                    {row.obs}
                                </td>
                            </tr>
                        ))}
                        {reportData.length === 0 && (
                            <tr>
                                <td colSpan={10} className="p-8 text-center text-slate-400 dark:text-slate-500">
                                    Nenhum registro financeiro encontrado para este mês.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

export default FinancialReport;
