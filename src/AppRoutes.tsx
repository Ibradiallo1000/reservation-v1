// ✅ src/AppRoutes.tsx
import { Suspense, lazy } from 'react';
import { Routes, Route } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import PrivateRoute from './pages/PrivateRoute';
import PageLoader from './components/PageLoaderComponent';
import RouteResolver from './pages/RouteResolver';
import MentionsPage from '@/pages/MentionsPage';
import ConfidentialitePage from '@/pages/ConfidentialitePage';
import ConditionsPage from '@/pages/ConditionsPage';
import CookiesPage from '@/pages/CookiesPage';
import AgenceEmbarquementPage from '@/pages/AgenceEmbarquementPage';
import ReservationPrintPage from '@/pages/ReservationPrintPage';
import UploadPreuvePage from '@/pages/UploadPreuvePage';
import ReservationDetailsPage from '@/pages/ReservationDetailsPage';
import AdminParametresPlatformPage from './pages/AdminParametresPlatformPage';

// Pages publiques
const HomePage = lazy(() => import('./pages/HomePage'));
const PlatformSearchResultsPage = lazy(() => import('./pages/PlatformSearchResultsPage'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const Register = lazy(() => import('./pages/Register'));
const ListeVillesPage = lazy(() => import('./pages/ListeVillesPage'));

// Admin plateforme
const AdminSidebarLayout = lazy(() => import('./pages/AdminSidebarLayout'));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));
const AdminCompagniesPage = lazy(() => import('./pages/AdminCompagniesPage'));
const AdminAjouterCompagnie = lazy(() => import('./pages/AdminAjouterCompagnie'));
const AdminModifierCompagniePage = lazy(() => import('./pages/AdminModifierCompagniePage'));
const AdminStatistiquesPage = lazy(() => import('./pages/AdminStatistiquesPage'));
const AdminReservationsPage = lazy(() => import('./pages/AdminReservationsPage'));
const AdminFinancesPage = lazy(() => import('./pages/AdminFinancesPage'));

// Compagnie privée
const CompagnieLayout = lazy(() => import('./components/layout/CompagnieLayout'));
const CompagnieDashboard = lazy(() => import('./pages/CompagnieDashboard'));
const CompagnieAgencesPage = lazy(() => import('./pages/CompagnieAgencesPage'));
const CompagniePersonnelPage = lazy(() => import('./pages/CompagniePersonnelPage'));
const CompagnieParametresTabsPage = lazy(() => import('./pages/CompagnieParametresTabsPage'));
const CompagnieReservationsPage = lazy(() => import('./pages/CompagnieReservationsPage'));
const CompagnieAgencesStatistiquesPage = lazy(() => import('./pages/CompagnieAgencesStatistiquesPage'));
const CompagnieVentesJournalieresPage = lazy(() => import('./pages/CompagnieVentesJournalieresPage'));
const CompagnieStatistiquesMensuellesPage = lazy(() => import('./pages/CompagnieStatistiquesMensuellesPage'));
const CompagnieFinancesTabsPage = lazy(() => import('./pages/CompagnieFinancesTabsPage'));
const BibliothequeImagesPage = lazy(() => import('./pages/BibliothequeImagesPage'));
const ReservationsEnLignePage = lazy(() => import('./pages/ReservationsEnLignePage'));
const CompanyPaymentSettingsPage = lazy(() => import('./pages/CompanyPaymentSettingsPage'));
const AvisModerationPage = lazy(() => import('./pages/AvisModerationPage'));

// Agence privée
import Sidebar from './components/layout/Sidebar';
const DashboardAgencePage = lazy(() => import('./pages/DashboardAgencePage'));
const AgenceReservationsPage = lazy(() => import('./pages/AgenceReservationsPage'));
const AgenceGuichetPage = lazy(() => import('./pages/AgenceGuichetPage'));
const AgenceTrajetsPage = lazy(() => import('./pages/AgenceTrajetsPage'));
const FormulaireEnvoiCourrier = lazy(() => import('./pages/FormulaireEnvoiCourrier'));
const AgenceFinancesPage = lazy(() => import('./pages/AgenceFinancesPage'));
const AgenceRecettesPage = lazy(() => import('./pages/AgenceRecettesPage'));
const AgencePersonnelPage = lazy(() => import('./pages/AgencePersonnelPage'));
const ReceiptGuichetPage = lazy(() => import('./pages/ReceiptGuichetPage'));
const MediaPage = lazy(() => import('./pages/MediaPage'));

const AppRoutes = () => {
  const { loading } = useAuth();
  if (loading) return <PageLoader fullScreen />;

  return (
    <Suspense fallback={<PageLoader fullScreen />}>
      <Routes>
        {/* Pages publiques globales */}
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<Register />} />
        <Route path="/resultats" element={<PlatformSearchResultsPage />} />
        <Route path="/villes" element={<ListeVillesPage />} />

        {/* Pages légales publiques */}
        <Route path="/:slug/mentions-legales" element={<MentionsPage />} />
        <Route path="/:slug/confidentialite" element={<ConfidentialitePage />} />
        <Route path="/:slug/conditions" element={<ConditionsPage />} />
        <Route path="/:slug/cookies" element={<CookiesPage />} />

        {/* Admin plateforme */}
        <Route
          path="/"
          element={
            <PrivateRoute allowedRoles={['admin_platforme']}>
              <AdminSidebarLayout />
            </PrivateRoute>
          }
        >
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

        {/* Compagnie privée */}
        <Route
          path="/compagnie"
          element={
            <PrivateRoute allowedRoles={['admin_compagnie']}>
              <CompagnieLayout />
            </PrivateRoute>
          }
        >
          <Route index element={<CompagnieDashboard />} />
          <Route path="dashboard" element={<CompagnieDashboard />} />
          <Route path="agences" element={<CompagnieAgencesPage />} />
          <Route path="personnel" element={<CompagniePersonnelPage />} />
          <Route path="parametres" element={<CompagnieParametresTabsPage />} />
          <Route path="reservations" element={<CompagnieReservationsPage />} />
          <Route path="reservations-en-ligne" element={<ReservationsEnLignePage />} />
          <Route path="statistiques-agences" element={<CompagnieAgencesStatistiquesPage />} />
          <Route path="ventes-journalieres" element={<CompagnieVentesJournalieresPage />} />
          <Route path="statistiques" element={<CompagnieStatistiquesMensuellesPage />} />
          <Route path="finances" element={<CompagnieFinancesTabsPage />} />
          <Route path="images" element={<BibliothequeImagesPage />} />
          <Route path="payment-settings" element={<CompanyPaymentSettingsPage />} />
          <Route path="avis-clients" element={<AvisModerationPage />} />
        </Route>

        {/* Agence */}
        <Route
          path="/agence"
          element={
            <PrivateRoute allowedRoles={['chefAgence', 'guichetier', 'superviseur', 'agentCourrier']}>
              <Sidebar />
            </PrivateRoute>
          }
        >
          <Route index element={<DashboardAgencePage />} />
          <Route path="dashboard" element={<DashboardAgencePage />} />
          <Route path="reservations" element={<AgenceReservationsPage />} />
          <Route path="guichet" element={<AgenceGuichetPage />} />
          <Route path="trajets" element={<AgenceTrajetsPage />} />
          <Route path="finances" element={<AgenceFinancesPage />} />
          <Route path="recettes" element={<AgenceRecettesPage />} />
          <Route path="personnel" element={<AgencePersonnelPage />} />
          <Route
            path="embarquement"
            element={
              <PrivateRoute allowedRoles={['chefAgence', 'guichetier', 'superviseur', 'admin_compagnie']}>
                <AgenceEmbarquementPage />
              </PrivateRoute>
            }
          />
        </Route>

        {/* Pages isolées */}
        <Route
          path="/agence/receipt/:id"
          element={
            <PrivateRoute allowedRoles={['chefAgence', 'guichetier']}>
              <ReceiptGuichetPage />
            </PrivateRoute>
          }
        />
        <Route path="/agence/reservations/print" element={<ReservationPrintPage />} />

        {/* Pages publiques dynamiques */}
        <Route path="/:slug/upload-preuve/:id" element={<UploadPreuvePage />} />
        <Route path="/:slug/reservation/:id" element={<ReservationDetailsPage />} />
        <Route path="/:slug/*" element={<RouteResolver />} />

        {/* 404 */}
        <Route
          path="*"
          element={
            <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-gray-100">
              <h1 className="text-4xl font-bold text-red-600 mb-4">404 - Page non trouvée</h1>
              <p className="text-lg text-gray-700 mb-6">
                La page demandée est introuvable ou a été déplacée.
              </p>
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
