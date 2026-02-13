// src/components/layout/GuichetRapportPanel.tsx
import React, { useCallback, useEffect, useState } from 'react';
import { collection, getDocs, orderBy, query, where } from 'firebase/firestore';
import { db } from '@/firebaseConfig';
import { useAuth } from '@/contexts/AuthContext';
import { useActiveShift } from '@/modules/agence/hooks/useActiveShift';

const GuichetRapportPanel: React.FC = () => {
  const { user } = useAuth();
  const { activeShift } = useActiveShift(); // <- peut être null au début
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const loadReport = useCallback(async () => {
    if (!user?.companyId || !user?.agencyId || !user?.uid) return;
    setLoading(true);
    try {
      const resRef = collection(
        db,
        `companies/${user.companyId}/agences/${user.agencyId}/reservations`
      );

      // ⚠️ Ne JAMAIS faire: const { id } = activeShift; (activeShift peut être null)
      const shiftId: string | undefined = activeShift?.id;

      let qRef;
      if (shiftId) {
        // Rapport du poste en cours
        qRef = query(
          resRef,
          where('guichetierId', '==', user.uid),
          where('shiftId', '==', shiftId),
          orderBy('heure', 'asc')
        );
      } else {
        // Fallback: rapport du jour (si aucun poste actif)
        const todayISO = new Date().toISOString().slice(0, 10);
        qRef = query(
          resRef,
          where('guichetierId', '==', user.uid),
          where('date', '==', todayISO),
          orderBy('heure', 'asc')
        );
      }

      const snap = await getDocs(qRef);
      setRows(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error('Erreur chargement rapport:', e);
    } finally {
      setLoading(false);
    }
  }, [user?.companyId, user?.agencyId, user?.uid, activeShift?.id]);

  useEffect(() => {
    void loadReport();
  }, [loadReport]);

  const total = rows.reduce((s, r) => s + (r.montant || 0), 0);
  const totalCash = rows
    .filter((r) => r.paiement === 'espèces')
    .reduce((s, r) => s + (r.montant || 0), 0);
  const totalMM = rows
    .filter((r) => r.paiement === 'mobile_money')
    .reduce((s, r) => s + (r.montant || 0), 0);

  return (
    <section className="bg-white p-4 md:p-6 rounded-2xl shadow-lg border border-gray-200">
      <div className="mb-4">
        <h2 className="text-xl font-semibold">
          {activeShift ? 'Rapport du poste en cours' : 'Rapport du jour'}
        </h2>
        {!activeShift && (
          <p className="text-sm text-gray-500">
            Aucun poste actif détecté — affichage des ventes du jour.
          </p>
        )}
      </div>

      {loading ? (
        <p>Chargement…</p>
      ) : rows.length === 0 ? (
        <p className="text-gray-500">Aucune vente trouvée.</p>
      ) : (
        <>
          <table className="w-full text-sm border">
            <thead className="bg-gray-100">
              <tr>
                <th className="p-2 border">Heure</th>
                <th className="p-2 border">Trajet</th>
                <th className="p-2 border">Client</th>
                <th className="p-2 border">Places</th>
                <th className="p-2 border">Montant</th>
                <th className="p-2 border">Paiement</th>
                <th className="p-2 border">Réf</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="p-2 border">{r.heure}</td>
                  <td className="p-2 border">
                    {r.depart} → {r.arrivee}
                  </td>
                  <td className="p-2 border">{r.nomClient}</td>
                  <td className="p-2 border">
                    {(r.seatsGo || 0) + (r.seatsReturn || 0)}
                  </td>
                  <td className="p-2 border">
                    {(r.montant || 0).toLocaleString('fr-FR')} FCFA
                  </td>
                  <td className="p-2 border">{r.paiement}</td>
                  <td className="p-2 border">{r.referenceCode}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3 rounded-lg bg-gray-50 border">
              <div className="text-xs text-gray-500">Total ventes</div>
              <div className="text-lg font-bold">
                {total.toLocaleString('fr-FR')} FCFA
              </div>
            </div>
            <div className="p-3 rounded-lg bg-gray-50 border">
              <div className="text-xs text-gray-500">Espèces</div>
              <div className="text-lg font-bold">
                {totalCash.toLocaleString('fr-FR')} FCFA
              </div>
            </div>
            <div className="p-3 rounded-lg bg-gray-50 border">
              <div className="text-xs text-gray-500">Mobile Money</div>
              <div className="text-lg font-bold">
                {totalMM.toLocaleString('fr-FR')} FCFA
              </div>
            </div>
          </div>
        </>
      )}
    </section>
  );
};

export default GuichetRapportPanel;
