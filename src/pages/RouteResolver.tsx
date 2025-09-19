// src/pages/RouteResolver.tsx
import { useLocation } from "react-router-dom";
import { useEffect, useMemo, useState, lazy, Suspense } from "react";
import { collection, query, where, getDocs, doc, getDoc } from "firebase/firestore";
import { db } from "@/firebaseConfig";

import PageLoader from "@/components/PageLoaderComponent";
import PageNotFound from "@/components/ui/PageNotFound";
import ErrorBoundary from "@/components/ErrorBoundary";
import MobileErrorScreen from "@/components/ui/MobileErrorScreen";
import type { Company } from "@/types/companyTypes";

/* ---------- Lazy pages ---------- */
const PublicCompanyPage = lazy(() => import("./PublicCompanyPage"));
const ResultatsAgencePage = lazy(() => import("./ResultatsAgencePage"));
const ReservationClientPage = lazy(() => import("./ReservationClientPage"));
const ClientMesReservationsPage = lazy(() => import("./ClientMesReservationsPage"));
const MentionsPage = lazy(() => import("./MentionsPage"));
const ConfidentialitePage = lazy(() => import("./ConfidentialitePage"));
const ReceiptEnLignePage = lazy(() => import("./ReceiptEnLignePage"));
const UploadPreuvePage = lazy(() => import("./UploadPreuvePage"));
const ReservationDetailsPage = lazy(() => import("./ReservationDetailsPage"));

/** chemins qui ne doivent jamais être traités comme “slug compagnie” */
const RESERVED = new Set([
  "login",
  "register",
  "admin",
  "agence",
  "villes",
  "reservation",
  "contact",
  "compagnie",
]);

/** cache mémoire par session de navigation */
const memoryCache = new Map<string, Company>();

/* ---------------------------------------------------------------------------------- */

export default function RouteResolver() {
  const { pathname } = useLocation();
  const parts = useMemo(() => pathname.split("/").filter(Boolean), [pathname]);

  /** Dans AppRoutes, RouteResolver ne monte que sur `/:slug/*`.
   *  Du coup le slug est bien la 1re partie du chemin. */
  const slug = parts[0] ?? null;
  const subPath = parts[1] ?? null;

  const [company, setCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  /* Mobile check (stable) */
  const isMobile = useMemo(
    () =>
      typeof window !== "undefined" &&
      (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent
      ) ||
        window.innerWidth <= 768),
    []
  );

  useEffect(() => {
    let alive = true;

    async function load() {
      setLoading(true);
      setError(null);
      setNotFound(false);
      setCompany(null);

      // garde-fous
      if (!slug || RESERVED.has(slug.toLowerCase())) {
        if (!alive) return;
        setNotFound(true);
        setLoading(false);
        return;
      }

      // 1) cache mémoire
      const cached = memoryCache.get(slug);
      if (cached) {
        if (!alive) return;
        setCompany(cached);
        setLoading(false);
        return;
      }

      // 2) sessionStorage
      try {
        const raw = sessionStorage.getItem(`company-${slug}`);
        if (raw) {
          const parsed = JSON.parse(raw) as Company;
          memoryCache.set(slug, parsed);
          if (!alive) return;
          setCompany(parsed);
          setLoading(false);
          return;
        }
      } catch {
        // ignore
      }

      // 3) Firestore : d’abord par slug, sinon par ID = slug
      try {
        let data: Company | null = null;

        const bySlugQ = query(collection(db, "companies"), where("slug", "==", slug));
        const bySlugSnap = await getDocs(bySlugQ);
        if (!bySlugSnap.empty) {
          const d = bySlugSnap.docs[0];
          data = validateCompany(d.id, slug, d.data());
        } else {
          const byIdSnap = await getDoc(doc(db, "companies", slug));
          if (byIdSnap.exists()) {
            data = validateCompany(byIdSnap.id, slug, byIdSnap.data());
          }
        }

        if (!data) {
          if (!alive) return;
          setNotFound(true);
          setLoading(false);
          return;
        }

        memoryCache.set(slug, data);
        try {
          sessionStorage.setItem(`company-${slug}`, JSON.stringify(data));
        } catch {
          /* quota ou privacy mode – ignorer */
        }

        if (!alive) return;
        setCompany(data);
      } catch (e) {
        if (!alive) return;
        // log discret en dev uniquement
        if (import.meta.env.DEV) console.debug("RouteResolver Firestore error:", e);
        setError(e instanceof Error ? e : new Error("Erreur chargement compagnie"));
        setNotFound(true);
      } finally {
        if (alive) setLoading(false);
      }
    }

    load();
    return () => {
      alive = false;
    };
  }, [slug]);

  /* ---------- states ---------- */
  if (loading) return <PageLoader fullScreen />;
  if (error) return <MobileErrorScreen error={error} />;
  if (notFound || !company) return <PageNotFound />;

  const common = { company };
  let content: JSX.Element;

  switch (subPath) {
    case "resultats":
      content = <ResultatsAgencePage {...common} />;
      break;
    case "booking":
      content = <ReservationClientPage />;
      break;
    case "mes-reservations":
      content = <ClientMesReservationsPage />;
      break;
    case "mentions":
      content = <MentionsPage />;
      break;
    case "confidentialite":
      content = <ConfidentialitePage />;
      break;
    case "receipt":
    case "confirmation":
      content = <ReceiptEnLignePage />;
      break;
    case "upload-preuve":
      content = <UploadPreuvePage />;
      break;
    case "details":
    case "reservation":
      content = <ReservationDetailsPage />;
      break;
    case null:
      content = <PublicCompanyPage {...common} isMobile={isMobile} />;
      break;
    default:
      content = <PageNotFound />;
  }

  return (
    <ErrorBoundary fallback={<MobileErrorScreen />}>
      <Suspense fallback={<PageLoader fullScreen />}>{content}</Suspense>
    </ErrorBoundary>
  );
}

/* ---------- validation légère, évite les undefined ---------- */
function validateCompany(id: string, slug: string, raw: any): Company {
  if (!raw || typeof raw !== "object") throw new Error("Données compagnie invalides");
  return {
    id,
    slug,
    nom: raw.nom ?? "Compagnie",
    themeStyle: raw.themeStyle ?? "clair",
    imagesSlider: Array.isArray(raw.imagesSlider) ? raw.imagesSlider : [],
    footerConfig: {
      customLinks: Array.isArray(raw.footerConfig?.customLinks)
        ? raw.footerConfig.customLinks.map((l: any) => ({
            label: l?.label ?? "Lien",
            url: l?.url ?? "#",
            external: !!l?.external,
          }))
        : [],
    },
    ...raw,
  };
}
