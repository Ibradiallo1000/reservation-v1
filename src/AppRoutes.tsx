import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import PrivateRoute from './pages/PrivateRoute';

// Pages publiques
import HomePage from './pages/HomePage';
import FormulaireReservationClient from './pages/FormulaireReservationClient';
import ReceiptGuichetPage from './pages/ReceiptGuichetPage';
import ReceiptEnLignePage from './pages/ReceiptEnLignePage';
import PlatformSearchResultsPage from './pages/PlatformSearchResultsPage';
import MesReservationsPage from './pages/MesReservationsPage';
import LoginPage from './pages/LoginPage';
import Register from './pages/Register';
import PublicCompanyPage from './pages/PublicCompanyPage';
import ResultatsAgencePage from './pages/ResultatsAgencePage';
import ClientMesReservationsPage from './pages/ClientMesReservationsPage';
import ReservationConfirmationPage from './pages/ReservationConfirmationPage';
import MentionsPage from './pages/MentionsPage';
import ConfidentialitePage from './pages/ConfidentialitePage';
import ListeVillesPage from './pages/ListeVillesPage';

// Admin plateforme
import AdminSidebarLayout from './pages/AdminSidebarLayout';
import AdminDashboard from './pages/AdminDashboard';

// Compagnie
import CompagnieLayout from './pages/CompagnieLayout';
import CompagnieDashboard from './pages/CompagnieDashboard';
import CompagnieCourrierPage from './pages/CompagnieCourrierPage';
import CompagniePersonnelPage from './pages/CompagniePersonnelPage';
import CompagnieParametresTabsPage from './pages/CompagnieParametresTabsPage';
import CompagnieAgencesPage from './pages/CompagnieAgencesPage';
import CompagnieReservationsPage from './pages/CompagnieReservationsPage';
import CompagnieAgencesStatistiquesPage from './pages/CompagnieAgencesStatistiquesPage';
import CompagnieVentesJournalieresPage from './pages/CompagnieVentesJournalieresPage';
import CompagnieStatistiquesMensuellesPage from './pages/CompagnieStatistiquesMensuellesPage';
import CompagnieFinancesTabsPage from './pages/CompagnieFinancesTabsPage';
import BibliothequeImagesPage from './pages/BibliothequeImagesPage';
import AutoGeneratePage from './pages/AutoGeneratePage';

// Agence
import AgenceLayout from './pages/AgenceLayout';
import DashboardAgencePage from './pages/DashboardAgencePage';
import AgenceReservationPage from './pages/AgenceReservationsPage';
import AgenceGuichetPage from './pages/AgenceGuichetPage';
import AgenceTrajetsPage from './pages/AgenceTrajetsPage';
import AgenceCourriersPage from './pages/AgenceCourriersPage';
import FormulaireEnvoiCourrier from './pages/FormulaireEnvoiCourrier';
import ReceptionCourrierPage from './pages/ReceptionCourrierPage';
import AgenceFinancesPage from './pages/AgenceFinancesPage';
import AgenceRecettesPage from './pages/AgenceRecettesPage';
import AgenceDepensesPage from './pages/AgenceDepensesPage';
import AgencePersonnelPage from './pages/AgencePersonnelPage';

const AppRoutes = () => {
  const { loading } = useAuth();

  if (loading) return <div>Chargement...</div>;

  return (
    <Routes>
      {/* PUBLIC */}
      <Route path="/" element={<HomePage />} />
      <Route path="/booking" element={<FormulaireReservationClient />} />
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

      {/* ADMIN PLATFORME */}
      <Route
        path="/admin"
        element={
          <PrivateRoute allowedRoles={["admin_platforme"]}>
            <AdminSidebarLayout />
          </PrivateRoute>
        }
      >
        <Route path="dashboard" element={<AdminDashboard />} />
        {/* Ajoute d'autres sous-routes ici si besoin */}
      </Route>

      {/* COMPAGNIE */}
      <Route
        path="/compagnie"
        element={
          <PrivateRoute allowedRoles={["admin_compagnie"]}>
            <CompagnieLayout />
          </PrivateRoute>
        }
      >
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

      {/* AGENCE */}
      <Route
        path="/agence"
        element={
          <PrivateRoute allowedRoles={["chefAgence", "guichetier", "agentCourrier"]}>
            <AgenceLayout />
          </PrivateRoute>
        }
      >
        <Route path="dashboard" element={<DashboardAgencePage />} />
        <Route path="reservations" element={<AgenceReservationPage />} />
        <Route path="guichet" element={<AgenceGuichetPage />} />
        <Route path="trajets" element={<AgenceTrajetsPage />} /> {/* ✅ corrigé ici */}
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
      <Route path="*" element={<div>404 - Page non trouvée</div>} />
    </Routes>
  );
};

export default AppRoutes;
