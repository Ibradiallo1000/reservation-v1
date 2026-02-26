// src/pages/ShiftHistoryPage.tsx
// ===============================================================
// Historique personnel des postes (guichetier connecté)
// - Liste par SESSION (début → fin) avec badges de validation
// - Détails imprimables, regroupés par TRAJET (Bko→Kayes, etc.)
// - Compatible schémas: guichetierId / openedById / userId
// - Montants: billets, total, dépôt déclaré, écart (manquant/surplus/OK)
// ===============================================================

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  collection, getDocs, query, where, orderBy,
} from 'firebase/firestore';
import { db } from '@/firebaseConfig';
import { useAuth } from '@/contexts/AuthContext';
import useCompanyTheme from '@/shared/hooks/useCompanyTheme';
import { Link } from 'react-router-dom';
import { ArrowLeft, RefreshCw, Download, Printer, Eye, X, ShieldCheck, Stamp } from 'lucide-react';
import { useFormatCurrency } from '@/shared/currency/CurrencyContext';

/* ----------------------- Types ----------------------- */
type ValidStamp = {
  validated?: boolean;
  at?: any;             // Timestamp
  by?: { id?: string; name?: string };
  note?: string | null;
};

type ShiftDoc = {
  id: string;
  status: 'active' | 'paused' | 'closed' | string;
  startTime: any;
  endTime?: any;
  guichetierId: string;
  guichetierCode?: string;
  guichetierName?: string;
  companyId: string;
  agencyId: string;
  tickets?: number;        // total billets attendus (calculé)
  amount?: number;         // total montant attendu
  // --- Conciliation / validations ---
  declaredDeposit?: number; // montant déposé
  difference?: number;      // deposit - amount
  discrepancyType?: 'manquant' | 'surplus' | null;
  comptable?: ValidStamp;
  chef?: ValidStamp;
};

type ReservationDoc = {
  id: string;
  date?: string;
  heure?: string;
  depart?: string;
  arrivee?: string;
  nomClient?: string;
  telephone?: string;
  seatsGo?: number;
  seatsReturn?: number;
  montant?: number;
  paiement?: string;
  createdAt?: any;
  referenceCode?: string;
};

/* ----------------------- Utils ----------------------- */
function fmtDateTime(v?: any) {
  if (!v) return '—';
  try {
    if (typeof v?.toDate === 'function') return v.toDate().toLocaleString('fr-FR');
    if (typeof v === 'number') return new Date(v).toLocaleString('fr-FR');
    return new Date(v).toLocaleString('fr-FR');
  } catch {
    return '—';
  }
}
const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);

function badge(text: string, bg: string, fg: string) {
  return (
    <span className="px-2 py-0.5 rounded text-xs font-medium" style={{ backgroundColor: bg, color: fg }}>
      {text}
    </span>
  );
}


/* ===================================================== */
const ShiftHistoryPage: React.FC = () => {
  const { user, company } = useAuth() as any;
  const theme = useCompanyTheme(company) || { primary: '#e85d04', secondary: '#ffb703' };
  const money = useFormatCurrency();

  const companyId = user?.companyId;
  const agencyId = user?.agencyId;
  const uid = user?.uid;

  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<ShiftDoc[]>([]);

  // modal détails
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<ShiftDoc | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [reservations, setReservations] = useState<ReservationDoc[]>([]);

  /* ------------------ Charger la liste ------------------ */
  const load = useCallback(async () => {
    if (!companyId || !agencyId || !uid) return;
    setLoading(true);
    try {
      const ref = collection(db, `companies/${companyId}/agences/${agencyId}/shifts`);
      // On lit par startTime DESC, puis on filtre côté client par UID (compat schéma)
      const qy = query(ref, orderBy('startTime', 'desc'));
      const snap = await getDocs(qy);
      const list: ShiftDoc[] = snap.docs.map(d => {
        const x = d.data() as any;
        const guichetierId = x.guichetierId || x.userId || x.openedById || x.openedBy || '';
        const guichetierName = x.guichetierName || x.userName || x.openedByName || user?.displayName || user?.email || '';
        const guichetierCode = x.guichetierCode || x.userCode || x.openedByCode ||
          user?.staffCode || user?.codeCourt || user?.code || '';
        return {
          id: d.id,
          status: x.status || 'closed',
          startTime: x.startTime ?? x.startedAt ?? x.createdAt,
          endTime: x.endTime ?? x.closedAt ?? null,
          guichetierId,
          guichetierCode,
          guichetierName,
          companyId: x.companyId,
          agencyId: x.agencyId,
          tickets: x.tickets ?? x.totalTickets ?? undefined,
          amount: x.amount ?? x.totalAmount ?? undefined,
          declaredDeposit: x.declaredDeposit ?? x.cashReceived ?? undefined,
          difference: x.difference ?? undefined,
          discrepancyType: x.discrepancyType ?? null,
          // compat compta
          comptable: x.comptable ?? (x.accountantValidated ? { validated:true, at:x.validatedAt, by:{ id:x.accountantId, name:x.accountantName } } : {}),
          chef: x.chef ?? {},
        };
      }).filter(sh => sh.guichetierId === uid);
      setRows(list);
    } finally {
      setLoading(false);
    }
  }, [companyId, agencyId, uid, user]);

  useEffect(() => { void load(); }, [load]);

  /* ----------------- Charger les détails ----------------- */
  const openDetails = useCallback(async (sh: ShiftDoc) => {
    setSelected(sh);
    setOpen(true);
    if (!sh?.id || !companyId || !agencyId) return;
    setLoadingDetails(true);
    try {
      const ref = collection(db, `companies/${companyId}/agences/${agencyId}/reservations`);
      const qy = query(ref, where('shiftId', '==', sh.id), orderBy('createdAt', 'asc'));
      const snap = await getDocs(qy);
      const list: ReservationDoc[] = snap.docs.map(d => {
        const r = d.data() as any;
        return {
          id: d.id,
          date: r.date,
          heure: r.heure,
          depart: r.depart,
          arrivee: r.arrivee,
          nomClient: r.nomClient,
          telephone: r.telephone,
          seatsGo: r.seatsGo || 0,
          seatsReturn: r.seatsReturn || 0,
          montant: r.montant || 0,
          paiement: r.paiement || '',
          createdAt: r.createdAt,
          referenceCode: r.referenceCode || d.id,
        };
      });
      setReservations(list);
    } finally {
      setLoadingDetails(false);
    }
  }, [companyId, agencyId]);

  /* ---------------------- Grouping ---------------------- */
  type ByTrajet = {
    trajet: string;
    billets: number;
    montant: number;
    items: ReservationDoc[];
  };
  const grouped: ByTrajet[] = useMemo(() => {
    const map = new Map<string, ByTrajet>();
    for (const r of reservations) {
      const key = `${r.depart || '—'} → ${r.arrivee || '—'}`;
      const nb = (r.seatsGo || 0) + (r.seatsReturn || 0);
      const cur = map.get(key) ?? { trajet: key, billets: 0, montant: 0, items: [] };
      cur.billets += nb;
      cur.montant += (r.montant || 0);
      cur.items.push(r);
      map.set(key, cur);
    }
    // ordre alpha par trajet
    return Array.from(map.values()).sort((a,b)=>a.trajet.localeCompare(b.trajet,'fr'));
  }, [reservations]);

  const totals = useMemo(() => {
    const billets = sum(reservations.map(r => (r.seatsGo || 0) + (r.seatsReturn || 0)));
    const montant = sum(reservations.map(r => r.montant || 0));
    return { billets, montant };
  }, [reservations]);

  /* -------------------- Export CSV -------------------- */
  const exportCSV = () => {
    if (!rows.length) return;
    const esc = (v: any) => {
      const s = (v ?? '').toString();
      return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const head = [
      'Statut','Début','Fin','Guichetier','Code',
      'Billets(shift)','Montant(shift)','Déposé','Écart','Type écart',
      'Valide cpta','Date cpta','Valide chef','Date chef'
    ].join(';');
    const body = rows.map(r => [
      r.status, fmtDateTime(r.startTime), fmtDateTime(r.endTime),
      r.guichetierName || '', r.guichetierCode || '',
      r.tickets ?? '', r.amount ?? '',
      r.declaredDeposit ?? '',
      r.difference ?? '',
      r.discrepancyType ?? '',
      r.comptable?.validated ? 'oui' : 'non',
      r.comptable?.at ? fmtDateTime(r.comptable.at) : '',
      r.chef?.validated ? 'oui' : 'non',
      r.chef?.at ? fmtDateTime(r.chef.at) : ''
    ].map(esc).join(';')).join('\n');

    const blob = new Blob([head + '\n' + body], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mes_postes_${(user as any)?.codeCourt || 'guichetier'}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 400);
  };

  /* -------------------- Impression -------------------- */
  const printDetails = () => window.print();

  /* ----------------------- UI ----------------------- */
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Styles d'impression — n'imprimer que #print-area dans le modal */}
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #print-area, #print-area * { visibility: visible !important; }
          #print-area { position: absolute; left: 0; top: 0; width: 100%; }
        }
      `}</style>

      {/* Bandeau */}
      <div
        className="sticky top-0 z-10 border-b text-white"
        style={{ background: `linear-gradient(90deg, ${theme.primary}, ${theme.secondary})` }}
      >
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="text-lg font-semibold">Historique de mes postes</div>
          <Link
            to="/agence/guichet"
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20"
            title="Retour au guichet"
          >
            <ArrowLeft size={16} /> Retour au guichet
          </Link>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="bg-white rounded-xl shadow border overflow-hidden">
          {/* Entête tableau */}
          <div className="px-4 py-3 flex items-center justify-between border-b">
            <div className="font-semibold">Mes sessions de guichet</div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => load()}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border hover:bg-gray-50"
                title="Actualiser"
              >
                <RefreshCw size={16} /> Actualiser
              </button>
              <button
                onClick={exportCSV}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border hover:bg-gray-50"
              >
                <Download size={16} /> Export CSV
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr
                  style={{ background: `linear-gradient(90deg, ${theme.primary}22, ${theme.secondary}22)` }}
                  className="text-gray-700"
                >
                  <th className="px-3 py-2 text-left">Session</th>
                  <th className="px-3 py-2 text-left">Statut</th>
                  <th className="px-3 py-2 text-right">Billets</th>
                  <th className="px-3 py-2 text-right">Montant</th>
                  <th className="px-3 py-2 text-right">Dépôt</th>
                  <th className="px-3 py-2 text-right">Écart</th>
                  <th className="px-3 py-2 text-left">Cpta</th>
                  <th className="px-3 py-2 text-left">Chef</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td className="px-3 py-6 text-center text-gray-500" colSpan={9}>Chargement…</td></tr>
                ) : rows.length === 0 ? (
                  <tr><td className="px-3 py-6 text-center text-gray-500" colSpan={9}>Aucune session trouvée.</td></tr>
                ) : (
                  rows.map(r => {
                    const hasDiff = typeof r.difference === 'number' && !Number.isNaN(r.difference);
                    const diffStr =
                      hasDiff ? money(r.difference || 0) : money(0);
                    return (
                      <tr key={r.id} className="border-t hover:bg-gray-50">
                        <td className="px-3 py-2">
                          <div className="font-medium">
                            {fmtDateTime(r.startTime)} → {fmtDateTime(r.endTime)}
                          </div>
                          <div className="text-xs text-gray-500">
                            {r.guichetierName} {r.guichetierCode ? `(${r.guichetierCode})` : ''}
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          {r.status === 'active'
                            ? badge('En service', '#DCFCE7', '#15803D')
                            : r.status === 'paused'
                            ? badge('En pause', '#FEF3C7', '#92400E')
                            : badge('Clôturé', '#F3F4F6', '#374151')}
                        </td>
                        <td className="px-3 py-2 text-right">{r.tickets ?? '—'}</td>
                        <td className="px-3 py-2 text-right">{r.amount != null ? money(r.amount) : '—'}</td>
                        <td className="px-3 py-2 text-right">{r.declaredDeposit != null ? money(r.declaredDeposit) : '—'}</td>
                        <td className="px-3 py-2 text-right">
                          {hasDiff ? (
                            r.discrepancyType === 'manquant'
                              ? badge(`Manquant ${diffStr}`, '#FEE2E2', '#B91C1C')
                              : r.difference === 0
                                ? badge('OK', '#DCFCE7', '#15803D')
                                : badge(`Surplus ${diffStr}`, '#E0E7FF', '#3730A3')
                          ) : '—'}
                        </td>
                        <td className="px-3 py-2">
                          {r.comptable?.validated
                            ? <span className="inline-flex items-center gap-1 text-emerald-700 text-xs">
                                <ShieldCheck size={14}/> OK — {fmtDateTime(r.comptable.at)}
                              </span>
                            : <span className="text-amber-700 text-xs">En attente</span>}
                        </td>
                        <td className="px-3 py-2">
                          {r.chef?.validated
                            ? <span className="inline-flex items-center gap-1 text-emerald-700 text-xs">
                                <Stamp size={14}/> OK — {fmtDateTime(r.chef.at)}
                              </span>
                            : <span className="text-amber-700 text-xs">En attente</span>}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button
                            onClick={() => openDetails(r)}
                            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border hover:bg-gray-50"
                          >
                            <Eye size={16} /> Voir détails
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ======================= MODAL DÉTAILS ======================= */}
      {open && selected && (
        <div className="fixed inset-0 z-50">
          {/* Overlay */}
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          {/* Card */}
          <div className="absolute inset-0 md:inset-6 bg-white rounded-none md:rounded-xl shadow-xl flex flex-col">
            {/* Header */}
            <div
              className="px-4 md:px-6 py-4 flex items-center justify-between text-white rounded-t-2xl"
              style={{ background: `linear-gradient(90deg, ${theme.primary}, ${theme.secondary})` }}
            >
              <div className="font-semibold">Détails de la session</div>
              <button onClick={() => setOpen(false)} className="bg-white/10 hover:bg-white/20 rounded p-1">
                <X size={18} />
              </button>
            </div>

            {/* Actions */}
            <div className="px-4 md:px-6 py-3 border-b flex items-center gap-2">
              <button
                onClick={printDetails}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border hover:bg-gray-50"
              >
                <Printer size={16} /> Imprimer
              </button>
              <Link
                to="/agence/guichet"
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border hover:bg-gray-50"
                onClick={() => setOpen(false)}
              >
                <ArrowLeft size={16} /> Retour au guichet
              </Link>
            </div>

            {/* Contenu scrollable */}
            <div className="flex-1 overflow-auto p-4 md:p-6" id="print-area">
              {/* En-tête rapport */}
              <div className="mb-4">
                <div className="text-lg font-semibold">Rapport de poste</div>
                <div className="text-sm text-gray-600">
                  Guichetier : {selected.guichetierName}
                  {selected.guichetierCode ? ` (${selected.guichetierCode})` : ''} •{' '}
                  Période : {fmtDateTime(selected.startTime)} → {fmtDateTime(selected.endTime)} •{' '}
                  Statut : {selected.status === 'active' ? 'En service' : selected.status === 'paused' ? 'En pause' : 'Clôturé'}
                </div>
              </div>

              {/* Totaux & conciliation */}
              <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-4">
                <div className="rounded-xl border p-3 md:col-span-1">
                  <div className="text-xs text-gray-500">Billets</div>
                  <div className="text-xl font-bold">{totals.billets}</div>
                </div>
                <div className="rounded-xl border p-3 md:col-span-1">
                  <div className="text-xs text-gray-500">Montant attendu</div>
                  <div className="text-xl font-bold">{money(selected.amount ?? totals.montant)}</div>
                </div>
                <div className="rounded-xl border p-3 md:col-span-1">
                  <div className="text-xs text-gray-500">Montant déposé</div>
                  <div className="text-xl font-bold">{money(selected.declaredDeposit ?? 0)}</div>
                </div>
                <div className="rounded-xl border p-3 md:col-span-1">
                  <div className="text-xs text-gray-500">Écart</div>
                  <div className="text-sm font-semibold">
                    {typeof selected.difference === 'number'
                      ? (selected.discrepancyType === 'manquant'
                          ? badge(`Manquant ${money(selected.difference)}`, '#FEE2E2', '#B91C1C')
                          : selected.difference === 0
                            ? badge('OK', '#DCFCE7', '#15803D')
                            : badge(`Surplus ${money(selected.difference)}`, '#E0E7FF', '#3730A3'))
                      : '—'}
                  </div>
                </div>
                <div className="rounded-xl border p-3 md:col-span-1">
                  <div className="text-xs text-gray-500">Comptable</div>
                  <div className="text-sm">
                    {selected.comptable?.validated
                      ? <span className="inline-flex items-center gap-1 text-emerald-700">
                          <ShieldCheck size={14}/> OK — {fmtDateTime(selected.comptable.at)}
                        </span>
                      : <span className="text-amber-700">En attente</span>}
                  </div>
                </div>
                <div className="rounded-xl border p-3 md:col-span-1">
                  <div className="text-xs text-gray-500">Chef d’agence</div>
                  <div className="text-sm">
                    {selected.chef?.validated
                      ? <span className="inline-flex items-center gap-1 text-emerald-700">
                          <Stamp size={14}/> OK — {fmtDateTime(selected.chef.at)}
                        </span>
                      : <span className="text-amber-700">En attente</span>}
                  </div>
                </div>
              </div>

              {/* Tableau regroupé par TRAJET */}
              <div className="space-y-4">
                {loadingDetails ? (
                  <div className="text-gray-500">Chargement…</div>
                ) : grouped.length === 0 ? (
                  <div className="text-gray-500">Aucune réservation dans cette session.</div>
                ) : (
                  grouped.map(g => (
                    <div key={g.trajet} className="rounded-xl border">
                      <div
                        className="px-3 py-2 text-sm font-semibold flex items-center justify-between"
                        style={{ background: `linear-gradient(90deg, ${theme.primary}1A, ${theme.secondary}1A)` }}
                      >
                        <div>{g.trajet}</div>
                        <div className="text-xs text-gray-700">
                          Billets: <b>{g.billets}</b> &nbsp;|&nbsp; Montant: <b>{money(g.montant)}</b>
                        </div>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-3 py-2 text-left">Heure</th>
                              <th className="px-3 py-2 text-left">Client</th>
                              <th className="px-3 py-2 text-left">Tél.</th>
                              <th className="px-3 py-2 text-right">Billets</th>
                              <th className="px-3 py-2 text-right">Montant</th>
                              <th className="px-3 py-2 text-left">Paiement</th>
                              <th className="px-3 py-2 text-left">Réf.</th>
                            </tr>
                          </thead>
                          <tbody>
                            {g.items.map(r => (
                              <tr key={r.id} className="border-t hover:bg-gray-50">
                                <td className="px-3 py-2">{r.heure || ''}</td>
                                <td className="px-3 py-2">{r.nomClient || ''}</td>
                                <td className="px-3 py-2">{r.telephone || ''}</td>
                                <td className="px-3 py-2 text-right">{(r.seatsGo || 0) + (r.seatsReturn || 0)}</td>
                                <td className="px-3 py-2 text-right">{money(r.montant || 0)}</td>
                                <td className="px-3 py-2">{r.paiement || ''}</td>
                                <td className="px-3 py-2">{r.referenceCode || r.id}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Note impression */}
              <div className="text-xs text-gray-500 mt-3">
                Conseil : utilisez le bouton <strong>Imprimer</strong> pour éditer ce rapport et le remettre à la comptabilité.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ShiftHistoryPage;
