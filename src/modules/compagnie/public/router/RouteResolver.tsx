// src/pages/RouteResolver.tsx
import { useLocation, useNavigate } from "react-router-dom";
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
import { CurrencyProvider } from "@/shared/currency/CurrencyContext";

/* ---------- Lazy pages ---------- */
const PublicCompanyPage = lazy(() => import("../pages/PublicCompanyPage"));
const ResultatsAgencePage = lazy(() => import("../pages/ResultatsAgencePage"));
const ReservationClientPage = lazy(() => import("../pages/ReservationClientPage"));
const ClientMesReservationsPage = lazy(() => import("../pages/ClientMesReservationsPage"));
const ClientMesBilletsPage = lazy(() => import("../pages/ClientMesBilletsPage"));
const MentionsPage = lazy(() => import("../pages/MentionsPage"));
const ConfidentialitePage = lazy(() => import("../pages/ConfidentialitePage"));
const ReceiptEnLignePage = lazy(() => import("../pages/ReceiptEnLignePage"));
const UploadPreuvePage = lazy(() => import("../pages/UploadPreuvePage"));
const PaymentMethodPage = lazy(() => import("../pages/PaymentMethodPage"));
const ReservationDetailsPage = lazy(() => import("../pages/ReservationDetailsPage"));
const FindReservationPage = lazy(() => import("../pages/FindReservationPage"));
const AidePage = lazy(() => import("../pages/AidePage"));
const CompanyAboutPage = lazy(() => import("../pages/CompanyAboutPage"));

import PublicBottomNav from "../components/PublicBottomNav";

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

const PENDING_RESERVATION_KEY = "pendingReservation";

/** Lit et parse pendingReservation depuis localStorage (sans effet de bord). */
function readPendingReservation(): { slug: string; id: string; companyId?: string; agencyId?: string; status?: string } | null {
  try {
    const raw = localStorage.getItem(PENDING_RESERVATION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || typeof (parsed as any).id !== "string" || typeof (parsed as any).slug !== "string") return null;
    return parsed as { slug: string; id: string; companyId?: string; agencyId?: string; status?: string };
  } catch {
    return null;
  }
}

/* ---------------------------------------------------------------------------------- */

export default function RouteResolver() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const parts = useMemo(() => pathname.split("/").filter(Boolean), [pathname]);

  /** Dans AppRoutes, RouteResolver ne monte que sur `/:slug/*`. */
  const slug = parts[0] ?? null;
  const subPath = parts[1] ?? null;
  /** Third segment (e.g. reservationId for /:slug/upload-preuve/:reservationId) */
  const thirdSegment = parts[2] ?? null;

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

  // Recovery: when on company homepage, if pendingReservation exists and is en_attente_paiement, show banner or redirect
  const [recoveryChecked, setRecoveryChecked] = useState(false);
  const [pendingRecovery, setPendingRecovery] = useState<{ reservationId: string } | null>(null);
  useEffect(() => {
    if (recoveryChecked || loading || notFound || error || subPath !== null || !slug || !company) return;
    const pending = readPendingReservation();
    if (!pending || !pending.id || !pending.slug) {
      setRecoveryChecked(true);
      return;
    }
    if (pending.slug !== slug) {
      setRecoveryChecked(true);
      return;
    }
    let alive = true;
    (async () => {
      try {
        const companyId = pending.companyId;
        const agencyId = pending.agencyId;
        if (!companyId || !agencyId) {
          setRecoveryChecked(true);
          return;
        }
        const resRef = doc(db, "companies", companyId, "agences", agencyId, "reservations", pending.id);
        const snap = await getDoc(resRef);
        if (!alive) return;
        if (!snap.exists()) {
          try { localStorage.removeItem(PENDING_RESERVATION_KEY); } catch { /* ignore */ }
          setRecoveryChecked(true);
          return;
        }
        const data = snap.data() as { statut?: string };
        const status = (data?.statut ?? "").toLowerCase();
        if (status !== "en_attente_paiement") {
          try { localStorage.removeItem(PENDING_RESERVATION_KEY); } catch { /* ignore */ }
          setRecoveryChecked(true);
          return;
        }
        setPendingRecovery({ reservationId: pending.id });
        setRecoveryChecked(true);
      } catch {
        if (alive) {
          try { localStorage.removeItem(PENDING_RESERVATION_KEY); } catch { /* ignore */ }
          setRecoveryChecked(true);
        }
      } finally {
        if (alive) setRecoveryChecked(true);
      }
    })();
    return () => { alive = false; };
  }, [loading, notFound, error, subPath, slug, company, navigate]);

  /* ---------- states ---------- */
  if (loading) return null;
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
  const isOnlineRoute = subPath === "booking" || subPath === "receipt" || subPath === "confirmation" || subPath === "upload-preuve" || subPath === "payment" || subPath === "reservation" || subPath === "details" || subPath === "retrouver-reservation";
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
    case "payment":
      content = <PaymentMethodPage />;
      break;
    case "mes-reservations":
      content = <ClientMesReservationsPage />;
      break;
    case "retrouver-reservation":
      content = <FindReservationPage company={company} />;
      break;
    case "mes-billets":
      content = <ClientMesBilletsPage />;
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
      content = <UploadPreuvePage reservationIdFromPath={thirdSegment ?? undefined} />;
      break;
    case "details":
    case "reservation":
      content = <ReservationDetailsPage />;
      break;
    case "aide":
      content = <AidePage company={company} />;
      break;
    case "a-propos":
      content = <CompanyAboutPage company={company} />;
      break;
    case null:
      content = (
        <>
          {pendingRecovery && slug && (
            <div
              className="mx-auto max-w-md px-4 pt-4 pb-2"
              role="alert"
              aria-live="polite"
            >
              <div
                className="rounded-xl border p-4 shadow-sm"
                style={{
                  backgroundColor: `${company?.couleurPrimaire ?? "#3b82f6"}0D`,
                  borderColor: `${company?.couleurPrimaire ?? "#3b82f6"}40`,
                }}
              >
                <p className="text-sm font-medium text-gray-800">
                  Vous avez une réservation en attente.
                </p>
                <button
                  type="button"
                  onClick={() => navigate(`/${slug}/upload-preuve/${pendingRecovery.reservationId}`, { replace: true })}
                  className="mt-3 w-full rounded-lg py-2.5 text-sm font-semibold text-white shadow-sm transition hover:opacity-95"
                  style={{
                    backgroundColor: company?.couleurPrimaire ?? "#3b82f6",
                  }}
                >
                  Continuer ma réservation
                </button>
              </div>
            </div>
          )}
          <PublicCompanyPage {...common} isMobile={isMobile} />
        </>
      );
      break;
    default:
      content = <PageNotFound />;
  }

  return (
    <CurrencyProvider currency={company?.devise}>
      <ErrorBoundary fallback={<MobileErrorScreen />}>
        <Suspense fallback={null}>
          <div className="min-h-screen pb-20 md:pb-0">
            {content}
          </div>
          <PublicBottomNav
            slug={slug}
            primaryColor={company?.couleurPrimaire ?? undefined}
          />
        </Suspense>
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
