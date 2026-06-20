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

Toute logique depart Chef d'Agence doit utiliser les memes sources que le module Embarquement afin de garantir une seule source de verite :

* `departures`
* `reservations`

Le cockpit Chef d'Agence ne doit pas dependre de `tripInstances`, `boardingClosures` ou `weeklyTrips` pour les departs operationnels.

# Activite

## Collections Firestore utilisees

* `companies/{companyId}/agences/{agencyId}/shifts`
* `companies/{companyId}/agences/{agencyId}/courierSessions`
* `companies/{companyId}/agences/{agencyId}/reservations`
* `companies/{companyId}/logistics/data/shipments`
* `companies/{companyId}/agences/{agencyId}/departures`
* `companies/{companyId}/expenses`
* `companies/{companyId}/agences/{agencyId}/dailyStats/{date}`
* `companies/{companyId}/agences/{agencyId}/agencyLiveState/current`

## Documents utilises

* postes actifs
* sessions courrier actives
* reservations du jour
* colis du jour
* departures du jour
* depenses pending_manager
* dailyStats du jour
* agencyLiveState/current

## Sources de verite

* activite live : `agencyLiveState/current`
* ventes detaillees : `reservations`
* postes : `shifts`
* courrier : `courierSessions` et `shipments`
* depenses : `expenses`
* departs : `departures` + `reservations`

## Doublons

* ventes recalculees depuis `reservations` alors que `dailyStats` existe.
* postes actifs lus directement alors que `agencyLiveState` contient des compteurs.
* depart du jour derive depuis `tripInstances`, `boardingClosures` ou `weeklyTrips` alors que l'embarquement utilise `departures`.

## Calculs redondants

* total ventes guichet
* total ventes en ligne
* nombre de postes actifs
* nombre de departs en retard
* nombre de colis du jour

## Donnees obsoletes ou a surveiller

* anciens dashboards qui recalculent les statistiques hors cockpit.
* listeners limites par `limit(...)` pouvant sous-compter une grosse agence.
* indicateurs de presence personnel sans source RH stabilisee.

## Matrice widgets Phase 1

| Widget | Source Firestore | Proprietaire metier | Action au clic |
| ------ | ---------------- | ------------------- | -------------- |
| Depenses en attente | `companies/{companyId}/expenses` | Comptable | Finance |
| Departs en retard | `companies/{companyId}/agences/{agencyId}/departures` + `reservations` | Chef embarquement | Departs |
| Postes ouverts | `companies/{companyId}/agences/{agencyId}/shifts` | Guichet | Postes |
| Sessions courrier | `companies/{companyId}/agences/{agencyId}/courierSessions` | Agent courrier | Postes |
| Ecarts financiers | `companies/{companyId}/financialTransactions` + rapports de poste/session | Comptable | Finance |
| Ventes guichet du jour | `reservations` + `shifts` | Guichet | Postes |
| Ventes en ligne du jour | `reservations` | Operateur digital / reservation en ligne | Rapports |
| Colis du jour | `shipments` + `courierSessions` | Agent courrier | Postes |
| Activite recente | sources proprietaires de chaque domaine | Role proprietaire | Detail du domaine |

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
* `companies/{companyId}/agences/{agencyId}/weeklyTrips`
* `companies/{companyId}/tripInstances`
* `companies/{companyId}/tripExecutions`

## Documents utilises

* departure par `tripInstanceId`
* reservations du depart
* logs embarquement
* stats embarquement
* weeklyTrip
* tripInstance
* tripExecution

## Sources de verite

* statut global depart agence : `departures`
* statut passager : `reservations`
* planning recurrent : `weeklyTrips`
* instance reseau : `tripInstances`
* progression trajet : `tripExecutions`

Les affectations vehicule, chauffeurs et donnees flotte ne sont pas des sources de verite de l'espace Chef d'Agence. Elles appartiennent aux modules operationnels proprietaires et ne doivent pas etre reintroduites dans ce chantier.

## Doublons

* `departures.tripStatus` et statuts metier dans `tripInstances`.
* `boardingStats` et compteurs stockes dans `departures`.
* `boardingClosures` si encore utilise dans certains anciens ecrans.

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
* `companies/{companyId}/agences/{agencyId}/reservations`
* `companies/{companyId}/agences/{agencyId}/departures`

## Documents utilises

* weeklyTrip
* tripInstance
* reservations du trajet
* departure

## Sources de verite

* planning recurrent : `weeklyTrips`
* instance datee : `tripInstances`
* depart operationnel : `departures`
* reservation capacite : `reservations`

## Doublons

* trajet copie dans reservations, weeklyTrips, tripInstances et departures.
* heure/date presentes dans plusieurs documents.

## Calculs redondants

* capacite restante.
* taux de remplissage.
* departs visibles par date.

## Donnees obsoletes ou a surveiller

* departs deduits uniquement des reservations.
* departs sans weeklyTrip actif.
* tripInstanceId incoherent.
* reservations anciennes sans champs normalises.
