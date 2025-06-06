// src/i18n.ts
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

i18n.use(initReactI18next).init({
  lng: 'fr',
  fallbackLng: 'fr',
  interpolation: {
    escapeValue: false,
  },
  resources: {
    fr: {
      translation: {
        searchTitle: "Réservez votre voyage en toute simplicité",
        welcome: "Bienvenue",
        // ajoute d'autres clés ici
      },
    },
    en: {
      translation: {
        searchTitle: "Book your trip easily",
        welcome: "Welcome",
      },
    },
  },
});

export default i18n;
