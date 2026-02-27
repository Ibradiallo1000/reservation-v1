# Audit factuel — Génération numéro de billet (sans modification)

**Objectif :** Décrire exactement comment les numéros de billets (referenceCode) sont générés aujourd’hui. Aucune proposition, aucun changement, aucun nouveau format.

---

## 1. Génération guichet

### Fichier exact responsable

- **Fichier :** `src/modules/agence/guichet/pages/AgenceGuichetPage.tsx`
- **Fonction :** `generateRef` (définie localement dans le même fichier, lignes 106–123).

### Fonction exacte utilisée

- **Nom :** `generateRef`
- **Signature :**  
  `async function generateRef(opts: { companyId: string; companyCode?: string; agencyId: string; agencyCode?: string; tripInstanceId: string; sellerCode: string; })`
- **Appel :** lors de la validation d’une vente (lignes 467–471), juste avant `createGuichetReservation`.

### Format exact généré

- **Pattern :** `{companyCode}-{agencyCode}-{sellerCode}-{seq}`  
- **Séquence :** 3 chiffres, padding à gauche par des zéros (`String(next).padStart(3, "0")`).  
- **Exemple réel :** `MT-AP-GCH12-001` (compagnie MT, agence AP, guichetier GCH12, 1er billet de cette instance de trajet).

### Injection des valeurs

- **Code compagnie (`companyCode`)**  
  - Provenance : `companyMeta.code`, passé à `generateRef` en `companyCode: companyMeta.code`.  
  - Remplissage de `companyMeta` : dans un `useEffect` au chargement de la page, lecture du document `companies/{user.companyId}` ; puis `setCompanyMeta({ name, code: makeShortCode(name, c.code), ... })`.  
  - `makeShortCode` (fichier `src/utils/brand.ts`) : si le document compagnie a un champ `c.code`, il est utilisé (nettoyé, majuscules, max 5 caractères) ; sinon, code déduit du nom (initiales des mots, ex. « Mali Trans » → « MT »).  
  - Valeurs par défaut si pas de compagnie chargée : `companyMeta` initialisé avec `code: "COMP"`.

- **Code agence (`agencyCode`)**  
  - Provenance : `agencyMeta.code`, passé en `agencyCode: agencyMeta.code`.  
  - Remplissage : lecture du document `companies/{companyId}/agences/{agencyId}` ; puis `setAgencyMeta({ name, code: makeShortCode(a?.nomAgence || a?.nom || ville, a?.code), ... })`.  
  - Si le document agence a un champ `a.code`, il est utilisé ; sinon, déduction par `makeShortCode` à partir du nom (ou de la ville).  
  - Valeur par défaut dans `generateRef` si non fournie : `"AGC"`.

- **Code guichetier (`sellerCode`)**  
  - Provenance : `sellerCodeCached || staffCodeForSale` passé en `sellerCode: sellerCodeCached || staffCodeForSale`.  
  - `staffCodeForSale` : `(user as any)?.staffCode || (user as any)?.codeCourt || (user as any)?.code || "GUEST"` (utilisateur connecté, champs lus côté client).  
  - `sellerCodeCached` : état local initialisé à `"GUEST"` ; peut être mis à jour par un appel à `getSellerCode(user.uid)` qui lit le document `users/{uid}` et prend `staffCode || codeCourt || code`.  
  - Donc : code guichetier = valeur en base (users) ou dérivée de l’utilisateur, sinon `"GUEST"`.

- **Compteur (`next`)**  
  - Lu et incrémenté dans la transaction (voir ci‑dessous).  
  - Aucune autre source ; entièrement piloté par le document compteur Firestore.

### Le compteur est-il journalier ?

- **Non.** Le compteur n’est pas journalier.  
- Il est **par instance de trajet** : le document utilisé est  
  `companies/{companyId}/counters/byTrip/trips/{tripInstanceId}`.  
- `tripInstanceId` = `selectedTrip.id`, qui est construit dans la page comme  
  `id: \`${w.id}_${dateISO}_${h}\``  
  où `w.id` = id du weeklyTrip, `dateISO` = date du trajet (YYYY-MM-DD), `h` = heure du créneau.  
- Donc une même « instance » = un même trajet (ligne) + une même date + une même heure. Chaque (trajet, date, heure) a son propre compteur ; le compteur n’est pas remis à zéro chaque jour de façon explicite, il est simplement distinct par instance.

### Où est-il stocké ?

- **Chemin Firestore :**  
  `companies / {companyId} / counters / byTrip / trips / {tripInstanceId}`  
  avec `tripInstanceId` de la forme `{weeklyTripId}_{YYYY-MM-DD}_{HH:mm}` (ex. `abc123_2025-02-26_08:00`).  
- **Champs du document :** `lastSeq` (nombre), `updatedAt` (Timestamp).  
- **Création :** à la première vente pour cette instance, `tx.set(counterRef, { lastSeq: n, updatedAt: Timestamp.now() })` ; ensuite `tx.update` pour incrémenter.

### Comment l’unicité est-elle garantie ?

- **Transaction Firestore :** `runTransaction(db, async (tx) => { ... })`.  
- Dans la transaction : lecture du document compteur, calcul `n = last + 1`, puis soit `tx.set` (création), soit `tx.update` (mise à jour) avec `lastSeq: n`.  
- Une seule séquence par document ; Firestore garantit l’atomicité de la transaction. Donc une seule valeur `next` par appel pour cette instance de trajet.  
- En cas d’échec de la transaction, le code fait un fallback : `setDoc(counterRef, { lastSeq: 1, updatedAt: Timestamp.now() }, { merge: true })` et retourne `1`. Ce fallback peut en théorie créer une race si plusieurs appels échouent en même temps ; en pratique le premier `setDoc` gagne, les suivants peuvent réutiliser la même valeur 1. Le cas normal est la transaction qui réussit.

---

## 2. Génération en ligne

### Fichier responsable

- **Fichier :** `src/utils/tickets.ts`  
- **Fonction exportée utilisée :** `generateWebReferenceCode` (lignes 72–85), qui appelle en interne `generateReferenceCodeForTripInstance` (lignes 31–70) en passant `sellerCode: 'WEB'`.

### Fonction utilisée

- **Nom :** `generateWebReferenceCode` (point d’entrée) puis `generateReferenceCodeForTripInstance`.  
- **Appel :** depuis `src/modules/compagnie/public/pages/ReservationClientPage.tsx` (lignes 838–845), au moment de la création de la réservation (étape « réserver »), après lecture des documents compagnie et agence pour récupérer les codes.

### Format exact généré

- **Pattern :** `{companyCode}-{agencyCodeEff}-WEB-{seq}`  
  avec `companyCode` en majuscules, `agencyCodeEff` = code agence fourni ou inféré (voir ci‑dessous), et `sellerCode` fixe `'WEB'`.  
- **Séquence :** 4 chiffres, padding à gauche (`String(next).padStart(4, '0')`).  
- **Exemple réel :** `MT-AP-WEB-0001`.

### Différence avec le guichet

- **Troisième segment :** en ligne c’est toujours `WEB` ; au guichet c’est le code guichetier (ex. `GCH12`) ou `GUEST`.  
- **Padding du compteur :** en ligne 4 chiffres (`0001`) ; au guichet 3 chiffres (`001`).  
- **Compteur :** même chemin Firestore  
  `companies/{companyId}/counters/byTrip/trips/{tripInstanceId}`.  
  Donc pour une même instance de trajet (même `tripInstanceId`), le guichet et le web **partagent le même compteur** : la valeur `next` peut être la même (ex. 1), mais la référence complète diffère par le 3ᵉ segment (WEB vs code guichetier) et le nombre de chiffres (4 vs 3).

### Gestion du compteur

- **Même mécanisme que le guichet :**  
  - Document : `companies/{companyId}/counters/byTrip/trips/{tripInstanceId}`.  
  - Transaction : lecture `lastSeq`, incrément, `tx.set` ou `tx.update` avec `lastSeq: n` et `updatedAt: Timestamp.now()`.  
- **Fallback en cas d’échec de transaction :** `setDoc(..., { lastSeq: 1, updatedAt: Timestamp.now() }, { merge: true })` et retour de `1`.  
- **Non journalier :** même logique « par instance de trajet » ; `tripInstanceId` vient de `selectedTrip.id` côté client (même forme `weeklyTripId_date_heure`).

### Garantie d’unicité

- **Transaction :** oui, `runTransaction(db, async (tx) => { ... })`.  
- **Unicité de la référence complète :** pour une même instance, la séquence est unique ; le préfixe contient toujours `WEB` en ligne et le code guichetier au guichet, donc pas de collision entre canal web et canal guichet même avec le même numéro de séquence.

---

## 3. Génération courrier (si existe)

- **Billets (réservations / referenceCode) :** il n’existe **pas** de génération de numéro de **billet** dans le module courrier. Le courrier gère des **envois** (colis), pas des réservations de transport.  
- **Numéro d’envoi (shipmentNumber) :**  
  - Fichier : `src/modules/logistics/services/createShipment.ts`.  
  - Format : `{companyCode}-{agencyCode}-{agentCode}-{seq}` (ex. `KMT-ABJ-C003-00042`).  
  - Compteur : document Firestore  
    `companies/{companyId}/agences/{originAgencyId}/counters/shipmentSeq`  
    (un compteur **par agence**, global aux envois de cette agence, pas par trajet).  
  - Séquence : 5 chiffres (`SHIPMENT_SEQ_PAD = 5`).  
  - Génération dans une `runTransaction` : lecture du compteur, incrément, écriture du compteur et création du document d’envoi dans la même transaction.  
- **Fichier `src/utils/referenceCode.ts` :**  
  - Contient une fonction `generateRefCodeForTripInstance` qui produit un format du type `{companyCode}-{agencyCode}-{channelCode}-{seq}` avec une séquence sur 6 chiffres et le **même** chemin de compteur que guichet/web (`companies/.../counters/byTrip/trips/{tripInstanceId}`).  
  - Cette fonction **n’est importée nulle part** dans le projet (recherche d’imports). Elle n’est donc pas utilisée aujourd’hui pour la génération des billets ni pour le courrier.

**Conclusion :** Pour les **billets**, seuls le guichet et l’en ligne sont concernés ; pas de « génération courrier » pour les numéros de billet.

---

## 4. Risque potentiel

### Peut-il y avoir collision ?

- **Entre guichet et web pour la même instance de trajet :**  
  Non. Ils utilisent le **même** document compteur, donc la même séquence est incrémentée. Deux billets (un guichet, un web) pour la même instance auront des séquences différentes (ex. 1 et 2). Les références seront par exemple `MT-AP-GCH12-001` et `MT-AP-WEB-0002` ; les chaînes complètes sont différentes (segment WEB vs GCH12, et 3 vs 4 chiffres).  
- **Entre deux billets du même canal (deux guichets ou deux web) :**  
  Non, tant que la transaction réussit : un seul `next` par appel, et chaque appel incrémente le compteur.  
- **En cas de fallback (transaction échouée, `setDoc` avec `lastSeq: 1`) :**  
  Si plusieurs appels tombent en fallback pour la **même** instance, ils peuvent tous recevoir `1` et écrire ou réécrire le compteur à 1. On pourrait alors avoir deux références avec la même séquence (ex. deux `MT-AP-WEB-0001` à des moments différents). Le risque existe en théorie ; il est limité au cas « transaction en échec » (réseau, contention, etc.).

### Deux billets peuvent-ils avoir la même référence ?

- **En fonctionnement normal (transaction réussie) :** non. Une transaction = une lecture + un incrément + une écriture atomique ; chaque billet obtient un `next` distinct pour cette instance.  
- **En fallback (voir ci‑dessus) :** oui, possible si plusieurs créations pour la même instance utilisent le fallback et obtiennent toutes la valeur 1 (ou une même valeur réécrite).

### Le compteur est-il atomique ?

- **Oui.** L’incrément est fait à l’intérieur d’une `runTransaction` Firestore : lecture du document, calcul `n = last + 1`, écriture du nouveau `lastSeq`. Firestore assure l’atomicité de la transaction (isolation et commit unique).

### Utilise-t-il une transaction Firestore ?

- **Guichet :** oui, `runTransaction(db, async (tx) => { ... })` dans `generateRef`.  
- **En ligne :** oui, `runTransaction(db, async (tx) => { ... })` dans `generateReferenceCodeForTripInstance` (tickets.ts).  
- **Courrier (shipmentNumber) :** oui, `runTransaction` dans `createShipment` pour la lecture/écriture du compteur et la création de l’envoi.  
- **referenceCode.ts :** utilise aussi `runTransaction`, mais ce fichier n’est pas utilisé pour les billets actuellement.

---

**Rapport purement descriptif. Aucune modification. Aucune amélioration proposée.**
