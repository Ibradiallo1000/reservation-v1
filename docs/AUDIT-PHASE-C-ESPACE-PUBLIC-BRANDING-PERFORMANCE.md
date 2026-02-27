# Audit global — Phase C (Espace public / Branding / Performance)

**Objectif :** Audit technique et UX complet de l’espace public (pages publiques compagnie). Aucune correction appliquée.

---

## 1. Hero section — Responsive & visibilité

### Fichier analysé
- **Utilisé en production :** `src/modules/plateforme/components/HeroSection.tsx` (importé par `PublicCompanyPage`).
- **Non utilisé (doublon) :** `src/modules/compagnie/public/components/HeroSection.tsx` (texte "Teliya" en dur).

### Classes CSS responsables

| Élément | Classes | Problème potentiel |
|--------|---------|--------------------|
| **Section** | `relative overflow-hidden text-white` | `overflow-hidden` peut tronquer le titre sur petits viewports si le texte force le débordement. |
| **Conteneur** | `max-w-5xl mx-auto px-2 py-8 md:py-24 text-center` | `px-2` très serré en mobile (8px) → titre long peut coller aux bords. Pas de `sm`/`lg`/`xl` pour padding progressif. |
| **Titre h1** | `text-3xl md:text-6xl font-extrabold tracking-tight drop-shadow-[0_2px_8px_rgba(0,0,0,.5)]` | **Pas de `sm` ni `lg`** : saut direct de 3xl (≈30px) à 6xl (≈60px). En tablette (768px–1024px) le titre peut être trop gros ou mal proportionné. Pas de `line-height` explicite → risque de coupure de ligne inégale. |
| **Span "trajets" / nom** | `text-orange-500` | Couleur **hardcodée orange**, non liée au thème compagnie (voir §3). |

### Breakpoints testés (recommandés)

- **375px (mobile)** : `text-3xl` + `px-2` → titre lisible mais marge minimale ; risque de wrap sur noms longs.
- **412px (mobile large)** : même comportement (pas de breakpoint entre 375 et 768).
- **768px (md)** : passage à `text-6xl` et `py-24` → changement brutal.
- **1024px+ (desktop)** : pas de classe dédiée.

### Synthèse

- **Visibilité mobile :** Titre visible ; risque de **débordement** si nom de compagnie très long (ex. "Société Nationale des Transports du Mali").
- **Font-size responsive :** Deux paliers uniquement (`text-3xl` / `text-6xl`) ; pas de progression `sm`/`lg`/`xl`.
- **Line-height :** Non défini sur le h1 ; dépend du navigateur.
- **Overflow :** `overflow-hidden` sur la section peut masquer du contenu en cas de zoom ou texte long.
- **Hidden par breakpoint :** Aucun `hidden`/`block` Tailwind sur le titre.

**Livrable :**  
Classes à ajuster en priorité : `px-2` (→ `px-4 sm:px-6`), `text-3xl md:text-6xl` (→ ajouter `sm:text-4xl lg:text-5xl` si besoin), `overflow-hidden` (à garder mais tester avec texte long). Remplacer `text-orange-500` par une couleur issue du thème (primary/secondary).

---

## 2. Destinations populaires — Performance

### Flux actuel

- **Composant :** `VilleSuggestionBar.tsx` (titré "Destinations populaires").
- **Données :** `suggestedTrips` fournies par `PublicCompanyPage`, issues d’un `useEffect` qui dépend de `company?.id`.

### Chaîne de chargement

1. **Mount** → `company` peut être `undefined` (slug en cours de résolution).
2. **useEffect [slug]** → `getDocs(companies, where("slug", "==", slug))` → `setCompany(...)`.
3. **useEffect [company]** → si `company?.id` :
   - `getDocs(companies/${company.id}/agences)`
   - Pour **chaque agence** : `getDocs(companies/${id}/agences/${agId}/weeklyTrips)` (N+1).
   - Agrégation en `Map` par `departure_arrival`, puis `setSuggestedTrips(...)`.

### Problèmes identifiés

| Problème | Détail |
|----------|--------|
| **Waterfall** | Destinations chargées **après** la compagnie ; pas de préchargement possible sans `company.id`. |
| **N+1** | Une requête `weeklyTrips` par agence ; non indexée par une requête unique (pas de collection group sur `weeklyTrips`). |
| **Pas de skeleton** | `VilleSuggestionBar` affiche `suggestions.slice(0, 4)` ; si `suggestions` est vide (début), la zone est vide jusqu’au retour des données. Aucun loader/skeleton. |
| **Re-renders** | `suggestedTrips` dans le state → re-render de toute la page à l’arrivée des données ; pas de mémoisation du rendu des cartes. |
| **Dépendance companyData** | Les suggestions dépendent uniquement de `company.id` ; pas de cache explicite (sessionStorage/localStorage) pour éviter de refaire les N+1 à chaque visite. |
| **Index Firestore** | Requêtes par `slug` sur `companies` et listes `agences` / `weeklyTrips` ; pas d’index composite spécifique "destinations populaires". |

### Cause principale du délai

- **Délai d’affichage :** Enchaînement **slug → company → agences → N × weeklyTrips** ; le bloc "Destinations populaires" reste vide jusqu’à la fin de ce flux (souvent 1–3 s selon le nombre d’agences).

### Recommandations

1. **Skeleton :** Afficher 4 cartes factices (même structure que les cartes, contenu grisé) tant que `suggestedTrips.length === 0` et `company` défini.
2. **Cache :** Stocker en `sessionStorage` la liste `suggestedTrips` (et éventuellement `agences`) clé par `company.id` avec TTL court (ex. 5 min) pour éviter de refaire les N+1 à chaque navigation.
3. **Préchargement :** Dans `RouteResolver` (ou parent), si on a déjà `company` (ex. via cache/slug), déclencher le chargement des suggestions en parallèle du premier paint.
4. **Réduction N+1 :** Étudier un stockage agrégé côté Firestore (ex. document `companies/{id}/cache/suggestedTrips` mis à jour par Cloud Function ou à la sauvegarde des trajets) pour une seule lecture.
5. **Index :** Vérifier dans la console Firestore que les requêtes `agences` et `weeklyTrips` n’engendrent pas d’avertissement d’index ; ajouter un index composite si suggéré.

**Livrable :**  
Cause du délai : waterfall **company → agences → N × weeklyTrips** sans skeleton ni cache. Solution recommandée : skeleton + cache sessionStorage par `company.id` + à moyen terme agrégat ou préchargement.

---

## 3. Branding global public

### Pages vérifiées

- PublicCompanyPage  
- ResultatsAgencePage  
- ReservationClientPage (réservation = page publique)  
- ReservationDetailsPage  
- ClientMesBilletsPage  
- ClientMesReservationsPage  
- AidePage  
- ReceiptEnLignePage  
- UploadPreuvePage  
- ConditionsPage  
- Footer, Header (CompanyPublicHeader), HeroSection (plateforme)

### Logo dans le header

- **CompanyPublicHeader** : Affiche `company.logoUrl` ou initiales avec `brandColor` (primary ou `BRAND_ORANGE`). Logo présent et cohérent si `company` est chargé.
- **ReceiptEnLignePage / AidePage / ClientMesBilletsPage** : Pas de header commun avec logo compagnie ; header propre à chaque page (retour + titre). Logo présent sur le reçu (TicketOnline) et dans le flux réservation.

### Couleur primaire

- Utilisée correctement sur la majorité des pages (Header, Footer, boutons, bordures) via `colors.primary` ou `couleurPrimaire`.
- **Fallbacks hardcodés différents :**  
  `#3B82F6`, `#ea580c`, `#f43f5e`, `#FF6600` (BRAND_ORANGE), `#2563eb` selon les fichiers → incohérence si compagnie sans couleur.

### Couleur secondaire

| Page / composant | Utilisation secondaire |
|------------------|-------------------------|
| PublicCompanyPage | Passée à CompanyServices, AvisListePublic, AgencyList (primary + secondary). |
| VilleSuggestionBar | Utilisée (gradient bouton, badge prix). |
| Footer | Gradient et icônes en `couleurSecondaire`. |
| ReservationDetailsPage | Gradients et boutons (primary + secondary). |
| ClientMesReservationsPage | Thème avec primary/secondary (gradients, bordures). |
| ReservationClientPage | Thème (primary/secondary) pour boutons et bordures. |
| **HeroSection (plateforme)** | **Non utilisée** : bouton et accents en **orange Tailwind** (`text-orange-500`, `bg-orange-300`, `from-orange-600 to-orange-500`). |
| **UploadPreuvePage** | Encadré info en **hardcodé `#f59e0b`** (ligne 566–568) au lieu de secondary. |
| **AidePage** | Uniquement primary ; pas de secondary. |
| **ClientMesBilletsPage** | Thème avec primary ; secondary utilisée pour certains badges/états. |
| **ResultatsAgencePage** | primary + secondary dans themeConfig ; cohérent. |
| **ReceiptEnLignePage** | primary/secondary pour header et boutons. |
| **ConditionsPage** | primary uniquement. |

### Zones encore en orange (ou couleur fixe)

- **HeroSection (plateforme)** :  
  - `text-orange-500` (trajets + nom compagnie).  
  - Bouton : `bg-orange-300/70`, `from-orange-600 to-orange-500`, `focus-within:ring-orange-400/80`, etc.
- **UploadPreuvePage** :  
  - Bloc info : `backgroundColor: hexToRgba('#f59e0b', 0.05)`, `borderColor: '#f59e0b'`, `color: '#f59e0b'`.
- **CompanyPublicHeader** :  
  - `BRAND_ORANGE = '#FF6600'` en fallback si `colors.primary` absent.
- **PublicCompanyPage** :  
  - NotFoundScreen : `primaryColor={colors.primary || "#FF6600"}`.
- **ClientMesReservationsPage** :  
  - Fallback thème : `primary: "#ea580c"`, `secondary: "#f97316"` ; champ recherche `focus:ring-orange-200`.

### Boutons (theme.primary / theme.secondary)

- La plupart des pages utilisent `theme.primary` (ou équivalent) pour les CTA principaux.
- **HeroSection** : n’a pas accès au thème ; bouton 100 % orange Tailwind.
- Secondary utilisée pour boutons secondaires / gradients sur Footer, ReservationDetails, ClientMesReservations, VilleSuggestionBar.

### Backgrounds et gradients

- Footer : `linear-gradient(90deg, couleurPrimaire, couleurSecondaire)`.
- ReservationDetailsPage : gradients primary/secondary pour carte billet.
- HeroSection : gradient noir + image ; pas de couleurs compagnie.

**Livrable — Endroits où la secondaire n’est pas utilisée (ou orange hardcodé) :**

1. **HeroSection (plateforme)** : tout le bloc titre + formulaire + bouton (remplacer par primary/secondary du thème).
2. **UploadPreuvePage** : bloc info "Montant et moyen de paiement" (lignes 566–568) : remplacer `#f59e0b` par `secondaryColor` ou primary.
3. **AidePage** : pas de secondaire (optionnel pour icônes ou liens).
4. **ClientMesReservationsPage** : fallback orange (`#ea580c` / `#f97316`) et `focus:ring-orange-200` à aligner sur thème.
5. **Header** : fallback `BRAND_ORANGE` à conserver uniquement si aucune primary n’est définie.

---

## 4. Identifiant billet — Dynamisme

### Architecture actuelle

- **Web (en ligne) :**  
  - `ReservationClientPage` appelle `generateWebReferenceCode` (`src/utils/tickets.ts`).  
  - Format : `{companyCode}-{agencyCode}-WEB-{seq4}` (seq sur 4 chiffres).  
  - `companyCode` : `comp.code` ou `company.code` (Firestore) ou `inferCompanyCode(comp.nom)` (initiales, 3 lettres).  
  - `agencyCode` : `ag.code` ou `ag.codeAgence` (Firestore) ou inféré depuis le nom d’agence dans `tickets.ts` (`inferAgencyCode`) → ex. "AP" pour "Agence Principale", sinon initiales 2 lettres.  
  - Compteur : `companies/{companyId}/counters/byTrip/trips/{tripInstanceId}` (transaction).

- **Guichet :**  
  - `AgenceGuichetPage` utilise une fonction locale `generateRef` (même chemin de compteur).  
  - Format : `{companyCode}-{agencyCode}-{sellerCode}-{seq3}` (seq sur 3 chiffres).  
  - `companyCode` / `agencyCode` : `companyMeta.code`, `agencyMeta.code` (chargés ailleurs).  
  - `sellerCode` : `staffCode` / `codeCourt` / `code` de l’utilisateur ou `"GUEST"`.

### Modèle de données

- **Company (Firestore)** : Le type TypeScript `Company` dans `companyTypes.ts` **ne déclare pas** `code` ni `shortCode`. En lecture, le code utilise `comp.code || company.code` → champ **non typé**, possible en base.
- **Agence** : Le type `Agence` **ne déclare pas** `code` ni `codeAgence`. Utilisation en base via `ag.code`, `ag.codeAgence`.
- **Cashier / User** : `staffCode`, `codeCourt`, `code` (ex. dans `AgenceGuichetPage`, `useActiveShift`). Pas de champ `cashier.code` au niveau document compagnie/agence ; c’est l’utilisateur connecté qui porte le code.

### Stockage

- **referenceCode** : Stocké en **brut** dans le document réservation (champ `referenceCode`) à la création ; il n’est pas recalculé dynamiquement à l’affichage.
- Pas de préfixe "DT-AS-GUEST" en dur dans le code ; le préfixe est entièrement composé de `companyCode-agencyCode-sellerCode` (ou "WEB").

### Incohérences

- **Deux implémentations** : `tickets.ts` (web, 4 chiffres) vs `generateRef` guichet (3 chiffres) → formats et longueurs de séquence différentes.
- **`referenceCode.ts`** : Expose `generateRefCodeForTripInstance` (format 6 chiffres) utilisé ailleurs (ex. courrier) → **trois** formats possibles (3, 4 et 6 chiffres).
- **Champs absents du type Company/Agence** : `code` / `shortCode` et `codeAgence` / `code` non déclarés dans les types alors qu’utilisés en lecture/écriture.

**Livrable — Proposition PRO standardisée :**

1. **Modèle Firestore** :  
   - `companies` : ajouter `shortCode` (ou `code`) — string, ex. "MT", "KMT".  
   - `agences` : ajouter `code` ou `shortCode` — string, ex. "AP", "ABJ".  
   - Documenter dans les types TypeScript (Company, Agence).

2. **Un seul service de génération** :  
   - Un module unique (ex. `referenceCode.ts` ou `tickets.ts`) avec un format commun :  
     `{companyCode}-{agencyCode}-{channelCode}-{seq}` avec **seq à 4 ou 6 chiffres** partout (web + guichet + courrier).

3. **Channel** :  
   - `WEB` pour en ligne ; code guichetier (staffCode) pour guichet ; pas de "GUEST" en production (ou réservé aux cas explicites).

4. **Stockage** :  
   - Conserver le **referenceCode brut** en base à la création ; pas de recalcul à l’affichage.

5. **Fallback** :  
   - Si `shortCode` absent : garder l’inférence par initiales (company 3 lettres, agence 2 lettres) avec logs pour inciter à renseigner les champs.

---

## 5. Cohérence visuelle des cartes

### Wallet (ClientMesBilletsPage)

- Cartes billets : `rounded-2xl border bg-white p-3 shadow-sm`, `borderColor: theme.primary18`.  
- Bon contraste avec le fond (fond de page coloré par thème) ; bordure et ombre légère présentes.
- Risque : sur fond très clair (primary très pastel), la bordure `primary18` peut être peu visible.

### Destinations populaires (VilleSuggestionBar)

- Cartes : `bg-white rounded-xl p-4 border`, `borderColor: primary30`, `boxShadow: 0 4px 15px primary12`.  
- Bordure et ombre basées sur la primary ; lisibles. Pas de fond de section coloré → cohérent avec le reste.

### Résultats recherche (ResultatsAgencePage)

- `themeConfig.classes.card` = `bg-white rounded-xl shadow-sm border border-gray-200`.  
- Cartes trajets avec bordure grise et ombre ; contraste correct.

### Points communs / écarts

- **Wallet** : primary en bordure/ombre (très lié au thème).  
- **Destinations** : idem.  
- **Résultats** : gris neutre (`border-gray-200`) → **incohérence** avec les deux autres (pas de primary/secondary sur la carte).

### Problèmes potentiels

- Cartes sur fond blanc (ex. section "Destinations" sur fond blanc) : bordure `primary30` peut être très légère selon la primary.
- AidePage / ConditionsPage : cartes `bg-white border border-gray-200` → pas de couleur de marque ; volontaire pour pages "contenu".

**Livrable — Proposition UI cohérente :**

1. **Standardiser les cartes "produit" (billets, trajets, destinations)** :  
   - Toujours : `bg-white rounded-xl shadow-md border` (ou shadow-sm) avec `borderColor` dérivé de la primary (ex. `primary20` ou `primary30`).  
   - Ombre : `shadow-sm` ou `shadow-md` pour éviter "cartes plates" sur fond blanc.

2. **Résultats recherche** :  
   - Remplacer `border-gray-200` par une bordure basée sur la primary (ex. `primary15` / `primary20`) pour alignement avec Wallet et Destinations.

3. **Contraste** :  
   - Définir une règle (ex. bordure ≥ 10 % d’opacité de la primary) pour que la carte reste visible sur fond blanc.

4. **Pages légales / Aide** :  
   - Conserver un style plus neutre (gris) acceptable ; optionnel d’y ajouter une touche primary (ex. bordure gauche ou icône).

---

## 6. Structure des données compagnie (Firestore)

### Champs actuels (type Company + usage)

- **Identité :** id, nom, slug.  
- **Vitrine :** sousTitre, description, logoUrl, banniereUrl, accroche, instructionRecherche, imagesSlider.  
- **Thème :** couleurPrimaire, couleurSecondaire, couleurAccent, couleurTertiaire, themeStyle.  
- **Devise :** devise, deviseSymbol.  
- **Contact :** email, pays, telephone, adresse, horaires.  
- **Fonctionnalités :** publicPageEnabled, onlineBookingEnabled, guichetEnabled.  
- **Contenu :** services, whyChooseUs, socialMedia, footerConfig, villesDisponibles, suggestions, featuredTrips, paymentConfig.  
- **Autres :** responsable, plan, commission, preuveUrl, createdAt, updatedAt.  
- **Utilisé en lecture mais non typé :** `code` (pour referenceCode).

### Champs manquants pour un branding "premium"

| Champ suggéré | Usage |
|---------------|--------|
| **shortCode** (ou **code**) | Référence billet, exports, affichage court (déjà utilisé, non typé). |
| **faviconUrl** | Onglet / PWA. |
| **ogImageUrl** | Partage social (Open Graph). |
| **legalName** | Facturation / mentions légales. |
| **siret / registrationNumber** | Légal / footer. |
| **brandFont** (ou **fontFamily**) | Typo cohérente (optionnel). |
| **heroImageUrl** | Image hero par compagnie (au lieu de `/images/hero-bus.jpg` global). |

### Champs manquants pour l’identifiant billet

- **shortCode** (ou **code**) : déjà utilisé ; à officialiser dans le schéma et les types.  
- Côté **agences** : **code** ou **shortCode** (ex. "AP", "ABJ") à documenter et typer.

### Agence (résumé)

- Types actuels : longitude, latitude, id, nomAgence, ville, pays, quartier, adresse, telephone, companyId, statut.  
- **Manquant pour le billet :** `code` ou `shortCode` (ou `codeAgence`) — déjà lu dans le code, à ajouter au type et documenter en base.

---

## 7. Rapport final

### Liste des incohérences

1. **Hero** : Titre et bouton en orange Tailwind ; pas de thème compagnie ; padding mobile serré ; pas de paliers sm/lg pour la taille du titre.  
2. **Destinations populaires** : Chargement en waterfall (company → N+1 weeklyTrips), pas de skeleton, pas de cache.  
3. **Branding** : Orange hardcodé dans HeroSection (plateforme), UploadPreuvePage (#f59e0b), fallbacks orange dispersés (Header, NotFound, ClientMesReservations).  
4. **Secondaire** : Non utilisée dans HeroSection, AidePage ; UploadPreuvePage utilise #f59e0b au lieu de la secondary.  
5. **Référence billet** : Trois logiques (tickets.ts 4 chiffres, guichet 3 chiffres, referenceCode.ts 6 chiffres) ; champs `code`/shortCode absents des types Company/Agence.  
6. **Cartes** : ResultatsAgencePage en border gris alors que Wallet et Destinations utilisent la primary.  
7. **Company/Agence** : Champs `code` / shortCode utilisés en base mais non déclarés dans les types TypeScript.

### Liste des optimisations

1. **Hero** : Remplacer orange par primary/secondary ; ajouter breakpoints (sm/lg) et padding progressif (px-4 sm:px-6).  
2. **Destinations** : Skeleton pendant le chargement ; cache sessionStorage par company.id ; à terme agrégat ou préchargement pour éviter N+1.  
3. **Branding** : Centraliser les fallbacks (une constante ou un thème par défaut) ; supprimer les oranges en dur.  
4. **Référence billet** : Un seul format (ex. 4 ou 6 chiffres) et un seul service ; typage Company/Agence avec shortCode/code.  
5. **Cartes** : Règle commune (bordure primary, shadow) pour Wallet, Destinations, Résultats.

### Liste des correctifs nécessaires

1. HeroSection (plateforme) : thème + responsive (classes listées au §1).  
2. UploadPreuvePage : remplacer #f59e0b par secondary (ou primary).  
3. VilleSuggestionBar / PublicCompanyPage : skeleton + cache.  
4. Types Company/Agence : ajouter `code` ou `shortCode`.  
5. Unifier génération referenceCode (web + guichet + optionnel courrier).  
6. ResultatsAgencePage : bordure des cartes basée sur primary.  
7. AidePage / ClientMesReservationsPage : remplacer fallbacks orange par thème par défaut cohérent.

### Priorisation

| Priorité | Élément | Raison |
|----------|--------|--------|
| **Critique** | Référence billet (un format + champs typés) | Cohérence données, support, évolutions. |
| **Critique** | Hero : thème (suppression orange) | Branding et cohérence visuelle première page. |
| **Important** | Destinations : skeleton + cache | UX et performance perçue. |
| **Important** | Types Company/Agence (code/shortCode) | Éviter régressions et documenter le modèle. |
| **Important** | UploadPreuvePage #f59e0b → secondary | Branding. |
| **Esthétique** | Hero responsive (px, text sizes) | Confort mobile/tablette. |
| **Esthétique** | Cartes résultats (bordure primary) | Cohérence visuelle. |
| **Esthétique** | Fallbacks orange (Aide, Mes Réservations) | Cohérence secondaire. |

### Estimation complexité

| Tâche | Complexité |
|-------|------------|
| Hero thème + responsive | Faible |
| Skeleton Destinations | Faible |
| Cache sessionStorage Destinations | Faible |
| Remplacer #f59e0b UploadPreuvePage | Faible |
| Types Company/Agence + champs code | Faible |
| Unifier génération referenceCode | Moyen (tests guichet + web + éventuel courrier) |
| Réduction N+1 Destinations (agrégat / préchargement) | Moyen à élevé |

---

**Aucune modification de code n’a été appliquée ; rapport d’audit uniquement.**
