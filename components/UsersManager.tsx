import React, { useState, useEffect } from 'react';
import { ScheduleStore, User, UserRole, Doctor } from '../types';
import Modal from './ui/Modal';
import { db } from '../services/firebase';
import { doc, updateDoc, deleteDoc } from 'firebase/firestore';

interface UsersManagerProps {
    isOpen: boolean;
    onClose: () => void;
    store: ScheduleStore;
    // We pass store, but we might also need a way to refresh or trigger updates? 
    // Actually the Firestore Sync in App listens to changes. If we update Firestore here, App will update automatically.
}

const UsersManager: React.FC<UsersManagerProps> = ({ isOpen, onClose, store }) => {
    // We use local state for the form, but list comes from store (which comes from Firestore)
    const [editingUser, setEditingUser] = useState<User | null>(null);
    const [searchTerm, setSearchTerm] = useState('');

    // Update User Role / Doctor Link
    const handleUpdateUser = async () => {
        if (!editingUser) return;

        try {
            // Determine the Doc ID. 
            // In store.users, we have 'id'. If missing (legacy), we assume 'username' might guide us, but we really need the Firestore ID.
            // Our useFirestoreSync mapped 'id' from doc.id. So store.users should have 'id'.
            if (!editingUser.id) {
                alert("Erro: Usuário sem ID. Não é possível editar.");
                return;
            }

            const docRef = doc(db, 'user_profiles', editingUser.id);
            await updateDoc(docRef, {
                role: editingUser.role,
                linkedDoctorId: editingUser.linkedDoctorId || null,
                name: editingUser.name // allow editing name too
            });

            setEditingUser(null);
            // No need to manually update store, App listener will catch it.
        } catch (error: any) {
            console.error("Error updating user:", error);
            alert("Erro ao atualizar usuário: " + error.message);
        }
    };

    const handleDeleteUser = async (userId: string) => {
        if (!confirm("Tem certeza que deseja remover este usuário?")) return;
        try {
            await deleteDoc(doc(db, 'user_profiles', userId));
        } catch (error: any) {
            console.error("Error deleting user:", error);
            alert("Erro ao remover usuário: " + error.message);
        }
    };

    const filteredUsers = (store.users || []).filter(u =>
        u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        u.username.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Gestão de Usuários"
            className="w-full max-w-4xl" // Wider modal
        >
            <div className="space-y-6">

                {/* Search / Header */}
                <div className="flex justify-between items-center bg-slate-50 dark:bg-slate-800 p-4 rounded-lg border border-slate-200 dark:border-slate-700">
                    <div>
                        <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Usuários Cadastrados</h4>
                        <p className="text-xs text-slate-500">Gerencie permissões e vínculos.</p>
                    </div>
                    <div>
                        <input
                            type="text"
                            placeholder="Buscar usuário..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="px-3 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700"
                        />
                    </div>
                </div>

                {/* Edit Form (if editing) */}
                {editingUser && (
                    <div className="bg-indigo-50 dark:bg-indigo-900/20 p-4 rounded-lg border border-indigo-100 dark:border-indigo-800 animate-in fade-in slide-in-from-top-4">
                        <div className="flex justify-between items-center mb-4">
                            <h4 className="text-sm font-bold text-indigo-800 dark:text-indigo-300">Editando: {editingUser.name}</h4>
                            <button onClick={() => setEditingUser(null)} className="text-xs text-slate-500 hover:text-slate-700">Cancelar</button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Nome</label>
                                <input
                                    type="text"
                                    value={editingUser.name}
                                    onChange={e => setEditingUser({ ...editingUser, name: e.target.value })}
                                    className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Perfil (Role)</label>
                                <select
                                    value={editingUser.role}
                                    onChange={e => setEditingUser({ ...editingUser, role: e.target.value as UserRole })}
                                    className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700"
                                >
                                    <option value="ADM">Administrador</option>
                                    <option value="Coordenador">Coordenador</option>
                                    <option value="Medico">Médico</option>
                                    <option value="Assistente">Assistente</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Médico Vinculado</label>
                                <select
                                    value={editingUser.linkedDoctorId || ''}
                                    onChange={e => setEditingUser({ ...editingUser, linkedDoctorId: e.target.value })}
                                    className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700"
                                    disabled={editingUser.role === 'ADM' || editingUser.role === 'Assistente'} // Only needed for Medico/Diretor usually
                                >
                                    <option value="">-- Sem Vínculo --</option>
                                    {store.doctors.map(d => (
                                        <option key={d.id} value={d.id}>{d.name}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        <div className="mt-4 flex justify-end">
                            <button
                                onClick={handleUpdateUser}
                                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors"
                            >
                                Salvar Alterações
                            </button>
                        </div>
                    </div>
                )}

                {/* Users List Container with Horizontal Scroll */}
                <div className="border rounded-lg border-slate-200 dark:border-slate-700 overflow-hidden max-h-[50vh] overflow-x-auto overflow-y-auto">
                    <table className="w-full text-sm text-left border-collapse">
                        <thead className="bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 uppercase text-[10px] sm:text-xs sticky top-0 z-10">
                            <tr>
                                <th className="px-3 py-3 font-bold border-b dark:border-slate-700 min-w-[180px]">Login / Email</th>
                                <th className="px-3 py-3 font-bold border-b dark:border-slate-700 min-w-[120px]">Nome</th>
                                <th className="px-3 py-3 font-bold border-b dark:border-slate-700 min-w-[100px]">Perfil</th>
                                <th className="px-3 py-3 font-bold border-b dark:border-slate-700 min-w-[150px]">Médico Vínculado</th>
                                <th className="px-3 py-3 font-bold border-b dark:border-slate-700 text-right min-w-[120px]">Ação</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                            {filteredUsers.length > 0 ? filteredUsers.map(u => {
                                const linkedDoc = store.doctors.find(d => d.id === u.linkedDoctorId);
                                return (
                                    <tr key={u.id || u.username} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                                        <td className="px-3 py-3 font-medium text-slate-700 dark:text-slate-200" title={u.username}>
                                            <div className="max-w-[180px] truncate">{u.username}</div>
                                        </td>
                                        <td className="px-3 py-3">
                                            <div className="max-w-[120px] truncate">{u.name}</div>
                                        </td>
                                        <td className="px-3 py-3 whitespace-nowrap">
                                            <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold border ${u.role === 'ADM' ? 'bg-red-50 text-red-700 border-red-100' :
                                                u.role === 'Coordenador' ? 'bg-purple-50 text-purple-700 border-purple-100' :
                                                    u.role === 'Medico' ? 'bg-blue-50 text-blue-700 border-blue-100' :
                                                        'bg-orange-50 text-orange-700 border-orange-100'
                                                }`}>
                                                {u.role}
                                            </span>
                                        </td>
                                        <td className="px-3 py-3 text-slate-500 whitespace-nowrap">
                                            {linkedDoc ? (
                                                <span className="flex items-center gap-1.5 text-xs">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,0.5)]"></span>
                                                    {linkedDoc.name}
                                                </span>
                                            ) : (
                                                <span className="text-slate-300 italic text-xs">Não vinculado</span>
                                            )}
                                        </td>
                                        <td className="px-3 py-3 text-right whitespace-nowrap space-x-2">
                                            <button
                                                onClick={() => setEditingUser(u)}
                                                className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-indigo-50 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 rounded-md text-[11px] font-bold transition-all border border-indigo-100 dark:border-indigo-800"
                                            >
                                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                                EDITAR
                                            </button>
                                            <button
                                                onClick={() => u.id && handleDeleteUser(u.id)}
                                                className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-red-50 dark:bg-red-900/40 text-red-600 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/60 rounded-md text-[11px] font-bold transition-all border border-red-100 dark:border-red-800"
                                            >
                                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                                REMOVER
                                            </button>
                                        </td>
                                    </tr>
                                );
                            }) : (
                                <tr>
                                    <td colSpan={5} className="px-3 py-10 text-center text-slate-500">Nenhum usuário encontrado.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </Modal>
    );
};

export default UsersManager;
