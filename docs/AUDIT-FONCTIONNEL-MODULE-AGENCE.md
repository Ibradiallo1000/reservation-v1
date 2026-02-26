# Audit fonctionnel complet — Module Agence Teliya

**Date :** Février 2025  
**Périmètre :** Logique métier et architecture du module Agence (pas d’analyse UI ni design).  
**Objectif :** Cartographie fonctionnelle complète avant renforcement des dashboards et introduction de rôles plus granulaires (`agency_boarding_officer`, `agency_fleet_controller`).

---

## Contexte rappelé

- Une **Compagnie** possède plusieurs **Agences**.
- L’**Agence** est le cœur opérationnel : revenus, réservations, embarquement et affectation véhicules y sont rattachés.
- Rôles connus : `agency_manager` (chef d’agence / chefAgence), `agency_cashier` (guichetier), `company_accountant`, `company_ceo` (admin_compagnie), `admin_platform`. Côté app : `chefAgence`, `guichetier`, `agency_accountant`, `embarquement`.

---

## 1. Analyse des rôles au sein de l’agence

### 1.1 Chef d’agence (`chefAgence` / agency_manager)

**Ce qu’il peut faire :**
- Accéder au shell agence : dashboard, réservations, embarquement, trajets, garage (affectation véhicules), recettes, finances, personnel, shift, shift-history, rapports.
- Accéder au guichet (même interface que le guichetier) : vente, rapport, historique, activation de poste (demande), pause / reprise / clôture.
- Accéder à la page validations chef : `/agence/validations` (approbation des postes après validation comptable).
- Activer / mettre en pause / reprendre les postes des guichetiers (via la page Comptabilité agence si accès, ou via widgets dédiés selon les pages).
- Consulter et imprimer les reçus guichet : `/agence/receipt/:id`.

**Pages accessibles (routes) :**
- `/agence/*` (toutes les routes sous `AgenceShellPage` : dashboard, reservations, embarquement, trajets, garage, recettes, finances, personnel, shift, shift-history, rapports).
- `/agence/guichet` (guichet).
- `/agence/validations` (ValidationChefAgencePage).
- `/agence/comptabilite` : **non** dans `AppRoutes` (réservé à `agency_accountant` et `admin_compagnie`). Donc le chef d’agence ne peut pas activer les postes depuis la page Comptabilité agence telle que routée actuellement ; l’activation se fait ailleurs (ex. `ShiftsControlWidget`, `AgenceReservationsPage`).
- `/agence/receipt/:id`.

**Actions Firestore (lecture / écriture) :**
- **Lecture :** `companies/{companyId}/agences/{agencyId}/shifts`, `reservations`, `weeklyTrips`, `shiftReports`, agence, compagnie, users (codes vendeurs).
- **Écriture :** `shifts` (pause, continue, éventuellement validation miroir), `reservations` (si utilisation du guichet), `affectations` (garage), `boardingLocks`, `boardingLogs`, `reservations` (embarquement), `boardingClosures`, etc. Selon les écrans : validation chef sur `shiftReports` + `shifts` (useActiveShift.validateByManager), ou via `chefApproveShift` sur `shifts` (statut `valide_definitif`).

**Chevauchements :**
- Avec **guichetier** : accès guichet complet (vente, rapport, historique). Un chef peut vendre et clôturer un poste comme un guichetier.
- Avec **embarquement** : accès à la même page embarquement (scan QR, absent, clôture trajet).

**Risques / conflits :**
- Un chef peut faire de la vente guichet sans poste dédié (selon implémentation) ou avec son propre poste : flou sur la traçabilité “qui a vendu”.
- Validation chef existe en deux formes : `useActiveShift.validateByManager` (update léger sur `shiftReports` + `shifts`) et `chefApproveShift` (transaction avec `lockedChef`, statut `valide_definitif`). Risque de double flux de validation (voir section Sessions).

---

### 1.2 Guichetier (`guichetier` / agency_cashier)

**Ce qu’il peut faire :**
- Ouvrir une session (demande d’activation → statut `pending`).
- Vendre des billets au guichet (espèces uniquement) lorsque le poste est `active` (après activation par la comptabilité).
- Mettre en pause / reprendre / clôturer son poste.
- Consulter le rapport du poste en cours, les rapports en attente de validation, l’historique des rapports validés.
- Éditer / annuler des réservations guichet (sauf si passager déjà embarqué).
- Accéder au reçu : `/agence/receipt/:id`.

**Pages accessibles :**
- `/agence/guichet` (AgenceGuichetPage).
- `/agence/receipt/:id`.

**Actions Firestore :**
- **Lecture :** `companies/{companyId}/agences/{agencyId}/shifts` (via useActiveShift : son shift pending/active/paused), `reservations` (liste pour onglet Guichet + places restantes), `weeklyTrips`, agence, compagnie, `shiftReports` (rapport en cours, en attente, historique), `users` (code vendeur).
- **Écriture :** `shifts` (création en `pending`, update pause/continue/close via useActiveShift), `shiftReports` (création à la clôture via useActiveShift), `reservations` (création vente, update annulation/édition), `companies/.../counters/byTrip/trips/{tripInstanceId}` (référence unique).

**Contrôles métier :**
- Vente possible seulement si `canSell = (status === 'active') && companyId && agencyId`.
- Annulation : canal guichet uniquement, passager non embarqué, motif ≥ 5 caractères.
- Référence de billet : génération atomique par transaction sur un compteur par trajet.

**Risques :**
- Pas de contrôle Firestore par rôle : tout utilisateur authentifié peut lire/écrire (règles actuelles). La restriction “guichetier” est uniquement par route et par `useActiveShift` (filtre par `userId`).
- Un guichetier ne peut pas s’activer lui-même : dépendance explicite à l’activation par la comptabilité (ou un autre rôle ayant accès à l’activation).

---

### 1.3 Comptable agence (`agency_accountant`)

**Ce qu’il peut faire :**
- Activer les postes en attente (`pending` → `active`).
- Mettre en pause / reprendre les postes actifs.
- Consulter la liste des postes (tous statuts), les réservations par poste, les rapports.
- Valider la réception espèces (workflow principal) : saisie du montant reçu, création d’un `cashReceipt`, mise à jour du shift (`status: 'closed'`, champs comptable) et du `shiftReports` (accountantValidated, etc.).
- Accéder aux onglets : Contrôle des postes, Réceptions, Rapports, Caisse, Réconciliation.

**Pages accessibles :**
- `/agence/comptabilite` (AgenceComptabilitePage).

**Actions Firestore :**
- **Lecture :** `companies/{companyId}/agences/{agencyId}/shifts`, `reservations`, `shiftReports`, `cashReceipts`, `cashMovements`, agence.
- **Écriture :** `shifts` (status active/paused, closed, comptable, cashReceived, etc.), `shiftReports` (merge avec accountantValidated, timestamps), `cashReceipts` (création réception), `cashMovements` (écritures de réconciliation).

**Chevauchements :**
- Avec chef d’agence : aucun sur la page Comptabilité (le chef n’a pas la route `/agence/comptabilite` dans les allowedRoles). En revanche, le chef peut valider les rapports (validateByManager) depuis d’autres écrans (ex. AgenceReservationsPage, validations).

**Risques :**
- Deux flux de validation comptable coexistent : (1) AgenceComptabilitePage (réception espèces, update direct `shifts` + `shiftReports` en `closed`/validé), (2) validateShiftWithDeposit qui attend `status === 'cloture'` sur le document shift — alors que useActiveShift met `status: 'closed'`. Donc validateShiftWithDeposit ne peut pas valider les postes clôturés par le hook (incohérence de vocabulaire statut).
- Pas de verrou `lockedComptable` dans le flux principal AgenceComptabilitePage ; les modales ValidateShiftModal/ChefApprovalModal (validateShiftWithDeposit/chefApproveShift) utilisent ce verrou mais sont branchées sur un statut `cloture` qui n’est pas posé par le code actuel de clôture.

---

### 1.4 Rôle embarquement (`embarquement`)

**Ce qu’il peut faire :**
- Accéder à la page Embarquement : scan QR / saisie code, validation trajet/date/heure, marquage “embarqué” ou “absent”.
- Clôture d’embarquement par trajet (boardingClosures).
- Actions “absent + reprogrammer” (report + revente) et clôture de trajet avec marquage des non-présents.

**Pages accessibles :**
- Sous shell agence : `/agence/embarquement` (AgenceEmbarquementPage).

**Actions Firestore :**
- **Lecture :** `reservations` (recherche par code, par trajet/date/heure), `weeklyTrips`, `affectations`, `boardingLocks`, `boardingClosures`, `boardingLogs`.
- **Écriture :** `reservations` (statut embarquement, controleurId, checkInTime), `boardingLocks` (éviter double scan), `boardingLogs` (traçabilité), `boardingClosures`, création éventuelle de réservations (reprogrammation).

**Chevauchements :**
- Même écran et mêmes droits que le chef d’agence pour l’embarquement. Aucune séparation métier entre “agent embarquement” et “chef” sur cette page.

**Risques :**
- Aucun rôle dédié “boarding officer” : l’embarquement est partagé entre chef et rôle “embarquement”. Pour introduire `agency_boarding_officer`, il faudra restreindre l’accès à cette page et aux collections associées.

---

### 1.5 Rôle finance (compagnie) et plateforme

- **company_accountant** / **financial_director** : accès `/compta/validations` (ValidationComptablePage), pas d’accès direct au module agence (pas de route `/agence/comptabilite`).
- **admin_compagnie** : accès à tout le périmètre agence (guichet, comptabilité agence, validations chef).
- **admin_platforme** : dashboard plateforme, statistiques, paramètres ; pas d’accès opérationnel agence dans les routes analysées.

---

### 1.6 Synthèse rôles : overlaps et risques

| Élément | Détail |
|--------|--------|
| **Overlaps** | Chef = guichet + embarquement + garage + validations. Guichetier = guichet uniquement. Comptable agence = activation + réception espèces. Embarquement = même page que chef. |
| **Risques sécurité** | Firestore : `allow read, write: if request.auth != null` sur le fallback ; pas de restriction par rôle ni par agence. Sécurité uniquement par routes et par filtres applicatifs (userId pour shifts). |
| **Conflits** | Double flux de validation des postes (shiftReports + shifts vs validateShiftWithDeposit/chefApproveShift avec statut `cloture`/lockedComptable). Collection `shift_reports` (shiftApi) vs `shiftReports` (reste du code) : les fonctions shiftApi listValidatedReports/listPendingReports/validateReportClient ciblent une collection qui n’est pas alimentée par la clôture actuelle. |

---

## 2. Audit du système de sessions (Guichet)

### 2.1 Démarrage de session

- Le guichetier appelle `startShift()` (useActiveShift).
- Le hook vérifie qu’il n’existe pas déjà de shift ouvert (pending/active/paused) pour cet utilisateur (`findOpenedShiftId`).
- Création d’un document dans `companies/{companyId}/agences/{agencyId}/shifts` avec `status: 'pending'`, `userId`, pas de `startAt` à la création (commentaire : posée à l’activation).
- L’**activation** (passage à `active`) est faite par la **comptabilité agence** (AgenceComptabilitePage) via `activateShift(id)` : `updateDoc(shifts/{id}, { status: 'active', startTime: now, ... })`. Le guichetier ne peut pas s’activer lui-même.

### 2.2 Fin de session (clôture)

- Le guichetier appelle `closeShift()` (useActiveShift).
- Conditions : shift en `active`, `paused` ou `pending`.
- Transaction Firestore :
  - Agrégation des réservations du shift (canal = guichet) : billets, montant, détails par trajet.
  - Création/merge de `shiftReports/{shiftId}` (billets, montant, details, accountantValidated: false, managerValidated: false, status: 'pending_validation').
  - Mise à jour du shift : `status: 'closed'`, `endAt`, `endTime`, `tickets`, `amount`.
- Aucun verrou `lockedComptable` ni statut `cloture` n’est posé à ce stade.

### 2.3 Suivi du chiffre d’affaires par session

- À la clôture : montant agrégé depuis les réservations (canal guichet, shiftId) et stocké dans le document shift (`amount`, `tickets`) et dans `shiftReports` (billets, montant, details).
- Côté comptabilité : agrégation côté client à partir des réservations (onSnapshot par shift) pour afficher les montants attendus ; à la validation “réception espèces”, saisie du montant reçu, création `cashReceipt`, mise à jour shift + shiftReport.

### 2.4 Détection des écarts

- Dans AgenceComptabilitePage : comparaison entre montant calculé (aggByShift) et montant saisi (cashReceived) ; pas de blocage métier si écart, la réception est enregistrée.
- validateShiftWithDeposit (flux alternatif) calcule une différence (depose - attendu), pose `discrepancyType` (manquant/surplus) et `lockedComptable`, mais ce flux n’est pas aligné avec le statut `closed` posé par useActiveShift (il attend `cloture`).

### 2.5 Isolation par utilisateur

- useActiveShift : requête `where('userId', '==', user.uid)` et `where('status', 'in', ['pending','active','paused'])`, `limit(1)`. Un guichetier ne voit qu’un seul shift “ouvert” et ne peut en créer qu’un (findOpenedShiftId avant addDoc). Les shifts sont bien isolés par userId.

### 2.6 Sessions concurrentes

- Plusieurs guichetiers peuvent avoir chacun un shift actif en même temps (un par userId). Pas de limite “un seul poste actif par agence”.
- Plusieurs onglets ou appareils pour le **même** utilisateur : le hook ne permet qu’un shift ouvert ; si un second est créé manuellement (hors app), l’UI pourrait afficher un état incohérent. Pas de verrouillage explicite “un seul client connecté par guichetier”.

### 2.7 Verrouillage de session

- Aucun verrou technique “session ouverte sur une machine”. La clôture est uniquement métier (bouton Clôturer). Un guichetier pourrait en théorie clôturer depuis un autre appareil s’il a le même compte.
- validateShiftWithDeposit/chefApproveShift introduisent des verrous métier (`lockedComptable`, `lockedChef`) mais ne sont pas utilisés dans le flux principal de clôture (statut `closed` + réception dans AgenceComptabilitePage).

### 2.8 Contournement possible

- Un utilisateur avec un rôle ayant accès au shell agence (ex. chef) peut écrire directement dans `shifts` et `reservations` (règles Firestore = isAuth()). Rien n’empêche, côté base, de créer des réservations avec un `shiftId` arbitraire ou de modifier un shift. La cohérence repose sur l’application.
- Un guichetier ne peut pas s’activer lui-même : bon point. En revanche, un comptable agence peut activer n’importe quel poste pending (pas de contrôle “uniquement les postes de mon agence” côté Firestore, uniquement via user.agencyId dans l’app).

### 2.9 Verdict architecture sessions

- **Points solides :** un shift ouvert par guichetier, activation par un tiers (comptabilité), agrégation en transaction à la clôture, écriture de shiftReports, isolation par userId.
- **Fragilités :** double nomenclature de collections (`shiftReports` vs `shift_reports`) et double flux de validation (closed + réception compta vs cloture + validateShiftWithDeposit) ; pas de verrou “une session = un appareil” ; règles Firestore trop permissives (aucune restriction par rôle/agence).

---

## 3. Logique d’embarquement (boarding)

### 3.1 Comment c’est géré aujourd’hui

- Page dédiée : AgenceEmbarquementPage (`/agence/embarquement`), sous le shell agence (accès chef d’agence et rôle embarquement).
- Workflow : sélection agence (si multi-agences), trajet (weeklyTrip) + date + heure, puis scan QR ou saisie du code réservation. La réservation est recherchée (findReservationByCode) puis validée dans une transaction.

### 3.2 Où se trouve la logique de scan QR

- Dans AgenceEmbarquementPage : utilisation de `BrowserMultiFormatReader` (ZXing) pour le scan. Le texte scanné est normalisé (extractCode) pour extraire un code réservation (URL ou texte). La recherche est faite par code dans `reservations` (éventuellement avec contexte trajet/date/heure).

### 3.3 Contrôle d’accès

- Route : `PrivateRoute` sur `/agence` avec `allowedRoles: ["chefAgence", "embarquement"]`. Donc seuls ces rôles accèdent à la page embarquement. Aucune permission plus fine (ex. “boarding only” sans accès garage ou trajets).

### 3.4 Traçabilité des événements

- À chaque marquage embarqué : écriture dans `boardingLogs` (reservationId, trajetId, departure, arrival, date, heure, result EMBARQUE/ABSENT, controleurId, scannedAt).
- Verrou anti-double-scan : `boardingLocks/{reservationId}` avec by, at, tripId, date, heure. En cas de statut déjà “embarqué” ou lock existant, la transaction rejette “Déjà embarqué”.

### 3.5 Mise à jour du statut de réservation

- Dans la transaction d’embarquement : `tx.update(resRef, { statutEmbarquement, controleurId, checkInTime })` et si statut === "embarqué" alors `statut` réservation est mis à "embarqué". La réservation est bien mise à jour.

### 3.6 Départ véhicule / clôture trajet

- `boardingClosures/{tripKey}` : utilisé pour marquer qu’un trajet est “clôturé” (embarquement terminé). La page écoute ce document (onSnapshot) pour afficher l’état “clôturé” et propose une action “Clôturer l’embarquement” qui écrit dans cette collection et peut marquer les réservations non présentes (absent, etc.) et écrire dans boardingLogs.

### 3.7 Scalabilité et préparation à un rôle agency_boarding_officer

- La logique est centralisée dans une seule page et des collections dédiées (boardingLocks, boardingLogs, boardingClosures). La séparation en rôle dédié est faisable en : (1) restreignant l’accès à `/agence/embarquement` (et éventuellement à des sous-routes) au seul `agency_boarding_officer` (et chef pour supervision si souhaité), (2) en gardant les mêmes chemins Firestore pour l’embarquement, (3) en n’accordant pas à ce rôle l’accès garage, trajets, finances, etc. Actuellement, l’embarquement est “noyé” dans le périmètre chef/embarquement, donc pas encore scalable en droits fins.

---

## 4. Logique d’affectation véhicules

### 4.1 Comment les véhicules sont assignés aux trajets

- Page AffectationVehiculePage (`/agence/garage`). Les trajets sont dérivés des `weeklyTrips` (actifs) et du calendrier (date + créneaux horaires). Une affectation est un document par “trajet théorique” identifié par une clé : `affectationKey(departure, arrival, heure, date)` → `companies/{companyId}/agences/{agencyId}/affectations/{key}`.

### 4.2 Manuelle ou automatique

- **100 % manuelle** : champs saisis (N° bus, immatriculation, chauffeur, convoyeur/chef embarquement), puis bouton Enregistrer qui fait `setDoc(ref, payload, { merge: true })`. Aucune règle automatique ni suggestion.

### 4.3 Stockage Firestore

- Collection : `companies/{companyId}/agences/{agencyId}/affectations`. Document ID = clé (departure_arrival_heure_date). Champs : busNumber, immatriculation, chauffeur, chefEmbarquement (convoyeur), tripId, date, heure, createdAt, updatedAt.

### 4.4 Qui peut modifier

- Toute personne ayant accès à `/agence/garage` : aujourd’hui chef d’agence et rôle “embarquement” (même route que le shell agence). Pas de rôle “flotte” dédié. Aucune règle Firestore ne restreint l’écriture par rôle.

### 4.5 Pistes d’audit et conflits

- Pas d’audit trail sur les affectations (pas de collection d’historique des changements). Conflits possibles : deux utilisateurs modifiant la même clé en parallèle (dernier setDoc gagne). Pas de transaction conditionnelle.

### 4.6 Pertinence d’un rôle agency_fleet_controller

- Oui : centraliser la gestion des affectations (et éventuellement étendre à d’autres données flotte) sous un rôle dédié, avec accès restreint à la page garage et aux collections `affectations`. Cela permettrait de retirer ce droit au rôle “embarquement” (qui n’a pas besoin de modifier les bus) et de garder au chef un droit de supervision ou lecture si besoin.

---

## 5. Flux de données temps réel

### 5.1 Propagation des mises à jour

- Firestore : les écritures sont propagées via les listeners `onSnapshot`. Pas de serveur intermédiaire ; les clients s’abonnent directement aux collections/documents.

### 5.2 Où onSnapshot est utilisé (module agence)

- **useActiveShift** : onSnapshot sur `shifts` (query userId + status in pending/active/paused, limit 1) pour le shift “ouvert” du guichetier.
- **AgenceGuichetPage** : onSnapshot sur les réservations (filtre par shiftId pour l’onglet Rapport, et pour les places restantes / liste des billets).
- **AgenceReservationsPage** : onSnapshot sur `shifts`, puis pour chaque shift actif/paused un onSnapshot sur les réservations (shiftId + canal guichet) ; et onSnapshot sur la liste des réservations pour la liste principale.
- **AgenceComptabilitePage** : onSnapshot sur `shifts` ; onSnapshot sur réservations pour les stats live par shift.
- **AgenceEmbarquementPage** : onSnapshot sur les réservations (plusieurs requêtes selon filtre) ; onSnapshot sur `boardingClosures` pour l’état “clôturé” d’un trajet.
- **ShiftsControlWidget** : onSnapshot sur shifts (pending/active/paused/closed) ; pour chaque shift actif, onSnapshot sur réservations (shiftId, canal guichet).
- **DashboardAgencePage** : onSnapshot sur réservations (liste récente).
- **shiftApi.listenLiveShifts** : onSnapshot sur `shifts` (tous statuts).

### 5.3 Agrégations côté client

- Places restantes : calcul dans AgenceGuichetPage à partir des réservations (statut payé/confirme, somme seatsGo) et du nombre de places du trajet (fallback 30).
- Montants par shift : agrégation dans useActiveShift à la clôture (transaction) ; dans AgenceComptabilitePage et ShiftsControlWidget, agrégation dans les callbacks onSnapshot (tickets, amount).
- Aucune agrégation matérialisée côté serveur (pas de Cloud Functions pour agréger).

### 5.4 Calculs dans les dashboards

- Dashboard agence : données lues en direct (réservations, etc.) et calculs dans le composant. Pas de couche “rapport pré-calculé” dédiée.

### 5.5 Risques de duplication / incohérence

- Plusieurs listeners sur les mêmes collections (ex. réservations écoutées dans Guichet, Reservations, Compta, ShiftsControlWidget) : pas de duplication de données en soi, mais charge lecture et coût Firestore multipliés. Risque d’incohérence temporaire si un même document est mis à jour par deux flux (ex. guichet + embarquement) avant que les snapshots ne se propagent.
- Double nom de collection `shiftReports` vs `shift_reports` : les données de rapport ne sont écrites que dans `shiftReports`. Les fonctions shiftApi qui lisent `shift_reports` ne voient rien ; risque de code mort ou de bugs si on branche une UI sur shiftApi pour les rapports.

---

## 6. Risques d’intégrité des données

### 6.1 Écritures “publiques”

- Règles Firestore : `reservations` : allow get, list, create: if true. Donc **création de réservations sans authentification** possible (prévu pour le flux client public). Les updates restreints (publicToken/publicUrl ; preuve de paiement) sont limités par condition. Puis allow update, delete: if isAuth() — tout utilisateur connecté peut modifier/supprimer n’importe quelle réservation.
- `counters` (byTrip) : allow get, create, update: if true → **n’importe qui peut incrémenter les compteurs** (risque de collision ou abus sur les références de billets si exposé).

### 6.2 Contournement des mises à jour

- Aucune règle “seul le guichetier propriétaire du shift peut modifier ses réservations”. Un utilisateur authentifié peut, en théorie, modifier n’importe quelle réservation (statut, montant, shiftId). Les garde-fous sont uniquement dans l’UI (vérification canal, statut embarquement, etc.).

### 6.3 Manipulation de statuts

- Un client malveillant ou une app modifiée pourrait forcer des statuts (ex. “payé” sans paiement, “embarqué” sans passage par la transaction avec boardingLocks). Les règles Firestore ne l’interdisent pas.

### 6.4 Couches de validation manquantes

- Pas de Cloud Functions pour valider les transitions de statut (réservation, shift, embarquement). Pas de validation serveur des rôles (agence, compagnie). Les validations sont uniquement côté client (et partiellement dans les transactions pour l’embarquement et la clôture de shift).

### 6.5 Concurrence multi-utilisateurs

- Clôture shift : une seule transaction (agrégation + écriture shiftReports + update shift). Pas de conflit tant qu’un seul client clôture ce shift.
- Embarquement : transaction avec lecture reservation + lock + update + log. Bonne protection contre le double scan. En revanche, deux opérateurs qui marquent “absent” sur la même réservation en parallèle peuvent tous deux réussir (pas de lock pour “absent”).
- Affectations : setDoc merge sans condition ; dernier écrit gagne. Pas de détection de conflit.

---

## 7. Points faibles d’architecture

### 7.1 Logique trop couplée

- useActiveShift mélange : état UI (shift ouvert), création pending, pause/continue/close, et validation (validateByAccountant, validateByManager). La validation “comptable” existe aussi dans AgenceComptabilitePage (réception espèces) et dans validateShiftWithDeposit (statut cloture). Plusieurs chemins pour “valider” un poste.
- AgenceComptabilitePage : une seule page très lourde (contrôle postes, réceptions, rapports, caisse, réconciliation) avec beaucoup d’état local et de logique métier.

### 7.2 Pages à responsabilités multiples

- AgenceComptabilitePage : activation, pause, reprise, réception espèces, rapports, caisse, mouvements de caisse. Difficile à maintenir et à tester.
- AgenceGuichetPage : vente, rapport, historique, édition, annulation, gestion de session (demande activation, pause, clôture). Très grosse page.

### 7.3 Composants surchargés

- AgenceGuichetPage et AgenceComptabilitePage sont des composants monolithiques avec de nombreux useCallback, useEffect et états. Les widgets (ShiftsControlWidget, GuichetSessionCard, etc.) allègent partiellement mais la logique centrale reste dans les pages.

### 7.4 Absence de logs d’audit

- Aucune collection dédiée “audit” pour les actions sensibles (activation poste, validation comptable, validation chef, annulation réservation, modification affectation). Seuls boardingLogs et les champs “validated by” dans shiftReports/shifts donnent une trace partielle.

### 7.5 Absence de garanties transactionnelles

- Beaucoup d’opérations sont en updateDoc/setDoc simples (ex. validateByAccountant/validateByManager en deux updateDoc séparés : reportRef puis shiftRef). En cas de crash entre les deux, incohérence possible. Idem pour certaines écritures dans AgenceComptabilitePage (réception espèces fait une transaction, mais d’autres flux non).

---

## 8. Synthèse métier

### 8.1 Points forts du module agence

- **Sessions guichet** : un poste par guichetier, activation par la comptabilité, clôture en transaction avec agrégation et création de shiftReports. Isolation par userId.
- **Embarquement** : transaction avec vérification trajet/date/heure, verrou anti-double-scan (boardingLocks), traçabilité (boardingLogs), mise à jour du statut de réservation.
- **Rôles clairement séparés** pour guichetier (guichet uniquement) et comptable agence (comptabilité agence). Routes dédiées (guichet, comptabilité, validations).
- **Génération de référence de billet** atomique (compteur par trajet) pour limiter les collisions.
- **Gardes-fous métier** dans l’UI : annulation guichet uniquement, passager non embarqué, motif d’annulation, canal guichet.

### 8.2 Faiblesses

- **Double nomenclature et double flux** : `shiftReports` vs `shift_reports`, statuts `closed` vs `cloture`, validation via réception espèces (AgenceComptabilitePage) vs validateShiftWithDeposit/chefApproveShift. Risque de confusion et de code mort (shiftApi sur shift_reports).
- **Sécurité Firestore** : pas de restriction par rôle ni par agence ; tout utilisateur authentifié peut lire/écrire tout le périmètre. Compteurs et créations réservations partiellement publics.
- **Pages surchargées** : AgenceComptabilitePage et AgenceGuichetPage concentrent trop de responsabilités.
- **Pas d’audit trail** global pour les actions sensibles (activation, validation, affectations).
- **Affectation véhicules** : sans historique ni contrôle de concurrence ; accès partagé avec embarquement et chef.

### 8.3 Risques

- Manipulation des données (statuts, montants, shiftId) par un client authentifié ou un script.
- Écarts de caisse non bloquants côté technique (détection uniquement visuelle / métier).
- Concurrence sur affectations (dernier écrit gagne) et risque d’écrasement involontaire.
- Utilisation accidentelle de shiftApi (shift_reports) pour des écrans qui attendent des données dans shiftReports → listes vides ou erreurs.

### 8.4 Fonctionnalités entreprise manquantes

- Règles Firestore par rôle et par agence (read/write limités au contexte de l’utilisateur).
- Audit log centralisé (qui a fait quoi, quand, sur quelles entités).
- Un seul flux de validation des postes (statuts et collections unifiés), avec verrous métier (lockedComptable, lockedChef) appliqués dans ce flux.
- Rôle agency_boarding_officer avec accès restreint à l’embarquement uniquement.
- Rôle agency_fleet_controller pour la flotte et historique des affectations.
- Contrôle de concurrence ou versioning sur les affectations (et éventuellement sur les shifts en écriture).

### 8.5 À repenser avant de scaler

- Unifier les collections et statuts des postes (shiftReports comme seule source, statuts closed/validated alignés avec les verrous).
- Découper les grosses pages (Compta, Guichet) en sous-modules ou écrans plus petits.
- Renforcer les règles Firestore (au minimum par agence/compagnie et par type de document).
- Introduire une couche de validation côté serveur (Cloud Functions ou règles avancées) pour les transitions critiques (réservation, shift, embarquement).

### 8.6 Déjà prêt pour la prod (avec vigilance)

- Workflow guichet : demande d’activation → activation par la compta → vente → clôture → rapport. Utilisable en production si les utilisateurs respectent les processus.
- Embarquement avec scan QR, verrou et logs : solide pour un usage contrôlé (environnement de confiance).
- Génération des références de billets : robuste tant que les règles sur les compteurs sont durcies (éviter allow true sur counters en production).

---

*Fin du rapport d’audit fonctionnel — Module Agence Teliya. Aucune modification de code n’a été effectuée ; ce document sert de base pour les décisions d’architecture et l’introduction des rôles agency_boarding_officer et agency_fleet_controller.*
