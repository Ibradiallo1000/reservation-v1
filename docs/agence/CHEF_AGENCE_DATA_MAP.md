# Cartographie des donnees Chef d'Agence

Ce document cartographie les collections Firestore utilisees ou a utiliser dans l'espace Chef d'Agence.

Aucune correction n'est proposee ici. Il s'agit d'un audit de sources de verite, doublons et risques.

# Principes de source de verite

* `reservations` : source de verite des billets et passagers.
* `departures` : source de verite du statut global d'un depart d'agence.
* `shifts` : source de verite du cycle de vie d'un poste guichet.
* `shiftReports` : snapshot de rapport d'un poste guichet.
* `courierSessions` : source de verite du cycle de vie d'une session courrier agence.
* `shipments` : source de verite des colis.
* `financialTransactions` : source de verite comptable et tresorerie.
* `dailyStats` : agregat journalier.
* `agencyLiveState` : agregat temps reel agence.

Les agregats ne doivent jamais remplacer les documents metier ou financiers.

Regle :

Aucun indicateur du Chef d'Agence ne doit etre calcule a partir d'une source differente de celle utilisee par le role operationnel proprietaire.

Exemples :

* Billetterie -> `shifts` + `reservations`
* Embarquement -> `departures` + `reservations`
* Courrier -> `courierSessions` + `shipments`
* Finance -> `financialTransactions`

# Activite

## Collections Firestore utilisees

* `companies/{companyId}/agences/{agencyId}/shifts`
* `companies/{companyId}/agences/{agencyId}/courierSessions`
* `companies/{companyId}/agences/{agencyId}/reservations`
* `companies/{companyId}/logistics/data/shipments`
* `companies/{companyId}/tripInstances`
* `companies/{companyId}/expenses`
* `companies/{companyId}/agences/{agencyId}/dailyStats/{date}`
* `companies/{companyId}/agences/{agencyId}/agencyLiveState/current`

## Documents utilises

* postes actifs
* sessions courrier actives
* reservations du jour
* colis du jour
* tripInstances origine et destination
* depenses pending_manager
* dailyStats du jour
* agencyLiveState/current

## Sources de verite

* activite live : `agencyLiveState/current`
* ventes detaillees : `reservations`
* postes : `shifts`
* courrier : `courierSessions` et `shipments`
* depenses : `expenses`
* departs : `tripInstances` et `departures` selon niveau d'information

## Doublons

* ventes recalculees depuis `reservations` alors que `dailyStats` existe.
* postes actifs lus directement alors que `agencyLiveState` contient des compteurs.
* depart du jour derive depuis `tripInstances` alors que l'embarquement utilise aussi `departures`.

## Calculs redondants

* total ventes guichet
* total ventes en ligne
* nombre de postes actifs
* nombre de departs en retard
* nombre de colis du jour

## Donnees obsoletes ou a surveiller

* anciens dashboards qui recalculent les statistiques hors cockpit.
* listeners limites par `limit(...)` pouvant sous-compter une grosse agence.

# Postes

## Collections Firestore utilisees

### Billetterie

* `companies/{companyId}/agences/{agencyId}/shifts`
* `companies/{companyId}/agences/{agencyId}/shiftReports`
* `companies/{companyId}/agences/{agencyId}/reservations`
* `companies/{companyId}/financialTransactions`
* `companies/{companyId}/agences/{agencyId}/agentHistory`

### Courrier

* `companies/{companyId}/agences/{agencyId}/courierSessions`
* `companies/{companyId}/logistics/data/shipments`
* `companies/{companyId}/financialTransactions`
* `companies/{companyId}/agences/{agencyId}/agentHistory`

## Documents utilises

* shift courant
* shiftReport associe
* reservations vendues sur le poste
* transactions financieres liees au poste
* session courrier
* colis rattaches a la session
* evenements agent

## Sources de verite

* cycle poste guichet : `shifts`
* rapport poste : `shiftReports`
* ventes du poste : `reservations`
* argent : `financialTransactions`
* cycle session courrier : `courierSessions`
* colis : `shipments`

## Doublons

* montant poste present dans `shifts`, `shiftReports`, `reservations` et `financialTransactions`.
* statut validation present dans `shifts` et `shiftReports`.
* courrier : montant session et total ledger peuvent diverger si l'affichage ne choisit pas une source unique.

## Calculs redondants

* montant attendu du poste recalcule depuis reservations.
* montant financier recalcile depuis ledger.
* total colis par session.

## Donnees obsoletes ou a surveiller

* champs legacy de statut poste.
* anciens noms de collections de rapports si encore references.
* champs courier `expectedAmount` declares comme anciens.

# Departs

## Collections Firestore utilisees

* `companies/{companyId}/agences/{agencyId}/departures`
* `companies/{companyId}/agences/{agencyId}/reservations`
* `companies/{companyId}/agences/{agencyId}/boardingLogs`
* `companies/{companyId}/agences/{agencyId}/boardingStats`
* `companies/{companyId}/agences/{agencyId}/tripAssignments`
* `companies/{companyId}/agences/{agencyId}/weeklyTrips`
* `companies/{companyId}/tripInstances`
* `companies/{companyId}/tripExecutions`
* `companies/{companyId}/fleetVehicles`

## Documents utilises

* departure par `tripInstanceId`
* reservations du depart
* logs embarquement
* stats embarquement
* weeklyTrip
* tripAssignment
* tripInstance
* tripExecution
* vehicule

## Sources de verite

* statut global depart agence : `departures`
* statut passager : `reservations`
* planning recurrent : `weeklyTrips`
* instance reseau : `tripInstances`
* progression trajet : `tripExecutions`
* affectation vehicule : `tripAssignments`

## Doublons

* `departures.tripStatus` et statuts metier dans `tripInstances`.
* `boardingStats` et compteurs stockes dans `departures`.
* `boardingClosures` si encore utilise dans certains anciens ecrans.
* `tripAssignments` et donnees vehicule copiees dans `departures`.

## Calculs redondants

* nombre embarques depuis `reservations`.
* nombre absents depuis `reservations`.
* nombre pending depuis `reservations`.
* compteurs stockes dans `departures` ou `boardingStats`.

## Donnees obsoletes ou a surveiller

* `boardingClosures`.
* anciennes valeurs de `statutEmbarquement`.
* reservations sans `tripInstanceId`.
* departs construits depuis reservations uniquement au lieu de `weeklyTrips`.

# Finance

## Collections Firestore utilisees

* `companies/{companyId}/financialTransactions`
* `companies/{companyId}/accounts`
* `companies/{companyId}/expenses`
* `companies/{companyId}/agences/{agencyId}/shifts`
* `companies/{companyId}/agences/{agencyId}/shiftReports`
* `companies/{companyId}/agences/{agencyId}/courierSessions`
* `companies/{companyId}/agences/{agencyId}/cashAudits`
* `companies/{companyId}/agences/{agencyId}/comptaEncaissements`
* `companies/{companyId}/agences/{agencyId}/dailyStats`

## Documents utilises

* transaction financiere
* compte financier
* depense
* rapport poste
* session courrier
* audit caisse
* encaissement compta
* dailyStats

## Sources de verite

* argent : `financialTransactions`
* solde compte : `accounts`
* depenses : `expenses`
* validation poste : `shifts`
* rapport poste : `shiftReports`
* validation courrier : `courierSessions`

## Doublons

* revenus dans reservations, shifts, shiftReports, dailyStats et financialTransactions.
* validation de session dans shift et report.
* depenses visibles dans cockpit et finance.

## Calculs redondants

* caisse attendue.
* encaissements jour.
* ecarts.
* total depenses.

## Donnees obsoletes ou a surveiller

* affichages qui utilisent des montants derives au lieu du ledger.
* actions tresorerie exposees au Chef d'Agence.
* confusion entre validation comptable et approbation chef.

# Rapports

## Collections Firestore utilisees

* `reservations`
* `departures`
* `shifts`
* `shiftReports`
* `courierSessions`
* `shipments`
* `financialTransactions`
* `dailyStats`
* `agencyLiveState`
* `expenses`
* `agentHistory`

## Documents utilises

* reservations par periode
* departures par periode
* rapports poste
* sessions courrier
* colis
* transactions
* agregats journaliers
* historiques agent

## Sources de verite

* rapports synthetiques : `dailyStats`
* details : collections metier
* finance : `financialTransactions`
* activite agent : `agentHistory`, en complement seulement

## Doublons

* rapports actuels limites aux validations chef.
* exports guichet separes des exports courrier.
* chiffres caisse et ventes presents dans plusieurs ecrans.

## Calculs redondants

* ventes par periode.
* passagers par periode.
* colis par periode.
* depenses par periode.
* ecarts par periode.

## Donnees obsoletes ou a surveiller

* rapports qui ne lisent pas tous les statuts intermediaires.
* exports qui ignorent les ventes en ligne ou courrier.

# Equipe

## Collections Firestore utilisees

* `users`
* `companies/{companyId}/agences/{agencyId}/users`
* `companies/{companyId}/agences/{agencyId}/personnel`
* `companies/{companyId}/personnel`
* `companies/{companyId}/agences/{agencyId}/agentHistory`
* `companies/{companyId}/agences/{agencyId}/shifts`
* `companies/{companyId}/agences/{agencyId}/courierSessions`

## Documents utilises

* profil utilisateur racine
* profil utilisateur agence
* personnel agence
* historique agent
* sessions recentes

## Sources de verite

* identite globale : `users`
* rattachement agence : document agence user/personnel selon modele retenu
* activite : `shifts`, `courierSessions`, `agentHistory`

## Doublons

* role stocke dans `users` et dans sous-collection agence.
* agencyId/companyId possiblement presents dans plusieurs documents.
* personnel et users agence peuvent se recouvrir.

## Calculs redondants

* statut actif de l'agent depuis user actif, poste actif ou session active.
* derniere activite depuis agentHistory ou sessions.

## Donnees obsoletes ou a surveiller

* roles legacy.
* aliases de roles.
* agents sans code.
* agents rattaches a plusieurs agences.

# Trajets

## Collections Firestore utilisees

* `companies/{companyId}/agences/{agencyId}/weeklyTrips`
* `companies/{companyId}/tripInstances`
* `companies/{companyId}/agences/{agencyId}/tripAssignments`
* `companies/{companyId}/agences/{agencyId}/reservations`
* `companies/{companyId}/agences/{agencyId}/departures`
* `companies/{companyId}/fleetVehicles`

## Documents utilises

* weeklyTrip
* tripInstance
* tripAssignment
* reservations du trajet
* departure
* vehicule

## Sources de verite

* planning recurrent : `weeklyTrips`
* instance datee : `tripInstances`
* affectation locale : `tripAssignments`
* depart operationnel : `departures`
* reservation capacite : `reservations`

## Doublons

* trajet copie dans reservations, weeklyTrips, tripInstances et departures.
* heure/date presentes dans plusieurs documents.
* vehicule copie dans assignment et departure.

## Calculs redondants

* capacite restante.
* taux de remplissage.
* departs visibles par date.

## Donnees obsoletes ou a surveiller

* departs deduits uniquement des reservations.
* departs sans weeklyTrip actif.
* tripInstanceId incoherent.
* reservations anciennes sans champs normalises.
