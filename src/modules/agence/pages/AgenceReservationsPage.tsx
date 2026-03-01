// src/pages/AgenceReservationsPage.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  collection, doc, getDoc, onSnapshot, orderBy, query, Timestamp, where
} from 'firebase/firestore';
import { db } from '@/firebaseConfig';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate, useParams } from 'react-router-dom';
import { useFormatCurrency } from '@/shared/currency/CurrencyContext';

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
  comptable?: { validated?: boolean; at?: any; by?: { id?: string; name?: string } | null; note?: string|null };
  chef?: { validated?: boolean; at?: any; by?: { id?: string; name?: string } | null; note?: string|null };
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
const fmtDate    = (d: Date) => d.toLocaleDateString('fr-FR', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
const isOnline   = (raw?: string) => {
  const v = (raw||'').toString().toLowerCase().trim().replace(/\s|_|-/g,'');
  return v.includes('ligne') || v === 'online' || v === 'web';
};
const norm = (s?: string) => (s||'').normalize('NFKC').toLowerCase().replace(/\s+/g,' ').trim();

/* ===================== UI bits ===================== */
import { StandardLayoutWrapper, PageHeader, SectionCard, MetricCard, StatusBadge, ActionButton, EmptyState, table, tableRowClassName } from '@/ui';
import { BarChart3 } from 'lucide-react';

const badgeColorToStatus: Record<string, 'success'|'pending'|'neutral'|'danger'|'info'> = {
  green: 'success', emerald: 'success', amber: 'pending', gray: 'neutral', red: 'danger', indigo: 'info',
};
const Badge = ({ color, children }: { color: keyof typeof badgeColorToStatus; children?: React.ReactNode }) => (
  <StatusBadge status={badgeColorToStatus[color] ?? 'neutral'}>{children}</StatusBadge>
);

const OnlineKioskCard: React.FC<{
  tickets:number; amount:number; primary:string; secondary:string;
}> = ({tickets, amount, primary, secondary}) => {
  const money = useFormatCurrency();
  return (
  <div
    className="relative rounded-xl border bg-white p-4 shadow-sm hover:shadow-md transition-shadow"
    style={{ borderColor: `${primary}22` }}
  >
    <div className="absolute inset-x-0 -top-px h-1 rounded-t-xl"
         style={{ background: `linear-gradient(90deg, ${primary}, ${secondary})` }} />
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="text-sm text-gray-500">Guichet</div>
        <div className="font-semibold truncate">Réservations en ligne</div>
        <div className="mt-2 inline-flex items-center gap-2 text-xs">
          <span
            aria-label="Statut en ligne"
            className="px-2 py-0.5 rounded-full font-medium border"
            style={{ backgroundColor:'#f0fdf4', color:'#166534', borderColor:'#bbf7d0' }}
          >
            En ligne
          </span>
        </div>
      </div>
      <div
        aria-hidden
        className="h-10 w-10 rounded-xl grid place-items-center shadow-inner"
        style={{background:`linear-gradient(45deg, ${primary}22, ${secondary}22)`}}
      >
        🌐
      </div>
    </div>

    <div className="grid grid-cols-2 gap-3 mt-3 text-sm">
      <div>
        <div className="text-xs text-gray-500">Billets</div>
        <div className="font-medium">{tickets}</div>
      </div>
      <div className="text-right">
        <div className="text-xs text-gray-500">Montant</div>
        <div className="font-medium">{money(amount)}</div>
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
  const money = useFormatCurrency();

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

      // Garde les shifts non encore double-validés
      const list = all.filter(s => s.status !== 'validated');
      setShifts(list);
    });

    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, agencyId]);

  // live stats (actif + pause)
  useEffect(() => {
    if (!companyId || !agencyId) return;
    const rRef = collection(db, `companies/${companyId}/agences/${agencyId}/reservations`);

    // nettoyer
    for (const id of Object.keys(liveUnsubsRef.current)) {
      if (!shifts.find(s => s.id === id && (s.status==='active' || s.status==='paused'))) {
        liveUnsubsRef.current[id]?.();
        delete liveUnsubsRef.current[id];
      }
    }

    // écoute actif + pause (afficher même en pause)
    for (const s of shifts) {
      if (!(s.status === 'active' || s.status === 'paused')) continue;
      if (liveUnsubsRef.current[s.id]) continue;

      const qy = query(
        rRef,
        where('shiftId','==',s.id),
        where('statut', 'in', ['paye', 'payé']),
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

  /* --------- RÉSERVATIONS (période) --------- */
  const [rows, setRows] = useState<Reservation[]>([]);
  useEffect(() => {
    if (!companyId || !agencyId || !range[0] || !range[1]) return;
    const rRef = collection(db, `companies/${companyId}/agences/${agencyId}/reservations`);
    const qy = query(
      rRef,
      where('createdAt','>=', Timestamp.fromDate(range[0])),
      where('createdAt','<=', Timestamp.fromDate(range[1])),
      where('statut', 'in', ['paye', 'payé']),
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
  const [showAllValidated, setShowAllValidated] = useState(false);
  const [filterCode, setFilterCode] = useState('');
  useEffect(() => {
    if (!companyId || !agencyId) return;
    const ref = collection(db, `companies/${companyId}/agences/${agencyId}/shifts`);
    return onSnapshot(ref, snap => {
      const all = snap.docs.map(d => ({ id:d.id, ...(d.data() as any) })) as any[];
      const list = all.filter(s => s.status === 'validated') as ShiftDoc[];
      setValidatedShifts(list);
    });
  }, [companyId, agencyId]);

  const validatedLimited = useMemo(() => {
    const f = filterCode.trim().toLowerCase();
    const arr = f
      ? validatedShifts.filter(s => (s.userCode||'').toLowerCase().includes(f))
      : validatedShifts;
    return showAllValidated ? arr : arr.slice(0, 5);
  }, [validatedShifts, showAllValidated, filterCode]);

  /* ===================== UI ===================== */
  return (
    <StandardLayoutWrapper>
      <PageHeader
        title="Réservations agence"
        subtitle={`Période : ${fmtDate(range[0])} → ${fmtDate(range[1])}`}
        icon={BarChart3}
        primaryColorVar={theme?.primary}
      />

      <SectionCard title="Période et indicateurs">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div className="font-semibold text-gray-700">
              Période : <span className="text-gray-600">{fmtDate(range[0])} → {fmtDate(range[1])}</span>
            </div>
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
                  <input type="date" className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
                        style={{outlineColor: theme.primary}} value={from} onChange={e=>setFrom(e.target.value)} />
                  <span className="text-gray-500">→</span>
                  <input type="date" className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
                        style={{outlineColor: theme.primary}} value={to} onChange={e=>setTo(e.target.value)} />
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <MetricCard label="Billets (Guichet)" value={String(kpis.gTickets)} valueColorVar={theme?.primary} />
            <MetricCard label="Montant (Guichet)" value={money(kpis.gMontant)} valueColorVar={theme?.primary} />
            <MetricCard label="Billets (En ligne)" value={String(kpis.oTickets)} valueColorVar={theme?.secondary} />
            <MetricCard label="Montant (En ligne)" value={money(kpis.oMontant)} valueColorVar={theme?.secondary} />
          </div>
      </SectionCard>

      <SectionCard title="Guichets en activité">
          {shifts.length===0 && kpis.oTickets===0 ? (
            <EmptyState message="Aucun poste en attente / en service / en pause / clôturé." />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {/* Guichet “EN LIGNE” en 1ʳᵉ position si ventes en ligne */}
              {kpis.oTickets > 0 && (
                <OnlineKioskCard tickets={kpis.oTickets} amount={kpis.oMontant}
                  primary={theme.primary} secondary={theme.secondary}/>
              )}

              {/* Guichets physiques */}
              {shifts.map(s=>{
                const u = usersCache[s.userId] || {};
                const name = u.name || s.userName || s.userEmail || s.userId;
                const code = (u.code || s.userCode || '').trim() || '—';
                const live = liveStats[s.id];
                const statusInfo = {
                  active:{ label:'En service', dot:'#22c55e' },
                  paused:{ label:'En pause',   dot:'#f59e0b' },
                  closed:{ label:'Clôturé',    dot:'#64748b' },
                  pending:{label:'En attente', dot:'#6366f1' },
                  validated:{label:'Validé',   dot:'#10b981' },
                } as const;
                const st:any = statusInfo[s.status] || statusInfo.pending;

                return (
                  <div key={s.id}
                    className="relative rounded-xl border bg-white p-4 shadow-sm hover:shadow-md transition-shadow"
                    style={{ borderColor: `${theme.primary}22` }}
                  >
                    <div className="absolute inset-x-0 -top-px h-1 rounded-t-xl"
                          style={{ background: `linear-gradient(90deg, ${theme.primary}, ${theme.secondary})` }} />
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm text-gray-500">Guichetier</div>
                        <div className="font-semibold truncate">
                          {name} <span className="text-gray-500 text-xs">({code})</span>
                        </div>
                        <div className="mt-2 inline-flex flex-wrap items-center gap-2 text-xs">
                          <span className="px-2 py-0.5 rounded-full font-medium border"
                                style={{ backgroundColor:'#f8fafc', borderColor:'#e2e8f0' }}>
                            <span className="inline-block w-2 h-2 rounded-full mr-1" style={{backgroundColor:st.dot}}/>
                            {st.label}
                          </span>
                          {s.status === 'validated' ? (
                            <Badge color="emerald">Validé (définitif)</Badge>
                          ) : s.status === 'closed' ? (
                            <Badge color="amber">En attente validation comptable</Badge>
                          ) : null}
                        </div>
                      </div>
                      <div
                        aria-hidden
                        className="h-10 w-10 rounded-xl grid place-items-center shadow-inner"
                        style={{background:`linear-gradient(45deg, ${theme.primary}22, ${theme.secondary}22)`}}
                      >
                        🧾
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 mt-3 text-sm">
                      <div>
                        <div className="text-xs text-gray-500">Début</div>
                        <div className="font-medium">
                          {s.startTime ? new Date(s.startTime.toDate?.() ?? s.startTime).toLocaleString('fr-FR') : '—'}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-gray-500">Fin</div>
                        <div className="font-medium">
                          {s.endTime ? new Date(s.endTime.toDate?.() ?? s.endTime).toLocaleString('fr-FR') : '—'}
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 rounded-xl border bg-gray-50 px-3 py-2 text-sm flex items-center justify-between">
                      <div>Billets : <b>{live ? live.tickets : 0}</b></div>
                      <div>Montant : <b>{money(live ? live.amount : 0)}</b></div>
                    </div>

                  </div>
                );
              })}
            </div>
          )}
          <p className="text-xs text-gray-500 mt-2">
            Lorsqu’un poste est <b>validé</b> (Comptable + Chef), il est archivé dans “Rapports de poste (validés)” plus bas.
          </p>
      </SectionCard>

      <SectionCard title="Départs (regroupés par trajet / date / heure)" noPad>
        <div className={table.wrapper}>
            {grouped.length===0 ? (
              <div className="px-4 py-6"><EmptyState message="Aucun départ sur la période." /></div>
            ) : (
              <table className={table.base}>
                <thead className={table.head}>
                  <tr>
                    <th className={table.th}>Trajet</th>
                    <th className={table.th}>Date</th>
                    <th className={table.th}>Heure</th>
                    <th className={table.thRight}>Billets (Guichet)</th>
                    <th className={table.thRight}>Billets (En ligne)</th>
                    <th className={table.thRight}>Billets (Total)</th>
                    <th className={table.thRight}>Montant (Guichet)</th>
                    <th className={table.thRight}>Montant (En ligne)</th>
                    <th className={table.thRight}>Montant (Total)</th>
                    <th className={table.thRight}>Actions</th>
                  </tr>
                </thead>
                <tbody className={table.body}>
                  {grouped.map(g=>(
                    <tr key={g.key} className={tableRowClassName()}>
                      <td className={table.td}>{g.trajet}</td>
                      <td className={table.td}>{g.date}</td>
                      <td className={table.td}>{g.heure}</td>
                      <td className={table.tdRight}>{g.billetsGuichet}</td>
                      <td className={table.tdRight}>{g.billetsOnline}</td>
                      <td className={table.tdRight + " font-semibold"}>{g.billetsTotal}</td>
                      <td className={table.tdRight}>{money(g.montantGuichet)}</td>
                      <td className={table.tdRight}>{money(g.montantOnline)}</td>
                      <td className={table.tdRight + " font-semibold"}>{money(g.montantTotal)}</td>
                      <td className={table.tdRight}>
                        <ActionButton size="sm" onClick={()=>navigate('/agence/embarquement', {state:{trajet:g.trajet, date:g.date, heure:g.heure}})} title="Afficher la liste d'embarquement">Afficher</ActionButton>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
        </div>
      </SectionCard>

      <SectionCard title="Rapports de poste (validés)" noPad>
          <div className="px-4 py-3 flex items-center justify-between gap-3">
            <div className="font-semibold">Rapports de poste (validés)</div>
            <div className="flex items-center gap-2">
              <input
                placeholder="Filtrer par code guichetier"
                className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
                style={{outlineColor: theme.primary}}
                value={filterCode}
                onChange={e=>setFilterCode(e.target.value)}
              />
              {validatedShifts.length > 5 && (
                <button
                  className="px-3 py-2 rounded-lg border text-sm bg-white hover:bg-slate-50"
                  onClick={()=>setShowAllValidated(v=>!v)}
                >
                  {showAllValidated ? 'Réduire' : 'Voir tout'}
                </button>
              )}
            </div>
          </div>

          {validatedLimited.length===0 ? (
            <div className="px-4 py-6 text-gray-500">
              {filterCode ? 'Aucun rapport ne correspond à ce code.' : 'Aucun rapport validé.'}
            </div>
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
                  {validatedLimited.map(s=>{
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
                            {s.status === 'validated' ? <Badge color="green">Validé</Badge> : <Badge color="amber">—</Badge>}
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
            Un poste n’apparaît ici qu’après <b>validation comptable</b> (définitif).
          </div>
      </SectionCard>
    </StandardLayoutWrapper>
  );
};

export default AgenceReservationsPage;
