# TELIYA - Audit preventif Firestore Rules avant premier deploiement staging

Phase: 1.3.7

Date: 2026-07-18

Perimetre audite:

- `firestore.rules`
- `firebase.json`
- `docs/ACCOUNTING_SAFETY_PROTOCOL.md`
- `docs/KNOWN_BUGS_AND_FIXES.md`
- `tests/firestore/*.rules.test.cjs`

Aucune commande Firebase n'a ete executee pendant cet audit.
Aucune regle, aucun test, aucune donnee et aucune Cloud Function n'ont ete modifies.

## Resume executif

Niveau de qualite actuel: 8 / 10

Les Firestore Rules couvrent de nombreux workflows critiques et les flux comptables les plus sensibles disposent maintenant de tests Emulator cibles. Les corrections recentes sur `accounts`, `financialTransactions` et `financialTransactionIdempotency` reduisent nettement le risque historique de depassement des 1000 expressions pour les scenarios testes.

Correction Phase 1.3.7.1: le risque critique hors comptabilite sur la collection globale `users/{userId}` a ete corrige. Les utilisateurs ne peuvent plus creer ou modifier leur propre document pour changer les champs de role, rattachement, permissions ou statut. Les mises a jour personnelles restantes sont limitees aux tokens de notification push.

Correction Phase 1.3.7.2: le premier risque eleve, `publicReservations` ouvert en creation et update publics, a ete corrige. Les lectures publiques par token restent autorisees, mais les creations et updates sont maintenant limitees aux formes et transitions utilisees par le parcours public reel.

Correction Phase 1.3.7.3: le risque eleve `invitations` avec lecture de liste publique a ete corrige. La lecture anonyme est limitee a un `get` direct d'une invitation pendante dont le token correspond a l'id du document, et les creations, listes, mises a jour et suppressions sont restreintes aux roles et perimetres legitimes.

Controle Phase 1.3.7.3.1: les anciennes invitations creees par le helper frontend avant cette correction utilisaient un id Firestore automatique et un champ `token` distinct. Les anciens liens publics construits avec ce champ `token` ne sont pas compatibles avec les nouvelles Rules sans migration ou recreation explicite. Cette incompatibilite est preferee a la reouverture d'un `list` public. Les invitations creees par la Cloud Function historique avec un lien base sur l'id du document restent compatibles si le document est encore `pending`.

Correction Phase 1.3.7.4: le dernier risque eleve, ecritures authentifiees trop larges sur `medias`, `plans` et `_meta`, a ete corrige. Les lectures existantes sont conservees, mais les creations, modifications et suppressions sont maintenant reservees a `admin_platforme`.

Conclusion courte: les flux comptables testes sont en meilleur etat, le bloc critique `users/{userId}` est verrouille, le miroir public `publicReservations` est encadre, le listing public des invitations est ferme et les ecritures globales `medias`, `plans`, `_meta` sont limitees a l'administration plateforme. Les Rules peuvent etre deployees vers staging pour validation, avec une dette moyenne restante sur les matches globaux, helpers historiques et surfaces publiques peu documentees.

## Forces

- Deny-by-default present en fin de fichier: `match /{path=**}` refuse toutes les operations non couvertes explicitement.
- Les collections financieres critiques interdisent globalement les suppressions directes sur `accounts`, `ledger`, `financialTransactions` et les documents d'idempotence.
- Les flux sensibles recents sont proteges par des identifiants deterministes: `agency_transfer_*`, `expense_*`, `payment_received_*`.
- Les tests Rules couvrent les commits atomiques les plus dangereux: validation comptable de session, versement bancaire agence, depense directe agence et paiement online Mobile Money.
- Les tests contiennent des cas `ALLOWED` et `DENIED`, avec isolation agence/compagnie et protection contre le double traitement.
- `firebase.json` reference explicitement `firestore.rules` et `firestore.indexes.json`.
- Les corrections recentes ont ajoute des gardes rapides avant plusieurs helpers couteux, ce qui reduit le risque historique des 1000 expressions.
- Les workflows comptables principaux conservent une logique d'idempotence et de contrepartie comptable.

## Faiblesses

- Le bloc `users/{userId}` a ete corrige, mais les helpers `getUserRole()` et `hasUserRole()` consultent toujours `users/{uid}` avant ou en complement des claims. Cette architecture reste sensible et doit rester accompagnee de tests.
- 8 fonctions semblent definies sans appel effectif direct:
  - `agencyAccountantCanCreateCompanyBankMirror`
  - `agencyAccountantCashLedgerPath`
  - `boardingOfficerCanUpdateReservation`
  - `canAgencyAccountantReadOwnRemittanceLedgerAccount`
  - `canReadFleet`
  - `canReadOwnAgencyCashAccount`
  - `guichetValidatedPaymentCreate`
  - `isSameAgencyReservation`
- Le fichier contient 116 fonctions et 106 blocs `match`, ce qui indique une dette structurelle importante.
- Les conditions de role sont fortement repetees: `getUserRole()` apparait plus de 300 fois et `hasUserRole()` plus de 100 fois.
- Plusieurs aliases de roles coexistent (`chefAgence`, `chefagence`, `chef_agence`, `comptable`, `Comptable`, `agency_accountant`), ce qui augmente le risque de divergence.
- `request.resource.data.diff(resource.data)` est repete de nombreuses fois dans les memes zones, ce qui alourdit la lecture et peut augmenter le cout d'evaluation.
- Les collection groups publics (`weeklyTrips`, `agences`, certaines reservations et `dailyStats`) sont utiles, mais leur portee globale doit etre surveillee.
- Des regles publiques ou tres ouvertes subsistent sur `platformLeads` et certaines surfaces publiques legitimes mais peu documentees.
- Les tests Rules actuels couvrent surtout la comptabilite recente et les risques eleves corriges; ils ne couvrent pas encore certaines surfaces publiques et matches globaux.

## Dette technique

Niveau: Elevee

Justification:

- Le fichier `firestore.rules` est devenu un point de concentration majeur avec beaucoup de logique metier, de compatibilite historique et de cas speciaux.
- La dette n'est pas uniquement une dette de style: certaines branches generales peuvent avoir un impact direct sur la securite multi-tenant.
- Les tests existants securisent bien quelques workflows critiques, mais la couverture n'est pas proportionnelle a la taille et a la surface reelle des Rules.
- Les nombreuses corrections historiques ont laisse des helpers potentiellement obsoletes et des branches possiblement inatteignables.

## Risques avant staging

### Critique

Aucun risque critique connu apres correction Phase 1.3.7.1 du bloc `users/{userId}`.

### Eleve

Aucun risque eleve connu apres correction Phase 1.3.7.4 des ecritures globales `medias`, `plans` et `_meta`.

### Eleve corrige

1. `users` list ouvert a tout utilisateur authentifie

   Zone: ancien `allow list: if isAuth()` dans `users/{userId}`.

   Correction Phase 1.3.7.1:

   - `list` global de `users` limite aux administrateurs autorises ;
   - lecture d'un autre profil utilisateur limitee aux administrateurs autorises ;
   - create/update de `users/{userId}` reserves aux administrateurs autorises, hors mise a jour personnelle limitee aux tokens push ;
   - test cible ajoute: `tests/firestore/usersPrivilegeEscalation.rules.test.cjs`.

2. `publicReservations` ouvert en creation et update publics

   Zone: `publicReservations/{docId}`.

   Correction Phase 1.3.7.2:

   - `get` public conserve pour le suivi par token ;
   - `list` et `delete` restent refuses ;
   - creation publique limitee au miroir initial ou au pointeur court, avec verification de la reservation source ;
   - update public limite a la preuve de paiement ;
   - confirmation reservee a l'operateur digital de la meme compagnie ou a l'admin plateforme ;
   - test cible ajoute: `tests/firestore/publicReservations.rules.test.cjs`.

3. `invitations` list public

   Zone: `invitations/{invitationId}`.

   Correction Phase 1.3.7.3:

   - `list` public supprime ;
   - `get` anonyme limite a une invitation pendante dont `token` correspond a l'id du document ;
   - `get` authentifie limite a l'email invite ou aux roles de gestion du perimetre ;
   - `create` limite aux roles autorises et au perimetre compagnie/agence ;
   - creation d'une nouvelle invitation refusee si le champ `token` ne correspond pas a l'id du document ;
   - acceptation limitee au compte authentifie correspondant a l'email de l'invitation ;
   - modification de `role`, `companyId`, `agencyId`, `email` et `token` refusee pour les utilisateurs ordinaires ;
   - suppressions limitees aux gestionnaires du perimetre ;
   - test cible ajoute: `tests/firestore/invitations.rules.test.cjs`.

4. Ecritures authentifiees trop larges sur donnees non financieres

   Zones: `medias`, `plans`, `_meta`.

   Correction Phase 1.3.7.4:

   - `medias` conserve les lectures authentifiees utilisees par la bibliotheque plateforme ;
   - `medias` reserve `create/update/delete` a `admin_platforme` ;
   - `plans` conserve les lectures publiques existantes du catalogue ;
   - `plans` reserve `create/update/delete` a `admin_platforme` ;
   - `_meta` conserve les lectures publiques existantes de metadata ;
   - `_meta` reserve `create/update/delete` a `admin_platforme` ;
   - test cible ajoute: `tests/firestore/platformContent.rules.test.cjs`.

### Moyen

1. Risque residuel des 1000 expressions dans les branches non testees

   Les flux `accounts`, `financialTransactions` et `financialTransactionIdempotency` sont mieux gardes, mais ils restent volumineux. Des chemins non couverts par les cinq tests Rules peuvent encore rencontrer des evaluations couteuses.

2. Match globaux trop larges

   Les collection groups `/{path=**}/weeklyTrips`, `/{path=**}/agences`, `/{path=**}/reservations` et `/{path=**}/dailyStats` peuvent evaluer des cas sur plusieurs sous-arbres. Les plus sensibles doivent rester limites par champ et par role.

3. `logistics/{path=**}` autorise une ecriture large pour les utilisateurs meme compagnie

   Le match global logistics simplifie la maintenance, mais il peut couvrir des sous-documents futurs non anticipes.

4. `revenue/{path=**}` autorise read/write large au niveau compagnie

   Risque de creation future de sous-collections sensibles sous `revenue` sans regle dediee.

5. Branches possiblement inatteignables dans `accounts`

   Une branche Mobile Money online existe encore dans une section generique guardee par une negation sur `company_clearing` et `company_mobile_money`, ce qui suggere une branche morte ou obsolette.

6. Helpers inutilises ou obsoletes

   Les helpers non references peuvent masquer une intention de securite non appliquee ou une ancienne correction abandonnee.

### Faible

1. Duplications de valeurs de statut

   Exemples: repetitions de `confirme`, `paye`, `valide`, `embarque` dans certains helpers de reservations et embarquement.

2. Nommage de roles heterogene

   La coexistence de plusieurs variantes de roles est comprehensible historiquement, mais rend les audits plus difficiles.

3. Formatage irregulier de certains blocs

   Plusieurs helpers et listes de champs sont difficiles a relire, ce qui augmente le risque d'erreur lors de futures corrections.

4. Tests Rules relies au projet id historique `monbillet-95b77`

   Les tests tournent dans l'Emulator, mais le nom du projet de production dans les tests peut entretenir une confusion mentale avec staging/local.

5. Quelques regles publiques sont probablement legitimes mais peu documentees

   `villes`, `paymentMethods`, `routes`, `stops`, `weeklyTrips`, `agences` semblent destines a la vitrine publique, mais chaque surface publique devrait etre justifiee dans un registre.

## Recommandations

### Priorite 1

- Verifier en staging le parcours d'acceptation d'invitation, car les ecritures directes du frontend vers `users/{uid}` avec role/rattachement sont maintenant bloquees par securite et doivent passer par un processus serveur autorise si elles sont encore necessaires.

### Priorite 2

- Ajouter des tests Rules non comptables pour:
  - collection group reservations;
  - logistics et revenue.

### Priorite 3

- Nettoyer les helpers inutilises apres validation humaine.
- Centraliser les groupes de roles dans des helpers explicites.
- Remplacer les repetitions de `getUserRole()` par des variables locales quand le langage Rules le permet dans le helper concerne.
- Documenter les surfaces publiques legitimes.

## Corrections recommandees

- Ajouter des tests pour toutes les collections publiques ou quasi publiques.
- Identifier et supprimer les helpers inutilises uniquement apres tests.
- Revoir les matches globaux `logistics/{path=**}` et `revenue/{path=**}` avant d'ajouter de nouvelles sous-collections.
- Ajouter un registre des collections publiques autorisees.

## Conclusion

Les Firestore Rules peuvent-elles etre deployees aujourd'hui vers staging ?

OUI.

Justification:

- Les tests comptables critiques passent selon le contexte de phase et couvrent bien les corrections recentes.
- Le risque historique des 1000 expressions semble corrige pour les scenarios testes.
- Le risque critique d'elevation de privileges via `users/{userId}` a ete corrige et couvert par un test Rules cible.
- Le risque eleve de listing global `users` par tout utilisateur authentifie a ete corrige pendant la meme correction ciblee du bloc `users/{userId}` en Phase 1.3.7.1.
- Le premier risque eleve sur `publicReservations` a ete corrige et couvert par un test Rules cible.
- Le risque eleve `invitations list public` a ete corrige et couvert par un test Rules cible.
- Le dernier risque eleve sur les ecritures `medias`, `plans` et `_meta` a ete corrige et couvert par un test Rules cible.

Decision finale:

FIRESTORE RULES PRETES POUR STAGING

## Synthese chiffree

- Risques critiques: 0
- Risques eleves: 0
- Risques moyens: 6
- Risques faibles: 5
- Note globale: 8 / 10
- Decision finale: FIRESTORE RULES PRETES POUR STAGING

Note de coherence des compteurs:

- Risques eleves initiaux: 4.
- Risque eleve corrige en Phase 1.3.7.1: `users` list ouvert a tout utilisateur authentifie.
- Risque eleve corrige en Phase 1.3.7.2: `publicReservations` ouvert en creation et update publics.
- Risque eleve corrige en Phase 1.3.7.3: `invitations` list public.
- Risque eleve corrige en Phase 1.3.7.4: ecritures authentifiees trop larges sur `medias`, `plans` et `_meta`.
- Risques eleves restants: 0.
