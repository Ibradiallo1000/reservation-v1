// src/AppRoutes.tsx
import { Suspense, lazy } from "react";
import { Routes, Route, Navigate, useParams, useLocation } from "react-router-dom";
import { useAuth } from "./contexts/AuthContext";
import PrivateRoute from "./pages/PrivateRoute";
import PageLoader from "./components/PageLoaderComponent";
import RouteResolver from "./pages/RouteResolver";
import SplashScreen from "@/components/SplashScreen";

/* ---------- Pages statiques ---------- */
import MentionsPage from "@/pages/MentionsPage";
import ConfidentialitePage from "@/pages/ConfidentialitePage";
import ConditionsPage from "@/pages/ConditionsPage";
import CookiesPage from "@/pages/CookiesPage";

/* ---------- Pages isolées ---------- */
import AgenceEmbarquementPage from "@/pages/AgenceEmbarquementPage";
import ReservationPrintPage from "@/pages/ReservationPrintPage";
import ReservationDetailsPage from "@/pages/ReservationDetailsPage";
import AdminParametresPlatformPage from "./pages/AdminParametresPlatformPage";
import ValidationComptablePage from "@/pages/ValidationComptablePage";
import ValidationChefAgencePage from "@/pages/ValidationChefAgencePage";

/* ---------- Lazy public ---------- */
const HomePage = lazy(() => import("./pages/HomePage"));
const PlatformSearchResultsPage = lazy(() => import("./pages/PlatformSearchResultsPage"));
const LoginPage = lazy(() => import("./pages/LoginPage"));
const Register = lazy(() => import("./pages/Register"));
const ListeVillesPage = lazy(() => import("./pages/ListeVillesPage"));

/* ---------- Réservation ---------- */
const ReservationClientPage = lazy(() => import("./pages/ReservationClientPage"));

/* ---------- Admin ---------- */
const AdminSidebarLayout = lazy(() => import("./pages/AdminSidebarLayout"));
const AdminDashboard = lazy(() => import("./pages/AdminDashboard"));
const AdminCompagniesPage = lazy(() => import("./pages/AdminCompagniesPage"));
const AdminAjouterCompagnie = lazy(() => import("./pages/AdminAjouterCompagnie"));
const AdminModifierCompagniePage = lazy(() => import("./pages/AdminModifierCompagniePage"));
const AdminStatistiquesPage = lazy(() => import("./pages/AdminStatistiquesPage"));
const AdminReservationsPage = lazy(() => import("./pages/AdminReservationsPage"));
const AdminFinancesPage = lazy(() => import("./pages/AdminFinancesPage"));

/* ---------- Compagnie ---------- */
const CompagnieLayout = lazy(() => import("./components/layout/CompagnieLayout"));
const CompagnieDashboard = lazy(() => import("./pages/CompagnieDashboard"));
const CompagnieAgencesPage = lazy(() => import("./pages/CompagnieAgencesPage"));
const CompagnieParametresTabsPage = lazy(() => import("./pages/CompagnieParametresTabsPage"));
const CompagnieReservationsPage = lazy(() => import("./pages/CompagnieReservationsPage"));
const CompagnieComptabilitePage = lazy(() => import("./pages/CompagnieComptabilitePage"));
const BibliothequeImagesPage = lazy(() => import("./pages/BibliothequeImagesPage"));
const ReservationsEnLignePage = lazy(() => import("./pages/ReservationsEnLignePage"));
const CompanyPaymentSettingsPage = lazy(() => import("./pages/CompanyPaymentSettingsPage"));
const AvisModerationPage = lazy(() => import("./pages/AvisModerationPage"));

/* ---------- Agence ---------- */
const DashboardAgencePage = lazy(() => import("./pages/DashboardAgencePage"));
const AgenceReservationsPage = lazy(() => import("./pages/AgenceReservationsPage"));
const AgenceGuichetPage = lazy(() => import("./pages/AgenceGuichetPage"));
const AgenceTrajetsPage = lazy(() => import("./pages/AgenceTrajetsPage"));
const AgenceFinancesPage = lazy(() => import("./pages/AgenceFinancesPage"));
const AgenceRecettesPage = lazy(() => import("./pages/AgenceRecettesPage"));
const AgencePersonnelPage = lazy(() => import("./pages/AgencePersonnelPage"));
const ReceiptGuichetPage = lazy(() => import("./pages/ReceiptGuichetPage"));
const MediaPage = lazy(() => import("./pages/MediaPage"));
const AgenceShiftHistoryPage = lazy(() => import("./pages/AgenceShiftHistoryPage"));
const AgenceComptabilitePage = lazy(() => import("./pages/AgenceComptabilitePage"));
const AgenceShiftPage = lazy(() => import("./pages/AgenceShiftPage"));

/* ---------- Shell d’agence ---------- */
const AgenceShellPage = lazy(() => import("./pages/AgenceShellPage"));

/* ===================== RÔLES & PERMISSIONS ===================== */
export const routePermissions = {
  compagnieLayout: ["admin_compagnie", "compagnie"] as const,
  agenceShell: ["chefAgence", "superviseur", "agentCourrier", "admin_compagnie"] as const,
  guichet: ["guichetier", "chefAgence", "admin_compagnie"] as const,
  comptabilite: ["comptable", "admin_compagnie"] as const,
  validationsCompta: ["comptable", "admin_compagnie"] as const,
  validationsAgence: ["chefAgence", "superviseur", "admin_compagnie"] as const,
  receiptGuichet: ["chefAgence", "guichetier", "admin_compagnie"] as const,
  adminLayout: ["admin_platforme"] as const,
};

const asArray = (x: unknown) => (Array.isArray(x) ? x : [x].filter(Boolean));
const hasAny = (roles: unknown, allowed: readonly string[]) =>
  asArray(roles).some((r) => allowed.includes(String(r)));

const landingTargetForRoles = (roles: unknown): string => {
  if (hasAny(roles, routePermissions.guichet)) return "/agence/guichet";
  if (hasAny(roles, routePermissions.comptabilite)) return "/agence/comptabilite";
  if (hasAny(roles, routePermissions.compagnieLayout)) return "/compagnie/dashboard";
  if (hasAny(roles, routePermissions.agenceShell)) return "/agence/dashboard";
  if (hasAny(roles, routePermissions.adminLayout)) return "/admin/dashboard";
  return "/login";
};

function RoleLanding() {
  const { user } = useAuth() as any;
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={landingTargetForRoles(user.role)} replace />;
}

function LegacyUploadRedirect() {
  const { slug, id } = useParams();
  return <Navigate to={`/${slug || ""}/reservation/${id || ""}`} replace />;
}

const AppRoutes = () => {
  const { loading } = useAuth();
  const { pathname } = useLocation();
  const isHome = pathname === "/";

  if (loading && !isHome) return <PageLoader fullScreen />;

  return (
    <Suspense fallback={isHome ? null : <PageLoader fullScreen />}>
      <Routes key={pathname}>
        {/* HOME + Splash */}
        <Route
          path="/"
          element={
            <SplashScreen
              logo="/images/teliya-logo.jpg"
              sizePx={190}
              ringWidthPx={2}
              ringOpacity={0.45}
              spinnerSpeedMs={800}
              minMs={1200}
              maxMs={3600}
              extraHoldMs={900}
              preload={[
                "/images/hero-fallback.jpg",
                "/images/partners/mali-trans.png",
                "/images/partners/diarra-trans.png",
              ]}
            >
              <HomePage />
            </SplashScreen>
          }
        />

        {/* PUBLIC */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<Register />} />
        <Route path="/resultats" element={<PlatformSearchResultsPage />} />
        <Route path="/villes" element={<ListeVillesPage />} />

        {/* Mentions / Légal */}
        <Route path="/:slug/mentions-legales" element={<MentionsPage />} />
        <Route path="/:slug/confidentialite" element={<ConfidentialitePage />} />
        <Route path="/:slug/conditions" element={<ConditionsPage />} />
        <Route path="/:slug/cookies" element={<CookiesPage />} />

        {/* ADMIN PLATEFORME (tes pages existantes) */}
        <Route
          path="/admin"
          element={
            <PrivateRoute allowedRoles={[...routePermissions.adminLayout]}>
              <AdminSidebarLayout />
            </PrivateRoute>
          }
        >
          <Route index element={<AdminDashboard />} />
          <Route path="dashboard" element={<AdminDashboard />} />
          <Route path="compagnies" element={<AdminCompagniesPage />} />
          <Route path="compagnies/ajouter" element={<AdminAjouterCompagnie />} />
          <Route path="compagnies/:id/modifier" element={<AdminModifierCompagniePage />} />
          <Route path="reservations" element={<AdminReservationsPage />} />
          <Route path="finances" element={<AdminFinancesPage />} />
          <Route path="statistiques" element={<AdminStatistiquesPage />} />
          <Route path="parametres-platforme" element={<AdminParametresPlatformPage />} />
          <Route path="media" element={<MediaPage />} />
        </Route>

        {/* COMPAGNIE */}
        <Route
          path="/compagnie"
          element={
            <PrivateRoute allowedRoles={[...routePermissions.compagnieLayout]}>
              <CompagnieLayout />
            </PrivateRoute>
          }
        >
          <Route index element={<CompagnieDashboard />} />
          <Route path="dashboard" element={<CompagnieDashboard />} />
          <Route path="comptabilite" element={<CompagnieComptabilitePage />} />
          <Route path="agences" element={<CompagnieAgencesPage />} />
          <Route path="parametres" element={<CompagnieParametresTabsPage />} />
          <Route path="reservations" element={<CompagnieReservationsPage />} />
          <Route path="reservations-en-ligne" element={<ReservationsEnLignePage />} />
          <Route path="images" element={<BibliothequeImagesPage />} />
          <Route path="payment-settings" element={<CompanyPaymentSettingsPage />} />
          <Route path="avis-clients" element={<AvisModerationPage />} />
        </Route>

        {/* SHELL D’AGENCE (fusion du redirect ici en index) */}
        <Route
          path="/agence"
          element={
            <PrivateRoute allowedRoles={[...routePermissions.agenceShell]}>
              <AgenceShellPage />
            </PrivateRoute>
          }
        >
          {/* 👉 redirection d’atterrissage ici, plus de doublon de route /agence */}
          <Route index element={<RoleLanding />} />
          <Route path="dashboard" element={<DashboardAgencePage />} />
          <Route path="reservations" element={<AgenceReservationsPage />} />
          <Route path="embarquement" element={<AgenceEmbarquementPage />} />
          <Route path="trajets" element={<AgenceTrajetsPage />} />
          <Route path="garage" element={<AgenceShiftHistoryPage />} />
          <Route path="recettes" element={<AgenceRecettesPage />} />
          <Route path="finances" element={<AgenceFinancesPage />} />
          <Route path="personnel" element={<AgencePersonnelPage />} />
          <Route path="shift" element={<AgenceShiftPage />} />
          <Route path="shift-history" element={<AgenceShiftHistoryPage />} />
        </Route>

        {/* HORS SHELL */}
        <Route
          path="/agence/guichet"
          element={
            <PrivateRoute allowedRoles={[...routePermissions.guichet]}>
              <AgenceGuichetPage />
            </PrivateRoute>
          }
        />
        <Route
          path="/agence/comptabilite"
          element={
            <PrivateRoute allowedRoles={[...routePermissions.comptabilite]}>
              <AgenceComptabilitePage />
            </PrivateRoute>
          }
        />

        {/* VALIDATIONS */}
        <Route
          path="/compta/validations"
          element={
            <PrivateRoute allowedRoles={[...routePermissions.validationsCompta]}>
              <ValidationComptablePage />
            </PrivateRoute>
          }
        />
        <Route
          path="/agence/validations"
          element={
            <PrivateRoute allowedRoles={[...routePermissions.validationsAgence]}>
              <ValidationChefAgencePage />
            </PrivateRoute>
          }
        />

        {/* PAGES ISOLÉES */}
        <Route
          path="/agence/receipt/:id"
          element={
            <PrivateRoute allowedRoles={[...routePermissions.receiptGuichet]}>
              <ReceiptGuichetPage />
            </PrivateRoute>
          }
        />
        <Route path="/agence/reservations/print" element={<ReservationPrintPage />} />

        {/* DYNAMIQUES PUBLIQUES */}
        <Route path="/:slug/reserver" element={<ReservationClientPage />} />
        <Route path="/:slug/reservation/:id" element={<ReservationDetailsPage />} />
        <Route path="/:slug/upload-preuve/:id" element={<LegacyUploadRedirect />} />
        <Route path="/:slug/*" element={<RouteResolver />} />

        {/* 404 */}
        <Route
          path="*"
          element={
            <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-gray-100">
              <h1 className="text-4xl font-bold text-red-600 mb-4">404 - Page non trouvée</h1>
              <p className="text-lg text-gray-700 mb-6">La page demandée est introuvable ou a été déplacée.</p>
              <a href="/" className="bg-orange-600 text-white px-5 py-2 rounded hover:bg-orange-700">
                Retour à l'accueil
              </a>
            </div>
          }
        />
      </Routes>
    </Suspense>
  );
};

export default AppRoutes;
