import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { ScheduleStore, MonthKey, Assignment, LocationData, ThemeColor, Shift, Doctor, FinancialRule, User, UserRole } from './types';
import { initializeStore, getWeekViewData, getTemplateViewData, createMonthFromTemplate, repairStoreDoctors } from './utils/scheduleManager';
import { getWeeksForMonth, getMonthName, getWeekRangeString, getMonthKey } from './utils/dateUtils';
import { SHIFT_TIMES_CONFIG, SHIFT_DISPLAY_TIMES } from './constants';
import ScheduleTable from './components/ScheduleTable';
import UnitView from './components/UnitView';
import FinancialReport from './components/FinancialReport';
import Modal from './components/ui/Modal';
import { exportAsImage } from './utils/exportUtils';
import { getThemeStyles } from './utils/themeUtils';
import Login from './components/Login';
import MobileScheduleView from './components/MobileScheduleView';
import UsersManager from './components/UsersManager';
import { useFirestoreSync } from './hooks/useFirestoreSync';
import { auth, db } from './services/firebase';
import { onAuthStateChanged, signOut as firebaseSignOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import HistoryViewer from './components/HistoryViewer';
import { createHistoryEntry, revertHistoryEntry, addHistoryEntry } from './utils/historyUtils';
import NotificationManager from './components/NotificationManager';
import { sendChangeNotification, initializeNotificationSettings } from './utils/notificationUtils';
import { NotificationSettings } from './types';
import TimesheetManager from './components/TimesheetManager';

const AUTH_STORAGE_KEY = 'asm_auth_user_v1';
const AUTH_SOURCE_KEY = 'asm_auth_source_v1';
type AuthSource = 'local' | 'firebase';

// Available themes for selection
const AVAILABLE_THEMES: ThemeColor[] = [
    'slate', 'gray', 'zinc', 'neutral', 'stone', 'red', 'orange', 'amber', 'yellow',
    'lime', 'green', 'emerald', 'teal', 'cyan', 'sky', 'blue', 'indigo', 'violet',
    'purple', 'fuchsia', 'pink', 'rose'
].filter(t => ['slate', 'green', 'purple', 'blue', 'orange', 'pink', 'indigo', 'sky', 'yellow', 'neutral', 'emerald', 'fuchsia', 'lime', 'teal', 'cyan', 'amber', 'violet', 'rose'].includes(t)) as ThemeColor[];

const App: React.FC = () => {
    // --- AUTH STATE ---
    const [authSource, setAuthSource] = useState<AuthSource | null>(() => {
        try {
            const savedSource = localStorage.getItem(AUTH_SOURCE_KEY);
            return savedSource === 'local' || savedSource === 'firebase' ? savedSource : null;
        } catch (e) {
            return null;
        }
    });
    const [currentUser, setCurrentUser] = useState<User | null>(() => {
        try {
            if (localStorage.getItem(AUTH_SOURCE_KEY) !== 'local') return null;
            const saved = localStorage.getItem(AUTH_STORAGE_KEY);
            return saved ? JSON.parse(saved) : null;
        } catch (e) {
            return null;
        }
    });

    const persistAuthState = useCallback((user: User | null, source: AuthSource | null) => {
        if (!user || !source) {
            localStorage.removeItem(AUTH_STORAGE_KEY);
            localStorage.removeItem(AUTH_SOURCE_KEY);
            return;
        }
        localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
        localStorage.setItem(AUTH_SOURCE_KEY, source);
    }, []);

    const clearAuthState = useCallback(() => {
        setCurrentUser(null);
        setAuthSource(null);
        localStorage.removeItem(AUTH_STORAGE_KEY);
        localStorage.removeItem(AUTH_SOURCE_KEY);
    }, []);

    const handleLogin = useCallback((user: User, source: AuthSource) => {
        setCurrentUser(user);
        setAuthSource(source);
        persistAuthState(user, source);
    }, [persistAuthState]);

    const handleLogout = useCallback(async () => {
        clearAuthState();
        try {
            await firebaseSignOut(auth);
        } catch (error) {
            console.error("Error signing out:", error);
        }
    }, [clearAuthState]);

    // --- STATE ---
    // --- STATE ---
    // Initial Load: LocalStorage (Fallback). Then Firestore overwrites if auth.
    const [store, setStore] = useState<ScheduleStore>(() => {
        try {
            const saved = localStorage.getItem('schedule_store');
            if (saved) {
                const parsed = JSON.parse(saved);
                return repairStoreDoctors(parsed);
            }
            return initializeStore();
        } catch (e) {
            return initializeStore();
        }
    });

    // --- FIRESTORE SYNC ---
    const { status: syncStatus, errorMessage: syncErrorMessage, saveToFirestore, isSynced, retryCount } = useFirestoreSync(currentUser, setStore);
    const isAdminOrAssistant = currentUser?.role === 'ADM' || currentUser?.role === 'Assistente';

    // Restore Firebase session on refresh (Google/Firebase login)
    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (fbUser) => {
            if (fbUser) {
                (async () => {
                    try {
                        // Busca o perfil do usuário no Firestore
                        const userRef = doc(db, 'user_profiles', fbUser.uid);
                        const userSnap = await getDoc(userRef);

                        if (userSnap.exists()) {
                            const profile = userSnap.data();
                            const restoredUser: User = {
                                id: fbUser.uid,
                                username: fbUser.email || 'google_user',
                                name: profile.name || fbUser.displayName || 'Usuário',
                                role: (profile.role as UserRole) || 'PENDING' as UserRole,
                                linkedDoctorId: profile.linkedDoctorId
                            };
                            setCurrentUser(restoredUser);
                            setAuthSource('firebase');
                            persistAuthState(restoredUser, 'firebase');
                        } else {
                            // Usuário Firebase sem perfil - será criado no Login.tsx
                            // Por segurança, não logamos automaticamente
                            console.log("Usuário Firebase sem perfil. Redirecionando para login...");
                            clearAuthState();
                        }
                    } catch (error) {
                        console.error("Error restoring Firebase user:", error);
                        clearAuthState();
                    }
                })();
            } else if (authSource === 'firebase') {
                clearAuthState();
            }
        });

        return () => unsubscribe();
    }, [authSource, clearAuthState, persistAuthState]);

    // EMERGENCY: FORCE LOGOUT IF STUCK AS "MEDICO À DEFINIR"
    useEffect(() => {
        if (currentUser && currentUser.name === 'Médico À Definir' && currentUser.role === 'Medico') {
            console.log("Detectado usuário genérico preso. Forçando logout...");
            clearAuthState();
            window.location.reload();
        }
        // Also catch case where name matches screenshot "A Definir" if varying casing
        if (currentUser && currentUser.role === 'Medico' && (!currentUser.username || currentUser.username === 'medico')) {
            console.log("Detectado usuário médico genérico. Forçando logout...");
            clearAuthState();
            // window.location.reload(); // Reload might loop, just clear state
        }
    }, [currentUser, clearAuthState]);

    useEffect(() => {
        if (authSource === 'local' && currentUser) {
            persistAuthState(currentUser, 'local');
        }
    }, [authSource, currentUser, persistAuthState]);

    // Auto-Save to Firestore (INSTANT - Real-time)
    useEffect(() => {
        if (!currentUser) return;
        // Only save if we have synced at least once to prevent overwriting with initial empty state
        if (!isSynced) return;

        // Salvamento instantâneo - sem debounce
        if (syncStatus !== 'loading') {
            saveToFirestore(store);
        }
    }, [store, currentUser, saveToFirestore, syncStatus, isSynced]);

    // Warn before leaving if saving or retrying
    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (syncStatus === 'saving' || syncStatus === 'retrying') {
                e.preventDefault();
                e.returnValue = '';
            }
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [syncStatus]);

    const [activeMonth, setActiveMonth] = useState<MonthKey>(() => getMonthKey(new Date()));
    const [currentWeekIndex, setCurrentWeekIndex] = useState(() => {
        const monthKey = getMonthKey(new Date());
        const weeksList = getWeeksForMonth(monthKey);
        const today = new Date();
        const y = today.getFullYear();
        const m = String(today.getMonth() + 1).padStart(2, '0');
        const d = String(today.getDate()).padStart(2, '0');
        const todayKey = `${y}-${m}-${d}`;

        const foundIdx = weeksList.findIndex(week => week.some(day => day.dateKey === todayKey));
        return foundIdx !== -1 ? foundIdx : 0;
    });
    const [viewMode, setViewMode] = useState<'month' | 'full-month' | 'template' | 'unit'>('full-month');
    const [directorViewMode, setDirectorViewMode] = useState<'all' | 'specific'>('all');
    const [directorTargetDoctorId, setDirectorTargetDoctorId] = useState<string>(''); // For filtering by specific doctor
    const [showFinancial, setShowFinancial] = useState(false);

    const [isDarkMode, setIsDarkMode] = useState(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('theme_preference');
            if (saved) return saved === 'dark';
            return window.matchMedia('(prefers-color-scheme: dark)').matches;
        }
        return false;
    });

    // Auto-select 'Iuri' for Director default test view
    useEffect(() => {
        if (currentUser?.role === 'Coordenador' && !directorTargetDoctorId && (store.doctors || []).length > 0) {
            const defaultDoc = (store.doctors || []).find(d => d.name.toLowerCase().includes('iuri'));
            if (defaultDoc) {
                setDirectorTargetDoctorId(defaultDoc.id);
            }
        }
    }, [currentUser, store.doctors, directorTargetDoctorId]);

    // Modals
    const [monthSelectorModal, setMonthSelectorModal] = useState(false);
    const [deleteMonthModal, setDeleteMonthModal] = useState<string | null>(null);
    const [applyTemplateModal, setApplyTemplateModal] = useState(false);
    const [editingCell, setEditingCell] = useState<{ locationId: string, shiftId: string, dayIndex: number, assignmentIndex?: number } | null>(null);

    // Structure Management Modals
    const [locationModal, setLocationModal] = useState<{ isOpen: boolean, mode: 'create' | 'edit', data?: LocationData } | null>(null);
    const [shiftModal, setShiftModal] = useState<{ isOpen: boolean, mode: 'create' | 'edit', locationId: string, data?: Shift } | null>(null);

    // Management Menus
    const [doctorsManagerOpen, setDoctorsManagerOpen] = useState(false);
    const [rulesManagerOpen, setRulesManagerOpen] = useState(false);
    const [adminMenuOpen, setAdminMenuOpen] = useState(false);
    const [sideMenuOpen, setSideMenuOpen] = useState(false);
    const [historyViewerOpen, setHistoryViewerOpen] = useState(false);
    const [notificationManagerOpen, setNotificationManagerOpen] = useState(false);
    const [timesheetManagerOpen, setTimesheetManagerOpen] = useState(false);
    const [companySettingsOpen, setCompanySettingsOpen] = useState(false);

    // Forms
    const [editForm, setEditForm] = useState<Partial<Assignment>>({});
    const [locationForm, setLocationForm] = useState<{ name: string, nickname: string, logo: string, theme: ThemeColor }>({ name: '', nickname: '', logo: '', theme: 'slate' });
    const [shiftForm, setShiftForm] = useState<{ name: string }>({ name: '' });
    const [companyForm, setCompanyForm] = useState<{ name: string, cnpj: string, logo1: string, logo2: string }>({ name: '', cnpj: '', logo1: '', logo2: '' });

    // Manager Forms
    const [newDoctorName, setNewDoctorName] = useState('');
    const [newRuleForm, setNewRuleForm] = useState<Partial<FinancialRule>>({ isDif: false });
    const [rulesFilter, setRulesFilter] = useState('');

    // Navigation Forms
    const [monthInput, setMonthInput] = useState('');
    const [selectedApplyMonths, setSelectedApplyMonths] = useState<MonthKey[]>([]);

    // --- EFFECTS ---
    useEffect(() => {
        localStorage.setItem('schedule_store', JSON.stringify(store));
    }, [store]);

    useEffect(() => {
        // Reset week index when month changes if out of bounds
        const weeks = getWeeksForMonth(activeMonth);
        if (currentWeekIndex >= weeks.length) {
            setCurrentWeekIndex(0);
        }
    }, [activeMonth, currentWeekIndex]);

    useEffect(() => {
        if (isDarkMode) {
            document.documentElement.classList.add('dark');
            localStorage.setItem('theme_preference', 'dark');
        } else {
            document.documentElement.classList.remove('dark');
            localStorage.setItem('theme_preference', 'light');
        }
    }, [isDarkMode]);

    // --- COMPUTED ---
    const weeks = useMemo(() => getWeeksForMonth(activeMonth), [activeMonth]);
    const currentWeek = weeks[currentWeekIndex] || [];

    const hasPrevMonth = useMemo(() => {
        if (viewMode === 'template') return false;
        const [year, month] = activeMonth.split('-').map(Number);
        const date = new Date(year, month - 2, 1);
        const key = getMonthKey(date);
        return !!store.months[key];
    }, [activeMonth, store.months, viewMode]);

    const hasNextMonth = useMemo(() => {
        if (viewMode === 'template') return false;
        const [year, month] = activeMonth.split('-').map(Number);
        const date = new Date(year, month, 1);
        const key = getMonthKey(date);
        return !!store.months[key];
    }, [activeMonth, store.months, viewMode]);

    // --- FILTER HELPER ---
    const applyDoctorFilter = (data: LocationData[]) => {
        let shouldFilter = false;
        let targetDoctorId = '';

        // 1. Determine if we should filter
        if (currentUser?.role === 'Medico' && currentUser.linkedDoctorId) {
            shouldFilter = true;
            targetDoctorId = currentUser.linkedDoctorId;
        } else if (currentUser?.role === 'Coordenador' && directorViewMode === 'specific' && directorTargetDoctorId) {
            shouldFilter = true;
            targetDoctorId = directorTargetDoctorId;
        }

        if (shouldFilter) {
            // Use the name of the TARGET DOCTOR
            const linkedDoc = store.doctors.find(d => d.id === targetDoctorId);
            // If checking for Director, we strictly need a linkedDoc. If not found (e.g. empty), don't filter or show empty? 
            // Better to show empty if ID is present but not found, to indicate error.
            const doctorName = linkedDoc ? linkedDoc.name : (currentUser?.role === 'Medico' ? currentUser.name : '');

            // Filter locations
            return data.map(loc => {
                const newLoc = { ...loc };

                // Deep filter shifts AND assignmens
                const newShifts = loc.shifts.map(shift => {
                    // 1. Filter assignments inside each day
                    const newSchedule = shift.schedule.map(day => ({
                        ...day,
                        assignments: day.assignments.filter(a => a.name === doctorName)
                    }));

                    // 2. Check if there are assignments left
                    const hasAssignments = newSchedule.some(day => day.assignments.length > 0);

                    if (hasAssignments) {
                        return { ...shift, schedule: newSchedule };
                    }
                    return null;
                }).filter(Boolean) as Shift[];

                if (newShifts.length > 0) {
                    newLoc.shifts = newShifts;
                    return newLoc;
                }
                return null;
            }).filter(Boolean) as LocationData[];
        }
        return data; // No filter for other cases
    };



    const tableData = useMemo(() => {
        let data;
        if (viewMode === 'template') {
            data = getTemplateViewData(store.structure, store.template);
        } else {
            data = getWeekViewData(store.structure, store.months[activeMonth] || {}, currentWeek);
        }
        return applyDoctorFilter(data);
    }, [store, viewMode, activeMonth, currentWeek, currentUser]);

    // --- DOCTOR MANAGEMENT HANDLERS ---
    const handleAddDoctor = () => {
        if (!newDoctorName.trim()) return;
        setStore(prev => ({
            ...prev,
            doctors: [
                ...(prev.doctors || []),
                { id: `doc - ${Date.now()} `, name: newDoctorName, type: 'Normal' }
            ]
        }));
        setNewDoctorName('');
    };

    const handleRemoveDoctor = (id: string) => {
        setStore(prev => ({
            ...prev,
            doctors: prev.doctors.filter(d => d.id !== id)
        }));
    };

    const handleToggleDoctorType = (id: string) => {
        setStore(prev => ({
            ...prev,
            doctors: prev.doctors.map(d => d.id === id ? { ...d, type: d.type === 'Normal' ? 'Dif' : 'Normal' } : d)
        }));
    };

    const handleUpdateDoctorName = (id: string, newName: string) => {
        if (!newName.trim()) return;

        setStore(prev => {
            const newStore = JSON.parse(JSON.stringify(prev)); // Deep clone
            const doctor = newStore.doctors.find((d: Doctor) => d.id === id);

            if (doctor) {
                const oldName = doctor.name;
                doctor.name = newName;

                // Now propagate to ALL assignments in months
                Object.values(newStore.months).forEach((monthData: any) => {
                    Object.values(monthData).forEach((locationData: any) => {
                        Object.values(locationData).forEach((shiftData: any) => {
                            Object.values(shiftData).forEach((dayList: any) => {
                                (dayList as Assignment[]).forEach(assignment => {
                                    if (assignment.name === oldName) {
                                        assignment.name = newName;
                                    }
                                });
                            });
                        });
                    });
                });

                // Propagate to Template
                Object.values(newStore.template).forEach((locationData: any) => {
                    Object.values(locationData).forEach((shiftData: any) => {
                        Object.values(shiftData).forEach((dayList: any) => {
                            (dayList as Assignment[]).forEach(assignment => {
                                if (assignment.name === oldName) {
                                    assignment.name = newName;
                                }
                            });
                        });
                    });
                });
            }

            return newStore;
        });
    };

    const handleUpdateDoctorCRM = (id: string, crm: string) => {
        setStore(prev => ({
            ...prev,
            doctors: prev.doctors.map(d => d.id === id ? { ...d, crm } : d)
        }));
    };

    const handleUpdateDoctorSpecialty = (id: string, specialty: string) => {
        setStore(prev => ({
            ...prev,
            doctors: prev.doctors.map(d => d.id === id ? { ...d, specialty } : d)
        }));
    };

    const handleUpdateDoctorFullName = (id: string, fullName: string) => {
        setStore(prev => ({
            ...prev,
            doctors: prev.doctors.map(d => d.id === id ? { ...d, fullName } : d)
        }));
    };

    const handleUpdateDoctorNickname = (id: string, nickname: string) => {
        setStore(prev => ({
            ...prev,
            doctors: prev.doctors.map(d => d.id === id ? { ...d, nickname } : d)
        }));
    };

    // --- USERS MANAGEMENT HANDLERS (ADM) ---
    const [usersManagerOpen, setUsersManagerOpen] = useState(false);
    const [newUserForm, setNewUserForm] = useState<Partial<User>>({ role: 'Medico', username: '', password: '', name: '' });

    const handleAddUser = () => {
        if (!newUserForm.username || !newUserForm.password || !newUserForm.name || !newUserForm.role) return;

        // Simple username check
        if (store.users?.some(u => u.username === newUserForm.username)) {
            alert('Usuário já existe!');
            return;
        }

        setStore(prev => ({
            ...prev,
            users: [
                ...(prev.users || []),
                {
                    username: newUserForm.username!,
                    password: newUserForm.password!,
                    name: newUserForm.name!,
                    role: newUserForm.role!,
                    linkedDoctorId: newUserForm.linkedDoctorId
                }
            ]
        }));
        setNewUserForm({ role: 'Medico', username: '', password: '', name: '', linkedDoctorId: '' });
    };

    const handleRemoveUser = (username: string) => {
        if (username === 'admin') {
            alert('Não é possível remover o administrador.');
            return;
        }
        setStore(prev => ({
            ...prev,
            users: prev.users.filter(u => u.username !== username)
        }));
    };

    // --- HISTORY MANAGEMENT ---
    const handleRevertHistory = (entryId: string) => {
        const entry = store.history?.find(h => h.id === entryId);
        if (!entry) {
            alert('Entrada de histórico não encontrada.');
            return;
        }

        const revertedStore = revertHistoryEntry(entry, store);
        setStore(revertedStore);
        setHistoryViewerOpen(false);
    };

    // --- NOTIFICATION MANAGEMENT ---
    const handleUpdateDoctorNotification = (doctorId: string, updates: Partial<Doctor>) => {
        setStore(prev => ({
            ...prev,
            doctors: prev.doctors.map(d =>
                d.id === doctorId ? { ...d, ...updates } : d
            )
        }));
    };

    const handleUpdateNotificationSettings = (settings: NotificationSettings) => {
        setStore(prev => ({
            ...prev,
            notificationSettings: settings
        }));
    };

    // --- RULES MANAGEMENT HANDLERS ---
    const handleAddRule = () => {
        if (!newRuleForm.hospitalName || !newRuleForm.shiftName || !newRuleForm.value) return;

        setStore(prev => ({
            ...prev,
            financialRules: [
                ...(prev.financialRules || []),
                {
                    id: `rule - ${Date.now()} `,
                    hospitalName: newRuleForm.hospitalName!,
                    shiftName: newRuleForm.shiftName!,
                    value: Number(newRuleForm.value),
                    isDif: !!newRuleForm.isDif
                }
            ]
        }));
        setNewRuleForm({ ...newRuleForm, shiftName: '', value: undefined }); // Keep hospital for convenience
    };

    const handleRemoveRule = (id: string) => {
        setStore(prev => ({
            ...prev,
            financialRules: prev.financialRules.filter(r => r.id !== id)
        }));
    };

    const handleUpdateRuleValue = (id: string, newValue: number) => {
        setStore(prev => ({
            ...prev,
            financialRules: prev.financialRules.map(r => r.id === id ? { ...r, value: newValue } : r)
        }));
    };

    // --- ASSIGNMENT HANDLERS ---

    const handleCellClick = (locationId: string, shiftId: string, dayIndex: number, assignmentIndex?: number, weekIdxOverride?: number) => {
        if (currentUser?.role === 'Medico' || currentUser?.role === 'Coordenador') return; // Read-only roles cannot edit assignments
        if (currentUser?.role === 'Assistente' && assignmentIndex === undefined) return; // Assistente não cria plantão

        // Support clicking on cells in Full Month mode (which may be a different week than currentWeekIndex)
        const targetWeekIndex = weekIdxOverride !== undefined ? weekIdxOverride : currentWeekIndex;
        const targetWeek = weeks[targetWeekIndex] || [];

        // Important: Update the current week index so that when the Modal saves, it uses the correct context
        if (weekIdxOverride !== undefined) {
            setCurrentWeekIndex(weekIdxOverride);
        }

        setEditingCell({ locationId, shiftId, dayIndex, assignmentIndex });

        // Load existing data if editing
        let assignment: Assignment | undefined;
        if (viewMode === 'template') {
            assignment = store.template[locationId]?.[shiftId]?.[dayIndex]?.[assignmentIndex ?? -1];
        } else {
            const dateKey = targetWeek[dayIndex]?.dateKey;
            if (dateKey) {
                assignment = store.months[activeMonth]?.[locationId]?.[shiftId]?.[dateKey]?.[assignmentIndex ?? -1];
            }
        }

        if (assignment && assignmentIndex !== undefined) {
            setEditForm({ ...assignment });
        } else {
            // --- AUTO-FILL LOGIC FOR NEW ASSIGNMENT ---
            let defaultPeriod = '';
            let defaultTime = '';

            // Try to match current shift to a rule
            const loc = store.structure.find(l => l.id === locationId);
            const shift = loc?.shifts.find(s => s.id === shiftId);

            if (loc && shift) {
                // Look for a rule that matches the shift name
                const hasRule = store.financialRules.some(r => r.hospitalName === loc.name && r.shiftName === shift.name);
                if (hasRule) {
                    defaultPeriod = shift.name;
                }

                // Try to autofill time from config based on period or shift name
                const configKey = (defaultPeriod || shift.name).toLowerCase();

                if (SHIFT_DISPLAY_TIMES[configKey]) {
                    defaultTime = SHIFT_DISPLAY_TIMES[configKey];
                } else {
                    // @ts-ignore
                    const timeConfig = SHIFT_TIMES_CONFIG[configKey];
                    if (timeConfig && timeConfig.length >= 2) {
                        const start = timeConfig[0].split(':')[0];
                        const end = timeConfig[1].split(':')[0];
                        // Ensure we have valid parts
                        if (start && end) {
                            defaultTime = `${start} -${end} h`;
                        }
                    }
                }
            }

            setEditForm({
                name: '',
                time: defaultTime,
                isBold: false,
                isRed: false,
                period: defaultPeriod
            });
        }
    };

    // --- HELPER FOR VALUE CALCULATION ---
    const calculateAssignmentValue = (
        doctorName: string,
        locationId: string,
        periodName: string
    ): number | undefined => {
        const doctor = store.doctors.find(d => d.name === doctorName);
        if (!doctor) return undefined;

        const loc = store.structure.find(l => l.id === locationId);
        if (!loc) return undefined;

        const isDif = doctor.type === 'Dif';

        const rule = store.financialRules.find(r =>
            r.hospitalName === loc.name &&
            r.shiftName === periodName &&
            r.isDif === isDif
        );

        return rule?.value;
    };

    // Auto-calculate value when doctor changes
    const handleDoctorChange = (doctorName: string) => {
        if (!editingCell) return;
        if (currentUser?.role === 'Assistente') return;

        const newForm = { ...editForm, name: doctorName };

        // Determine which period to use for lookup: selected period OR row shift name
        let periodForCalc = newForm.period;
        if (!periodForCalc) {
            const loc = store.structure.find(l => l.id === editingCell.locationId);
            const shift = loc?.shifts.find(s => s.id === editingCell.shiftId);
            if (shift) periodForCalc = shift.name;
        }

        if (periodForCalc) {
            const val = calculateAssignmentValue(doctorName, editingCell.locationId, periodForCalc);
            if (val !== undefined) {
                newForm.value = val;
            } else {
                if (newForm.value === undefined) newForm.value = 0;
            }
        }

        setEditForm(newForm);
    };

    // Handle Period Change
    const handlePeriodChange = (periodName: string) => {
        if (!editingCell) return;

        const newForm = { ...editForm, period: periodName };

        // 1. Auto-fill time
        const configKey = periodName.toLowerCase();

        if (SHIFT_DISPLAY_TIMES[configKey]) {
            newForm.time = SHIFT_DISPLAY_TIMES[configKey];
        } else {
            // Fallback to calculation
            // @ts-ignore
            const timeConfig = SHIFT_TIMES_CONFIG[configKey];
            if (timeConfig && timeConfig.length >= 2) {
                const start = timeConfig[0].split(':')[0];
                const end = timeConfig[1].split(':')[0];
                newForm.time = `${start} -${end} h`;
            }
        }

        // 2. Recalculate Value if doctor is selected
        if (newForm.name) {
            const val = calculateAssignmentValue(newForm.name, editingCell.locationId, periodName);
            if (val !== undefined) {
                newForm.value = val;
            }
        }

        setEditForm(newForm);
    };

    const handleSaveAssignment = () => {
        if (!editingCell) return;
        if (!editForm.name) return; // Name is required
        if (currentUser?.role === 'Assistente' && editingCell.assignmentIndex === undefined) return;

        const { locationId, shiftId, dayIndex, assignmentIndex } = editingCell;
        const newAssignment = editForm as Assignment;

        // Get location and shift names for history
        const location = store.structure.find(l => l.id === locationId);
        const shift = location?.shifts.find(s => s.id === shiftId);
        if (!location || !shift) return;

        setStore(prev => {
            const newStore = JSON.parse(JSON.stringify(prev)); // Deep clone

            let beforeAssignment: Assignment | null = null;
            let action: 'create' | 'edit' = 'create';

            if (viewMode === 'template') {
                if (!newStore.template[locationId]) newStore.template[locationId] = {};
                if (!newStore.template[locationId][shiftId]) newStore.template[locationId][shiftId] = {};
                if (!newStore.template[locationId][shiftId][dayIndex]) newStore.template[locationId][shiftId][dayIndex] = [];

                const list = newStore.template[locationId][shiftId][dayIndex];

                // Check if editing existing
                if (assignmentIndex !== undefined && list[assignmentIndex]) {
                    beforeAssignment = { ...list[assignmentIndex] };
                    action = 'edit';
                }

                const lockedName = currentUser?.role === 'Assistente' && assignmentIndex !== undefined
                    ? list[assignmentIndex]?.name
                    : undefined;
                const assignmentToSave = lockedName ? { ...newAssignment, name: lockedName } : newAssignment;

                if (assignmentIndex !== undefined) {
                    list[assignmentIndex] = assignmentToSave;
                } else {
                    list.push(assignmentToSave);
                }

                // Add history entry
                const historyEntry = createHistoryEntry(
                    action,
                    currentUser,
                    {
                        locationId,
                        locationName: location.name,
                        shiftId,
                        shiftName: shift.name,
                        dayIndex,
                        isTemplate: true
                    },
                    beforeAssignment,
                    assignmentToSave
                );
                newStore.history = addHistoryEntry(newStore, historyEntry).history;

            } else {
                // Use currentWeek (which is updated via state when cell is clicked)
                const dateKey = currentWeek[dayIndex].dateKey;
                if (!newStore.months[activeMonth]) newStore.months[activeMonth] = {};
                if (!newStore.months[activeMonth][locationId]) newStore.months[activeMonth][locationId] = {};
                if (!newStore.months[activeMonth][locationId][shiftId]) newStore.months[activeMonth][locationId][shiftId] = {};
                if (!newStore.months[activeMonth][locationId][shiftId][dateKey]) newStore.months[activeMonth][locationId][shiftId][dateKey] = [];

                const list = newStore.months[activeMonth][locationId][shiftId][dateKey];

                // Check if editing existing
                if (assignmentIndex !== undefined && list[assignmentIndex]) {
                    beforeAssignment = { ...list[assignmentIndex] };
                    action = 'edit';
                }

                const lockedName = currentUser?.role === 'Assistente' && assignmentIndex !== undefined
                    ? list[assignmentIndex]?.name
                    : undefined;
                const assignmentToSave = lockedName ? { ...newAssignment, name: lockedName } : newAssignment;

                if (assignmentIndex !== undefined) {
                    list[assignmentIndex] = assignmentToSave;
                } else {
                    list.push(assignmentToSave);
                }

                // Add history entry
                const historyEntry = createHistoryEntry(
                    action,
                    currentUser,
                    {
                        locationId,
                        locationName: location.name,
                        shiftId,
                        shiftName: shift.name,
                        dateKey,
                        isTemplate: false
                    },
                    beforeAssignment,
                    assignmentToSave
                );
                newStore.history = addHistoryEntry(newStore, historyEntry).history;
            }
            return newStore;
        });
        setEditingCell(null);
    };

    const handleDeleteAssignment = () => {
        if (!editingCell || editingCell.assignmentIndex === undefined) return;
        const { locationId, shiftId, dayIndex, assignmentIndex } = editingCell;

        // Get location and shift names for history
        const location = store.structure.find(l => l.id === locationId);
        const shift = location?.shifts.find(s => s.id === shiftId);
        if (!location || !shift) return;

        setStore(prev => {
            const newStore = JSON.parse(JSON.stringify(prev));

            let deletedAssignment: Assignment | null = null;

            if (viewMode === 'template') {
                const list = newStore.template[locationId]?.[shiftId]?.[dayIndex];
                if (list && list[assignmentIndex]) {
                    deletedAssignment = { ...list[assignmentIndex] };
                    list.splice(assignmentIndex, 1);

                    // Add history entry
                    const historyEntry = createHistoryEntry(
                        'delete',
                        currentUser,
                        {
                            locationId,
                            locationName: location.name,
                            shiftId,
                            shiftName: shift.name,
                            dayIndex,
                            isTemplate: true
                        },
                        deletedAssignment,
                        null
                    );
                    newStore.history = addHistoryEntry(newStore, historyEntry).history;
                }
            } else {
                const dateKey = currentWeek[dayIndex].dateKey;
                const list = newStore.months[activeMonth]?.[locationId]?.[shiftId]?.[dateKey];
                if (list && list[assignmentIndex]) {
                    deletedAssignment = { ...list[assignmentIndex] };
                    list.splice(assignmentIndex, 1);

                    // Add history entry
                    const historyEntry = createHistoryEntry(
                        'delete',
                        currentUser,
                        {
                            locationId,
                            locationName: location.name,
                            shiftId,
                            shiftName: shift.name,
                            dateKey,
                            isTemplate: false
                        },
                        deletedAssignment,
                        null
                    );
                    newStore.history = addHistoryEntry(newStore, historyEntry).history;
                }
            }
            return newStore;
        });
        setEditingCell(null);
    };

    // --- STRUCTURE HANDLERS (LOCATIONS & SHIFTS) ---

    const openLocationModal = (mode: 'create' | 'edit', locationId?: string) => {
        if (!isAdminOrAssistant) return; // Only ADM/Assistente can manage locations
        if (mode === 'edit' && locationId) {
            const loc = store.structure.find(l => l.id === locationId);
            if (loc) {
                setLocationForm({
                    name: loc.name,
                    nickname: loc.nickname || '',
                    logo: loc.logo || '',
                    theme: loc.theme
                });
                setLocationModal({ isOpen: true, mode, data: loc });
            }
        } else {
            setLocationForm({ name: '', nickname: '', logo: '', theme: 'slate' });
            setLocationModal({ isOpen: true, mode });
        }
    };

    const [hospitalManagerOpen, setHospitalManagerOpen] = useState(false);

    const handleSaveLocation = () => {
        if (!locationModal || !locationForm.name) return;

        setStore(prev => {
            const newStore = JSON.parse(JSON.stringify(prev));

            if (locationModal.mode === 'create') {
                const newId = `loc-${Date.now()}`;
                newStore.structure.push({
                    id: newId,
                    name: locationForm.name,
                    nickname: locationForm.nickname,
                    logo: locationForm.logo,
                    theme: locationForm.theme,
                    shifts: [{ id: `shift-${Date.now()}`, name: 'Plantão', schedule: [] }]
                });
            } else if (locationModal.mode === 'edit' && locationModal.data) {
                const loc = newStore.structure.find((l: LocationData) => l.id === locationModal.data!.id);
                if (loc) {
                    const oldName = loc.name;
                    loc.name = locationForm.name;
                    loc.nickname = locationForm.nickname;
                    loc.logo = locationForm.logo;
                    loc.theme = locationForm.theme;

                    // Propagate name change to Rules if name changed
                    if (oldName !== locationForm.name) {
                        newStore.financialRules.forEach((rule: FinancialRule) => {
                            if (rule.hospitalName === oldName) {
                                rule.hospitalName = locationForm.name;
                            }
                        });
                    }
                }
            }
            return newStore;
        });
        setLocationModal(null);
    };

    const handleDeleteLocation = () => {
        if (!locationModal?.data) return;
        if (!confirm(`Tem certeza que deseja remover o hospital "${locationModal.data.name}" ? Todos os dados associados serão perdidos.`)) return;

        setStore(prev => {
            const newStore = JSON.parse(JSON.stringify(prev));
            newStore.structure = newStore.structure.filter((l: LocationData) => l.id !== locationModal.data!.id);
            // Optional: Cleanup template and months data for this ID to save space
            return newStore;
        });
        setLocationModal(null);
    };

    const openShiftModal = (mode: 'create' | 'edit', locationId: string, shiftId?: string) => {
        if (!isAdminOrAssistant) return; // Only ADM/Assistente can manage shifts
        if (mode === 'edit' && shiftId) {
            const loc = store.structure.find(l => l.id === locationId);
            const shift = loc?.shifts.find(s => s.id === shiftId);
            if (shift) {
                setShiftForm({ name: shift.name });
                setShiftModal({ isOpen: true, mode, locationId, data: shift });
            }
        } else {
            setShiftForm({ name: '' });
            setShiftModal({ isOpen: true, mode, locationId });
        }
    };

    const handleSaveShift = () => {
        if (!shiftModal || !shiftForm.name) return;

        setStore(prev => {
            const newStore = JSON.parse(JSON.stringify(prev));
            const loc = newStore.structure.find((l: LocationData) => l.id === shiftModal.locationId);

            if (loc) {
                if (shiftModal.mode === 'create') {
                    loc.shifts.push({
                        id: `shift - ${Date.now()} `,
                        name: shiftForm.name,
                        schedule: []
                    });
                } else if (shiftModal.mode === 'edit' && shiftModal.data) {
                    const shift = loc.shifts.find((s: Shift) => s.id === shiftModal.data!.id);
                    if (shift) {
                        shift.name = shiftForm.name;
                    }
                }
            }
            return newStore;
        });
        setShiftModal(null);
    };

    const handleSaveCompanySettings = () => {
        setStore(prev => ({
            ...prev,
            companySettings: {
                name: companyForm.name,
                cnpj: companyForm.cnpj,
                logo1: companyForm.logo1,
                logo2: companyForm.logo2
            }
        }));
        setCompanySettingsOpen(false);
    };

    useEffect(() => {
        if (companySettingsOpen && store.companySettings) {
            setCompanyForm({
                name: store.companySettings.name,
                cnpj: store.companySettings.cnpj,
                logo1: store.companySettings.logo1 || '',
                logo2: store.companySettings.logo2 || ''
            });
        }
    }, [companySettingsOpen, store.companySettings]);

    const handleDeleteShift = () => {
        if (!shiftModal?.data) return;
        if (!confirm(`Tem certeza que deseja remover o turno "${shiftModal.data.name}" ? `)) return;

        setStore(prev => {
            const newStore = JSON.parse(JSON.stringify(prev));
            const loc = newStore.structure.find((l: LocationData) => l.id === shiftModal.locationId);
            if (loc) {
                loc.shifts = loc.shifts.filter((s: Shift) => s.id !== shiftModal.data!.id);
            }
            return newStore;
        });
        setShiftModal(null);
    };


    // --- MONTH HANDLERS ---

    const handleCreateMonth = (monthKey: string) => {
        if (currentUser?.role === 'Medico') return; // Medicos cannot create months
        if (!monthKey) return;
        if (!store.months[monthKey]) {
            setStore(prev => ({
                ...prev,
                months: {
                    ...prev.months,
                    [monthKey]: createMonthFromTemplate(monthKey, prev.template)
                }
            }));
        }
        setActiveMonth(monthKey);
        setMonthSelectorModal(false);
    };

    const handleDeleteMonth = (monthKey: string) => {
        if (!isAdminOrAssistant) return; // Only ADM/Assistente can delete months
        setStore(prev => {
            const newStore = { ...prev };
            const newMonths = { ...newStore.months };
            delete newMonths[monthKey];
            newStore.months = newMonths;
            return newStore;
        });
        setDeleteMonthModal(null);
        // Fallback to another month or current
        const remainingMonths = Object.keys(store.months).filter(m => m !== monthKey);
        if (remainingMonths.length > 0) {
            setActiveMonth(remainingMonths[remainingMonths.length - 1]);
        } else {
            setActiveMonth('2026-01'); // Fallback default
        }
    };

    const handleApplyTemplate = (mode: 'fill_empty' | 'overwrite') => {
        if (currentUser?.role === 'Medico') return; // Medicos cannot apply templates
        if (selectedApplyMonths.length === 0) return;

        setStore(prev => {
            const overwrite = mode === 'overwrite';
            const newMonths = { ...prev.months };

            selectedApplyMonths.forEach(mKey => {
                const existingData = overwrite ? undefined : newMonths[mKey];
                newMonths[mKey] = createMonthFromTemplate(
                    mKey,
                    prev.template,
                    existingData,
                    !overwrite
                );
            });

            return {
                ...prev,
                months: newMonths
            };
        });
        setApplyTemplateModal(false);
    };
    const handleMoveAssignment = (
        source: { locationId: string, shiftId: string, dayIndex: number, assignmentIndex: number },
        target: { locationId: string, shiftId: string, dayIndex: number },
        sourceWeekIdx?: number,
        targetWeekIdx?: number
    ) => {
        if (currentUser?.role === 'Medico') return; // Medicos cannot move assignments
        setStore(prev => {
            const newStore = JSON.parse(JSON.stringify(prev));
            let assignment: Assignment | undefined;

            // Source context
            const sWeekIdx = sourceWeekIdx !== undefined ? sourceWeekIdx : currentWeekIndex;
            const sWeek = weeks[sWeekIdx];

            // Target context
            const tWeekIdx = targetWeekIdx !== undefined ? targetWeekIdx : currentWeekIndex;
            const tWeek = weeks[tWeekIdx];

            if (viewMode === 'template') {
                const sourceList = newStore.template[source.locationId]?.[source.shiftId]?.[source.dayIndex];
                if (sourceList && sourceList[source.assignmentIndex]) {
                    [assignment] = sourceList.splice(source.assignmentIndex, 1);
                }

                if (assignment) {
                    if (!newStore.template[target.locationId]) newStore.template[target.locationId] = {};
                    if (!newStore.template[target.locationId][target.shiftId]) newStore.template[target.locationId][target.shiftId] = {};
                    if (!newStore.template[target.locationId][target.shiftId][target.dayIndex]) newStore.template[target.locationId][target.shiftId][target.dayIndex] = [];
                    newStore.template[target.locationId][target.shiftId][target.dayIndex].push(assignment);
                }
            } else {
                const sDateKey = sWeek?.[source.dayIndex]?.dateKey;
                const tDateKey = tWeek?.[target.dayIndex]?.dateKey;

                if (sDateKey && tDateKey) {
                    const sourceList = newStore.months[activeMonth]?.[source.locationId]?.[source.shiftId]?.[sDateKey];
                    if (sourceList && sourceList[source.assignmentIndex]) {
                        [assignment] = sourceList.splice(source.assignmentIndex, 1);
                    }

                    if (assignment) {
                        if (!newStore.months[activeMonth][target.locationId]) newStore.months[activeMonth][target.locationId] = {};
                        if (!newStore.months[activeMonth][target.locationId][target.shiftId]) newStore.months[activeMonth][target.locationId][target.shiftId] = {};
                        if (!newStore.months[activeMonth][target.locationId][target.shiftId][tDateKey]) newStore.months[activeMonth][target.locationId][target.shiftId][tDateKey] = [];
                        newStore.months[activeMonth][target.locationId][target.shiftId][tDateKey].push(assignment);
                    }
                }
            }

            return newStore;
        });
    };


    // --- NAVIGATION HANDLERS ---
    const handlePrevMonth = () => {
        const [year, month] = activeMonth.split('-').map(Number);
        const date = new Date(year, month - 2, 1);
        const newKey = getMonthKey(date);

        if (store.months[newKey]) {
            setActiveMonth(newKey);
        } else {
            // Removed auto-creation
        }
    };

    const handleNextMonth = () => {
        const [year, month] = activeMonth.split('-').map(Number);
        const date = new Date(year, month, 1);
        const newKey = getMonthKey(date);

        if (store.months[newKey]) {
            setActiveMonth(newKey);
        } else {
            // Removed auto-creation
        }
    };

    const handlePrevWeek = () => {
        if (currentWeekIndex > 0) {
            setCurrentWeekIndex(currentWeekIndex - 1);
        }
    };

    const handleNextWeek = () => {
        if (currentWeekIndex < weeks.length - 1) {
            setCurrentWeekIndex(currentWeekIndex + 1);
        }
    };

    // --- RENDER ---

    // Return Login Screen if not authenticated
    if (!currentUser) {
        return <Login doctors={store.doctors} users={store.users} onLogin={handleLogin} />;
    }

    // Block access for PENDING users
    if (currentUser.role === 'PENDING') {
        return (
            <div className="min-h-screen bg-slate-100 dark:bg-slate-900 flex items-center justify-center p-4">
                <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 w-full max-w-md p-8 text-center">
                    <div className="w-20 h-20 bg-amber-100 dark:bg-amber-900/30 rounded-full mx-auto flex items-center justify-center mb-6">
                        <svg className="w-10 h-10 text-amber-600 dark:text-amber-400 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    </div>
                    <h2 className="text-2xl font-bold text-slate-800 dark:text-white mb-3">Aguardando Aprovação</h2>
                    <p className="text-slate-500 dark:text-slate-400 mb-8 leading-relaxed">
                        Olá, <span className="font-bold text-slate-700 dark:text-slate-200">{currentUser.name}</span>.<br />
                        Seu perfil foi criado com sucesso, mas ainda não foi aprovado pelo administrador.
                        Por favor, aguarde a liberação do seu acesso.
                    </p>
                    <button
                        onClick={handleLogout}
                        className="w-full py-3 px-4 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-white font-bold rounded-xl transition-all"
                    >
                        Sair do Sistema
                    </button>
                </div>
            </div>
        );
    }

    if (showFinancial) {
        let doctorFilterName: string | undefined = undefined;
        // Strict Financial Filter for Medico
        if (currentUser?.role === 'Medico' && currentUser.linkedDoctorId) {
            const linkedDoc = store.doctors.find(d => d.id === currentUser.linkedDoctorId);
            doctorFilterName = linkedDoc ? linkedDoc.name : currentUser.name;
        }

        return (
            <FinancialReport
                store={store}
                activeMonth={activeMonth} // Local active month
                onMonthChange={setActiveMonth}
                onClose={() => setShowFinancial(false)}
                filterDoctorName={doctorFilterName}
            />
        );
    }



    // Template week headers are generic
    const displayDays = viewMode === 'template'
        ? ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'].map((name, i) => ({
            dayName: name,
            date: 'Padrão',
            dateKey: `template - ${i} `,
            isOutOfMonth: false
        }))
        : currentWeek;

    // Derive available periods (from ALL rules as per request)
    let availablePeriods: string[] = [];
    if (editingCell) {
        // Get unique shift names from ALL rules
        availablePeriods = (Array.from(new Set(store.financialRules.map(r => r.shiftName))) as string[]).sort();
    }

    return (
        <div className="min-h-screen bg-slate-100 dark:bg-slate-900 text-slate-900 dark:text-slate-100 transition-colors duration-200">
            {/* Side Menu Drawer */}
            <div className={`fixed inset-0 z-[100] transition-opacity duration-300 ${sideMenuOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setSideMenuOpen(false)}></div>
                <div className={`absolute left-0 top-0 bottom-0 w-[300px] bg-white dark:bg-slate-800 shadow-2xl transition-transform duration-300 transform ${sideMenuOpen ? 'translate-x-0' : '-translate-x-full'} flex flex-col`}>
                    <div className="p-6 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center bg-indigo-600 text-white">
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-widest opacity-80 mb-1">Perfil do Usuário</p>
                            <h3 className="text-xl font-bold">{currentUser.name}</h3>
                            <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full mt-2 inline-block font-bold uppercase">{currentUser.role}</span>
                        </div>
                        <button onClick={() => setSideMenuOpen(false)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-6">
                        {/* View Modes */}
                        <div className="space-y-1">
                            <p className="px-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Visualizações</p>
                            {[
                                { id: 'month', label: 'Escala Semanal', icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
                                { id: 'full-month', label: 'Calendário Mensal', icon: 'M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z' },
                                { id: 'unit', label: 'Vista por Unidade', icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4' },
                                { id: 'template', label: 'Config. Padrão', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z' }
                            ].filter(tab => {
                                if ((currentUser.role === 'Medico' || currentUser.role === 'Coordenador') && tab.id === 'template') return false;
                                return true;
                            }).map((tab) => (
                                <button
                                    key={tab.id}
                                    onClick={() => { setViewMode(tab.id as any); setSideMenuOpen(false); }}
                                    className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-bold transition-all ${viewMode === tab.id
                                        ? 'bg-indigo-50 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-800 shadow-sm'
                                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700/50 border border-transparent'
                                        }`}
                                >
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={tab.icon} /></svg>
                                    {tab.label}
                                </button>
                            ))}
                        </div>

                        {/* Coordinator Filter */}
                        {currentUser.role === 'Coordenador' && (
                            <div className="space-y-4 pt-4 border-t border-slate-100 dark:border-slate-700">
                                <p className="px-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Filtro de Escala</p>
                                <div className="flex bg-slate-100 dark:bg-slate-900/80 p-1 rounded-xl border border-slate-200 dark:border-slate-700 shadow-inner">
                                    <button
                                        onClick={() => setDirectorViewMode('all')}
                                        className={`flex-1 py-2 text-[10px] font-black rounded-lg transition-all ${directorViewMode === 'all'
                                            ? 'bg-white dark:bg-slate-800 text-indigo-600 shadow-sm'
                                            : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
                                            }`}
                                    >
                                        VER TODAS
                                    </button>
                                    <button
                                        onClick={() => setDirectorViewMode('specific')}
                                        className={`flex-1 py-2 text-[10px] font-black rounded-lg transition-all ${directorViewMode === 'specific'
                                            ? 'bg-indigo-600 text-white shadow-md'
                                            : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
                                            }`}
                                    >
                                        MINHA ESCALA
                                    </button>
                                </div>
                                {directorViewMode === 'specific' && (
                                    <select
                                        value={directorTargetDoctorId}
                                        onChange={(e) => setDirectorTargetDoctorId(e.target.value)}
                                        className="w-full h-11 pl-3 pr-8 text-sm border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30 transition-all font-bold"
                                    >
                                        <option value="">Selecione o Médico...</option>
                                        {store.doctors && (store.doctors || []).map(d => (
                                            <option key={d.id} value={d.id}>{d.name}</option>
                                        ))}
                                    </select>
                                )}
                            </div>
                        )}
                        {/* Cloud Sync Status */}
                        <div className="px-3 mb-4">
                            <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-[10px] font-bold uppercase tracking-wider transition-colors ${
                                syncStatus === 'saving' ? 'bg-amber-50 border-amber-200 text-amber-700 animate-pulse' :
                                syncStatus === 'retrying' ? 'bg-orange-50 border-orange-200 text-orange-700 animate-pulse' :
                                syncStatus === 'loading' ? 'bg-blue-50 border-blue-200 text-blue-700' :
                                syncStatus === 'error' ? 'bg-red-50 border-red-200 text-red-700' :
                                'bg-emerald-50 border-emerald-200 text-emerald-700'
                            }`}>
                                <div className={`w-1.5 h-1.5 rounded-full ${
                                    syncStatus === 'saving' ? 'bg-amber-500' :
                                    syncStatus === 'retrying' ? 'bg-orange-500' :
                                    syncStatus === 'loading' ? 'bg-blue-500' :
                                    syncStatus === 'error' ? 'bg-red-500' :
                                    'bg-emerald-500'
                                }`} />
                                {syncStatus === 'saving' ? 'Salvando na Nuvem...' :
                                    syncStatus === 'retrying' ? `Reconectando (${retryCount}/3)...` :
                                    syncStatus === 'loading' ? 'Conectando...' :
                                    syncStatus === 'error' ? 'Erro ao Sincronizar' :
                                    'Sincronizado com a Nuvem'}
                            </div>
                            {syncErrorMessage && (
                                <p className="mt-1 text-[9px] text-red-500 px-1 truncate">{syncErrorMessage}</p>
                            )}
                        </div>

                        {/* Navigation Section */}
                        <div className="space-y-3 pt-4 border-t border-slate-100 dark:border-slate-700">
                            <p className="px-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Ações Operacionais</p>

                            {(viewMode === 'month' || viewMode === 'full-month') && isAdminOrAssistant && (
                                <button
                                    onClick={() => { setSelectedApplyMonths([activeMonth]); setApplyTemplateModal(true); setSideMenuOpen(false); }}
                                    className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-900/30 dark:hover:bg-indigo-900/50 transition-all border border-indigo-100 dark:border-indigo-800"
                                >
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" /></svg>
                                    Importar Modelo Padrão
                                </button>
                            )}

                            {currentUser.role !== 'Medico' && currentUser.role !== 'Coordenador' && (
                                <button
                                    onClick={() => { setShowFinancial(true); setSideMenuOpen(false); }}
                                    className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-bold text-emerald-600 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-900/30 dark:hover:bg-emerald-900/50 transition-all border border-emerald-100 dark:border-emerald-800"
                                >
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                    Financeiro
                                </button>
                            )}

                            {isAdminOrAssistant && (
                                <button
                                    onClick={() => { setTimesheetManagerOpen(true); setSideMenuOpen(false); }}
                                    className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/30 dark:hover:bg-blue-900/50 transition-all border border-blue-100 dark:border-blue-800"
                                >
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                    Folhas de Ponto
                                </button>
                            )}

                            {isAdminOrAssistant && (
                                <div className="space-y-1">
                                    <p className="px-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-4 mb-2">Administração</p>
                                    {[
                                        { label: 'Gerenciar Meses', icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z', action: () => setMonthSelectorModal(true) },
                                        { label: 'Hospitais', icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4', action: () => setHospitalManagerOpen(true) },
                                        { label: 'Médicos', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z', action: () => setDoctorsManagerOpen(true) },
                                        { label: 'Config. Empresa', icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m4 0h4', action: () => setCompanySettingsOpen(true) },
                                        { label: 'Regras Financeiras', icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z', action: () => setRulesManagerOpen(true) },
                                        { label: 'Usuários', icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z', action: () => setUsersManagerOpen(true) },
                                        { label: 'Notificações', icon: 'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z', action: () => setNotificationManagerOpen(true) },
                                        { label: 'Histórico de Mudanças', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z', action: () => setHistoryViewerOpen(true) },
                                        { label: 'Backup Banco (Console)', icon: 'M8 16a2 2 0 11-4 0 2 2 0 014 0zm0 0h4a2 2 0 012 2v2a2 2 0 01-2 2H8a2 2 0 01-2-2v-2a2 2 0 012-2zm0 0V8a2 2 0 114 0 2 2 0 01-4 0z', action: () => { console.log("BACKUP DO BANCO:", JSON.stringify(store)); alert("JSON do banco copiado para o Console (F12)."); } }
                                    ].map((item, idx) => (
                                        <button
                                            key={idx}
                                            onClick={() => { item.action(); setSideMenuOpen(false); }}
                                            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all border border-transparent"
                                        >
                                            <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={item.icon} /></svg>
                                            {item.label}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="p-4 border-t border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40">
                        <button
                            onClick={() => { setIsDarkMode(!isDarkMode); setSideMenuOpen(false); }}
                            className="w-full flex items-center justify-between px-3 py-3 rounded-xl text-sm font-bold text-slate-700 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800 transition-all shadow-sm mb-2 border border-slate-100 dark:border-slate-700"
                        >
                            <span className="flex items-center gap-3">
                                {isDarkMode ? (
                                    <svg className="w-5 h-5 text-yellow-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" clipRule="evenodd" /></svg>
                                ) : (
                                    <svg className="w-5 h-5 text-indigo-600" fill="currentColor" viewBox="0 0 20 20"><path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" /></svg>
                                )}
                                {isDarkMode ? 'Modo Claro' : 'Modo Escuro'}
                            </span>
                        </button>
                        <button
                            onClick={handleLogout}
                            className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-black text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all border border-transparent"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                            Sair do Sistema
                        </button>
                    </div>
                </div>
            </div>

            {/* Premium Header / Navbar - COMPACT VERSION */}
            <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-md sticky top-0 z-30 border-b border-slate-200 dark:border-slate-700 shadow-sm flex items-center h-16 sm:h-20 lg:h-16">
                <div className="max-w-[1600px] mx-auto px-4 sm:px-6 w-full flex items-center justify-between gap-4">

                    {/* Left: Hamburger & Brand */}
                    <div className="flex items-center gap-3 sm:gap-4 flex-shrink-0">
                        <button
                            onClick={() => setSideMenuOpen(true)}
                            className="p-2.5 sm:p-3 hover:bg-slate-100 dark:hover:bg-slate-700/60 rounded-xl transition-all text-slate-600 dark:text-slate-300 active:scale-90"
                            title="Menu Principal"
                        >
                            <svg className="w-6 h-6 sm:w-7 sm:h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 6h16M4 12h16M4 18h16" /></svg>
                        </button>
                        <div className="hidden sm:block">
                            <h1 className="text-base lg:text-lg font-black text-slate-800 dark:text-white leading-tight uppercase tracking-tighter">Anest <span className="text-indigo-600">Escl</span></h1>
                        </div>
                    </div>

                    {/* Center: Month Navigation Centerpiece */}
                    <div className="flex items-center gap-1 sm:gap-2 scale-90 sm:scale-100">
                        <div className="flex items-center bg-slate-100/80 dark:bg-slate-900/80 p-0.5 sm:p-1 rounded-xl sm:rounded-2xl border border-slate-200 dark:border-slate-700 shadow-inner">
                            <button
                                onClick={handlePrevMonth}
                                disabled={!hasPrevMonth}
                                className={`p-1.5 sm:p-2 sm:p-2.5 rounded-lg sm:rounded-xl transition-all ${hasPrevMonth
                                    ? 'hover:bg-white dark:hover:bg-slate-800 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400'
                                    : 'opacity-20 cursor-not-allowed text-slate-300'
                                    }`}
                                title="Mês Anterior"
                            >
                                <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" /></svg>
                            </button>

                            <div className="px-2 sm:px-6 text-center min-w-[120px] sm:min-w-[180px]">
                                <h2 className="text-sm sm:text-base lg:text-lg font-black text-slate-800 dark:text-white capitalize truncate max-w-[120px] sm:max-w-none">
                                    {viewMode === 'template' ? 'Modelo Padrão' : getMonthName(activeMonth)}
                                </h2>
                                {viewMode !== 'template' && (
                                    <div className="flex items-center justify-center gap-1 sm:gap-2 mt-0.5">
                                        {viewMode === 'month' ? (
                                            <div className="flex items-center gap-1 sm:gap-2 text-[9px] sm:text-[11px] text-slate-500 bg-white/60 dark:bg-slate-800/60 px-2 sm:px-3 py-0.5 rounded-full border border-slate-200/50 dark:border-slate-700/50">
                                                <button onClick={handlePrevWeek} disabled={currentWeekIndex === 0} className="disabled:opacity-20 font-black">←</button>
                                                <span className="font-bold whitespace-nowrap opacity-80">{getWeekRangeString(currentWeek)}</span>
                                                <button onClick={handleNextWeek} disabled={currentWeekIndex === weeks.length - 1} className="disabled:opacity-20 font-black">→</button>
                                            </div>
                                        ) : (
                                            <span className="text-[9px] sm:text-[10px] text-indigo-600/60 dark:text-indigo-400/60 font-black uppercase tracking-widest translate-y-[-1px]">Mensal</span>
                                        )}
                                    </div>
                                )}
                            </div>

                            <button
                                onClick={handleNextMonth}
                                disabled={!hasNextMonth}
                                className={`p-1.5 sm:p-2 sm:p-2.5 rounded-lg sm:rounded-xl transition-all ${hasNextMonth
                                    ? 'hover:bg-white dark:hover:bg-slate-800 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400'
                                    : 'opacity-20 cursor-not-allowed text-slate-300'
                                    }`}
                                title="Próximo Mês"
                            >
                                <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" /></svg>
                            </button>
                        </div>

                        {isAdminOrAssistant && viewMode !== 'template' && (
                            <button
                                onClick={() => setMonthSelectorModal(true)}
                                className="p-2 sm:p-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl sm:rounded-2xl transition-all shadow-md shadow-indigo-200 dark:shadow-none hidden sm:flex active:scale-95"
                                title="Gerenciar Calendário"
                            >
                                <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                            </button>
                        )}
                    </div>

                    {/* Right: Quick Context / Status */}
                    <div className="flex items-center gap-3 flex-shrink-0">
                        <div className="hidden lg:flex flex-col items-end mr-2">
                            <span className="text-[10px] font-black uppercase text-indigo-600 dark:text-indigo-400 tracking-widest">{currentUser.role}</span>
                            <span className="text-xs font-bold text-slate-400 truncate max-w-[120px]">{currentUser.name}</span>
                        </div>
                        <div className={`w-10 h-10 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center font-black text-sm uppercase ${currentUser.role === 'ADM' ? 'bg-red-100 text-red-600' :
                            currentUser.role === 'Coordenador' ? 'bg-purple-100 text-purple-600' :
                                'bg-blue-100 text-blue-600'
                            }`}>
                            {currentUser.name.charAt(0)}
                        </div>
                    </div>
                </div>
            </div>

            <div className="p-4 md:p-6 max-w-[1600px] mx-auto overflow-x-hidden">

                {viewMode === 'full-month' && (
                    <>
                        {/* Mobile View (List) */}
                        <div className="block md:hidden space-y-8 pb-12">
                            {weeks.map((week, idx) => {
                                const weekData = applyDoctorFilter(getWeekViewData(store.structure, store.months[activeMonth] || {}, week));
                                return (
                                    <div key={'mob-' + idx}>
                                        <div className="flex items-center gap-2 mb-2 px-1">
                                            <h3 className="text-lg font-bold text-slate-700 dark:text-slate-300">
                                                Semana {idx + 1}
                                            </h3>
                                            <span className="text-sm font-normal text-slate-500 dark:text-slate-400">({getWeekRangeString(week)})</span>
                                        </div>
                                        <MobileScheduleView
                                            locations={weekData}
                                            weekDays={week}
                                            currentUser={currentUser}
                                            onCellClick={(l, s, d, a) => handleCellClick(l, s, d, a, idx)}
                                        />
                                    </div>
                                )
                            })}
                        </div>

                        {/* Desktop View (Table) */}
                        <div id="schedule-full-container" className="hidden md:block space-y-8 pb-12">
                            {weeks.map((week, idx) => {
                                const weekData = applyDoctorFilter(getWeekViewData(store.structure, store.months[activeMonth] || {}, week));
                                return (
                                    <div key={idx}>
                                        <div className="flex items-center gap-2 mb-2 px-1">
                                            <h3 className="text-lg font-bold text-slate-700 dark:text-slate-300">
                                                Semana {idx + 1}
                                            </h3>
                                            <span className="text-sm font-normal text-slate-500 dark:text-slate-400">({getWeekRangeString(week)})</span>
                                        </div>
                                        <ScheduleTable
                                            locations={weekData}
                                            weekDays={week}
                                            currentUser={currentUser}
                                            onCellClick={(l, s, d, a) => handleCellClick(l, s, d, a, idx)}
                                            onAddShift={(locationId) => openShiftModal('create', locationId)}
                                            onAddLocation={() => openLocationModal('create')}
                                            onLocationClick={(locId) => openLocationModal('edit', locId)}
                                            onShiftClick={(locId, shiftId) => openShiftModal('edit', locId, shiftId)}
                                            doctors={store.doctors}
                                            onMoveAssignment={(s, t) => handleMoveAssignment(s, t, idx, idx)}
                                            hideFooter={idx !== weeks.length - 1}
                                        />
                                    </div>
                                );
                            })}
                        </div>
                    </>
                )}

                {viewMode === 'month' && (
                    <>
                        <div className="block md:hidden">
                            <MobileScheduleView
                                locations={tableData}
                                weekDays={displayDays}
                                currentUser={currentUser}
                                doctors={store.doctors}
                                onCellClick={handleCellClick}
                            />
                        </div>
                        <div id="schedule-table" className="hidden md:block">
                            <ScheduleTable
                                locations={tableData}
                                weekDays={displayDays}
                                currentUser={currentUser}
                                onCellClick={handleCellClick}
                                onAddShift={(locationId) => openShiftModal('create', locationId)}
                                onAddLocation={() => openLocationModal('create')}
                                onLocationClick={(locId) => openLocationModal('edit', locId)}
                                onShiftClick={(locId, shiftId) => openShiftModal('edit', locId, shiftId)}
                                doctors={store.doctors}
                                onMoveAssignment={(s, t) => handleMoveAssignment(s, t)}
                            />
                        </div>
                    </>
                )}

                {viewMode === 'template' && (
                    <>
                        <div className="block md:hidden">
                            <div className="bg-yellow-50 p-3 mb-4 rounded text-sm text-yellow-800 border border-yellow-200">
                                <strong>Modo Padrão:</strong> Editando o modelo base semanal.
                            </div>
                            <MobileScheduleView
                                locations={tableData}
                                weekDays={displayDays}
                                currentUser={currentUser}
                                doctors={store.doctors}
                                onCellClick={handleCellClick}
                            />
                        </div>
                        <div id="schedule-table" className="hidden md:block">
                            <ScheduleTable
                                locations={tableData}
                                weekDays={displayDays}
                                currentUser={currentUser}
                                onCellClick={handleCellClick}
                                onAddShift={(locationId) => openShiftModal('create', locationId)}
                                onAddLocation={() => openLocationModal('create')}
                                onLocationClick={(locId) => openLocationModal('edit', locId)}
                                onShiftClick={(locId, shiftId) => openShiftModal('edit', locId, shiftId)}
                                doctors={store.doctors}
                                onMoveAssignment={(s, t) => handleMoveAssignment(s, t)}
                            />
                        </div>
                    </>
                )}

                {viewMode === 'unit' && (
                    <div id="unit-view">
                        <UnitView
                            locations={store.structure}
                            monthData={(() => {
                                const rawData = store.months[activeMonth] || {};
                                let targetDoctorId = '';

                                if (currentUser?.role === 'Medico' && currentUser.linkedDoctorId) {
                                    targetDoctorId = currentUser.linkedDoctorId;
                                } else if (currentUser?.role === 'Coordenador' && directorViewMode === 'specific' && directorTargetDoctorId) {
                                    targetDoctorId = directorTargetDoctorId;
                                }

                                if (!targetDoctorId) return rawData;

                                const linkedDoc = store.doctors.find(d => d.id === targetDoctorId);
                                const doctorName = linkedDoc ? linkedDoc.name : (currentUser?.role === 'Medico' ? currentUser.name : '');
                                if (!doctorName) return rawData;

                                // Deep clone and filter
                                const filtered: any = {};
                                Object.entries(rawData).forEach(([locId, shifts]) => {
                                    filtered[locId] = {};
                                    Object.entries(shifts as any).forEach(([shiftId, days]) => {
                                        filtered[locId][shiftId] = {};
                                        Object.entries(days as any).forEach(([dateKey, assignments]) => {
                                            const filteredAssignments = (assignments as any[]).filter(a => a.name === doctorName);
                                            if (filteredAssignments.length > 0) {
                                                filtered[locId][shiftId][dateKey] = filteredAssignments;
                                            }
                                        });
                                    });
                                });
                                return filtered;
                            })()}
                            weeks={weeks}
                            currentUser={currentUser}
                            doctors={store.doctors}
                            onCellClick={handleCellClick}
                        />
                    </div>
                )}
            </div>

            {/* --- MODALS --- */}

            {/* Doctors Manager Modal */}
            <Modal
                isOpen={doctorsManagerOpen}
                onClose={() => setDoctorsManagerOpen(false)}
                title="Cadastro de Médicos"
            >
                <div className="space-y-6">
                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={newDoctorName}
                            onChange={(e) => setNewDoctorName(e.target.value)}
                            placeholder="Nome do Médico"
                            className="flex-1 px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm"
                        />
                        <button
                            onClick={handleAddDoctor}
                            disabled={!newDoctorName.trim()}
                            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium disabled:opacity-50"
                        >
                            Adicionar
                        </button>
                    </div>

                    <div className="border rounded-lg border-slate-200 dark:border-slate-700 overflow-hidden max-h-[50vh] overflow-y-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 uppercase text-xs">
                                <tr>
                                    <th className="px-4 py-2">ID (Sistema)</th>
                                    <th className="px-4 py-2">Apelido (Escala)</th>
                                    <th className="px-4 py-2">Nome Completo</th>
                                    <th className="px-4 py-2">CRM</th>
                                    <th className="px-4 py-2 text-center">Status</th>
                                    <th className="px-4 py-2 text-right">Ação</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                                {(store.doctors || []).map(doc => (
                                    <tr key={doc.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 group">
                                        <td className="px-4 py-2 font-medium">
                                            <input
                                                type="text"
                                                defaultValue={doc.name}
                                                onBlur={(e) => {
                                                    if (e.target.value !== doc.name) {
                                                        handleUpdateDoctorName(doc.id, e.target.value);
                                                    }
                                                }}
                                                className="bg-transparent border-none focus:ring-1 focus:ring-indigo-500 rounded px-1 -ml-1 w-full hover:bg-white dark:hover:bg-slate-600 focus:bg-white dark:focus:bg-slate-600 transition-colors text-xs"
                                            />
                                        </td>
                                        <td className="px-4 py-2">
                                            <input
                                                type="text"
                                                defaultValue={doc.nickname || ''}
                                                placeholder="Apelido"
                                                onBlur={(e) => handleUpdateDoctorNickname(doc.id, e.target.value)}
                                                className="bg-transparent border-none focus:ring-1 focus:ring-indigo-500 rounded px-1 -ml-1 w-full hover:bg-white dark:hover:bg-slate-600 focus:bg-white dark:focus:bg-slate-600 transition-colors text-xs font-bold text-indigo-600 dark:text-indigo-400"
                                            />
                                        </td>
                                        <td className="px-4 py-2">
                                            <input
                                                type="text"
                                                defaultValue={doc.fullName || ''}
                                                placeholder="Nome Completo"
                                                onBlur={(e) => handleUpdateDoctorFullName(doc.id, e.target.value)}
                                                className="bg-transparent border-none focus:ring-1 focus:ring-indigo-500 rounded px-1 -ml-1 w-full hover:bg-white dark:hover:bg-slate-600 focus:bg-white dark:focus:bg-slate-600 transition-colors text-xs"
                                            />
                                        </td>
                                        <td className="px-4 py-2">
                                            <input
                                                type="text"
                                                defaultValue={doc.crm || ''}
                                                placeholder="000000/UF"
                                                onBlur={(e) => handleUpdateDoctorCRM(doc.id, e.target.value)}
                                                className="bg-transparent border-none focus:ring-1 focus:ring-indigo-500 rounded px-1 -ml-1 w-full hover:bg-white dark:hover:bg-slate-600 focus:bg-white dark:focus:bg-slate-600 transition-colors text-xs"
                                            />
                                        </td>
                                        <td className="px-4 py-2">
                                            <input
                                                type="text"
                                                defaultValue={doc.specialty || ''}
                                                placeholder="Especialidade"
                                                onBlur={(e) => handleUpdateDoctorSpecialty(doc.id, e.target.value)}
                                                className="bg-transparent border-none focus:ring-1 focus:ring-indigo-500 rounded px-1 -ml-1 w-full hover:bg-white dark:hover:bg-slate-600 focus:bg-white dark:focus:bg-slate-600 transition-colors text-xs"
                                            />
                                        </td>
                                        <td className="px-4 py-2 text-center">
                                            <button
                                                onClick={() => handleToggleDoctorType(doc.id)}
                                                className={`px-2 py-1 rounded text-xs font-bold transition-colors ${doc.type === 'Normal' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' : 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300'}`}
                                            >
                                                {doc.type}
                                            </button>
                                        </td>
                                        <td className="px-4 py-2 text-right">
                                            <button
                                                onClick={() => handleRemoveDoctor(doc.id)}
                                                className="text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                                                title="Remover médico"
                                            >
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </Modal>

            {/* Rules Manager Modal */}
            <Modal
                isOpen={rulesManagerOpen}
                onClose={() => setRulesManagerOpen(false)}
                title="Configuração de Valores (Regras)"
            >
                <div className="space-y-4">
                    {/* Filter */}
                    <select
                        value={rulesFilter}
                        onChange={(e) => setRulesFilter(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm"
                    >
                        <option value="">Todos os Hospitais</option>
                        {Array.from(new Set(store.financialRules.map(r => r.hospitalName))).sort().map(h => (
                            <option key={h} value={h}>{h}</option>
                        ))}
                    </select>

                    {/* List */}
                    <div className="border rounded-lg border-slate-200 dark:border-slate-700 overflow-hidden max-h-[50vh] overflow-y-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 uppercase text-xs">
                                <tr>
                                    <th className="px-4 py-2">Hospital / Turno</th>
                                    <th className="px-4 py-2 text-right">Valor</th>
                                    <th className="px-4 py-2 w-10"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                                {store.financialRules
                                    .filter(r => !rulesFilter || r.hospitalName === rulesFilter)
                                    .map(rule => (
                                        <tr key={rule.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                                            <td className="px-4 py-2">
                                                <div className="font-medium">{rule.hospitalName}</div>
                                                <div className="text-xs text-slate-500 flex items-center gap-1">
                                                    {rule.shiftName}
                                                    {rule.isDif && <span className="bg-purple-100 text-purple-700 px-1 rounded text-[10px] font-bold">DIF</span>}
                                                </div>
                                            </td>
                                            <td className="px-4 py-2 text-right">
                                                <input
                                                    type="number"
                                                    value={rule.value}
                                                    onChange={(e) => handleUpdateRuleValue(rule.id, parseFloat(e.target.value))}
                                                    className="w-20 text-right px-2 py-1 text-sm border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700"
                                                />
                                            </td>
                                            <td className="px-4 py-2 text-right">
                                                <button
                                                    onClick={() => handleRemoveRule(rule.id)}
                                                    className="text-red-500 hover:text-red-700"
                                                >
                                                    &times;
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Add Rule Form */}
                    <div className="pt-4 border-t border-slate-200 dark:border-slate-700">
                        <h4 className="text-xs uppercase font-bold text-slate-500 mb-2">Adicionar Nova Regra</h4>
                        <div className="grid grid-cols-2 gap-2 mb-2">
                            <input
                                type="text"
                                placeholder="Nome Hospital"
                                value={newRuleForm.hospitalName || ''}
                                onChange={e => setNewRuleForm({ ...newRuleForm, hospitalName: e.target.value })}
                                className="px-2 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700"
                            />
                            <input
                                type="text"
                                placeholder="Nome Turno"
                                value={newRuleForm.shiftName || ''}
                                onChange={e => setNewRuleForm({ ...newRuleForm, shiftName: e.target.value })}
                                className="px-2 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700"
                            />
                        </div>
                        <div className="flex gap-2 items-center">
                            <input
                                type="number"
                                placeholder="Valor (R$)"
                                value={newRuleForm.value || ''}
                                onChange={e => setNewRuleForm({ ...newRuleForm, value: parseFloat(e.target.value) })}
                                className="w-24 px-2 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700"
                            />
                            <label className="flex items-center gap-1 text-sm cursor-pointer select-none">
                                <input
                                    type="checkbox"
                                    checked={newRuleForm.isDif || false}
                                    onChange={e => setNewRuleForm({ ...newRuleForm, isDif: e.target.checked })}
                                    className="rounded text-purple-600"
                                />
                                <span className="font-medium text-purple-700 dark:text-purple-300">DIF?</span>
                            </label>
                            <button
                                onClick={handleAddRule}
                                disabled={!newRuleForm.hospitalName || !newRuleForm.shiftName || !newRuleForm.value}
                                className="ml-auto px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-sm font-medium disabled:opacity-50"
                            >
                                Adicionar
                            </button>
                        </div>
                    </div>
                </div>
            </Modal>

            {/* Location (Hospital) Editor Modal */}
            <Modal
                isOpen={!!locationModal?.isOpen}
                onClose={() => setLocationModal(null)}
                title={locationModal?.mode === 'create' ? "Adicionar Hospital" : "Editar Hospital"}
            >
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Nome do Hospital</label>
                        <input
                            type="text"
                            value={locationForm.name}
                            onChange={e => setLocationForm(prev => ({ ...prev, name: e.target.value }))}
                            className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
                            placeholder="Ex: Santa Casa"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Apelido (Escala)</label>
                        <input
                            type="text"
                            value={locationForm.nickname}
                            onChange={e => setLocationForm(prev => ({ ...prev, nickname: e.target.value }))}
                            className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
                            placeholder="Ex: SC"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Logo do Hospital (JPG/PNG)</label>
                        <div className="flex items-center gap-3">
                            {locationForm.logo && (
                                <img src={locationForm.logo} alt="Logo" className="w-12 h-12 rounded object-contain bg-white border" />
                            )}
                            <input
                                type="file"
                                accept="image/*"
                                onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) {
                                        const reader = new FileReader();
                                        reader.onloadend = () => {
                                            setLocationForm(prev => ({ ...prev, logo: reader.result as string }));
                                        };
                                        reader.readAsDataURL(file);
                                    }
                                }}
                                className="text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 transition-all"
                            />
                            {locationForm.logo && (
                                <button
                                    onClick={() => setLocationForm(prev => ({ ...prev, logo: '' }))}
                                    className="p-2 text-red-500 hover:bg-red-50 rounded"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                </button>
                            )}
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Cor do Tema</label>
                        <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                            {AVAILABLE_THEMES.map(theme => {
                                const style = getThemeStyles(theme);
                                return (
                                    <button
                                        key={theme}
                                        onClick={() => setLocationForm(prev => ({ ...prev, theme }))}
                                        className={`
w - full h - 10 rounded - lg border - 2 flex items - center justify - center transition - all
                                    ${style.primaryBg} 
                                    ${locationForm.theme === theme ? 'border-white dark:border-white ring-2 ring-slate-400 dark:ring-slate-500 scale-110' : 'border-transparent opacity-80 hover:opacity-100'}
`}
                                        title={theme}
                                    >
                                        {locationForm.theme === theme && (
                                            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div className="flex justify-between pt-4 border-t border-slate-100 dark:border-slate-700 mt-4">
                        <div>
                            {locationModal?.mode === 'edit' && (
                                <button
                                    onClick={handleDeleteLocation}
                                    className="px-4 py-2 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg text-sm font-medium transition-colors"
                                >
                                    Excluir Hospital
                                </button>
                            )}
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setLocationModal(null)}
                                className="px-4 py-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-sm font-medium"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleSaveLocation}
                                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium disabled:opacity-50"
                                disabled={!locationForm.name}
                            >
                                Salvar
                            </button>
                        </div>
                    </div>
                </div>
            </Modal>

            {/* Shift Editor Modal */}
            <Modal
                isOpen={!!shiftModal?.isOpen}
                onClose={() => setShiftModal(null)}
                title={shiftModal?.mode === 'create' ? "Adicionar Turno" : "Editar Turno"}
            >
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Nome do Turno</label>
                        <input
                            type="text"
                            value={shiftForm.name}
                            onChange={e => setShiftForm(prev => ({ ...prev, name: e.target.value }))}
                            className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
                            placeholder="Ex: Diurno, Noturno, Extra"
                            autoFocus
                        />
                    </div>

                    <div className="flex justify-between pt-4 border-t border-slate-100 dark:border-slate-700 mt-4">
                        <div>
                            {shiftModal?.mode === 'edit' && (
                                <button
                                    onClick={handleDeleteShift}
                                    className="px-4 py-2 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg text-sm font-medium transition-colors"
                                >
                                    Excluir Turno
                                </button>
                            )}
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setShiftModal(null)}
                                className="px-4 py-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-sm font-medium"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleSaveShift}
                                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium disabled:opacity-50"
                                disabled={!shiftForm.name}
                            >
                                Salvar
                            </button>
                        </div>
                    </div>
                </div>
            </Modal>

            {/* Assignment Editor Modal (Updated with Doctor Select) */}
            <Modal
                isOpen={!!editingCell}
                onClose={() => setEditingCell(null)}
                title={editingCell?.assignmentIndex !== undefined ? "Editar Plantão" : "Novo Plantão"}
            >
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Nome do Médico</label>
                        {/* Replaced Input with Select */}
                        <select
                            value={editForm.name || ''}
                            onChange={e => handleDoctorChange(e.target.value)}
                            disabled={currentUser?.role === 'Assistente'}
                            className={`w - full px - 3 py - 2 border border - slate - 300 dark: border - slate - 600 rounded - lg text - slate - 900 dark: text - white focus: ring - 2 focus: ring - indigo - 500 ${currentUser?.role === 'Assistente'
                                ? 'bg-slate-100 dark:bg-slate-800 opacity-75 cursor-not-allowed'
                                : 'bg-white dark:bg-slate-700'
                                } `}
                            autoFocus={currentUser?.role !== 'Assistente'}
                        >
                            <option value="">Selecione um médico...</option>
                            {store.doctors && store.doctors.length > 0 ? (
                                store.doctors.sort((a, b) => a.name.localeCompare(b.name)).map(doc => (
                                    <option key={doc.id} value={doc.name}>{doc.name}</option>
                                ))
                            ) : (
                                <option value="" disabled>Nenhum médico cadastrado</option>
                            )}
                        </select>
                        {currentUser?.role === 'Assistente' && (
                            <p className="text-xs text-orange-500 mt-1">Assistentes não podem alterar o médico escalado.</p>
                        )}
                        {(!store.doctors || store.doctors.length === 0) && (
                            <p className="text-xs text-red-500 mt-1">Cadastre médicos no menu principal antes de escalar.</p>
                        )}
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Subtítulo / Especialidade</label>
                        <input
                            type="text"
                            value={editForm.subName || ''}
                            onChange={e => setEditForm(prev => ({ ...prev, subName: e.target.value }))}
                            className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
                        />
                    </div>

                    {/* NEW: Período (Shift/Rule Type Selection) */}
                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Período (Regra)</label>
                        <select
                            value={editForm.period || ''}
                            onChange={e => handlePeriodChange(e.target.value)}
                            className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
                        >
                            <option value="">Selecione um período...</option>
                            {availablePeriods.map(p => (
                                <option key={p} value={p}>{p}</option>
                            ))}
                        </select>
                        <p className="text-[10px] text-slate-400 mt-1">Selecione para preencher horário e valor automaticamente.</p>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Horário</label>
                        <input
                            type="text"
                            value={editForm.time || ''}
                            onChange={e => setEditForm(prev => ({ ...prev, time: e.target.value }))}
                            placeholder="Ex: 07-19h"
                            className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
                        />
                    </div>

                    <div className="flex gap-4">
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" checked={editForm.isBold || false} onChange={e => setEditForm(prev => ({ ...prev, isBold: e.target.checked }))} className="rounded text-indigo-600" />
                            <span className="text-sm font-bold">Negrito</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" checked={editForm.isRed || false} onChange={e => setEditForm(prev => ({ ...prev, isRed: e.target.checked }))} className="rounded text-red-600" />
                            <span className="text-sm text-red-600 font-medium">Vermelho</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" checked={editForm.isFlagged || false} onChange={e => setEditForm(prev => ({ ...prev, isFlagged: e.target.checked }))} className="rounded text-amber-500" />
                            <span className="text-sm text-amber-600">Sinalizar</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" checked={editForm.isVerified || false} onChange={e => setEditForm(prev => ({ ...prev, isVerified: e.target.checked }))} className="rounded text-emerald-500" />
                            <span className="text-sm text-emerald-600">Verificado</span>
                        </label>
                    </div>

                    <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
                        <h4 className="text-xs uppercase font-bold text-slate-500 mb-2">Financeiro</h4>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">Valor Plantão (R$)</label>
                                <input
                                    type="number"
                                    value={editForm.value || ''}
                                    onChange={e => setEditForm(prev => ({ ...prev, value: parseFloat(e.target.value) || 0 }))}
                                    className="w-full px-2 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700"
                                    placeholder="Calculado Auto."
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">Valor Extra (R$)</label>
                                <input
                                    type="number"
                                    value={editForm.extraValue || ''}
                                    onChange={e => setEditForm(prev => ({ ...prev, extraValue: parseFloat(e.target.value) || 0 }))}
                                    className="w-full px-2 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700"
                                />
                                <p className="text-[10px] text-slate-400 mt-0.5">Use valores negativos (ex: -100) para descontos.</p>
                            </div>
                        </div>
                        <div className="mt-2">
                            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">Observações / Motivo Extra</label>
                            <input
                                type="text"
                                value={editForm.extraValueReason || editForm.note || ''}
                                onChange={e => setEditForm(prev => ({ ...prev, extraValueReason: e.target.value, note: e.target.value }))}
                                className="w-full px-2 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700"
                            />
                        </div>
                    </div>

                    <div className="flex justify-end gap-2 pt-4 border-t border-slate-100 dark:border-slate-700 mt-4">
                        {editingCell?.assignmentIndex !== undefined && (
                            <button
                                onClick={handleDeleteAssignment}
                                className="px-4 py-2 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg text-sm font-medium mr-auto"
                            >
                                Excluir
                            </button>
                        )}
                        <button
                            onClick={() => setEditingCell(null)}
                            className="px-4 py-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-sm font-medium"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={handleSaveAssignment}
                            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium"
                        >
                            Salvar
                        </button>
                    </div>
                </div>
            </Modal>

            {/* Apply Template Modal */}
            <Modal
                isOpen={applyTemplateModal}
                onClose={() => setApplyTemplateModal(false)}
                title="Aplicar Modelo Padrão"
            >
                <div className="space-y-6">
                    <div>
                        <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                            Selecione os meses nos quais deseja aplicar o modelo semanal padrão:
                        </p>

                        <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1">
                            {Object.keys(store.months).sort().reverse().map(mKey => (
                                <label key={mKey} className="flex items-center gap-3 p-2 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg cursor-pointer transition-colors">
                                    <input
                                        type="checkbox"
                                        checked={selectedApplyMonths.includes(mKey)}
                                        onChange={(e) => {
                                            if (e.target.checked) {
                                                setSelectedApplyMonths([...selectedApplyMonths, mKey]);
                                            } else {
                                                setSelectedApplyMonths(selectedApplyMonths.filter(m => m !== mKey));
                                            }
                                        }}
                                        className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                                    />
                                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                                        {getMonthName(mKey)}
                                    </span>
                                </label>
                            ))}
                        </div>

                        <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-700">
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Adicionar Outro Mês</label>
                            <div className="flex gap-2">
                                <input
                                    type="month"
                                    className="flex-1 px-3 py-1.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-sm"
                                    onChange={(e) => {
                                        if (e.target.value && !selectedApplyMonths.includes(e.target.value)) {
                                            setSelectedApplyMonths([...selectedApplyMonths, e.target.value]);
                                        }
                                    }}
                                />
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-col gap-2 pt-4 border-t border-slate-100 dark:border-slate-700">
                        <button
                            onClick={() => handleApplyTemplate('fill_empty')}
                            disabled={selectedApplyMonths.length === 0}
                            className="w-full py-2.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300 rounded-lg text-sm font-bold transition-all disabled:opacity-50"
                        >
                            Apenas Preencher Vazios ({selectedApplyMonths.length})
                        </button>
                        <button
                            onClick={() => {
                                if (confirm(`ATENÇÃO: Isso irá APAGAR as escalas manuais dos ${selectedApplyMonths.length} meses selecionados e substituir pelo padrão.Continuar ? `)) {
                                    handleApplyTemplate('overwrite');
                                }
                            }}
                            disabled={selectedApplyMonths.length === 0}
                            className="w-full py-2.5 bg-red-50 hover:bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 rounded-lg text-sm font-bold transition-all disabled:opacity-50"
                        >
                            Sobrescrever Tudo ({selectedApplyMonths.length})
                        </button>
                        <button
                            onClick={() => setApplyTemplateModal(false)}
                            className="w-full py-2.5 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 text-sm font-medium transition-colors mt-2"
                        >
                            Cancelar
                        </button>
                    </div>
                </div>
            </Modal>

            {/* Month Selector Modal */}
            <Modal
                isOpen={monthSelectorModal}
                onClose={() => setMonthSelectorModal(false)}
                title="Navegar ou Criar Mês"
            >
                <div className="space-y-6">
                    <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700">
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Novo Mês / Ir Para</label>
                        <div className="flex gap-2">
                            <input
                                type="month"
                                value={monthInput}
                                onChange={(e) => setMonthInput(e.target.value)}
                                className="flex-1 px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm"
                            />
                            <button
                                onClick={() => handleCreateMonth(monthInput)}
                                disabled={!monthInput}
                                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium disabled:opacity-50"
                            >
                                Criar/Ir
                            </button>
                        </div>
                        <p className="text-[10px] text-slate-500 mt-2">
                            Se o mês selecionado não existir, ele será criado automaticamente usando o modelo padrão.
                        </p>
                    </div>

                    <div>
                        <h4 className="text-xs uppercase font-bold text-slate-500 mb-2">Meses Existentes</h4>
                        <div className="grid grid-cols-1 gap-2 max-h-[300px] overflow-y-auto pr-1 custom-scrollbar">
                            {Object.keys(store.months).sort().reverse().map(mKey => (
                                <div key={mKey} className="flex gap-2 group">
                                    <button
                                        onClick={() => { setActiveMonth(mKey); setMonthSelectorModal(false); }}
                                        className={`flex-1 px-4 py-3 text-sm rounded-xl border text-left transition-all ${activeMonth === mKey
                                            ? 'bg-indigo-50 border-indigo-200 text-indigo-700 dark:bg-indigo-900/30 dark:border-indigo-800 dark:text-indigo-300 font-bold shadow-sm'
                                            : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700'
                                            }`}
                                    >
                                        <div className="flex justify-between items-center">
                                            <span>{getMonthName(mKey)}</span>
                                            {activeMonth === mKey && <span className="text-[10px] bg-indigo-600 text-white px-1.5 py-0.5 rounded-full uppercase">Ativo</span>}
                                        </div>
                                    </button>
                                    {isAdminOrAssistant && (
                                        <button
                                            onClick={() => setDeleteMonthModal(mKey)}
                                            className="px-3 bg-red-50 hover:bg-red-100 text-red-600 border border-red-100 rounded-xl transition-all opacity-0 group-hover:opacity-100"
                                            title="Excluir Mês"
                                        >
                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </Modal>

            {/* Delete Month Modal */}
            <Modal
                isOpen={!!deleteMonthModal}
                onClose={() => setDeleteMonthModal(null)}
                title="Excluir Mês"
            >
                <div className="space-y-4">
                    <p className="text-slate-600 dark:text-slate-300">
                        Tem certeza que deseja excluir todos os dados de <span className="font-bold">{deleteMonthModal ? getMonthName(deleteMonthModal) : ''}</span>?
                        Esta ação não pode ser desfeita.
                    </p>
                    <div className="flex justify-end gap-2">
                        <button
                            onClick={() => setDeleteMonthModal(null)}
                            className="px-4 py-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-sm font-medium"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={() => deleteMonthModal && handleDeleteMonth(deleteMonthModal)}
                            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium"
                        >
                            Confirmar Exclusão
                        </button>
                    </div>
                </div>
            </Modal>

            {/* Hospital Manager Modal */}
            <Modal
                isOpen={hospitalManagerOpen}
                onClose={() => setHospitalManagerOpen(false)}
                title="Cadastro de Hospitais"
            >
                <div className="space-y-6">
                    <div className="flex justify-between items-center bg-indigo-50 dark:bg-indigo-900/20 p-4 rounded-lg border border-indigo-100 dark:border-indigo-900/30">
                        <div>
                            <h3 className="font-semibold text-indigo-900 dark:text-indigo-100">Adicionar Novo Hospital</h3>
                            <p className="text-xs text-indigo-600 dark:text-indigo-300">Cadastre um novo local para usar na escala.</p>
                        </div>
                        <button
                            onClick={() => {
                                setHospitalManagerOpen(false); // Close manager
                                openLocationModal('create'); // Open create modal
                            }}
                            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium shadow-sm transition-colors flex items-center gap-2"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                            Novo Hospital
                        </button>
                    </div>

                    <div className="border rounded-lg border-slate-200 dark:border-slate-700 overflow-hidden max-h-[50vh] overflow-y-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 uppercase text-xs">
                                <tr>
                                    <th className="px-4 py-2">Hospital</th>
                                    <th className="px-4 py-2 text-center">Cor (Tema)</th>
                                    <th className="px-4 py-2 text-center">Turnos</th>
                                    <th className="px-4 py-2 text-right">Ação</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                                {(store.structure || []).map(loc => {
                                    // Use styled component logic approx for preview
                                    const themeStyle = getThemeStyles(loc.theme);

                                    return (
                                        <tr key={loc.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                                            <td className="px-4 py-2 font-medium text-slate-800 dark:text-slate-100">{loc.name}</td>
                                            <td className="px-4 py-2 text-center">
                                                <span className={`inline - block px - 2 py - 1 rounded text - xs font - semibold capitalize ${themeStyle.primaryBg} ${themeStyle.primaryText} `}>
                                                    {loc.theme}
                                                </span>
                                            </td>
                                            <td className="px-4 py-2 text-center text-slate-500">
                                                {loc.shifts.length}
                                            </td>
                                            <td className="px-4 py-2 text-right">
                                                <div className="flex justify-end gap-1">
                                                    <button
                                                        onClick={() => {
                                                            setHospitalManagerOpen(false);
                                                            openLocationModal('edit', loc.id);
                                                        }}
                                                        className="p-1.5 text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded transition-colors"
                                                        title="Editar Hospital"
                                                    >
                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                                    </button>
                                                    <button
                                                        onClick={() => {
                                                            // We need to set the modal data to delete correctly
                                                            setLocationModal({ isOpen: false, mode: 'edit', data: loc });
                                                            // Delay slightly to allow state to set? No, handleDeleteLocation relies on locationModal state.
                                                            // Actually handleDeleteLocation checks locationModal.data.
                                                            // But handleDeleteLocation confirms with user.
                                                            // It's safer to just set the state and then call delete? 
                                                            // Or better: Re-use the delete logic but we need to trigger the confirmation.

                                                            if (confirm(`Tem certeza que deseja remover o hospital "${loc.name}" ? `)) {
                                                                setStore(prev => ({
                                                                    ...prev,
                                                                    structure: prev.structure.filter(l => l.id !== loc.id)
                                                                }));
                                                            }
                                                        }}
                                                        className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition-colors"
                                                        title="Excluir Hospital"
                                                    >
                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                                {store.structure.length === 0 && (
                                    <tr>
                                        <td colSpan={4} className="px-4 py-8 text-center text-slate-500">Nenhum hospital cadastrado.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </Modal>
            {/* User Manager Modal */}
            {/* User Manager Modal (Refactored) */}
            <UsersManager
                isOpen={usersManagerOpen}
                onClose={() => setUsersManagerOpen(false)}
                store={store}
            />

            {/* History Viewer Modal */}
            <HistoryViewer
                isOpen={historyViewerOpen}
                onClose={() => setHistoryViewerOpen(false)}
                store={store}
                currentUser={currentUser}
                onRevert={handleRevertHistory}
            />

            {/* Notification Manager Modal */}
            <NotificationManager
                isOpen={notificationManagerOpen}
                onClose={() => setNotificationManagerOpen(false)}
                store={store}
                onUpdateDoctor={handleUpdateDoctorNotification}
                onUpdateSettings={handleUpdateNotificationSettings}
            />

            {/* Timesheet Manager Modal */}
            <Modal
                isOpen={timesheetManagerOpen}
                onClose={() => setTimesheetManagerOpen(false)}
                title="Gerenciador de Folhas de Ponto"
                maxWidth="max-w-7xl"
            >
                <div className="h-[85vh]">
                    <TimesheetManager
                        store={store}
                        setStore={setStore}
                        onClose={() => setTimesheetManagerOpen(false)}
                    />
                </div>
            </Modal>

            {/* Company Settings Modal */}
            <Modal
                isOpen={companySettingsOpen}
                onClose={() => setCompanySettingsOpen(false)}
                title="Configurações da Empresa"
            >
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Nome da Empresa</label>
                        <input
                            type="text"
                            value={companyForm.name}
                            onChange={e => setCompanyForm(prev => ({ ...prev, name: e.target.value }))}
                            className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
                            placeholder="Ex: ISM HEALTH SOLUTIONS"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">CNPJ</label>
                        <input
                            type="text"
                            value={companyForm.cnpj}
                            onChange={e => setCompanyForm(prev => ({ ...prev, cnpj: e.target.value }))}
                            className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
                            placeholder="00.000.000/0000-00"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Logo 1 (Primária)</label>
                            <div className="space-y-2">
                                {companyForm.logo1 && (
                                    <img src={companyForm.logo1} alt="Logo 1" className="w-full h-20 rounded object-contain bg-white border" />
                                )}
                                <input
                                    type="file"
                                    accept="image/*"
                                    onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file) {
                                            const reader = new FileReader();
                                            reader.onloadend = () => {
                                                setCompanyForm(prev => ({ ...prev, logo1: reader.result as string }));
                                            };
                                            reader.readAsDataURL(file);
                                        }
                                    }}
                                    className="text-xs text-slate-500 w-full"
                                />
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Logo 2 (Secundária)</label>
                            <div className="space-y-2">
                                {companyForm.logo2 && (
                                    <img src={companyForm.logo2} alt="Logo 2" className="w-full h-20 rounded object-contain bg-white border" />
                                )}
                                <input
                                    type="file"
                                    accept="image/*"
                                    onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file) {
                                            const reader = new FileReader();
                                            reader.onloadend = () => {
                                                setCompanyForm(prev => ({ ...prev, logo2: reader.result as string }));
                                            };
                                            reader.readAsDataURL(file);
                                        }
                                    }}
                                    className="text-xs text-slate-500 w-full"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="flex justify-end gap-2 pt-4 border-t border-slate-100 dark:border-slate-700">
                        <button
                            onClick={() => setCompanySettingsOpen(false)}
                            className="px-4 py-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-sm font-medium"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={handleSaveCompanySettings}
                            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium"
                        >
                            Salvar Configurações
                        </button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};

export default App;
