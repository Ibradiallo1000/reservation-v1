// src/i18n.ts
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

i18n
  .use(LanguageDetector) // détecte automatiquement la langue
  .use(initReactI18next) // connecte i18n à React
  .init({
    fallbackLng: 'fr', // langue par défaut
    debug: false,

    interpolation: {
      escapeValue: false // React gère déjà l'échappement
    },

    resources: {
      fr: {
        translation: {
          searchTitle: 'Trouvez votre trajet',
          departureCity: 'Ville de départ',
          arrivalCity: 'Ville d’arrivée',
          searchTrip: 'Rechercher',
          departurePlaceholder: 'Ex: Bamako',
          arrivalPlaceholder: 'Ex: Abidjan',
          companyNotFound: 'Compagnie introuvable.',
          loadingError: 'Erreur de chargement.',
          invalidCity: 'Veuillez entrer des villes valides.',
          error: 'Erreur',
          backToHome: 'Retour à l’accueil',
          ourAgencies: 'Nos agences',
          myBookings: 'Mes réservations',
          contact: 'Contact',
          login: 'Connexion',
          about: 'À propos',
          welcomeTransport: 'Bienvenue sur notre plateforme de transport.',
          followUs: 'Suivez-nous',
          customerReviews: 'Avis clients',
          phone: 'Téléphone',
          country: 'Pays',
          district: 'Quartier',
          address: 'Adresse',
          notSpecified: 'Non spécifiée',
          close: 'Fermer',
          legalMentions: 'Mentions légales',
          privacyPolicy: 'Politique de confidentialité',
          ourCompany: 'Notre compagnie',
          allRightsReserved: 'Tous droits réservés'
        }
      }
      // Tu peux ajouter d'autres langues ici si nécessaire
    }
  });

export default i18n;
