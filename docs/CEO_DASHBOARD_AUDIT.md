# Audit complet — Espace CEO (Dashboard Compagnie)

**Objectif** : Analyser l’interface actuelle du dashboard CEO pour identifier les informations répétées, les menus redondants, les données à regrouper ou séparer, et proposer une architecture simplifiée.

**Périmètre** : Menus Poste de pilotage, Revenus & Liquidités, Finance — Caisse, Performance Réseau, Opérations Réseau, Exploitation Flotte, Finance Flotte, Contrôle & Audit, Dépenses. (Clients, Avis Clients, Configuration exclus de l’analyse.)

---

## 1. Tableau des menus actuels

Pour chaque menu : objectif, données affichées, sources Firestore, services, pages React.

| Menu | Route | Objectif (implicite) | Données affichées | Sources Firestore | Services | Page React |
|------|--------|----------------------|-------------------|-------------------|----------|------------|
| **Poste de pilotage** | `/command-center` | Vue d’ensemble « temps réel » | CA total, billets, courrier, liquidités, variation CA, santé, risques prioritaires, top 3 agences (CA), sessions ouvertes / en attente, courrier, véhicules en transit, embarquements ouverts, écarts caisse, flotte indisponible, actions rapides | `dailyStats` (cg), `agencyLiveState` (cg), `agences`, `reservations`, `shifts`, `shiftReports` (cg), `expenses` (cg), `tripCosts`, `financialAccounts`, payables, `cashSessions`, `courierSessions`, `fleetVehicles` (ou équivalent flotte) | `listClosedCashSessionsWithDiscrepancy`, `listCourierSessionsWithDiscrepancy`, `calculateAgencyProfit`, `getRiskSettings`, `calculateCompanyCashPosition`, `listAccounts`, `listUnpaidPayables`, `listVehicles`, `computeCeoGlobalStatus` | `CEOCommandCenterPage`, `CEOCommandCenterBlocks` |
| **Revenus & Liquidités** | `/revenus-liquidites` | Pilotage financier (CA + trésorerie) | **Onglet Revenus** : CA période, ventes par agence, écarts de réconciliation, ventes en direct (sessions non validées). **Onglet Liquidités** : soldes par compte (caisse, banque, mobile money), mouvements, dépenses récentes, paiements en attente | **Revenus** : `dailyStats` (cg), `agences`, `shiftReports`, `shifts`, `reservations`. **Liquidités** : `companies`, `agences`, `financialAccounts`, `companyBanks`, mouvements, `expenses` (treasury) | **Revenus** : logique in-page (dailyStats, shiftReports, shifts, reservations). **Liquidités** : `listExpenses` (treasury) | `RevenusLiquiditesPage` (wrapper) → `CompanyFinancesPage` (Revenus) + `CEOTreasuryPage` (Liquidités) |
| **Finance — Caisse** | `/caisse` | Revenus par point de vente, caisse, clôtures | Revenus par route, revenus par point de vente (agence/escale), total encaissements, clôtures du jour, différences, remboursements, transferts | `agences`, `cashTransactions`, `cashClosures`, `cashRefunds`, `cashTransfers`, `routes` | `getCashTransactionsByDate`, `getClosuresByDate`, `getCashRefundsByDate`, `getCashTransfersByDate`, `listRoutes` | `CompanyCashPage` |
| **Performance Réseau** | `/dashboard` | Comparer les performances des agences | CA période, billets vendus, agences actives/total, variation CA, évolution (graphique CA / résas), classement agences (CA), santé du réseau, alertes par agence | `companies`, `agences` (onSnapshot), `reservations` (par agence, onCreate/date) | `useCompanyDashboardData` (réservations par agence, calcul KPIs, série quotidienne, alertes) | `CompagnieDashboard` |
| **Opérations Réseau** | `/operations-reseau` | Synthèse opérationnelle + accès résas et flotte | Réservations aujourd’hui, sessions ouvertes, véhicules disponibles / flotte totale, liens vers Réservations et Exploitation Flotte | `agences`, `reservations` (par agence, createdAt jour), `shifts`, `fleetVehicles` | — | `OperationsFlotteLandingPage` |
| **Exploitation Flotte** | `/fleet` | Gestion des véhicules (statuts, affectations) | Liste véhicules (plaque, modèle, statut opérationnel/technique, ville, dates assurance/contrôle), filtres, création/édition/archivage | `fleetVehicles` (ou collection flotte compagnie), affectations | `listVehiclesPaginated`, `createVehicle`, `setTechnicalStatus`, `updateVehicle`, `archiveVehicle`, `getActiveAffectationByVehicle`, `listVehicleModels` | `GarageDashboardPage` |
| **Finance Flotte** | `/fleet-finance` | Rentabilité flotte (revenus, coûts, marge) | Total revenus véhicules, total coûts, profit; tableau revenus/coûts par véhicule; rentabilité par trajet | Réservations, coûts opérationnels, trajets (via services) | `getVehicleFinancialStats`, `getVehicleOperationalCosts`, `getRouteProfitability` (operationalProfitabilityService) | `FleetFinancePage` |
| **Contrôle & Audit** | `/comptabilite` | Réconciliation, mouvements, audit | **Réconciliation** : données de performance par agence (résas, encaissements, mouvements), écarts. **Mouvements** : companyMovements. **Audit** : indicateurs (validations, modifications, connexions) + journal (données factices dans l’implémentation actuelle) | `agences`, `reservations`, `cashReceipts`, `cashMovements` (par agence), `companyMovements` | — | `CompagnieComptabilitePage` (tabs Réconciliation, Mouvements, Audit) |
| **Dépenses** | `/ceo-expenses` | Validation des dépenses stratégiques (CEO) | Liste dépenses en attente CEO (date, agence, description, montant), actions Approuver / Refuser | `expenses` (statut pending_ceo), `agences` | `listExpenses`, `approveExpense`, `rejectExpense` (treasury/expenses) | `CEOExpensesPage` |

*Légende : cg = collection group.*

---

## 2. Données affichées (résumé par menu)

- **Poste de pilotage** : CA total, billets, courrier, liquidités, variation CA, santé, risques, top 3 agences, sessions/postes, flotte, écarts caisse.
- **Revenus & Liquidités** : CA, ventes par agence, écarts, ventes en direct | soldes comptes, mouvements, dépenses.
- **Finance — Caisse** : revenus par route, par point de vente, clôtures, différences, remboursements, transferts.
- **Performance Réseau** : CA, billets vendus, agences actives, variation CA, graphique évolution, classement agences, santé réseau, alertes.
- **Opérations Réseau** : réservations du jour, sessions ouvertes, véhicules disponibles / flotte.
- **Exploitation Flotte** : liste véhicules, statuts, affectations.
- **Finance Flotte** : revenus/coûts/profit flotte, par véhicule et par trajet.
- **Contrôle & Audit** : réconciliation (résas, encaissements, mouvements par agence), mouvements compagnie, audit (traçabilité).
- **Dépenses** : dépenses en attente CEO, validation.

---

## 3. Duplications détectées

Données présentes dans **plusieurs menus** :

| Donnée | Menus / pages où elle apparaît |
|--------|--------------------------------|
| **CA / revenus totaux (réseau)** | Poste de pilotage, Revenus & Liquidités (Revenus), Performance Réseau, Finance — Caisse (revenus par point de vente) |
| **Billets vendus / réservations** | Poste de pilotage, Performance Réseau, Opérations Réseau (résas aujourd’hui) |
| **Agences actives / nombre d’agences** | Poste de pilotage (top 3), Performance Réseau (agences actives/total, classement) |
| **Sessions ouvertes / postes** | Poste de pilotage, Revenus & Liquidités (ventes en direct), Opérations Réseau |
| **Liquidités / position financière** | Poste de pilotage, Revenus & Liquidités (Liquidités) |
| **Écarts caisse / réconciliation** | Poste de pilotage (écarts caisse), Revenus & Liquidités (écarts shiftReports), Finance — Caisse (différences clôtures), Contrôle & Audit (réconciliation) |
| **Revenus par agence** | Poste de pilotage (top 3), Revenus & Liquidités (Revenus), Performance Réseau (classement), Finance — Caisse (par point de vente) |
| **Flotte / véhicules** | Poste de pilotage (véhicules en transit, flotte indisponible), Opérations Réseau (disponibles/total), Exploitation Flotte (détail) |
| **Dépenses** | Revenus & Liquidités (Liquidités : dépenses récentes), Dépenses (validation CEO) |

---

## 4. Conflits de rôle (pages qui font la même chose)

- **Performance Réseau vs Poste de pilotage**  
  Les deux affichent CA réseau, billets/revenus, et classement ou top agences. Le Poste de pilotage ajoute liquidités, risques, opérations en cours. **Conflit** : la « performance » et le « pilotage » se recouvrent sur CA et agences.

- **Revenus & Liquidités (Revenus) vs Performance Réseau**  
  Revenus & Liquidités (onglet Revenus) = CA, ventes par agence, écarts. Performance Réseau = CA, classement agences, évolution, santé. **Conflit** : même question « Combien vend-on et où ? » avec des vues légèrement différentes (écarts vs santé/alertes).

- **Finance — Caisse vs Revenus & Liquidités**  
  Caisse = revenus par route/point de vente, clôtures, différences. Revenus & Liquidités = CA (dailyStats/shiftReports), liquidités (comptes). **Conflit** : « Revenus » apparaît dans les deux (CA global vs revenus caisse/points de vente).

- **Opérations Réseau vs Poste de pilotage**  
  Opérations Réseau = réservations du jour, sessions, flotte + liens. Poste de pilotage = indicateurs opérationnels (sessions, courrier, véhicules, embarquements). **Conflit** : même type d’info « Que se passe-t-il côté opérations ? » avec un hub (Opérations Réseau) et un cockpit (Poste de pilotage).

- **Contrôle & Audit (Réconciliation) vs Revenus & Liquidités (écarts)**  
  Réconciliation = résas, encaissements, mouvements par agence + réconciliation. Revenus = écarts shiftReports. **Conflit** : contrôle des écarts et de la cohérence ventes/caisse réparti sur deux entrées.

---

## 5. Proposition d’architecture simplifiée

Chaque menu répond à **une seule question** :

| Menu proposé | Question | Contenu recommandé |
|--------------|----------|---------------------|
| **Poste de pilotage** | « Que se passe-t-il maintenant ? » | Vue synthétique : indicateurs temps réel (sessions, résas du jour, flotte, alertes critiques, 1 ligne position financière, 1 ligne CA du jour), liens vers les modules détaillés. **Retirer** : graphiques lourds, top agences détaillé, écarts détaillés. |
| **Réservations réseau** | « Combien vend-on et où ? » | Fusion Performance Réseau + vue « Revenus » : CA période, billets, évolution (graphique), classement agences, santé réseau, alertes. Un seul endroit pour « ventes et performance réseau ». |
| **Finances** | « Combien d’argent entre et sort ? » | Fusion Revenus & Liquidités + Finance — Caisse : onglets ou sections « CA & Réconciliation », « Liquidités & Comptes », « Caisse & Clôtures ». Tout le financier (CA, encaissements, trésorerie, caisse, clôtures, écarts) dans une seule entrée. |
| **Flotte** | « Quels véhicules travaillent ? » | Fusion Exploitation Flotte + Finance Flotte (ou sous-onglets) : liste véhicules, statuts, affectations + onglet/section « Rentabilité flotte » (revenus, coûts, marge). Opérations Réseau supprimé en tant que menu distinct : ses métriques (résas du jour, sessions, flotte) peuvent rester dans le Poste de pilotage ou dans « Réservations réseau » (au choix). |
| **Audit & contrôle** | « Y a-t-il des problèmes ? » | Contrôle & Audit + Dépenses (validation CEO) : réconciliation, mouvements, écarts, journal d’audit, et validation des dépenses stratégiques. Un seul endroit « contrôle interne et décisions de contrôle ». |

Résumé des fusions proposées :

- **Poste de pilotage** : allégé, uniquement « état actuel » + liens.
- **Réservations réseau** : Performance Réseau + partie « Revenus » (CA, ventes, classement).
- **Finances** : Revenus & Liquidités + Finance — Caisse (tout le financier).
- **Flotte** : Exploitation Flotte + Finance Flotte ; Opérations Réseau intégré au pilotage ou aux résas.
- **Audit & contrôle** : Contrôle & Audit + Dépenses (validation CEO).

---

## 6. Recommandations UI

1. **Éviter la répétition des mêmes KPI**  
   Chaque indicateur (CA réseau, billets vendus, agences actives, liquidités, écarts) ne devrait figurer que dans **un** menu principal ; les autres pages y renvoient par lien (« Voir détail dans Finances », etc.).

2. **Clarifier les noms de menus**  
   « Revenus & Liquidités » et « Finance — Caisse » prêtent à confusion. Un seul menu **Finances** avec onglets ou sections clairement nommés (CA & Réconciliation, Liquidités, Caisse & Clôtures).

3. **Réserver le Poste de pilotage au « maintenant »**  
   Pas de graphiques lourds ni de classements complets ; résumer en 1 ligne ou 1 bloc par thème (CA, liquidités, risques, opérations) + lien vers la page dédiée.

4. **Regrouper « opérations »**  
   Opérations Réseau peut devenir une section du Poste de pilotage ou de Réservations réseau, au lieu d’un menu séparé qui recoupe le cockpit.

5. **Flotte : une entrée, deux vues**  
   Exploitation (véhicules, statuts) et Finance Flotte (rentabilité) dans le même menu « Flotte », avec onglets ou sous-pages.

6. **Audit et dépenses CEO**  
   Garder la validation des dépenses CEO dans un espace « Audit & contrôle » (ou « Contrôle ») pour que le CEO ait un seul point d’entrée pour contrôle interne et décisions de validation.

---

## 7. Schéma simplifié du dashboard CEO

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  ESPACE CEO — Structure proposée                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────┐                                                    │
│  │ Poste de pilotage    │  → Que se passe-t-il maintenant ?                 │
│  │ (synthèse uniquement)│     Indicateurs temps réel + liens                 │
│  └──────────┬──────────┘                                                    │
│             │                                                                 │
│  ┌──────────▼──────────┐  ┌─────────────────────┐  ┌─────────────────────┐│
│  │ Réservations réseau │  │ Finances             │  │ Flotte               ││
│  │ Combien vend-on ?   │  │ Argent entre/sort ? │  │ Véhicules & marge     ││
│  │ CA, classement,     │  │ CA, liquidités,      │  │ Exploitation +        ││
│  │ évolution, alertes  │  │ caisse, clôtures     │  │ Finance Flotte        ││
│  └─────────────────────┘  └─────────────────────┘  └─────────────────────┘│
│                                                                              │
│  ┌─────────────────────┐                                                    │
│  │ Audit & contrôle    │  → Y a-t-il des problèmes ?                         │
│  │ Réconciliation,     │     Réconciliation, mouvements, audit,              │
│  │ mouvements, audit,  │     validation dépenses CEO                         │
│  │ validation dépenses │                                                    │
│  └─────────────────────┘                                                    │
│                                                                              │
│  (Hors périmètre audit : Clients, Avis Clients, Configuration)               │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 8. Synthèse

- **Menus actuels** : 9 entrées (Poste de pilotage, Revenus & Liquidités, Finance — Caisse, Performance Réseau, Opérations Réseau, Exploitation Flotte, Finance Flotte, Contrôle & Audit, Dépenses).
- **Duplications** : CA, billets, agences, sessions, liquidités, écarts, revenus par agence, flotte, dépenses apparaissent dans au moins 2 menus.
- **Conflits** : Performance Réseau / Poste de pilotage / Revenus & Liquidités se recouvrent ; Finance — Caisse et Revenus & Liquidités aussi ; Opérations Réseau et Poste de pilotage ; Contrôle & Audit et Revenus (écarts).
- **Proposition** : 5 menus principaux — **Poste de pilotage** (synthèse), **Réservations réseau** (ventes et performance), **Finances** (tout le financier), **Flotte** (exploitation + rentabilité), **Audit & contrôle** (réconciliation, audit, validation dépenses CEO) — avec une règle : une question par menu, une seule place pour chaque donnée importante.

**Important** : le présent document est un audit fonctionnel uniquement ; aucun code n’a été modifié.
