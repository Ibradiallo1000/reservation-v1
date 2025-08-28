// src/pages/AgenceReservationsPage.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  collection, doc, getDoc, onSnapshot, orderBy, query, Timestamp, where,
  runTransaction
} from 'firebase/firestore';
import { db } from '@/firebaseConfig';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate, useParams } from 'react-router-dom';

/* ===================== Types ===================== */
type ModePeriode = 'day'|'range';

type AgencyUser = { name?: string; email?: string; code?: string };

type ShiftStatus = 'pending'|'active'|'paused'|'closed'|'validated';
type ShiftDoc = {
  id: string;
  userId: string;
  userName?: string;
  userEmail?: string;
  userCode?: string;
  status: ShiftStatus;
  startTime?: any;
  endTime?: any;
  comptable?: { validated?: boolean; at?: any; by?: { id?: string; name?: string }, note?: string|null };
  chef?: { validated?: boolean; at?: any; by?: { id?: string; name?: string }, note?: string|null };
};

type Reservation = {
  id: string;
  depart?: string;
  arrivee?: string;
  date?: string;   // "YYYY-MM-DD"
  heure?: string;  // "HH:mm"
  canal?: string;  // "guichet" | "en ligne" | variations
  montant?: number;
  seatsGo?: number;
  seatsReturn?: number;
  statut?: string; // "payé"
  createdAt?: any;
  shiftId?: string;
  referenceCode?: string;
  nomClient?: string;
  telephone?: string;
};

type GroupRow = {
  key: string;
  trajet: string;
  date: string;
  heure: string;
  billetsGuichet: number;
  billetsOnline: number;
  billetsTotal: number;
  montantGuichet: number;
  montantOnline: number;
  montantTotal: number;
};

/* ===================== Helpers ===================== */
const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0,0,0,0); return x; };
const endOfDay   = (d: Date) => { const x = new Date(d); x.setHours(23,59,59,999); return x; };
const fmtMoney   = (n: number) => `${(n||0).toLocaleString('fr-FR')} FCFA`;
const fmtDate    = (d: Date) => d.toLocaleDateString('fr-FR', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
const isOnline   = (raw?: string) => {
  const v = (raw||'').toString().toLowerCase().trim().replace(/\s|_|-/g,'');
  return v.includes('ligne') || v === 'online' || v === 'web';
};
const norm = (s?: string) => (s||'').normalize('NFKC').toLowerCase().replace(/\s+/g,' ').trim();

/* ===================== UI bits ===================== */
const Badge: React.FC<{color:'green'|'amber'|'gray'|'red'|'indigo'; children:React.ReactNode}> = ({color, children}) => {
  const map: Record<string, {bg:string; fg:string}> = {
    green:{bg:'#DCFCE7', fg:'#15803D'},
    amber:{bg:'#FEF3C7', fg:'#92400E'},
    gray: {bg:'#F3F4F6', fg:'#374151'},
    red:  {bg:'#FEE2E2', fg:'#B91C1C'},
    indigo:{bg:'#E0E7FF', fg:'#3730A3'}
  };
  const c = map[color];
  return <span className="px-2 py-0.5 rounded text-xs font-medium" style={{backgroundColor:c.bg,color:c.fg}}>{children}</span>;
};

const Kpi: React.FC<{label:string; value:string; icon?:React.ReactNode}> = ({label,value,icon}) => (
  <div className="rounded-2xl border bg-white p-4 shadow-sm hover:shadow-md transition-shadow">
    <div className="flex items-center justify-between">
      <div className="text-sm text-gray-500">{label}</div>
      <div className="h-8 w-8 rounded-lg grid place-items-center bg-gray-50">{icon}</div>
    </div>
    <div className="text-2xl font-extrabold mt-1">{value}</div>
  </div>
);

const OnlineCard: React.FC<{ r: Reservation; primary: string; secondary: string; }> = ({ r, primary, secondary }) => {
  const billets = (r.seatsGo||0) + (r.seatsReturn||0);
  return (
    <div
      className="relative rounded-2xl border bg-white p-4 shadow-sm hover:shadow-md transition-shadow"
      style={{ borderColor: `${primary}22` }}
      title={r.referenceCode || r.id}
    >
      <div
        className="absolute -top-2 -right-2 text-[11px] px-2 py-[2px] rounded-full"
        style={{ background: `${secondary}22`, color: '#1f2937', border:`1px solid ${secondary}55` }}
      >
        En ligne
      </div>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm text-gray-500">Trajet</div>
          <div className="font-semibold">{(r.depart||'?')} → {(r.arrivee||'?')}</div>
          <div className="text-xs text-gray-500">{r.date || '—'} • {r.heure || '—'}</div>
        </div>
        <div className="text-right">
          <div className="text-xs text-gray-500">Montant</div>
          <div className="text-lg font-extrabold" style={{ color: primary }}>{fmtMoney(r.montant||0)}</div>
          <div className="text-xs text-gray-500">Billets : <b>{billets}</b></div>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
        <div>
          <div className="text-xs text-gray-500">Client</div>
          <div className="font-medium">{r.nomClient || '—'}</div>
        </div>
        <div className="text-right">
          <div className="text-xs text-gray-500">Tél.</div>
          <div className="font-medium">{r.telephone || '—'}</div>
        </div>
      </div>
    </div>
  );
};

/* ===================== Page ===================== */
const AgenceReservationsPage: React.FC = () => {
  const { user, company } = useAuth() as any;
  const { id: agencyIdFromURL } = useParams();
  const navigate = useNavigate();

  const companyId = user?.companyId;
  const agencyId  = agencyIdFromURL || user?.agencyId;

  const theme = {
    primary: (company as any)?.couleurPrimaire || '#e85d04',
    secondary: (company as any)?.couleurSecondaire || '#ffb703',
    background: '#f7f8fa'
  };

  /* --------- Filtres période --------- */
  const [mode, setMode] = useState<ModePeriode>('day');
  const [jour, setJour] = useState<string>(() => {
    const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  });
  const [from, setFrom] = useState<string>('');
  const [to,   setTo]   = useState<string>('');
  const [range, setRange] = useState<[Date,Date]>([startOfDay(new Date()), endOfDay(new Date())]);

  useEffect(() => {
    if (mode==='day') {
      const d = jour ? new Date(jour) : new Date();
      setRange([startOfDay(d), endOfDay(d)]);
    } else {
      const f = from ? startOfDay(new Date(from)) : startOfDay(new Date());
      const t = to   ? endOfDay(new Date(to))     : endOfDay(new Date());
      setRange([f,t]);
    }
  }, [mode, jour, from, to]);

  /* --------- GUICHETS EN ACTIVITÉ (live) --------- */
  const [shifts, setShifts] = useState<ShiftDoc[]>([]);
  const [usersCache, setUsersCache] = useState<Record<string, AgencyUser>>({});
  const [liveStats, setLiveStats] = useState<Record<string, {tickets:number; amount:number}>>({});
  const liveUnsubsRef = useRef<Record<string, () => void>>({});

  useEffect(() => {
    if (!companyId || !agencyId) return;
    const ref = collection(db, `companies/${companyId}/agences/${agencyId}/shifts`);
    const unsub = onSnapshot(ref, async snap => {
      const all = snap.docs.map(d => {
        const r = d.data() as any;
        const s: ShiftDoc = {
          id:d.id, userId: r.userId || r.openedById || '',
          userName: r.userName || r.openedByName || r.userEmail || '',
          userEmail: r.userEmail, userCode: r.userCode || r.openedByCode || '',
          status: r.status as ShiftStatus,
          startTime: r.startTime || r.openedAt,
          endTime: r.endTime || r.closedAt,
          comptable: r.comptable, chef: r.chef
        };
        return s;
      });

      const need = Array.from(new Set(all.map(s => s.userId).filter(uid => !!uid && !usersCache[uid])));
      if (need.length) {
        const pairs = await Promise.all(need.map(async uid => {
          const us = await getDoc(doc(db, 'users', uid));
          const ud = us.exists() ? (us.data() as any) : {};
          return [uid, { name: ud.displayName || ud.nom || ud.email || '', email: ud.email || '', code: ud.staffCode || ud.codeCourt || ud.code || '' }] as const;
        }));
        setUsersCache(prev => Object.fromEntries([...Object.entries(prev), ...pairs]));
      }

      // ✅ NE PAS cacher les postes "validated" si le CHEF n'a pas encore validé
      const list = all.filter(s => !(s.status === 'validated' && s.chef?.validated));
      setShifts(list);
    });

    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, agencyId]);

  // live stats (guichet + payé)
  useEffect(() => {
    if (!companyId || !agencyId) return;
    const rRef = collection(db, `companies/${companyId}/agences/${agencyId}/reservations`);

    for (const id of Object.keys(liveUnsubsRef.current)) {
      if (!shifts.find(s => s.id === id && s.status==='active')) {
        liveUnsubsRef.current[id]?.();
        delete liveUnsubsRef.current[id];
      }
    }

    for (const s of shifts) {
      if (s.status !== 'active') continue;
      if (liveUnsubsRef.current[s.id]) continue;

      const qy = query(
        rRef,
        where('shiftId','==',s.id),
        where('statut','==','payé'),
        where('canal','==','guichet')
      );
      liveUnsubsRef.current[s.id] = onSnapshot(qy, ss => {
        let tickets=0, amount=0;
        ss.forEach(d => {
          const r = d.data() as any;
          const seats = (r.seatsGo||0) + (r.seatsReturn||0);
          tickets += seats;
          amount  += r.montant || 0;
        });
        setLiveStats(prev => ({...prev, [s.id]:{tickets, amount}}));
      });
    }

    return () => { for (const k of Object.keys(liveUnsubsRef.current)) liveUnsubsRef.current[k]?.(); liveUnsubsRef.current = {}; };
  }, [shifts, companyId, agencyId]);

  /* --------- RÉSERVATIONS (période) — TEMPS RÉEL --------- */
  const [rows, setRows] = useState<Reservation[]>([]);
  useEffect(() => {
    if (!companyId || !agencyId || !range[0] || !range[1]) return;
    const rRef = collection(db, `companies/${companyId}/agences/${agencyId}/reservations`);
    const qy = query(
      rRef,
      where('createdAt','>=', Timestamp.fromDate(range[0])),
      where('createdAt','<=', Timestamp.fromDate(range[1])),
      where('statut','==','payé'),
      orderBy('createdAt','asc')
    );
    const unsub = onSnapshot(qy, snap => {
      const list: Reservation[] = snap.docs.map(d => ({ id:d.id, ...(d.data() as any) }));
      setRows(list);
    });
    return () => unsub();
  }, [companyId, agencyId, range]);

  /* --------- Agrégations --------- */
  const kpis = useMemo(() => {
    let gTickets=0, gMontant=0, oTickets=0, oMontant=0;
    for (const r of rows) {
      const seats = (r.seatsGo||0) + (r.seatsReturn||0);
      if (isOnline(r.canal)) { oTickets += seats; oMontant += r.montant||0; }
      else { gTickets += seats; gMontant += r.montant||0; }
    }
    return { gTickets, gMontant, oTickets, oMontant };
  }, [rows]);

  const grouped: GroupRow[] = useMemo(() => {
    const map: Record<string, GroupRow> = {};
    for (const r of rows) {
      const trajet = `${r.depart||'?' } → ${r.arrivee||'?'}`;
      const date   = r.date || '';
      const heure  = r.heure || '';
      const key    = `${trajet} • ${date} ${heure}`;
      if (!map[key]) {
        map[key] = {
          key, trajet, date, heure,
          billetsGuichet:0, billetsOnline:0, billetsTotal:0,
          montantGuichet:0, montantOnline:0, montantTotal:0
        };
      }
      const seats = (r.seatsGo||0) + (r.seatsReturn||0);
      if (isOnline(r.canal)) {
        map[key].billetsOnline += seats; map[key].montantOnline += r.montant||0;
      } else {
        map[key].billetsGuichet += seats; map[key].montantGuichet += r.montant||0;
      }
      map[key].billetsTotal  += seats;
      map[key].montantTotal  += r.montant||0;
    }
    return Object.values(map)
      .sort((a,b) => (a.date===b.date ? a.heure.localeCompare(b.heure) : a.date.localeCompare(b.date)));
  }, [rows]);

  /* --------- Rapports validés (ARCHIVE) --------- */
  const [validatedShifts, setValidatedShifts] = useState<ShiftDoc[]>([]);
  useEffect(() => {
    if (!companyId || !agencyId) return;
    const ref = collection(db, `companies/${companyId}/agences/${agencyId}/shifts`);
    return onSnapshot(ref, snap => {
      const all = snap.docs.map(d => ({ id:d.id, ...(d.data() as any) })) as any[];
      // ✅ N'afficher ici QUE les postes double-validés (Comptable + Chef)
      const list = all.filter(s => s.status==='validated' && s?.comptable?.validated && s?.chef?.validated) as ShiftDoc[];
      setValidatedShifts(list);
    });
  }, [companyId, agencyId]);

  /* --------- Réservations en ligne — Aujourd’hui --------- */
  const [onlineFilter, setOnlineFilter] = useState('');
  const [onlineSort, setOnlineSort] = useState<'recent'|'montant'|'billets'>('recent');
  const [onlineToday, setOnlineToday] = useState<Reservation[]>([]);
  useEffect(() => {
    if (!companyId || !agencyId) return;
    const todayFrom = startOfDay(new Date());
    const todayTo   = endOfDay(new Date());
    const rRef = collection(db, `companies/${companyId}/agences/${agencyId}/reservations`);
    const qy = query(
      rRef,
      where('createdAt','>=', Timestamp.fromDate(todayFrom)),
      where('createdAt','<=', Timestamp.fromDate(todayTo)),
      where('statut','==','payé'),
      orderBy('createdAt','desc')
    );
    const unsub = onSnapshot(qy, snap => {
      const list = snap.docs.map(d => ({ id:d.id, ...(d.data() as any) })) as Reservation[];
      setOnlineToday(list.filter(r => isOnline(r.canal)));
    });
    return () => unsub();
  }, [companyId, agencyId]);

  const onlineTodayFiltered = useMemo(() => {
    const q = norm(onlineFilter);
    let arr = onlineToday.filter(r => {
      if (!q) return true;
      const hay = `${norm(r.nomClient)}|${norm(r.telephone)}|${norm(r.depart)}|${norm(r.arrivee)}|${norm(r.referenceCode)}`;
      return hay.includes(q);
    });
    if (onlineSort === 'montant') {
      arr = arr.sort((a,b)=> (b.montant||0)-(a.montant||0));
    } else if (onlineSort === 'billets') {
      arr = arr.sort((a,b)=> ((b.seatsGo||0)+(b.seatsReturn||0))-((a.seatsGo||0)+(a.seatsReturn||0)));
    } else {
      arr = arr.sort((a,b)=> (b.createdAt?.toMillis?.()||0) - (a.createdAt?.toMillis?.()||0));
    }
    return arr;
  }, [onlineToday, onlineFilter, onlineSort]);

  /* --------- Impression --------- */
  const handleImpression = () => {
    navigate('impression-reservations', {
      state: {
        reservations: rows,
        periodLabel: `${fmtDate(range[0])} → ${fmtDate(range[1])}`,
        agencyName: user?.agencyName,
        logoUrl: (company as any)?.logoUrl,
        companyName: (company as any)?.nom,
      },
    });
  };

  /* --------- Validation Chef d’agence --------- */
  const [busyShift, setBusyShift] = useState<string | null>(null);

  const validateByManager = useCallback(async (shiftId: string) => {
    if (!companyId || !agencyId || !user?.uid) return;
    setBusyShift(shiftId);
    const base = `companies/${companyId}/agences/${agencyId}`;
    const reportRef = doc(db, `${base}/shiftReports/${shiftId}`);
    const shiftRef  = doc(db, `${base}/shifts/${shiftId}`);

    try {
      await runTransaction(db, async (tx) => {
        // 1) LIRE d'abord TOUS les docs
        const [repSnap, sSnap] = await Promise.all([tx.get(reportRef), tx.get(shiftRef)]);
        if (!sSnap.exists()) throw new Error('Poste introuvable.');

        const cur = sSnap.data() as any;
        const comptableOk = !!cur?.comptable?.validated;

        // 2) ECRIRE ensuite
        // 2a) rapport (tampon chef)
        if (!repSnap.exists()) {
          tx.set(reportRef, {
            managerValidated: true,
            managerStamp: {
              by: { id: user.uid, name: user.displayName || user.email || '' },
              at: Timestamp.now(),
              note: 'Validé par le chef d’agence',
            },
            updatedAt: Timestamp.now(),
          });
        } else {
          tx.update(reportRef, {
            managerValidated: true,
            managerStamp: {
              by: { id: user.uid, name: user.displayName || user.email || '' },
              at: Timestamp.now(),
              note: 'Validé par le chef d’agence',
            },
            updatedAt: Timestamp.now(),
          });
        }

        // 2b) shift → 'validated' seulement si comptable déjà OK
        tx.update(shiftRef, {
          status: comptableOk ? 'validated' : (cur.status || 'closed'),
          chef: {
            ...(cur.chef || {}),
            validated: true,
            at: Timestamp.now(),
            by: { id: user.uid, name: user.displayName || user.email || '' },
            note: 'Validation chef d’agence',
          },
        });
      });
    } finally {
      setBusyShift(null);
    }
  }, [companyId, agencyId, user?.uid, user?.displayName, user?.email]);

  /* ===================== UI ===================== */
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100" style={{background:theme.background}}>
      {/* Bandeau */}
      <div
        className="sticky top-0 z-10 border-b text-white"
        style={{ background: `linear-gradient(90deg, ${theme.primary}, ${theme.secondary})` }}
      >
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="text-lg font-semibold">Réservations • {user?.agencyName || 'Agence'}</div>
          <button
            onClick={handleImpression}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 focus:outline-none focus:ring-2"
            style={{outlineColor: theme.primary}}
            title="Imprimer la liste"
          >
            🖨️ Imprimer la liste
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">

        {/* Guichets en activité */}
        <div className="rounded-2xl bg-white border shadow-sm p-4">
          <div className="text-lg font-bold mb-3 flex items-center gap-2">🧾 Guichets en activité</div>
          {shifts.length===0 ? (
            <div className="text-gray-500">Aucun poste en attente / en service / en pause / clôturé.</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {shifts.map(s=>{
                const u = usersCache[s.userId] || {};
                const name = u.name || s.userName || s.userEmail || s.userId;
                const code = u.code || s.userCode || '—';

                const statusBadge = s.status==='active'
                  ? <Badge color="green">En service</Badge>
                  : s.status==='paused'
                    ? <Badge color="amber">En pause</Badge>
                    : s.status==='closed'
                      ? <Badge color="gray">Clôturé</Badge>
                      : <Badge color="indigo">En attente</Badge>;

                const live = liveStats[s.id];

                return (
                  <div key={s.id} className="rounded-xl border p-3 bg-white shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex justify-between items-start">
                      <div className="font-medium">
                        {name} <span className="text-xs text-gray-500">({code})</span>
                        <div className="mt-1">{statusBadge}</div>
                      </div>
                      <div className="text-xs text-gray-500" title={s.id}>{s.id.slice(0,6)}…</div>
                    </div>
                    <div className="text-xs text-gray-600 mt-2">
                      Début : {s.startTime ? new Date(s.startTime.toDate?.() ?? s.startTime).toLocaleString('fr-FR') : '—'}
                    </div>

                    {s.status==='active' && (
                      <div className="mt-2 text-sm text-gray-800">
                        {live
                          ? <>Billets : <b>{live.tickets}</b> • Montant : <b>{fmtMoney(live.amount)}</b></>
                          : <>Billets : — • Montant : —</>}
                      </div>
                    )}

                    <div className="mt-2 flex items-center gap-3 text-xs">
                      {s.comptable?.validated
                        ? <span className="inline-flex items-center gap-1 text-emerald-700">✅ Comptable OK</span>
                        : <span className="text-amber-700">Comptable en attente</span>}
                      {s.chef?.validated
                        ? <span className="inline-flex items-center gap-1 text-emerald-700">🗞️ Chef OK</span>
                        : <span className="text-amber-700">Chef en attente</span>}
                    </div>

                    {/* ✅ Bouton de validation Chef : visible même si status=='validated' mais chef pas encore OK */}
                    {(s.comptable?.validated && !s.chef?.validated && (['closed','paused','active','validated'] as ShiftStatus[]).includes(s.status)) && (
                      <div className="mt-3">
                        <button
                          onClick={() => validateByManager(s.id).catch(e => alert(e?.message || 'Erreur'))}
                          disabled={busyShift === s.id}
                          className="px-3 py-1.5 rounded-lg border hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2"
                          style={{outlineColor: theme.primary}}
                          title="Valider ce poste (Chef d’agence)"
                        >
                          {busyShift === s.id ? 'Validation…' : 'Valider (Chef d’agence)'}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          <div className="text-xs text-gray-500 mt-2">
            Lorsqu’un poste est <b>validé</b> (Comptable + Chef), il est archivé dans “Rapports de poste (validés)” plus bas.
          </div>
        </div>

        {/* Filtres période + KPIs */}
        <div className="rounded-2xl bg-white border shadow-sm p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="font-semibold">Période : <span className="text-gray-600">{fmtDate(range[0])} → {fmtDate(range[1])}</span></div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" name="mode" checked={mode==='day'} onChange={()=>setMode('day')}/> Jour
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" name="mode" checked={mode==='range'} onChange={()=>setMode('range')}/> Intervalle
              </label>
              {mode==='day' ? (
                <input
                  type="date"
                  className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
                  style={{outlineColor: theme.primary}}
                  value={jour}
                  onChange={e=>setJour(e.target.value)}
                />
              ) : (
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
                    style={{outlineColor: theme.primary}}
                    value={from}
                    onChange={e=>setFrom(e.target.value)}
                  />
                  <span className="text-gray-500">→</span>
                  <input
                    type="date"
                    className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
                    style={{outlineColor: theme.primary}}
                    value={to}
                    onChange={e=>setTo(e.target.value)}
                  />
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <Kpi label="Billets (Guichet)" value={String(kpis.gTickets)} />
            <Kpi label="Montant (Guichet)" value={fmtMoney(kpis.gMontant)} />
            <Kpi label="Billets (En ligne)" value={String(kpis.oTickets)} />
            <Kpi label="Montant (En ligne)" value={fmtMoney(kpis.oMontant)} />
          </div>
        </div>

        {/* Réservations en ligne — Aujourd’hui */}
        <div className="rounded-2xl bg-white border shadow-sm p-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="font-semibold">Réservations en ligne — Aujourd’hui</div>
            <div className="flex items-center gap-2">
              <input
                placeholder="Filtrer (client / tél. / trajet / réf.)"
                className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
                style={{outlineColor: theme.primary}}
                value={onlineFilter}
                onChange={e=>setOnlineFilter(e.target.value)}
              />
              <select
                className="border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2"
                style={{outlineColor: theme.primary}}
                value={onlineSort}
                onChange={e=>setOnlineSort(e.target.value as any)}
                title="Trier"
              >
                <option value="recent">Plus récents</option>
                <option value="montant">Montant</option>
                <option value="billets">Billets</option>
              </select>
            </div>
          </div>

          {onlineTodayFiltered.length === 0 ? (
            <div className="text-gray-500 py-4">Aucune réservation en ligne aujourd’hui.</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-3">
              {onlineTodayFiltered.map(r => (
                <OnlineCard key={r.id} r={r} primary={theme.primary} secondary={theme.secondary} />
              ))}
            </div>
          )}
        </div>

        {/* Départs groupés */}
        <div className="rounded-2xl bg-white border shadow-sm">
          <div className="px-4 py-3 font-semibold">Départs (regroupés par trajet / date / heure)</div>
          <div className="overflow-x-auto">
            {grouped.length===0 ? (
              <div className="px-4 py-6 text-gray-500">Aucun départ sur la période.</div>
            ) : (
              <table className="w-full text-sm">
                <thead style={{background:`${theme.secondary}22`}} className="text-gray-700">
                  <tr>
                    <th className="px-3 py-2 text-left">Trajet</th>
                    <th className="px-3 py-2 text-left">Date</th>
                    <th className="px-3 py-2 text-left">Heure</th>
                    <th className="px-3 py-2 text-right">Billets (Guichet)</th>
                    <th className="px-3 py-2 text-right">Billets (En ligne)</th>
                    <th className="px-3 py-2 text-right">Billets (Total)</th>
                    <th className="px-3 py-2 text-right">Montant (Guichet)</th>
                    <th className="px-3 py-2 text-right">Montant (En ligne)</th>
                    <th className="px-3 py-2 text-right">Montant (Total)</th>
                    <th className="px-3 py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {grouped.map(g=>(
                    <tr key={g.key} className="border-t hover:bg-gray-50">
                      <td className="px-3 py-2">{g.trajet}</td>
                      <td className="px-3 py-2">{g.date}</td>
                      <td className="px-3 py-2">{g.heure}</td>
                      <td className="px-3 py-2 text-right">{g.billetsGuichet}</td>
                      <td className="px-3 py-2 text-right">{g.billetsOnline}</td>
                      <td className="px-3 py-2 text-right font-semibold">{g.billetsTotal}</td>
                      <td className="px-3 py-2 text-right">{fmtMoney(g.montantGuichet)}</td>
                      <td className="px-3 py-2 text-right">{fmtMoney(g.montantOnline)}</td>
                      <td className="px-3 py-2 text-right font-semibold">{fmtMoney(g.montantTotal)}</td>
                      <td className="px-3 py-2 text-right">
                        <button
                          onClick={()=>navigate('/agence/embarquement', {state:{trajet:g.trajet, date:g.date, heure:g.heure}})}
                          className="px-3 py-1.5 rounded-lg border hover:bg-gray-50 focus:outline-none focus:ring-2"
                          style={{outlineColor: theme.primary}}
                          title="Afficher la liste d'embarquement"
                        >
                          Afficher
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Rapports validés (double tampon) */}
        <div className="rounded-2xl bg-white border shadow-sm">
          <div className="px-4 py-3 font-semibold">Rapports de poste (validés)</div>
          {validatedShifts.length===0 ? (
            <div className="px-4 py-6 text-gray-500">Aucun rapport validé sur la période.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-3 py-2 text-left">Guichetier</th>
                    <th className="px-3 py-2 text-left">Code</th>
                    <th className="px-3 py-2 text-left">Début</th>
                    <th className="px-3 py-2 text-left">Fin</th>
                    <th className="px-3 py-2 text-left">Validations</th>
                    <th className="px-3 py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {validatedShifts.map(s=>{
                    const name = s.userName || s.userEmail || s.userId;
                    const code = s.userCode || '—';
                    return (
                      <tr key={s.id} className="border-t hover:bg-gray-50">
                        <td className="px-3 py-2">{name}</td>
                        <td className="px-3 py-2">{code}</td>
                        <td className="px-3 py-2">{s.startTime ? new Date(s.startTime.toDate?.() ?? s.startTime).toLocaleString('fr-FR') : '—'}</td>
                        <td className="px-3 py-2">{s.endTime   ? new Date(s.endTime.toDate?.()   ?? s.endTime).toLocaleString('fr-FR')   : '—'}</td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2 text-xs">
                            {s.comptable?.validated ? <Badge color="green">Comptable OK</Badge> : <Badge color="amber">Comptable en attente</Badge>}
                            {s.chef?.validated ? <Badge color="green">Chef OK</Badge> : <Badge color="amber">Chef en attente</Badge>}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button
                            className="px-3 py-1.5 rounded-lg border hover:bg-gray-50 mr-2 focus:outline-none focus:ring-2"
                            style={{outlineColor: theme.primary}}
                            onClick={()=>navigate(`/agence/rapport/${s.id}`)}
                            title="Ouvrir le rapport"
                          >
                            Afficher
                          </button>
                          <button
                            className="px-3 py-1.5 rounded-lg border hover:bg-gray-50 focus:outline-none focus:ring-2"
                            style={{outlineColor: theme.primary}}
                            onClick={()=>window.print()}
                            title="Imprimer"
                          >
                            Imprimer
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <div className="text-xs text-gray-500 px-4 py-3 border-t">
            Un poste n’apparaît ici qu’après <b>double validation</b> (Comptable + Chef).
          </div>
        </div>

      </div>
    </div>
  );
};

export default AgenceReservationsPage;
