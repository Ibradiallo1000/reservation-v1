// src/pages/RouteResolver.tsx
import { useLocation } from "react-router-dom";
import { useEffect, useMemo, useState, lazy, Suspense } from "react";
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
  onSnapshot,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";

import PageNotFound from "@/shared/ui/PageNotFound";
import ErrorBoundary from "@/shared/core/ErrorBoundary";
import MobileErrorScreen from "@/shared/ui/MobileErrorScreen";
import type { Company } from "@/types/companyTypes";
import  PageLoader  from "@/shared/ui/PageLoader";
import { CurrencyProvider } from "@/shared/currency/CurrencyContext";

/* ---------- Lazy pages ---------- */
const PublicCompanyPage = lazy(() => import("../pages/PublicCompanyPage"));
const ResultatsAgencePage = lazy(() => import("../pages/ResultatsAgencePage"));
const ReservationClientPage = lazy(() => import("../pages/ReservationClientPage"));
const ClientMesReservationsPage = lazy(() => import("../pages/ClientMesReservationsPage"));
const MentionsPage = lazy(() => import("../pages/MentionsPage"));
const ConfidentialitePage = lazy(() => import("../pages/ConfidentialitePage"));
const ReceiptEnLignePage = lazy(() => import("../pages/ReceiptEnLignePage"));
const UploadPreuvePage = lazy(() => import("../pages/UploadPreuvePage"));
const ReservationDetailsPage = lazy(() => import("../pages/ReservationDetailsPage"));

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

/** cache mémoire par session (optimisation non bloquante) */
const memoryCache = new Map<string, Company>();

/* ---------------------------------------------------------------------------------- */

export default function RouteResolver() {
  const { pathname } = useLocation();
  const parts = useMemo(() => pathname.split("/").filter(Boolean), [pathname]);

  /** Dans AppRoutes, RouteResolver ne monte que sur `/:slug/*`. */
  const slug = parts[0] ?? null;
  const subPath = parts[1] ?? null;

  const [company, setCompany] = useState<Company | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);
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

  // 1) Résolution du slug -> id de compagnie (avec cache) puis abonnement live
  useEffect(() => {
    let alive = true;
    let unsubscribe: (() => void) | null = null;

    async function resolveAndSubscribe() {
      setLoading(true);
      setError(null);
      setNotFound(false);
      setCompany(null);
      setCompanyId(null);

      // garde-fous
      if (!slug || RESERVED.has(slug.toLowerCase())) {
        if (!alive) return;
        setNotFound(true);
        setLoading(false);
        return;
      }

      // Essai cache mémoire
      const cached = memoryCache.get(slug);
      if (cached) {
        if (!alive) return;
        setCompany(cached);
        setCompanyId(cached.id);
        setLoading(false);
      }

      // Essai sessionStorage
      if (!cached) {
        try {
          const raw = sessionStorage.getItem(`company-${slug}`);
          if (raw) {
            const parsed = JSON.parse(raw) as Company;
            memoryCache.set(slug, parsed);
            if (!alive) return;
            setCompany(parsed);
            setCompanyId(parsed.id);
            setLoading(false);
          }
        } catch {
          /* ignore */
        }
      }

      // Firestore : d’abord par slug, sinon par ID = slug
      try {
        let id: string | null = null;
        if (!cached && !companyId) {
          const bySlugQ = query(collection(db, "companies"), where("slug", "==", slug));
          const bySlugSnap = await getDocs(bySlugQ);
          if (!bySlugSnap.empty) {
            id = bySlugSnap.docs[0].id;
          } else {
            const byIdSnap = await getDoc(doc(db, "companies", slug));
            if (byIdSnap.exists()) id = byIdSnap.id;
          }
        } else {
          id = (cached || company)?.id || companyId;
        }

        if (!id) {
          if (!alive) return;
          setNotFound(true);
          setLoading(false);
          return;
        }

        // Abonnement live → reflète instantanément tout changement (pas besoin de refresh)
        unsubscribe = onSnapshot(
          doc(db, "companies", id),
          (snap) => {
            if (!alive) return;
            if (!snap.exists()) {
              setNotFound(true);
              setCompany(null);
              setCompanyId(null);
              return;
            }
            const normalized = validateCompany(id!, slug!, snap.data());
            setCompanyId(id!);
            setCompany(normalized);
            memoryCache.set(slug!, normalized);
            try {
              sessionStorage.setItem(`company-${slug}`, JSON.stringify(normalized));
            } catch { /* quota / private */ }
            setLoading(false);
          },
          (err) => {
            if (!alive) return;
            if (import.meta.env.DEV) console.debug("RouteResolver onSnapshot error:", err);
            setError(err instanceof Error ? err : new Error("Erreur chargement compagnie"));
            setNotFound(true);
            setLoading(false);
          }
        );
      } catch (e) {
        if (!alive) return;
        if (import.meta.env.DEV) console.debug("RouteResolver Firestore error:", e);
        setError(e instanceof Error ? e : new Error("Erreur chargement compagnie"));
        setNotFound(true);
        setLoading(false);
      }
    }

    resolveAndSubscribe();
    return () => {
      alive = false;
      if (unsubscribe) unsubscribe();
    };
  }, [slug]);

  /* ---------- states ---------- */
  if (loading) return <PageLoader fullScreen />;
  if (error) return <MobileErrorScreen error={error} />;
  if (notFound || !company) return <PageNotFound />;

  // 2) GARDES FONCTIONNELLES par plan
  // Si la page publique est désactivée (ex: plan Start), on bloque toute la vitrine
  if (company.publicPageEnabled === false) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6">
        <h1 className="text-2xl font-bold text-red-600 mb-4">Site désactivé</h1>
        <p className="text-gray-700 text-center max-w-xl">
          Cette compagnie n’a pas de page publique active avec son plan actuel.
          Veuillez réserver directement au guichet.
        </p>
      </div>
    );
  }

  // Si la réservation en ligne est désactivée, on bloque les écrans de booking
  const blocksOnline = !company.onlineBookingEnabled;
  const isOnlineRoute = subPath === "booking" || subPath === "receipt" || subPath === "confirmation" || subPath === "upload-preuve" || subPath === "reservation" || subPath === "details";
  if (blocksOnline && isOnlineRoute) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6">
        <h1 className="text-2xl font-bold text-orange-600 mb-4">Réservation en ligne indisponible</h1>
        <p className="text-gray-700 text-center max-w-xl">
          La réservation en ligne n’est pas incluse dans le plan actuel de cette compagnie.
          Vous pouvez vous rendre au guichet pour effectuer votre réservation.
        </p>
      </div>
    );
  }

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
    <CurrencyProvider currency={company?.devise}>
      <ErrorBoundary fallback={<MobileErrorScreen />}>
        <Suspense fallback={<PageLoader fullScreen />}>{content}</Suspense>
      </ErrorBoundary>
    </CurrencyProvider>
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
