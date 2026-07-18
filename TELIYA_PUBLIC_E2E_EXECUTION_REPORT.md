# Exécution E2E publique

Statut : **non exécutée**. Les specs Playwright existent, mais `@playwright/test` n’est ni dépendance installée ni dépendance déclarée. La configuration lance `npm run dev`, lequel charge actuellement le projet production local et est correctement bloqué par la garde de sécurité.

Les tests existants contiennent en outre un slug et des passagers fictifs et peuvent déclencher une réservation si des données répondent : ils ne doivent pas être lancés contre staging sans isolation/validation. Aucun paiement réel n’a été automatisé.

À reprendre avec une dépendance Playwright verrouillée, `build:staging` + preview, des fixtures autorisées ou des mocks, puis scénarios Marketplace, comparaison, tenant direct, refresh booking, erreurs et routes simulées. Marketplace réelle, autocomplete, départs, réservation, paiement, confirmation, reçu, billet, QR et suivi restent non validés.
