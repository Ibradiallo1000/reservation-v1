import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';

// Components
import HeroSection from '../components/public/HeroSection';
import SuggestionsSlider from '../components/public/SuggestionsSlider';
import ServicesCarousel from '../components/public/ServicesCarousel';
import Footer from '../components/public/Footer';
import AgencyList from '../components/public/AgencyList';

// Hooks
import useCompanyTheme from '../hooks/useCompanyTheme';

// Types
import { Company, Agence, TripSuggestion } from '../types/companyTypes';
import LoadingScreen from '@/components/ui/LoadingScreen';
import ErrorScreen from '@/components/ui/ErrorScreen';
import NotFoundScreen from '@/components/ui/NotFoundScreen';
import Header from '@/components/public/Header';

const PublicCompanyPage = () => {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [company, setCompany] = useState<Company | null>(null);
  const [agences, setAgences] = useState<Agence[]>([]);
  const [suggestedTrips, setSuggestedTrips] = useState<TripSuggestion[]>([]);
  const [showAgences, setShowAgences] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [openVilles, setOpenVilles] = useState<Record<string, boolean>>({});

  const toggleVille = (ville: string) => {
    setOpenVilles((prev) => ({ ...prev, [ville]: !prev[ville] }));
  };

  const groupedByVille = useMemo(() =>
    agences.reduce((acc: Record<string, Agence[]>, agence) => {
      if (!acc[agence.ville]) acc[agence.ville] = [];
      acc[agence.ville].push(agence);
      return acc;
    }, {}),
    [agences]
  );

  const { colors, classes, config } = useCompanyTheme(company);

  const fetchData = useCallback(async () => {
    if (!slug || slug.trim() === '') {
      setError(t('companyNotFound'));
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const q = query(collection(db, 'companies'), where('slug', '==', slug));
      const snap = await getDocs(q);

      if (snap.empty) {
        setError(t('companyNotFound'));
        return;
      }

      const doc = snap.docs[0];
      const companyData = { id: doc.id, ...doc.data() } as Company;
      setCompany(companyData);

      const agQ = query(collection(db, 'agences'), where('companyId', '==', doc.id));
      const agSnap = await getDocs(agQ);
      setAgences(agSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Agence)));
    } catch (err) {
      console.error('Erreur de chargement:', err);
      setError(t('loadingError'));
    } finally {
      setLoading(false);
    }
  }, [slug, t]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <LoadingScreen
        message={t('loading')}
        colors={{
          primary: colors.primary,
          text: colors.text,
          background: colors.background
        }}
      />
    );
  }

  if (error) {
    return (
      <ErrorScreen
        error={error}
        navigate={navigate} // ✅ IMPORTANT : maintenant tu passes navigate
        colors={colors}
        classes={classes}
        t={t}
      />
    );
  }

  if (!company || !slug) {
    return <NotFoundScreen primaryColor={colors.primary} />;
  }

  return (
    <div
      className={`min-h-screen flex flex-col ${config.typography}`}
      style={{ background: colors.background, color: colors.text }}
    >
      <Header
        company={company}
        colors={colors}
        classes={classes}
        config={config}
        menuOpen={menuOpen}
        setMenuOpen={setMenuOpen}
        setShowAgences={setShowAgences}
        slug={slug}
        t={t}
        navigate={navigate}
      />

      <HeroSection
        company={company}
        onSearch={(departure, arrival) => {
          navigate(
            `/compagnie/${slug}/resultats?departure=${encodeURIComponent(departure.trim())}&arrival=${encodeURIComponent(arrival.trim())}`
          );
        }}
      />

      <SuggestionsSlider suggestedTrips={suggestedTrips} colors={colors} />
      <ServicesCarousel colors={colors} />

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
          />
        )}
      </AnimatePresence>

      <Footer company={company} />
    </div>
  );
};

export default PublicCompanyPage;
