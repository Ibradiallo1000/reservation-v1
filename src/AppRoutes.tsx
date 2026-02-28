// src/AppRoutes.tsx — Routes centralisées, permissions et helpers partagés
import { Suspense, lazy } from "react";
import { Routes, Route, Navigate, useParams, useLocation } from "react-router-dom";
import { useAuth } from "./contexts/AuthContext";
import PrivateRoute from "./modules/auth/components/PrivateRoute";
import ProtectedRoute from "./modules/auth/components/ProtectedRoute";
import RouteResolver from "./modules/compagnie/public/router/RouteResolver";
import { PageHeaderProvider } from "@/contexts/PageHeaderContext";
import { AuthCurrencyProvider } from "@/shared/currency/CurrencyContext";
import { routePermissions } from "@/constants/routePermissions";
import AdminCompanyPlan from "@/modules/plateforme/pages/AdminCompanyPlan";
import PlansManager from "@/modules/plateforme/pages/PlansManager";
import MentionsPage from "./modules/compagnie/public/pages/MentionsPage";
import ConfidentialitePage from "./modules/compagnie/public/pages/ConfidentialitePage";
import ConditionsPage from "@/modules/compagnie/public/pages/ConditionsPage";
import CookiesPage from "@/modules/compagnie/public/pages/CookiesPage";
import ReservationDetailsPage from "@/modules/compagnie/public/pages/ReservationDetailsPage";
import AdminParametresPlatformPage from "./modules/plateforme/pages/AdminParametresPlatformPage";
import ValidationComptablePage from "@/shared/workflows/pages/ValidationComptablePage";
import ValidationChefAgencePage from "@/shared/workflows/pages/ValidationChefAgencePage";
import ChefComptableCompagniePage from "./modules/compagnie/finances/pages/ChefComptableCompagnie";
import {
  VueGlobale,
  ReservationsEnLigne,
  Finances,
  Rapports,
  Parametres,
} from "@/modules/compagnie/finances/pages";
import ReservationPrintPage from "@/modules/agence/guichet/pages/ReservationPrintPage";

const HomePage = lazy(() => import("./modules/plateforme/pages/HomePage"));
const PlatformSearchResultsPage = lazy(() => import("./modules/plateforme/pages/PlatformSearchResultsPage"));
const LoginPage = lazy(() => import("./modules/auth/pages/LoginPage"));
const Register = lazy(() => import("./modules/auth/pages/Register"));
const ListeVillesPage = lazy(() => import("./modules/plateforme/pages/ListeVillesPage"));
const AcceptInvitationPage = lazy(() => import("./modules/auth/pages/AcceptInvitationPage"));

const ReservationClientPage = lazy(() => import("./modules/compagnie/public/pages/ReservationClientPage"));
const ClientMesReservationsPage = lazy(() => import("./modules/compagnie/public/pages/ClientMesReservationsPage"));
const ClientMesBilletsPage = lazy(() => import("./modules/compagnie/public/pages/ClientMesBilletsPage"));

const AdminSidebarLayout = lazy(() => import("./modules/plateforme/pages/AdminSidebarLayout"));
const AdminDashboard = lazy(() => import("./modules/plateforme/pages/AdminDashboard"));
const AdminCompagniesPage = lazy(() => import("./modules/plateforme/pages/AdminCompagniesPage"));
const AdminModifierCompagniePage = lazy(() => import("./modules/plateforme/pages/AdminModifierCompagniePage"));
const AdminStatistiquesPage = lazy(() => import("./modules/plateforme/pages/AdminStatistiquesPage"));
const AdminReservationsPage = lazy(() => import("./modules/plateforme/pages/AdminReservationsPage"));
const AdminFinancesPage = lazy(() => import("./modules/plateforme/pages/AdminFinancesPage"));
const AdminCompagnieAjouterPage = lazy(() => import("./modules/plateforme/pages/AdminCompagnieAjouterPage"));
const AdminSubscriptionsManager = lazy(() => import("./modules/plateforme/pages/AdminSubscriptionsManager"));
const AdminRevenueDashboard = lazy(() => import("./modules/plateforme/pages/AdminRevenueDashboard"));

const CompagnieLayout = lazy(() => import("@/modules/compagnie/admin/layout/CompagnieLayout"));
const GarageLayout = lazy(() => import("@/modules/compagnie/layout/GarageLayout"));
const CompanyAccountantLayout = lazy(() => import("@/modules/compagnie/accounting/layout/CompanyAccountantLayout"));
const CompagnieDashboard = lazy(() => import("./modules/compagnie/pages/CompagnieDashboard"));
const CEOCommandCenterPage = lazy(() => import("@/modules/compagnie/pages/CEOCommandCenterPage"));
const CEOPaymentApprovalsPage = lazy(() =>
  import("./modules/compagnie/pages/CEOPaymentApprovalsPage")
);
const CompanyFinancesPage = lazy(() => import("@/modules/compagnie/pages/CompanyFinancesPage"));
const GarageDashboardPage = lazy(() => import("@/modules/compagnie/pages/GarageDashboardPage"));
const GarageDashboardHomePage = lazy(() => import("@/modules/compagnie/pages/GarageDashboardHomePage"));
const CEOTreasuryPage = lazy(() =>
  import("@/modules/compagnie/pages/CEOTreasuryPage").catch((err) => {
    console.warn("CEOTreasuryPage lazy load failed, retrying:", err);
    return import("@/modules/compagnie/pages/CEOTreasuryPage");
  })
);
const CompagnieAgencesPage = lazy(() => import("./modules/compagnie/pages/CompagnieAgencesPage"));
const CompagnieParametresTabsPage = lazy(() => import("./modules/compagnie/pages/CompagnieParametresTabsPage"));
const CompagnieReservationsPage = lazy(() => import("./modules/compagnie/pages/CompagnieReservationsPage"));
const CompagnieComptabilitePage = lazy(() => import("./modules/compagnie/pages/CompagnieComptabilitePage"));
const BibliothequeImagesPage = lazy(() => import("./modules/compagnie/pages/BibliothequeImagesPage"));
const CompanyPaymentSettingsPage = lazy(() => import("./modules/compagnie/pages/CompanyPaymentSettingsPage"));
const AvisModerationPage = lazy(() => import("./modules/compagnie/pages/AvisModerationPage"));
const RevenusLiquiditesPage = lazy(() => import("./modules/compagnie/pages/RevenusLiquiditesPage"));
const OperationsFlotteLandingPage = lazy(() => import("./modules/compagnie/pages/OperationsFlotteLandingPage"));
const TripCostsPage = lazy(() => import("./modules/compagnie/pages/TripCostsPage"));
const ParametresPlan = lazy(() => import("./modules/compagnie/components/parametres/ParametresPlan"));

// ── Agency Manager (refactored) ──
const ManagerShellPage = lazy(() => import("./modules/agence/manager/ManagerShellPage"));
const ManagerCockpitPage = lazy(() => import("./modules/agence/manager/ManagerCockpitPage"));
const ManagerOperationsPage = lazy(() => import("./modules/agence/manager/ManagerOperationsPage"));
const ManagerFinancesPage = lazy(() => import("./modules/agence/manager/ManagerFinancesPage"));
const ManagerTeamPage = lazy(() => import("./modules/agence/manager/ManagerTeamPage"));
const ManagerReportsPage = lazy(() => import("./modules/agence/manager/ManagerReportsPage"));
const AgenceTrajetsPage = lazy(() => import("./modules/agence/pages/AgenceTrajetsPage"));
const AgencyTreasuryPage = lazy(() => import("./modules/agence/pages/AgencyTreasuryPage"));

// ── Agency standalone (non-manager roles) ──
const AgenceGuichetPage = lazy(() => import("./modules/agence/guichet/pages/AgenceGuichetPage"));
const ReceiptGuichetPage = lazy(() => import("./modules/agence/guichet/pages/ReceiptGuichetPage"));
const AgenceComptabilitePage = lazy(() => import("./modules/agence/comptabilite/pages/AgenceComptabilitePage"));
const BoardingLayout = lazy(() => import("./modules/agence/boarding/BoardingLayout"));
const BoardingDashboardPage = lazy(() => import("./modules/agence/boarding/BoardingDashboardPage"));
const BoardingScanPage = lazy(() => import("./modules/agence/boarding/BoardingScanPage"));
const FleetLayout = lazy(() => import("./modules/agence/fleet/FleetLayout"));
const FleetDashboardPage = lazy(() => import("./modules/agence/fleet/FleetDashboardPage"));
const FleetAssignmentPage = lazy(() => import("./modules/agence/fleet/FleetAssignmentPage"));
const FleetVehiclesPage = lazy(() => import("./modules/agence/fleet/FleetVehiclesPage"));
const FleetMovementLogPage = lazy(() => import("./modules/agence/fleet/FleetMovementLogPage"));
const AgenceFleetOperationsPage = lazy(() => import("./modules/agence/fleet/AgenceFleetOperationsPage"));
const CourierLayout = lazy(() => import("./modules/agence/courrier/layout/CourierLayout"));
const CourierDashboardPage = lazy(() => import("./modules/agence/courrier/pages/CourierDashboardPage"));
const CourierSessionPage = lazy(() => import("./modules/agence/courrier/pages/CourierSessionPage"));
const CourierCreateShipmentPage = lazy(() => import("./modules/agence/courrier/pages/CourierCreateShipmentPage"));
const CourierReceptionPage = lazy(() => import("./modules/agence/courrier/pages/CourierReceptionPage"));
const CourierPickupPage = lazy(() => import("./modules/agence/courrier/pages/CourierPickupPage"));
const CourierReportsPage = lazy(() => import("./modules/agence/courrier/pages/CourierReportsPage"));
const CourierBatchesPage = lazy(() => import("@/modules/agence/courrier/pages/CourierBatchesPage"));
const MediaPage = lazy(() => import("./modules/plateforme/pages/MediaPage"));
const DebugAuthPage = lazy(() => import("@/shared/pages/DebugAuthPage"));

const asArray = (x: unknown) => (Array.isArray(x) ? x : [x].filter(Boolean));
const hasAny = (roles: unknown, allowed: readonly string[]) =>
  asArray(roles).some((r) => allowed.includes(String(r)));

const landingTargetForRoles = (roles: unknown): string => {
  const rolesArray = asArray(roles).map(String);

  // ✅ ESPACE COMPTABILITÉ AGENCE
  if (hasAny(rolesArray, routePermissions.comptabilite)) {
    return "/agence/comptabilite";
  }

  // AGENCE
  if (hasAny(rolesArray, routePermissions.guichet)) {
    return "/agence/guichet";
  }

  if (hasAny(rolesArray, routePermissions.courrier)) {
    return "/agence/courrier";
  }

  if (hasAny(rolesArray, routePermissions.agenceShell)) {
    return "/agence/dashboard";
  }

  // COMPAGNIE (CEO) — only with companyId; without it avoid /compagnie/command-center (parsed as companyId="command-center")
  if (hasAny(rolesArray, ["admin_compagnie", "company_ceo"])) {
    return "/login";
  }

  // ADMIN PLATFORME
  if (hasAny(rolesArray, routePermissions.adminLayout)) {
    return "/admin/dashboard";
  }

  return "/login";
};

/** Redirection après login selon le rôle (et companyId si besoin). */
const ROLE_LANDING: Record<string, string> = {
  admin_platforme: "/admin/dashboard",
  agency_accountant: "/agence/comptabilite",
  chefAgence: "/agence/dashboard",
  chefEmbarquement: "/agence/boarding",
  agency_fleet_controller: "/agence/fleet",
  guichetier: "/agence/guichet",
  agentCourrier: "/agence/courrier",
};

function RoleLanding() {
  const { user } = useAuth() as any;
  if (!user) return <Navigate to="/login" replace />;

  const role = String(user?.role ?? "").trim();
  const companyId = (user.companyId ?? "") && String(user.companyId).trim() ? String(user.companyId) : "";

  // CEO → Command Center
  if ((role === "admin_compagnie" || role === "company_ceo") && companyId) {
    return <Navigate to={`/compagnie/${companyId}/command-center`} replace />;
  }
  if ((role === "admin_compagnie" || role === "company_ceo") && !companyId) {
    return <Navigate to="/login" replace />;
  }

  // Company accountant → dedicated accounting space
  if ((role === "company_accountant" || role === "financial_director") && companyId) {
    return <Navigate to={`/compagnie/${companyId}/accounting`} replace />;
  }
  if ((role === "company_accountant" || role === "financial_director") && !companyId) {
    return <Navigate to="/login" replace />;
  }

  const target = ROLE_LANDING[role] ?? landingTargetForRoles(role);
  return <Navigate to={target} replace />;
}

function LegacyUploadRedirect() {
  const { slug, id } = useParams();
  return <Navigate to={`/${slug || ""}/reservation/${id || ""}`} replace />;
}

function NavigateToCompagnieDashboard() {
  const { companyId } = useParams<{ companyId: string }>();
  return <Navigate to={`/compagnie/${companyId}/dashboard`} replace />;
}

function RedirectFinancesToRevenus() {
  const { companyId } = useParams<{ companyId: string }>();
  return <Navigate to={`/compagnie/${companyId}/revenus-liquidites?tab=revenus`} replace />;
}

function RedirectTreasuryToRevenus() {
  const { companyId } = useParams<{ companyId: string }>();
  return <Navigate to={`/compagnie/${companyId}/revenus-liquidites?tab=liquidites`} replace />;
}

const AppRoutes = () => {
  const { loading } = useAuth();
  const { pathname } = useLocation();
  const isHome = pathname === "/";

  if (loading && !isHome) return null;

  return (
    <Suspense fallback={null}>
      <Routes key={pathname}>
        {/* Route de debug - accessible à tous */}
        <Route path="/debug-auth" element={<DebugAuthPage />} />

        <Route path="/" element={<HomePage />} />

        {/* Role-based landing (used by PrivateRoute redirects) */}
        <Route path="/role-landing" element={<RoleLanding />} />

        {/* PUBLIC */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<Register />} />
        <Route path="/resultats" element={<PlatformSearchResultsPage />} />
        <Route path="/villes" element={<ListeVillesPage />} />
        <Route path="/:slug/mentions-legales" element={<MentionsPage />} />
        <Route path="/:slug/confidentialite" element={<ConfidentialitePage />} />
        <Route path="/:slug/conditions" element={<ConditionsPage />} />
        <Route path="/:slug/cookies" element={<CookiesPage />} />
        
        {/* ✅ ACCEPTATION INVITATION */}
        <Route
          path="/accept-invitation/:invitationId"
          element={<AcceptInvitationPage />}
        />

        {/* ========= ADMIN ========= */}
        <Route
          path="/admin"
          element={
            <PrivateRoute allowedRoles={routePermissions.adminLayout}>
              <PageHeaderProvider>
                <AdminSidebarLayout />
              </PageHeaderProvider>
            </PrivateRoute>
          }
        >
          <Route index element={<AdminDashboard />} />
          <Route path="dashboard" element={<AdminDashboard />} />
          <Route path="compagnies" element={<AdminCompagniesPage />} />
          <Route path="compagnies/ajouter" element={<AdminCompagnieAjouterPage />} />
          <Route path="compagnies/:id/modifier" element={<AdminModifierCompagniePage />} />
          <Route path="compagnies/:companyId/plan" element={<AdminCompanyPlan />} />
          <Route path="plans" element={<PlansManager />} />
          <Route path="subscriptions" element={<AdminSubscriptionsManager />} />
          <Route path="revenus" element={<AdminRevenueDashboard />} />
          <Route path="reservations" element={<AdminReservationsPage />} />
          <Route path="finances" element={<AdminFinancesPage />} />
          <Route path="statistiques" element={<AdminStatistiquesPage />} />
          <Route path="parametres-platforme" element={<AdminParametresPlatformPage />} />
          <Route path="media" element={<MediaPage />} />
          <Route
            path="compagnies/:companyId/configurer"
            element={<NavigateToCompagnieDashboard />}
          />
        </Route>

        {/* ========= TRIP COSTS (agency_manager, company_accountant, admin_compagnie) ========= */}
        <Route
          path="/compagnie/:companyId/trip-costs"
          element={
            <PrivateRoute allowedRoles={routePermissions.tripCosts}>
              <TripCostsPage />
            </PrivateRoute>
          }
        />

        {/* ========= COMPAGNIE CEO (admin_compagnie + admin_platforme ONLY) ========= */}
        <Route
          path="/compagnie/:companyId"
          element={
            <PrivateRoute allowedRoles={routePermissions.compagnieLayout}>
              <CompagnieLayout />
            </PrivateRoute>
          }
        >
          <Route index element={<RoleLanding />} />
          <Route path="command-center" element={<CEOCommandCenterPage />} />
          <Route path="payment-approvals" element={<CEOPaymentApprovalsPage />} />
          <Route path="revenus-liquidites" element={<RevenusLiquiditesPage />} />
          <Route path="finances" element={<RedirectFinancesToRevenus />} />
          <Route path="treasury" element={<RedirectTreasuryToRevenus />} />
          <Route path="operations-reseau" element={<OperationsFlotteLandingPage />} />
          <Route path="fleet" element={<GarageDashboardPage />} />
          <Route path="dashboard" element={<CompagnieDashboard />} />
          <Route path="comptabilite" element={<CompagnieComptabilitePage />} />
          <Route path="agences" element={<CompagnieAgencesPage />} />
          <Route path="parametres" element={<CompagnieParametresTabsPage />} />
          <Route path="parametres/plan" element={<ParametresPlan companyId={""} />} />
          <Route path="reservations" element={<CompagnieReservationsPage />} />
          <Route path="images" element={<BibliothequeImagesPage />} />
          <Route path="payment-settings" element={<CompanyPaymentSettingsPage />} />
          <Route path="avis-clients" element={<AvisModerationPage />} />
        </Route>

        {/* ========= GARAGE (Chef Garage only — Flotte, Maintenance, Transit, Incidents ; pas de Configuration) ========= */}
        <Route
          path="/compagnie/:companyId/garage"
          element={
            <PrivateRoute allowedRoles={routePermissions.garageLayout}>
              <GarageLayout />
            </PrivateRoute>
          }
        >
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<GarageDashboardHomePage />} />
          <Route path="fleet" element={<GarageDashboardPage />} />
          <Route path="maintenance" element={<GarageDashboardPage view="maintenance" />} />
          <Route path="transit" element={<GarageDashboardPage view="transit" />} />
          <Route path="incidents" element={<GarageDashboardPage view="incidents" />} />
        </Route>

        {/* ========= COMPANY ACCOUNTANT (dedicated layout, separate from CEO) ========= */}
        <Route
          path="/compagnie/:companyId/accounting"
          element={
            <PrivateRoute allowedRoles={routePermissions.companyAccountantLayout}>
              <CompanyAccountantLayout />
            </PrivateRoute>
          }
        >
          <Route index element={<VueGlobale />} />
          <Route path="reservations-en-ligne" element={<ReservationsEnLigne />} />
          <Route path="finances" element={<Finances />} />
          <Route path="treasury" element={<CEOTreasuryPage />} />
          <Route path="rapports" element={<Rapports />} />
          <Route path="parametres" element={<Parametres />} />
        </Route>

        {/* ========= CHEF COMPTABLE COMPAGNIE (legacy path — backward compat) ========= */}
        <Route
          path="/chef-comptable"
          element={
            <PrivateRoute allowedRoles={routePermissions.chefComptableCompagnie}>
              <ChefComptableCompagniePage />
            </PrivateRoute>
          }
        >
          <Route index element={<VueGlobale />} />
          <Route path="reservations-en-ligne" element={<ReservationsEnLigne />} />
          <Route path="finances" element={<Finances />} />
          <Route path="treasury" element={<CEOTreasuryPage />} />
          <Route path="rapports" element={<Rapports />} />
          <Route path="parametres" element={<Parametres />} />
        </Route>

        {/* ========= AGENCY MANAGER (refactored cockpit) + Courrier as nested collapsible ========= */}
        <Route
          path="/agence"
          element={
            <PrivateRoute allowedRoles={routePermissions.agenceShell}>
              <ManagerShellPage />
            </PrivateRoute>
          }
        >
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<ManagerCockpitPage />} />
          <Route path="operations" element={<ManagerOperationsPage />} />
          <Route path="trajets" element={<ProtectedRoute allowedRoles={routePermissions.agenceShell} withCurrency><AgenceTrajetsPage /></ProtectedRoute>} />
          <Route path="finances" element={<ManagerFinancesPage />} />
          <Route path="treasury" element={<AgencyTreasuryPage />} />
          <Route path="team" element={<ManagerTeamPage />} />
          <Route path="reports" element={<ManagerReportsPage />} />
          <Route
            path="courrier"
            element={
              <ProtectedRoute allowedRoles={routePermissions.courrier} withCurrency>
                <CourierLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<CourierSessionPage />} />
            <Route path="nouveau" element={<CourierCreateShipmentPage />} />
            <Route path="lots" element={<CourierBatchesPage />} />
            <Route path="reception" element={<CourierReceptionPage />} />
            <Route path="remise" element={<CourierPickupPage />} />
            <Route path="rapport" element={<CourierReportsPage />} />
          </Route>
        </Route>

        {/* ========= BOARDING (Phase 3 - separate from Agency Manager) ========= */}
        <Route
          path="/agence/boarding"
          element={
            <PrivateRoute allowedRoles={routePermissions.boarding}>
              <BoardingLayout />
            </PrivateRoute>
          }
        >
          <Route index element={<BoardingDashboardPage />} />
          <Route path="scan" element={<BoardingScanPage />} />
        </Route>

        {/* ========= FLEET (Phase 3 - separate from Agency Manager) ========= */}
        <Route
          path="/agence/fleet"
          element={
            <PrivateRoute allowedRoles={routePermissions.fleet}>
              <FleetLayout />
            </PrivateRoute>
          }
        >
          <Route index element={<FleetDashboardPage />} />
          <Route path="operations" element={<AgenceFleetOperationsPage />} />
          <Route path="assignment" element={<FleetAssignmentPage />} />
          <Route path="vehicles" element={<FleetVehiclesPage />} />
          <Route path="movements" element={<FleetMovementLogPage />} />
        </Route>

        {/* ========= PAGES HORS SHELL AGENCE ========= */}
        <Route
          path="/agence/guichet"
          element={<ProtectedRoute allowedRoles={routePermissions.guichet} withCurrency><AgenceGuichetPage /></ProtectedRoute>}
        />
        <Route
          path="/agence/comptabilite"
          element={<ProtectedRoute allowedRoles={routePermissions.comptabilite} withCurrency><AgenceComptabilitePage /></ProtectedRoute>}
        />

        {/* ========= VALIDATIONS (COMPATIBILITÉ) ========= */}
        {/* Validations comptables (ancienne route - garder pour compatibilité) */}
        <Route
          path="/compta/validations"
          element={
            <PrivateRoute allowedRoles={["company_accountant", "financial_director"] as const}>
              <ValidationComptablePage />
            </PrivateRoute>
          }
        />
        
        <Route
          path="/agence/validations"
          element={<PrivateRoute allowedRoles={routePermissions.validationsAgence}><ValidationChefAgencePage /></PrivateRoute>}
        />
        <Route
          path="/agence/receipt/:id"
          element={<ProtectedRoute allowedRoles={routePermissions.receiptGuichet} withCurrency><ReceiptGuichetPage /></ProtectedRoute>}
        />
        <Route path="/agence/reservations/print" element={<ProtectedRoute allowedRoles={routePermissions.receiptGuichet} withCurrency><ReservationPrintPage /></ProtectedRoute>} />

        {/* ========= DYNAMIQUES PUBLIQUES ========= */}
        <Route path="/:slug/reserver" element={<ReservationClientPage />} />
        <Route path="/:slug/reservation/:id" element={<ReservationDetailsPage />} />
        <Route path="/:slug/mon-billet" element={<ReservationDetailsPage />} />
        <Route path="/:slug/upload-preuve/:id" element={<LegacyUploadRedirect />} />
        <Route path="/mes-reservations" element={<ClientMesReservationsPage />} />
        <Route path="/mes-billets" element={<ClientMesBilletsPage />} />
        {/* /:slug/mes-reservations et /:slug/mes-billets passent par RouteResolver (bottom nav) */}
        <Route path="/:slug/*" element={<RouteResolver />} />

        {/* ========= REDIRECTIONS DE COMPATIBILITÉ ========= */}
        <Route path="/comptable" element={<Navigate to="/chef-comptable" replace />} />
        <Route 
          path="/compagnie/reservations-en-ligne-compta" 
          element={<Navigate to="/chef-comptable/reservations-en-ligne" replace />} 
        />

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
export { routePermissions } from "@/constants/routePermissions";