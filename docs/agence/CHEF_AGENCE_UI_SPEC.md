# Specification UX Chef d'Agence

Ce document decrit l'experience cible du Chef d'Agence sans maquette graphique et sans implementation.

Le Chef d'Agence est un superviseur operationnel. Les ecrans doivent donc privilegier :

1. les alertes ;
2. les validations ;
3. les activites en cours ;
4. les donnees de consultation ;
5. les rapports.

Les actions d'execution doivent rester dans les modules des roles concernes.

Regle anti-duplication :

* Activite = synthese et supervision.
* Postes = detail operationnel des services.
* Finance = detail financier.
* Departs = detail operationnel des departs.

Activite ne doit afficher que des compteurs, alertes et raccourcis. Les tableaux complets de shifts, sessions courrier, recettes, depenses, transferts, ecarts et manifestes appartiennent aux menus dedies.

## Activite

### Role UX

Page principale du Chef d'Agence.

Elle doit presenter la journee sous forme de priorites metier, pas sous forme de dashboard decoratif.

### Hierarchie

1. Actions urgentes
2. Alertes
3. Activite en cours
4. Performance du jour
5. Depart du jour
6. Activite recente

### Cartes principales

#### Actions requises

Contenu :

* departs a valider
* depenses en attente
* postes a approuver
* sessions courrier a approuver
* ecarts caisse a traiter

Comportement :

* chaque carte ouvre le detail du blocage ;
* les actions sensibles doivent etre confirmees dans le flux detail ;
* la page ne doit pas encourager une validation aveugle.

#### Activite billetterie

Contenu :

* ventes guichet du jour
* ventes en ligne du jour
* nombre de billets
* nombre de places
* postes guichet actifs

Usage :

* surveillance uniquement ;
* acces au detail des postes ;
* pas de vente directe.

#### Activite courrier

Contenu :

* colis crees aujourd'hui
* colis en transit
* arrivages attendus
* sessions courrier actives
* sessions courrier a approuver

Usage :

* supervision ;
* acces historique ;
* pas de creation colis depuis le cockpit.

#### Activite departs

Contenu :

* departs planifies
* OPEN
* CLOSED
* DEPARTED
* retards
* absents
* reports

Usage :

* ouvrir le detail du depart ;
* consulter manifeste ;
* suivre les alertes et decisions de supervision.

#### Activite finance

Contenu :

* synthese caisse du jour
* ecarts
* depenses en attente
* sessions a approuver

Usage :

* ouvrir Finance ;
* approuver/refuser depense ;
* renvoyer au comptable.

### Alertes

Types d'alertes attendues :

* poste actif depuis trop longtemps
* aucune vente malgre poste actif
* depart en retard
* depart a valider
* depense en attente trop longtemps
* ecart caisse
* session courrier avec difference
* planning sans depart attendu

La presence du personnel est reportee a une future phase RH. Aucun widget de presence ne doit etre cree dans la Phase 1.

Chaque alerte doit afficher :

* libelle clair
* niveau : information, attention, critique
* module concerne
* action recommandee
* lien vers le detail

### Widgets

Widgets autorises :

* compteur ventes
* compteur postes actifs
* compteur departs
* compteur courrier
* compteur depenses
* compteur alertes

Widgets a eviter :

* graphiques decoratifs
* indicateurs sans decision associee
* doublons de montants deja affiches ailleurs
* identifiants techniques
* presence du personnel sans source RH stabilisee

### Matrice widgets Phase 1

| Widget | Source Firestore | Proprietaire metier | Action au clic |
| ------ | ---------------- | ------------------- | -------------- |
| Depenses en attente | `companies/{companyId}/expenses` | Comptable | Finance |
| Departs en retard | `companies/{companyId}/agences/{agencyId}/departures` + `reservations` | Chef embarquement | Departs |
| Postes ouverts | `companies/{companyId}/agences/{agencyId}/shifts` | Guichet | Postes |
| Sessions courrier | `companies/{companyId}/agences/{agencyId}/courierSessions` | Agent courrier | Postes |
| Ecarts financiers | `financialTransactions` + rapports de poste/session | Comptable | Finance |
| Ventes guichet du jour | `reservations` + `shifts` | Guichet | Postes |
| Ventes en ligne du jour | `reservations` | Operateur digital / reservation en ligne | Rapports |
| Colis du jour | `shipments` + `courierSessions` | Agent courrier | Postes |
| Activite recente | sources proprietaires de chaque domaine | Role proprietaire | Detail du domaine |

## Postes

Le menu Postes contient deux onglets :

1. Billetterie
2. Courrier

## Postes - onglet Billetterie

### Objectif

Superviser les postes guichet.

### Donnees affichees

* agent
* code agent
* statut poste
* heure ouverture
* heure cloture
* duree
* billets vendus
* montant attendu
* montant recu si validation comptable faite
* ecart
* etat validation comptable
* etat approbation chef

### Etats attendus

* En attente
* Actif
* Pause
* Cloture
* Valide comptable
* Approuve chef
* Rejete / a corriger

### Actions

Autorisees :

* consulter detail
* consulter ventes du poste
* approuver apres validation comptable
* renvoyer au comptable
* signaler anomalie

Interdites :

* vendre
* ouvrir poste comme agent
* saisir montant recu
* modifier rapport comptable

## Postes - onglet Courrier

### Objectif

Superviser les sessions courrier.

### Donnees affichees

* agent courrier
* code agent
* statut session
* colis traites
* montant attendu selon ledger
* montant valide par comptable
* difference
* etat validation chef

### Etats attendus

* En attente
* Active
* Cloturee
* Validee comptable
* Approuvee chef
* Retour comptable

### Actions

Autorisees :

* consulter detail
* consulter colis rattaches
* approuver apres comptable
* renvoyer au comptable
* consulter ecart

Interdites :

* creer un colis
* remettre un colis
* cloturer comme agent courrier
* valider la remise comptable

## Departs

### Objectif

Superviser les departs et arrivees lies a l'agence.

### Sections

1. Departs du jour
2. Retards
3. Absents
4. Reports
5. Departs confirmes
6. Arrivees attendues

### Departs du jour

Donnees :

* trajet
* date
* heure
* statut tripStatus
* capacite
* passagers attendus
* embarques
* absents
* reports

Actions :

* ouvrir le detail du depart
* consulter manifeste
* imprimer
* consulter les decisions de supervision associees

### Retards

Donnees :

* depart prevu
* temps de retard
* statut actuel
* cause si disponible
* responsable operationnel

Actions :

* ouvrir detail
* signaler

### Absents

Donnees :

* passagers absents
* depart d'origine
* reference billet
* report effectue ou non

Actions :

* consulter
* ouvrir depart

Interdit :

* changer le statut passager depuis l'espace chef.

### Reports

Donnees :

* reservations reportees
* sourceReservationId
* depart source
* depart cible
* date report
* agent ayant cree le report

Actions :

* consulter
* verifier doublons

### Departs confirmes

Donnees :

* depart confirme
* heure confirmation
* valide par
* manifeste final
* embarques
* absents finaux

Actions :

* consulter
* imprimer
* exporter

## Finance

### Objectif

Superviser les decisions financieres de l'agence.

La Finance du Chef d'Agence n'est pas la Comptabilite. Elle expose les validations et ecarts, mais ne permet pas d'ecrire directement dans le ledger.

### Depenses

Donnees :

* depenses pending_manager
* montant
* categorie
* description
* demandeur
* date
* justificatifs

Actions :

* approuver
* refuser avec motif
* consulter

### Validations

Donnees :

* postes guichet valides comptable
* sessions courrier validees comptable
* montant attendu
* montant recu
* ecart
* comptable validateur

Actions :

* approuver
* renvoyer au comptable
* consulter historique

### Transferts

Donnees :

* transferts existants
* statut
* montant
* origine
* destination
* date

Actions :

* consulter seulement

Interdit :

* creer transfert
* confirmer mouvement financier
* modifier statut comptable

### Ecarts

Donnees :

* ecarts caisse
* ecarts courrier
* session concernee
* montant theorique
* montant declare
* difference
* statut de traitement

Actions :

* consulter
* renvoyer correction
* signaler incident

## Rapports

### Objectif

Analyser l'activite passee.

Les rapports sont en lecture, filtre et export uniquement.

### Periodes

* jour
* semaine
* mois
* annee
* personnalise

### Rapport jour

Contenu :

* ventes guichet
* ventes en ligne
* colis
* departs
* embarques
* absents
* depenses
* ecarts
* agents actifs

### Rapport semaine

Contenu :

* evolution ventes
* volume passagers
* activite courrier
* ponctualite departs
* depenses
* ecarts
* agents les plus actifs

### Rapport mois

Contenu :

* chiffre d'affaires billetterie
* chiffre d'affaires courrier
* depenses
* ecarts
* taux depart a l'heure
* taux remplissage
* absents et reports

### Rapport annee

Contenu :

* tendances
* comparaison mensuelle
* activite par trajet
* activite par agent
* depenses par categorie

### Rapport personnalise

Contenu :

* memes donnees que les autres rapports
* plage date libre
* filtres par module
* export

### Actions

Autorisees :

* filtrer
* consulter
* exporter
* imprimer

Interdites :

* modifier les donnees source
* corriger un montant
* changer un statut operationnel
