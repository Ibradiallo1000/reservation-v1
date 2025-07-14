import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';

import HeroSection from '../components/public/HeroSection';
import SuggestionsSlider from '../components/public/SuggestionsSlider';
import ServicesCarousel from '../components/public/ServicesCarousel';
import Footer from '../components/public/Footer';
import AgencyList from '../components/public/AgencyList';
import AvisListePublic from '../components/public/AvisListePublic';
import Header from '@/components/public/Header';

import useCompanyTheme from '../hooks/useCompanyTheme';
import { Company, Agence, TripSuggestion } from '@/types/companyTypes';

import LoadingScreen from '@/components/ui/LoadingScreen';
import ErrorScreen from '@/components/ui/ErrorScreen';
import NotFoundScreen from '@/components/ui/NotFoundScreen';

interface PublicCompanyPageProps {
  company?: Company;
  isMobile?: boolean;
}

const PublicCompanyPage: React.FC<PublicCompanyPageProps> = ({
  company: propCompany,
  isMobile = false,
}) => {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const company = propCompany;
  const { colors, classes, config } = useCompanyTheme(company);

  const [agences, setAgences] = useState<Agence[]>([]);
  const [suggestedTrips, setSuggestedTrips] = useState<TripSuggestion[]>([]);
  const [showAgences, setShowAgences] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [loading, setLoading] = useState(!company);
  const [error, setError] = useState<string | null>(null);
  const [openVilles, setOpenVilles] = useState<Record<string, boolean>>({});

  const toggleVille = (ville: string) => {
    setOpenVilles((prev) => ({ ...prev, [ville]: !prev[ville] }));
  };

  const groupedByVille = useMemo(
    () =>
      agences.reduce((acc: Record<string, Agence[]>, agence) => {
        if (!acc[agence.ville]) acc[agence.ville] = [];
        acc[agence.ville].push(agence);
        return acc;
      }, {}),
    [agences]
  );

  // 🔁 Charger uniquement les agences si non passées en props
  useEffect(() => {
    const fetchAgences = async () => {
      if (!company?.id) return;

      try {
        setLoading(true);
        const agQ = query(collection(db, 'agences'), where('companyId', '==', company.id));
        const agSnap = await getDocs(agQ);
        setAgences(agSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Agence)));
      } catch (err) {
        console.error('Erreur chargement agences', err);
        setError(t('loadingError'));
      } finally {
        setLoading(false);
      }
    };

    if (company) {
      fetchAgences();
    }
  }, [company, t]);

  if (loading) {
    return (
      <LoadingScreen
        message={t('loading')}
        colors={{
          primary: colors.primary,
          text: colors.text,
          background: colors.background,
        }}
      />
    );
  }

  if (error) {
    return (
      <ErrorScreen
        error={error}
        colors={colors}
        classes={classes}
        t={t}
        navigate={navigate}
        slug={slug}
      />
    );
  }

  if (!company || !slug) {
    return <NotFoundScreen primaryColor={colors.primary} />;
  }

  return (
    <div
      className={`min-h-screen flex flex-col ${config.typography}`}
      style={{
        backgroundColor: colors.background || '#ffffff',
        color: colors.text,
      }}
    >
      <Header
        company={company}
        colors={colors}
        classes={classes}
        config={config}
        menuOpen={menuOpen}
        setMenuOpen={setMenuOpen}
        setShowAgences={setShowAgences}
        isMobile={isMobile}
        t={t}
        slug={slug}
        navigate={navigate}
      />

      <main className="flex-grow">
        <HeroSection
          company={company}
          onSearch={(departure, arrival) => {
            navigate(
              `/${slug}/resultats?departure=${encodeURIComponent(departure)}&arrival=${encodeURIComponent(arrival)}`
            );
          }}
          isMobile={isMobile}
        />

        <AvisListePublic companyId={company.id} primaryColor={colors.primary} isMobile={isMobile} />

        {suggestedTrips.length > 0 && (
          <SuggestionsSlider suggestedTrips={suggestedTrips} colors={colors} isMobile={isMobile} />
        )}

        <ServicesCarousel colors={colors} isMobile={isMobile} />

        <AnimatePresence>
          {showAgences && (
            <AgencyList
              groupedByVille={groupedByVille}
              openVilles={openVilles}
              toggleVille={toggleVille}
              onClose={() => setShowAgences(false)}
              primaryColor={colors.primary}
              classes={classes}
              t={t}
              isMobile={isMobile}
            />
          )}
        </AnimatePresence>
      </main>

      <Footer company={company} isMobile={isMobile} />
    </div>
  );
};

export default PublicCompanyPage;
