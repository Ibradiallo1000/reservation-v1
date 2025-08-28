// src/hooks/useActiveShift.ts
import { useEffect, useState, useCallback } from 'react';
import {
  addDoc, collection, doc, getDoc, getDocs, limit, onSnapshot,
  orderBy, query, runTransaction, serverTimestamp, setDoc,
  Timestamp, updateDoc, where
} from 'firebase/firestore';
import { db } from '@/firebaseConfig';
import { useAuth } from '@/contexts/AuthContext';

/**
 * États d'un poste
 */
export type ShiftStatus = 'none' | 'pending' | 'active' | 'paused' | 'closed';

/**
 * Modèle local d'un document shift
 * NB: startAt/endAt = nouveaux champs "alignés".
 *     startTime/endTime = anciens champs (compatibilité UI compta).
 */
export type ShiftDoc = {
  id: string;
  companyId: string;
  agencyId: string;
  userId: string;
  userName?: string | null;
  userCode?: string | null;
  status: Exclude<ShiftStatus, 'none'>;

  // New canonical fields
  startAt?: Timestamp | null;
  endAt?: Timestamp | null;

  // Legacy compatibility (compta ancienne page)
  startTime?: Timestamp | null;
  endTime?: Timestamp | null;

  dayKey?: string; // YYYYMMDD – pour regrouper dans les rapports

  tickets?: number;
  amount?: number;

  accountantValidated?: boolean;
  managerValidated?: boolean;
  accountantValidatedAt?: Timestamp | null;
  managerValidatedAt?: Timestamp | null;

  createdAt: any;
  updatedAt: any;
};

/* --------------------------------- Utils --------------------------------- */

function stripUndefined<T extends Record<string, any>>(obj: T): T {
  const out: any = {};
  Object.keys(obj || {}).forEach((k) => {
    const v = (obj as any)[k];
    if (v === undefined) return;
    if (v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Timestamp)) {
      out[k] = stripUndefined(v);
    } else {
      out[k] = v;
    }
  });
  return out as T;
}

function yyyymmdd(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${dd}`;
}

/** Normalise un document Firestore → modèle local */
function normalizeShift(id: string, data: any): ShiftDoc {
  const startAt = data.startAt ?? data.startTime ?? null;
  const endAt   = data.endAt   ?? data.endTime   ?? null;
  return {
    id,
    companyId: data.companyId,
    agencyId: data.agencyId,
    userId: data.userId,
    userName: data.userName ?? null,
    userCode: data.userCode ?? null,
    status: data.status,
    startAt,
    endAt,
    startTime: data.startTime ?? null,
    endTime: data.endTime ?? null,
    dayKey: data.dayKey ?? null,
    tickets: data.tickets ?? 0,
    amount: data.amount ?? 0,
    accountantValidated: !!data.accountantValidated,
    managerValidated: !!data.managerValidated,
    accountantValidatedAt: data.accountantValidatedAt ?? null,
    managerValidatedAt: data.managerValidatedAt ?? null,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  };
}

/* --------------------------------- Hook ---------------------------------- */

type Api = {
  activeShift?: ShiftDoc | null;
  status: ShiftStatus;
  startShift: () => Promise<void>;      // crée une demande (pending) — ID auto
  pauseShift: () => Promise<void>;
  continueShift: () => Promise<void>;
  closeShift: () => Promise<void>;      // clôture + rapport
  validateByAccountant: (shiftId: string) => Promise<void>;
  validateByManager: (shiftId: string) => Promise<void>;
  refresh: () => Promise<void>;
};

/**
 * Gestion du poste guichet (ID AUTO + dayKey + compat startTime/endTime)
 * - startShift(): crée un shift PENDING sans startAt (l'heure de début est
 *   posée au moment de l'activation par la comptabilité).
 * - closeShift(): pose endAt (et endTime pour compat), remplit shiftReports.
 */
export function useActiveShift(): Api {
  const { user } = useAuth() as any;
  const [activeShift, setActiveShift] = useState<ShiftDoc | null>(null);
  const status: ShiftStatus = activeShift?.status ?? 'none';

  /* --------- Abonnement au shift ouvert (pending/active/paused) --------- */
  useEffect(() => {
    if (!user?.companyId || !user?.agencyId || !user?.uid) {
      setActiveShift(null);
      return;
    }
    const shiftsRef = collection(db, `companies/${user.companyId}/agences/${user.agencyId}/shifts`);
    const qy = query(
      shiftsRef,
      where('userId', '==', user.uid),
      where('status', 'in', ['pending', 'active', 'paused'] as any),
      orderBy('createdAt', 'desc'),
      limit(1)
    );
    const unsub = onSnapshot(qy, (snap) => {
      if (snap.empty) setActiveShift(null);
      else setActiveShift(normalizeShift(snap.docs[0].id, snap.docs[0].data()));
    });
    return () => unsub();
  }, [user?.uid, user?.companyId, user?.agencyId]);

  /* --------- Vérifie s'il existe déjà un shift ouvert --------- */
  const findOpenedShiftId = useCallback(async (): Promise<string | null> => {
    if (!user?.companyId || !user?.agencyId || !user?.uid) return null;
    const shiftsRef = collection(db, `companies/${user.companyId}/agences/${user.agencyId}/shifts`);
    const qy = query(
      shiftsRef,
      where('userId', '==', user.uid),
      where('status', 'in', ['pending', 'active', 'paused'] as any),
      orderBy('createdAt', 'desc'),
      limit(1)
    );
    const snap = await getDocs(qy);
    return snap.empty ? null : snap.docs[0].id;
  }, [user?.uid, user?.companyId, user?.agencyId]);

  /* --------------------- Demande d'ouverture (pending) -------------------- */
  const startShift = useCallback(async () => {
    if (!user?.companyId || !user?.agencyId || !user?.uid) {
      throw new Error('Utilisateur invalide.');
    }

    // Si un shift est déjà ouvert (pending/active/paused) → ne rien créer
    const existing = await findOpenedShiftId();
    if (existing) return;

    const payload = stripUndefined({
      companyId: user.companyId,
      agencyId: user.agencyId,
      userId: user.uid,
      userName: user.displayName || user.email || null,
      userCode: (user.staffCode || user.codeCourt || user.code || 'GUEST') ?? null,

      status: 'pending' as const,

      // Important: pas de startAt ici → elle sera posée à l'activation
      startAt: null,
      endAt: null,

      // compat pour anciennes pages (aucune heure au début)
      startTime: null,
      endTime: null,

      dayKey: yyyymmdd(),

      tickets: 0,
      amount: 0,

      accountantValidated: false,
      managerValidated: false,
      accountantValidatedAt: null,
      managerValidatedAt: null,

      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    const ref = await addDoc(
      collection(db, `companies/${user.companyId}/agences/${user.agencyId}/shifts`),
      payload
    );

    // Met à jour le local immédiatement (l’onSnapshot prendra le relai)
    const snap = await getDoc(ref);
    if (snap.exists()) setActiveShift(normalizeShift(ref.id, snap.data()));
  }, [user?.companyId, user?.agencyId, user?.uid, findOpenedShiftId]);

  /* ----------------------------- Pause / reprise ----------------------------- */
  const pauseShift = useCallback(async () => {
    if (!activeShift) throw new Error('Aucun poste en cours.');
    if (activeShift.status !== 'active') throw new Error('Le poste doit être en service.');
    await updateDoc(
      doc(db, `companies/${activeShift.companyId}/agences/${activeShift.agencyId}/shifts/${activeShift.id}`),
      stripUndefined({ status: 'paused', updatedAt: serverTimestamp() })
    );
  }, [activeShift]);

  const continueShift = useCallback(async () => {
    if (!activeShift) throw new Error('Aucun poste en cours.');
    if (activeShift.status !== 'paused') throw new Error('Le poste doit être en pause.');
    await updateDoc(
      doc(db, `companies/${activeShift.companyId}/agences/${activeShift.agencyId}/shifts/${activeShift.id}`),
      stripUndefined({ status: 'active', updatedAt: serverTimestamp() })
    );
  }, [activeShift]);

  /* --------------------------------- Clôture -------------------------------- */
  /**
   * Clôture:
   *  - agrège billets/montant (reservations du shift, canal=guichet)
   *  - écrit `shiftReports/{shiftId}`
   *  - passe le shift à `closed` + pose endAt (et endTime pour compat)
   */
  const closeShift = useCallback(async () => {
    if (!activeShift) throw new Error('Aucun poste en cours.');
    if (!['active', 'paused', 'pending'].includes(activeShift.status)) {
      throw new Error('État non clôturable.');
    }
    const base = `companies/${activeShift.companyId}/agences/${activeShift.agencyId}`;

    await runTransaction(db, async (tx) => {
      const shiftRef = doc(db, `${base}/shifts/${activeShift.id}`);
      const shiftSnap = await tx.get(shiftRef);
      if (!shiftSnap.exists()) throw new Error('Poste introuvable.');

      // Agrégation des ventes du poste (guichet uniquement)
      const rCol = collection(db, `${base}/reservations`);
      const qy = query(rCol, where('shiftId', '==', activeShift.id), where('canal', '==', 'guichet'));
      const resSnap = await getDocs(qy);

      let billets = 0, montant = 0;
      const byRoute: Record<string, { billets: number; montant: number; heures: Set<string> }> = {};
      resSnap.forEach((d) => {
        const r = d.data() as any;
        const n = Number(r.seatsGo || 0) + Number(r.seatsReturn || 0);
        const m = Number(r.montant || 0);
        billets += n; montant += m;
        const key = `${r.depart || ''}→${r.arrivee || ''}`;
        if (!byRoute[key]) byRoute[key] = { billets: 0, montant: 0, heures: new Set<string>() };
        byRoute[key].billets += n;
        byRoute[key].montant += m;
        if (r.heure) byRoute[key].heures.add(String(r.heure));
      });

      const details = Object.entries(byRoute).map(([trajet, v]) => ({
        trajet,
        billets: v.billets,
        montant: v.montant,
        heures: Array.from(v.heures).sort(),
      }));

      const now = Timestamp.now();

      // Rapport 1-pour-1 avec le shift
      const reportRef = doc(db, `${base}/shiftReports/${activeShift.id}`);
      tx.set(reportRef, stripUndefined({
        shiftId: activeShift.id,
        companyId: activeShift.companyId,
        agencyId: activeShift.agencyId,
        userId: activeShift.userId,
        userName: activeShift.userName || null,
        userCode: activeShift.userCode || null,
        startAt: activeShift.startAt ?? activeShift.startTime ?? null,
        endAt: now,
        billets: billets || 0,
        montant: montant || 0,
        details: details || [],
        accountantValidated: false,
        managerValidated: false,
        accountantValidatedAt: null,
        managerValidatedAt: null,
        status: 'pending_validation',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }), { merge: true });

      // Clôture du shift (pose endAt + endTime pour compat)
      tx.update(shiftRef, stripUndefined({
        status: 'closed',
        endAt: now,
        endTime: now,
        tickets: billets || 0,
        amount: montant || 0,
        updatedAt: serverTimestamp(),
      }));
    });
  }, [activeShift]);

  /* --------------------------- Tampons de validation --------------------------- */
  const validateByAccountant = useCallback(async (shiftId: string) => {
    if (!user?.companyId || !user?.agencyId) throw new Error('Contexte invalide.');
    const base = `companies/${user.companyId}/agences/${user.agencyId}`;
    const reportRef = doc(db, `${base}/shiftReports/${shiftId}`);
    await updateDoc(reportRef, stripUndefined({
      accountantValidated: true,
      accountantValidatedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }));
    const shiftRef = doc(db, `${base}/shifts/${shiftId}`);
    await updateDoc(shiftRef, stripUndefined({
      accountantValidated: true,
      accountantValidatedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }));
  }, [user?.companyId, user?.agencyId]);

  const validateByManager = useCallback(async (shiftId: string) => {
    if (!user?.companyId || !user?.agencyId) throw new Error('Contexte invalide.');
    const base = `companies/${user.companyId}/agences/${user.agencyId}`;
    const reportRef = doc(db, `${base}/shiftReports/${shiftId}`);
    await updateDoc(reportRef, stripUndefined({
      managerValidated: true,
      managerValidatedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }));
    const shiftRef = doc(db, `${base}/shifts/${shiftId}`);
    await updateDoc(shiftRef, stripUndefined({
      managerValidated: true,
      managerValidatedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }));
  }, [user?.companyId, user?.agencyId]);

  const refresh = useCallback(async () => {
    // tout est piloté par onSnapshot ; présence d'un bouton "Actualiser" côté UI
    return;
  }, []);

  return {
    activeShift,
    status,
    startShift,
    pauseShift,
    continueShift,
    closeShift,
    validateByAccountant,
    validateByManager,
    refresh,
  };
}

export default useActiveShift;
