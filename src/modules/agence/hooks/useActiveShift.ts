/**
 * Hook poste guichet (Phase 1 — Stabilisation).
 * Délègue au sessionService. Un seul poste ouvert par guichetier.
 * Verrouillage appareil : claim au passage en ACTIVE.
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
} from 'firebase/firestore';
import { db } from '@/firebaseConfig';
import { useAuth } from '@/contexts/AuthContext';
import { Timestamp } from 'firebase/firestore';
import {
  createSession,
  closeSession,
  type CloseSessionTotals,
  pauseSession,
  continueSession,
  claimSession,
  isCurrentDeviceClaimed,
  getOpenShiftId,
  SHIFT_STATUS,
  SHIFT_REPORTS_COLLECTION,
} from '@/modules/agence/services/sessionService';
import { getDeviceFingerprint } from '@/utils/deviceFingerprint';
import {
  OPEN_SHIFT_STATUSES,
  mapLegacyToCash,
  parseShiftStatusFromFirestore,
  type ShiftStatusValue,
} from '../constants/sessionLifecycle';
import { fetchAgencyStaffProfile } from '@/modules/agence/services/agencyStaffProfileService';

export type ShiftStatus = 'none' | ShiftStatusValue;

export type ShiftDoc = {
  id: string;
  companyId: string;
  agencyId: string;
  userId: string;
  userName?: string | null;
  userCode?: string | null;
  status: Exclude<ShiftStatus, 'none'>;
  startAt?: Timestamp | null;
  endAt?: Timestamp | null;
  startTime?: Timestamp | null;
  endTime?: Timestamp | null;
  dayKey?: string | null;
  tickets?: number;
  amount?: number;
  totalRevenue?: number;
  totalReservations?: number;
  totalCash?: number;
  totalDigital?: number;
  accountantValidated?: boolean;
  managerValidated?: boolean;
  accountantValidatedAt?: Timestamp | null;
  managerValidatedAt?: Timestamp | null;
  cashStatus?: string;
  deviceFingerprint?: string | null;
  deviceClaimedAt?: unknown;
  sessionOwnerUid?: string | null;
  createdAt: unknown;
  updatedAt: unknown;
};

function normalizeShift(id: string, data: Record<string, unknown>): ShiftDoc {
  /** Source unique : `agences/.../shifts/{id}.status` (champ Firestore `status`). */
  const normalizedStatus = parseShiftStatusFromFirestore(data) as Exclude<ShiftStatus, 'none'>;
  return {
    id,
    companyId: data.companyId as string,
    agencyId: data.agencyId as string,
    userId: data.userId as string,
    userName: (data.userName ?? null) as string | null,
    userCode: (data.userCode ?? null) as string | null,
    status: normalizedStatus,
    startAt: (data.startAt ?? null) as Timestamp | null,
    endAt: (data.endAt ?? null) as Timestamp | null,
    startTime: (data.startTime ?? null) as Timestamp | null,
    endTime: (data.endTime ?? null) as Timestamp | null,
    dayKey: (data.dayKey ?? null) as string | null,
    tickets: (data.tickets ?? 0) as number,
    amount: (data.amount ?? 0) as number,
    totalRevenue: (data.totalRevenue ?? 0) as number,
    totalReservations: (data.totalReservations ?? 0) as number,
    totalCash: (data.totalCash ?? 0) as number,
    totalDigital: (data.totalDigital ?? 0) as number,
    accountantValidated: !!(data.accountantValidated ?? false),
    managerValidated: !!(data.managerValidated ?? false),
    accountantValidatedAt: (data.accountantValidatedAt ?? null) as Timestamp | null,
    managerValidatedAt: (data.managerValidatedAt ?? null) as Timestamp | null,
    deviceFingerprint: (data.deviceFingerprint ?? null) as string | null,
    deviceClaimedAt: data.deviceClaimedAt ?? null,
    sessionOwnerUid: (data.sessionOwnerUid ?? null) as string | null,
    cashStatus: mapLegacyToCash(normalizedStatus) as string,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  };
}

export type { CloseSessionTotals };

type Api = {
  activeShift: ShiftDoc | null;
  status: ShiftStatus;
  loading: boolean;
  sessionLockedByOtherDevice: boolean;
  startShift: () => Promise<void>;
  pauseShift: (reason: string) => Promise<void>;
  continueShift: () => Promise<void>;
  closeShift: (actualAmount?: number) => Promise<CloseSessionTotals | null>;
  refresh: () => Promise<void>;
};

export function useActiveShift(): Api {
  const { user } = useAuth() as { user?: { uid: string; companyId?: string; agencyId?: string; displayName?: string; email?: string; staffCode?: string; codeCourt?: string; code?: string } | null };
  const [activeShift, setActiveShift] = useState<ShiftDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionLockedByOtherDevice, setSessionLockedByOtherDevice] = useState(false);
  const claimAttemptedRef = useRef<Set<string>>(new Set());
  const claimRejectedByServerRef = useRef<Set<string>>(new Set());

  /** Dérivé uniquement du snapshot Firestore (via activeShift.status), jamais d’un state parallèle. */
  const status: ShiftStatus = activeShift?.status ?? 'none';

  useEffect(() => {
    if (!user?.companyId || !user?.agencyId || !user?.uid) {
      setActiveShift(null);
      setSessionLockedByOtherDevice(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    const shiftsRef = collection(db, `companies/${user.companyId}/agences/${user.agencyId}/shifts`);
    const q = query(
      shiftsRef,
      where('userId', '==', user.uid),
      where('status', 'in', OPEN_SHIFT_STATUSES),
      orderBy('createdAt', 'desc'),
      limit(1)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        if (snap.empty) {
          setActiveShift(null);
          setSessionLockedByOtherDevice(false);
          claimAttemptedRef.current.clear();
          claimRejectedByServerRef.current.clear();
        } else {
          const doc = snap.docs[0];
          const data = doc.data() as Record<string, unknown>;
          const normalized = normalizeShift(doc.id, data);
          console.log('session status', normalized.status);
          setActiveShift(normalized);
          if (normalized.status === SHIFT_STATUS.ACTIVE || normalized.status === SHIFT_STATUS.PAUSED) {
            const claimedHere = isCurrentDeviceClaimed(normalized);
            const alreadyTriedClaim = claimAttemptedRef.current.has(normalized.id);
            const serverSaidOtherDevice = claimRejectedByServerRef.current.has(normalized.id);

            if (claimedHere) {
              claimRejectedByServerRef.current.delete(normalized.id);
              setSessionLockedByOtherDevice(false);
            } else if (serverSaidOtherDevice) {
              setSessionLockedByOtherDevice(true);
            } else if (!alreadyTriedClaim) {
              claimAttemptedRef.current.add(normalized.id);
              claimSession({
                companyId: user.companyId!,
                agencyId: user.agencyId!,
                shiftId: normalized.id,
              }).then((r) => {
                if (r.error === 'SESSION_LOCKED_OTHER_DEVICE') {
                  claimRejectedByServerRef.current.add(normalized.id);
                  setSessionLockedByOtherDevice(true);
                } else {
                  claimRejectedByServerRef.current.delete(normalized.id);
                  setSessionLockedByOtherDevice(false);
                }
              }).catch(() => {
                claimRejectedByServerRef.current.delete(normalized.id);
                setSessionLockedByOtherDevice(false);
              });
              setSessionLockedByOtherDevice(false);
            } else {
              setSessionLockedByOtherDevice(false);
            }
          } else {
            setSessionLockedByOtherDevice(false);
          }
        }
        setLoading(false);
      },
      (err) => {
        console.error('[useActiveShift] onSnapshot error:', err);
        setActiveShift(null);
        setSessionLockedByOtherDevice(false);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [user?.uid, user?.companyId, user?.agencyId]);

  const startShift = useCallback(async () => {
    if (!user?.companyId || !user?.agencyId || !user?.uid) throw new Error('Utilisateur invalide.');
    const existing = await getOpenShiftId(user.companyId, user.agencyId, user.uid);
    if (existing) return;
    const profile = await fetchAgencyStaffProfile(user.companyId, user.agencyId, user.uid);
    const codeFromProfile = profile.code?.trim();
    const codeFromToken =
      (user.staffCode || user.codeCourt || user.code || '').toString().trim();
    const resolvedCode = codeFromProfile || codeFromToken || 'GUEST';
    const resolvedName =
      (profile.name && profile.name.trim()) ||
      user.displayName ||
      user.email ||
      null;
    const id = await createSession({
      companyId: user.companyId,
      agencyId: user.agencyId,
      userId: user.uid,
      userName: resolvedName,
      userCode: resolvedCode,
    });
    const ref = doc(db, `companies/${user.companyId}/agences/${user.agencyId}/shifts/${id}`);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const n = normalizeShift(id, snap.data() as Record<string, unknown>);
      console.log('session status', n.status);
      setActiveShift(n);
    }
  }, [user?.companyId, user?.agencyId, user?.uid, user?.displayName, user?.email, user?.staffCode, user?.codeCourt, user?.code]);

  const pauseShift = useCallback(async (reason: string) => {
    if (!activeShift) throw new Error('Aucun poste en cours.');
    const r = String(reason ?? '').trim();
    if (!r) throw new Error('Le motif de pause est obligatoire.');
    if (!user?.uid) throw new Error('Utilisateur invalide.');
    await pauseSession({
      companyId: activeShift.companyId,
      agencyId: activeShift.agencyId,
      shiftId: activeShift.id,
      pausedBy: { id: user.uid, name: user.displayName ?? user.email ?? null },
      reason: r,
      actorRole: 'guichetier',
    });
  }, [activeShift, user?.uid, user?.displayName, user?.email]);

  const continueShift = useCallback(async () => {
    if (!activeShift) throw new Error('Aucun poste en cours.');
    await continueSession(activeShift.companyId, activeShift.agencyId, activeShift.id);
  }, [activeShift]);

  const closeShift = useCallback(async (actualAmount?: number): Promise<CloseSessionTotals | null> => {
    if (!activeShift) throw new Error('Aucun poste en cours.');
    const fingerprint = getDeviceFingerprint();
    const totals = await closeSession({
      companyId: activeShift.companyId,
      agencyId: activeShift.agencyId,
      shiftId: activeShift.id,
      userId: activeShift.userId,
      deviceFingerprint: fingerprint,
      actualAmount,
    });
    setActiveShift(null);
    return totals;
  }, [activeShift]);

  const refresh = useCallback(async () => {}, []);

  return {
    activeShift: activeShift ?? null,
    status,
    loading,
    sessionLockedByOtherDevice,
    startShift,
    pauseShift,
    continueShift,
    closeShift,
    refresh,
  };
}

export { SHIFT_REPORTS_COLLECTION };
export default useActiveShift;
