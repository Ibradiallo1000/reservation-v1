// src/pages/PublicCompanyPage.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  collection, getDocs, query, where, limit,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";

import VilleSuggestionBar from "@/components/public/VilleSuggestionBar";
import LanguageSuggestionPopup from "@/components/public/LanguageSuggestionPopup";
import HeroSection from "@/components/public/HeroSection";
import CompanyImageSlider from "@/components/public/CompanyImageSlider";
import Footer from "@/components/public/Footer";
import AgencyList from "@/components/public/AgencyList";
import AvisListePublic from "@/components/public/AvisListePublic";
import Header from "@/components/public/Header";

import useCompanyTheme from "@/hooks/useCompanyTheme";
import { Company, Agence, TripSuggestion } from "@/types/companyTypes";
import ErrorScreen from "@/components/ui/ErrorScreen";
import NotFoundScreen from "@/components/ui/NotFoundScreen";
import { getCompanyFromCache } from "@/utils/companyCache";

interface PublicCompanyPageProps {
  company?: Company;
  isMobile?: boolean;
}

const PublicCompanyPage: React.FC<PublicCompanyPageProps> = ({
  company: propCompany,
  isMobile = false,
}) => {
  const { slug = "" } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();

  // 1) démarrer avec la compagnie du cache (préchargée depuis la Home)
  const cached = getCompanyFromCache(slug);
  const [company, setCompany] = useState<Company | undefined>(propCompany || cached);

  const { colors, classes, config } = useCompanyTheme(company);
  const [agences, setAgences] = useState<Agence[]>([]);
  const [suggestedTrips, setSuggestedTrips] = useState<TripSuggestion[]>([]);
  const [showAgences, setShowAgences] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
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

  // 2) si on arrive par URL directe (pas de cache), on récupère la compagnie par slug
  useEffect(() => {
    if (company || !slug) return;
    (async () => {
      try {
        const q = query(collection(db, "companies"), where("slug", "==", slug), limit(1));
        const snap = await getDocs(q);
        if (!snap.empty) setCompany({ id: snap.docs[0].id, ...(snap.docs[0].data() as any) });
        else setError("notFound");
      } catch (e) {
        console.warn("PublicCompanyPage ► fetch company by slug", e);
        setError(t("loadingError"));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  // popup langue
  useEffect(() => {
    const timer = setTimeout(() => setShowLangPopup(true), 4000);
    return () => clearTimeout(timer);
  }, []);

  // suggestions (fond, pas d'overlay)
  useEffect(() => {
    const fetchSuggestions = async () => {
      if (!company?.id) return;
      try {
        const agencesSnap = await getDocs(collection(db, "companies", company.id, "agences"));
        const ags = agencesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any[];

        const uniqueMap = new Map<string, TripSuggestion>();
        for (const agence of ags) {
          const weekly = await getDocs(collection(db, "companies", company.id, "agences", agence.id, "weeklyTrips"));
          for (const d of weekly.docs) {
            const trip: any = d.data();
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
                frequency: trip.days?.length > 0 ? `${trip.days.length} jours / semaine` : "Départs réguliers",
                imageUrl: undefined,
              });
            }
          }
        }
        setSuggestedTrips(Array.from(uniqueMap.values()).slice(0, 6));
      } catch (e) {
        console.warn("PublicCompanyPage ► suggestions", e);
      }
    };
    fetchSuggestions();
  }, [company]);

  // agences (fond, pas d'overlay)
  useEffect(() => {
    const fetchAgences = async () => {
      if (!company?.id) return;
      try {
        const agSnap = await getDocs(collection(db, "companies", company.id, "agences"));
        setAgences(agSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Agence)));
      } catch (e) {
        console.warn("PublicCompanyPage ► agences", e);
        setError(t("loadingError"));
      }
    };
    fetchAgences();
  }, [company, t]);

  // --- 🛑 Garde-fous d'affichage en fonction du plan ---
  const allowPublic = !!company?.publicPageEnabled;         // vitrine
  const allowOnline = allowPublic && !!company?.onlineBookingEnabled; // réservation en ligne

  if (error === "notFound") {
    return <NotFoundScreen primaryColor={colors.primary || "#FF6600"} />;
  }
  if (error && error !== "notFound") {
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

  // ⚠️ plus d'écran plein-page "Loading". Si company pas encore là (rare),
  // on rend un squelette très léger, puis on affiche dès que possible.
  if (!company) {
    return <div className="min-h-screen bg-white"><div className="h-14 border-b" /></div>;
  }

  // Si la vitrine n'est pas incluse dans le plan (ex: "Start") -> page désactivée.
  if (!allowPublic) {
    return <NotFoundScreen primaryColor={colors.primary || "#FF6600"} />;
  }

  return (
    <div
      className={`min-h-screen flex flex-col ${config.typography}`}
      style={{ backgroundColor: colors.background || "#ffffff", color: colors.text }}
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
        {/* Recherche + suggestions visibles uniquement si onlineBookingEnabled */}
        {allowOnline && (
          <>
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
          </>
        )}

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
              import("@/i18n").then(({ default: i18n }) => i18n.changeLanguage(lang));
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
