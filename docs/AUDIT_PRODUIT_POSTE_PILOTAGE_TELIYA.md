# Audit produit — Poste de pilotage TELIYA

**Objectif :** Vérifier si les espaces Poste de pilotage CEO et Poste de pilotage Chef d’agence permettent réellement de **voir**, **comprendre** et **décider**.  
**Périmètre :** Analyse du code existant, sans modification.  
**Date :** Mars 2025.

---

## Contexte produit

TELIYA est un système de gestion pour compagnies de transport. Les équipes opérationnelles (guichetiers, agents courrier, comptables, chefs d’agence) y travaillent au quotidien. Les **CEO** et **chefs d’agence** doivent en plus l’utiliser pour **réfléchir**, **piloter** et **développer** l’entreprise.

- **Finances** = voir les chiffres (confiance, contrôle).
- **Poste de pilotage** = réfléchir et prendre des décisions.

---

# 1. Structure actuelle

## 1.1 Poste de pilotage CEO

**Fichier :** `src/modules/compagnie/pages/CEOCommandCenterPage.tsx`  
**Route :** `/compagnie/:companyId/command-center`

### Composants / blocs affichés

| # | Bloc | Contenu |
|---|------|--------|
| 1 | **État du réseau aujourd’hui** | Bandeau unique : Bon / Moyen / Critique (couleur + libellé). Basé sur taux de remplissage réseau, agences actives, bus en retard. |
| 2 | **Finance unifiée (3 cartes)** | Ventes temps réel (live), Encaissements (cash), Revenus validés (validated). Chaque carte avec source indiquée. |
| 3 | **Grille KPI (6 cartes cliquables)** | CA période, Billets vendus, Agences actives, Bus en circulation, Bus en retard, Alertes critiques. Avec variation vs période précédente (CA, billets, agences). |
| 4 | **Alertes à traiter** | Liste des risques prioritaires (financial / network / fleet) avec liens vers les pages d’action. Affiché uniquement si `prioritizedRisks.length > 0`. |

### Sources de données

| Donnée | Source / service |
|--------|-------------------|
| État réseau aujourd’hui | `getNetworkStats(companyId, today, today)` → networkStatsService |
| Finance unifiée | `getUnifiedCompanyFinance(companyId, startStr, endStr)` → unifiedFinanceService |
| CA, billets, agences actives, bus en circulation | `getNetworkStats(companyId, startStr, endStr)` → networkStatsService |
| Période précédente (comparaison) | `getPreviousPeriod` + `getNetworkStats(companyId, prevStart, prevEnd)` |
| Bus en retard | `getDelayedBusesCountToday(companyId)` → tripProgressService |
| Risques / alertes | Données dérivées : `dailyStats`, `agencyLiveState`, `financialAccounts`, `unpaidPayables`, `agencyProfits`, `cashDiscrepancyList`, `courierDiscrepancyList`, `riskSettings` ; règle : `computeCeoGlobalStatus` (ceoRiskRules) + construction de `prioritizedRisks` (agences sans revenu, comptes sous seuil danger) |
| Données de contexte | `dailyStats` (collectionGroup), `agencyLiveState`, `expenses`, `shiftReports` (validated), `tripCosts`, `listVehicles`, `listAccounts`, `listUnpaidPayables`, `listClosedCashSessionsWithDiscrepancy`, `listCourierSessionsWithDiscrepancy` |

### Sélecteur de période

- Jour / Semaine / Mois / Personnalisé (avec dates custom).
- Alignement des requêtes sur `periodRange` (getDateRangeForPeriod, getTodayBamako pour « aujourd’hui »).

---

## 1.2 Poste de pilotage Chef d’agence

**Fichier :** `src/modules/agence/manager/ManagerCockpitPage.tsx`  
**Route :** `/agence/dashboard`

### Composants / blocs affichés

| # | Bloc | Contenu |
|---|------|--------|
| 1 | **Grille KPI (7 cartes)** | CA période, Billets période, Taux de remplissage, Trésorerie agence, Colis créés (jour), Colis en transit, Départs restants. |
| 2 | **Actions manager** | Boutons : Suivre opérations, Arbitrer finances, Voir trésorerie, Consulter rapports. |
| 3 | **Guichets actifs — surveillance en temps réel** | Tableau : Total agence (en ligne + guichet) + une ligne par poste actif (billets, revenu, statut). |
| 4 | **Postes actifs en temps réel (détail)** | Cartes par session active (guichetier, billets session, revenu session). Affiché si au moins un poste actif. |
| 5 | **Alertes** | Liste d’alertes (useManagerAlerts) : rapports en attente compta, à approuver, écart de caisse, aucun guichet actif, départs en retard, faible remplissage, sessions longues. |
| 6 | **Postes en attente d’activation** | Tableau (escales uniquement) : guichetier, créé le, bouton Activer. |
| 7 | **Validations en attente** | Tableau : sessions closed (en attente compta) et validated (à approuver chef). |

### Sources de données

| Donnée | Source / service |
|--------|-------------------|
| CA / billets période | `getAgencyStats(companyId, agencyId, startKey, endKey)` → networkStatsService (getAgencyStats) |
| Taux de remplissage | Calcul local : `departures` (weeklyTrips + reservations du jour + boardingClosures) → moyenne remplissage par créneau. |
| Trésorerie agence | `listAccounts(companyId, { agencyId })` → solde cumulé des comptes agence. |
| Colis | `shipmentsRef` + filtre `originAgencyId === agencyId` ; comptage créés aujourd’hui + en transit. |
| Départs restants | `departures.filter(d => !d.closed).length`. |
| Guichets actifs | Listeners Firestore : `shifts` (active/paused), `reservations` par `shiftId` → `liveStatsByShift`. |
| Alertes | Hook `useManagerAlerts` : shifts, reservations du jour, boardingClosures, cash position, dépenses du jour → règles (rapports en attente, écart caisse, aucun guichet, départs en retard, faible remplissage, sessions > 8h). |

### Sélecteur de période

- `DateFilterBar` (today / week / month / custom) via `useDateFilterContext`.  
- CA et billets sont filtrés par cette période ; le reste (trésorerie, colis, départs, guichets) est surtout « aujourd’hui » ou temps réel.

---

# 2. Niveau 1 — VOIR

## 2.1 CEO

- **Chiffres affichés :**  
  - État réseau : qualitatif (Bon / Moyen / Critique).  
  - Finance : 3 montants (live, cash, validé).  
  - CA, billets, agences actives (x / total), bus en circulation, bus en retard, nombre d’alertes critiques.
- **Clarté :** Les 3 niveaux financiers (live / cash / validé) sont explicites et sourcés. Les libellés et couleurs différencient bien les blocs.
- **Cohérence :** Données alignées sur la même période et sur les mêmes services (networkStats, unifiedFinance). Risque de confusion mineure : « CA période » (networkStats) vs « Ventes temps réel » (unifiedFinance) peuvent différer (sources différentes : cashTransactions vs reservations+shipments).

## 2.2 Chef d’agence

- **Chiffres affichés :** CA période, billets, taux de remplissage (%), trésorerie, colis créés (jour), colis en transit, départs restants, détail par guichet actif (billets, revenu).
- **Clarté :** KPIs lisibles. Une phrase précise indique que CA et billets viennent du « réseau TELIYA » (réservations confirmées/payées, en ligne + guichet).
- **Cohérence :** Pas de séparation live / cash / validé sur le poste de pilotage agence. Uniquement un « CA période » (getAgencyStats). La page `DashboardAgencePage` (autre fichier) affiche elle les 3 niveaux unifiés mais n’est pas la page « Poste de pilotage agence » exposée dans le menu (c’est ManagerCockpitPage).

**Verdict VOIR :**  
- CEO : **correct** — indicateurs principaux visibles, finance à 3 niveaux claire.  
- Chef d’agence : **partiel** — vision surtout « CA + opérationnel » ; pas de distinction live / cash / validé sur le cockpit.

---

# 3. Niveau 2 — COMPRENDRE

## 3.1 CEO

- **Comparaisons :** Oui. Variation vs période précédente sur CA, billets, agences actives (calcul via `getPreviousPeriod` + `calculateChange`). Libellé de la période de comparaison affiché (ex. « vs hier », « vs semaine dernière »).
- **Évolution (%) :** Affichée sur les 3 cartes concernées (CA, Billets, Agences actives).
- **Écarts :** Pas d’écart explicite « attendu vs réalisé » sur le cockpit. Les écarts de caisse / courrier alimentent les listes de discrepancies et peuvent remonter dans les alertes (risques prioritaires) mais ne sont pas chiffrés sur la page.
- **Segmentation :** Pas de tableau par agence ni par trajet sur le cockpit. Les risques mentionnent « agences en baisse / sans revenu » et « comptes sous seuil » avec des liens ; la segmentation détaillée est dans les pages cibles (ex. reservations-reseau, finances).

**Verdict COMPRENDRE (CEO) :** Comparaison temporelle présente ; pas de segmentation ni d’écarts explicites sur la page.

## 3.2 Chef d’agence

- **Comparaisons :** Non. Aucune variation vs hier / semaine précédente sur le poste de pilotage.
- **Évolution :** Aucun pourcentage d’évolution affiché.
- **Écarts :** L’alerte « Écart de caisse détecté » existe (cashPosition vs todayRevenue + todayExpenses) mais le montant de l’écart n’est pas affiché sur le cockpit.
- **Segmentation :** Oui, par poste (guichetier) pour les ventes en temps réel. Pas de segmentation par trajet ou par créneau sur le cockpit.

**Verdict COMPRENDRE (Chef d’agence) :** Faible — pas de comparaison dans le temps ni d’écarts chiffrés sur la page.

---

# 4. Niveau 3 — DÉCIDER (critique)

## 4.1 CEO

- **Anomalies détectées automatiquement :**  
  - Oui : agences sans revenu, comptes sous seuil danger/warning (seuils fixes dans strategicThresholds).  
  - État réseau « Critique » / « Moyen » à partir du remplissage, agences actives et bus en retard.  
  - Pas de détection automatique d’anomalies sur les écarts de caisse/courrier affichée directement (les données sont chargées mais servent surtout à compter les « alertes » ou à alimenter d’autres vues).
- **Alertes intelligentes :** Liste de risques prioritaires (financial / network / fleet) avec libellé et lien d’action. Pas de scoring ni de priorisation au-delà de « danger » vs « warning ». Pas d’explication « pourquoi » (ex. « CA en baisse de X % »).
- **Problèmes clairement identifiés :** Oui pour « Agences en baisse / sans revenu » et « Comptes sous seuil danger ». Les autres catégories (ex. flotte) sont préparées dans le code (prioritizedRisks par category) mais en l’état seuls financial et network sont alimentés.
- **Opportunités visibles :** Non. Aucun bloc dédié aux opportunités (ex. lignes/trajets performants, créneaux à renforcer).
- **Suggestions d’action :** Oui, de façon limitée : liens vers `reservations-reseau`, `finances?tab=liquidites`, `flotte`, `audit-controle`. Pas de phrase du type « Faire X en priorité ».

**Ce qui manque pour vraiment décider :**  
- Explication des alertes (cause : baisse de X %, écart de Y).  
- Priorisation explicite (ordre de traitement).  
- Synthèse « À faire cette semaine » / « Décision à prendre ».  
- Opportunités et bons résultats (où ça va bien).

## 4.2 Chef d’agence

- **Anomalies détectées automatiquement :** Oui (useManagerAlerts) : rapports en attente compta/chef, écart de caisse, aucun guichet actif alors que départs ouverts, départs en retard, faible remplissage, sessions > 8h.
- **Alertes intelligentes :** Liste d’alertes avec sévérité et lien. Pas de priorisation ni d’explication chiffrée (ex. « Écart caisse : +XXX XOF »).
- **Problèmes clairement identifiés :** Oui pour les cas couverts (compta, caisse, guichets, retards, remplissage, sessions longues).
- **Opportunités visibles :** Non.
- **Suggestions d’action :** Liens vers /agence/finances, /agence/operations, /agence/dashboard. Pas de consigne explicite (« Valider les N rapports en attente »).

**Ce qui manque pour vraiment décider :**  
- Montant des écarts (caisse, objectifs).  
- Comparaison avec la veille / la semaine dernière.  
- Une seule zone « À faire maintenant » avec priorités.  
- Mise en avant des bons indicateurs (ex. « Remplissage au-dessus de la moyenne »).

---

# 5. Chef d’agence vs CEO

| Critère | CEO | Chef d’agence |
|--------|-----|----------------|
| Périmètre | Compagnie (toutes agences) | Une agence |
| Finance | 3 niveaux (live / cash / validé) | 1 indicateur (CA période) |
| Période | Jour / Semaine / Mois / Custom | Today / Week / Month / Custom |
| Comparaison période précédente | Oui (CA, billets, agences) | Non |
| État global en un coup d’œil | Oui (réseau Bon/Moyen/Critique) | Non (que des chiffres) |
| Flotte / opérations | Bus en circulation, bus en retard (niveau réseau) | Départs restants, remplissage, colis ; pas de vue « bus » |
| Alertes | Risques prioritaires (agences, comptes) ; liens par catégorie | Alertes opérationnelles et compta ; liens par type |
| Actions rapides | Implicites (liens depuis les cartes et les alertes) | Bloc dédié (Suivre opérations, Arbitrer finances, etc.) |

- **Vision locale chef d’agence :** Opérationnelle et réactive (guichets, départs, colis, validations). Manque une vision « performance » (évolution, objectifs, écarts) et la même clarté financière que le CEO (live / cash / validé).
- **Vision globale CEO :** Synthétique (état réseau, finance à 3 niveaux, KPIs avec tendance). Manque une vue « opportunités » et des explications sur les alertes pour en faire un vrai levier de décision.

---

# 6. Flottes / Opérations

## 6.1 CEO

- **Utilisation des bus :** Indicateur « Bus en circulation » (networkStats → busesInTransit / tripInstances).
- **Bus inactifs :** Non affiché sur le cockpit. Les données existent (`fleetOverviewCounts` : garage, enTransit, maintenance, accidente, horsService) et sont chargées mais ne sont pas exposées dans l’UI actuelle (pas de bloc « Flotte » avec répartition).
- **Taux de remplissage :** Utilisé en interne pour l’état du réseau (remplissage global réseau, seuils 20 % / 40 % pour critique / moyen). Pas affiché comme KPI lisible.
- **Retards :** « Bus en retard » affiché (getDelayedBusesCountToday). Lien vers flotte avec filtre retard.
- **Anomalies opérationnelles :** Pas de bloc dédié (ex. véhicules en panne, trajets annulés). Les risques « flotte » sont prévus dans le code mais non alimentés en l’état.

## 6.2 Chef d’agence

- **Utilisation des bus :** Représentée indirectement par « Départs restants » et « Taux de remplissage » (par créneau départ/arrivée/heure).
- **Bus inactifs :** Pas de vue flotte sur le cockpit agence.
- **Taux de remplissage :** Affiché en % (moyenne sur les créneaux du jour).
- **Retards :** Détectés dans useManagerAlerts (départs dépassant l’heure + seuil) et remontent en alerte « X départs en retard » avec lien vers /agence/operations.
- **Anomalies opérationnelles :** Alertes (retards, faible remplissage, sessions longues). Pas de liste dédiée « incidents » ou « véhicules ».

**Verdict :** Le poste CEO donne une vision partielle (circulation + retards) mais pas la répartition flotte (garage / maintenance / hors service). Le poste agence est centré départs/remplissage, pas véhicules.

---

# 7. Finance vs Pilotage

- **CEO :** Les 3 cartes « Ventes temps réel », « Encaissements », « Revenus validés » sont clairement du **contrôle financier** (voir les chiffres). Le reste (état réseau, KPIs, alertes) relève du **pilotage** (réseau, flotte, risques). Les deux coexistent sur la même page : séparation visuelle nette (bloc finance vs bloc état réseau + grille + alertes).
- **Chef d’agence :** « CA période » et « Trésorerie agence » sont financiers ; le reste est opérationnel. Pas de séparation explicite « Finance » vs « Pilotage », et pas de distinction live / cash / validé.
- **Mélange :** Sur les deux pages, chiffres financiers et indicateurs de pilotage sont sur le même écran. Pour le CEO, la distinction est compréhensible (3 niveaux financiers + indicateurs réseau/flotte/alertes). Pour le chef d’agence, une séparation plus claire et l’ajout des 3 niveaux financiers aideraient à « voir » puis « décider ».

---

# 8. Problèmes produit identifiés

## Ce qui est bon

- **CEO :** État du réseau en un coup d’œil ; finance à 3 niveaux avec sources ; comparaison avec période précédente ; risques prioritaires avec liens ; période paramétrable.
- **Chef d’agence :** Vue temps réel des guichets ; alertes opérationnelles et compta utiles ; actions rapides explicites ; validations en attente visibles.

## Ce qui est inutile ou redondant

- **CEO :** Doublon possible entre « CA période » (networkStats) et « Ventes temps réel » (unifiedFinance) sans explication de la différence.
- **Chef d’agence :** Deux blocs proches (« Guichets actifs » tableau + « Postes actifs en temps réel » cartes) pour le même sujet.

## Ce qui manque

- **CEO :** Bloc Flotte (répartition garage / transit / maintenance / hors service) ; explication des alertes (chiffres, cause) ; opportunités / bons résultats ; suggestions d’action explicites (« Faire X en priorité »).
- **Chef d’agence :** Finance à 3 niveaux (live / cash / validé) ; comparaison avec période précédente ; état global du jour (ex. Bon / À surveiller) ; montant des écarts (caisse) ; zone « À faire maintenant » priorisée.

## Ce qui est mal placé

- **CEO :** Données flotte (fleetOverviewCounts) sont chargées mais pas affichées → soit les afficher dans un bloc dédié, soit ne pas les charger sur cette page.
- **Chef d’agence :** La page qui affiche la finance unifiée (DashboardAgencePage) n’est pas celle du menu « Poste de pilotage » (ManagerCockpitPage) → incohérence pour l’utilisateur qui ne voit pas live/cash/validé sur son cockpit.

---

# 9. Recommandations (sans coder)

## 9.1 Structure idéale du poste de pilotage

**Principe :** En 30–60 secondes, répondre à : « Où en est-on ? » (voir), « Pourquoi ? » (comprendre), « Que faire ? » (décider).

- **Bloc 1 — État global** (1 ligne ou 1 bandeau) : statut réseau / agence (Bon / À surveiller / Problème) + éventuellement 1 chiffre clé (ex. CA du jour ou objectif du jour).
- **Bloc 2 — Finance (contrôle)** : résumé très court (ex. 3 montants : live / cash / validé) avec lien « Voir détail » vers la page Finances.
- **Bloc 3 — Indicateurs de pilotage** : 4–6 KPIs max (CA, billets, remplissage, flotte ou départs, etc.) avec tendance vs période précédente si pertinent.
- **Bloc 4 — Problèmes / alertes** : liste courte (3–5 max) avec titre + montant ou cause + lien d’action. Option : priorité (1, 2, 3).
- **Bloc 5 — À faire maintenant** : 1–3 actions concrètes (ex. « Valider 2 rapports compta », « Vérifier l’écart caisse Agence X »).
- **Bloc 6 (optionnel) — Opportunités** : 1–2 points positifs (ex. « Ligne Bamako–Sikasso +15 % vs semaine dernière »).

Tout le reste (tableaux détaillés, graphiques, analyse par agence/trajet) → pages dédiées (Réservations réseau, Finances, Flotte, Audit & contrôle, etc.).

## 9.2 Blocs à ajouter

- **CEO :**  
  - Répartition flotte (garage / en circulation / maintenance / hors service) en un bloc compact.  
  - Court texte d’explication sous chaque alerte (ex. « CA -12 % vs semaine dernière »).  
  - Zone « Opportunités » (1–2 lignes).  
  - Zone « À faire en priorité » (1–3 actions).
- **Chef d’agence :**  
  - Les 3 niveaux financiers (live / cash / validé) comme sur le CEO.  
  - Bandeau « État du jour » (Bon / À surveiller / Problème).  
  - Variation CA et billets vs période précédente.  
  - Montant de l’écart de caisse dans l’alerte ou à côté de « Trésorerie agence ».  
  - Bloc « À faire maintenant » (validations, écarts, retards).

## 9.3 Blocs à supprimer ou déplacer

- **CEO :** Aucun bloc à supprimer ; éviter d’ajouter des tableaux ou graphiques lourds sur la page (les garder en pages dédiées).
- **Chef d’agence :** Fusionner « Guichets actifs » (tableau) et « Postes actifs en temps réel » (cartes) en un seul bloc « Guichets actifs » pour éviter la redondance.

## 9.4 Organisation recommandée : indicateurs / anomalies / opportunités / décisions

- **Indicateurs :** En haut, état global + finance résumée + 4–6 KPIs avec tendance. Pas de détail in-page.
- **Anomalies :** Liste courte, cliquable, avec cause ou chiffre quand c’est possible.
- **Opportunités :** Une petite section dédiée (CEO en priorité, puis agence si données disponibles).
- **Décisions :** Bloc « À faire maintenant » avec 1–3 actions claires et liens directs ; le reste via les liens des alertes et des cartes.

---

# 10. Synthèse

| Volet | CEO | Chef d’agence |
|-------|-----|----------------|
| **Voir** | Bon (état réseau, 3 niveaux finance, KPIs) | Partiel (pas de live/cash/validé, pas d’état global) |
| **Comprendre** | Partiel (comparaison oui, pas de segmentation ni d’écarts sur la page) | Faible (pas de comparaison, pas d’écarts chiffrés) |
| **Décider** | Partiel (alertes et liens présents, pas d’explication ni d’opportunités) | Partiel (alertes utiles, pas de priorisation ni de « à faire » explicite) |
| **Flotte / opérations** | Partiel (circulation + retards, pas de répartition flotte) | Centré départs/remplissage, pas de vue véhicules |
| **Finance vs pilotage** | Bien séparés visuellement | Mélangés, finance peu lisible (1 seul indicateur) |

**Problèmes critiques :**  
1. Chef d’agence sans vision « live / cash / validé » sur le cockpit utilisé au quotidien.  
2. Aucun des deux postes n’a de bloc « À faire maintenant » ni d’opportunités.  
3. Données flotte chargées côté CEO mais non affichées.  
4. Alertes sans explication chiffrée ou causale, ce qui limite la décision.

**Points forts à conserver :**  
- CEO : état du réseau, finance unifiée, comparaison de période, risques avec liens.  
- Chef d’agence : temps réel guichets, alertes opérationnelles et compta, actions rapides.

---

*Audit réalisé sur le code des fichiers CEOCommandCenterPage.tsx, ManagerCockpitPage.tsx, useManagerAlerts.ts, networkStatsService, unifiedFinanceService, ceoRiskRules, strategicThresholds, tripProgressService et références associées. Aucune modification de code n’a été effectuée.*
