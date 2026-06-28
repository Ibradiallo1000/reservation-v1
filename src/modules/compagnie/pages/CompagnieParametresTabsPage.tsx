// =============================================
// src/pages/CompagnieParametresTabsPage.tsx
// VERSION CORRIGÉE MULTI-RÔLE (ADMIN + CEO)
// =============================================

import React, { useEffect, useState } from 'react';
import { useParams } from "react-router-dom";
import {
  BadgeDollarSign,
  Banknote,
  CreditCard,
  FileText,
  Globe2,
  Image,
  Package,
  Share2,
  Shield,
  Sparkles,
  Users,
  WalletCards,
} from "lucide-react";

import ParametresVitrine from '@/modules/compagnie/components/parametres/ParametresVitrine';
import ParametresPersonnel from '@/modules/compagnie/components/parametres/ParametresPersonnel';
import ParametresSecurite from '@/modules/compagnie/components/parametres/ParametresSecurite';
import ParametresReseauxPage from '@/modules/compagnie/components/parametres/ParametresReseauxPage';
import ParametresLegauxPage from '@/modules/compagnie/components/parametres/ParametresLegauxPage';
import ParametresPlan from '@/modules/compagnie/components/parametres/ParametresPlan';
import ParametresServices from '@/modules/compagnie/components/parametres/ParametresServices';
import BibliothequeImagesPage from '@/modules/compagnie/pages/BibliothequeImagesPage';
import CompanyPaymentSettingsPage from '@/modules/compagnie/pages/CompanyPaymentSettingsPage';
import ParametresBanques from '@/modules/compagnie/components/parametres/ParametresBanques';
import FinancialSettingsPage from '@/modules/compagnie/settings/FinancialSettingsPage';
import ParametresCourierColis from '@/modules/compagnie/components/parametres/ParametresCourierColis';
import CompanySettingsLayout, {
  type CompanySettingsSection,
} from '@/modules/compagnie/settings/CompanySettingsLayout';

import { useAuth } from '@/contexts/AuthContext';
import { StandardLayoutWrapper, PageHeader } from '@/ui';

import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/firebaseConfig';

import useCompanyTheme from '@/shared/hooks/useCompanyTheme';
import { Company } from '@/types/companyTypes';

type TabKey =
  | 'plan'
  | 'vitrine'
  | 'personnel'
  | 'securite'
  | 'reseaux'
  | 'legaux'
  | 'services'
  | 'medias'
  | 'moyens-paiement'
  | 'banques'
  | 'seuils-depenses'
  | 'courrier-colis';

const TABS: CompanySettingsSection<TabKey>[] = [
  { key: 'plan', label: 'Plan & abonnement', icon: BadgeDollarSign },
  { key: 'vitrine', label: 'Vitrine publique', icon: Globe2 },
  { key: 'personnel', label: 'Personnel', icon: Users },
  { key: 'securite', label: 'Sécurité', icon: Shield },
  { key: 'reseaux', label: 'Réseaux sociaux', icon: Share2 },
  { key: 'legaux', label: 'Mentions & politique', icon: FileText },
  { key: 'services', label: 'Services proposés', icon: Sparkles },
  { key: 'medias', label: 'Médias', icon: Image },
  { key: 'moyens-paiement', label: 'Moyens de paiement', icon: CreditCard },
  { key: 'banques', label: 'Banques', icon: Banknote },
  { key: 'seuils-depenses', label: 'Seuil de dépenses', icon: WalletCards },
  { key: 'courrier-colis', label: 'Courrier & colis', icon: Package },
];

const CompagnieParametresTabsPage: React.FC = () => {
  const [selectedTab, setSelectedTab] = useState<TabKey>('vitrine');

  const { user, company } = useAuth();
  const { companyId: companyIdFromUrl } = useParams();

  // 🔥 IMPORTANT : priorité URL (mode inspection)
  const companyId = companyIdFromUrl ?? user?.companyId ?? "";

  const [companyInfo, setCompanyInfo] = useState<Company | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const theme = useCompanyTheme(companyInfo || company || undefined);

  /* =========================
     Chargement compagnie
  ========================= */
  useEffect(() => {
    if (!companyId) {
      setCompanyInfo(null);
      setLoading(false);
      return;
    }

    const fetchCompany = async () => {
      try {
        const ref = doc(db, 'companies', companyId);
        const snap = await getDoc(ref);

        if (snap.exists()) {
          setCompanyInfo({
            id: snap.id,
            ...(snap.data() as any),
          });
        } else {
          setCompanyInfo(null);
        }
      } catch (e) {
        console.error('Erreur chargement compagnie:', e);
        setCompanyInfo(null);
      } finally {
        setLoading(false);
      }
    };

    fetchCompany();
  }, [companyId]);

  /* =========================
     Rendu onglet actif
  ========================= */
  const renderTab = () => {
    switch (selectedTab) {
      case 'plan':
        return <ParametresPlan companyId={companyId} />;

      case 'vitrine':
        return <ParametresVitrine companyId={companyId} />;

      case 'services':
        return <ParametresServices companyId={companyId} />;

      case 'personnel':
        return <ParametresPersonnel companyId={companyId} />;

      case 'securite':
        return <ParametresSecurite companyId={companyId} />;

      case 'reseaux':
        return <ParametresReseauxPage companyId={companyId} />;

      case 'legaux':
        return <ParametresLegauxPage companyId={companyId} />;

      case 'medias':
        return <BibliothequeImagesPage />;

      case 'moyens-paiement':
        return <CompanyPaymentSettingsPage companyId={companyId} />;

      case 'banques':
        return <ParametresBanques companyId={companyId} />;

      case 'seuils-depenses':
        return <FinancialSettingsPage />;

      case 'courrier-colis':
        return <ParametresCourierColis companyId={companyId} />;

      default:
        return null;
    }
  };

  return (
    <StandardLayoutWrapper>
      <PageHeader
        title="Configuration"
        subtitle="Réglages structurels de la compagnie : organisation, vitrine, sécurité, paiements et conformité."
      />
      <CompanySettingsLayout<TabKey>
        sections={TABS}
        activeSection={selectedTab}
        onSectionChange={setSelectedTab}
        accentColor={theme.colors.primary}
      >
        {loading ? (
          <div className="rounded-xl border bg-white p-8 text-center text-gray-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
            Chargement…
          </div>
        ) : (
          renderTab()
        )}
      </CompanySettingsLayout>
    </StandardLayoutWrapper>
  );
};

export default CompagnieParametresTabsPage;
