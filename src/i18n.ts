// src/i18n.ts
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: 'fr',
    debug: false,
    interpolation: {
      escapeValue: false
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
          allRightsReserved: 'Tous droits réservés',
          defaultSlogan: 'Votre monde, plus rapide. Plus simple.',
          searchInstruction: 'Où souhaitez-vous partir aujourd’hui ?',
          giveReview: 'Donner votre avis',
          openingHours: 'Horaires',
          legalTerms: 'Conditions générales',
          cookiePolicy: 'Politique des cookies',
          notFound: 'Page introuvable.',
          backToCompany: 'Retour à la compagnie',
          language: 'Langue',
          exclusiveServices: 'Nos services exclusifs',
          popularDestinations: 'Destinations populaires',
          bookNow: 'Réserver',
          seeMore: 'Voir plus',
          bookInOneClick: 'Réservez vos trajets en un seul clic',
          whatClientsSay: 'Ce que nos clients disent',
          realExperiences: 'Les expériences authentiques de nos voyageurs'
        }
      },
      en: {
        translation: {
          searchTitle: 'Find your trip',
          departureCity: 'Departure city',
          arrivalCity: 'Arrival city',
          searchTrip: 'Search',
          departurePlaceholder: 'Ex: Bamako',
          arrivalPlaceholder: 'Ex: Abidjan',
          companyNotFound: 'Company not found.',
          loadingError: 'Loading error.',
          invalidCity: 'Please enter valid cities.',
          error: 'Error',
          backToHome: 'Back to home',
          ourAgencies: 'Our agencies',
          myBookings: 'My bookings',
          contact: 'Contact',
          login: 'Login',
          about: 'About',
          welcomeTransport: 'Welcome to our transport platform.',
          followUs: 'Follow us',
          customerReviews: 'Customer reviews',
          phone: 'Phone',
          country: 'Country',
          district: 'District',
          address: 'Address',
          notSpecified: 'Not specified',
          close: 'Close',
          legalMentions: 'Legal mentions',
          privacyPolicy: 'Privacy policy',
          ourCompany: 'Our company',
          allRightsReserved: 'All rights reserved',
          defaultSlogan: 'Your world, faster. Simpler.',
          searchInstruction: 'Where do you want to go today?',
          giveReview: 'Give your review',
          openingHours: 'Opening hours',
          legalTerms: 'Terms and Conditions',
          cookiePolicy: 'Cookie Policy',
          notFound: 'Page not found.',
          backToCompany: 'Back to company',
          language: 'Language',
          exclusiveServices: 'Our exclusive services',
          popularDestinations: 'Popular destinations',
          bookNow: 'Book now',
          seeMore: 'See more',
          bookInOneClick: 'Book your trip in one click',
          whatClientsSay: 'What our clients say',
          realExperiences: 'Real experiences from our travelers'
        }
      }
    }
  });

export default i18n;
