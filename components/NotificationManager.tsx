import React, { useState } from 'react';
import { ScheduleStore, Doctor, NotificationSettings } from '../types';
import Modal from './ui/Modal';

interface NotificationManagerProps {
    isOpen: boolean;
    onClose: () => void;
    store: ScheduleStore;
    onUpdateDoctor: (doctorId: string, updates: Partial<Doctor>) => void;
    onUpdateSettings: (settings: NotificationSettings) => void;
}

const NotificationManager: React.FC<NotificationManagerProps> = ({
    isOpen,
    onClose,
    store,
    onUpdateDoctor,
    onUpdateSettings
}) => {
    const [activeTab, setActiveTab] = useState<'doctors' | 'settings' | 'logs'>('doctors');

    const settings = store.notificationSettings || {
        enableDailyReminders: true,
        enableChangeNotifications: true,
        reminderTime: '18:00',
        adminEmails: []
    };

    const [localSettings, setLocalSettings] = useState(settings);
    const [newAdminEmail, setNewAdminEmail] = useState('');

    const handleSaveSettings = () => {
        onUpdateSettings(localSettings);
        alert('Configurações salvas com sucesso!');
    };

    const handleAddAdminEmail = () => {
        if (!newAdminEmail.trim()) return;
        if (!newAdminEmail.includes('@')) {
            alert('Email inválido');
            return;
        }
        if (localSettings.adminEmails.includes(newAdminEmail)) {
            alert('Email já cadastrado');
            return;
        }
        setLocalSettings({
            ...localSettings,
            adminEmails: [...localSettings.adminEmails, newAdminEmail]
        });
        setNewAdminEmail('');
    };

    const handleRemoveAdminEmail = (email: string) => {
        setLocalSettings({
            ...localSettings,
            adminEmails: localSettings.adminEmails.filter(e => e !== email)
        });
    };

    const notificationLogs = store.notificationLogs || [];
    const recentLogs = [...notificationLogs].sort((a, b) => b.timestamp - a.timestamp).slice(0, 50);

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Gerenciamento de Notificações" className="w-full max-w-5xl">
            <div className="space-y-4">
                {/* Tabs */}
                <div className="flex gap-2 border-b border-slate-200 dark:border-slate-700">
                    <button
                        onClick={() => setActiveTab('doctors')}
                        className={`px-4 py-2 font-medium text-sm transition-colors border-b-2 ${activeTab === 'doctors'
                                ? 'border-indigo-600 text-indigo-600'
                                : 'border-transparent text-slate-500 hover:text-slate-700'
                            }`}
                    >
                        Emails dos Médicos
                    </button>
                    <button
                        onClick={() => setActiveTab('settings')}
                        className={`px-4 py-2 font-medium text-sm transition-colors border-b-2 ${activeTab === 'settings'
                                ? 'border-indigo-600 text-indigo-600'
                                : 'border-transparent text-slate-500 hover:text-slate-700'
                            }`}
                    >
                        Configurações
                    </button>
                    <button
                        onClick={() => setActiveTab('logs')}
                        className={`px-4 py-2 font-medium text-sm transition-colors border-b-2 ${activeTab === 'logs'
                                ? 'border-indigo-600 text-indigo-600'
                                : 'border-transparent text-slate-500 hover:text-slate-700'
                            }`}
                    >
                        Histórico de Envios
                    </button>
                </div>

                {/* Doctors Tab */}
                {activeTab === 'doctors' && (
                    <div className="space-y-3">
                        <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg border border-blue-200 dark:border-blue-800">
                            <p className="text-sm text-blue-800 dark:text-blue-300">
                                <strong>💡 Dica:</strong> Configure os emails dos médicos para que recebam lembretes automáticos 24h antes de seus plantões.
                            </p>
                        </div>

                        <div className="max-h-[50vh] overflow-y-auto">
                            <table className="w-full text-sm">
                                <thead className="bg-slate-50 dark:bg-slate-800 sticky top-0">
                                    <tr>
                                        <th className="px-4 py-3 text-left font-bold text-slate-700 dark:text-slate-300">Médico</th>
                                        <th className="px-4 py-3 text-left font-bold text-slate-700 dark:text-slate-300">Email</th>
                                        <th className="px-4 py-3 text-left font-bold text-slate-700 dark:text-slate-300">Telefone</th>
                                        <th className="px-4 py-3 text-center font-bold text-slate-700 dark:text-slate-300">Notificações</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                                    {store.doctors.map(doctor => (
                                        <tr key={doctor.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                                            <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">
                                                {doctor.name}
                                            </td>
                                            <td className="px-4 py-3">
                                                <input
                                                    type="email"
                                                    value={doctor.email || ''}
                                                    onChange={(e) => onUpdateDoctor(doctor.id, { email: e.target.value })}
                                                    placeholder="email@exemplo.com"
                                                    className="w-full px-2 py-1 text-sm border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700"
                                                />
                                            </td>
                                            <td className="px-4 py-3">
                                                <input
                                                    type="tel"
                                                    value={doctor.phoneNumber || ''}
                                                    onChange={(e) => onUpdateDoctor(doctor.id, { phoneNumber: e.target.value })}
                                                    placeholder="(00) 00000-0000"
                                                    className="w-full px-2 py-1 text-sm border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700"
                                                />
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <label className="inline-flex items-center cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        checked={doctor.receiveNotifications !== false}
                                                        onChange={(e) => onUpdateDoctor(doctor.id, { receiveNotifications: e.target.checked })}
                                                        className="w-4 h-4 text-indigo-600 rounded focus:ring-2 focus:ring-indigo-500"
                                                    />
                                                    <span className="ml-2 text-xs text-slate-600 dark:text-slate-400">
                                                        {doctor.receiveNotifications !== false ? 'Ativo' : 'Inativo'}
                                                    </span>
                                                </label>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* Settings Tab */}
                {activeTab === 'settings' && (
                    <div className="space-y-4">
                        <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-lg border border-slate-200 dark:border-slate-700 space-y-4">
                            <h3 className="font-bold text-slate-800 dark:text-slate-200 mb-3">Configurações Gerais</h3>

                            {/* Daily Reminders */}
                            <div className="flex items-center justify-between p-3 bg-white dark:bg-slate-700 rounded-lg">
                                <div>
                                    <div className="font-medium text-slate-800 dark:text-slate-200">Lembretes Diários</div>
                                    <div className="text-xs text-slate-500 dark:text-slate-400">
                                        Enviar email aos médicos 24h antes do plantão
                                    </div>
                                </div>
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={localSettings.enableDailyReminders}
                                        onChange={(e) => setLocalSettings({ ...localSettings, enableDailyReminders: e.target.checked })}
                                        className="sr-only peer"
                                    />
                                    <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 dark:peer-focus:ring-indigo-800 rounded-full peer dark:bg-slate-600 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-600 peer-checked:bg-indigo-600"></div>
                                </label>
                            </div>

                            {/* Reminder Time */}
                            {localSettings.enableDailyReminders && (
                                <div className="p-3 bg-white dark:bg-slate-700 rounded-lg">
                                    <label className="block font-medium text-slate-800 dark:text-slate-200 mb-2">
                                        Horário do Lembrete
                                    </label>
                                    <input
                                        type="time"
                                        value={localSettings.reminderTime}
                                        onChange={(e) => setLocalSettings({ ...localSettings, reminderTime: e.target.value })}
                                        className="px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700"
                                    />
                                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                                        Os lembretes serão enviados diariamente neste horário
                                    </p>
                                </div>
                            )}

                            {/* Change Notifications */}
                            <div className="flex items-center justify-between p-3 bg-white dark:bg-slate-700 rounded-lg">
                                <div>
                                    <div className="font-medium text-slate-800 dark:text-slate-200">Notificações de Mudanças</div>
                                    <div className="text-xs text-slate-500 dark:text-slate-400">
                                        Notificar ADM/Assistentes quando houver alterações na escala
                                    </div>
                                </div>
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={localSettings.enableChangeNotifications}
                                        onChange={(e) => setLocalSettings({ ...localSettings, enableChangeNotifications: e.target.checked })}
                                        className="sr-only peer"
                                    />
                                    <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 dark:peer-focus:ring-indigo-800 rounded-full peer dark:bg-slate-600 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-600 peer-checked:bg-indigo-600"></div>
                                </label>
                            </div>

                            {/* Admin Emails */}
                            {localSettings.enableChangeNotifications && (
                                <div className="p-3 bg-white dark:bg-slate-700 rounded-lg space-y-3">
                                    <label className="block font-medium text-slate-800 dark:text-slate-200">
                                        Emails dos Administradores
                                    </label>

                                    <div className="flex gap-2">
                                        <input
                                            type="email"
                                            value={newAdminEmail}
                                            onChange={(e) => setNewAdminEmail(e.target.value)}
                                            onKeyPress={(e) => e.key === 'Enter' && handleAddAdminEmail()}
                                            placeholder="admin@exemplo.com"
                                            className="flex-1 px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700"
                                        />
                                        <button
                                            onClick={handleAddAdminEmail}
                                            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium"
                                        >
                                            Adicionar
                                        </button>
                                    </div>

                                    <div className="space-y-1">
                                        {localSettings.adminEmails.map((email, idx) => (
                                            <div key={idx} className="flex items-center justify-between p-2 bg-slate-50 dark:bg-slate-800 rounded">
                                                <span className="text-sm text-slate-700 dark:text-slate-300">{email}</span>
                                                <button
                                                    onClick={() => handleRemoveAdminEmail(email)}
                                                    className="text-red-500 hover:text-red-700 text-xs font-medium"
                                                >
                                                    Remover
                                                </button>
                                            </div>
                                        ))}
                                        {localSettings.adminEmails.length === 0 && (
                                            <p className="text-xs text-slate-500 italic">Nenhum email cadastrado</p>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="flex justify-end">
                            <button
                                onClick={handleSaveSettings}
                                className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium"
                            >
                                Salvar Configurações
                            </button>
                        </div>
                    </div>
                )}

                {/* Logs Tab */}
                {activeTab === 'logs' && (
                    <div className="space-y-3">
                        <div className="bg-slate-50 dark:bg-slate-800 p-3 rounded-lg border border-slate-200 dark:border-slate-700">
                            <p className="text-sm text-slate-600 dark:text-slate-400">
                                Mostrando os últimos 50 envios de notificação
                            </p>
                        </div>

                        <div className="max-h-[50vh] overflow-y-auto space-y-2">
                            {recentLogs.length === 0 ? (
                                <div className="text-center py-12 text-slate-500">
                                    <svg className="w-16 h-16 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                    </svg>
                                    <p className="font-medium">Nenhuma notificação enviada ainda</p>
                                </div>
                            ) : (
                                recentLogs.map(log => (
                                    <div
                                        key={log.id}
                                        className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-3"
                                    >
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="flex-1">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className={`px-2 py-0.5 rounded text-xs font-bold ${log.status === 'sent'
                                                            ? 'bg-green-100 text-green-700'
                                                            : log.status === 'failed'
                                                                ? 'bg-red-100 text-red-700'
                                                                : 'bg-yellow-100 text-yellow-700'
                                                        }`}>
                                                        {log.status === 'sent' ? '✓ Enviado' : log.status === 'failed' ? '✗ Falhou' : '⏳ Pendente'}
                                                    </span>
                                                    <span className="text-xs text-slate-500">
                                                        {new Date(log.timestamp).toLocaleString('pt-BR')}
                                                    </span>
                                                </div>
                                                <div className="text-sm font-medium text-slate-800 dark:text-slate-200">
                                                    {log.subject}
                                                </div>
                                                <div className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                                                    Para: {log.recipientName} ({log.recipientEmail})
                                                </div>
                                                {log.error && (
                                                    <div className="text-xs text-red-600 dark:text-red-400 mt-1">
                                                        Erro: {log.error}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                )}
            </div>
        </Modal>
    );
};

export default NotificationManager;
