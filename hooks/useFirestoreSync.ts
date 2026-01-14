import React, { useEffect, useState, useRef, useCallback } from 'react';
import { doc, onSnapshot, setDoc, collection, query, limit, orderBy } from 'firebase/firestore';
import { db } from '../services/firebase';
import { ScheduleStore, User } from '../types';
import { initializeStore } from '../utils/scheduleManager';

// Configurações de retry
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;
const MAX_USERS_PER_PAGE = 100;

// Helper to recursively remove undefined values (Firestore doesn't support them)
const sanitizeForFirestore = (obj: any): any => {
    if (Array.isArray(obj)) {
        return obj.map(v => sanitizeForFirestore(v));
    } else if (obj !== null && typeof obj === 'object') {
        const newObj: any = {};
        Object.keys(obj).forEach(key => {
            const val = obj[key];
            if (val !== undefined) {
                newObj[key] = sanitizeForFirestore(val);
            }
        });
        return newObj;
    }
    return obj;
};

// Helper para delay em retry
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const useFirestoreSync = (
    currentUser: User | null,
    setStore: React.Dispatch<React.SetStateAction<ScheduleStore>>
) => {
    const [status, setStatus] = useState<'idle' | 'loading' | 'saving' | 'error' | 'retrying'>('idle');
    const [lastRemoteUpdate, setLastRemoteUpdate] = useState<number>(0);
    const [remoteStoreData, setRemoteStoreData] = useState<ScheduleStore | null>(null);
    const [remoteUsers, setRemoteUsers] = useState<User[]>([]);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [isSynced, setIsSynced] = useState(false);
    const [retryCount, setRetryCount] = useState(0);

    const ignoreNextLocalUpdate = useRef(false);

    // 1. Listen to Schedule Store (Main Data)
    useEffect(() => {
        if (!currentUser) return;

        setStatus('loading');
        setErrorMessage(null);
        const docRef = doc(db, 'app_data', 'schedule_store_v1');

        const unsubscribe = onSnapshot(docRef, (snapshot) => {
            // Ignore updates that were originated locally until they are fully written
            if (snapshot.metadata.hasPendingWrites) return;

            if (snapshot.exists()) {
                const remoteData = snapshot.data();
                let loadedData: any = null;

                // 1. Try standard wrapped format
                if (remoteData && remoteData.data) {
                    console.log("[Sync] Data found in standard format.");
                    loadedData = remoteData.data;
                }
                // 2. Fallback: Try unwrapped format (root level properties)
                else if (remoteData && (remoteData.doctors || remoteData.months || remoteData.structure)) {
                    console.warn("[Sync] Data found in unwrapped format. Migrating...");
                    loadedData = remoteData;
                }
                // 3. Last Resort: Corrupted Doctor List Dump
                else if (remoteData) {
                    console.warn("[Sync] Data mismatch. Attempting recovery from potential doctor list dump...");
                    const potentialDoctors = Object.values(remoteData).filter((v: any) => v && typeof v === 'object' && v.name && v.type);

                    if (potentialDoctors.length > 0) {
                        console.warn(`[Sync] Recovered ${potentialDoctors.length} doctors from raw dump. Reinitializing structure.`);
                        loadedData = {
                            ...initializeStore(),
                            doctors: potentialDoctors,
                        };
                    } else {
                        console.error("[Sync] Could not recover any valid data structure.");
                    }
                }

                if (loadedData) {
                    // Compatibility: Map legacy logo fields if new ones are missing
                    if (loadedData.companySettings) {
                        if (loadedData.companySettings.mainLogoBase64 && !loadedData.companySettings.logo1) {
                            loadedData.companySettings.logo1 = loadedData.companySettings.mainLogoBase64;
                        }
                        if (loadedData.companySettings.secondaryLogoBase64 && !loadedData.companySettings.logo2) {
                            loadedData.companySettings.logo2 = loadedData.companySettings.secondaryLogoBase64;
                        }
                    }

                    setRemoteStoreData(loadedData as ScheduleStore);
                    setLastRemoteUpdate(Date.now());
                }
            } else {
                console.log("Remote store not found.");
            }
            setStatus('idle');
            setIsSynced(true);
        }, (error) => {
            console.error("Firestore sync error:", error);
            setErrorMessage(error.message);
            setStatus('error');
        });

        return () => unsubscribe();
    }, [currentUser]);

    // 2. Listen to User Profiles (Users Data) - Com paginação
    useEffect(() => {
        if (!currentUser) return;

        // Query com limite para paginação
        const colRef = collection(db, 'user_profiles');
        const usersQuery = query(
            colRef,
            orderBy('name'),
            limit(MAX_USERS_PER_PAGE)
        );

        const unsubscribe = onSnapshot(usersQuery, (snapshot) => {
            const users: User[] = snapshot.docs.map(d => {
                const data = d.data();
                return {
                    id: d.id,
                    username: data.email || data.username || 'unknown',
                    name: data.name || 'Unknown',
                    role: data.role || 'Medico',
                    linkedDoctorId: data.linkedDoctorId || null
                } as User;
            });
            setRemoteUsers(users);
        }, (error) => {
            console.error("Users sync error:", error);
        });

        return () => unsubscribe();
    }, [currentUser]);

    const isFirstLoad = useRef(true);
    const lastAppliedRemoteData = useRef<string>('');

    // 3. Merge and Update Store
    useEffect(() => {
        if (remoteStoreData) {
            const remoteDataString = JSON.stringify(remoteStoreData);

            if (isFirstLoad.current) {
                // Initial load: prioritize remote data
                setStore(prev => ({
                    ...remoteStoreData,
                    users: remoteUsers.length > 0 ? remoteUsers : (remoteStoreData.users || [])
                }));
                lastAppliedRemoteData.current = remoteDataString;
                isFirstLoad.current = false;
            } else if (status !== 'saving' && status !== 'loading' && status !== 'retrying') {
                // Subsequent updates: only apply if data actually changed
                if (remoteDataString !== lastAppliedRemoteData.current) {
                    setStore(prev => ({
                        ...remoteStoreData,
                        users: remoteUsers.length > 0 ? remoteUsers : (remoteStoreData.users || [])
                    }));
                    lastAppliedRemoteData.current = remoteDataString;
                }
            }
        }
    }, [remoteStoreData, remoteUsers, setStore, status]);


    const lastSavedDataRef = useRef<string>('');
    const saveInFlightRef = useRef(false);
    const queuedStoreRef = useRef<ScheduleStore | null>(null);
    const queuedStoreStringRef = useRef<string>('');

    // Função auxiliar para executar o save com retry
    const executeWithRetry = useCallback(async (
        cleanData: any,
        stringified: string,
        attempt: number = 1
    ): Promise<boolean> => {
        try {
            const docRef = doc(db, 'app_data', 'schedule_store_v1');
            await setDoc(docRef, { data: cleanData });
            lastSavedDataRef.current = stringified;
            setRetryCount(0);
            return true;
        } catch (error: any) {
            console.error(`[Sync] Save attempt ${attempt} failed:`, error);

            // Verifica se é um erro de rede ou temporário
            const isRetryableError =
                error.code === 'unavailable' ||
                error.code === 'deadline-exceeded' ||
                error.code === 'resource-exhausted' ||
                error.message?.includes('network') ||
                error.message?.includes('timeout');

            if (isRetryableError && attempt < MAX_RETRIES) {
                setStatus('retrying');
                setRetryCount(attempt);
                const backoffDelay = RETRY_DELAY_MS * Math.pow(2, attempt - 1); // Exponential backoff
                console.log(`[Sync] Retrying in ${backoffDelay}ms (attempt ${attempt + 1}/${MAX_RETRIES})...`);
                await delay(backoffDelay);
                return executeWithRetry(cleanData, stringified, attempt + 1);
            }

            throw error;
        }
    }, []);

    // Save Function com fila e retry
    const saveToFirestore = useCallback(async (newStore: ScheduleStore) => {
        if (!currentUser) return;

        // GUARD: Error Proofing - Prevent saving if the store looks catastrophically empty
        if (!newStore.structure || newStore.structure.length === 0) {
            console.error("CRITICAL: Attempted to save invalid store (no structure). Blocked to prevent data loss.");
            return;
        }

        // Normalize data before comparing/saving
        const cleanData = sanitizeForFirestore(newStore);
        const stringified = JSON.stringify(cleanData);

        // Optimization: Don't save if data is identical to last save
        if (stringified === lastSavedDataRef.current) return;

        // Se já existe um save em andamento, adiciona à fila
        if (saveInFlightRef.current) {
            queuedStoreRef.current = newStore;
            queuedStoreStringRef.current = stringified;
            console.log("[Sync] Save queued (another save in progress)");
            return;
        }

        try {
            saveInFlightRef.current = true;
            setStatus('saving');
            setErrorMessage(null);

            // Executa o save com retry automático
            await executeWithRetry(cleanData, stringified);

            setStatus('idle');
        } catch (error: any) {
            console.error("Error saving to Firestore:", error);
            setErrorMessage(`Erro ao salvar: ${error.message}. Tente novamente.`);
            setStatus('error');
        } finally {
            saveInFlightRef.current = false;

            // Processa a fila se houver dados pendentes
            if (queuedStoreRef.current && queuedStoreStringRef.current !== lastSavedDataRef.current) {
                const queuedStore = queuedStoreRef.current;
                queuedStoreRef.current = null;
                queuedStoreStringRef.current = '';
                console.log("[Sync] Processing queued save...");
                // Chama recursivamente para processar o item da fila
                saveToFirestore(queuedStore);
            }
        }
    }, [currentUser, executeWithRetry]);

    return { status, errorMessage, saveToFirestore, isSynced, retryCount };
};
