# Audit stratégique complet — Teliya

*Document d’analyse business et stratégique (pas une description technique).*

---

## 1. INVENTAIRE COMPLET DES FONCTIONNALITÉS

### 1.1 Public (non authentifié)

| Fonctionnalité | Rôle réel |
|----------------|-----------|
| **Accueil (Home)** | Vitrine, recherche de trajets par ville/destination, entrée vers réservation. |
| **Résultats recherche** | Liste des trajets/compagnies correspondant aux critères. |
| **Réservation client** (`/:slug/reserver`) | Prise de billet en ligne (trajet, places, paiement). |
| **Détail réservation** (`/:slug/reservation/:id`, mon-billet) | Consultation billet, preuve de paiement. |
| **Mes réservations** | Historique des réservations du client (multi-compagnie). |
| **Mentions, Confidentialité, Conditions, Cookies** | Conformité légale et RGPD. |
| **Acceptation invitation** | Onboarding utilisateur invité (lien email). |
| **Liste des villes** | Référentiel villes pour la recherche. |

---

### 1.2 Admin plateforme (admin_platforme)

| Fonctionnalité | Rôle réel |
|----------------|-----------|
| **Dashboard admin** | Vue d’ensemble plateforme (compagnies, activité). |
| **Compagnies** | CRUD compagnies, liste, ajout, modification. |
| **Plan / abonnement** | Gestion plan par compagnie. |
| **Plans manager** | Catalogue des offres. |
| **Subscriptions** | Gestion des abonnements. |
| **Revenus** | Tableau de bord revenus plateforme. |
| **Réservations** | Vue centralisée des réservations. |
| **Finances** | Vue financière plateforme. |
| **Statistiques** | Statistiques globales. |
| **Paramètres plateforme** | Configuration globale. |
| **Media** | Gestion des médias partagés. |

---

### 1.3 Dashboard Compagnie (CEO — admin_compagnie)

| Fonctionnalité | Rôle réel |
|----------------|-----------|
| **Centre de commande** | Vue agrégée temps réel : revenus, passagers, remplissage, activité agences, flotte, anomalies, position financière, profit, health score, insights, simulations, top agences, paiements en attente CEO. |
| **Approbations paiement** | Liste des propositions de paiement en attente, approbation/rejet CEO. |
| **Finances** | Vue finances compagnie (sans modifier sessions). |
| **Trésorerie** | Comptes, mouvements, position trésorerie. |
| **Flotte globale** | Véhicules, statuts, mouvements (niveau compagnie). |
| **Dashboard** | KPIs période (CA, billets, agences), graphiques revenus/réservations, santé réseau, alertes. |
| **Comptabilité** | Accès espace comptable compagnie. |
| **Agences** | Liste et gestion des agences du réseau. |
| **Réservations** | Réservations compagnie (dont preuves en attente). |
| **Avis clients** | Modération des avis (badge en attente). |
| **Configuration** | Onglets : Plan, Vitrine, Services, Médias, Moyens de paiement, Banques, Personnel, Sécurité, Réseaux, Légal. |
| **Images** | Bibliothèque d’images compagnie. |
| **Paramètres paiement** | Configuration des moyens de paiement. |
| **Trip costs** (route dédiée) | Coûts par trajet (carburant, chauffeur, péage, etc.). |

---

### 1.4 Comptabilité Compagnie (company_accountant / financial_director)

| Fonctionnalité | Rôle réel |
|----------------|-----------|
| **Vue globale** | Synthèse comptable/financière. |
| **Réservations en ligne** | Suivi des réservations en ligne et preuves. |
| **Finances** | Écrans finances. |
| **Trésorerie** | Même vue trésorerie que CEO. |
| **Rapports** | Génération/consultation rapports. |
| **Paramètres** | Paramètres métier comptable. |
| **Chef comptable (legacy)** | Même périmètre via `/chef-comptable`. |

---

### 1.5 Guichet (guichetier, chefAgence)

| Fonctionnalité | Rôle réel |
|----------------|-----------|
| **Guichet** | Vente et enregistrement des billets en caisse (trajets du jour, places, encaissement). |
| **Reçu guichet** | Édition/consultation reçu par réservation. |
| **Impression réservation** | Impression billet. |

---

### 1.6 Dashboard Agence (chefAgence, superviseur, agentCourrier)

| Fonctionnalité | Rôle réel |
|----------------|-----------|
| **Dashboard (Cockpit)** | Revenu du jour, billets, position caisse, sessions actives, départs du jour (embarqués/capacité/fermeture), alertes (sessions longues, validations en attente). |
| **Opérations** | Vue opérationnelle des activités agence. |
| **Trajets** | Gestion des trajets et horaires (weeklyTrips). |
| **Finances** | Revenus, dépenses, vue financière agence. |
| **Trésorerie** | Comptes et mouvements de l’agence. |
| **Équipe** | Gestion du personnel de l’agence. |
| **Rapports** | Rapports locaux. |

---

### 1.7 Comptabilité Agence (agency_accountant)

| Fonctionnalité | Rôle réel |
|----------------|-----------|
| **Comptabilité agence** | Sessions, rapprochement caisse, validation des shifts, dépenses, payables (selon implémentation). |

---

### 1.8 Embarquement (boarding)

| Fonctionnalité | Rôle réel |
|----------------|-----------|
| **Dashboard embarquement** | Vue des départs et contrôles. |
| **Scan** | Scan / contrôle des billets à l’embarquement. |

---

### 1.9 Flotte (agency_fleet_controller, chefAgence)

| Fonctionnalité | Rôle réel |
|----------------|-----------|
| **Dashboard flotte** | Véhicules de l’agence, statuts. |
| **Affectation** | Affectation véhicule ↔ trajet. |
| **Véhicules** | Liste et état des véhicules. |
| **Mouvements** | Historique des mouvements de véhicules. |

---

### 1.10 Validations (compatibilité)

| Fonctionnalité | Rôle réel |
|----------------|-----------|
| **Validations comptables** | Validation des écritures/sessions (côté compagnie). |
| **Validations chef agence** | Validation des sessions/shifts côté agence. |

---

### 1.11 Back-office financier (cœur métier récent)

| Fonctionnalité | Rôle réel |
|----------------|-----------|
| **Seuils d’approbation** | financialSettings : seuil paiement, obligation CEO. |
| **Propositions de paiement** | Workflow : proposition → approbation/rejet CEO. |
| **Trésorerie (moteur)** | Comptes (banque, mobile money, caisse agence), transferts, dépôts/retraits, paiements fournisseurs. |
| **Historique financier véhicule** | Coûts par véhicule (carburant, maintenance, opérationnel). |
| **Classification dépenses** | Catégories (fuel, maintenance, toll, etc.) et lien trip/vehicle/payable. |
| **Intelligence / anomalies** | Détection anomalies (marge, écart caisse, transit, coûts véhicule, carburant). |
| **Health score** | Indicateur santé 0–100 (marge, remplissage, écarts, transit, croissance, ratios C3). |

---

## 2. CLASSIFICATION STRATÉGIQUE

### A — Noyau stratégique (renforce le contrôle central en temps réel)

| Fonctionnalité | Pourquoi A |
|----------------|------------|
| **Centre de commande (CEO)** | Seule vue qui agrège en temps réel revenus, coûts, profit, trésorerie, anomalies et health score à l’échelle compagnie. C’est le « poste de pilotage » du réseau. |
| **Réservation en ligne** | Canal de revenu direct et traçable ; alimente dailyStats et la base pour tout le reste (profit, remplissage). |
| **Guichet** | Canal caisse ; source des encaissements et des sessions ; sans guichet pas de réconciliation ni de contrôle caisse. |
| **Sessions / shifts** | Lien entre encaissement physique et responsabilité (qui a encaissé quoi) ; base des validations et écarts. |
| **Trésorerie unifiée** | Comptes, mouvements, position ; toute la circulation d’argent passe par là. Seuils et approbations CEO en découlent. |
| **Approbations paiement CEO** | Verrou de gouvernance : les gros paiements ne partent pas sans accord central. |
| **dailyStats / agrégats agence** | Alimentation du centre de commande et des KPIs ; sans eux pas de vue temps réel par agence. |
| **Anomalies + Health score** | Donnent un jugement synthétique (risques, santé) et orientent l’action. |

---

### B — Support important (utile mais pas différenciant)

| Fonctionnalité | Pourquoi B |
|----------------|------------|
| **Dashboard Compagnie (KPIs + graphiques)** | Utile pour le suivi période mais duplique en partie le centre de commande ; moins « temps réel » et moins orienté décision. |
| **Dashboard Agence (Cockpit)** | Indispensable au chef d’agence pour le quotidien (sessions, départs, caisse) mais ne donne pas le « contrôle central » ; c’est du support opérationnel. |
| **Comptabilité agence** | Nécessaire pour les validations et la réconciliation ; sans elle les écarts ne sont pas traités. |
| **Comptabilité compagnie (Vue globale, Finances, Rapports)** | Utile pour le contrôle et la clôture ; complète la trésorerie et les paiements. |
| **Flotte (agence + globale)** | Utile pour affectation et suivi véhicules ; les anomalies « transit » et « véhicule » en dépendent. |
| **Embarquement (scan)** | Boucle la boucle billet → embarqué ; important pour l’intégrité opérationnelle. |
| **Trajets / weeklyTrips** | Fondation de l’offre (horaires, départs) ; sans eux pas de réservation ni de guichet structuré. |
| **Paramètres (vitrine, services, personnel, banques, etc.)** | Configuration nécessaire au fonctionnement ; pas un levier de différenciation en soi. |
| **Réservations (liste + preuves)** | Suivi et modération ; support au processus, pas le cœur. |
| **Trip costs** | Alimente le moteur de profit et l’intelligence ; important pour la qualité des décisions. |
| **Avis clients** | Image de marque et feedback ; secondaire par rapport au contrôle opérationnel. |

---

### C — Décoratif ou secondaire

| Fonctionnalité | Pourquoi C |
|----------------|------------|
| **Dashboard admin plateforme** | Vue « méta » pour l’hébergeur ; pas utilisé par les compagnies. |
| **Statistiques admin** | Idem. |
| **Plans / Subscriptions / Revenus plateforme** | Monétisation plateforme ; hors « système d’exploitation du transport » côté opérateur. |
| **Bibliothèque images** | Confort éditorial ; pas critique pour le pilotage. |
| **Médias (admin)** | Gestion globale ; secondaire. |
| **Pages légales (mentions, cookies, etc.)** | Obligatoires mais non différenciantes. |
| **Simulations (occupancy, fuel, ticket)** | Pédagogiques dans le centre de commande ; « what-if » pas obligatoire pour le contrôle. |
| **Insights stratégiques (recommandations)** | Améliorent l’expérience CEO mais le noyau dur est les indicateurs et anomalies. |
| **Double entrée comptable compagnie (Vue globale vs Centre de commande)** | Deux portes d’entrée pour des infos proches ; l’une peut être considérée comme redondante. |

---

## 3. IDENTIFICATION DU CŒUR NUCLÉAIRE

### 3.1 Fonction centrale

**La fonction centrale autour de laquelle tout gravite est : la réservation (billet) et son règlement, en guichet et en ligne.**

- **Réservation** = engagement siège + trajet + prix.
- **Règlement** = encaissement (caisse ou en ligne) et preuve.
- Tout le reste en découle : **dailyStats** (revenus, passagers, sièges), **sessions** (qui a encaissé), **trésorerie** (où va l’argent), **profit** (revenus − coûts), **anomalies** (écarts, marges), **approbations** (sorties d’argent).

Si on devait réduire à une seule phrase : *« Teliya enregistre qui vend quel trajet, pour combien, et où va l’argent. »*

### 3.2 Si on supprimait 50 % du produit — que garder absolument ?

**À garder en priorité :**

1. **Réservation client** (en ligne) + **Guichet** (caisse) — création et paiement des billets.
2. **Centre de commande** — vue centralisée revenus / coûts / trésorerie / alertes (version épurée si besoin).
3. **Trésorerie** — comptes, mouvements, position ; **approbations CEO** (seuils + propositions).
4. **Sessions / shifts** — lien guichet → encaissement et validation.
5. **Trajets (weeklyTrips)** — offre et horaires.
6. **Comptabilité agence** — validation des sessions et réconciliation caisse.
7. **Auth + rôles** — pour séparer guichet, agence, comptabilité, CEO.

**À pouvoir sacrifier ou fortement simplifier :**

- Dashboard Compagnie (KPIs/graphiques) si le centre de commande reste riche.
- Admin plateforme (tout sauf création compagnie / auth si multi-tenant).
- Flotte détaillée (affectation, mouvements) si on garde au moins le suivi « véhicule en transit » pour les anomalies.
- Embarquement scan (remplaçable par mise à jour manuelle du statut).
- Avis, bibliothèque images, paramètres avancés (vitrine, réseaux, légal).
- Simulations et une partie des « insights » du centre de commande.
- Doublon chef-comptable / accounting (un seul espace comptable compagnie).

---

## 4. COHÉRENCE PRODUIT

### 4.1 Incohérences

- **Deux portes d’entrée « finances » pour la compagnie** : Centre de commande (trésorerie, position, paiements en attente) et espace Comptabilité (Vue globale, Finances, Trésorerie). Même trésorerie affichée à deux endroits ; risque de confusion sur « où faire quoi ».  
  → **Recommandation** : Unifier la narration (ex. « Trésorerie et paiements » dans le centre de commande, Comptabilité = rapports et clôture).

- **Chef comptable (legacy) vs Accounting** : Deux routes (`/chef-comptable` et `/compagnie/:id/accounting`) pour le même type d’utilisateur.  
  → **Recommandation** : Une seule entrée (accounting) et redirection legacy.

- **Dashboard Compagnie vs Centre de commande** : Deux dashboards compagnie (KPIs période vs temps réel + profit + anomalies). Le centre de commande est plus riche ; le dashboard peut sembler redondant.  
  → **Recommandation** : Soit fusion (un seul dashboard « compagnie »), soit rôles clairs (ex. « Vue période » vs « Poste de pilotage »).

### 4.2 Redondances

- **Trésorerie** : accessible depuis Compagnie (CEO) et depuis Comptabilité compagnie.
- **Finances** : page « Finances » compagnie et blocs finances dans Centre de commande.
- **Réservations** : liste dans Compagnie + Réservations en ligne dans Comptabilité.
- **Paramètres** : nombreux onglets (plan, vitrine, services, médias, paiement, banques, personnel, sécurité, réseaux, légal) ; certains pourraient être regroupés ou déplacés (ex. plan dans un espace « Abonnement »).

### 4.3 Complexités inutiles

- **Trop de rôles** pour un premier contact : admin_platforme, admin_compagnie, company_accountant, financial_director, chefAgence, superviseur, agentCourrier, guichetier, agency_accountant, embarquement, agency_boarding_officer, agency_fleet_controller. Compréhension et tests plus lourds.  
  → **Recommandation** : Grouper en 4–5 « personas » (Plateforme, CEO, Comptable compagnie, Manager agence, Guichet/Compta agence/Flotte/Boarding).

- **Landing différente selon le rôle** : Puissant mais peut dérouter (guichet → guichet, comptable → comptabilité). À garder mais à documenter clairement.

### 4.4 Parties faibles par rapport à l’ambition « système d’exploitation »

- **Pilotage opérationnel quotidien** : Le centre de commande donne une photo agrégée ; il manque une vue « actions du jour » (ex. « 3 validations en attente », « 2 paiements à approuver », « 1 anomalie critique ») sans tout ouvrir.  
  → **Recommandation** : Bloc « À faire maintenant » (alertes actionnables) en tête du centre de commande.

- **Flotte** : Suivi véhicules et mouvements présent ; intégration avec coûts (carburant, maintenance) et rentabilité véhicule encore à pousser (vehicle financial history existe mais peu visible dans les écrans).  
  → **Recommandation** : Exposer « coût / profit par véhicule » dans la flotte ou le centre de commande.

- **Rapports et export** : Présents côté comptabilité ; pas de synthèse « one-click » CEO (ex. PDF mensuel revenus / coûts / trésorerie).  
  → **Recommandation** : Un rapport mensuel type « Synthèse direction » générable depuis le centre de commande.

---

## 5. CENTRE DE CONTRÔLE — DASHBOARDS COMPAGNIE ET AGENCE

### 5.1 Dashboard Compagnie (Centre de commande + Dashboard classique)

**Évaluation :**

| Critère | Note | Commentaire |
|--------|------|-------------|
| **Clarté** | 3/5 | Beaucoup de blocs (revenus, activité agences, flotte, position financière, profit, anomalies, health score, insights, simulations, top agences). L’ordre et la hiérarchie visuelle pourraient mieux guider « ce que je regarde en premier ». |
| **Lisibilité** | 4/5 | Chiffres et libellés en français, filtres de période. Densité élevée ; sur mobile ça peut être lourd. |
| **Impact décisionnel** | 4/5 | Position financière, paiements en attente CEO, anomalies et health score sont directement actionnables. Revenus et profit aident au pilotage. Manque un résumé « actions à faire ». |
| **Simplicité** | 2/5 | Une seule page accumule trop de dimensions (opérationnel, financier, risque, stratégie). Risque de surcharge cognitive. |

**5 indicateurs vraiment stratégiques à mettre en avant :**

1. **Position de trésorerie nette** (banque + mobile + caisse − payables) — « Combien il reste vraiment. »
2. **Paiements en attente d’approbation CEO** (nombre + montant) — « Ce qui bloque si je n’agis pas. »
3. **Health score (0–100)** — « Santé globale du réseau. »
4. **Profit du jour (ou de la période)** — « Est-ce qu’on gagne de l’argent. »
5. **Nombre d’anomalies critiques (high)** — « Ce qui demande une action immédiate. »

**À faire disparaître ou réduire :**

- Simulations (occupancy, fuel, ticket) en première lecture ; les déplacer dans un panneau « Analyse » ou « Scénarios ».
- Doublon entre « Revenu global » et indicateurs déjà présents dans « Position financière » ou profit ; garder une seule source de vérité pour le chiffre d’affaires.
- Détail trop fin (ex. liste exhaustive de tous les trajets par profit) en vue par défaut ; à garder en drill-down.

**À renforcer :**

- **Bloc « À faire »** en haut : validations en attente, paiements à approuver, anomalies high, avec liens directs.
- **Un seul chiffre « Revenu période »** et **un seul « Profit période »** bien mis en avant.
- **Lien direct « Approbations »** depuis le bandeau paiements en attente (déjà en place ; s’assurer que c’est le CTA principal).
- **Export / rapport** : bouton « Synthèse période » (PDF ou Excel) depuis le centre de commande.

---

### 5.2 Dashboard Agence (Cockpit Manager)

**Évaluation :**

| Critère | Note | Commentaire |
|--------|------|-------------|
| **Clarté** | 4/5 | Revenu du jour, billets, caisse, sessions, départs — aligné avec le quotidien du chef d’agence. |
| **Lisibilité** | 4/5 | Cartes et libellés clairs. Alertes (sessions longues, validations) visibles. |
| **Impact décisionnel** | 3/5 | Bon pour « voir » l’état ; moins pour « agir » (ex. « Valider la session X » depuis le dashboard). |
| **Simplicité** | 4/5 | Une page focalisée sur le jour ; pas de surcharge. |

**5 indicateurs vraiment stratégiques à mettre en avant :**

1. **Revenu du jour** — Performance immédiate.
2. **Position caisse** — Cohérence avec les encaissements.
3. **Sessions actives / en attente de validation** — Responsabilité et clôture.
4. **Départs du jour** (embarqués / capacité / fermés) — Remplissage et opération.
5. **Alerte écarts** — Si une session a un écart caisse, le mettre en évidence avec lien vers la validation.

**À faire disparaître ou réduire :**

- Éléments purement décoratifs s’il en reste.
- Doublon entre « Revenu du jour » et somme des réservations du jour si les deux affichent la même chose.

**À renforcer :**

- **Actions directes** : « Valider la session X », « Fermer le shift Y » depuis le cockpit.
- **Lien vers guichet** si une session est encore ouverte (rappeler de fermer en fin de journée).
- **Indicateur « Écart caisse »** (oui/non + montant) par session, avec lien vers la page de validation.

---

## 6. POSITIONNEMENT FINAL

À partir du code et des fonctionnalités existantes, **Teliya** peut être résumée ainsi :

---

**« Teliya est le poste de pilotage centralisé du transport par bus : elle capture chaque vente (guichet et en ligne), trace chaque euro en trésorerie, impose un verrou CEO sur les gros paiements, et donne au dirigeant une vue temps réel sur la santé du réseau (profit, risques, anomalies) pour qu’il pilote son réseau comme un système, pas comme une somme d’agences. »**

---

Pour tendre vers **« système d’exploitation du transport »** et pas seulement « application de réservation » :

- **Conserver** : réservation + guichet, trésorerie unifiée, approbations CEO, centre de commande, anomalies et health score, sessions/shifts.
- **Renforcer** : un seul « centre de contrôle » compagnie avec bloc « À faire » et indicateurs stratégiques listés ci-dessus ; actions directes depuis les dashboards ; rapport « Synthèse direction » ; visibilité coût/rentabilité par véhicule.
- **Simplifier** : un seul espace comptable compagnie, une seule entrée « Dashboard » compagnie (ou deux vues explicites), regroupement des rôles en personas.
- **Réduire** : doublons (dashboard vs command center), fonctionnalités décoratives ou secondaires (simulations, médias, etc.) en vue par défaut.

---

*Document d’audit stratégique — Teliya. À utiliser comme base pour roadmap produit et communication positionnement.*
