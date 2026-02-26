# Analyse technique — Code agent (guest) et numéro de ticket (Guichet)

**Objectif :** Comprendre précisément comment sont générés le code agent (guichetier/comptable) et le numéro de référence (ticket) dans le système Guichet, afin de répliquer un système équivalent pour les numéros d’envoi Courrier.

**Périmètre :** Analyse uniquement. Aucune modification, aucun refactoring.

---

## PARTIE 1 — Code agent (guest / staff code)

### Où est généré le code ?

Le code agent (staff code / code court) est généré à **deux endroits** :

1. **Frontend — ManagerTeamPage**  
   - Fichier : `src/modules/agence/manager/ManagerTeamPage.tsx`  
   - Fonction : `allocateStaffCode(companyId, agencyId, role)`  
   - Appelée lors de l’**édition** d’un agent (guichetier ou agency_accountant) qui n’a **pas encore** de `staffCode` (lignes 227–231).

2. **Backend — Cloud Function (acceptation d’invitation)**  
   - Fichier : `functions/src/index.ts` (création utilisateur / acceptation d’invitation)  
   - À l’intérieur d’une **transaction Firestore** : lecture du compteur, incrément, écriture du compteur + création/mise à jour du user avec `staffCode`.

### Format utilisé

- **Guichetier :** `G` + séquence sur 3 chiffres → ex. `G001`, `G002`.  
- **Comptable agence :** `ACC` + séquence sur 3 chiffres → ex. `ACC001`.

### Unicité et périmètre

- **Périmètre :** **Par agence** (et par rôle).  
- Le compteur est stocké dans :  
  `companies/{companyId}/agences/{agencyId}/counters/{role}`  
  avec `role` = `"guichetier"` ou `"agency_accountant"`.  
- Donc : unicité **par compagnie + agence + rôle** (ex. G001 peut exister dans une autre agence).

### Collection / document compteur

- **Chemin Firestore :**  
  `companies/{companyId}/agences/{agencyId}/counters/{role}`  
- **Champs utilisés :**  
  - `lastSeq` (number) : dernière séquence attribuée  
  - `updatedAt` (timestamp)

Il n’y a **pas** de collection dédiée « counters » à la racine ; le compteur est un **document par rôle** sous chaque agence.

### Garantie d’unicité et conditions de course

- **Backend (Cloud Function) :**  
  Utilisation d’une **transaction** Firestore : lecture du compteur, calcul `newSeq = lastSeq + 1`, écriture du compteur et du user. Les conditions de course sont gérées par la transaction.

- **Frontend (ManagerTeamPage) :**  
  **Aucune transaction.**  
  `allocateStaffCode` fait un `getDoc(counterRef)` puis un `setDoc(counterRef, { lastSeq: seq, ... }, { merge: true })`.  
  En cas de deux attributions simultanées (même agence, même rôle), un **risque de doublon** existe (deux agents peuvent recevoir le même code).

- **AgencePersonnelPage :**  
  Même schéma sans transaction (getDoc + setDoc). Même risque si utilisé en parallèle.

**En résumé :**  
- Côté backend (invitation), l’unicité est garantie par la transaction.  
- Côté frontend (ManagerTeamPage / AgencePersonnelPage), l’attribution du code n’est **pas** protégée par une transaction ; la robustesse repose sur un usage « un utilisateur à la fois » par agence.

---

## PARTIE 2 — Génération du numéro de ticket (referenceCode)

### Où est généré le numéro ?

Le numéro affiché comme « ticket » ou « référence » est le **referenceCode** de la réservation. Il est généré **côté frontend** au moment de la vente guichet :

- **Fichier :** `src/modules/agence/guichet/pages/AgenceGuichetPage.tsx`  
- **Fonction locale :** `generateRef(opts)` (lignes 102–118), **définie dans la même page** (pas dans `referenceCode.ts` ni `tickets.ts` pour le flux guichet actuel).

### Structure exacte du numéro

Format produit par `generateRef` (AgenceGuichetPage) :

```text
{companyCode}-{agencyCode}-{sellerCode}-{seq}
```

- **companyCode :** code court compagnie (ex. `KMT`), défaut `"COMP"` si absent.  
- **agencyCode :** code court agence (ex. `ABJ`), défaut `"AGC"`.  
- **sellerCode :** code du vendeur = **code agent (staff code)** du guichetier (ex. `G001`) ou `"GUEST"` si non défini.  
- **seq :** séquence sur **3 chiffres** (padStart 3, `0`).

Exemple : `KMT-ABJ-G001-042`.

### Compteur utilisé

- **Document Firestore :**  
  `companies/{companyId}/counters/byTrip/trips/{tripInstanceId}`  
- **Champs :**  
  - `lastSeq` (number)  
  - `updatedAt` (timestamp)  
  - optionnellement `agencyId` (dans `referenceCode.ts`)

Donc le compteur est **par instance de trajet** (`tripInstanceId` = identifiant stable du trajet, ex. trajet hebdo + date + heure).  
**Périmètre :** par **compagnie** et par **trip instance** (pas par agence seule, pas par jour global).

### Transaction et conditions de course

- La génération du numéro s’effectue dans une **transaction** Firestore :  
  - `runTransaction(db, async (tx) => { ... })`  
  - Lecture du document compteur, calcul `n = last + 1`, mise à jour du compteur (`set` ou `update`), retour de `n`.  
- En cas d’échec de la transaction (ex. premier passage), un **fallback** fait un `setDoc(..., { lastSeq: 1 }, { merge: true })` et retourne `1`.  
- Les conditions de course sont donc **gérées** par la transaction : un seul numéro est attribué par appel réussi.

### Autres implémentations (hors flux guichet principal)

- **`src/utils/referenceCode.ts`** — `generateRefCodeForTripInstance` :  
  Même chemin de compteur `companies/.../counters/byTrip/trips/{tripInstanceId}`, format avec séquence sur **6 chiffres**, canal (WEB ou code guichetier).  
- **`src/utils/tickets.ts`** — `generateReferenceCodeForTripInstance` :  
  Même compteur, format avec séquence sur **4 chiffres**.  
- **Réservation en ligne** (`ReservationClientPage`) utilise `generateWebReferenceCode` (sellerCode = `"WEB"`).

Le **flux guichet (AgenceGuichetPage)** utilise uniquement la fonction **locale** `generateRef` décrite ci-dessus (3 chiffres, company-agency-sellerCode-seq).

---

## PARTIE 3 — Structure Firestore des compteurs

### Compteurs utilisés

| Usage              | Chemin Firestore                                                                 | Champ incrémenté | Périmètre              |
|--------------------|-----------------------------------------------------------------------------------|------------------|-------------------------|
| Ticket / référence | `companies/{companyId}/counters/byTrip/trips/{tripInstanceId}`                    | `lastSeq`        | Par trip instance      |
| Code guichetier    | `companies/{companyId}/agences/{agencyId}/counters/guichetier`                    | `lastSeq`        | Par agence             |
| Code comptable     | `companies/{companyId}/agences/{agencyId}/counters/agency_accountant`            | `lastSeq`        | Par agence             |

Il n’existe **pas** de documents du type :

- `counters/byTrip` (c’est un segment de chemin : `counters/byTrip/trips/{tripInstanceId}`)  
- `counters/byAgency`  
- `counters/tickets`

Les vrais documents sont :

- Pour les tickets : **un document par `tripInstanceId`** sous `companies/{companyId}/counters/byTrip/trips/`.  
- Pour les codes agent : **un document par rôle** sous `companies/{companyId}/agences/{agencyId}/counters/`.

### Règles Firestore

- Dans `firestore.rules`, seul le compteur **byTrip** est mentionné explicitement :  
  `match /companies/{companyId}/counters/byTrip/trips/{tripInstanceId}` avec `allow get, create, update: if true;`.  
- Les compteurs **agences** (`agences/{agencyId}/counters/{role}`) ne sont pas visibles dans les extraits analysés ; ils peuvent être couverts par une règle plus large sur `companies/.../agences/...`.

---

## PARTIE 4 — Intégration : moment d’injection du numéro dans la réservation

### Moment

Le **referenceCode** (numéro de ticket) est généré **avant** l’écriture de la réservation, dans le même flux utilisateur « confirmer la vente » :

1. L’utilisateur valide la vente (client, places, montant, etc.).  
2. Le frontend appelle `generateRef({ companyId, agencyId, companyCode, agencyCode, tripInstanceId, sellerCode })`.  
3. La transaction Firestore incrémente le compteur et retourne la séquence ; le frontend forme la chaîne `companyCode-agencyCode-sellerCode-seq`.  
4. Le frontend appelle **ensuite** `createGuichetReservation({ ... params, referenceCode, ... })`.  
5. `createGuichetReservation` écrit le document de réservation avec `referenceCode` déjà fixé.

Donc : le numéro est **injecté dans la réservation** en étant **passé en paramètre** à `createGuichetReservation`. Il n’est **pas** généré à l’intérieur de `createGuichetReservation` ni après paiement : en guichet le « paiement » est la vente en espèces au moment de la réservation, et le numéro est attribué **juste avant** cette écriture.

### Rôle de createGuichetReservation

- **Fichier :** `src/modules/agence/services/guichetReservationService.ts`  
- La fonction **reçoit** `referenceCode` dans `CreateGuichetReservationParams` et l’enregistre dans le payload (champ `referenceCode`) avec les autres champs (guichetierId, guichetierCode, shiftId, etc.).  
- Elle **ne génère pas** elle-même le numéro ; elle ne fait qu’écrire la réservation avec le `referenceCode` fourni.

---

## Synthèse pour répliquer (Courrier)

Pour répliquer un système de numérotation pour les envois Courrier, on peut s’inspirer du Guichet comme suit :

1. **Code agent**  
   - Déjà réutilisé : le Courrier utilise le même `staffCode` / `codeCourt` / `code` du user (affiché sur reçu, session, etc.).  
   - Si on voulait un compteur dédié « agent courrier » : même schéma que guichetier avec un document  
     `companies/{companyId}/agences/{agencyId}/counters/agentCourrier`  
     et format du type `COU001` ou équivalent, **idéalement dans une transaction** (backend ou service frontend avec transaction) pour éviter les doublons.

2. **Numéro d’envoi (équivalent referenceCode)**  
   - Créer un compteur **dédié Courrier**, par exemple :  
     - soit **par agence** : `companies/{companyId}/agences/{agencyId}/counters/courierShipments` (lastSeq) ;  
     - soit **par session** : `companies/.../agences/.../courierSessions/{sessionId}/counters/shipments` (lastSeq).  
   - Générer le numéro dans une **transaction** Firestore (lire lastSeq, incrémenter, écrire, retourner la séquence).  
   - Format possible : `{companyCode}-{agencyCode}-COU-{seq}` ou `COU-{agencyCode}-{sessionCode}-{seq}` avec séquence sur 5 ou 6 chiffres.  
   - Appeler cette génération **avant** la création du document shipment (ou au début de la transaction qui crée le shipment) et attacher le numéro au document (ex. `displayCode` ou `shipmentNumber` en plus de `shipmentId` Firestore).

3. **Garanties**  
   - Utiliser **toujours** une **transaction** pour l’incrément du compteur (et si possible pour créer le shipment avec ce numéro) pour éviter les conditions de course et les doublons, comme pour le ticket Guichet.

---

*Document généré pour analyse — aucune modification du code.*
