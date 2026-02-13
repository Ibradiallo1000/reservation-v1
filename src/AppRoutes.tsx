// src/AppRoutes.tsx (fichier corrigé)
import { Suspense, lazy } from "react";
import { Routes, Route, Navigate, useParams, useLocation } from "react-router-dom";
import { useAuth } from "./contexts/AuthContext";
import PrivateRoute from "./pages/PrivateRoute";
import PageLoader from "./components/PageLoaderComponent";
import RouteResolver from "./pages/RouteResolver";
import SplashScreen from "@/components/SplashScreen";
import AdminCompanyPlan from "@/modules/plateforme/pages/AdminCompanyPlan";
import PlansManager from "@/modules/plateforme/pages/PlansManager";
import { PageHeaderProvider } from "@/contexts/PageHeaderContext";
import MentionsPage from "@/pages/MentionsPage";
import ConfidentialitePage from "@/pages/ConfidentialitePage";
import ConditionsPage from "@/pages/ConditionsPage";
import CookiesPage from "@/pages/CookiesPage";
import AdminCompanyDetail from "@/modules/plateforme/pages/AdminCompanyDetail";
import AgenceEmbarquementPage from "@/pages/AgenceEmbarquementPage";
import ReservationPrintPage from "@/pages/ReservationPrintPage";
import ReservationDetailsPage from "@/pages/ReservationDetailsPage";
import AdminParametresPlatformPage from "./modules/plateforme/pages/AdminParametresPlatformPage";
import ValidationComptablePage from "@/pages/ValidationComptablePage";
import ValidationChefAgencePage from "@/pages/ValidationChefAgencePage";
import FinishSignIn from "@/pages/FinishSignIn";

// Import des pages Chef Comptable Compagnie depuis l'index
import ChefComptableCompagniePage from "./pages/ChefComptableCompagnie";
import {
  VueGlobale,
  ReservationsEnLigne,
  Finances,
  Rapports,
  Parametres
} from "@/modules/chef-comptable/pages";

const HomePage = lazy(() => import("./pages/HomePage"));
const PlatformSearchResultsPage = lazy(() => import("./pages/PlatformSearchResultsPage"));
const LoginPage = lazy(() => import("./pages/LoginPage"));
const Register = lazy(() => import("./pages/Register"));
const ListeVillesPage = lazy(() => import("./pages/ListeVillesPage"));
const AcceptInvitationPage = lazy(() => import("./pages/AcceptInvitationPage"));
const AgenceRapportsPage = lazy(() => import("./pages/AgenceRapportsPage"));

const ReservationClientPage = lazy(() => import("./pages/ReservationClientPage"));
const ClientMesReservationsPage = lazy(() => import("./pages/ClientMesReservationsPage"));

const AdminSidebarLayout = lazy(() => import("./pages/AdminSidebarLayout"));
const AdminDashboard = lazy(() => import("./modules/plateforme/pages/AdminDashboard"));
const AdminCompagniesPage = lazy(() => import("./modules/plateforme/pages/AdminCompagniesPage"));
const AdminModifierCompagniePage = lazy(() => import("./modules/plateforme/pages/AdminModifierCompagniePage"));
const AdminStatistiquesPage = lazy(() => import("./modules/plateforme//pages/AdminStatistiquesPage"));
const AdminReservationsPage = lazy(() => import("./modules/plateforme/pages/AdminReservationsPage"));
const AdminFinancesPage = lazy(() => import("./modules/plateforme//pages/AdminFinancesPage"));
const AdminCompagnieAjouterPage = lazy(() => import("./modules/plateforme/pages/AdminCompagnieAjouterPage"));

const CompagnieLayout = lazy(() => import("./components/layout/CompagnieLayout"));
const CompagnieDashboard = lazy(() => import("./modules/compagnie/pages/CompagnieDashboard"));
const CompagnieAgencesPage = lazy(() => import("./modules/compagnie/pages/CompagnieAgencesPage"));
const CompagnieParametresTabsPage = lazy(() => import("./modules/compagnie/pages/CompagnieParametresTabsPage"));
const CompagnieReservationsPage = lazy(() => import("./modules/compagnie/pages/CompagnieReservationsPage"));
const CompagnieComptabilitePage = lazy(() => import("./modules/compagnie/pages/CompagnieComptabilitePage"));
const BibliothequeImagesPage = lazy(() => import("./modules/compagnie/pages/BibliothequeImagesPage"));
const CompanyPaymentSettingsPage = lazy(() => import("./modules/compagnie/pages/CompanyPaymentSettingsPage"));
const AvisModerationPage = lazy(() => import("./modules/compagnie/pages/AvisModerationPage"));
const ParametresPlan = lazy(() => import("./modules/compagnie/components/parametres/ParametresPlan"));

const DashboardAgencePage = lazy(() => import("./pages/DashboardAgencePage"));
const AgenceReservationsPage = lazy(() => import("./pages/AgenceReservationsPage"));
const AgenceGuichetPage = lazy(() => import("./pages/AgenceGuichetPage"));
const AgenceTrajetsPage = lazy(() => import("./pages/AgenceTrajetsPage"));
const AgenceFinancesPage = lazy(() => import("./pages/AgenceFinancesPage"));
const AgenceRecettesPage = lazy(() => import("./pages/AgenceRecettesPage"));
const AgencePersonnelPage = lazy(() => import("./pages/AgencePersonnelPage"));
const ReceiptGuichetPage = lazy(() => import("./pages/ReceiptGuichetPage"));
const MediaPage = lazy(() => import("./modules/plateforme//pages/MediaPage"));
const AgenceShiftHistoryPage = lazy(() => import("./pages/AgenceShiftHistoryPage"));
const AgenceComptabilitePage = lazy(() => import("./pages/AgenceComptabilitePage"));
const AgenceShiftPage = lazy(() => import("./pages/AgenceShiftPage"));
const AffectationVehiculePage = lazy(() => import("./pages/AffectationVehiculePage"));
const AgenceShellPage = lazy(() => import("./pages/AgenceShellPage"));

export const routePermissions = {
  compagnieLayout: ["admin_compagnie"] as const,
  agenceShell: ["chefAgence", "superviseur", "agentCourrier", "admin_compagnie"] as const,
  guichet: ["guichetier", "chefAgence", "admin_compagnie"] as const,
  comptabilite: ["agency_accountant", "admin_compagnie"] as const,
  validationsCompta: ["company_accountant", "financial_director", "admin_platforme"] as const,
  validationsAgence: ["chefAgence", "superviseur", "admin_compagnie"] as const,
  receiptGuichet: ["chefAgence", "guichetier", "admin_compagnie"] as const,
  adminLayout: ["admin_platforme"] as const,
  chefComptableCompagnie: ["company_accountant", "financial_director", "admin_platforme"] as const,
};

const asArray = (x: unknown) => (Array.isArray(x) ? x : [x].filter(Boolean));
const hasAny = (roles: unknown, allowed: readonly string[]) =>
  asArray(roles).some((r) => allowed.includes(String(r)));

const landingTargetForRoles = (roles: unknown): string => {
  const rolesArray = asArray(roles).map(String);

  // ✅ ESPACE CHEF COMPTABLE COMPAGNIE
  if (hasAny(rolesArray, ["company_accountant", "financial_director"])) {
    return "/chef-comptable";
  }

  // ✅ ESPACE COMPTABILITÉ AGENCE
  if (hasAny(rolesArray, routePermissions.comptabilite)) {
    return "/agence/comptabilite";
  }

  // AGENCE
  if (hasAny(rolesArray, routePermissions.guichet)) {
    return "/agence/guichet";
  }

  if (hasAny(rolesArray, routePermissions.agenceShell)) {
    return "/agence/dashboard";
  }

  // COMPAGNIE (CEO)
  if (hasAny(rolesArray, routePermissions.compagnieLayout)) {
    return "/compagnie/dashboard";
  }

  // ADMIN PLATFORME
  if (hasAny(rolesArray, routePermissions.adminLayout)) {
    return "/admin/dashboard";
  }

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

function NavigateToCompagnieDashboard() {
  const { companyId } = useParams<{ companyId: string }>();
  return <Navigate to={`/compagnie/${companyId}/dashboard`} replace />;
}
/* =========================
   DebugAuthPage Component
========================= */
const DebugAuthPage = () => {
  const { user, loading, company } = useAuth() as any;
  
  return (
    <div className="min-h-screen p-6 bg-gray-50">
      <h1 className="text-2xl font-bold mb-6 text-gray-800">🔍 Debug Auth - Diagnostics</h1>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* User Info Card */}
        <div className="bg-white p-6 rounded-lg shadow-md border">
          <h2 className="text-lg font-semibold mb-4 text-blue-700">👤 Informations Utilisateur</h2>
          <div className="space-y-3">
            <div>
              <strong className="text-gray-700">État du chargement:</strong> 
              <span className={`ml-2 px-2 py-1 rounded text-sm ${loading ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'}`}>
                {loading ? "En cours..." : "Terminé"}
              </span>
            </div>
            <div>
              <strong className="text-gray-700">Utilisateur connecté:</strong> 
              <span className={`ml-2 px-2 py-1 rounded text-sm ${user ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                {user ? "Oui" : "Non"}
              </span>
            </div>
            {user && (
              <>
                <div>
                  <strong className="text-gray-700">Email:</strong> 
                  <span className="ml-2 text-gray-900">{user.email}</span>
                </div>
                <div>
                  <strong className="text-gray-700">Nom:</strong> 
                  <span className="ml-2 text-gray-900">{user.nom || "Non défini"}</span>
                </div>
                <div>
                  <strong className="text-gray-700">Rôle (brut):</strong> 
                  <code className="ml-2 px-2 py-1 bg-gray-100 rounded text-sm font-mono">{user.role || "Non défini"}</code>
                </div>
                <div>
                  <strong className="text-gray-700">ID Compagnie:</strong> 
                  <code className="ml-2 px-2 py-1 bg-gray-100 rounded text-sm font-mono">{user.companyId || "Non défini"}</code>
                </div>
                <div>
                  <strong className="text-gray-700">ID Agence:</strong> 
                  <code className="ml-2 px-2 py-1 bg-gray-100 rounded text-sm font-mono">{user.agencyId || "Non défini"}</code>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Company Info Card */}
        <div className="bg-white p-6 rounded-lg shadow-md border">
          <h2 className="text-lg font-semibold mb-4 text-green-700">🏢 Informations Compagnie</h2>
          <div className="space-y-3">
            {company ? (
              <>
                <div>
                  <strong className="text-gray-700">Nom Compagnie:</strong> 
                  <span className="ml-2 text-gray-900">{company.nom || "Non défini"}</span>
                </div>
                <div>
                  <strong className="text-gray-700">ID:</strong> 
                  <code className="ml-2 px-2 py-1 bg-gray-100 rounded text-sm font-mono">{company.id}</code>
                </div>
                <div>
                  <strong className="text-gray-700">Slug:</strong> 
                  <code className="ml-2 px-2 py-1 bg-gray-100 rounded text-sm font-mono">{company.slug || "Non défini"}</code>
                </div>
                <div>
                  <strong className="text-gray-700">Plan:</strong> 
                  <span className="ml-2 px-2 py-1 bg-purple-100 text-purple-800 rounded text-sm">{company.plan || "Non défini"}</span>
                </div>
              </>
            ) : (
              <div className="text-gray-500 italic">
                {user?.companyId ? "Chargement de la compagnie..." : "Aucune compagnie associée"}
              </div>
            )}
          </div>
        </div>

        {/* Testing Card */}
        <div className="lg:col-span-2 bg-white p-6 rounded-lg shadow-md border">
          <h2 className="text-lg font-semibold mb-4 text-red-700">🧪 Tests de Navigation</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <a href="/chef-comptable" className="block p-4 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition text-center">
              <div className="font-medium text-blue-800">/chef-comptable</div>
              <div className="text-sm text-blue-600 mt-1">Espace Chef Comptable Compagnie</div>
              <div className="text-xs text-blue-500 mt-2">Rôles: company_accountant, financial_director</div>
            </a>
            <a href="/agence/comptabilite" className="block p-4 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100 transition text-center">
              <div className="font-medium text-green-800">/agence/comptabilite</div>
              <div className="text-sm text-green-600 mt-1">Espace Comptable Agence</div>
              <div className="text-xs text-green-500 mt-2">Rôle: agency_accountant</div>
            </a>
            <a href="/compagnie/dashboard" className="block p-4 bg-purple-50 border border-purple-200 rounded-lg hover:bg-purple-100 transition text-center">
              <div className="font-medium text-purple-800">/compagnie/dashboard</div>
              <div className="text-sm text-purple-600 mt-1">Espace CEO Compagnie</div>
              <div className="text-xs text-purple-500 mt-2">Rôle: admin_compagnie</div>
            </a>
            <a href="/admin/dashboard" className="block p-4 bg-orange-50 border border-orange-200 rounded-lg hover:bg-orange-100 transition text-center">
              <div className="font-medium text-orange-800">/admin/dashboard</div>
              <div className="text-sm text-orange-600 mt-1">Espace Admin Plateforme</div>
              <div className="text-xs text-orange-500 mt-2">Rôle: admin_platforme</div>
            </a>
          </div>
        </div>

        {/* Raw Data Card */}
        <div className="lg:col-span-2 bg-white p-6 rounded-lg shadow-md border">
          <h2 className="text-lg font-semibold mb-4 text-gray-700">📊 Données Brutes (JSON)</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div>
              <h3 className="font-medium mb-2 text-gray-600">Utilisateur:</h3>
              <pre className="bg-gray-100 p-3 rounded text-xs overflow-auto max-h-60">
                {JSON.stringify(user, null, 2) || "Aucun utilisateur"}
              </pre>
            </div>
            <div>
              <h3 className="font-medium mb-2 text-gray-600">Compagnie:</h3>
              <pre className="bg-gray-100 p-3 rounded text-xs overflow-auto max-h-60">
                {JSON.stringify(company, null, 2) || "Aucune compagnie"}
              </pre>
            </div>
          </div>
        </div>
      </div>

      {/* Instructions */}
      <div className="mt-8 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
        <h3 className="font-semibold text-yellow-800 mb-2">📝 Instructions de débogage:</h3>
        <ul className="list-disc pl-5 text-yellow-700 space-y-1">
          <li>Ouvrez la console du navigateur (F12) pour voir les logs détaillés</li>
          <li>Vérifiez que le rôle de l'utilisateur dans Firestore correspond à ceux autorisés</li>
          <li>Testez les différents liens de navigation pour voir où vous êtes redirigé</li>
          <li>Si bloqué, vérifiez les logs de PrivateRoute dans la console</li>
        </ul>
      </div>
    </div>
  );
};

const AppRoutes = () => {
  const { loading } = useAuth();
  const { pathname } = useLocation();
  const isHome = pathname === "/";

  if (loading && !isHome) return <PageLoader fullScreen />;

  return (
    <Suspense fallback={isHome ? null : <PageLoader fullScreen />}>
      <Routes key={pathname}>
        {/* Route de debug - accessible à tous */}
        <Route path="/debug-auth" element={<DebugAuthPage />} />

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
        <Route path="/finishSignIn" element={<FinishSignIn />} />
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
            <PrivateRoute allowedRoles={["admin_platforme"] as const}>
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

        {/* ========= COMPAGNIE (CEO + ADMIN PLATFORME) ========= */}
        <Route
          path="/compagnie/:companyId"
          element={
            <PrivateRoute allowedRoles={["admin_compagnie", "admin_platforme"] as const}>
              <CompagnieLayout />
            </PrivateRoute>
          }
        >
          <Route index element={<RoleLanding />} />
          <Route path="dashboard" element={<CompagnieDashboard />} />
          <Route path="comptabilite" element={<CompagnieComptabilitePage />} />
          <Route path="agences" element={<CompagnieAgencesPage />} />
          <Route path="parametres" element={<CompagnieParametresTabsPage />} />
          <Route path="parametres/plan" element={<ParametresPlan companyId={""} />} />
          <Route path="reservations" element={<CompagnieReservationsPage />} />
          {/* Redirection vers l'espace chef comptable */}
          <Route 
            path="reservations-en-ligne" 
            element={<Navigate to="/chef-comptable/reservations-en-ligne" replace />} 
          />
          <Route path="images" element={<BibliothequeImagesPage />} />
          <Route path="payment-settings" element={<CompanyPaymentSettingsPage />} />
          <Route path="avis-clients" element={<AvisModerationPage />} />
        </Route>

        {/* ========= CHEF COMPTABLE COMPAGNIE ========= */}
        <Route
          path="/chef-comptable"
          element={
            <PrivateRoute allowedRoles={routePermissions.chefComptableCompagnie}>
              <ChefComptableCompagniePage />
            </PrivateRoute>
          }
        >
          {/* Page d'accueil */}
          <Route index element={<VueGlobale />} />
          
          {/* Réservations en ligne (VALIDATION / REFUS) */}
          <Route path="reservations-en-ligne" element={<ReservationsEnLigne />} />
          
          {/* Finances compagnie */}
          <Route path="finances" element={<Finances />} />
          
          {/* Rapports */}
          <Route path="rapports" element={<Rapports />} />
          
          {/* Paramètres comptables */}
          <Route path="parametres" element={<Parametres />} />
        </Route>

        {/* ========= AGENCE ========= */}
        <Route
          path="/agence"
          element={
            <PrivateRoute allowedRoles={["chefAgence", "embarquement"] as const}>
              <AgenceShellPage />
            </PrivateRoute>
          }
        >
          <Route index element={<RoleLanding />} />
          <Route path="dashboard" element={<DashboardAgencePage />} />
          <Route path="reservations" element={<AgenceReservationsPage />} />
          <Route path="embarquement" element={<AgenceEmbarquementPage />} />
          <Route path="trajets" element={<AgenceTrajetsPage />} />
          <Route path="garage" element={<AffectationVehiculePage />} />
          <Route path="recettes" element={<AgenceRecettesPage />} />
          <Route path="finances" element={<AgenceFinancesPage />} />
          <Route path="personnel" element={<AgencePersonnelPage />} />
          <Route path="shift" element={<AgenceShiftPage />} />
          <Route path="shift-history" element={<AgenceShiftHistoryPage />} />
          <Route path="rapports" element={<AgenceRapportsPage />} />
        </Route>

        {/* ========= PAGES HORS SHELL AGENCE ========= */}
        {/* Guichet */}
        <Route
          path="/agence/guichet"
          element={
            <PrivateRoute allowedRoles={["guichetier", "chefAgence", "admin_compagnie"] as const}>
              <AgenceGuichetPage />
            </PrivateRoute>
          }
        />
        
        {/* Comptabilité Agence */}
        <Route
          path="/agence/comptabilite"
          element={
            <PrivateRoute allowedRoles={["agency_accountant", "admin_compagnie"] as const}>
              <AgenceComptabilitePage />
            </PrivateRoute>
          }
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
        
        {/* Validations chef agence */}
        <Route
          path="/agence/validations"
          element={
            <PrivateRoute allowedRoles={["chefAgence", "admin_compagnie"] as const}>
              <ValidationChefAgencePage />
            </PrivateRoute>
          }
        />

        {/* ========= PAGES ISOLÉES ========= */}
        {/* Reçu guichet */}
        <Route
          path="/agence/receipt/:id"
          element={
            <PrivateRoute allowedRoles={["chefAgence", "guichetier", "admin_compagnie"] as const}>
              <ReceiptGuichetPage />
            </PrivateRoute>
          }
        />
        
        <Route path="/agence/reservations/print" element={<ReservationPrintPage />} />

        {/* ========= DYNAMIQUES PUBLIQUES ========= */}
        <Route path="/:slug/reserver" element={<ReservationClientPage />} />
        <Route path="/:slug/reservation/:id" element={<ReservationDetailsPage />} />
        <Route path="/:slug/mon-billet" element={<ReservationDetailsPage />} />
        <Route path="/:slug/upload-preuve/:id" element={<LegacyUploadRedirect />} />
        <Route path="/mes-reservations" element={<ClientMesReservationsPage />} />
        <Route path="/:slug/mes-reservations" element={<ClientMesReservationsPage />} />
        <Route path="/:slug/*" element={<RouteResolver />} />

        {/* ========= REDIRECTIONS DE COMPATIBILITÉ ========= */}
        {/* Rediriger l'ancienne route /comptable vers /chef-comptable */}
        <Route path="/comptable" element={<Navigate to="/chef-comptable" replace />} />
        
        {/* Rediriger l'ancienne route réservations en ligne vers le nouvel espace */}
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