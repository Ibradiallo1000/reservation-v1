// src/pages/PublicCompanyPage.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { collection, getDocs, query, where, limit } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { useTranslation } from "react-i18next";
import { AnimatePresence } from "framer-motion";

import VilleSuggestionBar from "@/components/public/VilleSuggestionBar";
import LanguageSuggestionPopup from "@/components/public/LanguageSuggestionPopup";
import HeroSection from "@/components/public/HeroSection";
import CompanyServices from "@/components/public/CompanyServices";
import WhyChooseSection from "@/components/public/WhyChooseSection";
import Footer from "@/components/public/Footer";
import AgencyList from "@/components/public/AgencyList";
import AvisListePublic from "@/components/public/AvisListePublic";
import Header from "@/components/public/Header";

import useCompanyTheme from "@/shared/hooks/useCompanyTheme";
import { Company, Agence, TripSuggestion, WhyChooseItem } from "@/types/companyTypes";
import NotFoundScreen from "@/components/ui/NotFoundScreen";
import { getCompanyFromCache } from "@/utils/companyCache";

interface PublicCompanyPageProps {
  company?: Company;
  isMobile?: boolean;
}

const PublicCompanyPage: React.FC<PublicCompanyPageProps> = ({
  company: propCompany,
}) => {
  const { slug = "" } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const cached = getCompanyFromCache(slug);
  const [company, setCompany] = useState<Company | undefined>(
    propCompany || cached
  );

  const { colors, config } = useCompanyTheme(company);

  const [agences, setAgences] = useState<Agence[]>([]);
  const [suggestedTrips, setSuggestedTrips] = useState<TripSuggestion[]>([]);
  const [showAgences, setShowAgences] = useState(false);
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

  /* ================= LOAD COMPANY ================= */

  useEffect(() => {
    if (company || !slug) return;

    (async () => {
      try {
        const q = query(
          collection(db, "companies"),
          where("slug", "==", slug),
          limit(1)
        );

        const snap = await getDocs(q);

        if (!snap.empty) {
          setCompany({
            id: snap.docs[0].id,
            ...(snap.docs[0].data() as any),
          });
        } else {
          setError("notFound");
        }
      } catch (e) {
        console.warn("PublicCompanyPage ► fetch company", e);
        setError(t("loadingError"));
      }
    })();
  }, [slug]);

  /* ================= POPUP LANG ================= */

  useEffect(() => {
    const timer = setTimeout(() => setShowLangPopup(true), 4000);
    return () => clearTimeout(timer);
  }, []);

  /* ================= SUGGESTED TRIPS ================= */

  useEffect(() => {
    const fetchSuggestions = async () => {
      if (!company?.id) return;

      try {
        const agencesSnap = await getDocs(
          collection(db, "companies", company.id, "agences")
        );

        const uniqueMap = new Map<string, TripSuggestion>();

        for (const ag of agencesSnap.docs) {
          const weekly = await getDocs(
            collection(
              db,
              "companies",
              company.id,
              "agences",
              ag.id,
              "weeklyTrips"
            )
          );

          for (const d of weekly.docs) {
            const trip: any = d.data();
            const departure = trip.depart || trip.departure;
            const arrival = trip.arrivee || trip.arrival;
            const price = trip.price ?? trip.prix ?? 0;

            if (!departure || !arrival) continue;

            const key = `${departure}_${arrival}`;

            if (!uniqueMap.has(key)) {
              uniqueMap.set(key, {
                departure,
                arrival,
                price,
              });
            }
          }
        }

        setSuggestedTrips(Array.from(uniqueMap.values()).slice(0, 6));
      } catch (e) {
        console.warn("Suggestions error:", e);
      }
    };

    fetchSuggestions();
  }, [company]);

  /* ================= AGENCES ================= */

  useEffect(() => {
    const fetchAgences = async () => {
      if (!company?.id) return;

      const agSnap = await getDocs(
        collection(db, "companies", company.id, "agences")
      );

      setAgences(
        agSnap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        })) as Agence[]
      );
    };

    fetchAgences();
  }, [company]);

  /* ================= SECURITE ================= */

  const allowPublic = !!company?.publicPageEnabled;
  const allowOnline = allowPublic && !!company?.onlineBookingEnabled;

  if (error === "notFound") {
    return <NotFoundScreen primaryColor={colors.primary || "#FF6600"} />;
  }

  if (!company || !allowPublic) {
    return <NotFoundScreen primaryColor={colors.primary || "#FF6600"} />;
  }

  /* ================= WHY CHOOSE FALLBACK ================= */

  const buildDefaultWhyChoose = (comp: Company): WhyChooseItem[] => {
    const items: WhyChooseItem[] = [];

    // Années d'expérience
    if (comp.createdAt?.toDate) {
      const createdYear = comp.createdAt.toDate().getFullYear();
      const currentYear = new Date().getFullYear();
      const diff = currentYear - createdYear;

      if (diff > 0) {
        items.push({
          label: `${diff}+ ans d'expérience`,
          icon: "award",
        });
      }
    }

    // Réservation en ligne
    if (comp.onlineBookingEnabled) {
      items.push({
        label: "Réservation en ligne rapide",
        icon: "clock",
      });
    }

    // Services à bord
    if (comp.services && comp.services.length > 0) {
      items.push({
        label: "Services à bord modernes",
        icon: "bus",
      });
    }

    // Sécurité par défaut
    items.push({
      label: "Voyages sécurisés",
      icon: "shield",
    });

    return items.slice(0, 4);
  };

  const whyChooseItems =
    company?.whyChooseUs?.items && company.whyChooseUs.items.length > 0
      ? company.whyChooseUs.items
      : buildDefaultWhyChoose(company);

  /* ================= RENDER ================= */

  return (
    <div
      className={`min-h-screen flex flex-col ${config.typography}`}
      style={{
        backgroundColor: colors.background || "#ffffff",
        color: colors.text,
      }}
    >
      <Header
        company={company}
        colors={colors}
        slug={slug}
        navigate={navigate}
        t={t}
      />

      <main className="flex-grow">

        {allowOnline && (
          <>
            <HeroSection
              company={company}
              onSearch={(departure, arrival) => {
                navigate(
                  `/${slug}/booking?departure=${encodeURIComponent(
                    departure
                  )}&arrival=${encodeURIComponent(arrival)}`
                );
              }}
            />

            <VilleSuggestionBar
              suggestions={suggestedTrips}
              company={company}
              onSelect={(departure, arrival) => {
                navigate(
                  `/${slug}/booking?departure=${encodeURIComponent(
                    departure
                  )}&arrival=${encodeURIComponent(arrival)}`
                );
              }}
            />
          </>
        )}

        {/* WHY CHOOSE */}
        {whyChooseItems.length > 0 && (
          <WhyChooseSection
            companyName={company.nom}
            items={whyChooseItems}
            primaryColor={colors.primary}
          />
        )}

        {/* SERVICES */}
        {Array.isArray(company.services) &&
          company.services.length > 0 && (
            <CompanyServices
              services={company.services}
              primaryColor={colors.primary}
              secondaryColor={colors.secondary}
            />
          )}

        {/* AVIS CLIENTS */}
        <AvisListePublic
          companyId={company.id}
          primaryColor={colors.primary}
          secondaryColor={colors.secondary}
        />

        <AnimatePresence>
          {showAgences && (
            <AgencyList
              groupedByVille={groupedByVille}
              openVilles={openVilles}
              toggleVille={toggleVille}
              onClose={() => setShowAgences(false)}
              primaryColor={colors.primary}
              t={t}
              classes={undefined}
            />
          )}
        </AnimatePresence>

        {showLangPopup && (
          <LanguageSuggestionPopup
            onSelectLanguage={(lang) => {
              import("@/i18n").then(({ default: i18n }) =>
                i18n.changeLanguage(lang)
              );
              setShowLangPopup(false);
            }}
            delayMs={8000}
          />
        )}

      </main>

      <Footer company={company} />
    </div>
  );
};

export default PublicCompanyPage;
