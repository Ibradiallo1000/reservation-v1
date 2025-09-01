// src/pages/CompagnieComptabilitePage.tsx
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { collection, getDocs, query, where, orderBy, Timestamp } from 'firebase/firestore';
import { db } from '@/firebaseConfig';
import { useAuth } from '@/contexts/AuthContext';
import { usePageHeader } from '@/contexts/PageHeaderContext';

type RangeKey = 'jour' | 'semaine' | 'mois' | 'custom';

type LigneAgence = {
  agenceId: string;
  agenceNom: string;
  nbReceptions: number;
  especesRecues: number;
  mmInfo: number;
  entreesManuelles: number;
  sorties: number;
  totalEntrees: number;
  solde: number;
};

type CashDay = { dateISO: string; entrees: number; sorties: number; solde: number };

function startOfDay(d = new Date()) { return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0,0,0,0); }
function endOfDay(d = new Date()) { return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23,59,59,999); }
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function startOfMonth(d = new Date()) { return new Date(d.getFullYear(), d.getMonth(), 1, 0,0,0,0); }
function formatXOF(n: number) { return new Intl.NumberFormat('fr-FR', { style:'currency', currency:'XOF', maximumFractionDigits:0 }).format(n||0); }

const CompagnieComptabilitePage: React.FC = () => {
  const { user } = useAuth();
  const { setHeader } = usePageHeader();

  const [range, setRange] = useState<RangeKey>('mois');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [loading, setLoading] = useState(false);

  const [agences, setAgences] = useState<{ id: string; nom: string }[]>([]);
  const [rows, setRows] = useState<LigneAgence[]>([]);

  // Drill-down
  const [openDetailAgencyId, setOpenDetailAgencyId] = useState<string | null>(null);
  const [openDetailAgencyName, setOpenDetailAgencyName] = useState<string>('');
  const [detailDays, setDetailDays] = useState<CashDay[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailTotals, setDetailTotals] = useState({ in: 0, out: 0 });

  // Période
  const { from, to, label } = useMemo(() => {
    const now = new Date();
    if (range === 'jour') return { from: startOfDay(now), to: endOfDay(now), label: "Aujourd'hui" };
    if (range === 'semaine') return { from: startOfDay(addDays(now, -6)), to: endOfDay(now), label: '7 derniers jours' };
    if (range === 'mois') return { from: startOfMonth(now), to: endOfDay(now), label: 'Mois en cours' };
    const f = customStart ? new Date(`${customStart}T00:00:00`) : startOfMonth(now);
    const t = customEnd ? new Date(`${customEnd}T23:59:59`) : endOfDay(now);
    return { from: f, to: t, label: 'Période personnalisée' };
  }, [range, customStart, customEnd]);

  // Header
  useEffect(() => { setHeader({ title: 'Comptabilité (toutes agences)', subtitle: label }); }, [label, setHeader]);

  // Liste des agences
  useEffect(() => {
    (async () => {
      if (!user?.companyId) return;
      const snap = await getDocs(collection(db, 'companies', user.companyId, 'agences'));
      setAgences(snap.docs.map(d => ({
        id: d.id,
        nom: (d.data() as any).nomAgence || (d.data() as any).nom || 'Agence'
      })));
    })();
  }, [user?.companyId]);

  // Agrégats compagnie
  useEffect(() => {
    (async () => {
      if (!user?.companyId) return;
      setLoading(true);

      const result: LigneAgence[] = [];
      for (const ag of agences) {
        const base = collection(db, 'companies', user.companyId, 'agences', ag.id, 'cashReceipts');
        const baseMov = collection(db, 'companies', user.companyId, 'agences', ag.id, 'cashMovements');

        const qR = query(base, where('createdAt', '>=', Timestamp.fromDate(from)), where('createdAt', '<=', Timestamp.fromDate(to)), orderBy('createdAt','asc'));
        const qM = query(baseMov, where('createdAt', '>=', Timestamp.fromDate(from)), where('createdAt', '<=', Timestamp.fromDate(to)), orderBy('createdAt','asc'));

        const [sr, sm] = await Promise.all([getDocs(qR), getDocs(qM)]);

        let nbReceptions = 0, especesRecues = 0, mmInfo = 0, entreesManuelles = 0, sorties = 0;

        sr.forEach(d => {
          const r = d.data() as any;
          nbReceptions += 1;
          especesRecues += Number(r.cashReceived || 0);
          mmInfo += Number(r.mmExpected || 0); // info
        });

        sm.forEach(d => {
          const m = d.data() as any;
          const kind = String(m.kind || '');
          const amount = Number(m.amount || 0);
          if (kind === 'entree_manual') entreesManuelles += amount;
          else if (kind === 'depense' || kind === 'transfert_banque') sorties += amount;
        });

        const totalEntrees = especesRecues + entreesManuelles;
        const solde = totalEntrees - sorties;

        result.push({
          agenceId: ag.id,
          agenceNom: ag.nom,
          nbReceptions,
          especesRecues,
          mmInfo,
          entreesManuelles,
          sorties,
          totalEntrees,
          solde,
        });
      }

      setRows(result.sort((a,b) => a.agenceNom.localeCompare(b.agenceNom)));
      setLoading(false);
    })();
  }, [user?.companyId, agences, from, to]);

  const totals = useMemo(() => rows.reduce((t, r) => ({
    nbReceptions: t.nbReceptions + r.nbReceptions,
    especesRecues: t.especesRecues + r.especesRecues,
    mmInfo: t.mmInfo + r.mmInfo,
    entreesManuelles: t.entreesManuelles + r.entreesManuelles,
    sorties: t.sorties + r.sorties,
    totalEntrees: t.totalEntrees + r.totalEntrees,
    solde: t.solde + r.solde,
  }), { nbReceptions:0, especesRecues:0, mmInfo:0, entreesManuelles:0, sorties:0, totalEntrees:0, solde:0 }), [rows]);

  const exportCSV = () => {
    const headers = [
      'Agence','Nb réceptions','Espèces reçues','Entrées manuelles','Total entrées','Sorties','Solde','MM (attendu – info)'
    ];
    const data = rows.map(r => [
      r.agenceNom, r.nbReceptions, r.especesRecues, r.entreesManuelles, r.totalEntrees, r.sorties, r.solde, r.mmInfo
    ]);
    data.push(['TOTAL', totals.nbReceptions, totals.especesRecues, totals.entreesManuelles, totals.totalEntrees, totals.sorties, totals.solde, totals.mmInfo]);

    const csv = [headers, ...data]
      .map(row => row.map(v => typeof v === 'number' ? String(v).replace('.', ',') : `"${String(v).replace(/"/g,'""')}"`).join(';'))
      .join('\n');

    const blob = new Blob([csv], { type:'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `comptabilite_compagnie_${new Date().toISOString().slice(0,10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  // ---------- Drill-down : charger la caisse par agence ----------
  const loadAgencyDetail = useCallback(async (agenceId: string, agenceNom: string) => {
    if (!user?.companyId) return;
    setOpenDetailAgencyId(agenceId);
    setOpenDetailAgencyName(agenceNom);
    setDetailLoading(true);

    const rRef = collection(db, 'companies', user.companyId, 'agences', agenceId, 'cashReceipts');
    const mRef = collection(db, 'companies', user.companyId, 'agences', agenceId, 'cashMovements');

    const qR = query(rRef, where('createdAt', '>=', Timestamp.fromDate(from)), where('createdAt', '<=', Timestamp.fromDate(to)), orderBy('createdAt','asc'));
    const qM = query(mRef, where('createdAt', '>=', Timestamp.fromDate(from)), where('createdAt', '<=', Timestamp.fromDate(to)), orderBy('createdAt','asc'));

    const [sr, sm] = await Promise.all([getDocs(qR), getDocs(qM)]);

    const map: Record<string, { in: number; out: number }> = {};
    sr.forEach(d => {
      const r = d.data() as any;
      const dt = r.createdAt?.toDate?.() ?? new Date();
      const key = dt.toISOString().slice(0,10);
      map[key] ||= { in: 0, out: 0 };
      map[key].in += Math.max(0, Number(r.cashReceived || 0));
    });
    sm.forEach(d => {
      const r = d.data() as any;
      const dt = r.createdAt?.toDate?.() ?? new Date();
      const key = dt.toISOString().slice(0,10);
      map[key] ||= { in: 0, out: 0 };
      const kind = String(r.kind || '');
      const amount = Math.max(0, Number(r.amount || 0));
      if (kind === 'depense' || kind === 'transfert_banque') map[key].out += amount;
      if (kind === 'entree_manual') map[key].in += amount;
    });

    const keys = Object.keys(map).sort();
    let run = 0, IN = 0, OUT = 0;
    const rows: CashDay[] = [];
    for (const k of keys) {
      const inc = map[k].in || 0;
      const out = map[k].out || 0;
      run += inc - out; IN += inc; OUT += out;
      rows.push({ dateISO: k, entrees: inc, sorties: out, solde: run });
    }
    setDetailDays(rows);
    setDetailTotals({ in: IN, out: OUT });
    setDetailLoading(false);
  }, [user?.companyId, from, to]);

  const exportDetailCSV = () => {
    if (!detailDays.length) return;
    const hdr = ['Date','Entrées','Sorties','Solde'];
    const body = detailDays.map(d => [
      new Date(d.dateISO).toLocaleDateString('fr-FR'), d.entrees, d.sorties, d.solde
    ]);
    const csv = [hdr, ...body]
      .map(row => row.map(v => typeof v === 'number' ? String(v).replace('.', ',') : `"${String(v).replace(/"/g,'""')}"`).join(';'))
      .join('\n');
    const blob = new Blob([csv], { type:'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `caisse_${openDetailAgencyName}_${new Date().toISOString().slice(0,10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Filtres */}
      <div className="bg-white p-4 rounded-lg shadow-sm border">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex items-center gap-2">
            <button className={`px-3 py-1.5 rounded ${range==='jour'?'bg-gray-900 text-white':'bg-gray-100'}`} onClick={()=>setRange('jour')}>Jour</button>
            <button className={`px-3 py-1.5 rounded ${range==='semaine'?'bg-gray-900 text-white':'bg-gray-100'}`} onClick={()=>setRange('semaine')}>Semaine</button>
            <button className={`px-3 py-1.5 rounded ${range==='mois'?'bg-gray-900 text-white':'bg-gray-100'}`} onClick={()=>setRange('mois')}>Mois</button>
            <button className={`px-3 py-1.5 rounded ${range==='custom'?'bg-gray-900 text-white':'bg-gray-100'}`} onClick={()=>setRange('custom')}>Personnalisé</button>
          </div>

          {range==='custom' && (
            <>
              <div>
                <label className="block text-xs text-gray-600 mb-1">Du</label>
                <input type="date" className="border rounded px-2 py-1" value={customStart} onChange={e=>setCustomStart(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">Au</label>
                <input type="date" className="border rounded px-2 py-1" value={customEnd} onChange={e=>setCustomEnd(e.target.value)} />
              </div>
            </>
          )}

          <div className="ml-auto flex items-center gap-2">
            <span className="text-sm text-gray-600">{label}</span>
            <button onClick={exportCSV} className="px-3 py-1.5 rounded bg-red-600 text-white">Exporter CSV</button>
          </div>
        </div>
      </div>

      {/* Tableau agrégé */}
      <div className="bg-white rounded-lg shadow-sm border overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr className="text-left">
              <th className="px-4 py-2">Agence</th>
              <th className="px-4 py-2">Nb réceptions</th>
              <th className="px-4 py-2">Espèces reçues</th>
              <th className="px-4 py-2">Entrées manuelles</th>
              <th className="px-4 py-2">Total entrées</th>
              <th className="px-4 py-2">Sorties</th>
              <th className="px-4 py-2">Solde</th>
              <th className="px-4 py-2">MM (attendu – info)</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-500">Chargement…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-500">Aucune donnée sur la période.</td></tr>
            ) : (
              rows.map(r => (
                <tr key={r.agenceId} className="border-t">
                  <td className="px-4 py-2">
                    <button
                      onClick={() => loadAgencyDetail(r.agenceId, r.agenceNom)}
                      className="text-indigo-600 hover:underline"
                      title="Voir la caisse de cette agence"
                    >
                      {r.agenceNom}
                    </button>
                  </td>
                  <td className="px-4 py-2">{r.nbReceptions}</td>
                  <td className="px-4 py-2">{formatXOF(r.especesRecues)}</td>
                  <td className="px-4 py-2">{formatXOF(r.entreesManuelles)}</td>
                  <td className="px-4 py-2 font-medium">{formatXOF(r.totalEntrees)}</td>
                  <td className="px-4 py-2">{formatXOF(r.sorties)}</td>
                  <td className="px-4 py-2 font-semibold">{formatXOF(r.solde)}</td>
                  <td className="px-4 py-2">{formatXOF(r.mmInfo)}</td>
                </tr>
              ))
            )}
          </tbody>
          {!loading && rows.length > 0 && (
            <tfoot className="bg-gray-50 border-t">
              <tr>
                <th className="px-4 py-2 text-left">TOTAL</th>
                <th className="px-4 py-2">{totals.nbReceptions}</th>
                <th className="px-4 py-2">{formatXOF(totals.especesRecues)}</th>
                <th className="px-4 py-2">{formatXOF(totals.entreesManuelles)}</th>
                <th className="px-4 py-2">{formatXOF(totals.totalEntrees)}</th>
                <th className="px-4 py-2">{formatXOF(totals.sorties)}</th>
                <th className="px-4 py-2">{formatXOF(totals.solde)}</th>
                <th className="px-4 py-2">{formatXOF(totals.mmInfo)}</th>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Panneau de détail par agence */}
      {openDetailAgencyId && (
        <div className="fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/30" onClick={() => setOpenDetailAgencyId(null)} />
          <div className="absolute right-0 top-0 h-full w-full max-w-2xl bg-white shadow-xl flex flex-col">
            <div className="px-4 py-3 border-b flex items-center justify-between">
              <div className="font-semibold">
                Caisse — {openDetailAgencyName} <span className="text-sm text-gray-500">({label})</span>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={exportDetailCSV} className="px-3 py-1.5 rounded bg-red-600 text-white text-sm">Exporter CSV</button>
                <button onClick={() => setOpenDetailAgencyId(null)} className="px-3 py-1.5 rounded border text-sm">Fermer</button>
              </div>
            </div>

            <div className="p-4 space-y-3 overflow-auto">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Kpi label="Entrées (période)" value={formatXOF(detailTotals.in)} />
                <Kpi label="Sorties (période)" value={formatXOF(detailTotals.out)} />
                <Kpi label="Solde (période)" value={formatXOF(detailTotals.in - detailTotals.out)} />
              </div>

              <div className="rounded border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left">Date</th>
                      <th className="px-3 py-2 text-right">Entrées</th>
                      <th className="px-3 py-2 text-right">Sorties</th>
                      <th className="px-3 py-2 text-right">Solde</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detailLoading ? (
                      <tr><td colSpan={4} className="px-3 py-6 text-center text-gray-500">Chargement…</td></tr>
                    ) : detailDays.length === 0 ? (
                      <tr><td colSpan={4} className="px-3 py-6 text-center text-gray-500">Aucun mouvement sur la période.</td></tr>
                    ) : (
                      detailDays.map(d => (
                        <tr key={d.dateISO} className="border-t">
                          <td className="px-3 py-2">{new Date(d.dateISO).toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'long', year:'numeric' })}</td>
                          <td className="px-3 py-2 text-right">{formatXOF(d.entrees)}</td>
                          <td className="px-3 py-2 text-right">{formatXOF(d.sorties)}</td>
                          <td className="px-3 py-2 text-right">{formatXOF(d.solde)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          {/* déclenche le chargement si panneau ouvert et pas encore de données */}
          {!detailLoading && detailDays.length === 0 && (
            <span className="hidden">{/* noop to quiet React */}</span>
          )}
        </div>
      )}
    </div>
  );
};

const Kpi: React.FC<{label:string; value:string}> = ({label, value}) => (
  <div className="rounded-2xl border p-4 bg-white shadow-sm">
    <div className="text-sm text-gray-500">{label}</div>
    <div className="text-2xl font-extrabold mt-1">{value}</div>
  </div>
);

export default CompagnieComptabilitePage;
