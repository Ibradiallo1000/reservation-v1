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
  pauseSession,
  continueSession,
  claimSession,
  isCurrentDeviceClaimed,
  getOpenShiftId,
  SHIFT_STATUS,
  SHIFT_REPORTS_COLLECTION,
} from '@/modules/agence/services/sessionService';
import { getDeviceFingerprint } from '@/utils/deviceFingerprint';
import { OPEN_SHIFT_STATUSES, type ShiftStatusValue } from '../constants/sessionLifecycle';

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
  deviceFingerprint?: string | null;
  deviceClaimedAt?: unknown;
  sessionOwnerUid?: string | null;
  createdAt: unknown;
  updatedAt: unknown;
};

function normalizeShift(id: string, data: Record<string, unknown>): ShiftDoc {
  return {
    id,
    companyId: data.companyId as string,
    agencyId: data.agencyId as string,
    userId: data.userId as string,
    userName: (data.userName ?? null) as string | null,
    userCode: (data.userCode ?? null) as string | null,
    status: (data.status as Exclude<ShiftStatus, 'none'>) || 'pending',
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
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  };
}

type Api = {
  activeShift: ShiftDoc | null;
  status: ShiftStatus;
  loading: boolean;
  sessionLockedByOtherDevice: boolean;
  startShift: () => Promise<void>;
  pauseShift: () => Promise<void>;
  continueShift: () => Promise<void>;
  closeShift: () => Promise<void>;
  refresh: () => Promise<void>;
};

export function useActiveShift(): Api {
  const { user } = useAuth() as { user?: { uid: string; companyId?: string; agencyId?: string; displayName?: string; email?: string; staffCode?: string; codeCourt?: string; code?: string } | null };
  const [activeShift, setActiveShift] = useState<ShiftDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionLockedByOtherDevice, setSessionLockedByOtherDevice] = useState(false);
  const claimAttemptedRef = useRef<Set<string>>(new Set());
  const claimRejectedByServerRef = useRef<Set<string>>(new Set());

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
    const id = await createSession({
      companyId: user.companyId,
      agencyId: user.agencyId,
      userId: user.uid,
      userName: user.displayName || user.email || null,
      userCode: (user.staffCode || user.codeCourt || user.code || 'GUEST') ?? null,
    });
    const ref = doc(db, `companies/${user.companyId}/agences/${user.agencyId}/shifts/${id}`);
    const snap = await getDoc(ref);
    if (snap.exists()) setActiveShift(normalizeShift(id, snap.data() as Record<string, unknown>));
  }, [user?.companyId, user?.agencyId, user?.uid, user?.displayName, user?.email, user?.staffCode, user?.codeCourt, user?.code]);

  const pauseShift = useCallback(async () => {
    if (!activeShift) throw new Error('Aucun poste en cours.');
    await pauseSession(activeShift.companyId, activeShift.agencyId, activeShift.id);
  }, [activeShift]);

  const continueShift = useCallback(async () => {
    if (!activeShift) throw new Error('Aucun poste en cours.');
    await continueSession(activeShift.companyId, activeShift.agencyId, activeShift.id);
  }, [activeShift]);

  const closeShift = useCallback(async () => {
    if (!activeShift) throw new Error('Aucun poste en cours.');
    const fingerprint = getDeviceFingerprint();
    await closeSession({
      companyId: activeShift.companyId,
      agencyId: activeShift.agencyId,
      shiftId: activeShift.id,
      userId: activeShift.userId,
      deviceFingerprint: fingerprint,
    });
    setActiveShift(null);
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
