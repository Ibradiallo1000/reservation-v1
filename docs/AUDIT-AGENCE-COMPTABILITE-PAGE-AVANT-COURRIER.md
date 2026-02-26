# Audit technique — AgenceComptabilitePage (avant intégration Courrier)

**Objectif :** Comprendre précisément le fonctionnement actuel de la page pour le Ticket (Guichet), afin d’y intégrer en toute sécurité les sessions Courrier. Aucune modification de code, aucun refactor, analyse et description uniquement.

---

## PARTIE 1 — Structure du fichier

### 1.1 Emplacement

- **Fichier :** `src/modules/agence/comptabilite/pages/AgenceComptabilitePage.tsx`
- **Composant exporté :** `AgenceComptabilitePage` (composant fonctionnel React, export par défaut).
- **Rôle déclaré en en-tête :** Comptabilité d’agence — contrôle financier des opérations de vente en guichet et en ligne (contrôle des postes, réceptions, rapports, caisse, réconciliation).

### 1.2 Composants importés

| Source | Éléments |
|--------|----------|
| **React** | `useCallback`, `useEffect`, `useMemo`, `useRef`, `useState` |
| **firebase/firestore** | `addDoc`, `collection`, `doc`, `getDoc`, `getDocs`, `onSnapshot`, `orderBy`, `query`, `runTransaction`, `Timestamp`, `updateDoc`, `where`, `writeBatch` |
| **@/firebaseConfig** | `db` |
| **@/contexts/AuthContext** | `useAuth` |
| **@/modules/agence/services/sessionService** | `activateSession`, `pauseSession`, `continueSession`, `validateSessionByAccountant` |
| **@/utils/deviceFingerprint** | `getDeviceFingerprint` |
| **@/shared/hooks/useCompanyTheme** | `useCompanyTheme` |
| **lucide-react** | `Activity`, `AlertTriangle`, `Banknote`, `Building2`, `CheckCircle2`, `Clock4`, `Download`, `FileText`, `HandIcon`, `LogOut`, `MapPin`, `Pause`, `Play`, `Plus`, `StopCircle`, `Ticket`, `Wallet`, `Info`, `Shield`, `Receipt`, `BarChart3`, `RefreshCw`, `TrendingUp`, `CreditCard`, `Smartphone` |
| **react-router-dom** | `useNavigate` |
| **@/shared/ui/button** | `Button` |
| **@/shared/currency/CurrencyContext** | `useFormatCurrency`, `useCurrencySymbol` |
| **@/modules/agence/shared** | `useOnlineStatus`, `useAgencyDarkMode`, `AgencyHeaderExtras` |
| **@/modules/compagnie/treasury/companyBanks** | `listCompanyBanks` |
| **@/modules/compagnie/treasury/financialMovements** | `recordMovement` |
| **@/modules/compagnie/treasury/types** | `agencyCashAccountId`, `companyBankAccountId` |
| **@/modules/compagnie/treasury/financialAccounts** | `ensureDefaultAgencyAccounts` |

Aucun composant UI externe type « layout » ou « page » n’est importé : la page est auto-suffisante pour le rendu (voir Partie 5).

### 1.3 Hooks utilisés

- **useAuth()** : utilisateur connecté, `companyId`, `agencyId`, `uid`, `logout`, etc.
- **useCompanyTheme(company)** : couleurs thème (primary, secondary).
- **useFormatCurrency()** / **useCurrencySymbol()** : formatage devise.
- **useOnlineStatus()** : indicateur de connexion.
- **useAgencyDarkMode()** : mode sombre agence.
- **useNavigate()** : navigation (ex. après déconnexion).
- **useState** : tous les états listés en sections « ÉTATS REACT » (postes, tickets, réceptions, caisse, réconciliation, modales, caches, etc.).
- **useCallback** : `activateShift`, `pauseShift`, `continueShift`, `validateReception`, `loadReportForShift`, `setReceptionInput`, `reloadCash`, `loadReconciliation`, `findShift`.
- **useMemo** : `normalizeShift` (fonction, pas mémo), `totals` (agrégat rapport), `liveTotalsGlobal` (KPI en direct), `currentRange` (période caisse).
- **useEffect** : abonnement shifts, stats live par poste, agrégats réceptions, chargement header/profil, chargement caisse, réconciliation quand onglet actif.
- **useRef** : `liveUnsubsRef` (désabonnements des listeners « live » par shift).

### 1.4 Services appelés

| Service | Usage |
|---------|--------|
| **sessionService.activateSession** | Activation d’un poste PENDING → ACTIVE (comptable). |
| **sessionService.pauseSession** | Mise en pause d’un poste ACTIVE. |
| **sessionService.continueSession** | Reprise d’un poste PAUSED. |
| **sessionService.validateSessionByAccountant** | Validation d’un poste CLOSED avec montant espèces reçu ; écriture audit, dailyStats, trésorerie (revenue_cash). |
| **getDeviceFingerprint** | Passé à `validateSessionByAccountant` pour l’audit. |
| **listCompanyBanks** | Liste des banques compagnie (transferts caisse → banque). |
| **recordMovement** | Enregistrement d’un mouvement trésorerie (ex. dépôt vers banque) lors d’un transfert. |
| **ensureDefaultAgencyAccounts** | Vérification/création des comptes par défaut avant un transfert. |

Aucun service « Courrier » ou `courierSessions` n’est utilisé actuellement.

---

## PARTIE 2 — Sources de données

### 2.1 Collections Firestore interrogées

| Collection / chemin | Usage |
|---------------------|--------|
| **shifts** | `companies/{companyId}/agences/{agencyId}/shifts` — **écoute temps réel** (onSnapshot) sans filtre. Tous les postes de l’agence sont chargés ; le groupement par statut (pending, active, paused, closed, validated) est fait **en mémoire**. |
| **reservations** | `companies/{companyId}/agences/{agencyId}/reservations` — (1) **onSnapshot** par poste actif/pause : `where('shiftId', '==', s.id)` pour les stats live ; (2) **getDocs** pour les postes clôturés : agrégats (cashExpected, mmExpected, onlineAmount, etc.) ; (3) **getDocs** dans `loadReportForShift` : réservations du poste + éventuelles orphelines par période. |
| **users** | `users/{uid}` — **getDoc** pour le profil du comptable et pour le **cache** des guichetiers (affichage nom/code) à partir des `userId` des shifts. |
| **companies** | `companies/{companyId}` — **getDoc** une fois au montage (logo, nom, devise). |
| **agences** | `companies/{companyId}/agences/{agencyId}` — **getDoc** une fois au montage (nom agence). |
| **cashReceipts** | `companies/{companyId}/agences/{agencyId}/cashReceipts` — **getDocs** avec filtre `createdAt >= currentRange.from` pour l’onglet Caisse. |
| **cashMovements** | `companies/{companyId}/agences/{agencyId}/cashMovements` — **getDocs** avec filtre date pour l’onglet Caisse. |

**Non utilisées par cette page :**

- **shiftReports** : aucune requête directe ; les données affichées viennent des **shifts** et des **reservations**.
- **dailyStats** : non lus ici ; alimentés côté `sessionService` à la validation.
- **agencyLiveState** : non utilisé sur cette page.
- **Trésorerie (financialAccounts / financialMovements)** : la page n’effectue pas de lecture des collections trésorerie pour l’affichage ; elle appelle `recordMovement` (écriture) et `listCompanyBanks` (liste banques compagnie, probablement depuis une autre collection ou API).

### 2.2 Requêtes en temps réel (onSnapshot)

1. **Shifts**  
   - **Référence :** `collection(db, 'companies/${user.companyId}/agences/${user.agencyId}/shifts')`.  
   - **Comportement :** à chaque snapshot, normalisation des docs en `ShiftDoc`, enrichissement du cache utilisateurs (getDoc sur `users` pour les `userId` manquants), puis `setPendingShifts`, `setActiveShifts`, `setPausedShifts`, `setClosedShifts`, `setValidatedShifts` selon `d.data().status`.

2. **Réservations (live par poste)**  
   - **Référence :** `query(rRef, where('shiftId', '==', s.id))` pour chaque `s` dans `activeShifts` et `pausedShifts`.  
   - **Comportement :** un listener par poste actif/pause ; mise à jour de `liveStats[s.id]` avec `{ reservations, tickets, amount }` (sommes calculées depuis les docs). Les listeners sont créés/détruits en fonction de la liste des postes actifs/pause (`liveUnsubsRef`).

Aucune autre collection n’est écoutée en temps réel sur cette page.

### 2.3 Données calculées localement

- **Listes de postes par statut** : dérivées du snapshot `shifts` par filtrage `s.status === 'pending' | 'active' | 'paused' | 'closed' | 'validated'` et tri par temps (validatedAt / endTime / startTime).
- **liveTotalsGlobal** : somme des `liveStats[s.id]` pour tous les postes actifs + en pause (réservations, billets, montant).
- **aggByShift** : pour chaque poste **closed**, une requête getDocs sur les réservations `shiftId == s.id` ; calcul en mémoire de `reservations`, `tickets`, `amount`, `cashExpected`, `mmExpected`, `onlineAmount` (selon `canal` et `paiement`).
- **totals** (onglet Rapports) : agrégation des `tickets` chargés pour le poste sélectionné (`billets`, `montant`, détail guichet / en_ligne).
- **Réconciliation** : getDocs des réservations avec `date == reconciliationDate` ; calcul en mémoire de `ventesGuichet`, `ventesEnLigne`, `encaissementsEspeces`, `encaissementsMobileMoney`, `ecart`.
- **Caisse** : getDocs sur `cashReceipts` et `cashMovements` sur la période ; agrégation par jour (entrées/sorties/solde) et totaux en mémoire.

---

## PARTIE 3 — Cycle de vie des postes (shifts)

### 3.1 Détection des postes PENDING

- **Source :** un seul listener sur la collection **shifts** (sans filtre).
- **Détection :** après chaque snapshot, `all.filter(s => s.status === 'pending')`, puis tri par `byTime` (validatedAt, endTime, startTime) décroissant.
- **Stockage :** `setPendingShifts(...)`.
- **Affichage :** onglet « Contrôle », section « Postes en attente d'activation » via le composant local `SectionShifts` avec `list={pendingShifts}`.

### 3.2 Détection des postes ACTIVE

- **Source :** même listener `shifts`.
- **Détection :** `all.filter(s => s.status === 'active')`, même tri.
- **Stockage :** `setActiveShifts(...)`.
- **Stats live :** pour chaque élément de `activeShifts`, un `onSnapshot` sur `reservations` avec `where('shiftId', '==', s.id)` remplit `liveStats[s.id]`.
- **Affichage :** section « Postes en service » avec bouton Pause ; statistiques (réservations, billets, montant) issues du shift ou de `liveStats`.

### 3.3 Détection des postes CLOSED

- **Source :** même listener `shifts`.
- **Détection :** `all.filter(s => s.status === 'closed')`.
- **Stockage :** `setClosedShifts(...)`.
- **Agrégats :** un `useEffect` dépendant de `closedShifts` lance pour chaque poste clôturé une requête getDocs sur les réservations (`shiftId == s.id`) et remplit `aggByShift[s.id]` (reservations, tickets, amount, cashExpected, mmExpected, onlineAmount).
- **Affichage :** onglet « Réceptions » : liste des postes `closed` avec formulaire « Espèces reçues » et bouton « Valider la réception ». Les montants attendus viennent du shift (`totalCash`, etc.) ou de `aggByShift[s.id]`.

### 3.4 Validation (technique)

- **Déclencheur :** clic sur « Valider la réception » pour un poste `closed`.
- **Saisie :** le comptable a renseigné `receptionInputs[shift.id].cashReceived` (champ « Espèces reçues »).
- **Appel :** `validateSessionByAccountant({ companyId, agencyId, shiftId, receivedCashAmount: cashRcv, validatedBy: { id, name }, accountantDeviceFingerprint })`.
- **Côté service (sessionService) :** en une transaction Firestore : lecture du shift et du shiftReport ; vérification statut `closed` ; calcul `computedDifference = receivedCashAmount - expectedCash` ; mise à jour du shift et du shiftReport (status `validated`, `validationAudit`, etc.) ; `updateDailyStatsOnSessionValidated` ; `updateAgencyLiveStateOnSessionValidated` ; enregistrement d’un mouvement trésorerie `revenue_cash` si compte caisse agence existe.
- **Côté page :** après succès, réinitialisation du champ de saisie pour ce shift et affichage d’une alerte (écart ou « Validation enregistrée ✓ »). Le prochain snapshot `shifts` fera passer le poste dans `validatedShifts`.

### 3.5 Services qui mettent à jour le statut

- **activateSession** (sessionService) : PENDING → ACTIVE (champ `status` et horodatages sur le document shift ; création/mise à jour du shiftReport).
- **pauseSession** : ACTIVE → PAUSED (update du champ `status` sur le shift).
- **continueSession** : PAUSED → ACTIVE (idem).
- **validateSessionByAccountant** : CLOSED → VALIDATED (shift + shiftReport, audit, dailyStats, agencyLiveState, trésorerie).

La **clôture** (ACTIVE/PAUSED → CLOSED) est effectuée côté **guichet** (sessionService.closeSession), pas depuis cette page.

---

## PARTIE 4 — Blocs KPI

### 4.1 Où sont calculés les « Billets vendus »

- **Onglet Contrôle (temps réel) :**  
  - **Billets vendus** affichés dans la première KpiCard = `liveTotalsGlobal.tickets`.  
  - **Calcul :** `liveTotalsGlobal` est un `useMemo` qui somme, pour tous les postes dans `activeShifts` et `pausedShifts`, les valeurs `liveStats[s.id].tickets` (chaque `tickets` étant lui-même la somme des `(seatsGo + seatsReturn)` des réservations du poste, mises à jour par les onSnapshot sur `reservations`).

- **Onglet Rapports (poste sélectionné) :**  
  - **Billets vendus** = `totals.billets`.  
  - **Calcul :** `totals` est un `useMemo` sur `tickets` (liste des lignes du rapport chargé par `loadReportForShift`) : somme des `(t.seatsGo || 0) + (t.seatsReturn || 0)`.

- **Onglet Réconciliation :**  
  - **Billets vendus** = `reconciliationData.ventesGuichet.tickets + reconciliationData.ventesEnLigne.tickets`.  
  - **Calcul :** dans `loadReconciliation`, getDocs des réservations avec `date == reconciliationDate`, puis boucle qui incrémente les compteurs par canal.

### 4.2 Où est calculé le « Chiffre d'affaires »

- **Onglet Contrôle :**  
  - **Chiffre d'affaires** = `money(liveTotalsGlobal.amount)`.  
  - **Calcul :** même logique que les billets : somme des `liveStats[s.id].amount` pour les postes actifs/pause (`amount` = somme des `montant` des réservations du poste).

- **Onglet Rapports :**  
  - **Chiffre d'affaires** = `money(totals.montant)`.  
  - **Calcul :** somme des `t.montant` des lignes `tickets` du rapport.

- **Onglet Réconciliation :**  
  - **Chiffre d'affaires total** = `ventesGuichet.montant + ventesEnLigne.montant` (calculé dans `loadReconciliation` à partir des réservations du jour).

### 4.3 Agrégation des totaux

- **Contrôle :** une seule couche d’agrégation : par poste (liveStats), puis somme globale (liveTotalsGlobal). Pas de regroupement par date ni par canal sur cet onglet.
- **Réceptions :** agrégats par poste dans `aggByShift` (réservations du shift) ; pas de total global affiché pour les réceptions.
- **Rapports :** agrégat sur la liste `tickets` du poste sélectionné (`totals`) avec détail guichet / en_ligne.
- **Réconciliation :** agrégats par canal (guichet / en ligne) et par type d’encaissement (espèces, mobile money) pour une date donnée.

### 4.4 Données qui alimentent la carte « Chiffre d'affaires » principale

- **Carte principale concernée :** la deuxième KpiCard de l’onglet **Contrôle** (« Chiffre d'affaires », `emphasis={true}`).
- **Source :** `liveTotalsGlobal.amount`, donc la somme des montants des réservations des postes **actifs** et **en pause**, mis à jour en temps réel via les listeners sur `reservations` (par `shiftId`).

---

## PARTIE 5 — Structure de l’UI

### 5.1 Composant unique vs découpage

- **Monolithique avec sous-composants locaux :** toute la logique et la quasi-totalité du rendu sont dans **un seul fichier**. Les « composants » suivants sont **définis dans le même fichier** (en bas de fichier) : `TabButton`, `KpiCard`, `StatCard`, `SectionHeader`, `SectionShifts`, `InfoCard`, `EmptyState`, `Th`, `Td`. Ils ne sont pas exportés et ne sont pas réutilisés ailleurs.
- **Pas de découpage par onglet** : chaque onglet est un bloc conditionnel `{tab === 'controle' && (...)}`, `{tab === 'receptions' && (...)}`, etc., dans le même arbre de rendu.

### 5.2 Où une section Courrier pourrait être insérée

- **Option 1 — Même onglet Contrôle :**  
  - Après les trois blocs existants (Postes en attente, Postes en service, Postes en pause), on pourrait ajouter une **nouvelle section** dédiée « Sessions courrier » (PENDING / ACTIVE / CLOSED à valider), avec ses propres listes et boutons (Activer, Valider).  
  - Avantage : un seul onglet pour « tout contrôler ». Risque : page plus longue et mélange visuel Guichet / Courrier si pas de séparation claire (titres, sous-titres, ou sous-onglets).

- **Option 2 — Nouvel onglet « Courrier » ou « Contrôle Courrier » :**  
  - Ajouter un 6ᵉ onglet dans la barre d’onglets (à côté de Contrôle, Réceptions, Rapports, Caisse, Réconciliation). Le contenu serait uniquement sessions courrier (activation, validation, éventuellement liste des envois par session).  
  - Avantage : séparation nette Guichet / Courrier. Intégration : même header, même layout, nouvel état `tab` et nouveau bloc conditionnel.

- **Option 3 — Sous-onglets dans Contrôle :**  
  - Dans l’onglet Contrôle, un sélecteur « Guichet » | « Courrier » (ou onglets secondaires) qui affiche soit les sections shifts actuelles, soit les sections courierSessions.  
  - Avantage : pas d’ajout d’onglet principal. Nécessite un état local (ex. `controleSubTab`) et une duplication de la logique d’affichage (listes, boutons) pour le Courrier.

### 5.3 Tabs vs sections empilées

- **Actuellement :** la page utilise déjà des **tabs** en haut (Contrôle, Réceptions, Rapports, Caisse, Réconciliation). Le contenu de chaque onglet est une **suite de sections empilées** (KPI, StatCards, puis plusieurs `SectionShifts` ou listes de cartes).
- **Pour le Courrier :**  
  - **Tabs (nouvel onglet Courrier)** : clair pour l’utilisateur, évite de surcharger l’onglet Contrôle et garde les données Guichet et Courrier séparées (états, requêtes, effets).  
  - **Sections empilées dans Contrôle** : plus rapide à intégrer visuellement, mais il faudra bien distinguer les blocs (titres « Postes guichet » vs « Sessions courrier ») et gérer deux jeux d’états (shifts vs courierSessions) dans le même onglet.

Recommandation d’analyse (sans implémentation) : un **onglet dédié « Courrier »** ou **sous-onglets dans Contrôle** (Guichet | Courrier) limite les risques de confusion et de couplage des données.

### 5.4 Partie du layout qui pilote les listes d’activation

- **Onglet Contrôle.**  
- **Bloc 1 — KPI globaux :** 3 KpiCards (Billets vendus, Chiffre d'affaires, Réservations) alimentées par `liveTotalsGlobal`.  
- **Bloc 2 — Stats rapides :** 5 StatCards (En attente, En service, En pause, Clôturés, Validés) = `pendingShifts.length`, `activeShifts.length`, etc.  
- **Bloc 3 — Postes en attente d’activation :** `SectionShifts` avec `list={pendingShifts}` et `actions` = bouton « Activer le poste » qui appelle `activateShift(s.id)`.  
- **Bloc 4 — Postes en service :** `SectionShifts` avec `list={activeShifts}`, `liveStats`, actions = Pause.  
- **Bloc 5 — Postes en pause :** `SectionShifts` avec `list={pausedShifts}`, actions = Continuer.  

Les listes d’activation (qui peuvent vendre / qui sont en attente) sont donc **uniquement** les sections qui utilisent `pendingShifts`, `activeShifts`, `pausedShifts` et les callbacks `activateShift`, `pauseShift`, `continueShift`. La validation des remises (CLOSED → VALIDATED) est sur l’onglet **Réceptions**, pas sur Contrôle.

---

## PARTIE 6 — Stratégie d’intégration sûre (sans modifier le code)

### 6.1 Où interroger les courierSessions

- **Collection :** `companies/{companyId}/agences/{agencyId}/courierSessions` (même niveau que `shifts`).
- **Emplacement logique :** un **nouveau useEffect** (ou un bloc dédié dans un hook) qui fait un **onSnapshot** sur cette collection, éventuellement avec un filtre (ex. pas de filtre, ou `where('status', 'in', ['PENDING', 'ACTIVE', 'CLOSED'])` si on n’affiche pas les VALIDATED). Les documents seraient normalisés dans un type du type `CourierSessionDoc` et répartis dans des états `pendingCourierSessions`, `activeCourierSessions`, `closedCourierSessions` (et optionnellement `validatedCourierSessions`).
- **Risque :** si le même `useEffect` mélange shifts et courierSessions, la logique et la lisibilité se dégradent. Mieux vaut **un abonnement dédié** et des états dédiés pour le Courrier.

### 6.2 Où afficher les KPI Courrier

- **Option A — Même onglet Contrôle :**  
  - Soit une **deuxième ligne de KpiCards** (ex. « Billets vendus (guichet) », « Chiffre d’affaires (guichet) », puis « Envois courrier », « CA courrier ») en gardant la première ligne pour le guichet.  
  - Soit un **sélecteur Guichet / Courrier** qui bascule les KPI et les listes (une seule ligne de KPI à la fois).  
- **Option B — Onglet Courrier séparé :**  
  - Une ligne de KPI propre au Courrier (nombre de sessions actives, montant attendu des sessions clôturées non validées, etc.) en haut de l’onglet Courrier.  
- **Source des données Courrier :** agrégation sur les `courierSessions` (et éventuellement sur les envois liés par `sessionId`) ; **pas** de mélange avec `liveStats` ou `reservations` guichet.

### 6.3 Où placer les boutons d’activation et de validation Courrier

- **Activation (PENDING → ACTIVE) :**  
  - Même logique que « Activer le poste » pour les shifts : une section « Sessions courrier en attente d’activation » avec une liste de sessions `PENDING` et un bouton « Activer la session » qui appellerait `activateCourierSession` (companyId, agencyId, sessionId, activatedBy).  
  - Emplacement cohérent : soit dans l’onglet Contrôle (section dédiée Courrier), soit dans un onglet Courrier.

- **Validation (CLOSED → VALIDATED) :**  
  - Même logique que l’onglet Réceptions : une liste de sessions courrier en statut `CLOSED`, avec affichage de l’`expectedAmount` (déjà sur la session, calculé à la clôture), champ de saisie « Montant compté » (validatedAmount) et bouton « Valider la réception » qui appelle `validateCourierSession`.  
  - Emplacement : soit une section « Réceptions courrier » dans l’onglet Réceptions (avec un sous-filtre ou onglets secondaires Guichet / Courrier), soit un bloc dédié dans un onglet Courrier.

### 6.4 Risques si on mélange les deux systèmes

- **Données :**  
  - Mélanger dans les mêmes états (ex. `pendingShifts` et sessions PENDING courrier) obligerait à des types union et à des branchements partout (normalisation, affichage, actions). Risque d’erreurs (appeler `activateSession` avec un id de courierSession, ou inversement).  
  - **Recommandation :** garder des états et des types **distincts** (shifts vs courierSessions) et des sections ou onglets distincts pour l’UI.

- **Services :**  
  - Les actions doivent appeler le bon service : `activateSession` / `validateSessionByAccountant` pour le Guichet, `activateCourierSession` / `validateCourierSession` pour le Courrier. Un mauvais branchement (bouton Courrier qui appelle le service Guichet) corromprait les données ou lèverait des erreurs.  
  - **Recommandation :** listes et boutons Courrier branchés uniquement sur les états et callbacks Courrier.

- **KPI et agrégats :**  
  - Si on fusionnait « Billets vendus » ou « Chiffre d’affaires » avec les montants Courrier sans distinguer les canaux, les indicateurs deviendraient ambigus (mélange billets transport / envois).  
  - **Recommandation :** soit indicateurs séparés (Guichet vs Courrier), soit indicateurs globaux clairement étiquetés et calculés à partir de deux sources distinctes.

- **Performances :**  
  - Ajouter un second onSnapshot (courierSessions) et éventuellement des requêtes sur les envois par session augmente le nombre de lectures et la complexité des effets.  
  - **Recommandation :** limiter les listeners (une collection courierSessions, pas de listener par session sauf si nécessaire pour le détail) et éviter de rejouer les effets Guichet quand seules les données Courrier changent (états séparés).

---

*Fin du rapport d’audit — AgenceComptabilitePage, avant intégration des sessions Courrier.*
