import React, { useState } from 'react';
import { User, UserRole, Doctor } from '../types';
import { signInWithPopup } from "firebase/auth";
import { auth, googleProvider, db } from "../services/firebase";
import { doc, getDoc, setDoc } from 'firebase/firestore';

interface LoginProps {
    doctors: Doctor[];
    users?: User[];
    onLogin: (user: User, source: 'local' | 'firebase') => void;
}

const Login: React.FC<LoginProps> = ({ doctors, users, onLogin }) => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleGoogleLogin = async () => {
        setLoading(true);
        setError('');
        try {
            const result = await signInWithPopup(auth, googleProvider);
            const fbUser = result.user;

            // Check for existing profile in Firestore
            const userRef = doc(db, 'user_profiles', fbUser.uid);
            const userSnap = await getDoc(userRef);

            if (userSnap.exists()) {
                const profile = userSnap.data();
                onLogin({
                    id: fbUser.uid,
                    username: fbUser.email || 'google_user',
                    name: profile.name || fbUser.displayName || 'Usuário Google',
                    role: profile.role as UserRole,
                    linkedDoctorId: profile.linkedDoctorId
                }, 'firebase');
            } else {
                // Create a new PENDING profile for first-time login
                const newProfile = {
                    email: fbUser.email,
                    name: fbUser.displayName || 'Novo Usuário',
                    role: 'PENDING', // Waiting for Admin to change this to ADM, Medico, etc.
                    created_at: new Date().toISOString()
                };

                await setDoc(userRef, newProfile);

                onLogin({
                    id: fbUser.uid,
                    username: fbUser.email || '',
                    name: newProfile.name,
                    role: 'PENDING' as UserRole
                }, 'firebase');
            }
        } catch (error: any) {
            console.error("Google Login Error:", error);
            setError("Erro ao logar com Google: " + error.message);
        } finally {
            setLoading(false);
        }
    };

    const handleLogin = (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        const u = username.toLowerCase().trim();
        const p = password;

        // 1. Check Real Users (created via Admin Manager)
        if (users && users.length > 0) {
            const foundUser = users.find(existing => existing.username.toLowerCase() === u && existing.password === p);
            if (foundUser) {
                onLogin(foundUser, 'local');
                return;
            }
        }

        // 2. Mock / Default Users Fallbacks (for initial usage)

        if (p === '123' || p === 'admin' || p === u) {
            // Success password matches (simple for testing)

            if (u === 'admin') {
                onLogin({ username: 'admin', name: 'Administrador', role: 'ADM' }, 'local');
                return;
            }

            if (u === 'coordenador') {
                // Director might need to select a doctor view later, but starts with full access
                onLogin({ username: 'coordenador', name: 'Coordenador Geral', role: 'Coordenador' }, 'local');
                return;
            }

            if (u === 'assistente') {
                onLogin({ username: 'assistente', name: 'Assistente Administrativo', role: 'Assistente' }, 'local');
                return;
            }

            if (u === 'medico') {
                // For testing, link to the first doctor or a known one?
                const demoDoc = doctors.find(d => d.name.toLowerCase().includes('thiago')) || doctors[0];

                if (demoDoc) {
                    onLogin({
                        username: 'medico',
                        name: demoDoc.name, // Use Doctor Name as User Name for clarity in Mock
                        role: 'Medico',
                        linkedDoctorId: demoDoc.id
                    }, 'local');
                } else {
                    setError('Nenhum médico encontrado para teste. Cadastre um médico primeiro.');
                    return;
                }
                return;
            }

            // Fallback: try to find a doctor with this username (e.g. 'thiago')
            const docFound = doctors.find(d => d.name.toLowerCase().includes(u));
            if (docFound) {
                onLogin({ username: u, name: docFound.name, role: 'Medico', linkedDoctorId: docFound.id }, 'local');
                return;
            }
        }

        setError('Usuário ou senha inválidos.');
    };

    return (
        <div className="min-h-screen bg-slate-100 dark:bg-slate-900 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-slate-200 dark:border-slate-700 w-full max-w-md p-8">
                <div className="text-center mb-8">
                    <div className="w-16 h-16 bg-indigo-600 rounded-xl mx-auto flex items-center justify-center mb-4 text-white">
                        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
                    </div>
                    <h1 className="text-2xl font-bold text-slate-800 dark:text-white">Anesthesiology Manager</h1>
                    <p className="text-slate-500 dark:text-slate-400 mt-2">Faça login para acessar a escala</p>
                </div>

                <form onSubmit={handleLogin} className="space-y-6">
                    {error && (
                        <div className="p-3 bg-red-50 text-red-600 rounded-lg text-sm text-center border border-red-100 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400">
                            {error}
                        </div>
                    )}

                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Usuário</label>
                        <input
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                            placeholder="Ex: admin, coordenador, medico..."
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Senha</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                            placeholder="••••••"
                        />
                    </div>


                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 rounded-lg transition-colors shadow-md shadow-indigo-200 dark:shadow-indigo-900/20 disabled:opacity-50"
                    >
                        {loading ? 'Carregando...' : 'Entrar'}
                    </button>

                    <div className="relative my-6">
                        <div className="absolute inset-0 flex items-center">
                            <div className="w-full border-t border-slate-300 dark:border-slate-600"></div>
                        </div>
                        <div className="relative flex justify-center text-sm">
                            <span className="px-2 bg-white dark:bg-slate-800 text-slate-500">Ou continue com</span>
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={handleGoogleLogin}
                        disabled={loading}
                        className="w-full bg-white dark:bg-slate-700 hover:bg-slate-50 dark:hover:bg-slate-600 text-slate-700 dark:text-white font-semibold py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                        <svg className="w-5 h-5" viewBox="0 0 24 24">
                            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                        </svg>
                        Google
                    </button>
                </form>
            </div>
        </div>
    );
};

export default Login;
