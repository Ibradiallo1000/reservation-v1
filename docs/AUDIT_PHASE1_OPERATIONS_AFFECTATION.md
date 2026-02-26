# Audit Phase 1 – Opérations & Affectation véhicules

Rapport de diagnostic (pas de refonte d’architecture).

---

## PARTIE 1 – Filtrage date « Départs du jour »

### 1. Problème identifié

La section « Départs du jour » affiche des trajets obsolètes (anciens départs avec statut « En retard »). Le comportement attendu est d’afficher par défaut uniquement les départs dont la date de départ correspond au jour sélectionné (aujourd’hui, demain ou une date choisie), avec possibilité de consulter l’historique.

### 2. Cause exacte

- **Source des lignes « départs »**  
  Les lignes affichées ne viennent pas d’une requête Firestore filtrée par date de départ. Elles sont construites **côté client** à partir de :
  1. **weeklyTrips** : tous les trajets hebdomadaires de l’agence (sans filtre de date).
  2. **dayName** : jour de la semaine (ex. `"lundi"`) dérivé de **today** au premier rendu.
  3. Pour chaque `(weeklyTrip, heure)` tel que `horaires[dayName]` contient cette heure, une ligne est créée avec une clé incluant **today**.

- **Problème de « today »**  
  `today` est calculé une seule fois au montage :
  ```ts
  const today = useMemo(() => toLocalISO(new Date()), []);
  ```
  Donc **today ne se met jamais à jour** (pas de dépendance à la date courante). Si l’utilisateur reste sur la page après minuit, ou ouvre la page à 23h59, la date utilisée reste celle du montage.

- **Pas de notion de « date de départ » pour les créneaux**  
  Les créneaux sont « tous les créneaux du jour de la semaine (ex. lundi) » issus de `weeklyTrips`. Il n’y a **aucun filtre par date calendaire** sur ces créneaux : on affiche tous les lundis possibles, et on associe les réservations filtrées par `date === today`. Donc :
  - Les **réservations** sont bien limitées à `today` (requête Firestore `where("date", "==", today)`).
  - Les **créneaux** (lignes du tableau) sont tous ceux du jour de la semaine, sans lien avec une date de départ explicite.

- **Pourquoi « En retard » apparaît**  
  `deriveDepartureStatus` calcule le statut à partir de l’heure du créneau et de l’heure courante. Si l’heure du créneau est passée (ex. 08:00 alors qu’il est 15:00) et que le créneau n’est pas clôturé, le statut devient « En retard ». Comme tous les créneaux du jour de la semaine sont affichés, les créneaux déjà passés restent visibles avec le statut « En retard ».

- **Résumé**  
  - Filtrage date : **uniquement sur les réservations** (Firestore `date === today`), pas sur la liste des créneaux.  
  - **today** figé au montage → pas de mise à jour à minuit ni de sélecteur de date.  
  - Créneaux = tous ceux du jour de la semaine → créneaux passés restent affichés avec « En retard ».

### 3. Fichier concerné

- `src/modules/agence/manager/ManagerOperationsPage.tsx`

### 4. Correction minimale proposée

- **Réactiver « today »**  
  Ne plus mémoïser `today` avec `[]`. Soit recalculer à chaque rendu (ex. `const today = toLocalISO(new Date())`), soit utiliser un state `selectedDate` initialisé à la date du jour et mettre à jour `today` à partir de `selectedDate` (pour préparer « demain » / « date choisie » / historique).

- **Filtrer les créneaux par date (optionnel pour Phase 1)**  
  Pour « Départs du jour » au sens strict : ne construire des lignes que pour les créneaux dont la **date de départ** est celle sélectionnée. Aujourd’hui la « date de départ » d’un créneau est implicite (today + jour de la semaine). En gardant la même logique, s’assurer que la date utilisée pour construire les clés et pour dériver le jour de la semaine est bien la date courante (ou la date sélectionnée), et non une date figée au montage.

- **Pas de refonte** : garder weeklyTrips + horaires par jour ; uniquement corriger la source de la date (today / selectedDate) et, si besoin, filtrer côté client les lignes par date de départ pour n’afficher que le jour choisi.

---

## PARTIE 2 – Liste véhicules vide dans le modal « Affecter un véhicule »

### 1. Problème identifié

Dans le modal « Affecter un véhicule », la liste des véhicules est vide alors que des véhicules existent au garage (operationalStatus = GARAGE, technicalStatus = NORMAL, currentCity = Bamako).

### 2. Diagnostic (avec logs ajoutés)

Des **logs de diagnostic** ont été ajoutés dans `loadAvailableVehicles` (ManagerOperationsPage). Au moment d’ouvrir le modal « Affecter un véhicule », la console affichera :

- **agencyCity** : valeur de `(user?.ville ?? "").trim()` (origine : AuthContext, champ `ville` du document utilisateur).
- Pour **chaque véhicule** retourné par `listVehicles` :
  - `currentCity`
  - `operationalStatus`, `technicalStatus`
  - `isArchived`
  - `cityMatch` : `(currentCity ?? "").trim().toLowerCase() === agencyCity.trim().toLowerCase()`
  - `hasActiveAffectation` : présence du véhicule dans `activeIds` (affectations AFFECTE ou DEPART_CONFIRME).
  - `pass` : vrai si le véhicule passe le filtre (GARAGE + NORMAL + cityMatch + pas d’affectation active).

Causes possibles à vérifier via ces logs :

1. **Ville utilisateur vs ville véhicule**  
   - `user.ville` peut être vide, ou stocké différemment (ex. « Bamako » vs « bamako », espaces, caractères spéciaux).  
   - Les véhicules ont `currentCity` dans la collection `vehicles` ; si le format diffère (casse, espaces), `cityMatch` sera faux.

2. **Filtre isArchived**  
   - `listVehicles` exclut les véhicules avec `isArchived === true`.  
   - Les véhicules sans champ `isArchived` sont conservés. Si tous les véhicules ont été archivés par erreur, la liste serait vide.

3. **Affectation active**  
   - Si `activeIds` contient tous les véhicules (ex. affectations mal fermées ou statuts AFFECTE/DEPART_CONFIRME pour tous), alors `!activeIds.has(v.id)` exclut tout le monde.

4. **operationalStatus / technicalStatus**  
   - Si les véhicules ne sont pas en GARAGE ou NORMAL (ex. ancienne donnée, autre statut), ils sont exclus par le filtre.

### 3. Fichier concerné

- `src/modules/agence/manager/ManagerOperationsPage.tsx` (fonction `loadAvailableVehicles`).
- Source de `agencyCity` : `src/contexts/AuthContext.tsx` (champ `ville` du CustomUser, lui-même lu depuis le document utilisateur Firestore).

### 4. Correction minimale proposée

- **Interpréter les logs** : ouvrir le modal « Affecter un véhicule », regarder la console (préfixe `[AUDIT Affectation]`). Vérifier :
  - que `agencyCity` est bien la ville attendue (ex. « Bamako ») ;
  - que pour au moins un véhicule attendu, `currentCity` est cohérent, `cityMatch === true`, `operationalStatus`/`technicalStatus` corrects, `hasActiveAffectation === false`.

- **Si le problème vient de la ville** : harmoniser la source (ex. ville d’agence depuis le document agence si `user.ville` est vide ou différent) ou normaliser côté comparaison (normalisation Unicode, suppression des accents, trim strict) sans changer l’architecture.

- **Si le problème vient des affectations** : vérifier en base que les affectations terminées ont bien un statut ARRIVE ou CANCELLED, et que `activeIds` ne contient que AFFECTE/DEPART_CONFIRME.

- **Si le problème vient de isArchived** : vérifier en base que les véhicules concernés n’ont pas `isArchived: true`.

Les logs ajoutés sont temporaires et pourront être retirés une fois la cause identifiée et corrigée.

---

## PARTIE 3 – Synchronisation Affectation → Embarquement

### 1. Vérifications effectuées

- **assignVehicle** (vehiclesService) : crée uniquement le document d’affectation ; ne modifie pas `operationalStatus` du véhicule. Conforme.
- **confirmDepartureAffectation** : met le véhicule en `operationalStatus = EN_TRANSIT`, `destinationCity = arrivalCity`, et met l’affectation en `DEPART_CONFIRME`. Conforme.
- **getAffectationForBoarding** (affectationService) : récupère les affectations de l’agence, filtre par statut AFFECTE ou DEPART_CONFIRME, puis par `departureCity`, `arrivalCity`, et par date/heure dérivées de `departureTime`. Conforme pour la logique métier.

### 2. Correspondance date/heure (matching)

- **getAffectationForBoarding**  
  - `dateStr` : attendu au format `YYYY-MM-DD` ; `wantDate = dateStr.trim().slice(0, 10)`.  
  - `timeStr` : normalisé en `wantTime` = chiffres uniquement, 4 premiers caractères (ex. « 10:00 » → « 1000 »).  
  - Côté affectation : `departureTime` peut être une chaîne ISO (ex. `2025-02-19T10:00`) ou un Timestamp Firestore.  
  - `datePart` : 10 premiers caractères (ISO) ou date du Timestamp en ISO.  
  - `timePart` : via `normTime` → `HHmm` (ex. « 10:00 » → « 1000 »).  
  - Comparaison : `datePart === wantDate` et (si `wantTime` et `timePart` renseignés) `timePart === wantTime`.

- **Page embarquement (AgenceEmbarquementPage)**  
  - Appel : `getAffectationForBoarding(companyId, selectedAgencyId, selectedTrip.departure, selectedTrip.arrival, selectedDate, selectedTrip.heure)`.  
  - `selectedDate` : format dépend du state (à confirmer en UI : idéalement `YYYY-MM-DD`).  
  - `selectedTrip.heure` : format type « 10:00 » (à confirmer).  
  - Si `selectedDate` est en `DD/MM/YYYY` ou autre, la comparaison avec `datePart` (ISO) peut échouer.  
  - Si `selectedTrip.heure` est en « 10h00 » ou avec un format différent, `normTime` dans getAffectationForBoarding peut produire un `timePart` différent de `wantTime` (dérivé de `timeStr.replace(/\D/g, "").slice(0, 4)`).

- **Document affectation**  
  - Stocké sous `companies/{companyId}/agences/{agencyId}/affectations`. L’`agencyId` est celui de l’agence qui a créé l’affectation (agence de départ).  
  - getAffectationForBoarding utilise `listAffectationsByAgency(companyId, agencyId)` : on ne récupère que les affectations de **cette** agence. Pour un trajet au départ de cette agence, c’est correct. Aucun champ `agencyId` n’est requis dans le document affectation pour ce flux.

### 3. Risques de désalignement

1. **Format de date**  
   - Si `selectedDate` sur la page embarquement n’est pas en `YYYY-MM-DD`, le match `datePart === wantDate` peut échouer.  
   - À vérifier : format réel de `selectedDate` (et le cas échéant le normaliser en `YYYY-MM-DD` avant l’appel).

2. **Format de l’heure**  
   - Côté affectation, `departureTime` est enregistré en ISO par ManagerOperationsPage : `new Date(\`${today}T${assignModalRow.heure}:00\`).toISOString().slice(0, 16)` → « 2025-02-19T10:00 ».  
   - Côté boarding, `selectedTrip.heure` peut être « 10:00 » ou « 10:00:00 ».  
   - `normTime` et `wantTime` (chiffres seuls, 4 caractères) devraient rester cohérents si l’heure est du type « HH:mm ». À valider en runtime si des formats « 10h00 » ou « 10h » sont utilisés.

3. **Villes (départ / arrivée)**  
   - Comparaison en `trim().toLowerCase()` des deux côtés ; risque d’échec si accents ou caractères spéciaux diffèrent (ex. « Bamako » vs « Bamako » avec caractère Unicode différent). Pas de normalisation des accents dans le code actuel.

### 4. Fichiers concernés

- `src/modules/compagnie/fleet/affectationService.ts` (getAffectationForBoarding).
- `src/modules/agence/embarquement/pages/AgenceEmbarquementPage.tsx` (appel getAffectationForBoarding, formats `selectedDate` / `selectedTrip.heure`).
- `src/modules/agence/manager/ManagerOperationsPage.tsx` (création affectation avec `departureTime` en ISO string).

### 5. Corrections minimales proposées

- **Date** : s’assurer que `selectedDate` passé à `getAffectationForBoarding` est toujours en `YYYY-MM-DD` (normaliser si besoin avant l’appel).
- **Heure** : s’assurer que `selectedTrip.heure` est au format « HH:mm » (ou documenter et normaliser dans getAffectationForBoarding pour accepter « 10h00 » / « 10h »).
- **Villes** : si des cas avec accents ou variantes apparaissent, ajouter une normalisation commune (ex. NFD + suppression des accents) pour `departureCity` / `arrivalCity` côté affectation et côté boarding, sans changer la structure des données.

---

## PARTIE 4 – Investigation stricte du match ville (sans hypothèses)

Constat : un véhicule existe au garage avec `currentCity = "Bamako"`, `operationalStatus = "GARAGE"`, `technicalStatus = "NORMAL"`, mais le dropdown du modal « Affecter un véhicule » est vide.

### 1. Logique de filtrage et source de `agencyCity` (code)

- **Filtrage** : dans `ManagerOperationsPage.tsx`, fonction `loadAvailableVehicles`. Les véhicules affichés dans le dropdown sont ceux retournés par `listVehicles(companyId)` puis filtrés par :
  - `operationalStatus === OPERATIONAL_STATUS.GARAGE` (valeur `"GARAGE"`) ;
  - `technicalStatus === TECHNICAL_STATUS.NORMAL` (valeur `"NORMAL"`) ;
  - `(v.currentCity ?? "").trim().toLowerCase() === agencyCity.trim().toLowerCase()` (match ville) ;
  - `!activeIds.has(v.id)` (pas d’affectation active AFFECTE ou DEPART_CONFIRME).
- **Source de `agencyCity`** : `agencyCity = (user?.ville ?? "").trim()`. La valeur `user.ville` vient de **AuthContext** : elle est lue depuis le document Firestore de l’utilisateur (`data.ville`) et exposée telle quelle (voir `AuthContext.tsx`, `customUser.ville = data.ville || ""`). Aucune autre source (ex. document agence) n’est utilisée pour la ville dans ce filtre.

### 2. Logs de diagnostic ajoutés (PART 4)

Des logs temporaires ont été ajoutés dans `loadAvailableVehicles` pour une **comparaison stricte** sans hypothèse :

- **agencyCityRaw** : valeur brute `user?.ville ?? ""` (avant trim), et `agencyCityRaw.length`.
- **agencyCity** (trimmed) : valeur utilisée dans le filtre, et sa longueur.
- Pour **chaque véhicule** :
  - **currentCityRaw** : `v.currentCity ?? ""` (brut), et `currentCityRaw.length`.
  - **Comparaison stricte** : `strictEq = agencyCityRaw === currentCityRaw`.
  - **Comparaison normalisée** : `normalizedMatch = agencyCityRaw.trim().toLowerCase() === currentCityRaw.trim().toLowerCase()`.
  - **operationalStatus**, **technicalStatus**, **isArchived**, **affectationStatus**, **hasActiveAffectation**.
  - **cityMatch** : résultat du critère utilisé dans le filtre (trim + toLowerCase).
  - **pass** : vrai si le véhicule passe tous les critères (GARAGE + NORMAL + cityMatch + pas d’affectation active).

Préfixe des logs : `[AUDIT Affectation]`.

### 3. Valeurs exactes à observer

Après avoir ouvert le modal « Affecter un véhicule » et consulté la console :

- Noter **agencyCityRaw** et **agencyCityRaw.length** (si vide ou différent de « Bamako », la source est en cause).
- Pour le véhicule connu avec `currentCity = "Bamako"` dans l’UI : noter **currentCityRaw** et **currentCityRaw.length**.
- Noter **strict(===)** et **normalized(trim+toLowerCase)** pour ce véhicule.
- Si `strictEq === false` mais `normalizedMatch === true` → écart de **casse** ou **espaces** (leading/trailing).
- Si les deux sont faux → possible **accent**, **caractère invisible**, ou **chaîne différente** (ex. « Bamako » vs « Bamako » avec caractère Unicode différent).
- Vérifier **operationalStatus** / **technicalStatus** (doivent être `"GARAGE"` et `"NORMAL"`).
- Vérifier **hasActiveAffectation** et **affectationStatus** (si vrai, le véhicule est exclu par `activeIds`).

### 4. Comparaison technique (code)

- **Stricte** : `agencyCityRaw === currentCityRaw` — échoue dès qu’il y a une différence de casse, d’espaces ou de caractères.
- **Normalisée (filtrée)** : `(v.currentCity ?? "").trim().toLowerCase() === agencyCity.trim().toLowerCase()` — insensible à la casse et aux espaces en début/fin. **Pas** de normalisation des accents (NFD) dans le code actuel.
- Si `user.ville` est vide, `agencyCity` est `""` après trim, et `loadAvailableVehicles` sort immédiatement (skip) car `!agencyCity` ; dans ce cas les logs de skip affichent déjà `agencyCityRaw` et `agencyCityRaw.length`.

### 5. Cause réelle (à confirmer via les logs)

La cause réelle doit être **déduite des valeurs imprimées** par les logs, sans supposition. Possibilités :

| Si les logs montrent… | Cause probable |
|----------------------|----------------|
| `agencyCityRaw` vide ou très différent de « Bamako » | **Source** : `user.ville` non renseignée ou différente (document utilisateur vs ville affichée ailleurs). |
| `currentCityRaw` ≠ « Bamako » (espaces, casse, autre orthographe) | **Véhicule** : `currentCity` en base différent de ce que l’UI affiche (ou autre véhicule). |
| `strictEq === false`, `normalizedMatch === true` | **Casse ou espaces** : différence résolue par trim + toLowerCase ; le filtre actuel devrait alors passer → vérifier les autres critères (op/tech, affectation). |
| `normalizedMatch === false` avec chaînes visuellement proches | **Accents ou Unicode** : caractères différents (ex. « é » vs « é ») ; pas de normalisation NFD dans le code. |
| `operationalStatus` ≠ `"GARAGE"` ou `technicalStatus` ≠ `"NORMAL"` | **Statuts** : véhicule exclu par le filtre op/tech (données ou dérivation legacy). |
| `hasActiveAffectation === true` | **Affectation** : véhicule considéré comme déjà affecté (AFFECTE ou DEPART_CONFIRME). |

### 6. Fichiers concernés

- `src/modules/agence/manager/ManagerOperationsPage.tsx` (fonction `loadAvailableVehicles`, variable `agencyCity`).
- `src/contexts/AuthContext.tsx` (origine de `user.ville` = `data.ville`).

### 7. Correction minimale précise (selon cause confirmée)

- **Si source (`user.ville` vide ou incorrecte)** : renseigner `ville` dans le document utilisateur Firestore pour cette agence, ou utiliser la ville de l’agence (document `companies/{companyId}/agences/{agencyId}`) comme fallback pour `agencyCity` dans `loadAvailableVehicles` uniquement, sans changer l’architecture.
- **Si casse / espaces** : le filtre actuel (trim + toLowerCase) suffit ; si le dropdown reste vide, la cause est ailleurs (statuts ou affectation) — corriger d’après les logs.
- **Si accents / Unicode** : ajouter une fonction de normalisation commune (ex. NFD + suppression des marques de combinaison) et l’appliquer aux deux membres de la comparaison ville dans `loadAvailableVehicles` uniquement.
- **Si statuts** : aligner les données véhicule (operationalStatus / technicalStatus) ou la dérivation dans `normalizeVehicleDoc` (vehiclesService) si le véhicule vient d’un ancien statut legacy.
- **Si affectation active à tort** : corriger en base le statut de l’affectation (ex. ARRIVE ou CANCELLED) ou la logique qui alimente `activeIds`.

**Important** : retirer tous les logs de diagnostic (préfixe `[AUDIT Affectation]`) dans `loadAvailableVehicles` une fois la cause identifiée et la correction appliquée.

---

## PARTIE 5 – Correction source de la ville agence (correction structurelle)

### Contexte

La cause réelle du dropdown vide a été identifiée : `user.ville` n’existe pas dans le document utilisateur du chefAgence. La ville est stockée dans le **document Agence**, pas dans le document User. Cela entraînait `agencyCity = ""` et donc une liste de véhicules vide.

### 1. Modification effectuée

La ville utilisée pour le filtrage des véhicules et pour l’affectation ne provient plus du document utilisateur (`user.ville`). Elle est désormais lue depuis le **document Agence** (Firestore : `companies/{companyId}/agences/{agencyId}`), avec priorité à `villeNorm` si présent, sinon `ville`. La valeur est normalisée (trim + toLowerCase) pour le filtre véhicules. Tous les logs temporaires `[AUDIT Affectation]` ont été retirés.

### 2. Fichier(s) modifié(s)

- `src/modules/agence/manager/ManagerOperationsPage.tsx`

### 3. Ancienne logique supprimée

- **Source de la ville** : `const agencyCity = (user?.ville ?? "").trim();` — la ville venait du document utilisateur (AuthContext → `user.ville`), souvent vide pour le chefAgence.
- **Logs de diagnostic** : tous les `console.log` et `console.error` préfixés par `[AUDIT Affectation]` dans `loadAvailableVehicles` (agencyCityRaw, currentCityRaw, strictEq, normalizedMatch, operationalStatus, technicalStatus, affectationStatus, etc.) ont été supprimés.

### 4. Nouvelle logique mise en place

- **State** : `const [agencyCity, setAgencyCity] = useState("");` — la ville de l’agence est un state, alimenté par le document agence.
- **Chargement de la ville** : un `useEffect` dépendant de `companyId` et `agencyId` appelle `getDoc(doc(db, \`companies/${companyId}/agences/${agencyId}\`))`, puis extrait la ville avec `(data?.villeNorm ?? data?.ville ?? "").trim()` et met à jour le state via `setAgencyCity(city)`.
- **Filtrage véhicules** : dans `loadAvailableVehicles`, `agencyCityNorm = agencyCity.trim().toLowerCase()` ; le match ville est `(v.currentCity ?? "").trim().toLowerCase() === agencyCityNorm`. Les autres critères (GARAGE, NORMAL, pas d’affectation active) sont inchangés.
- **Affectation** : `handleAssignVehicle` utilise toujours `agencyCity` (maintenant issu du document agence) pour l’appel à `assignVehicle(..., agencyCity, ...)`.
- **Imports** : ajout de `getDoc` et `doc` depuis `firebase/firestore`.

Aucune modification de la structure Firestore, aucun doublon de la ville dans le document utilisateur, aucune modification de la structure véhicule.

### 5. Confirmation que le dropdown affiche maintenant les véhicules éligibles

Dès que le document agence est chargé et contient `ville` ou `villeNorm` (ex. « Bamako »), `agencyCity` est renseigné. À l’ouverture du modal « Affecter un véhicule », `loadAvailableVehicles` s’exécute avec une valeur de ville non vide ; le filtre par ville compare alors la ville normalisée de l’agence à `vehicle.currentCity` (normalisé). Les véhicules au garage (operationalStatus = GARAGE, technicalStatus = NORMAL) dont la ville correspond à celle de l’agence et qui n’ont pas d’affectation active sont affichés dans le dropdown. Le problème de dropdown vide dû à `agencyCity = ""` est résolu par l’utilisation de la source de vérité agence.

---

## PARTIE 6 – Filtrage date « Départs du jour » et nettoyage des statuts

### Contexte

Les départs étaient dérivés de weeklyTrips avec un jour de la semaine figé ; les anciens départs restaient visibles ; les départs déjà confirmés (DEPART_CONFIRME) apparaissaient encore ; il n’existait pas de sélection de date réelle.

### 1. Modifications effectuées

- **State `selectedDate`** : remplacement de `today` (useMemo figé) et `dayName` par un state `selectedDate` initialisé à la date du jour (YYYY-MM-DD). La date affichée et utilisée pour les départs est désormais pilotée par cette sélection.
- **Contrôles de date** : au-dessus du tableau « Départs du jour », ajout de trois contrôles : bouton « Aujourd’hui » (met `selectedDate` à la date du jour), bouton « Demain » (date du jour + 1), et un champ `input type="date"` pour choisir une date passée ou future. Affichage de la date sélectionnée en clair (ex. « jeudi 20 février 2025 »).
- **Génération des départs à partir de `selectedDate`** : le jour de la semaine est dérivé de `selectedDate` (`dayNameForSelected`), les weeklyTrips sont filtrés pour ce jour, et les créneaux sont projetés sur `selectedDate` (clé et réservations).
- **Filtrage strict** : seuls les départs dont la date de départ correspond à `selectedDate` sont affichés ; les lignes pour lesquelles une affectation a le statut DEPART_CONFIRME (départ confirmé → « En route ») sont exclues du tableau « Départs du jour ».
- **Réservations et affectations** : la souscription Firestore aux réservations utilise `selectedDate` ; `affectationByRowKey` et la création d’affectation utilisent `selectedDate` ; `handleAssignVehicle` enregistre l’heure de départ avec `selectedDate`.

### 2. Fichier(s) modifié(s)

- `src/modules/agence/manager/ManagerOperationsPage.tsx`

### 3. Ancienne logique supprimée

- **`today`** et **`dayName`** : calcul une seule fois au montage (`useMemo(() => toLocalISO(new Date()), [])` et `useMemo(() => weekdayFR(new Date()), [])`), sans réactivité à la date courante ni à une date choisie.
- **Requête réservations** : `where("date", "==", today)` avec `today` figé.
- **Chargement weeklyTrips** : filtre côté chargement par `dayName` (seuls les trajets du jour de la semaine courant étaient conservés), ce qui empêchait de basculer sur demain ou une autre date.
- **Liste des départs** : construite à partir de `dayName` et `today` ; aucun filtrage des lignes dont l’affectation est déjà DEPART_CONFIRME.

### 4. Nouvelle logique mise en place

- **`selectedDate`** : `useState(() => toLocalISO(new Date()))` ; par défaut = date du jour.
- **Contrôles** : « Aujourd’hui » → `setSelectedDate(toLocalISO(new Date()))` ; « Demain » → `setSelectedDate(toLocalISO(addDays(new Date(), 1)))` ; `input type="date"` lié à `selectedDate`.
- **Réservations** : souscription avec `where("date", "==", selectedDate)` ; dépendance du `useEffect` sur `selectedDate`.
- **weeklyTrips** : chargement de tous les trajets (plus de filtre par jour à la récupération) ; `weeklyTripsForDay` = filtre par `dayNameForSelected` (jour de la semaine de `selectedDate`, via `new Date(selectedDate + "T12:00:00")`).
- **Départs** : `departuresRaw` = créneaux pour `selectedDate` (clé `${departure}_${arrival}_${heure}_${selectedDate}`), réservations filtrées par `r.date === selectedDate`. **`keysWithDepartConfirmed`** = ensemble des clés d’affectations dont le statut est DEPART_CONFIRME et dont la date (extraite de `departureTime`) est `selectedDate`. **`departures`** = `departuresRaw` privé des lignes dont la clé est dans `keysWithDepartConfirmed` → les départs confirmés n’apparaissent plus dans « Départs du jour ».
- **`affectationByRowKey`** : matching sur `datePart === selectedDate` (au lieu de `today`).
- **`handleAssignVehicle`** : `departureTime` et `tripId` utilisent `selectedDate`.
- **Import** : ajout de `addDays` depuis `date-fns`.

Aucune modification du schéma Firestore, de la structure weeklyTrips, du service d’affectation, des modules financiers ni du cockpit CEO.

### 5. Confirmation

- **Seule la date sélectionnée est affichée** : les lignes du tableau correspondent uniquement aux créneaux du jour de la semaine de `selectedDate`, projetés sur `selectedDate` ; les réservations et les clés (boardingClosures, affectations) sont alignées sur `selectedDate`.
- **Les départs confirmés disparaissent** : toute ligne pour laquelle une affectation a le statut DEPART_CONFIRME pour ce créneau (même date + même heure + même itinéraire) est exclue de la liste affichée ; ils ne sont plus dans « Départs du jour » et sont considérés comme « En route ».
- **Les anciens départs ne réapparaissent plus** : en restant sur « Aujourd’hui » ou en choisissant une date précise, seuls les créneaux de cette date sont affichés ; les créneaux des jours précédents (anciens « En retard ») ne sont plus listés par défaut, et l’historique est consultable en sélectionnant une date passée.

---

## Résumé

| Partie | Problème | Cause principale | Fichier | Action minimale |
|--------|----------|------------------|---------|------------------|
| 1 | Départs obsolètes / « En retard » | `today` figé au montage ; créneaux = tous ceux du jour de la semaine sans filtre par date calendaire | ManagerOperationsPage | Recalculer `today` (ou utiliser `selectedDate`) ; pas de mémo avec `[]` |
| 2 | Liste véhicules vide dans le modal | À confirmer via logs : ville (agencyCity vs currentCity), affectations actives, isArchived, ou statuts véhicule | ManagerOperationsPage, AuthContext | Utiliser les logs console ; corriger selon la cause (ville, affectations, ou statuts) |
| 3 | Sync affectation → boarding | Risques : format date `selectedDate`, format heure, comparaison de villes avec accents | affectationService, AgenceEmbarquementPage | Normaliser date en YYYY-MM-DD et heure en HH:mm ; optionnel : normalisation des accents pour les villes |
| 4 | Match ville strict (dropdown vide) | Cause : `user.ville` absent → agencyCity vide | ManagerOperationsPage, AuthContext | **PART 5 appliquée** : ville lue depuis le document agence (villeNorm / ville) ; logs retirés |
| 5 | Source ville agence (correction structurelle) | Ville stockée dans l’agence, pas dans l’utilisateur | ManagerOperationsPage | Ville chargée depuis `companies/{companyId}/agences/{agencyId}` (villeNorm ?? ville) ; filtre véhicules et assignVehicle utilisent cette valeur ; logs [AUDIT Affectation] retirés |
| 6 | Filtrage date « Départs du jour » + statuts | today/dayName figés ; départs confirmés encore affichés ; pas de sélection de date | ManagerOperationsPage | **PART 6 appliquée** : selectedDate, contrôles Aujourd’hui/Demain/DatePicker, départs basés sur selectedDate, exclusion DEPART_CONFIRME |

Les logs temporaires (Parties 2 et 4) ont été retirés lors de la correction PART 5.
