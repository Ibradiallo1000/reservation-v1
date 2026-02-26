// src/pages/AgenceShiftHistoryPage.tsx
// ===============================================================
// Historique des postes - VUE AGENCE (chef d'agence / superviseur)
// - Liste les shifts de TOUTE l'agence
// - Filtres: période, statut, code guichetier
// - Totaux par session + lien vers rapport, impression, export
// - Design aux couleurs de la compagnie
// ===============================================================

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  collection, getDocs, query, where, orderBy, doc, getDoc
} from 'firebase/firestore';
import { db } from '@/firebaseConfig';
import { useAuth } from '@/contexts/AuthContext';
import useCompanyTheme from '@/shared/hooks/useCompanyTheme';
import { useFormatCurrency } from '@/shared/currency/CurrencyContext';

type Row = {
  id: string;
  guichetierCode?: string | null;
  status: 'active' | 'paused' | 'closed';
  startTime?: number | null;
  endTime?: number | null;
  reservations: number;
  billets: number;
  montant: number;
};

const tag = (s: Row['status']) =>
  s === 'active'
    ? { bg: '#DCFCE7', txt: '#166534', label: 'En service' }
    : s === 'paused'
    ? { bg: '#FEF3C7', txt: '#92400E', label: 'En pause' }
    : { bg: '#F3F4F6', txt: '#374151', label: 'Clôturé' };

const AgenceShiftHistoryPage: React.FC = () => {
  const { user, company } = useAuth();
  const theme = useCompanyTheme(company) || { primary: '#2563eb', secondary: '#7c3aed' };
  const navigate = useNavigate();
  const money = useFormatCurrency();

  // ---- Filtres ----
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [status, setStatus] = useState<'all'|'active'|'paused'|'closed'>('all');
  const [sellerCode, setSellerCode] = useState<string>('');

  // ---- Données ----
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Header dégradé
  const gradient = useMemo(
    () => ({ background: `linear-gradient(90deg, ${theme.primary}, ${theme.secondary})` }),
    [theme.primary, theme.secondary]
  );

  // Infos compagnie (logo + nom)
  const [companyName, setCompanyName] = useState('Compagnie');
  const [companyLogo, setCompanyLogo] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      if (!user?.companyId) return;
      const snap = await getDoc(doc(db, 'companies', user.companyId));
      if (snap.exists()) {
        const c = snap.data() as any;
        setCompanyName(c.nom || c.name || 'Compagnie');
        setCompanyLogo(c.logoUrl || c.logo || null);
      }
    })().catch(() => {});
  }, [user?.companyId]);

  const load = useCallback(async () => {
    try {
      if (!user?.companyId || !user?.agencyId) return;
      setErr(null);
      setLoading(true);

      // 1) fetch shifts de toute l'agence
      const shiftsRef = collection(db, `companies/${user.companyId}/agences/${user.agencyId}/shifts`);
      let q: any = query(shiftsRef, orderBy('startTime', 'desc'));

      if (status !== 'all') {
        q = query(shiftsRef, where('status', '==', status), orderBy('startTime', 'desc'));
      }

      // filtre période en mémoire (startTime/endTime sont des nombres/ts)
      const sSnap = await getDocs(q);

      // 2) précharge toutes les réservations (on filtrera par shiftId)
      const reservRef = collection(db, `companies/${user.companyId}/agences/${user.agencyId}/reservations`);
      const rSnap = await getDocs(reservRef);
      const allRes = rSnap.docs.map(d => ({ id: d.id, ...d.data() as any }));

      // 3) construit les lignes + filtres secondaires
      const fromMs = dateFrom ? new Date(dateFrom + 'T00:00:00').getTime() : null;
      const toMs   = dateTo   ? new Date(dateTo   + 'T23:59:59').getTime() : null;

      const lines: Row[] = [];
      for (const d of sSnap.docs) {
        const s = d.data() as any;

        // filtre période (sur startTime)
        if (fromMs && (s.startTime ?? 0) < fromMs) continue;
        if (toMs && (s.startTime ?? 0) > toMs) continue;

        // filtre code guichetier
        const code = (s.guichetierCode || s.sellerCode || '').toString();
        if (sellerCode && !code.toLowerCase().includes(sellerCode.toLowerCase())) continue;

        // agrégats sur ce shift
        const res = allRes.filter(r => r.shiftId === d.id);
        const reservations = res.length;
        const billets = res.reduce((acc, r) => acc + (r.seatsGo || 0) + (r.seatsReturn || 0), 0);
        const montant = res.reduce((acc, r) => acc + (r.montant || 0), 0);

        lines.push({
          id: d.id,
          guichetierCode: code || null,
          status: (s.status || 'closed') as Row['status'],
          startTime: s.startTime || s.startedAt || null,
          endTime: s.endTime || s.closedAt || null,
          reservations, billets, montant,
        });
      }

      setRows(lines);
    } catch (e: any) {
      setErr(e?.message || 'Erreur de chargement.');
    } finally {
      setLoading(false);
    }
  }, [user?.companyId, user?.agencyId, status, dateFrom, dateTo, sellerCode]);

  useEffect(() => { void load(); }, [load]);

  const openReport = (shiftId: string) => {
    // on réutilise la page /agence/reports avec le paramètre shiftId
    window.open(`/agence/reports?shiftId=${encodeURIComponent(shiftId)}`, '_blank');
  };
  const printReport = (shiftId: string) => {
    window.open(`/agence/reports?shiftId=${encodeURIComponent(shiftId)}&print=1`, '_blank');
  };

  const exportCSV = () => {
    if (!rows.length) return;
    const head = ['Shift', 'Guichetier', 'Statut', 'Début', 'Fin', 'Ventes', 'Billets', 'Montant'];
    const body = rows.map(r => {
      const s = tag(r.status).label;
      const start = r.startTime ? new Date(r.startTime).toLocaleString('fr-FR') : '';
      const end   = r.endTime ? new Date(r.endTime).toLocaleString('fr-FR') : '';
      const data = [
        r.id, r.guichetierCode || '', s, start, end,
        String(r.reservations), String(r.billets), String(r.montant)
      ];
      return data.map(v => {
        const t = (v ?? '').toString();
        return /[",\n;]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
      }).join(';');
    }).join('\n');

    const blob = new Blob([head.join(';') + '\n' + body], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'historique_agence_shifts.csv'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 400);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      {/* En-tête */}
      <div className="rounded-xl overflow-hidden border shadow-sm bg-white mb-4">
        <div className="p-4 text-white" style={gradient}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {companyLogo ? (
                <img src={companyLogo} className="h-8 w-8 object-contain bg-white/90 rounded p-1" />
              ) : <div className="h-8 w-8 rounded bg-white/30" />}
              <div>
                <div className="text-lg font-semibold">Historique des postes — Agence</div>
                <div className="text-xs opacity-90">{companyName}</div>
              </div>
            </div>
            <div className="hidden sm:flex gap-2">
              <button onClick={load} className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm">Actualiser</button>
              <button onClick={exportCSV} className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm">Export CSV</button>
            </div>
          </div>
        </div>

        {/* Filtres */}
        <div className="p-3 border-b grid grid-cols-1 sm:grid-cols-5 gap-2">
          <div className="sm:col-span-1">
            <label className="text-xs text-gray-500">Du</label>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                   className="w-full border rounded-lg px-3 py-2" />
          </div>
          <div className="sm:col-span-1">
            <label className="text-xs text-gray-500">Au</label>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                   className="w-full border rounded-lg px-3 py-2" />
          </div>
          <div className="sm:col-span-1">
            <label className="text-xs text-gray-500">Statut</label>
            <select value={status} onChange={e => setStatus(e.target.value as any)}
                    className="w-full border rounded-lg px-3 py-2">
              <option value="all">Tous</option>
              <option value="active">En service</option>
              <option value="paused">En pause</option>
              <option value="closed">Clôturé</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs text-gray-500">Code guichetier</label>
            <input placeholder="ex: G001" value={sellerCode}
                   onChange={e => setSellerCode(e.target.value)}
                   className="w-full border rounded-lg px-3 py-2" />
          </div>
        </div>

        {/* Table */}
        <div className="p-3">
          {err && <div className="mb-3 p-3 rounded-lg bg-red-50 text-red-700 text-sm border border-red-200">{err}</div>}

          <div className="overflow-auto rounded-xl border">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-white" style={gradient}>
                  <th className="px-3 py-2">Guichetier</th>
                  <th className="px-3 py-2">Statut</th>
                  <th className="px-3 py-2">Début</th>
                  <th className="px-3 py-2">Fin</th>
                  <th className="px-3 py-2 text-right">Ventes</th>
                  <th className="px-3 py-2 text-right">Billets</th>
                  <th className="px-3 py-2 text-right">Montant</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white">
                {loading ? (
                  <tr><td colSpan={8} className="px-3 py-6 text-center text-gray-500">Chargement…</td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan={8} className="px-3 py-6 text-center text-gray-500">Aucun résultat.</td></tr>
                ) : (
                  rows.map(r => {
                    const t = tag(r.status);
                    return (
                      <tr key={r.id} className="border-t hover:bg-gray-50">
                        <td className="px-3 py-2">{r.guichetierCode || '—'}</td>
                        <td className="px-3 py-2">
                          <span className="text-xs px-2 py-1 rounded" style={{ backgroundColor: t.bg, color: t.txt }}>{t.label}</span>
                        </td>
                        <td className="px-3 py-2">{r.startTime ? new Date(r.startTime).toLocaleString('fr-FR') : '—'}</td>
                        <td className="px-3 py-2">{r.endTime ? new Date(r.endTime).toLocaleString('fr-FR') : '—'}</td>
                        <td className="px-3 py-2 text-right">{r.reservations}</td>
                        <td className="px-3 py-2 text-right">{r.billets}</td>
                        <td className="px-3 py-2 text-right font-medium">{money(r.montant)}</td>
                        <td className="px-3 py-2 text-right">
                          <div className="flex justify-end gap-2">
                            <button onClick={() => openReport(r.id)} className="px-3 py-1.5 rounded-lg text-sm text-white" style={gradient}>Voir rapport</button>
                            <button onClick={() => printReport(r.id)} className="px-3 py-1.5 rounded-lg text-sm border">Imprimer</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="text-xs text-gray-500 mt-3">
            Vue agence : appliquez les filtres pour retrouver une session d’un guichetier et ouvrir/ imprimer son rapport.
          </div>
        </div>
      </div>
    </div>
  );
};

export default AgenceShiftHistoryPage;
