# Plan de tests E2E Playwright — TELIYA

Document généré à partir de :
- `docs/SCENARIOS_METIER_TELIYA.md`
- `docs/ROLES_ET_PERMISSIONS_TELIYA.md`
- `docs/FLUX_METIER_TELIYA_MATRICE.md`

Pour chaque flux métier : **rôle(s)**, **fichier de test**, **étapes Playwright**, **assertions UI**, **assertions Firestore** (quand applicable). Les assertions Firestore en E2E peuvent être réalisées via un helper Node (Firebase Admin) en fin de scénario ou déléguées à des tests d’intégration.

---

## Convention des fichiers de test

- **Emplacement** : `tests/playwright/`
- **Nommage** : `{flux}-flow.spec.ts` ou `{flux}-e2e.spec.ts`
- **Import** : `import { test, expect as pwExpect } from "@playwright/test";` (éviter les conflits de type avec Vitest)
- **Credentials** : variables d’environnement optionnelles `E2E_*_EMAIL`, `E2E_*_PASSWORD` pour exécution avec comptes réels ; sinon placeholders (tests de structure / redirection).

---

## Flux 1 — Réservation client (en ligne)

| Élément | Détail |
|--------|--------|
| **Rôle(s)** | Client (anonyme), éventuellement Comptable (validation) |
| **Fichier test** | `tests/playwright/reservation-client-flow.spec.ts` |

### Tests à implémenter

| # | Nom du test | Rôle | Étapes Playwright | Assertions UI | Assertions Firestore |
|---|-------------|------|-------------------|---------------|----------------------|
| 1.1 | `reservation client: page reserver accessible (public)` | — | `page.goto("/{slug}/reserver")` ; attendre load | URL contient `/reserver` ; formulaire visible (trajet, nom, téléphone) ou message "Aucun trajet" | — |
| 1.2 | `reservation client: création brouillon puis redirection payment` | Client | Aller sur `/{slug}/reserver` ; sélectionner trajet/date/heure si disponibles ; remplir nom, téléphone ; cliquer "Passer au paiement" | Redirection vers `/{slug}/payment/:id` ou `/payment/:id` ; ou message d’erreur si pas de trajet | (Optionnel) Vérifier doc dans `companies/{cid}/agences/{aid}/reservations` avec `statut: 'en_attente_paiement'`, `canal: 'en_ligne'` ; entrée dans `publicReservations` |
| 1.3 | `reservation client: page payment affiche moyens de paiement` | Client | Après création (ou état simulé), aller sur `/{slug}/payment/:reservationId` | Titre / texte "Paiement" ou liste de moyens de paiement visible | — |
| 1.4 | `reservation client: page upload preuve accessible` | Client | Depuis payment, naviguer vers upload-preuve (ou lien direct) | Page upload preuve visible ; champ référence / message | — |
| 1.5 | `reservation client: consultation billet par token` | Client | Ouvrir `/{slug}/mon-billet?r=TOKEN` (token valide) ou `/{slug}/reservation/:id` | Billet affiché ; statut (Valide / En attente / etc.) ; QR si statut confirme/paye | — |
| 1.6 | `reservation client: accès refusé sans token ou id invalide` | Client | Ouvrir `/{slug}/mon-billet?r=invalid` ou `/{slug}/reservation/fake-id` | Message d’erreur ou "Réservation introuvable" | — |

---

## Flux 2 — Vente au guichet (cycle poste)

| Élément | Détail |
|--------|--------|
| **Rôle(s)** | Guichetier, Comptable agence (agency_accountant) |
| **Fichier test** | `tests/playwright/guichet-flow.spec.ts` (existant) + extension |

### Tests à implémenter

| # | Nom du test | Rôle | Étapes Playwright | Assertions UI | Assertions Firestore |
|---|-------------|------|-------------------|---------------|----------------------|
| 2.1 | `guichet: ouverture page login puis guichet` | Guichetier | (Existant) Login → `/agence/guichet` | URL `/agence/guichet` ; onglet/bouton "Guichet" visible | — |
| 2.2 | `guichet: ouverture poste (PENDING)` | Guichetier | Login guichetier ; aller guichet ; cliquer "Ouvrir poste" / "Démarrer" | Statut poste "En attente" ou équivalent ; bouton désactivé si déjà ouvert | Doc dans `shifts` avec `status: 'pending'` |
| 2.3 | `comptabilite: activation poste guichet (ACTIVE)` | Comptable agence | Login comptable ; `/agence/comptabilite` ; liste postes en attente ; cliquer "Activer" sur un poste | Poste passé en "Actif" ou disparu de la liste "En attente" | `shifts/{id}.status === 'active'` ; `shiftReports/{id}` existant, status `pending_validation` |
| 2.4 | `guichet: vente billet (si poste actif)` | Guichetier | Poste actif ; remplir formulaire vente (trajet, date, heure, client, montant) ; soumettre | Message succès ; billet dans "Ventes récentes" ou liste ; référence affichée | Doc dans `reservations` avec `canal: 'guichet'`, `statut: 'paye'`, `shiftId` |
| 2.5 | `guichet: clôture poste (CLOSED)` | Guichetier | Poste actif ; cliquer "Clôturer le poste" ; confirmer si modal | Résumé (billets, montant) ; statut "Clôturé" ; message de succès | `shifts/{id}.status === 'closed'` ; `shiftReports` mis à jour (billets, montant, status `pending_validation`) ; `dailyStats` closedSessions +1 |
| 2.6 | `comptabilite: validation poste (VALIDATED)` | Comptable agence | Liste postes clôturés ; sélectionner un poste ; saisir montant reçu ; valider | Poste marqué "Validé" ou retiré des en attente ; pas d’erreur | `shifts/{id}.status === 'validated'` ; `shiftReports` status `validated` ; `financialMovements` une entrée revenue_cash ; `dailyStats` ticketRevenue incrémenté |

---

## Flux 3 — Embarquement passager

| Élément | Détail |
|--------|--------|
| **Rôle(s)** | Chef embarquement (chefEmbarquement), Chef agence |
| **Fichier test** | `tests/playwright/boarding-flow.spec.ts` (existant) + extension |

### Tests à implémenter

| # | Nom du test | Rôle | Étapes Playwright | Assertions UI | Assertions Firestore |
|---|-------------|------|-------------------|---------------|----------------------|
| 3.1 | `boarding: accès dashboard puis scan` | Chef embarquement | (Existant) Login → `/agence/boarding` → sélection départ → `/agence/boarding/scan` | URL `/agence/boarding` puis `/agence/boarding/scan` ; titre "Liste d'embarquement" ou équivalent | — |
| 3.2 | `boarding: scan code / saisie référence (embarqué)` | Chef embarquement | Sur page scan ; saisir référence ou simuler scan ; valider | Message succès "Embarqué" ou billet passé en "Embarqué" dans la liste | `reservations/{id}.statut === 'embarque'`, `statutEmbarquement === 'embarqué'`, `checkInTime` ; `boardingStats` embarkedSeats +1 ; `boardingLocks` doc créé ; `boardingLogs` entrée |
| 3.3 | `boarding: marquer absent` | Chef embarquement | Depuis liste, cliquer "Absent" sur un billet | Billet affiché comme "Absent" | `reservations/{id}.statutEmbarquement === 'absent'` |
| 3.4 | `boarding: clôture embarquement` | Chef embarquement | Cliquer "Clôturer l'embarquement" ; confirmer | Liste en lecture seule ou message "Clôturé" ; bouton clôturer désactivé | `boardingStats` pour le trajet : `status === 'closed'`, absentSeats renseigné ; `dailyStats` boardingClosedCount +1 |

---

## Flux 4 — Envoi de colis (courrier) + validation comptable

| Élément | Détail |
|--------|--------|
| **Rôle(s)** | Agent courrier (agentCourrier), Comptable agence |
| **Fichier test** | `tests/playwright/courrier-flow.spec.ts` (existant) + extension |

### Tests à implémenter

| # | Nom du test | Rôle | Étapes Playwright | Assertions UI | Assertions Firestore |
|---|-------------|------|-------------------|---------------|----------------------|
| 4.1 | `courrier: accès session puis création session (PENDING)` | Agent courrier | Login agent courrier ; `/agence/courrier/session` ; "Créer une session" | Message "Session en attente" ou statut PENDING ; bouton "Nouvel envoi" désactivé tant que pas activée | `courierSessions` : nouveau doc `status: 'PENDING'` |
| 4.2 | `comptabilite: activation session courrier (ACTIVE)` | Comptable agence | `/agence/comptabilite` ; onglet/section sessions courrier ; "Activer" sur une session PENDING | Session affichée comme "Active" | `courierSessions/{id}.status === 'ACTIVE'`, `openedAt`, `activatedBy` |
| 4.3 | `courrier: création envoi (session active)` | Agent courrier | Session ACTIVE ; aller "Nouvel envoi" ; remplir expéditeur, destinataire, agence destination, nature, montants ; soumettre | Succès ; numéro d'envoi affiché ; envoi dans la liste | Doc dans `logistics/data/shipments` avec `currentStatus: 'CREATED'`, `sessionId` ; `counters/shipmentSeq` incrémenté |
| 4.4 | `courrier: clôture session (CLOSED)` | Agent courrier | Sur session ; "Clôturer la session" | Montant attendu affiché ; statut "Clôturée" | `courierSessions/{id}.status === 'CLOSED'`, `expectedAmount` > 0 |
| 4.5 | `comptabilite: validation session courrier (VALIDATED)` | Comptable agence | Comptabilité ; session courrier CLOSED ; saisir montant compté ; valider | Session "Validée" ; écart affiché si différent | `courierSessions/{id}.status === 'VALIDATED'`, `validatedAmount`, `difference` ; `dailyStats` courierRevenue ; `financialMovements` revenue_cash |

---

## Flux 5 — Réception de colis

| Élément | Détail |
|--------|--------|
| **Rôle(s)** | Agent courrier (agence de destination), Chef agence |
| **Fichier test** | `tests/playwright/courrier-reception-flow.spec.ts` |

### Tests à implémenter

| # | Nom du test | Rôle | Étapes Playwright | Assertions UI | Assertions Firestore |
|---|-------------|------|-------------------|---------------|----------------------|
| 5.1 | `courrier reception: accès page réception` | Agent courrier | Login ; `/agence/courrier/reception` | URL `/agence/courrier/reception` ; titre ou liste des envois à réceptionner | — |
| 5.2 | `courrier reception: marquer envoi arrivé` | Agent courrier | Liste envois (CREATED ou IN_TRANSIT) ; cliquer "Marquer arrivé" / "Réceptionner" sur un envoi | Envoi passe en "Arrivé" ou disparaît de la liste "À réceptionner" | `shipments/{id}.currentStatus === 'ARRIVED'`, `currentAgencyId` ; entrée dans `logistics/data/events` eventType `ARRIVED` |

---

## Flux 6 — Gestion flotte (affectation → départ → arrivée)

| Élément | Détail |
|--------|--------|
| **Rôle(s)** | Chef agence (chefAgence), Contrôleur flotte (agency_fleet_controller) |
| **Fichier test** | `tests/playwright/fleet-flow.spec.ts` (existant) + extension |

### Tests à implémenter

| # | Nom du test | Rôle | Étapes Playwright | Assertions UI | Assertions Firestore |
|---|-------------|------|-------------------|---------------|----------------------|
| 6.1 | `fleet: accès exploitation flotte` | Chef agence / Flotte | Login ; `/agence/fleet/operations` | URL `/agence/fleet/operations` ; sections "Véhicules disponibles", "Départs affectés", "En transit" ou équivalent | — |
| 6.2 | `fleet: affectation véhicule (AFFECTE)` | Chef agence / Flotte | Sélectionner un véhicule disponible ; "Affecter" ; remplir trajet, équipage, horaire ; valider | Véhicule apparaît dans "Départs affectés" ; statut "Affecté" | `affectations` : nouveau doc `status: 'AFFECTE'` ; `vehicles/{id}.operationalStatus === 'AFFECTE'` (ou équivalent) |
| 6.3 | `fleet: confirmer départ (DEPART_CONFIRME)` | Chef agence / Flotte | Dans "Départs affectés", cliquer "Confirmer départ" sur une affectation | Véhicule passe dans "En transit" ou statut "Départ confirmé" | `affectations/{id}.status === 'DEPART_CONFIRME'` ; véhicule `operationalStatus: 'EN_TRANSIT'` |
| 6.4 | `fleet: confirmer arrivée (ARRIVE)` | Chef agence (destination) | Contexte agence d’arrivée ; "En transit vers moi" ; "Confirmer arrivée" | Véhicule repasse en "Disponible" ou disparaît de "En transit" | `affectations/{id}.status === 'ARRIVE'` ; véhicule `operationalStatus: 'GARAGE'` |

---

## Flux 7 — Session caisse (ouvert / clôturé)

| Élément | Détail |
|--------|--------|
| **Rôle(s)** | Guichetier, Agent courrier (cashControl) |
| **Fichier test** | `tests/playwright/cash-sessions-flow.spec.ts` |

### Tests à implémenter

| # | Nom du test | Rôle | Étapes Playwright | Assertions UI | Assertions Firestore |
|---|-------------|------|-------------------|---------------|----------------------|
| 7.1 | `cash-sessions: accès page sessions caisse` | Guichetier / Agent | Login ; `/agence/cash-sessions` | URL `/agence/cash-sessions` ; titre ou liste des sessions | — |
| 7.2 | `cash-sessions: ouverture session (OPEN)` | Guichetier / Agent | "Ouvrir une session" ; saisir solde d’ouverture ; valider | Nouvelle session affichée avec statut "Ouverte" ; solde attendu affiché | `cashSessions` : doc avec `status: 'OPEN'`, `openingBalance`, `expectedBalance` |
| 7.3 | `cash-sessions: clôture session (CLOSED)` | Guichetier / Agent | Sur session ouverte ; "Clôturer" ; saisir montants comptés (espèces, mobile, etc.) ; valider | Session "Clôturée" ; écarts affichés si présents | `cashSessions/{id}.status === 'CLOSED'`, `countedCash`, `closedAt` |

---

## Flux 8 — Versement agence → banque (remontée comptable)

| Élément | Détail |
|--------|--------|
| **Rôle(s)** | Comptable agence (initiateur), Chef agence (validateur) |
| **Fichier test** | `tests/playwright/treasury-transfer-flow.spec.ts` |

### Tests à implémenter

| # | Nom du test | Rôle | Étapes Playwright | Assertions UI | Assertions Firestore |
|---|-------------|------|-------------------|---------------|----------------------|
| 8.1 | `treasury transfer: accès page versement` | Comptable agence | Login comptable ; `/agence/treasury/transfer` | URL `/agence/treasury/transfer` ; formulaire ou liste des demandes | — |
| 8.2 | `treasury transfer: création demande (pending_manager)` | Comptable agence | Remplir montant, compte caisse, compte banque, description ; soumettre | Demande apparaît en "En attente de validation" ou succès | `treasuryTransferRequests` : doc `status: 'pending_manager'` |
| 8.3 | `treasury transfer: approbation par chef agence` | Chef agence | Login chef agence ; `/agence/treasury/transfer` (ou liste demandes) ; "Approuver" sur une demande | Demande "Approuvée" / "Exécutée" ; message succès | `treasuryTransferRequests/{id}.status === 'approved'` (ou `executed`) ; `financialMovements` : débit caisse, crédit banque |
| 8.4 | `treasury transfer: rejet par chef agence` | Chef agence | "Rejeter" ; saisir motif ; confirmer | Demande "Rejetée" | `treasuryTransferRequests/{id}.status === 'rejected'`, `managerDecisionReason` |

---

## Flux 9 — Dépense agence (création → approbation → payée)

| Élément | Détail |
|--------|--------|
| **Rôle(s)** | Agent / Chef agence (création), Chef agence / Comptable / CEO (approbation) |
| **Fichier test** | `tests/playwright/expenses-flow.spec.ts` |

### Tests à implémenter

| # | Nom du test | Rôle | Étapes Playwright | Assertions UI | Assertions Firestore |
|---|-------------|------|-------------------|---------------|----------------------|
| 9.1 | `expenses: accès trésorerie et création dépense` | Chef agence | Login ; `/agence/treasury` ou `/agence/treasury/new-operation` ; formulaire "Nouvelle demande de dépense" | Formulaire visible ; champs catégorie, description, montant | — |
| 9.2 | `expenses: soumission dépense (pending_*)` | Chef agence | Remplir catégorie, description, montant ; soumettre | Message succès ; dépense dans la liste "En attente" | `expenses` : doc avec status `pending_manager` / `pending_accountant` / `pending_ceo` selon seuils |
| 9.3 | `expenses: approbation dépense (chef agence)` | Chef agence | `/agence/expenses-approval` ; liste dépenses pending_manager ; "Approuver" sur une dépense | Dépense passe en "Approuvée" ou vers étape suivante | `expenses/{id}.status` mis à jour (approved ou pending_accountant) |
| 9.4 | `expenses: rejet dépense` | Chef agence | "Rejeter" ; saisir motif ; confirmer | Dépense "Rejetée" | `expenses/{id}.status === 'rejected'`, `rejectedBy`, `rejectionReason` |
| 9.5 | `expenses: marquer payée (si workflow)` | Comptable / CEO | Espace dépenses (compagnie ou agence) ; "Marquer payée" sur une dépense approuvée | Statut "Payée" | `expenses/{id}.status === 'paid'`, `paidAt` ; `financialMovements` débit compte |

---

## Flux 10 — Supervision dashboard compagnie (CEO)

| Élément | Détail |
|--------|--------|
| **Rôle(s)** | admin_compagnie (CEO) |
| **Fichier test** | `tests/playwright/dashboard-compagnie-flow.spec.ts` ou extension `ceo-dashboard-flow.spec.ts` |

### Tests à implémenter

| # | Nom du test | Rôle | Étapes Playwright | Assertions UI | Assertions Firestore |
|---|-------------|------|-------------------|---------------|----------------------|
| 10.1 | `ceo: login et redirection command center` | CEO | Login avec compte admin_compagnie (companyId renseigné) | Redirection vers `/compagnie/:companyId/command-center` | — |
| 10.2 | `ceo: command center affiche blocs` | CEO | Sur `/compagnie/:companyId/command-center` | Au moins un bloc visible (Revenus, Risques, Actions rapides, etc.) ; pas d’erreur full page | — |
| 10.3 | `ceo: navigation vers payment-approvals et revenus` | CEO | Cliquer liens "Approbations paiements", "Revenus / Liquidités" | URL `/payment-approvals` et `/revenus-liquidites` ; contenu ou tableau vide | — |

---

## Récapitulatif des fichiers de test

| Fichier | Flux | Rôles principaux |
|---------|------|------------------|
| `reservation-client-flow.spec.ts` | 1. Réservation client | Client (public) |
| `guichet-flow.spec.ts` | 2. Vente guichet | Guichetier, Comptable agence |
| `boarding-flow.spec.ts` | 3. Embarquement | Chef embarquement, Chef agence |
| `courrier-flow.spec.ts` | 4. Envoi colis + validation | Agent courrier, Comptable agence |
| `courrier-reception-flow.spec.ts` | 5. Réception colis | Agent courrier (destination) |
| `fleet-flow.spec.ts` | 6. Gestion flotte | Chef agence, Contrôleur flotte |
| `cash-sessions-flow.spec.ts` | 7. Session caisse | Guichetier, Agent courrier |
| `treasury-transfer-flow.spec.ts` | 8. Versement agence | Comptable agence, Chef agence |
| `expenses-flow.spec.ts` | 9. Dépense agence | Chef agence, Comptable, CEO |
| `ceo-dashboard-flow.spec.ts` | 10. Dashboard compagnie | CEO |

Fichiers déjà présents (à compléter selon le plan) : `reservation-flow.spec.ts`, `guichet-flow.spec.ts`, `boarding-flow.spec.ts`, `courrier-flow.spec.ts`, `fleet-flow.spec.ts`, `treasury-flow.spec.ts`, `dashboard-flow.spec.ts`, `admin-flow.spec.ts`, `accounting-flow.spec.ts`. Les noms ci‑dessus peuvent être alignés avec ceux existants (ex. `treasury-flow.spec.ts` pour flux 8, et un fichier dédié dépenses pour flux 9).

---

## Bonnes pratiques pour l’implémentation

1. **Login** : réutiliser un helper ou `beforeEach` avec `E2E_*_EMAIL` / `E2E_*_PASSWORD` ; si absent, les tests peuvent se contenter de vérifier redirection login ou structure de page.
2. **Sélecteurs** : privilégier `getByRole`, `getByLabel`, `getByText` ; éviter les classes CSS.
3. **Réseau** : `page.waitForLoadState("networkidle").catch(() => {})` après navigation si besoin.
4. **Assertions Firestore** : en E2E pur, vérifier l’état via l’UI (statut affiché, listes). Pour des assertions directes sur Firestore, ajouter un module Node utilisant Firebase Admin (ex. `tests/e2e-helpers/firestore-assertions.ts`) appelé depuis un test Playwright en mode Node (si votre setup le permet) ou des tests d’intégration séparés.
5. **Données de test** : utiliser un slug/trajet/agence de test ou des mocks ; éviter de dépendre de données de prod.
6. **Ordre des tests** : les scénarios multi-étapes (guichet, courrier) peuvent être découpés en plusieurs `test()` (ouverture poste, vente, clôture, validation) pour lisibilité et rejeu ciblé.

---

---

## Liste des tests (checklist implémentation)

| Id | Fichier | Nom du test | Statut |
|----|---------|-------------|--------|
| 1.1 | reservation-client-flow.spec.ts | reservation client: page reserver accessible (public) | À implémenter |
| 1.2 | reservation-client-flow.spec.ts | reservation client: création brouillon puis redirection payment | À implémenter |
| 1.3 | reservation-client-flow.spec.ts | reservation client: page payment affiche moyens de paiement | À implémenter |
| 1.4 | reservation-client-flow.spec.ts | reservation client: page upload preuve accessible | À implémenter |
| 1.5 | reservation-client-flow.spec.ts | reservation client: consultation billet par token | À implémenter |
| 1.6 | reservation-client-flow.spec.ts | reservation client: accès refusé sans token ou id invalide | À implémenter |
| 2.1 | guichet-flow.spec.ts | guichet: ouverture page login puis guichet | Existant (équivalent) |
| 2.2 | guichet-flow.spec.ts | guichet: ouverture poste (PENDING) | À implémenter |
| 2.3 | guichet-flow.spec.ts | comptabilite: activation poste guichet (ACTIVE) | À implémenter |
| 2.4 | guichet-flow.spec.ts | guichet: vente billet (si poste actif) | À implémenter |
| 2.5 | guichet-flow.spec.ts | guichet: clôture poste (CLOSED) | À implémenter |
| 2.6 | guichet-flow.spec.ts | comptabilite: validation poste (VALIDATED) | À implémenter |
| 3.1 | boarding-flow.spec.ts | boarding: accès dashboard puis scan | Existant (équivalent) |
| 3.2 | boarding-flow.spec.ts | boarding: scan code / saisie référence (embarqué) | À implémenter |
| 3.3 | boarding-flow.spec.ts | boarding: marquer absent | À implémenter |
| 3.4 | boarding-flow.spec.ts | boarding: clôture embarquement | À implémenter |
| 4.1 | courrier-flow.spec.ts | courrier: accès session puis création session (PENDING) | À implémenter (accès existant) |
| 4.2 | courrier-flow.spec.ts | comptabilite: activation session courrier (ACTIVE) | À implémenter |
| 4.3 | courrier-flow.spec.ts | courrier: création envoi (session active) | À implémenter |
| 4.4 | courrier-flow.spec.ts | courrier: clôture session (CLOSED) | À implémenter |
| 4.5 | courrier-flow.spec.ts | comptabilite: validation session courrier (VALIDATED) | À implémenter |
| 5.1 | courrier-reception-flow.spec.ts | courrier reception: accès page réception | À implémenter |
| 5.2 | courrier-reception-flow.spec.ts | courrier reception: marquer envoi arrivé | À implémenter |
| 6.1 | fleet-flow.spec.ts | fleet: accès exploitation flotte | Existant (équivalent) |
| 6.2 | fleet-flow.spec.ts | fleet: affectation véhicule (AFFECTE) | À implémenter |
| 6.3 | fleet-flow.spec.ts | fleet: confirmer départ (DEPART_CONFIRME) | À implémenter |
| 6.4 | fleet-flow.spec.ts | fleet: confirmer arrivée (ARRIVE) | À implémenter |
| 7.1 | cash-sessions-flow.spec.ts | cash-sessions: accès page sessions caisse | À implémenter |
| 7.2 | cash-sessions-flow.spec.ts | cash-sessions: ouverture session (OPEN) | À implémenter |
| 7.3 | cash-sessions-flow.spec.ts | cash-sessions: clôture session (CLOSED) | À implémenter |
| 8.1 | treasury-transfer-flow.spec.ts | treasury transfer: accès page versement | À implémenter (treasury-flow existant proche) |
| 8.2 | treasury-transfer-flow.spec.ts | treasury transfer: création demande (pending_manager) | À implémenter |
| 8.3 | treasury-transfer-flow.spec.ts | treasury transfer: approbation par chef agence | À implémenter |
| 8.4 | treasury-transfer-flow.spec.ts | treasury transfer: rejet par chef agence | À implémenter |
| 9.1 | expenses-flow.spec.ts | expenses: accès trésorerie et création dépense | À implémenter |
| 9.2 | expenses-flow.spec.ts | expenses: soumission dépense (pending_*) | À implémenter |
| 9.3 | expenses-flow.spec.ts | expenses: approbation dépense (chef agence) | À implémenter |
| 9.4 | expenses-flow.spec.ts | expenses: rejet dépense | À implémenter |
| 9.5 | expenses-flow.spec.ts | expenses: marquer payée (si workflow) | À implémenter |
| 10.1 | ceo-dashboard-flow.spec.ts | ceo: login et redirection command center | À implémenter |
| 10.2 | ceo-dashboard-flow.spec.ts | ceo: command center affiche blocs | À implémenter |
| 10.3 | ceo-dashboard-flow.spec.ts | ceo: navigation vers payment-approvals et revenus | À implémenter |

**Total : 43 cas de test** (dont 3 déjà couverts par les specs existants à titre de smoke ; le reste à implémenter ou à compléter).

---

*Plan dérivé des documents SCENARIOS_METIER_TELIYA, ROLES_ET_PERMISSIONS_TELIYA et FLUX_METIER_TELIYA_MATRICE.*
