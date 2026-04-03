// src/AppRoutes.tsx — Routes centralisées, permissions et helpers partagés
import { Suspense, lazy } from "react";
import { Routes, Route, Navigate, useParams, useLocation, Outlet } from "react-router-dom";
import { useAuth } from "./contexts/AuthContext";
import PrivateRoute from "./modules/auth/components/PrivateRoute";
import ProtectedRoute from "./modules/auth/components/ProtectedRoute";
import TenantGuard from "./modules/auth/components/TenantGuard";
import { PageHeaderProvider } from "@/contexts/PageHeaderContext";
import { AuthCurrencyProvider } from "@/shared/currency/CurrencyContext";
import { routePermissions } from "@/constants/routePermissions";
import { GlobalPeriodProvider } from "@/contexts/GlobalPeriodContext";
import { GlobalDataSnapshotProvider } from "@/contexts/GlobalDataSnapshotContext";
import { GlobalMoneyPositionsProvider } from "@/contexts/GlobalMoneyPositionsContext";

const RouteResolver = lazy(() => import("./modules/compagnie/public/router/RouteResolver"));
const AdminCompanyPlan = lazy(() => import("@/modules/plateforme/pages/AdminCompanyPlan"));
const PlansManager = lazy(() => import("@/modules/plateforme/pages/PlansManager"));
const MentionsPage = lazy(() => import("./modules/compagnie/public/pages/MentionsPage"));
const ConfidentialitePage = lazy(() => import("./modules/compagnie/public/pages/ConfidentialitePage"));
const ConditionsPage = lazy(() => import("@/modules/compagnie/public/pages/ConditionsPage"));
const CookiesPage = lazy(() => import("@/modules/compagnie/public/pages/CookiesPage"));
const ReservationDetailsPage = lazy(() => import("./modules/compagnie/public/pages/ReservationDetailsPage"));
const AdminParametresPlatformPage = lazy(() => import("./modules/plateforme/pages/AdminParametresPlatformPage"));
const VueGlobale = lazy(() => import("@/modules/compagnie/finances/pages").then((m) => ({ default: m.VueGlobale })));
const Finances = lazy(() => import("@/modules/compagnie/finances/pages").then((m) => ({ default: m.Finances })));
const Rapports = lazy(() => import("@/modules/compagnie/finances/pages").then((m) => ({ default: m.Rapports })));
const Parametres = lazy(() => import("@/modules/compagnie/finances/pages").then((m) => ({ default: m.Parametres })));
const DepensesPage = lazy(() => import("@/modules/compagnie/finances/pages").then((m) => ({ default: m.DepensesPage })));
const ExpenseDashboard = lazy(() => import("@/modules/compagnie/finances/pages").then((m) => ({ default: m.ExpenseDashboard })));
const DigitalCashReservationsPage = lazy(() =>
  import("@/modules/compagnie/finances/pages/DigitalCashReservationsPage")
);
const FinancialConsistencyDiagnosticsPage = lazy(
  () => import("@/modules/compagnie/finances/pages/FinancialConsistencyDiagnosticsPage")
);
const ComptaPage = lazy(() => import("@/modules/compagnie/compta/pages/ComptaPage"));
const ReservationPrintPage = lazy(() => import("@/modules/agence/guichet/pages/ReservationPrintPage"));

const HomePage = lazy(() => import("./modules/plateforme/pages/HomePage"));
const PlatformSearchResultsPage = lazy(() => import("./modules/plateforme/pages/PlatformSearchResultsPage"));
const LoginPage = lazy(() => import("./modules/auth/pages/LoginPage"));
const Register = lazy(() => import("./modules/auth/pages/Register"));
const ListeVillesPage = lazy(() => import("./modules/plateforme/pages/ListeVillesPage"));
const AcceptInvitationPage = lazy(() => import("./modules/auth/pages/AcceptInvitationPage"));
const TrackShipmentFindPage = lazy(() => import("@/modules/logistics/pages/TrackShipmentFindPage"));
const TrackShipmentPage = lazy(() => import("@/modules/logistics/pages/TrackShipmentPage"));
const ScanShipmentPage = lazy(() => import("@/modules/logistics/pages/ScanShipmentPage"));

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
const GarageDashboardPage = lazy(() => import("@/modules/compagnie/pages/GarageDashboardPage"));
const GarageDashboardHomePage = lazy(() => import("@/modules/compagnie/pages/GarageDashboardHomePage"));
const CEOTreasuryPage = lazy(() =>
  import("@/modules/compagnie/pages/CEOTreasuryPage").catch((err) => {
    console.warn("CEOTreasuryPage lazy load failed, retrying:", err);
    return import("@/modules/compagnie/pages/CEOTreasuryPage");
  })
);
const CEOExpensesPage = lazy(() => import("./modules/compagnie/pages/CEOExpensesPage"));
const CompagnieAgencesPage = lazy(() => import("./modules/compagnie/pages/CompagnieAgencesPage"));
const CompagnieParametresTabsPage = lazy(() => import("./modules/compagnie/pages/CompagnieParametresTabsPage"));
const CompagnieReservationsPage = lazy(() => import("./modules/compagnie/pages/CompagnieReservationsPage"));
const CompagnieCustomersPage = lazy(() => import("./modules/compagnie/pages/CompagnieCustomersPage"));
const CompagnieCustomerProfilePage = lazy(() => import("./modules/compagnie/pages/CompagnieCustomerProfilePage"));
const CompagnieComptabilitePage = lazy(() => import("./modules/compagnie/pages/CompagnieComptabilitePage"));
const BibliothequeImagesPage = lazy(() => import("./modules/compagnie/pages/BibliothequeImagesPage"));
const CompanyPaymentSettingsPage = lazy(() => import("./modules/compagnie/pages/CompanyPaymentSettingsPage"));
const AvisModerationPage = lazy(() => import("./modules/compagnie/pages/AvisModerationPage"));
const RevenusLiquiditesPage = lazy(() => import("./modules/compagnie/pages/RevenusLiquiditesPage"));
const OperationsFlotteLandingPage = lazy(() => import("./modules/compagnie/pages/OperationsFlotteLandingPage"));
const TripCostsPage = lazy(() => import("./modules/compagnie/pages/TripCostsPage"));
const FleetFinancePage = lazy(() => import("./modules/compagnie/pages/FleetFinancePage"));
const LogisticsDashboardPage = lazy(() => import("./modules/compagnie/pages/LogisticsDashboardPage"));
const LogisticsCrewPage = lazy(() => import("./modules/compagnie/pages/LogisticsCrewPage"));
const CompanyRoutesPage = lazy(() => import("./modules/compagnie/pages/CompanyRoutesPage"));
const CompanyCashPage = lazy(() => import("./modules/compagnie/cash/CompanyCashPage"));
const FinancesPage = lazy(() => import("./modules/compagnie/pages/FinancesPage"));
const ReservationsReseauPage = lazy(() => import("./modules/compagnie/pages/ReservationsReseauPage"));
const FlottePage = lazy(() => import("./modules/compagnie/pages/FlottePage"));
const AuditControlePage = lazy(() => import("./modules/compagnie/pages/AuditControlePage"));
const CompanySystemErrorsPage = lazy(() => import("./modules/compagnie/pages/CompanySystemErrorsPage"));
const CompagnieComptabiliteValidationPage = lazy(() => import("./modules/compagnie/pages/CompagnieComptabiliteValidationPage"));
const ParametresPlan = lazy(() => import("./modules/compagnie/components/parametres/ParametresPlan"));
const FinancialSettingsPage = lazy(() => import("./modules/compagnie/settings/FinancialSettingsPage"));
const NotificationsPage = lazy(() => import("./modules/compagnie/notifications/NotificationsPage"));
const TreasuryNewOperationPage = lazy(() => import("./modules/compagnie/treasury/pages/TreasuryNewOperationPage"));
const TreasuryTransferPage = lazy(() => import("./modules/compagnie/treasury/pages/TreasuryTransferPage"));
const TreasurySupplierPaymentPage = lazy(() => import("./modules/compagnie/treasury/pages/TreasurySupplierPaymentPage"));
const TreasuryNewPayablePage = lazy(() => import("./modules/compagnie/treasury/pages/TreasuryNewPayablePage"));

// ── Agency Manager (refactored) ──
const ManagerShellPage = lazy(() => import("./modules/agence/manager/ManagerShellPage"));
const ManagerTeamPage = lazy(() => import("./modules/agence/manager/ManagerTeamPage"));
const ManagerReportsPage = lazy(() => import("./modules/agence/manager/ManagerReportsPage"));
const AgencyActivityDomainPage = lazy(() => import("./modules/agence/manager/domains/AgencyActivityDomainPage"));
const AgencyActivityLogPage = lazy(() => import("./modules/agence/manager/AgencyActivityLogPage"));
const AgencyAgentHistoryPage = lazy(() => import("./modules/agence/manager/AgencyAgentHistoryPage"));
const AgencyCashDomainPage = lazy(() => import("./modules/agence/manager/domains/AgencyCashDomainPage"));
const AgencyDepartureValidationsPage = lazy(() => import("./modules/agence/manager/AgencyDepartureValidationsPage"));
const AgencyExpectedArrivalsPage = lazy(() => import("./modules/agence/manager/AgencyExpectedArrivalsPage"));
const AgenceTrajetsPage = lazy(() => import("./modules/agence/pages/AgenceTrajetsPage"));
const AgencyTreasuryNewOperationPage = lazy(() => import("./modules/agence/treasury/pages/AgencyTreasuryNewOperationPage"));
const AgencyTreasuryTransferPage = lazy(() => import("./modules/agence/treasury/pages/AgencyTreasuryTransferPage"));
const AgencyTreasuryNewPayablePage = lazy(() => import("./modules/agence/treasury/pages/AgencyTreasuryNewPayablePage"));

// ── Agency standalone (non-manager roles) ──
const AgenceGuichetPage = lazy(() => import("./modules/agence/guichet/pages/AgenceGuichetPage"));
const EscaleLayout = lazy(() => import("./modules/agence/escale/layout/EscaleLayout"));
const EscaleDashboardPage = lazy(() => import("./modules/agence/escale/pages/EscaleDashboardPage"));
const EscaleBusDuJourPage = lazy(() => import("./modules/agence/escale/pages/EscaleBusDuJourPage"));
const EscaleCaissePage = lazy(() => import("./modules/agence/escale/pages/EscaleCaissePage"));
const BoardingEscalePage = lazy(() => import("./modules/agence/escale/pages/BoardingEscalePage"));
const BusPassengerManifestPage = lazy(() => import("./modules/agence/escale/pages/BusPassengerManifestPage"));
const ReceiptGuichetPage = lazy(() => import("./modules/agence/guichet/pages/ReceiptGuichetPage"));
const AgenceComptabilitePage = lazy(() => import("./modules/agence/comptabilite/pages/AgenceComptabilitePage"));
const CashSessionsPage = lazy(() => import("./modules/agence/cashControl/CashSessionsPage"));
const BoardingLayout = lazy(() => import("./modules/agence/boarding/BoardingLayout"));
const BoardingDashboardPage = lazy(() => import("./modules/agence/boarding/BoardingDashboardPage"));
const BoardingScanPage = lazy(() => import("./modules/agence/boarding/BoardingScanPage"));
const BoardingLiveOpsPage = lazy(() => import("./modules/agence/boarding/BoardingLiveOpsPage"));
const FleetLayout = lazy(() => import("./modules/agence/fleet/FleetLayout"));
const FleetDashboardPage = lazy(() => import("./modules/agence/fleet/FleetDashboardPage"));
const FleetAssignmentPage = lazy(() => import("./modules/agence/fleet/FleetAssignmentPage"));
const FleetVehiclesPage = lazy(() => import("./modules/agence/fleet/FleetVehiclesPage"));
const FleetCrewPage = lazy(() => import("./modules/agence/fleet/FleetCrewPage"));
const FleetMovementLogPage = lazy(() => import("./modules/agence/fleet/FleetMovementLogPage"));
const AgenceFleetOperationsPage = lazy(() => import("./modules/agence/fleet/AgenceFleetOperationsPage"));
const TripPlanningPage = lazy(() => import("./modules/agence/planning/TripPlanningPage"));
const CourierLayout = lazy(() => import("./modules/agence/courrier/layout/CourierLayout"));
const CourierSessionPage = lazy(() => import("./modules/agence/courrier/pages/CourierSessionPage"));
const CourierCreateShipmentPage = lazy(() => import("./modules/agence/courrier/pages/CourierCreateShipmentPage"));
const CourierReceptionPage = lazy(() => import("./modules/agence/courrier/pages/CourierReceptionPage"));
const CourierPickupPage = lazy(() => import("./modules/agence/courrier/pages/CourierPickupPage"));
const CourierBatchesPage = lazy(() => import("@/modules/agence/courrier/pages/CourierBatchesPage"));
const CourierReportsPage = lazy(() => import("@/modules/agence/courrier/pages/CourierReportsPage"));
const CourierHistoriquePage = lazy(() => import("@/modules/agence/courrier/pages/CourierHistoriquePage"));
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

  // AGENCE — escale_agent / escale_manager → tableau de bord escale
  if (hasAny(rolesArray, routePermissions.escaleDashboard) && (rolesArray.includes("escale_agent") || rolesArray.includes("escale_manager"))) {
    return "/agence/escale";
  }
  if (hasAny(rolesArray, routePermissions.guichet)) {
    return "/agence/guichet";
  }

  if (hasAny(rolesArray, routePermissions.courrier)) {
    return "/agence/courrier";
  }

  if (hasAny(rolesArray, routePermissions.agenceShell)) {
    return "/agence/activite";
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
  chefAgence: "/agence/activite",
  chefEmbarquement: "/agence/boarding",
  agency_fleet_controller: "/agence/fleet",
  guichetier: "/agence/guichet",
  agentCourrier: "/agence/courrier",
  escale_agent: "/agence/escale",
  escale_manager: "/agence/escale",
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

  // Operator digital → caisse digitale (validation paiements en ligne uniquement)
  if (role === "operator_digital" && companyId) {
    return <Navigate to={`/compagnie/${companyId}/digital-cash`} replace />;
  }
  if (role === "operator_digital" && !companyId) {
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

/** Sous-domaine compagnie (ex: malitrans.teliya.app). Utilisé pour rendre RouteResolver sur "/" */
function isPublicSubdomain(): boolean {
  if (typeof window === "undefined") return false;
  const h = window.location.hostname;
  return (h.endsWith(".teliya.app") && h !== "teliya.app") || (h.endsWith(".localhost") && h !== "localhost");
}

function SubdomainAwareHome() {
  const isSub = typeof window !== "undefined" && isPublicSubdomain();
  return isSub ? <RouteResolver /> : <HomePage />;
}

/** Sur sous-domaine, /a-propos (et autres chemins à un segment) doit rendre RouteResolver. Sinon redirection. */
function SubdomainOnlyRouteResolver() {
  const isSub = typeof window !== "undefined" && isPublicSubdomain();
  if (!isSub) return <Navigate to="/" replace />;
  return <RouteResolver />;
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

        {/* "/" : sous-domaine → RouteResolver (slug depuis l'hôte), sinon HomePage */}
        <Route path="/" element={<Suspense fallback={null}><SubdomainAwareHome /></Suspense>} />

        {/* Sous-domaine : /a-propos (voir plus) sans préfixe slug → RouteResolver */}
        <Route path="/a-propos" element={<Suspense fallback={null}><SubdomainOnlyRouteResolver /></Suspense>} />

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

        <Route path="/track" element={<TrackShipmentFindPage />} />
        <Route path="/track/:trackingPublicId" element={<TrackShipmentPage />} />
        <Route
          path="/scan"
          element={
            <ProtectedRoute allowedRoles={routePermissions.courrier} withCurrency={false}>
              <ScanShipmentPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/scan/:shipmentId"
          element={
            <ProtectedRoute allowedRoles={routePermissions.courrier} withCurrency={false}>
              <ScanShipmentPage />
            </ProtectedRoute>
          }
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
              <TenantGuard>
                <TripCostsPage />
              </TenantGuard>
            </PrivateRoute>
          }
        />

        <Route
          path="/compagnie/:companyId/notifications"
          element={
            <PrivateRoute allowedRoles={["admin_compagnie", "company_accountant", "financial_director", "admin_platforme"] as const}>
              <TenantGuard>
                <NotificationsPage />
              </TenantGuard>
            </PrivateRoute>
          }
        />

        {/* ========= CAISSE DIGITALE (operator_digital + admins) — pas company_accountant / financial_director ========= */}
        <Route
          path="/compagnie/:companyId/digital-cash"
          element={
            <PrivateRoute allowedRoles={routePermissions.digitalCash}>
              <TenantGuard>
                <DigitalCashReservationsPage />
              </TenantGuard>
            </PrivateRoute>
          }
        />

        {/* ========= COMPAGNIE CEO (admin_compagnie + admin_platforme ONLY) ========= */}
        <Route
          path="/compagnie/:companyId"
          element={
            <PrivateRoute allowedRoles={routePermissions.compagnieLayout}>
              <TenantGuard>
                <GlobalPeriodProvider>
                  <GlobalDataSnapshotProvider>
                    <GlobalMoneyPositionsProvider>
                      <CompagnieLayout />
                    </GlobalMoneyPositionsProvider>
                  </GlobalDataSnapshotProvider>
                </GlobalPeriodProvider>
              </TenantGuard>
            </PrivateRoute>
          }
        >
          <Route index element={<RoleLanding />} />
          <Route path="command-center" element={<CEOCommandCenterPage />} />
          <Route path="payment-approvals" element={<CEOPaymentApprovalsPage />} />
          <Route path="ceo-expenses" element={<Navigate to="audit-controle?tab=depenses" replace />} />
          <Route path="expenses-approvals" element={<Navigate to="audit-controle?tab=depenses" replace />} />
          <Route path="revenus-liquidites" element={<Navigate to="finances?tab=ca" replace />} />
          <Route path="caisse" element={<Navigate to="finances?tab=caisse" replace />} />
          <Route path="finances" element={<FinancesPage />} />
          <Route path="treasury" element={<Navigate to="finances?tab=liquidites" replace />} />
          <Route path="operations-reseau" element={<Navigate to="reservations-reseau" replace />} />
          <Route path="fleet" element={<Navigate to="flotte?tab=exploitation" replace />} />
          <Route path="fleet-finance" element={<Navigate to="flotte?tab=rentabilite" replace />} />
          <Route path="dashboard" element={<Navigate to="reservations-reseau" replace />} />
          <Route path="reservations-reseau" element={<ReservationsReseauPage />} />
          <Route path="reservations-reseau/reservations" element={<CompagnieReservationsPage />} />
          <Route path="reservations" element={<Navigate to="reservations-reseau/reservations" replace />} />
          <Route path="flotte" element={<FlottePage />} />
          <Route path="comptabilite/validation" element={<CompagnieComptabiliteValidationPage />} />
          <Route path="comptabilite" element={<Navigate to="audit-controle?tab=controle" replace />} />
          <Route path="audit-controle" element={<AuditControlePage />} />
          <Route path="system-errors" element={<CompanySystemErrorsPage />} />
          <Route path="agences" element={<CompagnieAgencesPage />} />
          <Route path="parametres" element={<CompagnieParametresTabsPage />} />
          <Route path="parametres/plan" element={<ParametresPlan companyId={""} />} />
          <Route path="customers" element={<CompagnieCustomersPage />} />
          <Route path="customers/:customerId" element={<CompagnieCustomerProfilePage />} />
          <Route path="images" element={<BibliothequeImagesPage />} />
          <Route path="payment-settings" element={<CompanyPaymentSettingsPage />} />
          <Route path="avis-clients" element={<AvisModerationPage />} />
        </Route>

        {/* ========= GARAGE (Responsable logistique, admin_platforme — Flotte, Maintenance, Transit, Incidents, Logistique) ========= */}
        <Route
          path="/compagnie/:companyId/garage"
          element={
            <PrivateRoute allowedRoles={routePermissions.garageLayout}>
              <TenantGuard>
                <GarageLayout />
              </TenantGuard>
            </PrivateRoute>
          }
        >
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<GarageDashboardHomePage />} />
          <Route path="logistics" element={
            <PrivateRoute allowedRoles={routePermissions.logisticsDashboard}>
              <LogisticsDashboardPage />
            </PrivateRoute>
          } />
          <Route path="logistics/crew" element={
            <PrivateRoute allowedRoles={routePermissions.logisticsDashboard}>
              <LogisticsCrewPage />
            </PrivateRoute>
          } />
          <Route path="logistics/compliance" element={
            <PrivateRoute allowedRoles={routePermissions.logisticsDashboard}>
              <LogisticsDashboardPage />
            </PrivateRoute>
          } />
          <Route path="logistics/emergency" element={
            <PrivateRoute allowedRoles={routePermissions.logisticsDashboard}>
              <LogisticsDashboardPage />
            </PrivateRoute>
          } />
          <Route path="fleet" element={<GarageDashboardPage />} />
          <Route path="routes" element={<CompanyRoutesPage />} />
          <Route path="maintenance" element={<GarageDashboardPage view="maintenance" />} />
          <Route path="transit" element={<GarageDashboardPage view="transit" />} />
          <Route path="incidents" element={<GarageDashboardPage view="incidents" />} />
        </Route>

        {/* ========= COMPANY ACCOUNTANT (dedicated layout, separate from CEO) ========= */}
        <Route
          path="/compagnie/:companyId/accounting"
          element={
            <PrivateRoute allowedRoles={routePermissions.companyAccountantLayout}>
              <TenantGuard>
                <CompanyAccountantLayout />
              </TenantGuard>
            </PrivateRoute>
          }
        >
          <Route index element={<VueGlobale />} />
          <Route
            path="reservations-reseau"
            element={
              <GlobalPeriodProvider>
                <GlobalDataSnapshotProvider>
                  <ReservationsReseauPage />
                </GlobalDataSnapshotProvider>
              </GlobalPeriodProvider>
            }
          />
          <Route
            path="reservations-reseau/reservations"
            element={
              <GlobalPeriodProvider>
                <GlobalDataSnapshotProvider>
                  <CompagnieReservationsPage />
                </GlobalDataSnapshotProvider>
              </GlobalPeriodProvider>
            }
          />
          <Route path="finances" element={<Finances />} />
          <Route path="compta" element={<ComptaPage />} />
          <Route path="expenses" element={<DepensesPage />} />
          <Route path="expenses-dashboard" element={<ExpenseDashboard />} />
          <Route path="treasury" element={<CEOTreasuryPage />} />
          <Route path="treasury/new-operation" element={<TreasuryNewOperationPage />} />
          <Route path="treasury/new-payable" element={<TreasuryNewPayablePage />} />
          <Route path="treasury/transfer" element={<TreasuryTransferPage />} />
          <Route path="supplier-payments" element={<TreasurySupplierPaymentPage />} />
          <Route path="rapports" element={<Rapports />} />
          <Route path="parametres" element={<Parametres />} />
          <Route
            path="consistency-diagnostics"
            element={<FinancialConsistencyDiagnosticsPage />}
          />
        </Route>

        {/* ========= AGENCY MANAGER (refactored cockpit) + Courrier as nested collapsible ========= */}
        <Route
          path="/agence"
          element={
            <PrivateRoute allowedRoles={routePermissions.agenceShell}>
              <TenantGuard>
                <ManagerShellPage />
              </TenantGuard>
            </PrivateRoute>
          }
        >
          <Route index element={<Navigate to="activite" replace />} />
          <Route path="activite" element={<AgencyActivityDomainPage />} />
          <Route path="activity-log" element={<AgencyActivityLogPage />} />
          <Route path="caisse" element={<AgencyCashDomainPage />} />
          <Route path="dashboard" element={<Navigate to="/agence/activite" replace />} />
          <Route path="operations" element={<Navigate to="/agence/activite#activite-operations" replace />} />
          <Route path="trajets" element={<ProtectedRoute allowedRoles={routePermissions.agenceShell} withCurrency><AgenceTrajetsPage /></ProtectedRoute>} />
          <Route path="finances" element={<Navigate to="/agence/caisse#caisse-sessions" replace />} />
          <Route
            path="expenses-approval"
            element={
              <ProtectedRoute allowedRoles={routePermissions.validationsAgence}>
                <Navigate to="/agence/caisse#caisse-depenses" replace />
              </ProtectedRoute>
            }
          />
          <Route path="expenses" element={<Navigate to="/agence/caisse#caisse-depenses" replace />} />
          <Route path="treasury" element={<Navigate to="/agence/caisse#caisse-tresorerie" replace />} />
          <Route path="treasury/new-operation" element={<AgencyTreasuryNewOperationPage />} />
          <Route path="treasury/transfer" element={<AgencyTreasuryTransferPage />} />
          <Route path="treasury/new-payable" element={<AgencyTreasuryNewPayablePage />} />
          <Route path="team" element={<ManagerTeamPage />} />
          <Route
            path="validation-departs"
            element={
              <ProtectedRoute allowedRoles={routePermissions.validationsAgence} withCurrency>
                <AgencyDepartureValidationsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="arrivees-attendues"
            element={
              <ProtectedRoute allowedRoles={routePermissions.validationsAgence} withCurrency>
                <AgencyExpectedArrivalsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="planification-trajets"
            element={
              <ProtectedRoute allowedRoles={routePermissions.tripPlanning} withCurrency>
                <TripPlanningPage />
              </ProtectedRoute>
            }
          />
          <Route path="reports" element={<ManagerReportsPage />} />
          <Route
            path="agent-history"
            element={
              <ProtectedRoute allowedRoles={routePermissions.agentHistory} withCurrency>
                <AgencyAgentHistoryPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="fleet"
            element={
              <ProtectedRoute allowedRoles={routePermissions.fleet} withCurrency>
                <Outlet />
              </ProtectedRoute>
            }
          >
            <Route index element={<FleetDashboardPage />} />
            <Route path="operations" element={<AgenceFleetOperationsPage />} />
            <Route path="assignment" element={<FleetAssignmentPage />} />
            <Route path="vehicles" element={<FleetVehiclesPage />} />
            <Route path="crew" element={<FleetCrewPage />} />
            <Route path="movements" element={<FleetMovementLogPage />} />
          </Route>
          <Route
            path="courrier"
            element={
              <ProtectedRoute allowedRoles={routePermissions.courrier} withCurrency>
                <CourierLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<CourierSessionPage />} />
            <Route path="session" element={<CourierSessionPage />} />
            <Route path="nouveau" element={<CourierCreateShipmentPage />} />
            <Route path="lots" element={<CourierBatchesPage />} />
            <Route path="reception" element={<Navigate to="/agence/courrier/arrivages" replace />} />
            <Route path="arrivages" element={<CourierReceptionPage />} />
            <Route path="remise" element={<CourierPickupPage />} />
            <Route path="rapport" element={<CourierReportsPage />} />
            <Route path="historique" element={<CourierHistoriquePage />} />
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
          <Route path="live" element={<BoardingLiveOpsPage />} />
          <Route path="scan" element={<BoardingScanPage />} />
        </Route>

        {/* ========= ESCALE (layout + tableau de bord, bus du jour, caisse) ========= */}
        <Route
          path="/agence/escale"
          element={
            <PrivateRoute allowedRoles={routePermissions.escaleDashboard}>
              <TenantGuard>
                <EscaleLayout />
              </TenantGuard>
            </PrivateRoute>
          }
        >
          <Route index element={<EscaleDashboardPage />} />
          <Route path="bus" element={<EscaleBusDuJourPage />} />
          <Route path="embarquement" element={<BoardingEscalePage />} />
          <Route path="manifeste" element={<BusPassengerManifestPage />} />
          <Route path="caisse" element={<EscaleCaissePage />} />
        </Route>
        <Route
          path="/agence/guichet"
          element={<ProtectedRoute allowedRoles={routePermissions.guichet} withCurrency><AgenceGuichetPage /></ProtectedRoute>}
        />
        <Route
          path="/agence/comptabilite/journal-agents"
          element={
            <TenantGuard>
              <ProtectedRoute allowedRoles={routePermissions.agentHistory} withCurrency>
                <AgencyAgentHistoryPage />
              </ProtectedRoute>
            </TenantGuard>
          }
        />
        <Route
          path="/agence/comptabilite"
          element={<ProtectedRoute allowedRoles={routePermissions.comptabilite} withCurrency><AgenceComptabilitePage /></ProtectedRoute>}
        />
        <Route
          path="/agence/comptabilite/treasury/new-operation"
          element={<ProtectedRoute allowedRoles={routePermissions.comptabiliteTreasury} withCurrency><AgencyTreasuryNewOperationPage /></ProtectedRoute>}
        />
        <Route
          path="/agence/comptabilite/treasury/transfer"
          element={<ProtectedRoute allowedRoles={routePermissions.comptabiliteTreasury} withCurrency><AgencyTreasuryTransferPage /></ProtectedRoute>}
        />
        <Route
          path="/agence/comptabilite/treasury/new-payable"
          element={<ProtectedRoute allowedRoles={routePermissions.comptabiliteTreasury} withCurrency><AgencyTreasuryNewPayablePage /></ProtectedRoute>}
        />
        <Route
          path="/agence/cash-sessions"
          element={<ProtectedRoute allowedRoles={routePermissions.cashControl} withCurrency><CashSessionsPage /></ProtectedRoute>}
        />

        <Route
          path="/agence/receipt/:id"
          element={<ProtectedRoute allowedRoles={routePermissions.receiptGuichet} withCurrency><ReceiptGuichetPage /></ProtectedRoute>}
        />
        <Route path="/agence/reservations/print" element={<ProtectedRoute allowedRoles={routePermissions.receiptGuichet} withCurrency><ReservationPrintPage /></ProtectedRoute>} />

        <Route
          path="/compagnie/:companyId/financial-settings"
          element={
            <PrivateRoute allowedRoles={["admin_compagnie", "company_accountant", "financial_director", "admin_platforme"] as const}>
              <TenantGuard>
                <FinancialSettingsPage />
              </TenantGuard>
            </PrivateRoute>
          }
        />

        {/* ========= DYNAMIQUES PUBLIQUES ========= */}
        <Route path="/:slug/reserver" element={<ReservationClientPage />} />
        <Route path="/:slug/reservation/:id" element={<ReservationDetailsPage />} />
        <Route path="/:slug/mon-billet" element={<ReservationDetailsPage />} />
        {/* /:slug/upload-preuve/:id is handled by RouteResolver (recovery + upload flow) */}
        <Route path="/mes-reservations" element={<ClientMesReservationsPage />} />
        <Route path="/mes-billets" element={<ClientMesBilletsPage />} />
        {/* /:slug/mes-reservations et /:slug/mes-billets passent par RouteResolver (bottom nav) */}
        <Route path="/:slug/*" element={<Suspense fallback={null}><RouteResolver /></Suspense>} />

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