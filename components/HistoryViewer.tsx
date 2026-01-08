import React, { useState, useMemo } from 'react';
import { HistoryEntry, ScheduleStore, User } from '../types';
import Modal from './ui/Modal';

interface HistoryViewerProps {
    isOpen: boolean;
    onClose: () => void;
    store: ScheduleStore;
    currentUser: User | null;
    onRevert: (entryId: string) => void;
}

const HistoryViewer: React.FC<HistoryViewerProps> = ({ isOpen, onClose, store, currentUser, onRevert }) => {
    const [filterUser, setFilterUser] = useState<string>('');
    const [filterAction, setFilterAction] = useState<string>('');
    const [filterLocation, setFilterLocation] = useState<string>('');
    const [searchDoctor, setSearchDoctor] = useState<string>('');
    const [dateRange, setDateRange] = useState<{ start: string, end: string }>({ start: '', end: '' });

    const history = store.history || [];

    // Filtered and sorted history
    const filteredHistory = useMemo(() => {
        let filtered = [...history];

        // Filter by user
        if (filterUser) {
            filtered = filtered.filter(h => h.userName.toLowerCase().includes(filterUser.toLowerCase()));
        }

        // Filter by action
        if (filterAction) {
            filtered = filtered.filter(h => h.action === filterAction);
        }

        // Filter by location
        if (filterLocation) {
            filtered = filtered.filter(h => h.locationId === filterLocation);
        }

        // Filter by doctor name
        if (searchDoctor) {
            filtered = filtered.filter(h => {
                const doctorName = h.after?.name || h.before?.name || '';
                return doctorName.toLowerCase().includes(searchDoctor.toLowerCase());
            });
        }

        // Filter by date range
        if (dateRange.start) {
            const startTime = new Date(dateRange.start).getTime();
            filtered = filtered.filter(h => h.timestamp >= startTime);
        }
        if (dateRange.end) {
            const endTime = new Date(dateRange.end).setHours(23, 59, 59, 999);
            filtered = filtered.filter(h => h.timestamp <= endTime);
        }

        // Sort by most recent first
        return filtered.sort((a, b) => b.timestamp - a.timestamp);
    }, [history, filterUser, filterAction, filterLocation, searchDoctor, dateRange]);

    const getActionIcon = (action: string) => {
        switch (action) {
            case 'create':
                return (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                );
            case 'edit':
                return (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                );
            case 'delete':
                return (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                );
            case 'move':
                return (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                    </svg>
                );
            default:
                return null;
        }
    };

    const getActionColor = (action: string) => {
        switch (action) {
            case 'create': return 'bg-green-100 text-green-700 border-green-200';
            case 'edit': return 'bg-blue-100 text-blue-700 border-blue-200';
            case 'delete': return 'bg-red-100 text-red-700 border-red-200';
            case 'move': return 'bg-purple-100 text-purple-700 border-purple-200';
            default: return 'bg-gray-100 text-gray-700 border-gray-200';
        }
    };

    const getActionLabel = (action: string) => {
        switch (action) {
            case 'create': return 'Criou';
            case 'edit': return 'Editou';
            case 'delete': return 'Deletou';
            case 'move': return 'Moveu';
            default: return action;
        }
    };

    const formatTimestamp = (timestamp: number) => {
        const date = new Date(timestamp);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'Agora mesmo';
        if (diffMins < 60) return `${diffMins} min atrás`;
        if (diffHours < 24) return `${diffHours}h atrás`;
        if (diffDays < 7) return `${diffDays}d atrás`;

        return date.toLocaleString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const renderChangeDetails = (entry: HistoryEntry) => {
        const { action, before, after } = entry;

        if (action === 'create' && after) {
            return (
                <div className="text-xs space-y-1">
                    <div className="font-semibold text-green-700 dark:text-green-400">Novo plantão criado:</div>
                    <div className="bg-green-50 dark:bg-green-900/20 p-2 rounded border border-green-200 dark:border-green-800">
                        <div><strong>Médico:</strong> {after.name}</div>
                        {after.time && <div><strong>Horário:</strong> {after.time}</div>}
                        {after.period && <div><strong>Período:</strong> {after.period}</div>}
                        {after.value !== undefined && <div><strong>Valor:</strong> R$ {after.value.toFixed(2)}</div>}
                    </div>
                </div>
            );
        }

        if (action === 'delete' && before) {
            return (
                <div className="text-xs space-y-1">
                    <div className="font-semibold text-red-700 dark:text-red-400">Plantão removido:</div>
                    <div className="bg-red-50 dark:bg-red-900/20 p-2 rounded border border-red-200 dark:border-red-800">
                        <div><strong>Médico:</strong> {before.name}</div>
                        {before.time && <div><strong>Horário:</strong> {before.time}</div>}
                        {before.period && <div><strong>Período:</strong> {before.period}</div>}
                    </div>
                </div>
            );
        }

        if (action === 'edit' && before && after) {
            const changes: string[] = [];
            if (before.name !== after.name) changes.push(`Médico: ${before.name} → ${after.name}`);
            if (before.time !== after.time) changes.push(`Horário: ${before.time || 'N/A'} → ${after.time || 'N/A'}`);
            if (before.period !== after.period) changes.push(`Período: ${before.period || 'N/A'} → ${after.period || 'N/A'}`);
            if (before.value !== after.value) changes.push(`Valor: R$ ${(before.value || 0).toFixed(2)} → R$ ${(after.value || 0).toFixed(2)}`);
            if (before.isBold !== after.isBold) changes.push(`Negrito: ${before.isBold ? 'Sim' : 'Não'} → ${after.isBold ? 'Sim' : 'Não'}`);
            if (before.isRed !== after.isRed) changes.push(`Vermelho: ${before.isRed ? 'Sim' : 'Não'} → ${after.isRed ? 'Sim' : 'Não'}`);

            return (
                <div className="text-xs space-y-1">
                    <div className="font-semibold text-blue-700 dark:text-blue-400">Alterações:</div>
                    <div className="bg-blue-50 dark:bg-blue-900/20 p-2 rounded border border-blue-200 dark:border-blue-800 space-y-0.5">
                        {changes.map((change, idx) => (
                            <div key={idx}>• {change}</div>
                        ))}
                    </div>
                </div>
            );
        }

        if (action === 'move') {
            return (
                <div className="text-xs space-y-1">
                    <div className="font-semibold text-purple-700 dark:text-purple-400">Plantão movido</div>
                    {before && (
                        <div className="bg-purple-50 dark:bg-purple-900/20 p-2 rounded border border-purple-200 dark:border-purple-800">
                            <div><strong>Médico:</strong> {before.name}</div>
                        </div>
                    )}
                </div>
            );
        }

        return null;
    };

    const canRevert = (entry: HistoryEntry) => {
        // Only ADM can revert
        if (currentUser?.role !== 'ADM') return false;

        // Can't revert if it's too old (optional: add time limit)
        // const hoursSince = (Date.now() - entry.timestamp) / 3600000;
        // if (hoursSince > 24) return false;

        return true;
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Histórico de Mudanças" className="w-full max-w-6xl">
            <div className="space-y-4">
                {/* Filters */}
                <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-lg border border-slate-200 dark:border-slate-700">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        <div>
                            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                                Usuário
                            </label>
                            <input
                                type="text"
                                value={filterUser}
                                onChange={(e) => setFilterUser(e.target.value)}
                                placeholder="Filtrar por usuário..."
                                className="w-full px-3 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700"
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                                Ação
                            </label>
                            <select
                                value={filterAction}
                                onChange={(e) => setFilterAction(e.target.value)}
                                className="w-full px-3 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700"
                            >
                                <option value="">Todas as ações</option>
                                <option value="create">Criação</option>
                                <option value="edit">Edição</option>
                                <option value="delete">Exclusão</option>
                                <option value="move">Movimentação</option>
                            </select>
                        </div>

                        <div>
                            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                                Hospital
                            </label>
                            <select
                                value={filterLocation}
                                onChange={(e) => setFilterLocation(e.target.value)}
                                className="w-full px-3 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700"
                            >
                                <option value="">Todos os hospitais</option>
                                {store.structure.map(loc => (
                                    <option key={loc.id} value={loc.id}>{loc.name}</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                                Médico
                            </label>
                            <input
                                type="text"
                                value={searchDoctor}
                                onChange={(e) => setSearchDoctor(e.target.value)}
                                placeholder="Buscar médico..."
                                className="w-full px-3 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700"
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                                Data Início
                            </label>
                            <input
                                type="date"
                                value={dateRange.start}
                                onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                                className="w-full px-3 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700"
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                                Data Fim
                            </label>
                            <input
                                type="date"
                                value={dateRange.end}
                                onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                                className="w-full px-3 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700"
                            />
                        </div>
                    </div>

                    <div className="mt-3 flex items-center justify-between">
                        <div className="text-xs text-slate-500">
                            Mostrando {filteredHistory.length} de {history.length} registros
                        </div>
                        <button
                            onClick={() => {
                                setFilterUser('');
                                setFilterAction('');
                                setFilterLocation('');
                                setSearchDoctor('');
                                setDateRange({ start: '', end: '' });
                            }}
                            className="text-xs text-indigo-600 hover:text-indigo-700 font-medium"
                        >
                            Limpar Filtros
                        </button>
                    </div>
                </div>

                {/* History List */}
                <div className="max-h-[60vh] overflow-y-auto space-y-2">
                    {filteredHistory.length === 0 ? (
                        <div className="text-center py-12 text-slate-500">
                            <svg className="w-16 h-16 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <p className="font-medium">Nenhum registro encontrado</p>
                            <p className="text-sm mt-1">Tente ajustar os filtros</p>
                        </div>
                    ) : (
                        filteredHistory.map((entry) => (
                            <div
                                key={entry.id}
                                className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-4 hover:shadow-md transition-shadow"
                            >
                                <div className="flex items-start justify-between gap-4">
                                    <div className="flex-1 space-y-2">
                                        {/* Header */}
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-bold border ${getActionColor(entry.action)}`}>
                                                {getActionIcon(entry.action)}
                                                {getActionLabel(entry.action)}
                                            </span>
                                            <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                                                {entry.userName}
                                            </span>
                                            <span className="text-xs text-slate-500">
                                                ({entry.userRole})
                                            </span>
                                            <span className="text-xs text-slate-400">•</span>
                                            <span className="text-xs text-slate-500">
                                                {formatTimestamp(entry.timestamp)}
                                            </span>
                                        </div>

                                        {/* Location Info */}
                                        <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
                                            <span className="font-medium">{entry.locationName}</span>
                                            <span>→</span>
                                            <span>{entry.shiftName}</span>
                                            {entry.dateKey && (
                                                <>
                                                    <span>→</span>
                                                    <span>{new Date(entry.dateKey).toLocaleDateString('pt-BR')}</span>
                                                </>
                                            )}
                                            {entry.isTemplate && (
                                                <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded-full text-[10px] font-bold">
                                                    MODELO
                                                </span>
                                            )}
                                        </div>

                                        {/* Change Details */}
                                        {renderChangeDetails(entry)}
                                    </div>

                                    {/* Revert Button */}
                                    {canRevert(entry) && (
                                        <button
                                            onClick={() => {
                                                if (confirm('Tem certeza que deseja reverter esta alteração?')) {
                                                    onRevert(entry.id);
                                                }
                                            }}
                                            className="flex-shrink-0 px-3 py-2 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 rounded-lg text-xs font-bold transition-colors flex items-center gap-1"
                                            title="Reverter esta alteração"
                                        >
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                                            </svg>
                                            Reverter
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </Modal>
    );
};

export default HistoryViewer;
