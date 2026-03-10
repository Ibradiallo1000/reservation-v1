// ✅ src/pages/AgenceFinancesPage.tsx — version compatible structure imbriquée Firestore

import React, { useEffect, useState } from 'react';
import { Timestamp, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/firebaseConfig';
import { useFormatCurrency } from '@/shared/currency/CurrencyContext';
import { useAuth } from '@/contexts/AuthContext';
import { StandardLayoutWrapper, PageHeader, SectionCard, ActionButton } from '@/ui';
import { Wallet } from 'lucide-react';

const AgenceFinancesPage: React.FC = () => {
  const { user } = useAuth();
  const money = useFormatCurrency();
  const [periode, setPeriode] = useState<'jour' | 'semaine' | 'mois'>('jour');
  const [revenu, setRevenu] = useState(0);
  const [nombre, setNombre] = useState(0);

  const getStartDate = () => {
    const now = new Date();
    switch (periode) {
      case 'semaine':
        now.setDate(now.getDate() - 7);
        break;
      case 'mois':
        now.setDate(now.getDate() - 30);
        break;
      default:
        now.setHours(0, 0, 0, 0);
    }
    return Timestamp.fromDate(now);
  };

  const fetchStats = async () => {
    if (!user?.companyId || !user?.agencyId) return;

    const start = getStartDate();
    const q = query(
      collection(db, 'companies', user.companyId, 'agences', user.agencyId, 'reservations'),
      where('createdAt', '>=', start),
      where('statut', 'in', ['paye', 'payé'])
    );
    const snap = await getDocs(q);
    const total = snap.docs.reduce((sum, doc) => sum + (doc.data().montant || 0), 0);
    setRevenu(total);
    setNombre(snap.size);
  };

  useEffect(() => {
    fetchStats();
  }, [periode, user]);

  return (
    <StandardLayoutWrapper>
      <PageHeader title="État financier de l'agence" icon={Wallet} />
      <SectionCard title="Période">
        <div className="mb-4">
          <select
            value={periode}
            onChange={(e) => setPeriode(e.target.value as typeof periode)}
            className="h-9 min-w-[190px] rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700"
          >
            <option value="jour">Aujourd'hui</option>
            <option value="semaine">7 derniers jours</option>
            <option value="mois">Ce mois-ci</option>
          </select>
        </div>
      </SectionCard>
      <SectionCard title="Résumé">
        <p className="text-lg">Revenu total : <span className="font-bold text-green-700">{money(revenu)}</span></p>
        <p className="text-lg">Nombre de réservations : <span className="font-bold text-blue-700">{nombre}</span></p>
        <div className="mt-4">
          <ActionButton onClick={() => window.print()}>Imprimer le résumé</ActionButton>
        </div>
      </SectionCard>
    </StandardLayoutWrapper>
  );
};

export default AgenceFinancesPage;
