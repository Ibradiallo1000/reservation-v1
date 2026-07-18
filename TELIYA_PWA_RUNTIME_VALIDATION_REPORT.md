# Validation PWA runtime

La configuration utilise `generateSW`, `autoUpdate`, `skipWaiting`, `clientsClaim` et un précache statique JS/CSS/HTML/images. Aucune règle `runtimeCaching` n’est définie : les réponses Firestore/Auth/Storage et les écritures réservation/paiement ne sont donc pas ajoutées à un cache runtime Workbox par cette configuration.

La build génère le manifest et le service worker, mais installation, icônes, splash, mise à jour, start URL, offline prévu, retour en ligne et domaines tenant n’ont pas été testés dans un navigateur. Risque restant : le shell HTML/JS précaché et l’activation immédiate doivent être testés pendant un booking en cours; aucune donnée sensible ne doit être ajoutée au cache.
