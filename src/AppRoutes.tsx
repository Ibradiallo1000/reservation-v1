import { Suspense, lazy } from 'react';
import { Routes, Route } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import PrivateRoute from './pages/PrivateRoute';
import PageLoader from './components/PageLoaderComponent';

// Pages publiques
const HomePage = lazy(() => import('./pages/HomePage'));
const FormulaireReservationClient = lazy(() => import('./pages/FormulaireReservationClient'));
const ReceiptEnLignePage = lazy(() => import('./pages/ReceiptEnLignePage'));
const PlatformSearchResultsPage = lazy(() => import('./pages/PlatformSearchResultsPage'));
const MesReservationsPage = lazy(() => import('./pages/MesReservationsPage'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const Register = lazy(() => import('./pages/Register'));
const PublicCompanyPage = lazy(() => import('./pages/PublicCompanyPage'));
const ResultatsAgencePage = lazy(() => import('./pages/ResultatsAgencePage'));
const ReservationConfirmationPage = lazy(() => import('./pages/ReservationConfirmationPage'));
const ClientMesReservationsPage = lazy(() => import('./pages/ClientMesReservationsPage'));
const MentionsPage = lazy(() => import('./pages/MentionsPage'));
const ConfidentialitePage = lazy(() => import('./pages/ConfidentialitePage'));
const ListeVillesPage = lazy(() => import('./pages/ListeVillesPage'));

// Admin plateforme
const AdminSidebarLayout = lazy(() => import('./pages/AdminSidebarLayout'));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));

// Compagnie
const CompagnieLayout = lazy(() => import('./pages/CompagnieLayout'));
const CompagnieDashboard = lazy(() => import('./pages/CompagnieDashboard'));
const CompagnieAgencesPage = lazy(() => import('./pages/CompagnieAgencesPage'));
const CompagnieCourrierPage = lazy(() => import('./pages/CompagnieCourrierPage'));
const CompagniePersonnelPage = lazy(() => import('./pages/CompagniePersonnelPage'));
const CompagnieParametresTabsPage = lazy(() => import('./pages/CompagnieParametresTabsPage'));
const CompagnieReservationsPage = lazy(() => import('./pages/CompagnieReservationsPage'));
const CompagnieAgencesStatistiquesPage = lazy(() => import('./pages/CompagnieAgencesStatistiquesPage'));
const CompagnieVentesJournalieresPage = lazy(() => import('./pages/CompagnieVentesJournalieresPage'));
const CompagnieStatistiquesMensuellesPage = lazy(() => import('./pages/CompagnieStatistiquesMensuellesPage'));
const CompagnieFinancesTabsPage = lazy(() => import('./pages/CompagnieFinancesTabsPage'));
const BibliothequeImagesPage = lazy(() => import('./pages/BibliothequeImagesPage'));
const AutoGeneratePage = lazy(() => import('./pages/AutoGeneratePage'));

// Agence
const AgenceLayout = lazy(() => import('./pages/AgenceLayout'));
const DashboardAgencePage = lazy(() => import('./pages/DashboardAgencePage'));
const AgenceReservationPage = lazy(() => import('./pages/AgenceReservationsPage'));
const AgenceGuichetPage = lazy(() => import('./pages/AgenceGuichetPage'));
const AgenceTrajetsPage = lazy(() => import('./pages/AgenceTrajetsPage'));
const AgenceCourriersPage = lazy(() => import('./pages/AgenceCourriersPage'));
const FormulaireEnvoiCourrier = lazy(() => import('./pages/FormulaireEnvoiCourrier'));
const ReceptionCourrierPage = lazy(() => import('./pages/ReceptionCourrierPage'));
const AgenceFinancesPage = lazy(() => import('./pages/AgenceFinancesPage'));
const AgenceRecettesPage = lazy(() => import('./pages/AgenceRecettesPage'));
const AgenceDepensesPage = lazy(() => import('./pages/AgenceDepensesPage'));
const AgencePersonnelPage = lazy(() => import('./pages/AgencePersonnelPage'));
const ReceiptGuichetPage = lazy(() => import('./pages/ReceiptGuichetPage'));

const AppRoutes = () => {
  const { loading } = useAuth();
  if (loading) return <PageLoader fullScreen />;

  return (
    <Suspense fallback={<PageLoader fullScreen />}>
      <Routes>
        {/* Public */}
        <Route path="/" element={<HomePage />} />
        <Route path="/compagnie/:slug/receipt/:id" element={<ReceiptEnLignePage />} />
        <Route path="/compagnie/:slug/ticket/:id" element={<ReceiptEnLignePage />} />
        <Route path="/resultats" element={<PlatformSearchResultsPage />} />
        <Route path="/mes-reservations" element={<MesReservationsPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<Register />} />
        <Route path="/compagnie/:slug" element={<PublicCompanyPage />} />
        <Route path="/compagnie/:slug/resultats" element={<ResultatsAgencePage />} />
        <Route path="/compagnie/:slug/booking" element={<FormulaireReservationClient />} />
        <Route path="/reservation-confirmation/:id" element={<ReservationConfirmationPage />} />
        <Route path="/compagnie/:slug/mes-reservations" element={<ClientMesReservationsPage />} />
        <Route path="/compagnie/:slug/mentions" element={<MentionsPage />} />
        <Route path="/compagnie/:slug/confidentialite" element={<ConfidentialitePage />} />
        <Route path="/villes" element={<ListeVillesPage />} />

        {/* Admin plateforme */}
        <Route
          path="/admin"
          element={
            <PrivateRoute allowedRoles={["admin_platforme"]}>
              <AdminSidebarLayout />
            </PrivateRoute>
          }
        >
          <Route index element={<AdminDashboard />} />
          <Route path="dashboard" element={<AdminDashboard />} />
        </Route>

        {/* Compagnie */}
        <Route
          path="/compagnie"
          element={
            <PrivateRoute allowedRoles={["admin_compagnie"]}>
              <CompagnieLayout />
            </PrivateRoute>
          }
        >
          <Route index element={<CompagnieDashboard />} />
          <Route path="dashboard" element={<CompagnieDashboard />} />
          <Route path="agences" element={<CompagnieAgencesPage />} />
          <Route path="courriers" element={<CompagnieCourrierPage />} />
          <Route path="personnel" element={<CompagniePersonnelPage />} />
          <Route path="parametres" element={<CompagnieParametresTabsPage />} />
          <Route path="reservations" element={<CompagnieReservationsPage />} />
          <Route path="statistiques-agences" element={<CompagnieAgencesStatistiquesPage />} />
          <Route path="ventes-journalieres" element={<CompagnieVentesJournalieresPage />} />
          <Route path="statistiques" element={<CompagnieStatistiquesMensuellesPage />} />
          <Route path="finances" element={<CompagnieFinancesTabsPage />} />
          <Route path="images" element={<BibliothequeImagesPage />} />
          <Route path="auto-generate" element={<AutoGeneratePage />} />
        </Route>

        {/* Agence */}
        <Route
          path="/agence"
          element={
            <PrivateRoute allowedRoles={["chefAgence", "guichetier", "agentCourrier"]}>
              <AgenceLayout />
            </PrivateRoute>
          }
        >
          <Route index element={<DashboardAgencePage />} />
          <Route path="dashboard" element={<DashboardAgencePage />} />
          <Route path="reservations" element={<AgenceReservationPage />} />
          <Route path="guichet" element={<AgenceGuichetPage />} />
          <Route path="trajets" element={<AgenceTrajetsPage />} /> {/* ✅ */}
          <Route path="courriers" element={<AgenceCourriersPage />} />
          <Route path="courriers/envoi" element={<FormulaireEnvoiCourrier />} />
          <Route path="courriers/reception" element={<ReceptionCourrierPage />} />
          <Route path="finances" element={<AgenceFinancesPage />} />
          <Route path="recettes" element={<AgenceRecettesPage />} />
          <Route path="depenses" element={<AgenceDepensesPage />} />
          <Route path="personnel" element={<AgencePersonnelPage />} />
          <Route path="receipt/:id" element={<ReceiptGuichetPage />} />
        </Route>

        {/* 404 */}
        <Route
          path="*"
          element={
            <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-gray-100">
              <h1 className="text-4xl font-bold text-red-600 mb-4">404 - Page non trouvée</h1>
              <p className="text-lg text-gray-700 mb-6">
                La page demandée est introuvable ou a été déplacée.
              </p>
              <a href="/" className="bg-blue-600 text-white px-5 py-2 rounded hover:bg-blue-700">
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