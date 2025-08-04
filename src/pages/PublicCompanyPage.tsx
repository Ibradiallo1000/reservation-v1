import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useTranslation } from 'react-i18next';
import i18n from '@/i18n';
import { motion, AnimatePresence } from 'framer-motion';

import VilleSuggestionBar from '../components/public/VilleSuggestionBar';
import LanguageSuggestionPopup from '../components/public/LanguageSuggestionPopup';
import HeroSection from '../components/public/HeroSection';
import CompanyImageSlider from '../components/public/CompanyImageSlider';
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

  const [company, setCompany] = useState<Company | undefined>(propCompany);
  const { colors, classes, config } = useCompanyTheme(company);

  const [agences, setAgences] = useState<Agence[]>([]);
  const [suggestedTrips, setSuggestedTrips] = useState<TripSuggestion[]>([]);
  const [showAgences, setShowAgences] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [loading, setLoading] = useState(!company);
  const [error, setError] = useState<string | null>(null);
  const [openVilles, setOpenVilles] = useState<Record<string, boolean>>({});
  const [showLangPopup, setShowLangPopup] = useState(false);

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

  useEffect(() => {
    const timer = setTimeout(() => setShowLangPopup(true), 4000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const fetchSuggestions = async () => {
      if (!company?.id) return;
      try {
        const agencesSnap = await getDocs(collection(db, 'companies', company.id, 'agences'));
        const agences = agencesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        const uniqueMap = new Map<string, TripSuggestion>();

        for (const agence of agences) {
          const weeklyTripsSnap = await getDocs(
            collection(db, 'companies', company.id, 'agences', agence.id, 'weeklyTrips')
          );

          for (const doc of weeklyTripsSnap.docs) {
            const trip = doc.data();
            const departure = trip.depart || trip.departure;
            const arrival = trip.arrivee || trip.arrival;
            const price = trip.price ?? trip.prix ?? 0;

            if (!departure || !arrival) continue;

            const key = `${departure}__${arrival}`;
            if (!uniqueMap.has(key)) {
              uniqueMap.set(key, {
                departure,
                arrival,
                price,
                frequency: trip.days?.length > 0 ? `${trip.days.length} jours / semaine` : 'Départs réguliers',
                imageUrl: undefined
              });
            }
          }
        }

        const top = Array.from(uniqueMap.values()).slice(0, 6);
        setSuggestedTrips(top);
      } catch (error) {
        console.error('Erreur chargement suggestions :', error);
      }
    };

    fetchSuggestions();
  }, [company]);

  useEffect(() => {
    const fetchAgences = async () => {
      if (!company?.id) return;

      try {
        setLoading(true);
        const agQ = collection(db, 'companies', company.id, 'agences');
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
            navigate(`/${slug}/booking?departure=${encodeURIComponent(departure)}&arrival=${encodeURIComponent(arrival)}`);
          }}
          isMobile={isMobile}
        />

        <VilleSuggestionBar
          suggestions={suggestedTrips}
          company={company}
          onSelect={(departure: string, arrival: string) => {
            navigate(`/${slug}/booking?departure=${encodeURIComponent(departure)}&arrival=${encodeURIComponent(arrival)}`);
          }}
        />

        <CompanyImageSlider
          images={company.imagesSlider || []}
          primaryColor={colors.primary}
       />

        <AvisListePublic
          companyId={company.id}
          primaryColor={colors.primary}
          isMobile={isMobile}
        />

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

        {showLangPopup && (
          <LanguageSuggestionPopup
            onSelectLanguage={(lang: string | undefined) => {
              i18n.changeLanguage(lang);
              setShowLangPopup(false);
            }}
            delayMs={8000}
          />
        )}
      </main>

      <Footer company={company} isMobile={isMobile} />
    </div>
  );
};

export default PublicCompanyPage;
