import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  collection, doc, getDoc, onSnapshot, query, Timestamp, updateDoc, where
} from 'firebase/firestore';
import { db } from '@/firebaseConfig';
import { ShieldCheck, Stamp, Clock4 } from 'lucide-react';

type AgencyTheme = { primary: string; secondary: string };
type ShiftStatus = 'pending'|'active'|'paused'|'closed'|'validated';

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
  // validations
  comptable?: { validated?: boolean; at?: any; by?: { id?: string; name?: string }, note?: string|null };
  chef?:       { validated?: boolean; at?: any; by?: { id?: string; name?: string }, note?: string|null };
  validatedAt?: any;
};

type LiveStat = { reservations: number; tickets: number; amount: number };

const fmtMoney = (n: number) => `${(n||0).toLocaleString('fr-FR')} FCFA`;
const shortId = (s: string) => (s ? `${s.slice(0,6)}…` : '—');

const StatusBadge: React.FC<{status:ShiftStatus}> = ({ status }) => {
  const map: Record<ShiftStatus,{bg:string;color:string;label:string}> = {
    pending:   { bg:'#E5E7EB', color:'#374151', label:'En attente' },
    active:    { bg:'#DCFCE7', color:'#166534', label:'En service' },
    paused:    { bg:'#FEF3C7', color:'#92400E', label:'En pause' },
    closed:    { bg:'#FEE2E2', color:'#B91C1C', label:'Clôturé' },
    validated: { bg:'#DBEAFE', color:'#1D4ED8', label:'Validé' },
  };
  const s = map[status];
  return <span className="px-2 py-0.5 rounded text-xs font-semibold" style={{background:s.bg,color:s.color}}>{s.label}</span>;
};

export const ShiftsControlWidget: React.FC<{
  companyId?: string;
  agencyId?: string;
  theme: AgencyTheme;
}> = ({ companyId, agencyId, theme }) => {
  const [rows, setRows] = useState<ShiftDoc[]>([]);
  const [usersCache, setUsersCache] = useState<Record<string,{name?:string; email?:string; code?:string}>>({});
  const [live, setLive] = useState<Record<string,LiveStat>>({});
  const liveUnsubsRef = useRef<Record<string,()=>void>>({});

  // Charger les postes (tous états sauf déjà validés -> ils iront dans Rapports)
  useEffect(() => {
    if (!companyId || !agencyId) return;
    const ref = collection(db, `companies/${companyId}/agences/${agencyId}/shifts`);
    // on garde active / paused / closed / pending ; les 'validated' vivent dans Rapports
    const qy = query(ref, where('status','in',['pending','active','paused','closed'] as ShiftStatus[]));
    const unsub = onSnapshot(qy, async snap => {
      const list: ShiftDoc[] = snap.docs.map(d => ({ id:d.id, ...(d.data() as any) })) as any[];

      // cache users
      const uids = Array.from(new Set(list.map(s=>s.userId).filter(Boolean)));
      const missing = uids.filter(uid => !usersCache[uid]);
      if (missing.length) {
        const pairs = await Promise.all(missing.map(async uid => {
          const ds = await getDoc(doc(db,'users',uid));
          const u = ds.exists() ? (ds.data() as any) : {};
          return [uid, {
            name: u.displayName || u.nom || u.email || '',
            email: u.email || '',
            code: u.staffCode || u.codeCourt || u.code || '',
          }] as const;
        }));
        setUsersCache(prev => Object.fromEntries([...Object.entries(prev), ...pairs]));
      }

      // trier par priorité d'état puis par temps
      const priority: Record<ShiftStatus,number> = { active:0, paused:1, closed:2, pending:3, validated:9 };
      list.sort((a,b) => {
        const pa = priority[a.status] ?? 9, pb = priority[b.status] ?? 9;
        if (pa !== pb) return pa - pb;
        const ta = (a.endTime?.toMillis?.() ?? a.startTime?.toMillis?.() ?? 0);
        const tb = (b.endTime?.toMillis?.() ?? b.startTime?.toMillis?.() ?? 0);
        return tb - ta;
      });

      setRows(list);
    });
    return () => unsub();
  }, [companyId, agencyId]);

  // Stats "live" sur postes actifs (tickets / montant)
  useEffect(() => {
    if (!companyId || !agencyId) return;
    const rRef = collection(db, `companies/${companyId}/agences/${agencyId}/reservations`);

    // stop listeners obsolètes
    for (const id of Object.keys(liveUnsubsRef.current)) {
      if (!rows.find(s => s.id === id && s.status === 'active')) {
        liveUnsubsRef.current[id]?.();
        delete liveUnsubsRef.current[id];
      }
    }
    // (re)brancher pour les actifs
    rows.filter(s=>s.status==='active').forEach(s => {
      if (liveUnsubsRef.current[s.id]) return;
      const unsub = onSnapshot(query(rRef, where('shiftId','==',s.id), where('canal','==','guichet')), snap => {
        let reservations=0, tickets=0, amount=0;
        snap.forEach(d => {
          const r = d.data() as any;
          reservations += 1;
          tickets += (r.seatsGo||0) + (r.seatsReturn||0);
          amount += r.montant || 0;
        });
        setLive(prev => ({ ...prev, [s.id]: { reservations, tickets, amount }}));
      });
      liveUnsubsRef.current[s.id] = unsub;
    });

    return () => {
      for (const k of Object.keys(liveUnsubsRef.current)) {
        liveUnsubsRef.current[k]?.();
      }
      liveUnsubsRef.current = {};
    };
  }, [rows, companyId, agencyId]);

  // Validation boutons
  async function markComptableOK(s: ShiftDoc) {
    if (!companyId || !agencyId) return;
    const ref = doc(db, `companies/${companyId}/agences/${agencyId}/shifts/${s.id}`);
    await updateDoc(ref, { comptable: { validated:true, at: Timestamp.now() } });
  }
  async function markChefOK(s: ShiftDoc) {
    if (!companyId || !agencyId) return;
    const ref = doc(db, `companies/${companyId}/agences/${agencyId}/shifts/${s.id}`);
    await updateDoc(ref, { chef: { validated:true, at: Timestamp.now() } });
  }

  // Auto‑archivage : si comptable + chef = OK → status 'validated' + validatedAt
  useEffect(() => {
    (async () => {
      if (!companyId || !agencyId) return;
      const toArchive = rows.filter(s => s.status==='closed' && s.comptable?.validated && s.chef?.validated);
      await Promise.all(toArchive.map(async s => {
        const ref = doc(db, `companies/${companyId}/agences/${agencyId}/shifts/${s.id}`);
        await updateDoc(ref, { status:'validated', validatedAt: Timestamp.now() });
      }));
    })().catch(console.error);
  }, [rows, companyId, agencyId]);

  const prettyUser = (s:ShiftDoc) => {
    const u = usersCache[s.userId] || {};
    const name = u.name || s.userName || s.userEmail || s.userId;
    const code = u.code || s.userCode || '';
    return `${name}${code ? ` (${code})` : ''}`;
  };

  return (
    <div className="space-y-3">
      <div className="text-lg font-bold flex items-center gap-2">
        <Clock4 className="h-5 w-5" />
        Contrôle des postes
      </div>

      <div className="rounded-2xl border bg-white p-4 shadow-sm">
        {rows.length === 0 ? (
          <div className="text-gray-500">Aucun poste en cours.</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {rows.map(s => {
              const liveStat = live[s.id];
              const start = s.startTime ? new Date(s.startTime.toDate?.() ?? s.startTime).toLocaleString('fr-FR') : '—';
              return (
                <div key={s.id} className="rounded-xl border p-3 bg-white">
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-semibold">{prettyUser(s)}</div>
                    <StatusBadge status={s.status} />
                  </div>

                  <div className="text-xs text-gray-600 mt-1">
                    Début : {start} • Réf poste : <span title={s.id}>{shortId(s.id)}</span>
                  </div>

                  {s.status === 'active' && (
                    <div className="mt-2 text-sm">
                      <div className="text-gray-600">
                        {liveStat ? (
                          <>
                            Billets : <b>{liveStat.tickets}</b> • Montant : <b>{fmtMoney(liveStat.amount)}</b>
                          </>
                        ) : (
                          'Calcul en cours…'
                        )}
                      </div>
                    </div>
                  )}

                  <div className="mt-3 flex items-center justify-between">
                    <div className="text-xs flex items-center gap-3">
                      {s.comptable?.validated ? (
                        <span className="inline-flex items-center gap-1 text-emerald-700">
                          <ShieldCheck className="h-3.5 w-3.5" /> Cpta OK
                        </span>
                      ) : (
                        <span className="text-amber-700">Cpta en attente</span>
                      )}
                      {s.chef?.validated ? (
                        <span className="inline-flex items-center gap-1 text-emerald-700">
                          <Stamp className="h-3.5 w-3.5" /> Chef OK
                        </span>
                      ) : (
                        <span className="text-amber-700">Chef en attente</span>
                      )}
                    </div>

                    {s.status === 'closed' && (
                      <div className="flex items-center gap-2">
                        {!s.comptable?.validated && (
                          <button
                            className="px-2 py-1 text-xs rounded-lg border hover:bg-gray-50"
                            onClick={() => markComptableOK(s)}
                          >
                            Valider (Compta)
                          </button>
                        )}
                        {!s.chef?.validated && (
                          <button
                            className="px-2 py-1 text-xs rounded-lg border hover:bg-gray-50"
                            onClick={() => markChefOK(s)}
                          >
                            Valider (Chef)
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="text-xs text-gray-500">
        Astuce : dès qu’un poste est <b>Validé</b> (Comptable + Chef), il disparaît d’ici et se retrouve
        automatiquement dans <b>Rapports de poste</b> (archives imprimables).
      </div>
    </div>
  );
};

export default ShiftsControlWidget;
