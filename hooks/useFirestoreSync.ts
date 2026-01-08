import React, { useEffect, useState, useRef, useCallback } from 'react';
import { doc, onSnapshot, setDoc, getDoc, collection } from 'firebase/firestore';
import { db } from '../services/firebase';
import { ScheduleStore, User } from '../types';
import { initializeStore } from '../utils/scheduleManager';

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

export const useFirestoreSync = (
    currentUser: User | null,
    setStore: React.Dispatch<React.SetStateAction<ScheduleStore>>
) => {
    const [status, setStatus] = useState<'idle' | 'loading' | 'saving' | 'error'>('idle');
    const [lastRemoteUpdate, setLastRemoteUpdate] = useState<number>(0);
    const [remoteStoreData, setRemoteStoreData] = useState<ScheduleStore | null>(null);
    const [remoteUsers, setRemoteUsers] = useState<User[]>([]);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [isSynced, setIsSynced] = useState(false);

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
                // This handles cases where data was restored directly to the document root
                else if (remoteData && (remoteData.doctors || remoteData.months || remoteData.structure)) {
                    console.warn("[Sync] Data found in unwrapped format. Migrating...");
                    loadedData = remoteData;
                }
                // 3. Last Resort: Corrupted Doctor List Dump
                // Screenshot shows root has 'id', 'name', 'type' (single doctor?) + numeric keys.
                else if (remoteData) {
                    console.warn("[Sync] Data mismatch. Attempting recovery from potential doctor list dump...");
                    // It seems the DB was overwritten with just the doctors list or a single doctor object mixed with others.
                    // We try to salvage the values as doctors.
                    const potentialDoctors = Object.values(remoteData).filter((v: any) => v && typeof v === 'object' && v.name && v.type);

                    if (potentialDoctors.length > 0) {
                        console.warn(`[Sync] Recoverd ${potentialDoctors.length} doctors from raw dump. Reinitializing structure.`);
                        loadedData = {
                            ...initializeStore(),
                            doctors: potentialDoctors,
                            // We preserve defaults for everything else since they are missing
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

    // 2. Listen to User Profiles (Users Data)
    useEffect(() => {
        if (!currentUser) return;

        const colRef = collection(db, 'user_profiles');
        const unsubscribe = onSnapshot(colRef, (snapshot) => {
            const users: User[] = snapshot.docs.map(d => {
                const data = d.data();
                return {
                    id: d.id,
                    username: data.email || data.username || 'unknown',
                    name: data.name || 'Unknown',
                    role: data.role || 'Medico',
                    linkedDoctorId: data.linkedDoctorId || null
                } as any; // Cast safely or fix types.ts
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
            } else if (status !== 'saving' && status !== 'loading') {
                // Subsequent updates: only apply if data actually changed from what we last applied
                // This prevents overwriting local changes with stale remote data
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

    // Save Function (now wrapped in useCallback)
    const saveToFirestore = useCallback(async (newStore: ScheduleStore) => {
        if (!currentUser) return;

        // GUARD: Error Proofing - Prevent saving if the store looks catastrophically empty
        // This prevents the "White Screen" bug from nuking the database.
        if (!newStore.structure || newStore.structure.length === 0) {
            console.error("CRITICAL: Attempted to save invalid store (no structure). Blocked to prevent data loss.");
            return;
        }
        // If we have doctors but suddenly have 0, block unless it's a fresh init (rare).
        // Safest is to rely on structure.

        // Normalize data before comparing/saving (Firestore can't store undefined).
        const cleanData = sanitizeForFirestore(newStore);
        const stringified = JSON.stringify(cleanData);

        // Optimization: Don't save if data is identical to last save
        if (stringified === lastSavedDataRef.current) return;

        if (saveInFlightRef.current) {
            queuedStoreRef.current = newStore;
            queuedStoreStringRef.current = stringified;
            return;
        }

        try {
            saveInFlightRef.current = true;
            setStatus('saving');
            setErrorMessage(null);
            const docRef = doc(db, 'app_data', 'schedule_store_v1');

            // We deliberately do NOT use { merge: true } here.
            // Using merge: true would merge nested maps (like 'months'), causing deleted keys to persist.
            // By overwriting the document (or mainly the 'data' field if we used updateDoc), we ensure deleted data is gone.
            // Since this document 'schedule_store_v1' is dedicated to this store, overwriting is safe and correct.
            await setDoc(docRef, { data: cleanData });
            lastSavedDataRef.current = stringified;
            setStatus('idle');
        } catch (error: any) {
            console.error("Error saving to Firestore:", error);
            setErrorMessage(error.message);
            setStatus('error');
        } finally {
            saveInFlightRef.current = false;
            // ... processing queue ...
        }
    }, [currentUser]);

    return { status, errorMessage, saveToFirestore, isSynced };
};

