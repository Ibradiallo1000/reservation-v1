# Phase 5 — Notes de migration

## Comportement

- **CEO** : à la connexion, redirection vers `/compagnie/:companyId/command-center` (au lieu de dashboard). Le menu compagnie est réordonné (Centre de commande en premier, puis Finances, Flotte, etc.).
- **company_accountant** : peut accéder au layout compagnie ; redirection recommandée vers `/compagnie/:companyId/finances`. Lecture seule sur les données consolidées ; aucune validation de session depuis cet espace.
- **Agrégats** : les prochaines écritures dans dailyStats et agencyLiveState incluront `companyId` et `agencyId`. Les documents déjà présents sans ces champs ne sont pas modifiés ; le centre de commande utilise un repli (chargement par agence) si la requête collectionGroup échoue (index manquant ou champs absents).

## Index Firestore

- Créer les index **collection group** documentés dans `docs/PHASE_4.5_FIRESTORE_INDEXES.md` (section Phase 5) pour que le centre de commande utilise une seule requête par type d’agrégat :
  - `dailyStats` : companyId, date
  - `agencyLiveState` : companyId

## Rôles

- Modèle final pris en charge : admin_compagnie, company_accountant, chefAgence (agency manager), agency_accountant, guichetier (agency cashier), agency_boarding_officer, agency_fleet_controller. Aucun changement de règle Firestore pour company_accountant (lecture déjà autorisée par isAuth(), pas de droit de validation).

## Déploiement

1. Déployer le code (build + hébergement).
2. Déployer les règles Firestore si des changements ont été faits (aucune règle nouvelle obligatoire pour Phase 5).
3. Créer les index collection group si souhaité pour le centre de commande.
