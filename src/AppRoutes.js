import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Routes, Route } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import PrivateRoute from './pages/PrivateRoute';
import PageLoader from './components/PageLoaderComponent';
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
import CompagnieTrajets from './pages/AgenceTrajetsPage';
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
    if (loading)
        return _jsx(PageLoader, { fullScreen: true });
    return (_jsxs(Routes, { children: [_jsx(Route, { path: "/", element: _jsx(HomePage, {}) }), _jsx(Route, { path: "/booking", element: _jsx(FormulaireReservationClient, {}) }), _jsx(Route, { path: "/compagnie/:slug/receipt/:id", element: _jsx(ReceiptEnLignePage, {}) }), _jsx(Route, { path: "/compagnie/:slug/ticket/:id", element: _jsx(ReceiptEnLignePage, {}) }), _jsx(Route, { path: "/resultats", element: _jsx(PlatformSearchResultsPage, {}) }), _jsx(Route, { path: "/mes-reservations", element: _jsx(MesReservationsPage, {}) }), _jsx(Route, { path: "/login", element: _jsx(LoginPage, {}) }), _jsx(Route, { path: "/register", element: _jsx(Register, {}) }), _jsx(Route, { path: "/compagnie/:slug", element: _jsx(PublicCompanyPage, {}) }), _jsx(Route, { path: "/compagnie/:slug/resultats", element: _jsx(ResultatsAgencePage, {}) }), _jsx(Route, { path: "/compagnie/:slug/booking", element: _jsx(FormulaireReservationClient, {}) }), _jsx(Route, { path: "/reservation-confirmation/:id", element: _jsx(ReservationConfirmationPage, {}) }), _jsx(Route, { path: "/compagnie/:slug/mes-reservations", element: _jsx(ClientMesReservationsPage, {}) }), _jsx(Route, { path: "/compagnie/:slug/mentions", element: _jsx(MentionsPage, {}) }), _jsx(Route, { path: "/compagnie/:slug/confidentialite", element: _jsx(ConfidentialitePage, {}) }), _jsx(Route, { path: "/villes", element: _jsx(ListeVillesPage, {}) }), _jsx(Route, { path: "/admin", element: _jsx(PrivateRoute, { allowedRoles: ["admin_platforme"], children: _jsx(AdminSidebarLayout, {}) }), children: _jsx(Route, { path: "dashboard", element: _jsx(AdminDashboard, {}) }) }), _jsxs(Route, { path: "/compagnie", element: _jsx(PrivateRoute, { allowedRoles: ["admin_compagnie"], children: _jsx(CompagnieLayout, {}) }), children: [_jsx(Route, { path: "dashboard", element: _jsx(CompagnieDashboard, {}) }), _jsx(Route, { path: "agences", element: _jsx(CompagnieAgencesPage, {}) }), _jsx(Route, { path: "trajets", element: _jsx(CompagnieTrajets, {}) }), _jsx(Route, { path: "courriers", element: _jsx(CompagnieCourrierPage, {}) }), _jsx(Route, { path: "personnel", element: _jsx(CompagniePersonnelPage, {}) }), _jsx(Route, { path: "parametres", element: _jsx(CompagnieParametresTabsPage, {}) }), _jsx(Route, { path: "reservations", element: _jsx(CompagnieReservationsPage, {}) }), _jsx(Route, { path: "statistiques-agences", element: _jsx(CompagnieAgencesStatistiquesPage, {}) }), _jsx(Route, { path: "ventes-journalieres", element: _jsx(CompagnieVentesJournalieresPage, {}) }), _jsx(Route, { path: "statistiques", element: _jsx(CompagnieStatistiquesMensuellesPage, {}) }), _jsx(Route, { path: "finances", element: _jsx(CompagnieFinancesTabsPage, {}) }), _jsx(Route, { path: "images", element: _jsx(BibliothequeImagesPage, {}) }), _jsx(Route, { path: "auto-generate", element: _jsx(AutoGeneratePage, {}) })] }), _jsxs(Route, { path: "/agence", element: _jsx(PrivateRoute, { allowedRoles: ["chefAgence", "guichetier", "agentCourrier"], children: _jsx(AgenceLayout, {}) }), children: [_jsx(Route, { path: "dashboard", element: _jsx(DashboardAgencePage, {}) }), _jsx(Route, { path: "reservations", element: _jsx(AgenceReservationPage, {}) }), _jsx(Route, { path: "guichet", element: _jsx(AgenceGuichetPage, {}) }), _jsx(Route, { path: "ajouter-trajet", element: _jsx(AgenceTrajetsPage, {}) }), _jsx(Route, { path: "courriers", element: _jsx(AgenceCourriersPage, {}) }), _jsx(Route, { path: "courriers/envoi", element: _jsx(FormulaireEnvoiCourrier, {}) }), _jsx(Route, { path: "courriers/reception", element: _jsx(ReceptionCourrierPage, {}) }), _jsx(Route, { path: "finances", element: _jsx(AgenceFinancesPage, {}) }), _jsx(Route, { path: "recettes", element: _jsx(AgenceRecettesPage, {}) }), _jsx(Route, { path: "depenses", element: _jsx(AgenceDepensesPage, {}) }), _jsx(Route, { path: "personnel", element: _jsx(AgencePersonnelPage, {}) }), _jsx(Route, { path: "receipt/:id", element: _jsx(ReceiptGuichetPage, {}) })] }), _jsx(Route, { path: "*", element: _jsx("div", { children: "404 - Page non trouv\u00E9e" }) })] }));
};
export default AppRoutes;
