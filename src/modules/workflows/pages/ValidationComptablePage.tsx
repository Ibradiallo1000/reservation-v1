import React, { useCallback, useEffect, useState } from 'react';
import {
  collection, getDocs, query, where, orderBy, limit,
  doc, updateDoc, Timestamp
} from 'firebase/firestore';
import { db } from '@/firebaseConfig';
import { useAuth } from '@/contexts/AuthContext';
import useCompanyTheme from '@/shared/hooks/useCompanyTheme';
import { Building2, Printer, CheckCircle } from 'lucide-react';

type RouteTrip = { date:string; heure:string; billets:number; montant:number };
type RouteGroup = { depart:string; arrivee:string; trips:RouteTrip[]; totalBillets:number; totalMontant:number };
type ShiftReport = {
  shiftId: string;
  guichetierId: string;
  guichetierCode?: string;
  startAt: any;
  endAt: any;
  status: 'awaiting_accountant' | 'awaiting_manager' | 'validated';
  reservationsCount: number;
  ticketsCount: number;
  amountTotal: number;
  byRoute: RouteGroup[];
  accountantValidatedAt?: any;
  managerValidatedAt?: any;
};

// ── A) util: date sûre (ne plante pas si vide/mal formée)
function safeDate(d: any) {
  if (!d) return '—';
  const date = d?.toDate?.() ? d.toDate() : new Date(d);
  if (isNaN(date.getTime())) return '—';
  return date.toLocaleString('fr-FR');
}

const ValidationComptablePage: React.FC = () => {
  const { user, company } = useAuth() as any;
  const theme = useCompanyTheme(company) || { primary: '#EA580C', secondary: '#F97316' };
  const [reports, setReports] = useState<ShiftReport[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!user?.companyId || !user?.agencyId) return;
    setLoading(true);
    try {
      const col = collection(db, `companies/${user.companyId}/agences/${user.agencyId}/shiftReports`);
      const snap = await getDocs(query(
        col,
        where('status', '==', 'awaiting_accountant'),
        orderBy('endAt', 'desc'),
        limit(50)
      ));
      setReports(snap.docs.map(d => d.data() as ShiftReport));
    } finally {
      setLoading(false);
    }
  }, [user?.companyId, user?.agencyId]);

  useEffect(() => { void load(); }, [load]);

  const validate = async (rep: ShiftReport) => {
    if (!user?.companyId || !user?.agencyId) return;
    const ref = doc(db, `companies/${user.companyId}/agences/${user.agencyId}/shiftReports/${rep.shiftId}`);
    await updateDoc(ref, {
      status: 'awaiting_manager',
      accountantValidatedAt: Timestamp.now(),
    });
    await load();
  };

  return (
    <div className="max-w-6xl mx-auto p-4">
      <header className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="h-10 w-10 rounded bg-gray-100 grid place-items-center border">
            <Building2 className="h-5 w-5 text-gray-600" />
          </div>
          <h1 className="text-xl font-bold">Validations – Comptabilité</h1>
        </div>
        <button onClick={load} className="px-3 py-2 rounded-lg border bg-white hover:bg-gray-50">Actualiser</button>
      </header>

      {loading && <div className="text-sm text-gray-600">Chargement…</div>}
      {!loading && reports.length === 0 && (
        <div className="text-sm text-gray-600">Aucun rapport en attente de validation comptable.</div>
      )}

      <div className="space-y-4">
        {reports.map((rep) => (
          <div key={rep.shiftId} className="rounded-2xl border bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-lg font-semibold">Session #{rep.shiftId.slice(0,6)} – Guichetier {rep.guichetierCode || rep.guichetierId}</div>
                <div className="text-xs text-gray-500">
                  {/* B) dates protégées */}
                  Début : {safeDate(rep.startAt)} • Fin : {safeDate(rep.endAt)}
                </div>
              </div>
              <span className="px-3 py-1 rounded-full text-xs font-semibold" style={{ background:'#FEF3C7', color:'#92400E' }}>
                En attente de validation comptable
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
              <div className="rounded-xl border p-4 bg-gray-50">
                <div className="text-sm text-gray-500">Réservations</div>
                <div className="text-2xl font-bold">{rep.reservationsCount}</div>
              </div>
              <div className="rounded-xl border p-4 bg-gray-50">
                <div className="text-sm text-gray-500">Billets</div>
                <div className="text-2xl font-bold">{rep.ticketsCount}</div>
              </div>
              <div className="rounded-xl border p-4 bg-gray-50">
                <div className="text-sm text-gray-500">Montant</div>
                <div className="text-2xl font-bold">{rep.amountTotal.toLocaleString('fr-FR')} FCFA</div>
              </div>
            </div>

            <div className="mt-4">
              <div className="font-semibold mb-2">Détails par trajet</div>

              {/* C) garde: byRoute doit être un tableau non vide */}
              {Array.isArray(rep.byRoute) && rep.byRoute.length > 0 ? (
                rep.byRoute.map((g, i) => (
                  <div key={i} className="mb-3 rounded-lg border overflow-hidden">
                    <div className="px-3 py-2 bg-gray-50 flex items-center justify-between">
                      <div className="font-medium">{g.depart} → {g.arrivee}</div>
                      <div className="text-sm"><b>{g.totalBillets}</b> billets • <b>{g.totalMontant.toLocaleString('fr-FR')}</b> FCFA</div>
                    </div>
                    <table className="w-full text-sm">
                      <thead className="bg-white">
                        <tr>
                          <th className="px-3 py-2 text-left">Date</th>
                          <th className="px-3 py-2 text-left">Heure</th>
                          <th className="px-3 py-2 text-right">Billets</th>
                          <th className="px-3 py-2 text-right">Montant</th>
                        </tr>
                      </thead>
                      <tbody>
                        {g.trips.map((t, k) => (
                          <tr key={k} className="border-t">
                            <td className="px-3 py-2">{t.date}</td>
                            <td className="px-3 py-2">{t.heure}</td>
                            <td className="px-3 py-2 text-right">{t.billets}</td>
                            <td className="px-3 py-2 text-right">{t.montant.toLocaleString('fr-FR')} FCFA</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))
              ) : (
                <div className="text-gray-500 text-sm">Aucune vente.</div>
              )}
            </div>

            <div className="mt-4 flex gap-2">
              <button className="px-3 py-2 rounded-lg border bg-white hover:bg-gray-50" onClick={() => window.print()}>
                <Printer className="h-4 w-4 inline mr-1" /> Imprimer
              </button>
              <button
                onClick={() => validate(rep)}
                className="px-3 py-2 rounded-lg text-white"
                style={{ background:`linear-gradient(90deg, ${theme.primary}, ${theme.secondary})` }}
              >
                <CheckCircle className="h-4 w-4 inline mr-1" /> Valider (envoyer au chef d’agence)
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ValidationComptablePage;
