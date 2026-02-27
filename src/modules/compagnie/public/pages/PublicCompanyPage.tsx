// src/pages/PublicCompanyPage.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { collection, getDocs, query, where, limit } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { useTranslation } from "react-i18next";
import { AnimatePresence } from "framer-motion";

import VilleSuggestionBar from "@/modules/compagnie/public/components/VilleSuggestionBar";
import HeroCompanySection from "@/modules/compagnie/public/components/HeroCompanySection";
import CompanyServices from "@/modules/compagnie/public/components/CompanyServices";
import WhyChooseSection from "@/modules/compagnie/public/components/WhyChooseSection";
import Footer from "@/modules/compagnie/public/components/Footer";
import AgencyList from "@/modules/compagnie/public/components/AgencyList";
import AvisListePublic from "@/modules/compagnie/public/components/AvisListePublic";
import Header from "@/modules/compagnie/public/layout/CompanyPublicHeader";

import useCompanyTheme from "@/shared/hooks/useCompanyTheme";
import { useOnlineStatus } from "@/shared/hooks/useOnlineStatus";
import { Company, Agence, TripSuggestion, WhyChooseItem } from "@/types/companyTypes";
import NotFoundScreen from "@/shared/ui/NotFoundScreen";
import { getCompanyFromCache } from "@/utils/companyCache";

interface PublicCompanyPageProps {
  company?: Company;
  isMobile?: boolean;
}

const SUGGESTIONS_CACHE_PREFIX = "public-company-suggestions:";
const suggestionsMemoryCache = new Map<string, TripSuggestion[]>();

function readSuggestionsCache(companyId: string): TripSuggestion[] | null {
  const memoryValue = suggestionsMemoryCache.get(companyId);
  if (memoryValue && memoryValue.length > 0) return memoryValue;

  try {
    const raw = sessionStorage.getItem(`${SUGGESTIONS_CACHE_PREFIX}${companyId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed.slice(0, 6) as TripSuggestion[];
  } catch {
    return null;
  }
}

function writeSuggestionsCache(companyId: string, trips: TripSuggestion[]) {
  const safeTrips = trips.slice(0, 6);
  suggestionsMemoryCache.set(companyId, safeTrips);
  try {
    sessionStorage.setItem(
      `${SUGGESTIONS_CACHE_PREFIX}${companyId}`,
      JSON.stringify(safeTrips)
    );
  } catch {
    // ignore storage quota/private mode issues
  }
}

const PublicCompanyPage: React.FC<PublicCompanyPageProps> = ({
  company: propCompany,
}) => {
  const { slug = "" } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const isOnline = useOnlineStatus();

  const cached = getCompanyFromCache(slug);
  const [company, setCompany] = useState<Company | undefined>(
    propCompany || cached
  );

  const { colors, config } = useCompanyTheme(company);

  const [agences, setAgences] = useState<Agence[]>([]);
  const [suggestedTrips, setSuggestedTrips] = useState<TripSuggestion[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [showAgences, setShowAgences] = useState(false);
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

  /* ================= AGENCES + SUGGESTED TRIPS ================= */

  useEffect(() => {
    if (!company?.id) return;
    let cancelled = false;
    const companyId = company.id;
    const cachedSuggestions = readSuggestionsCache(companyId);
    if (cachedSuggestions && cachedSuggestions.length > 0) {
      setSuggestedTrips(cachedSuggestions);
    }

    const fetchAgencesAndSuggestions = async () => {
      setSuggestionsLoading(!(cachedSuggestions && cachedSuggestions.length > 0));
      try {
        const agencesSnap = await getDocs(
          collection(db, "companies", companyId, "agences")
        );
        if (cancelled) return;

        const agencesData = agencesSnap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        })) as Agence[];
        setAgences(agencesData);

        if (agencesSnap.empty) {
          setSuggestedTrips([]);
          return;
        }

        const weeklySnapshots = await Promise.all(
          agencesSnap.docs.map((ag) =>
            getDocs(
              collection(
                db,
                "companies",
                companyId,
                "agences",
                ag.id,
                "weeklyTrips"
              )
            )
          )
        );
        if (cancelled) return;

        const uniqueMap = new Map<string, TripSuggestion>();
        for (const weekly of weeklySnapshots) {
          for (const d of weekly.docs) {
            const trip: any = d.data();
            const departure = trip.depart || trip.departure;
            const arrival = trip.arrivee || trip.arrival;
            const price = trip.price ?? trip.prix ?? 0;

            if (!departure || !arrival) continue;

            const key = `${departure}_${arrival}`;
            if (!uniqueMap.has(key)) {
              uniqueMap.set(key, { departure, arrival, price });
              if (uniqueMap.size >= 6) break;
            }
          }
          if (uniqueMap.size >= 6) break;
        }

        const trips = Array.from(uniqueMap.values());
        setSuggestedTrips(trips);
        writeSuggestionsCache(companyId, trips);
      } catch (e) {
        console.warn("Suggestions/agences error:", e);
        if (!cancelled) {
          if (!(cachedSuggestions && cachedSuggestions.length > 0)) {
            setSuggestedTrips([]);
          }
          setAgences([]);
        }
      } finally {
        if (!cancelled) setSuggestionsLoading(false);
      }
    };

    fetchAgencesAndSuggestions();
    return () => {
      cancelled = true;
    };
  }, [company?.id]);

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
          label: t("yearsExperience", { count: diff }),
          icon: "award",
        });
      }
    }

    // Réservation en ligne
    if (comp.onlineBookingEnabled) {
      items.push({
        label: t("fastOnlineBooking"),
        icon: "clock",
      });
    }

    // Services à bord
    if (comp.services && comp.services.length > 0) {
      items.push({
        label: t("modernOnBoardServices"),
        icon: "bus",
      });
    }

    // Sécurité par défaut
    items.push({
      label: t("safeTrips"),
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

      {/* Hero full-bleed passe derrière le header (72px). Sans Hero, on compense le header. */}
      <div className={`${allowOnline ? "pt-0" : "pt-[72px]"} flex flex-col flex-grow min-h-0`}>
      <main className="flex-grow">

        {allowOnline && (
          <>
            <HeroCompanySection
              companyName={company?.nom ?? ""}
              primaryColor={colors.primary}
              secondaryColor={colors.secondary}
              heroImageUrl={company?.banniereUrl ?? company?.imagesSlider?.[0]}
              onSearch={(departure, arrival) => {
                navigate(
                  `/${slug}/booking?departure=${encodeURIComponent(departure)}&arrival=${encodeURIComponent(arrival)}`
                );
              }}
            />

            <VilleSuggestionBar
              suggestions={suggestedTrips}
              loading={suggestionsLoading}
              offline={!isOnline}
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

      </main>

      <Footer company={company} />
      </div>
    </div>
  );
};

export default PublicCompanyPage;
