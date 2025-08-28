// src/pages/AgenceComptabilitePage.tsx
// Comptabilité d’agence (contrôle des postes, réceptions, rapports, caisse)
// ———————————————————————————————————————————————————————————————

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  addDoc, collection, doc, getDoc, getDocs, onSnapshot, orderBy, query,
  runTransaction, Timestamp, updateDoc, where, writeBatch
} from 'firebase/firestore';
import { db } from '@/firebaseConfig';
import { useAuth } from '@/contexts/AuthContext';
import useCompanyTheme from '@/hooks/useCompanyTheme';
import {
  Activity, AlertTriangle, Banknote, Building2, CheckCircle2, Clock4,
  Download, FileText, HandIcon, LogOut, MapPin, Pause, Play, Plus, StopCircle,
  Ticket, Wallet, Info as InfoIcon
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

/* ========================= TYPES ========================= */
type ShiftStatus = 'pending' | 'active' | 'paused' | 'closed' | 'validated';

type ShiftDoc = {
  id: string;
  userId: string;
  userName?: string;
  userEmail?: string;
  userCode?: string;
  companyId: string;
  agencyId: string;
  status: ShiftStatus;
  startTime?: any;
  endTime?: any;
  totalTickets?: number;
  totalReservations?: number;
  totalAmount?: number;
  payBy?: Record<string, number>;
  accountantId?: string;
  accountantCode?: string;
  accountantName?: string;
  validatedAt?: any;
  cashExpected?: number;
  cashReceived?: number;
  mmExpected?: number;
  mmReceived?: number;
  comptable?: { validated?: boolean; at?: any; by?: { id?: string; name?: string } };
};

type TicketRow = {
  id: string;
  referenceCode?: string;
  date: string;
  heure: string;
  depart: string;
  arrivee: string;
  nomClient: string;
  telephone?: string;
  seatsGo: number;
  seatsReturn?: number;
  montant: number;
  paiement?: string;
  createdAt?: any;
  guichetierCode?: string;
  canal?: string;
};

type AccountantProfile = {
  id: string;
  displayName?: string;
  email?: string;
  staffCode?: string;
  codeCourt?: string;
  code?: string;
};

// Agrégats compta (réceptions)
type ShiftAgg = {
  reservations: number;
  tickets: number;
  amount: number;
  cashExpected: number;
  mmExpected: number;
};

/* ============== Caisse ============== */
type CashDay = { dateISO: string; entrees: number; sorties: number; solde: number };
type MovementKind = 'depense' | 'transfert_banque';

type NewOutForm = {
  kind: MovementKind;
  montant: string;
  libelle: string;
  banque?: string;
  note?: string;
};

/* ========================= HELPERS ========================= */
const fmtMoney = (n: number) => `${(n || 0).toLocaleString('fr-FR')} FCFA`;
const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
const endOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 1, 0, 0, 0, 0);

// Formats FR
const fmtDT = (d?: Date | null) =>
  d ? d.toLocaleString('fr-FR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' }) : '—';
const fmtD  = (dISO?: string) => {
  if (!dISO) return '—';
  const d = new Date(dISO);
  return d.toLocaleDateString('fr-FR', { day:'2-digit', month:'2-digit', year:'numeric' });
};

/* ============================= PAGE ============================ */
const AgenceComptabilitePage: React.FC = () => {
  const navigate = useNavigate();
  const { user, company, logout } = useAuth() as any;
  const theme = useCompanyTheme(company) || { primary: '#EA580C', secondary: '#F97316' };

  // header branding
  const [companyLogo, setCompanyLogo] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState<string>('Compagnie');
  const [agencyName, setAgencyName] = useState<string>('Agence');

  // tabs
  const [tab, setTab] = useState<'controle' | 'receptions' | 'rapports' | 'caisse'>('controle');

  // accountant
  const [accountant, setAccountant] = useState<AccountantProfile | null>(null);
  const [accountantCode, setAccountantCode] = useState<string>('ACCOUNT');

  // shifts
  const [pendingShifts, setPendingShifts] = useState<ShiftDoc[]>([]);
  const [activeShifts, setActiveShifts] = useState<ShiftDoc[]>([]);
  const [pausedShifts, setPausedShifts] = useState<ShiftDoc[]>([]);
  const [closedShifts, setClosedShifts] = useState<ShiftDoc[]>([]);
  const [validatedShifts, setValidatedShifts] = useState<ShiftDoc[]>([]);
  const [validatedLimit, setValidatedLimit] = useState(10);

  // reports
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [loadingReport, setLoadingReport] = useState(false);
  const [selectedShiftForReport, setSelectedShiftForReport] = useState<string>('');
  const [dedupCollapsed, setDedupCollapsed] = useState<number>(0);

  // receptions
  const [receptionInputs, setReceptionInputs] = useState<Record<string, { cashReceived: string }>>({});
  const [savingShiftIds, setSavingShiftIds] = useState<Record<string, boolean>>({});

  // caches / live
  const [usersCache, setUsersCache] = useState<Record<string, { name?: string; email?: string; code?: string }>>({});
  const [liveStats, setLiveStats] = useState<Record<string, { reservations: number; tickets: number; amount: number }>>({});
  const liveUnsubsRef = useRef<Record<string, () => void>>({});

  // agrégats compta
  const [aggByShift, setAggByShift] = useState<Record<string, ShiftAgg>>({});

  // CAISSE
  const [useCustomRange, setUseCustomRange] = useState(false);
  const [monthValue, setMonthValue] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [rangeFrom, setRangeFrom] = useState<string>('');
  const [rangeTo, setRangeTo] = useState<string>('');
  const [days, setDays] = useState<CashDay[]>([]);
  const [totIn, setTotIn] = useState(0);
  const [totOut, setTotOut] = useState(0);
  const [loadingCash, setLoadingCash] = useState(false);

  const [showOutModal, setShowOutModal] = useState(false);
  const [outForm, setOutForm] = useState<NewOutForm>({ kind: 'depense', montant: '', libelle: '', banque: '', note: '' });

  /* ---------- Init header + accountant ---------- */
  useEffect(() => {
    (async () => {
      if (!user?.companyId || !user?.agencyId) return;

      const compSnap = await getDoc(doc(db, 'companies', user.companyId));
      if (compSnap.exists()) {
        const c = compSnap.data() as any;
        setCompanyLogo(c.logoUrl || c.logo || null);
        setCompanyName(c.nom || c.name || 'Compagnie');
      }
      const agSnap = await getDoc(doc(db, `companies/${user.companyId}/agences/${user.agencyId}`));
      if (agSnap.exists()) {
        const a = agSnap.data() as any;
        const ville = a?.ville || a?.city || a?.nomVille || a?.villeDepart || '';
        setAgencyName(a?.nomAgence || a?.nom || ville || 'Agence');
      }

      const uSnap = await getDoc(doc(db, 'users', user.uid));
      if (uSnap.exists()) {
        const u = uSnap.data() as any;
        const prof: AccountantProfile = {
          id: user.uid,
          displayName: u.displayName || user.displayName || '',
          email: u.email || user.email || '',
          staffCode: u.staffCode, codeCourt: u.codeCourt, code: u.code,
        };
        setAccountant(prof);
        setAccountantCode(u.staffCode || u.codeCourt || u.code || 'ACCOUNT');
      }
    })().catch(console.error);
  }, [user?.uid, user?.companyId, user?.agencyId]);

  /* ---------- Normalisation doc shift ---------- */
  const normalizeShift = (id: string, r: any): ShiftDoc => ({
    id,
    userId: r.userId || r.openedById || '',
    userName: r.userName || r.openedByName || r.userEmail || '',
    userEmail: r.userEmail || '',
    userCode: r.userCode || r.openedByCode || '',
    companyId: r.companyId,
    agencyId: r.agencyId,
    status: r.status,
    startTime: r.startTime || r.openedAt,
    endTime: r.endTime || r.closedAt,
    totalTickets: r.totalTickets,
    totalReservations: r.totalReservations,
    totalAmount: r.totalAmount,
    payBy: r.payBy,
    accountantId: r.accountantId,
    accountantCode: r.accountantCode,
    accountantName: r.accountantName,
    validatedAt: r.validatedAt,
    cashExpected: r.cashExpected,
    cashReceived: r.cashReceived,
    mmExpected: r.mmExpected,
    mmReceived: r.mmReceived,
    comptable: r.comptable,
  });

  /* ---------- Subscribe shifts ---------- */
  useEffect(() => {
    if (!user?.companyId || !user?.agencyId) return;
    const ref = collection(db, `companies/${user.companyId}/agences/${user.agencyId}/shifts`);
    const unsub = onSnapshot(ref, async (snap) => {
      const all = snap.docs.map(d => normalizeShift(d.id, d.data()));

      const needed = Array.from(new Set(all.map(s => s.userId).filter(uid => !!uid && !usersCache[uid])));
      if (needed.length) {
        const entries = await Promise.all(needed.map(async uid => {
          const us = await getDoc(doc(db, 'users', uid));
          if (!us.exists()) return [uid, {}] as const;
          const ud = us.data() as any;
          return [uid, {
            name: ud.displayName || ud.nom || ud.email || '',
            email: ud.email || '',
            code: ud.staffCode || ud.codeCourt || ud.code || '',
          }] as const;
        }));
        setUsersCache(prev => Object.fromEntries([...Object.entries(prev), ...entries]));
      }

      const byTime = (s: ShiftDoc) =>
        (s.validatedAt?.toMillis?.() ?? 0) ||
        (s.endTime?.toMillis?.() ?? 0) ||
        (s.startTime?.toMillis?.() ?? 0);

      setPendingShifts(all.filter(s => s.status === 'pending').sort((a,b)=>byTime(b)-byTime(a)));
      setActiveShifts(all.filter(s => s.status === 'active').sort((a,b)=>byTime(b)-byTime(a)));
      setPausedShifts(all.filter(s => s.status === 'paused').sort((a,b)=>byTime(b)-byTime(a)));
      setClosedShifts(all.filter(s => s.status === 'closed').sort((a,b)=>byTime(b)-byTime(a)));
      setValidatedShifts(all.filter(s => s.status === 'validated').sort((a,b)=>byTime(b)-byTime(a)));
    });
    return () => unsub();
  }, [user?.companyId, user?.agencyId]);

  /* ---------- Live stats ---------- */
  useEffect(() => {
    if (!user?.companyId || !user?.agencyId) return;
    const rRef = collection(db, `companies/${user.companyId}/agences/${user.agencyId}/reservations`);

    for (const id of Object.keys(liveUnsubsRef.current)) {
      if (!activeShifts.find(s => s.id === id)) {
        liveUnsubsRef.current[id]?.();
        delete liveUnsubsRef.current[id];
      }
    }

    for (const s of activeShifts) {
      if (liveUnsubsRef.current[s.id]) continue;
      const qLive = query(rRef, where('shiftId', '==', s.id), where('canal', '==', 'guichet'));
      const unsub = onSnapshot(qLive, (snap) => {
        let reservations = 0, tickets = 0, amount = 0;
        snap.forEach(d => {
          const r = d.data() as any;
          reservations += 1;
          tickets += (r.seatsGo || 0) + (r.seatsReturn || 0);
          amount += r.montant || 0;
        });
        setLiveStats(prev => ({ ...prev, [s.id]: { reservations, tickets, amount } }));
      });
      liveUnsubsRef.current[s.id] = unsub;
    }

    return () => {
      for (const k of Object.keys(liveUnsubsRef.current)) liveUnsubsRef.current[k]?.();
      liveUnsubsRef.current = {};
    };
  }, [activeShifts, user?.companyId, user?.agencyId]);

  /* ---------- Agrégats pour réceptions ---------- */
  useEffect(() => {
    (async () => {
      if (!user?.companyId || !user?.agencyId) return;
      const rRef = collection(db, `companies/${user.companyId}/agences/${user.agencyId}/reservations`);
      const map: Record<string, ShiftAgg> = {};
      for (const s of closedShifts) {
        const snap = await getDocs(query(rRef, where('shiftId', '==', s.id)));
        let reservations = 0, tickets = 0, amount = 0, cashExpected = 0;
        snap.forEach(d => {
          const r = d.data() as any;
          reservations += 1;
          tickets += (r.seatsGo || 0) + (r.seatsReturn || 0);
          amount += (r.montant || 0);
          const pay = String(r.paiement || '').toLowerCase();
          if (pay.includes('esp')) { cashExpected += (r.montant || 0); }
        });
        map[s.id] = { reservations, tickets, amount, cashExpected, mmExpected: 0 };
      }
      setAggByShift(map);
    })().catch((e) => console.error('[Compta] Erreur agrégats réceptions:', e));
  }, [closedShifts, user?.companyId, user?.agencyId]);

  /* ---------- Actions (activer / pause / continuer) ---------- */
  const activateShift  = useCallback(async (id:string)=>{
    if(!user?.companyId||!user?.agencyId||!accountant) return;
    const base = `companies/${user.companyId}/agences/${user.agencyId}`;
    const sRef = doc(db,`${base}/shifts/${id}`);
    const repRef = doc(db,`${base}/shiftReports/${id}`);

    await runTransaction(db, async (tx) => {
      const snap = await tx.get(sRef);
      if (!snap.exists()) throw new Error('Poste introuvable');
      const cur = snap.data() as any;
      const now = Timestamp.now();
      const start = cur.startTime || cur.openedAt || now;

      tx.update(sRef, {
        status: 'active',
        startTime: cur.startTime ?? now,
      });

      tx.set(repRef, {
        companyId: user.companyId,
        agencyId: user.agencyId,
        userId: cur.userId || cur.openedById || '',
        userName: cur.userName || cur.userEmail || '',
        userCode: cur.userCode || cur.openedByCode || '',
        startAt: start,
        updatedAt: now,
      }, { merge: true });
    });
  },[user?.companyId,user?.agencyId,accountant]);

  const pauseShift     = useCallback(async (id:string)=>{
    if(!user?.companyId||!user?.agencyId) return;
    await updateDoc(doc(db,`companies/${user.companyId}/agences/${user.agencyId}/shifts/${id}`),{status:'paused'});
  },[user?.companyId,user?.agencyId]);

  const continueShift  = useCallback(async (id:string)=>{
    if(!user?.companyId||!user?.agencyId) return;
    await updateDoc(doc(db,`companies/${user.companyId}/agences/${user.agencyId}/shifts/${id}`),{status:'active'});
  },[user?.companyId,user?.agencyId]);

  /* ---------- PATCH comptable backfill : closeShift forcé ---------- */
  const closeShift = useCallback(async (id: string, opts?: { forcedByAccountant?: boolean }) => {
    if (!user?.companyId || !user?.agencyId) return;

    const base = `companies/${user.companyId}/agences/${user.agencyId}`;
    const shiftRef = doc(db, `${base}/shifts/${id}`);
    const rRef = collection(db, `${base}/reservations`);

    const sSnap = await getDoc(shiftRef);
    if (!sSnap.exists()) { alert('Poste introuvable'); return; }
    const sDoc = sSnap.data() as any;

    const end = Timestamp.now();
    await updateDoc(shiftRef, { status: 'closed', endTime: end });

    if (!opts?.forcedByAccountant) return;

    const startRaw = sDoc.startTime?.toDate?.() ?? sDoc.openedAt?.toDate?.() ?? new Date();
    const endRaw   = end.toDate();
    const start = new Date(startRaw.getTime() - 5 * 60 * 1000);
    const endW  = new Date(endRaw.getTime() + 6 * 60 * 60 * 1000);

    const userId   = sDoc.userId || sDoc.openedById || '';
    const userCode = sDoc.userCode || sDoc.openedByCode || '';

    const q1 = query(
      rRef,
      where('createdAt', '>=', Timestamp.fromDate(start)),
      where('createdAt', '<=', Timestamp.fromDate(endW)),
      orderBy('createdAt','asc')
    );
    const snap = await getDocs(q1);

    const toPatch = snap.docs.filter(d => {
      const r = d.data() as any;
      if (r.shiftId) return false;
      const canal = String(r.canal || '').toLowerCase();
      const isCounter = canal === 'guichet' || (canal === '' && String(r.paiement||'').toLowerCase().includes('esp'));
      const sameSeller =
        (!!userId   && r.guichetierId   === userId) ||
        (!!userCode && r.guichetierCode === userCode);
      return isCounter && sameSeller;
    });

    if (toPatch.length) {
      const batch = writeBatch(db);
      toPatch.forEach(d => batch.update(d.ref, { shiftId: id }));
      await batch.commit();
    }
  }, [user?.companyId, user?.agencyId]);

  /* ---------- Réception (tampon comptable + reçu) ---------- */
  const setReceptionInput = (shiftId: string, value: string) =>
    setReceptionInputs(prev => ({ ...prev, [shiftId]: { cashReceived: value } }));

  const validateReception = useCallback(async (shift: ShiftDoc) => {
    if (!user?.companyId || !user?.agencyId || !accountant) return;
    if (savingShiftIds[shift.id]) return;
    setSavingShiftIds(p => ({ ...p, [shift.id]: true }));

    const inputs = receptionInputs[shift.id] || { cashReceived: '0' };
    const toAmount = (s: string) => {
      const clean = (s || '').replace(/[^\d.,]/g, '').replace(',', '.');
      const n = Number(clean);
      return Number.isFinite(n) && n >= 0 ? n : NaN;
    };
    const cashRcv = toAmount(inputs.cashReceived || '');
    if (!Number.isFinite(cashRcv)) { alert('Montant espèces reçu invalide.'); setSavingShiftIds(p=>({...p, [shift.id]:false})); return; }
    const mmRcv = 0;

    const shiftRef = doc(db, `companies/${user.companyId}/agences/${user.agencyId}/shifts/${shift.id}`);
    const receiptsRef = collection(db, `companies/${user.companyId}/agences/${user.agencyId}/cashReceipts`);
    const reportRef = doc(db, `companies/${user.companyId}/agences/${user.agencyId}/shiftReports/${shift.id}`);

    const agg = aggByShift[shift.id];
    const computedCashExpected = agg?.cashExpected ?? shift.cashExpected ?? (shift.payBy?.['espèces'] ?? 0);
    const computedMmExpected = agg?.mmExpected ?? shift.mmExpected ?? (shift.payBy?.['mobile_money'] ?? 0);

    const newRef = doc(receiptsRef);
    const newReceiptId = newRef.id;

    try {
      await runTransaction(db, async (tx) => {
        const s = await tx.get(shiftRef);
        if (!s.exists()) throw new Error('Poste introuvable.');
        const cur = s.data() as any;
        if (cur.status !== 'closed' && cur.status !== 'validated') {
          throw new Error('Seuls les postes clôturés peuvent être validés.');
        }

        const now = Timestamp.now();
        const startAt = cur.startTime || cur.openedAt || now;
        const endAt = cur.endTime || now; // PATCH: assure une date de fin

        const rcpt = {
          shiftId: shift.id, userId: shift.userId, userCode: shift.userCode || '',
          companyId: user.companyId, agencyId: user.agencyId,
          totalAmount: agg?.amount ?? (cur.totalAmount || 0),
          cashExpected: computedCashExpected || 0, cashReceived: cashRcv,
          mmExpected: computedMmExpected || 0, mmReceived: mmRcv,
          accountantId: accountant.id,
          accountantName: accountant.displayName || accountant.email || '',
          accountantCode,
          createdAt: now,
          type: 'reception_caisse',
          note: 'Réception espèces validée.',
        };

        tx.set(newRef, rcpt);

        // ⚠️ Après validation comptable, on NE passe PAS le shift en "validated".
        // Il reste "closed" et sort de la liste "Réceptions à valider".
        tx.update(shiftRef, {
          status: 'closed',
          endTime: endAt,
          accountantId: accountant.id,
          accountantName: accountant.displayName || accountant.email || '',
          accountantCode,
          validatedAt: now,
          cashReceived: cashRcv,
          mmReceived: mmRcv,
          cashExpected: computedCashExpected || 0,
          mmExpected: computedMmExpected || 0,
          comptable: {
            ...(cur.comptable || {}),
            validated: true,
            at: now,
            by: { id: accountant.id, name: accountant.displayName || accountant.email || '' },
            note: 'Réception espèces validée (comptabilité)',
          },
        });

        tx.set(reportRef, {
          startAt,
          endAt,
          accountantValidated: true,
          accountantValidatedAt: now,
          cashExpected: computedCashExpected || 0,
          cashReceived: cashRcv,
          mmExpected: computedMmExpected || 0,
          mmReceived: mmRcv,
          accountantStamp: {
            by: { id: accountant.id, code: accountantCode, name: accountant.displayName || accountant.email || '' },
            at: now,
            note: 'Réception espèces validée (comptabilité)',
          },
          updatedAt: now,
        }, { merge: true });
      });

      setReceptionInputs(prev => ({ ...prev, [shift.id]: { cashReceived: '' } }));
      alert('Réception enregistrée ✓');
      if (newReceiptId) navigate(`/agence/receipt/${newReceiptId}`);
    } catch (e: any) {
      alert(e?.message || 'Erreur lors de la validation.');
    } finally {
      setSavingShiftIds(p => ({ ...p, [shift.id]: false }));
    }
  }, [user?.companyId, user?.agencyId, accountant, accountantCode, receptionInputs, aggByShift, navigate, savingShiftIds]);

  /* ---------- Rapport (fallback + dédup) ---------- */
  const loadReportForShift = useCallback(async (shiftId: string) => {
    if (!user?.companyId || !user?.agencyId || !shiftId) { setTickets([]); setDedupCollapsed(0); return; }
    setLoadingReport(true);
    setSelectedShiftForReport(shiftId);

    const base = `companies/${user.companyId}/agences/${user.agencyId}`;
    const rRef = collection(db, `${base}/reservations`);
    const sRef = doc(db, `${base}/shifts/${shiftId}`);
    const sSnap = await getDoc(sRef);
    const sDoc: any = sSnap.exists() ? sSnap.data() : {};
    const startRaw = sDoc.startTime?.toDate?.() ?? sDoc.openedAt?.toDate?.() ?? null;
    const endRaw   = sDoc.endTime?.toDate?.()   ?? sDoc.closedAt?.toDate?.()   ?? null;
    const userId   = sDoc.userId || sDoc.openedById || '';
    const userCode = sDoc.userCode || sDoc.openedByCode || '';

    const start = startRaw ? new Date(startRaw.getTime() - 5 * 60 * 1000) : null;
    const end   = endRaw   ? new Date(endRaw.getTime()   + 6 * 60 * 60 * 1000) : null;

    const snap1 = await getDocs(query(
      rRef,
      where('shiftId','==', shiftId),
      where('canal', '==', 'guichet'),
      orderBy('createdAt','asc')
    ));

    let extraDocs: any[] = [];
    if (start && end) {
      const snapAll = await getDocs(query(
        rRef,
        where('createdAt','>=', Timestamp.fromDate(start)),
        orderBy('createdAt','asc')
      ));
      extraDocs = snapAll.docs.filter(d => {
        const r = d.data() as any;
        const dt = r.createdAt?.toDate?.() ?? new Date(0);
        const inRange = dt >= start && dt <= end;
        const canal = String(r.canal || '').toLowerCase();
        const isCounter = canal === 'guichet' ||
                          (canal === '' && String(r.paiement||'').toLowerCase().includes('esp'));
        const sameSeller =
          (!!userId   && r.guichetierId   === userId) ||
          (!!userCode && r.guichetierCode === userCode);
        const noShiftId = !r.shiftId || r.shiftId === '';
        return inRange && isCounter && sameSeller && noShiftId;
      });
    }

    const mk = (d:any) => {
      const r = d.data() as any;
      return {
        id: d.id, referenceCode: r.referenceCode, date: r.date, heure: r.heure,
        depart: r.depart, arrivee: r.arrivee, nomClient: r.nomClient, telephone: r.telephone,
        seatsGo: r.seatsGo || 1, seatsReturn: r.seatsReturn || 0, montant: r.montant || 0,
        paiement: r.paiement, createdAt: r.createdAt, guichetierCode: r.guichetierCode || '', canal: r.canal,
      } as TicketRow;
    };

    const rawDocs = [...snap1.docs, ...extraDocs];
    const raw = rawDocs.map(mk).filter(r =>
      String(r.canal||'').toLowerCase() === 'guichet' ||
      (String(r.canal||'') === '' && String(r.paiement||'').toLowerCase().includes('esp'))
    );

    const norm = (v?: string) => String(v || '').normalize('NFKC').replace(/\s+/g,' ').trim().toLowerCase();
    const keyOf = (t: TicketRow) =>
      (t.referenceCode && norm(t.referenceCode)) ||
      [norm(t.date), norm(t.heure), norm(t.depart), norm(t.arrivee), norm(t.nomClient), norm(t.telephone)].join('|');

    const map = new Map<string, TicketRow>();
    for (const t of raw) {
      const k = keyOf(t);
      const prev = map.get(k);
      if (!prev) map.set(k, t);
      else {
        const prevTs = (prev.createdAt?.toMillis?.() ?? 0);
        const curTs  = (t.createdAt?.toMillis?.() ?? 0);
        map.set(k, curTs >= prevTs ? t : prev);
      }
    }

    const rows = [...map.values()].sort((a,b)=>(a.createdAt?.toMillis?.() ?? 0) - (b.createdAt?.toMillis?.() ?? 0));
    setTickets(rows);
    setDedupCollapsed(raw.length - rows.length);
    setLoadingReport(false);
  }, [user?.companyId, user?.agencyId]);

  const totals = useMemo(() => {
    const agg = { billets: 0, montant: 0 };
    for (const t of tickets) {
      const nb = (t.seatsGo || 0) + (t.seatsReturn || 0);
      agg.billets += nb; agg.montant += t.montant || 0;
    }
    return agg;
  }, [tickets]);

  const liveTotalsGlobal = useMemo(() => {
    let reservations = 0, tickets = 0, amount = 0;
    for (const s of activeShifts) {
      const lv = liveStats[s.id];
      if (lv) { reservations += lv.reservations; tickets += lv.tickets; amount += lv.amount; }
    }
    return { reservations, tickets, amount };
  }, [activeShifts, liveStats]);

  /* ================= CAISSE: chargement ================= */
  const currentRange = useMemo(() => {
    if (useCustomRange && rangeFrom && rangeTo) {
      const from = new Date(rangeFrom); from.setHours(0,0,0,0);
      const to = new Date(rangeTo); to.setHours(24,0,0,0);
      return { from, to };
    }
    const [y,m] = monthValue.split('-').map(Number);
    const d = new Date(y, (m||1)-1, 1);
    return { from: startOfMonth(d), to: endOfMonth(d) };
  }, [useCustomRange, rangeFrom, rangeTo, monthValue]);

  const reloadCash = useCallback(async () => {
    if (!user?.companyId || !user?.agencyId) return;
    setLoadingCash(true);

    const rRef = collection(db, `companies/${user.companyId}/agences/${user.agencyId}/cashReceipts`);
    const mRef = collection(db, `companies/${user.companyId}/agences/${user.agencyId}/cashMovements`);

    const qR = query(rRef, where('createdAt', '>=', Timestamp.fromDate(currentRange.from)), orderBy('createdAt', 'asc'));
    const qM = query(mRef, where('createdAt', '>=', Timestamp.fromDate(currentRange.from)), orderBy('createdAt', 'asc'));

    const [sr, sm] = await Promise.all([getDocs(qR), getDocs(qM)]);

    const map: Record<string, { in: number; out: number }> = {};

    sr.forEach(d => {
      const r = d.data() as any;
      const dt = r.createdAt?.toDate?.() ?? new Date();
      if (dt < currentRange.from || dt >= currentRange.to) return;
      const key = dt.toISOString().split('T')[0];
      const inc = Number(r.cashReceived || 0);
      if (!map[key]) map[key] = { in: 0, out: 0 };
      map[key].in += Math.max(0, inc);
    });

    sm.forEach(d => {
      const r = d.data() as any;
      const dt = r.createdAt?.toDate?.() ?? new Date();
      if (dt < currentRange.from || dt >= currentRange.to) return;
      const key = dt.toISOString().split('T')[0];
      const kind = String(r.kind || '');
      const amount = Number(r.amount || 0);
      if (!map[key]) map[key] = { in: 0, out: 0 };
      if (kind === 'depense' || kind === 'transfert_banque') {
        map[key].out += Math.max(0, amount);
      } else if (kind === 'entree_manual') {
        map[key].in += Math.max(0, amount);
      }
    });

    const sortedKeys = Object.keys(map).sort();
    let running = 0;
    const rows: CashDay[] = [];
    let IN = 0, OUT = 0;
    for (const k of sortedKeys) {
      const e = map[k].in || 0;
      const s = map[k].out || 0;
      if (e === 0 && s === 0) continue;
      running += e - s;
      IN += e; OUT += s;
      rows.push({ dateISO: k, entrees: e, sorties: s, solde: running });
    }

    setDays(rows);
    setTotIn(IN);
    setTotOut(OUT);
    setLoadingCash(false);
  }, [user?.companyId, user?.agencyId, currentRange]);

  useEffect(() => { void reloadCash(); }, [reloadCash]);

  /* ========== Caisse: nouvelles sorties ========== */
  const createOutMovement = async () => {
    if (!user?.companyId || !user?.agencyId) return;
    const amount = Number(outForm.montant || 0);
    if (!Number.isFinite(amount) || amount <= 0) { alert('Montant invalide'); return; }
    const payload = {
      kind: outForm.kind,
      amount,
      label: outForm.libelle || (outForm.kind === 'transfert_banque' ? 'Transfert vers banque' : 'Dépense'),
      bankName: outForm.kind === 'transfert_banque' ? (outForm.banque || '') : '',
      note: outForm.note || '',
      companyId: user.companyId,
      agencyId: user.agencyId,
      accountantId: accountant?.id || null,
      accountantCode,
      createdAt: Timestamp.now(),
    };
    await addDoc(collection(db, `companies/${user.companyId}/agences/${user.agencyId}/cashMovements`), payload);
    setShowOutModal(false);
    setOutForm({ kind: 'depense', montant: '', libelle: '', banque: '', note: '' });
    await reloadCash();
  };

  const findShift = useCallback(
    (id?: string) => [...activeShifts, ...pausedShifts, ...closedShifts, ...validatedShifts].find(s => s.id === id),
    [activeShifts, pausedShifts, closedShifts, validatedShifts]
  );

  /* ============================ UI ============================ */
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <div className="sticky top-0 z-10 border-b bg-white/85 backdrop-blur supports-[backdrop-filter]:bg-white/65">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {companyLogo
              ? <img src={companyLogo} alt="logo" className="h-10 w-10 rounded-xl object-contain border bg-white p-1" />
              : <div className="h-10 w-10 rounded-xl bg-gray-200 grid place-items-center"><Building2 className="h-5 w-5 text-gray-600"/></div>}
            <div>
              <div
                className="text-lg font-extrabold tracking-tight"
                style={{background:`linear-gradient(90deg, ${theme.primary}, ${theme.secondary})`, WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent'}}
              >
                {companyName}
              </div>
              <div className="text-xs text-gray-600 flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5"/><span>{agencyName}</span>
              </div>
            </div>
          </div>

          <div className="inline-flex rounded-2xl p-1 bg-slate-100 shadow-inner">
            <TabButton active={tab==='controle'} onClick={()=>setTab('controle')} label="Contrôle des postes" theme={theme}/>
            <TabButton active={tab==='receptions'} onClick={()=>setTab('receptions')} label="Réceptions de caisse" theme={theme}/>
            <TabButton active={tab==='rapports'} onClick={()=>setTab('rapports')} label="Rapports" theme={theme}/>
            <TabButton active={tab==='caisse'} onClick={()=>setTab('caisse')} label="Caisse agence" theme={theme}/>
          </div>

          <div className="flex items-center gap-2">
            <span className="px-3 py-1 rounded-lg text-xs font-medium bg-indigo-50 text-indigo-700 shadow-sm">Comptabilité</span>
            <button
              onClick={async () => { await logout(); navigate('/login'); }}
              className="ml-2 inline-flex items-center gap-1 px-3 py-2 text-sm rounded-lg border bg-white hover:bg-slate-50 shadow-sm"
              title="Déconnexion"
            >
              <LogOut className="h-4 w-4"/> Déconnexion
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* ====== CONTRÔLE ====== */}
        {tab === 'controle' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <IconKpi icon={<Ticket className="h-5 w-5"/>} label="Billets (en direct)" value={liveTotalsGlobal.tickets.toString()} theme={theme}/>
              <IconKpi icon={<Wallet className="h-5 w-5"/>} label="Montant (en direct)" value={fmtMoney(liveTotalsGlobal.amount)} theme={theme}/>
              <IconKpi icon={<Activity className="h-5 w-5"/>} label="Réservations (en direct)" value={liveTotalsGlobal.reservations.toString()} theme={theme}/>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <MiniStat tone="indigo" label="En attente"  value={pendingShifts.length}/>
              <MiniStat tone="green"  label="En service"  value={activeShifts.length}/>
              <MiniStat tone="amber"  label="En pause"    value={pausedShifts.length}/>
              <MiniStat tone="rose"   label="Clôturés"    value={closedShifts.length}/>
              <MiniStat tone="slate"  label="Validés"     value={validatedShifts.length}/>
            </div>

            <SectionShifts
              title="Postes en attente d’activation"
              hint="Le guichetier est connecté mais ne peut pas vendre tant que vous n’activez pas."
              icon={<Clock4 className="h-5 w-5" />}
              list={pendingShifts}
              usersCache={usersCache}
              liveStats={{}}
              theme={theme}
              actions={(s) => (
                <GradientButton onClick={() => activateShift(s.id)} theme={theme}>
                  Activer
                </GradientButton>
              )}
            />

            <SectionShifts
              title="Postes en service"
              hint="Statistiques mises à jour en direct."
              icon={<Play className="h-5 w-5" />}
              list={activeShifts}
              usersCache={usersCache}
              liveStats={liveStats}
              theme={theme}
              actions={(s) => (
                <div className="flex gap-2">
                  <OutlineButton onClick={() => pauseShift(s.id)}><Pause className="h-4 w-4 mr-1 inline" /> Pause</OutlineButton>
                  <GradientButton
                    onClick={() => {
                      if (confirm('Clôturer ce poste maintenant ?')) closeShift(s.id, { forcedByAccountant: true });
                    }}
                    theme={theme}
                  >
                    <StopCircle className="h-4 w-4 mr-1 inline" /> Clôturer
                  </GradientButton>
                </div>
              )}
            />

            <SectionShifts
              title="Postes en pause"
              hint="Peuvent être remis en service."
              icon={<Pause className="h-5 w-5" />}
              list={pausedShifts}
              usersCache={usersCache}
              liveStats={{}}
              theme={theme}
              actions={(s) => (
                <div className="flex gap-2">
                  <GradientButton onClick={() => continueShift(s.id)} theme={theme}>Continuer</GradientButton>
                  <OutlineButton onClick={() => { if (confirm('Clôturer ce poste ?')) closeShift(s.id, { forcedByAccountant: true }); }}>Clôturer</OutlineButton>
                </div>
              )}
            />
          </div>
        )}

        {/* ====== RÉCEPTIONS ====== */}
        {tab === 'receptions' && (
          <div className="space-y-4">
            <SectionHeader
              icon={<HandIcon className="h-5 w-5" />}
              title="Réceptions à valider"
              subtitle="Validez la remise d’espèces des postes clôturés."
            />

            {(() => {
              // ✅ IMPORTANT: ne montrer que les postes *non encore validés* par le comptable.
              const toReceive = closedShifts.filter(s => !s.comptable?.validated);
              if (toReceive.length === 0) return <Empty> Aucune clôture en attente.</Empty>;
              return (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {toReceive.map(s => {
                    const payBy = s.payBy || {};
                    const inputs = receptionInputs[s.id] || { cashReceived: '' };

                    const agg = aggByShift[s.id];
                    const reservationsAgg = agg?.reservations ?? s.totalReservations ?? 0;
                    const ticketsAgg = agg?.tickets ?? s.totalTickets ?? 0;
                    const amountAgg = agg?.amount ?? s.totalAmount ?? 0;
                    const cashExpectedAgg = agg?.cashExpected ?? (payBy['espèces'] ?? s.cashExpected ?? 0);
                    const mmExpectedAgg = agg?.mmExpected ?? (payBy['mobile_money'] ?? s.mmExpected ?? 0);

                    const cashReceived = Number((inputs.cashReceived || '').replace(/[^\d.]/g,''));
                    const ecart = (Number.isFinite(cashReceived) ? cashReceived : 0) - (cashExpectedAgg || 0);
                    const disableValidate = !Number.isFinite(cashReceived) || cashReceived < 0;

                    const ui = usersCache[s.userId] || {};
                    const name = ui.name || s.userName || s.userEmail || s.userId;
                    const code = ui.code || s.userCode || '—';

                    return (
                      <div key={s.id} className="rounded-2xl border bg-white p-4 shadow-sm hover:shadow-md transition-shadow">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-xs text-gray-500">Guichetier</div>
                            <div className="font-semibold">{name} <span className="text-gray-500 text-xs">({code})</span></div>
                          </div>
                          {/* PATCH UI: ne plus afficher l'ID de poste */}
                          <div className="text-right">
                            <div className="text-xs text-gray-500">Poste</div>
                            <div className="font-medium text-gray-400">&nbsp;</div>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3 mt-3 text-sm">
                          <Info label="Début" value={s.startTime ? fmtDT(new Date(s.startTime.toDate?.() ?? s.startTime)) : '—'} />
                          <Info label="Fin" value={s.endTime ? fmtDT(new Date(s.endTime.toDate?.() ?? s.endTime)) : '—'} />
                          <Info label="Réservations" value={reservationsAgg.toString()} />
                          <Info label="Billets" value={ticketsAgg.toString()} />
                          <Info label="Montant total" value={fmtMoney(amountAgg)} />
                          <Info label="Espèces (attendu)" value={fmtMoney(cashExpectedAgg)} />
                          <Info label="Mobile Money (info)" value={fmtMoney(mmExpectedAgg)} />
                        </div>

                        {mmExpectedAgg > 0 && (
                          <div className="mt-2 flex items-start gap-2 text-xs text-slate-700 bg-slate-50 border border-slate-100 p-2 rounded">
                            <InfoIcon className="h-4 w-4 mt-[1px]" />
                            <span>Mobile Money : paiements en ligne (non remis par le guichetier).</span>
                          </div>
                        )}

                        <div className="mt-3 grid grid-cols-2 gap-2">
                          <div className="col-span-2 sm:col-span-1">
                            <div className="text-xs text-gray-600 mb-1">Espèces reçues</div>
                            <input
                              type="number" min="0" inputMode="numeric"
                              className="w-full border rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2"
                              style={{outlineColor: theme.primary}}
                              placeholder="0"
                              value={inputs.cashReceived}
                              onChange={e => setReceptionInput(s.id, e.target.value)}
                            />
                          </div>
                          <div className="col-span-2 sm:col-span-1">
                            <div className="text-xs text-gray-600 mb-1">Écart (reçu - attendu)</div>
                            <div className={`w-full border rounded-lg px-3 py-2 bg-gray-50 ${ecart === 0 ? 'text-gray-700' : ecart > 0 ? 'text-green-700' : 'text-red-700'}`}>
                              {Number.isFinite(ecart) ? fmtMoney(ecart) : '—'}
                            </div>
                          </div>
                        </div>

                        <div className="mt-3 flex items-center justify-between">
                          <OutlineButton onClick={() => { setTab('rapports'); loadReportForShift(s.id); }}>
                            <FileText className="h-4 w-4 inline mr-1" /> Voir détails
                          </OutlineButton>
                          <GradientButton disabled={disableValidate || !!savingShiftIds[s.id]} onClick={() => validateReception(s)} theme={theme}>
                            <CheckCircle2 className="h-4 w-4 inline mr-1" /> Valider la réception
                          </GradientButton>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        )}

        {/* ====== RAPPORTS ====== */}
        {tab === 'rapports' && (
          <div className="space-y-4">
            <div className="rounded-2xl border shadow-sm p-4 bg-white">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-lg font-bold">
                  <FileText className="h-5 w-5" /> Rapports par poste
                </div>
                <select
                  className="border rounded-lg px-3 py-2 text-sm bg-white shadow-sm"
                  value={selectedShiftForReport}
                  onChange={(e) => loadReportForShift(e.target.value)}
                >
                  <option value="">— Choisir un poste —</option>
                  {[...activeShifts, ...pausedShifts, ...closedShifts, ...validatedShifts].map(s => {
                    const ui   = usersCache[s.userId] || {};
                    const name = ui.name || s.userName || s.userEmail || s.userId;
                    const code = ui.code || s.userCode || '—';
                    const start = s.startTime ? new Date(s.startTime.toDate?.() ?? s.startTime) : null;
                    const end   = s.endTime   ? new Date(s.endTime.toDate?.()   ?? s.endTime)   : null;

                    const statutFr =
                      s.status === 'active'    ? 'En service'  :
                      s.status === 'paused'    ? 'En pause'    :
                      s.status === 'closed'    ? 'Clôturé'     :
                      s.status === 'validated' ? 'Validé'      : 'En attente';

                    const periode = `${fmtDT(start)} → ${fmtDT(end)}`;

                    return <option key={s.id} value={s.id}>{`${name} (${code}) — ${periode} — ${statutFr}`}</option>;
                  })}
                </select>
              </div>
              <div className="text-sm text-gray-500 mt-1">
                Sélectionnez un poste pour lister ses réservations guichet (paiement espèces).
                {dedupCollapsed > 0 && (
                  <span className="ml-2 text-xs text-slate-500">
                    {dedupCollapsed} doublon{dedupCollapsed>1?'s':''} consolidé{dedupCollapsed>1?'s':''}.
                  </span>
                )}
              </div>

              {selectedShiftForReport && (() => {
                const s = findShift(selectedShiftForReport);
                const start = s?.startTime ? new Date(s.startTime.toDate?.() ?? s.startTime) : null;
                const end   = s?.endTime   ? new Date(s.endTime.toDate?.()   ?? s.endTime)   : null;
                return (
                  <div className="mt-1 text-xs text-slate-500">
                    Période du poste : {fmtDT(start)} → {fmtDT(end)}
                  </div>
                );
              })()}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <IconKpi icon={<Ticket className="h-5 w-5"/>} label="Billets" value={totals.billets.toString()} theme={theme}/>
              <IconKpi icon={<Wallet className="h-5 w-5"/>} label="Montant" value={fmtMoney(totals.montant)} theme={theme}/>
              <IconKpi icon={<Activity className="h-5 w-5"/>} label="Réservations" value={tickets.length.toString()} theme={theme}/>
            </div>

            <div className="rounded-2xl border bg-white p-4 shadow-sm">
              <div className="font-semibold mb-3">Détails des réservations</div>
              {loadingReport ? (
                <div className="text-gray-500">Chargement…</div>
              ) : !tickets.length ? (
                <Empty>Aucune donnée pour ce poste.</Empty>
              ) : (
                <div className="overflow-hidden rounded-lg border">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50">
                      <tr>
                        <Th>Date</Th><Th>Heure</Th><Th>Trajet</Th><Th>Client</Th><Th>Tél.</Th>
                        <Th align="right">Billets</Th><Th align="right">Montant</Th><Th align="right">Paiement</Th><Th align="right">Vendeur</Th><Th align="right">Réf.</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {tickets.map(t => (
                        <tr key={t.id} className="border-t">
                          <Td>{fmtD(t.date)}</Td>
                          <Td>{t.heure}</Td>
                          <Td>{t.depart} → {t.arrivee}</Td>
                          <Td>{t.nomClient}</Td>
                          <Td>{t.telephone || ''}</Td>
                          <Td align="right">{(t.seatsGo||0)+(t.seatsReturn||0)}</Td>
                          <Td align="right">{fmtMoney(t.montant)}</Td>
                          <Td align="right">{t.paiement || ''}</Td>
                          <Td align="right">{t.guichetierCode || ''}</Td>
                          <Td align="right"><span className="text-xs text-gray-500">{t.referenceCode || t.id}</span></Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ====== CAISSE ====== */}
        {tab === 'caisse' && (
          <div className="space-y-4">
            <div className="rounded-2xl border shadow-sm p-4 bg-white">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-lg font-bold">
                  <Banknote className="h-5 w-5" /> Caisse agence
                </div>
                <div className="flex items-center gap-2">
                  <button className="px-3 py-2 rounded-lg border text-sm bg-white hover:bg-slate-50"
                          onClick={() => setShowOutModal(true)}>
                    <Plus className="h-4 w-4 inline mr-1" /> Nouveau transfert / dépense
                  </button>
                  <button
                    className="px-3 py-2 rounded-lg border text-sm bg-white hover:bg-slate-50"
                    onClick={() => exportCsv(days)}
                    title="Exporter CSV"
                  >
                    <Download className="h-4 w-4 inline mr-1" /> Export CSV
                  </button>
                </div>
              </div>

              {/* Filtres */}
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={useCustomRange} onChange={(e)=>setUseCustomRange(e.target.checked)} />
                  Période personnalisée
                </label>
                {!useCustomRange && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-600">Mois :</span>
                    <input type="month" className="border rounded-lg px-3 py-2 text-sm"
                      value={monthValue} onChange={(e)=>setMonthValue(e.target.value)} />
                  </div>
                )}
                {useCustomRange && (
                  <>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-600">Du</span>
                      <input type="date" className="border rounded-lg px-3 py-2 text-sm"
                        value={rangeFrom} onChange={(e)=>setRangeFrom(e.target.value)} />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-600">Au</span>
                      <input type="date" className="border rounded-lg px-3 py-2 text-sm"
                        value={rangeTo} onChange={(e)=>setRangeTo(e.target.value)} />
                    </div>
                  </>
                )}
                <button className="px-3 py-2 rounded-lg border text-sm bg-white hover:bg-slate-50" onClick={reloadCash}>Actualiser</button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <IconKpi icon={<Wallet className="h-5 w-5"/>} label="Entrées (période)" value={fmtMoney(totIn)} theme={theme}/>
              <IconKpi icon={<AlertTriangle className="h-5 w-5"/>} label="Sorties (période)" value={fmtMoney(totOut)} theme={theme}/>
              <IconKpi icon={<Banknote className="h-5 w-5"/>} label="Solde (période)" value={fmtMoney(totIn - totOut)} theme={theme}/>
            </div>

            <div className="rounded-2xl border bg-white p-4 shadow-sm">
              <div className="font-semibold mb-3">Journal (jours avec mouvements)</div>
              {loadingCash ? (
                <div className="text-gray-500">Chargement…</div>
              ) : days.length === 0 ? (
                <Empty>Aucun mouvement sur la période.</Empty>
              ) : (
                <div className="overflow-hidden rounded-lg border">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50">
                      <tr>
                        <Th>Date</Th>
                        <Th align="right">Entrées</Th>
                        <Th align="right">Sorties</Th>
                        <Th align="right">Solde</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {days.map(d => (
                        <tr key={d.dateISO} className="border-t">
                          <Td>{new Date(d.dateISO).toLocaleDateString('fr-FR',{weekday:'long', day:'numeric', month:'long', year:'numeric'})}</Td>
                          <Td align="right">{fmtMoney(d.entrees)}</Td>
                          <Td align="right">{fmtMoney(d.sorties)}</Td>
                          <Td align="right">{fmtMoney(d.solde)}</Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* MODAL SORTIE / TRANSFERT */}
      {showOutModal && (
        <div className="fixed inset-0 bg-black/40 grid place-items-center z-20">
          <div className="w-[520px] max-w-[95vw] bg-white rounded-2xl p-4 shadow-lg">
            <div className="text-lg font-bold mb-3">Nouveau transfert / dépense</div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <label className="text-sm flex items-center gap-2">
                  <input type="radio" name="kind" checked={outForm.kind==='depense'} onChange={()=>setOutForm(f=>({...f,kind:'depense'}))}/> Dépense
                </label>
                <label className="text-sm flex items-center gap-2">
                  <input type="radio" name="kind" checked={outForm.kind==='transfert_banque'} onChange={()=>setOutForm(f=>({...f,kind:'transfert_banque'}))}/> Transfert banque
                </label>
              </div>
              <input className="w-full border rounded-lg px-3 py-2" placeholder="Libellé"
                     value={outForm.libelle} onChange={e=>setOutForm(f=>({...f,libelle:e.target.value}))}/>
              {outForm.kind==='transfert_banque' && (
                <input className="w-full border rounded-lg px-3 py-2" placeholder="Banque / Compte"
                       value={outForm.banque} onChange={e=>setOutForm(f=>({...f,banque:e.target.value}))}/>
              )}
              <input type="number" min="0" inputMode="numeric" className="w-full border rounded-lg px-3 py-2"
                     placeholder="Montant" value={outForm.montant}
                     onChange={e=>setOutForm(f=>({...f, montant:e.target.value}))}/>
              <textarea className="w-full border rounded-lg px-3 py-2" placeholder="Note (facultatif)"
                        value={outForm.note} onChange={e=>setOutForm(f=>({...f, note:e.target.value}))}/>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <OutlineButton onClick={()=>setShowOutModal(false)}>Annuler</OutlineButton>
              <GradientButton onClick={createOutMovement} theme={theme}>
                <Plus className="h-4 w-4 inline mr-1"/> Enregistrer
              </GradientButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/* =================== UI SUB-COMPONENTS =================== */
const TabButton: React.FC<{active:boolean; onClick:()=>void; label:string; theme:{primary:string;secondary:string}}> = ({active,onClick,label,theme}) => (
  <button
    className={`px-4 py-2 rounded-2xl text-sm font-medium transition-all ${active ? 'text-white shadow' : 'hover:bg-white'}`}
    onClick={onClick}
    style={active ? { background:`linear-gradient(90deg, ${theme.primary}, ${theme.secondary})` } : {}}
  >
    {label}
  </button>
);

const GradientButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & {theme:{primary:string;secondary:string}}> = ({theme, className='', ...p}) => (
  <button {...p}
    className={`px-3 py-2 rounded-lg text-white text-sm shadow-sm disabled:opacity-50 ${className}`}
    style={{ background:`linear-gradient(90deg, ${theme.primary}, ${theme.secondary})` }}
  />
);

const OutlineButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>> = (p) => (
  <button {...p} className="px-3 py-2 rounded-lg border text-sm bg-white hover:bg-slate-50 shadow-sm" />
);

const IconKpi: React.FC<{icon:React.ReactNode; label:string; value:string; theme:{primary:string;secondary:string}}> = ({icon,label,value,theme}) => (
  <div className="rounded-2xl border p-4 bg-white shadow-sm hover:shadow-md transition-shadow">
    <div className="flex items-center justify-between">
      <div className="text-sm text-gray-500">{label}</div>
      <div className="h-8 w-8 rounded-lg grid place-items-center"
           style={{background:`linear-gradient(45deg, ${theme.primary}22, ${theme.secondary}22)`}}>
        <span className="text-gray-700">{icon}</span>
      </div>
    </div>
    <div className="text-2xl font-extrabold mt-1">{value}</div>
  </div>
);

const MiniStat: React.FC<{tone:'indigo'|'green'|'amber'|'rose'|'slate'; label:string; value:number}> = ({tone,label,value}) => {
  const map:any = {
    indigo: ['bg-indigo-50','text-indigo-700'],
    green:  ['bg-green-50','text-green-700'],
    amber:  ['bg-amber-50','text-amber-700'],
    rose:   ['bg-rose-50','text-rose-700'],
    slate:  ['bg-slate-50','text-slate-700'],
  };
  return (
    <div className="rounded-2xl border p-4 bg-white shadow-sm">
      <div className={`inline-flex px-2 py-0.5 rounded ${map[tone][0]} text-xs ${map[tone][1]}`}>{label}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
    </div>
  );
};

const SectionHeader: React.FC<{icon:React.ReactNode; title:string; subtitle?:string}> = ({icon,title,subtitle}) => (
  <div className="rounded-2xl border shadow-sm p-4 bg-white">
    <div className="flex items-center gap-2 text-lg font-bold">{icon} {title}</div>
    {subtitle && <div className="text-sm text-gray-500 mt-1">{subtitle}</div>}
  </div>
);

const SectionShifts: React.FC<{
  title: string; hint?: string; icon: React.ReactNode;
  list: ShiftDoc[];
  usersCache: Record<string, { name?: string; email?: string; code?: string }>;
  liveStats: Record<string, { reservations: number; tickets: number; amount: number }>;
  actions: (s: ShiftDoc) => React.ReactNode;
  theme:{primary:string;secondary:string};
}> = ({ title, hint, icon, list, usersCache, liveStats, actions }) => (
  <div className="rounded-2xl border shadow-sm p-4 bg-white">
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2 text-lg font-bold">{icon}<span>{title}</span></div>
      <div className="text-xs font-medium px-2 py-1 rounded bg-slate-100 text-slate-700 shadow-inner">
        {list.length} poste{list.length>1?'s':''}
      </div>
    </div>
    {hint && <div className="text-sm text-gray-500 mt-1">{hint}</div>}

    {list.length === 0 ? (
      <Empty>Aucun poste.</Empty>
    ) : (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
        {list.map(s => {
          const ui = usersCache[s.userId] || {};
          const name = ui.name || s.userName || s.userEmail || s.userId;
          const code = ui.code || s.userCode || '—';
          const live = liveStats[s.id];
          const reservations = (live?.reservations ?? s.totalReservations ?? 0);
          const tickets = (live?.tickets ?? s.totalTickets ?? 0);
          const amount = (live?.amount ?? s.totalAmount ?? 0);

          return (
            <div key={s.id} className="rounded-xl border p-3 bg-white shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs text-gray-500">Guichetier</div>
                  <div className="font-semibold">{name} <span className="text-gray-500 text-xs">({code})</span></div>
                </div>
                {/* PATCH UI: ne plus afficher l'ID de poste */}
                <div className="text-right">
                  <div className="text-xs text-gray-500">Poste</div>
                  <div className="font-medium text-gray-400">&nbsp;</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 mt-3 text-sm">
                <Info label="Début" value={s.startTime ? new Date(s.startTime.toDate?.() ?? s.startTime).toLocaleString('fr-FR') : '—'} />
                <Info label="Fin" value={s.endTime ? new Date(s.endTime.toDate?.() ?? s.endTime).toLocaleString('fr-FR') : '—'} />
                <Info label="Réservations" value={reservations.toString()} />
                <Info label="Billets" value={tickets.toString()} />
                <Info label="Montant" value={fmtMoney(amount)} />
              </div>

              <div className="mt-3 flex items-center justify-end gap-2">
                {actions(s)}
              </div>
            </div>
          );
        })}
      </div>
    )}
  </div>
);

const Info: React.FC<{label: string; value: string;}> = ({ label, value }) => (
  <div>
    <div className="text-xs text-gray-500">{label}</div>
    <div className="font-medium">{value}</div>
  </div>
);

const Empty: React.FC<{children:React.ReactNode}> = ({children}) => (
  <div className="text-gray-500 rounded-2xl border bg-white p-6 text-center shadow-sm">{children}</div>
);

const Th: React.FC<{children:React.ReactNode; align?:"left"|"right"}> = ({children,align="left"}) => (
  <th className={`px-3 py-2 ${align === 'right' ? 'text-right' : 'text-left'} font-semibold text-slate-700`}>{children}</th>
);
const Td: React.FC<{children:React.ReactNode; align?:"left"|"right"}> = ({children,align="left"}) => (
  <td className={`px-3 py-2 ${align === 'right' ? 'text-right' : 'text-left'}`}>{children}</td>
);

/* CSV export simple */
function exportCsv(rows: CashDay[]) {
  if (!rows.length) { alert('Aucune donnée à exporter'); return; }
  const header = ['Date','Entrees','Sorties','Solde'];
  const body = rows.map(r => [
    new Date(r.dateISO).toLocaleDateString('fr-FR'),
    r.entrees, r.sorties, r.solde
  ].join(','));
  const csv = [header.join(','), ...body].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'caisse.csv';
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

export default AgenceComptabilitePage;
