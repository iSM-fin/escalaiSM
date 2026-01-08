import React, { useState, useMemo, useEffect } from 'react';
import { ScheduleStore, Timesheet, TimesheetEntry, Doctor, MonthKey, DateKey, Assignment, LocationData } from '../types';
import Modal from './ui/Modal';
import { getMonthName, getMonthKey } from '../utils/dateUtils';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';

interface TimesheetManagerProps {
    store: ScheduleStore;
    setStore: React.Dispatch<React.SetStateAction<ScheduleStore>>;
    onClose: () => void;
}

const TimesheetManager: React.FC<TimesheetManagerProps> = ({ store, setStore, onClose }) => {
    const [view, setView] = useState<'list' | 'create' | 'edit' | 'preview'>('list');
    const [selectedTimesheet, setSelectedTimesheet] = useState<Timesheet | null>(null);
    const [isGenerating, setIsGenerating] = useState(false);

    // Filter states
    const [doctorFilter, setDoctorFilter] = useState('');
    const [monthFilter, setMonthFilter] = useState(getMonthKey(new Date()));

    // Create form states
    const [newDoctorId, setNewDoctorId] = useState('');
    const [newHospitalId, setNewHospitalId] = useState('');
    const [newMonth, setNewMonth] = useState(getMonthKey(new Date()));

    const hospitals = store.structure || [];
    const doctors = store.doctors || [];

    const filteredTimesheets = useMemo(() => {
        return (store.timesheets || []).filter(ts => {
            const matchesDoctor = !doctorFilter || ts.doctorId === doctorFilter;
            const matchesMonth = !monthFilter || ts.month === monthFilter;
            return matchesDoctor && matchesMonth;
        });
    }, [store.timesheets, doctorFilter, monthFilter]);

    const handleCreateTimesheet = () => {
        if (!newDoctorId || !newHospitalId || !newMonth) {
            alert('Por favor, selecione o médico, hospital e mês.');
            return;
        }

        const doctor = doctors.find(d => d.id === newDoctorId);
        const hospital = hospitals.find(h => h.id === newHospitalId);

        if (!doctor || !hospital) return;

        // Auto-fetch entries from schedule
        const entries: TimesheetEntry[] = [];
        const monthData = store.months[newMonth];

        if (monthData && monthData[hospital.id]) {
            const hospitalShifts = monthData[hospital.id];

            // Loop through all shifts and dates for this hospital in this month
            Object.entries(hospitalShifts).forEach(([shiftId, dates]) => {
                const shift = hospital.shifts.find(s => s.id === shiftId);
                Object.entries(dates).forEach(([dateKey, assignments]) => {
                    const docAssignments = assignments.filter(a => a.name === doctor.name);

                    docAssignments.forEach((assign, idx) => {
                        // Extract times from assign.time (usually "HH:mm - HH:mm" or "HH - HH h")
                        let entry1 = "07:00";
                        let exit1 = "19:00";

                        if (assign.time) {
                            const times = assign.time.replace(/h/g, '').split('-').map(t => t.trim());
                            if (times.length >= 2) {
                                entry1 = times[0].includes(':') ? times[0] : `${times[0].padStart(2, '0')}:00`;
                                exit1 = times[1].includes(':') ? times[1] : `${times[1].padStart(2, '0')}:00`;
                            }
                        }

                        // Calculate total hours
                        const [h1, m1] = entry1.split(':').map(Number);
                        const [h2, m2] = exit1.split(':').map(Number);
                        let diff = (h2 * 60 + m2) - (h1 * 60 + m1);
                        if (diff < 0) diff += 24 * 60; // Crosses midnight
                        const totalHours = diff / 60;

                        entries.push({
                            id: `entry-${Date.now()}-${idx}-${Math.random()}`,
                            date: dateKey as DateKey,
                            entry1,
                            exit1,
                            totalHours,
                            value: assign.value || 0,
                            description: shift?.name || 'Plantão'
                        });
                    });
                });
            });
        }

        // Sort entries by date
        entries.sort((a, b) => a.date.localeCompare(b.date));

        const newTimesheet: Timesheet = {
            id: `ts-${Date.now()}`,
            doctorId: doctor.id,
            doctorName: doctor.fullName || doctor.name,
            doctorCRM: doctor.crm || '',
            doctorSpecialty: doctor.specialty || '',
            hospitalId: hospital.id,
            hospitalName: hospital.name,
            month: newMonth,
            companyName: store.companySettings?.name || 'ISM HEALTH SOLUTIONS',
            companyCNPJ: store.companySettings?.cnpj || '29.732.524/0001-59',
            entries,
            totalValue: entries.reduce((sum, e) => sum + e.value, 0),
            createdAt: Date.now(),
            status: 'draft'
        };

        setSelectedTimesheet(newTimesheet);
        setView('edit');
    };

    const handleSaveTimesheet = (timesheet: Timesheet) => {
        setStore(prev => {
            const existing = prev.timesheets || [];
            const index = existing.findIndex(t => t.id === timesheet.id);
            let newTimesheets;
            if (index >= 0) {
                newTimesheets = [...existing];
                newTimesheets[index] = timesheet;
            } else {
                newTimesheets = [timesheet, ...existing];
            }
            return { ...prev, timesheets: newTimesheets };
        });
        setView('list');
    };

    const handleDeleteTimesheet = (id: string) => {
        if (!confirm('Tem certeza que deseja excluir esta folha de ponto?')) return;
        setStore(prev => ({
            ...prev,
            timesheets: (prev.timesheets || []).filter(t => t.id !== id)
        }));
    };

    const generatePDF = (timesheet: Timesheet, includeValue: boolean) => {
        const doc = new jsPDF() as any;
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();

        // Get hospital logo
        const hospital = store.structure.find(h => h.id === timesheet.hospitalId);
        const hospitalLogo = hospital?.logo;
        const logo1 = store.companySettings?.logo1;
        const logo2 = store.companySettings?.logo2;

        // Header Background
        doc.setFillColor(248, 250, 252); // slate-50
        doc.rect(0, 0, pageWidth, 45, 'F');
        doc.setDrawColor(226, 232, 240); // slate-200
        doc.line(0, 45, pageWidth, 45);

        // Hospital Logo (Top Right)
        if (hospitalLogo) {
            try {
                doc.addImage(hospitalLogo, 'PNG', pageWidth - 45, 10, 25, 25);
            } catch (e) { console.error("Error adding hospital logo", e); }
        }

        // Header Info (Top Left)
        doc.setFontSize(10);
        doc.setTextColor(100, 116, 139); // slate-500
        doc.setFont('helvetica', 'bold');
        doc.text('FOLHA DE PONTO INDIVIDUAL', 20, 15);

        doc.setFontSize(16);
        doc.setTextColor(15, 23, 42); // slate-900
        doc.text(timesheet.hospitalName.toUpperCase(), 20, 24);

        doc.setFontSize(12);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(51, 65, 85); // slate-700
        doc.text(`Médico: ${timesheet.doctorName}`, 20, 32);
        doc.text(`CRM: ${timesheet.doctorCRM} | ${timesheet.doctorSpecialty}`, 20, 38);

        // Body Info
        let y = 55;
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text(`MÊS DE REFERÊNCIA: ${getMonthName(timesheet.month).toUpperCase()}`, 20, y);
        y += 8;

        // Table
        const tableBody = timesheet.entries.map(e => {
            const row = [
                e.date.split('-').reverse().join('/'),
                e.description || 'Plantão',
                e.entry1,
                e.exit1,
                e.entry2 || '-',
                e.exit2 || '-',
                `${e.totalHours}h`
            ];
            if (includeValue) {
                row.push(`R$ ${e.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
            }
            return row;
        });

        const head = [['DATA', 'DESCRIÇÃO', 'E1', 'S1', 'E2', 'S2', 'TOTAL']];
        if (includeValue) head[0].push('VALOR');

        doc.autoTable({
            startY: y,
            head: head,
            body: tableBody,
            theme: 'striped',
            headStyles: {
                fillColor: [30, 41, 59], // slate-800
                textColor: 255,
                fontStyle: 'bold',
                halign: 'center'
            },
            styles: {
                fontSize: 9,
                cellPadding: 4,
                valign: 'middle'
            },
            columnStyles: {
                0: { halign: 'center', cellWidth: 22 },
                2: { halign: 'center', cellWidth: 15 },
                3: { halign: 'center', cellWidth: 15 },
                4: { halign: 'center', cellWidth: 15 },
                5: { halign: 'center', cellWidth: 15 },
                6: { halign: 'center', cellWidth: 18 },
                7: { halign: 'right' }
            },
            alternateRowStyles: {
                fillColor: [249, 250, 251]
            }
        });

        const finalY = (doc as any).lastAutoTable.finalY + 15;

        // Summary if value included
        if (includeValue) {
            doc.setFontSize(11);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(15, 23, 42);
            doc.text(`VALOR TOTAL BRUTO: R$ ${timesheet.totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, pageWidth - 20, finalY, { align: 'right' });
        }

        // Signature Area
        const sigY = pageHeight - 60;
        doc.setDrawColor(203, 213, 225); // slate-300
        doc.line(60, sigY, pageWidth - 60, sigY);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(15, 23, 42);
        doc.text(timesheet.doctorName, pageWidth / 2, sigY + 5, { align: 'center' });
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100, 116, 139);
        doc.text('Assinatura do Profissional', pageWidth / 2, sigY + 10, { align: 'center' });

        // Footer logos in corners
        if (logo1) {
            try {
                doc.addImage(logo1, 'PNG', 20, pageHeight - 30, 30, 15);
            } catch (e) { }
        }
        if (logo2) {
            try {
                doc.addImage(logo2, 'PNG', pageWidth - 50, pageHeight - 30, 30, 15);
            } catch (e) { }
        }

        // Company info in center bottom
        doc.setFontSize(8);
        doc.text(`${timesheet.companyName} - CNPJ: ${timesheet.companyCNPJ}`, pageWidth / 2, pageHeight - 15, { align: 'center' });

        doc.save(`Folha_Ponto_${timesheet.doctorName.replace(/\s/g, '_')}_${timesheet.month}${includeValue ? '' : '_SemValor'}.pdf`);
    };

    return (
        <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
            {/* Header */}
            <div className="px-6 py-4 bg-white dark:bg-slate-800 border-bottom border-slate-200 dark:border-slate-800 flex justify-between items-center">
                <div>
                    <h2 className="text-xl font-bold text-slate-900 dark:text-white">Folhas de Ponto</h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Gerenciamento e exportação de produtividade</p>
                </div>
                <div className="flex gap-2">
                    {view === 'list' && (
                        <button
                            onClick={() => setView('create')}
                            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                            Nova Folha
                        </button>
                    )}
                    <button
                        onClick={onClose}
                        className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                    >
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-auto p-6">
                {view === 'list' && (
                    <div className="space-y-8">
                        {/* Stats Dashboard */}
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Total de Folhas</p>
                                <p className="text-2xl font-black text-slate-900 dark:text-white">{(store.timesheets || []).length}</p>
                            </div>
                            <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
                                <p className="text-[10px] font-black uppercase tracking-widest text-indigo-400 mb-1">Mês Atual</p>
                                <p className="text-2xl font-black text-indigo-600 dark:text-indigo-400">
                                    {(store.timesheets || []).filter(ts => ts.month === getMonthKey(new Date())).length}
                                </p>
                            </div>
                            <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
                                <p className="text-[10px] font-black uppercase tracking-widest text-emerald-400 mb-1">Prontas para Exportar</p>
                                <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
                                    {(store.timesheets || []).filter(ts => ts.status === 'draft').length}
                                </p>
                            </div>
                            <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
                                <p className="text-[10px] font-black uppercase tracking-widest text-amber-400 mb-1">Valor Total (Mês)</p>
                                <p className="text-xl font-black text-slate-900 dark:text-white">
                                    R$ {(store.timesheets || [])
                                        .filter(ts => ts.month === getMonthKey(new Date()))
                                        .reduce((sum, ts) => sum + ts.totalValue, 0)
                                        .toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                </p>
                            </div>
                        </div>

                        {/* Filters & Actions */}
                        <div className="flex flex-col md:flex-row justify-between items-end gap-4 p-6 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
                            <div className="flex flex-wrap gap-4 flex-1">
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Buscar Médico</label>
                                    <div className="relative">
                                        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                                        <select
                                            value={doctorFilter}
                                            onChange={(e) => setDoctorFilter(e.target.value)}
                                            className="pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-sm min-w-[240px] appearance-none"
                                        >
                                            <option value="">Todos os Médicos</option>
                                            {doctors.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                                        </select>
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Mês</label>
                                    <input
                                        type="month"
                                        value={monthFilter}
                                        onChange={(e) => setMonthFilter(e.target.value)}
                                        className="px-4 py-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-sm"
                                    />
                                </div>
                            </div>
                            <button
                                onClick={() => setView('create')}
                                className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-black uppercase tracking-widest transition-all shadow-lg shadow-indigo-200 dark:shadow-none flex items-center gap-2"
                            >
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" /></svg>
                                Nova Folha
                            </button>
                        </div>

                        {/* Timesheets List */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {filteredTimesheets.length > 0 ? (
                                filteredTimesheets.map(ts => (
                                    <div key={ts.id} className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden hover:shadow-xl transition-all group flex flex-col">
                                        <div className="p-6 flex-1">
                                            <div className="flex justify-between items-start mb-4">
                                                <div className="bg-slate-100 dark:bg-slate-700 p-2 rounded-lg">
                                                    <svg className="w-6 h-6 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                                </div>
                                                <span className="text-[10px] font-black uppercase tracking-widest px-2 py-1 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-md">
                                                    {getMonthName(ts.month)}
                                                </span>
                                            </div>
                                            <h3 className="text-lg font-black text-slate-900 dark:text-white leading-tight mb-1">{ts.doctorName}</h3>
                                            <p className="text-xs font-bold text-slate-400 uppercase tracking-tighter mb-4">{ts.hospitalName}</p>

                                            <div className="flex justify-between items-end mt-6">
                                                <div>
                                                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-300">Total Produzido</p>
                                                    <p className="text-lg font-black text-slate-900 dark:text-white">R$ {ts.totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-xs font-bold text-slate-500">{ts.entries.length} plantões</p>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="px-6 py-4 bg-slate-50 dark:bg-slate-900/50 border-t border-slate-100 dark:border-slate-700 flex gap-2">
                                            <button
                                                onClick={() => { setSelectedTimesheet(ts); setView('edit'); }}
                                                className="flex-1 py-2 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-white dark:hover:bg-slate-800 rounded-lg transition-all border border-transparent hover:border-slate-200 dark:hover:border-slate-700"
                                            >
                                                Editar
                                            </button>
                                            <button
                                                onClick={() => { setSelectedTimesheet(ts); setView('preview'); }}
                                                className="flex-1 py-2 text-[10px] font-black uppercase tracking-widest bg-slate-900 dark:bg-slate-700 text-white hover:bg-indigo-600 rounded-lg transition-all flex items-center justify-center gap-1"
                                            >
                                                PDF
                                            </button>
                                            <button
                                                onClick={() => handleDeleteTimesheet(ts.id)}
                                                className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all"
                                            >
                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                            </button>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="col-span-full py-12 flex flex-col items-center justify-center text-slate-400 space-y-4">
                                    <svg className="w-16 h-16 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                    <p>Nenhuma folha de ponto encontrada.</p>
                                    <button
                                        onClick={() => setView('create')}
                                        className="text-indigo-600 dark:text-indigo-400 text-sm font-medium hover:underline"
                                    >
                                        Criar primeira folha agora
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {view === 'create' && (
                    <div className="max-w-2xl mx-auto bg-white dark:bg-slate-800 p-8 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700">
                        <h3 className="text-xl font-bold mb-6 dark:text-white">Gerar Nova Folha de Ponto</h3>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Médico</label>
                                <select
                                    value={newDoctorId}
                                    onChange={(e) => setNewDoctorId(e.target.value)}
                                    className="w-full px-4 py-2 border border-slate-200 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-700 dark:text-white"
                                >
                                    <option value="">Selecione um médico</option>
                                    {doctors.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Hospital / Local</label>
                                <select
                                    value={newHospitalId}
                                    onChange={(e) => setNewHospitalId(e.target.value)}
                                    className="w-full px-4 py-2 border border-slate-200 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-700 dark:text-white"
                                >
                                    <option value="">Selecione um hospital</option>
                                    {hospitals.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Mês de Referência</label>
                                <input
                                    type="month"
                                    value={newMonth}
                                    onChange={(e) => setNewMonth(e.target.value)}
                                    className="w-full px-4 py-2 border border-slate-200 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-700 dark:text-white"
                                />
                            </div>
                        </div>
                        <div className="flex gap-4 mt-8">
                            <button
                                onClick={() => setView('list')}
                                className="flex-1 py-3 text-sm font-medium text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleCreateTimesheet}
                                className="flex-1 py-3 text-sm font-medium text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200 dark:shadow-none"
                            >
                                Gerar Automático
                            </button>
                        </div>
                        <p className="text-center text-xs text-slate-400 mt-4">
                            Dica: O sistema buscará todos os plantões confirmados para este médico no hospital e mês selecionados.
                        </p>
                    </div>
                )}

                {view === 'preview' && selectedTimesheet && (
                    <TimesheetPreview
                        timesheet={selectedTimesheet}
                        store={store}
                        onGeneratePDF={generatePDF}
                        onBack={() => setView('edit')}
                    />
                )}

                {view === 'edit' && selectedTimesheet && (
                    <TimesheetEditor
                        timesheet={selectedTimesheet}
                        onSave={handleSaveTimesheet}
                        onPreview={() => setView('preview')}
                        onCancel={() => setView('list')}
                    />
                )}
            </div>
        </div>
    );
};

const TimesheetPreview: React.FC<{
    timesheet: Timesheet,
    store: ScheduleStore,
    onGeneratePDF: (ts: Timesheet, includeValue: boolean) => void,
    onBack: () => void
}> = ({ timesheet, store, onGeneratePDF, onBack }) => {
    const hospital = store.structure.find(h => h.id === timesheet.hospitalId);

    return (
        <div className="max-w-4xl mx-auto py-8">
            <div className="flex justify-between items-center mb-6">
                <button onClick={onBack} className="flex items-center gap-2 text-slate-500 hover:text-slate-800 transition-colors">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                    Voltar para Edição
                </button>
                <div className="flex gap-3">
                    <button
                        onClick={() => onGeneratePDF(timesheet, false)}
                        className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-lg text-sm font-bold transition-all"
                    >
                        Exportar Sem Valor
                    </button>
                    <button
                        onClick={() => onGeneratePDF(timesheet, true)}
                        className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-bold shadow-lg shadow-indigo-200 transition-all"
                    >
                        Exportar Folha Completa
                    </button>
                </div>
            </div>

            {/* A4 Preview Container */}
            <div className="bg-white shadow-2xl rounded-sm border border-slate-200 min-h-[1000px] p-[2cm] text-slate-900 mx-auto w-full max-w-[21cm]">
                {/* Header */}
                <div className="flex justify-between items-start border-b-2 border-slate-100 pb-6 mb-8">
                    <div className="space-y-1">
                        <p className="text-[10px] font-black tracking-widest text-slate-400 uppercase">Folha de Ponto Individual</p>
                        <h1 className="text-3xl font-black text-slate-900 uppercase leading-none">{timesheet.hospitalName}</h1>
                        <div className="pt-4 space-y-0.5">
                            <p className="text-sm font-bold text-slate-600">Médico: <span className="text-slate-900">{timesheet.doctorName}</span></p>
                            <p className="text-sm text-slate-500">CRM: <span className="font-bold">{timesheet.doctorCRM}</span> | {timesheet.doctorSpecialty}</p>
                        </div>
                    </div>
                    {hospital?.logo && (
                        <img src={hospital.logo} alt="" className="w-24 h-24 object-contain grayscale" />
                    )}
                </div>

                <div className="mb-4">
                    <h2 className="text-sm font-black text-slate-900 uppercase tracking-tighter">Mês de Referência: {getMonthName(timesheet.month)}</h2>
                </div>

                <table className="w-full border-collapse">
                    <thead>
                        <tr className="bg-slate-800 text-white text-[10px] uppercase font-black tracking-widest">
                            <th className="px-3 py-2 text-center border border-slate-700">Data</th>
                            <th className="px-3 py-2 text-left border border-slate-700">Descrição</th>
                            <th className="px-3 py-2 text-center border border-slate-700">E1</th>
                            <th className="px-3 py-2 text-center border border-slate-700">S1</th>
                            <th className="px-3 py-2 text-center border border-slate-700">E2</th>
                            <th className="px-3 py-2 text-center border border-slate-700">S2</th>
                            <th className="px-3 py-2 text-center border border-slate-700">Total</th>
                        </tr>
                    </thead>
                    <tbody className="text-[11px]">
                        {timesheet.entries.map((e, idx) => (
                            <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                                <td className="px-3 py-2 text-center border border-slate-200 font-bold">{e.date.split('-').reverse().join('/')}</td>
                                <td className="px-3 py-2 border border-slate-200 uppercase">{e.description || 'Plantão'}</td>
                                <td className="px-3 py-2 text-center border border-slate-200">{e.entry1}</td>
                                <td className="px-3 py-2 text-center border border-slate-200">{e.exit1}</td>
                                <td className="px-3 py-2 text-center border border-slate-200">{e.entry2 || '-'}</td>
                                <td className="px-3 py-2 text-center border border-slate-200">{e.exit2 || '-'}</td>
                                <td className="px-3 py-2 text-center border border-slate-200 font-bold">{e.totalHours}h</td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                <div className="mt-8 flex justify-end">
                    <p className="text-lg font-black uppercase text-slate-900">Total da Produtividade: R$ {timesheet.totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                </div>

                {/* Footer / Signature */}
                <div className="mt-32 space-y-20">
                    <div className="flex flex-col items-center">
                        <div className="w-[8cm] border-t border-slate-400 mb-2"></div>
                        <p className="text-xs font-black uppercase text-slate-800">{timesheet.doctorName}</p>
                        <p className="text-[10px] text-slate-400 uppercase tracking-widest">Assinatura do Profissional</p>
                    </div>

                    <div className="flex justify-between items-end pt-20 border-t border-slate-100">
                        {store.companySettings?.logo1 && <img src={store.companySettings.logo1} alt="" className="h-10 opacity-50 grayscale" />}
                        <div className="text-center">
                            <p className="text-[10px] font-bold text-slate-400 uppercase">{timesheet.companyName}</p>
                            <p className="text-[10px] text-slate-300">CNPJ: {timesheet.companyCNPJ}</p>
                        </div>
                        {store.companySettings?.logo2 && <img src={store.companySettings.logo2} alt="" className="h-10 opacity-50 grayscale" />}
                    </div>
                </div>
            </div>
        </div>
    );
};

const TimesheetEditor: React.FC<{
    timesheet: Timesheet,
    onSave: (ts: Timesheet) => void,
    onPreview: () => void,
    onCancel: () => void
}> = ({ timesheet, onSave, onPreview, onCancel }) => {
    const [editedTs, setEditedTs] = useState<Timesheet>({ ...timesheet });

    const handleEntryChange = (id: string, field: keyof TimesheetEntry, value: any) => {
        setEditedTs(prev => {
            const entries = prev.entries.map(e => {
                if (e.id === id) {
                    const newEntry = { ...e, [field]: value };

                    // Recalculate hours if times changed
                    if (field === 'entry1' || field === 'exit1' || field === 'entry2' || field === 'exit2') {
                        const [h1, m1] = newEntry.entry1.split(':').map(Number);
                        const [h2, m2] = newEntry.exit1.split(':').map(Number);
                        let diff = (h2 * 60 + m2) - (h1 * 60 + m1);
                        if (diff < 0) diff += 24 * 60;

                        let totalHours = diff / 60;

                        if (newEntry.entry2 && newEntry.exit2) {
                            const [h3, m3] = newEntry.entry2.split(':').map(Number);
                            const [h4, m4] = newEntry.exit2.split(':').map(Number);
                            let diff2 = (h4 * 60 + m4) - (h3 * 60 + m3);
                            if (diff2 < 0) diff2 += 24 * 60;
                            totalHours += (diff2 / 60);
                        }

                        newEntry.totalHours = totalHours;
                    }

                    return newEntry;
                }
                return e;
            });

            return {
                ...prev,
                entries,
                totalValue: entries.reduce((sum, e) => sum + e.value, 0)
            };
        });
    };

    return (
        <div className="space-y-6 max-w-5xl mx-auto">
            <div className="flex justify-between items-end">
                <div>
                    <h3 className="text-lg font-bold dark:text-white">Edição de Folha de Ponto</h3>
                    <p className="text-sm text-slate-500">{editedTs.doctorName} - {editedTs.hospitalName} ({getMonthName(editedTs.month)})</p>
                </div>
                <div className="flex gap-2">
                    <button onClick={onCancel} className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors">Cancelar</button>
                    <button onClick={onPreview} className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 bg-slate-200 dark:bg-slate-700 rounded-lg hover:bg-slate-300 transition-colors">Visualizar PDF</button>
                    <button onClick={() => onSave(editedTs)} className="px-6 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 shadow-md">Salvar Folha</button>
                </div>
            </div>

            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
                <table className="w-full text-sm">
                    <thead className="bg-slate-50 dark:bg-slate-900/50 text-slate-600 dark:text-slate-400">
                        <tr>
                            <th className="px-4 py-3 text-left">Data</th>
                            <th className="px-4 py-3 text-left">Descrição</th>
                            <th className="px-4 py-3 text-center">E1 / S1</th>
                            <th className="px-4 py-3 text-center">E2 / S2</th>
                            <th className="px-4 py-3 text-center">Horas</th>
                            <th className="px-4 py-3 text-right">Valor Bruto</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                        {editedTs.entries.map(e => (
                            <tr key={e.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                                <td className="px-4 py-3 font-medium">{e.date.split('-').reverse().join('/')}</td>
                                <td className="px-4 py-3">
                                    <input
                                        type="text"
                                        value={e.description || ''}
                                        onChange={(opt) => handleEntryChange(e.id, 'description', opt.target.value)}
                                        className="bg-transparent border-none focus:ring-1 focus:ring-indigo-500 rounded px-1 w-full"
                                    />
                                </td>
                                <td className="px-4 py-3">
                                    <div className="flex items-center justify-center gap-1">
                                        <input type="time" value={e.entry1} onChange={(opt) => handleEntryChange(e.id, 'entry1', opt.target.value)} className="bg-slate-50 dark:bg-slate-700 border-none rounded text-xs p-1" />
                                        <span>-</span>
                                        <input type="time" value={e.exit1} onChange={(opt) => handleEntryChange(e.id, 'exit1', opt.target.value)} className="bg-slate-50 dark:bg-slate-700 border-none rounded text-xs p-1" />
                                    </div>
                                </td>
                                <td className="px-4 py-3">
                                    <div className="flex items-center justify-center gap-1">
                                        <input type="time" value={e.entry2 || ''} onChange={(opt) => handleEntryChange(e.id, 'entry2', opt.target.value)} className="bg-slate-50 dark:bg-slate-700 border-none rounded text-xs p-1" />
                                        <span>-</span>
                                        <input type="time" value={e.exit2 || ''} onChange={(opt) => handleEntryChange(e.id, 'exit2', opt.target.value)} className="bg-slate-50 dark:bg-slate-700 border-none rounded text-xs p-1" />
                                    </div>
                                </td>
                                <td className="px-4 py-3 text-center">{e.totalHours}h</td>
                                <td className="px-4 py-3 text-right">
                                    <div className="flex items-center justify-end gap-1">
                                        <span className="text-slate-400">R$</span>
                                        <input
                                            type="number"
                                            value={e.value}
                                            onChange={(opt) => handleEntryChange(e.id, 'value', Number(opt.target.value))}
                                            className="bg-transparent border-none focus:ring-1 focus:ring-indigo-500 rounded px-1 w-24 text-right"
                                        />
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                    <tfoot className="bg-slate-50 dark:bg-slate-900/50 font-bold">
                        <tr>
                            <td colSpan={5} className="px-4 py-4 text-right">TOTAL DA FOLHA:</td>
                            <td className="px-4 py-4 text-right text-lg text-indigo-600 dark:text-indigo-400">
                                R$ {editedTs.totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        </div>
    );
};

export default TimesheetManager;
