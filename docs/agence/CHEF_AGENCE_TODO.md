# Roadmap refonte Chef d'Agence

Chaque tache doit rester :

* independante
* testable
* reversible

Aucune tache ne doit melanger refonte UX, changement de droits, migration de donnees et correction metier dans la meme passe.

# P0 - Architecture critique

## P0.1 - Geler le perimetre Chef d'Agence

Objectif :
Definir officiellement que le Chef d'Agence est superviseur operationnel.

Livrable :
Document de responsabilites valide.

Test :
Chaque action chef est classee en :

* consulter
* approuver
* refuser
* renvoyer
* superviser

Reversible :
Oui, document de cadrage uniquement.

## P0.2 - Valider le menu final

Objectif :
Adopter les menus :

1. Activite
2. Postes
3. Departs
4. Finance
5. Rapports
6. Equipe
7. Trajets

Livrable :
Mapping ancien menu vers nouveau menu.

Test :
Aucune fonctionnalite essentielle ne reste sans destination.

Reversible :
Oui, tant que les routes ne sont pas modifiees.

## P0.3 - Classer les actions interdites

Objectif :
Lister les actions a retirer ou masquer du Chef d'Agence.

Actions candidates :

* vendre au guichet
* scanner embarquement
* creer colis
* valider comptablement la caisse
* creer ecriture tresorerie
* creer transfert
* modifier ledger
* valider paiement en ligne

Livrable :
Matrice role/action.

Test :
Chaque action sensible a un role proprietaire unique.

Reversible :
Oui, audit uniquement.

## P0.4 - Clarifier Chef vs Comptable

Objectif :
Separer validation comptable et approbation chef.

Livrable :
Lexique :

* validation comptable
* approbation chef
* renvoi comptable
* ecart
* remise

Test :
Les libelles ne suggerent pas que le chef saisit la caisse.

Reversible :
Oui.

## P0.5 - Clarifier Chef vs Chef Embarquement

Objectif :
Separer supervision depart et execution embarquement.

Livrable :
Matrice :

* scan
* cocher passager
* cloturer embarquement
* imprimer manifeste

Test :
Le chef ne remplace pas le chef embarquement.

Reversible :
Oui.

## P0.6 - Clarifier Chef vs Agent Courrier

Objectif :
Separer supervision courrier et operation courrier.

Livrable :
Matrice :

* creer colis
* recevoir colis
* remettre colis
* cloturer session
* approuver session courrier

Test :
Le chef ne remplace pas l'agent courrier.

Reversible :
Oui.

## P0.7 - Definir les sources de verite par menu

Objectif :
Eviter les chiffres contradictoires.

Livrable :
Cartographie Firestore par menu.

Test :
Chaque indicateur a une source primaire.

Reversible :
Oui.

## P0.8 - Identifier les pages legacy a declasser

Objectif :
Ne garder qu'une experience chef cible.

Pages candidates :

* anciens dashboards agence
* rapports partiels
* vues caisse redondantes
* acces direct guichet pour chef
* acces direct comptabilite operationnelle pour chef

Livrable :
Liste garder / fusionner / masquer / supprimer.

Test :
Aucune page legacy ne porte une responsabilite unique non reprise ailleurs.

Reversible :
Oui.

# P1 - Amelioration UX

## P1.1 - Concevoir Activite comme cockpit principal

Objectif :
Transformer Activite en page d'accueil chef.

Contenu :

* actions requises
* alertes
* postes actifs
* departs
* ventes
* courrier
* finance
* activite recente

Test :
En moins de 30 secondes, le chef sait quoi traiter.

Reversible :
Oui si garde derriere une route existante.

## P1.2 - Creer le menu Postes

Objectif :
Regrouper postes Billetterie et Courrier.

Onglets :

* Billetterie
* Courrier

Test :
Un poste actif, cloture ou a approuver est trouvable sans passer par plusieurs pages.

Reversible :
Oui.

## P1.3 - Creer le menu Departs

Objectif :
Fusionner supervision embarquement, validation depart et arrivees attendues.

Sections :

* departs du jour
* retards
* absents
* reports
* departs confirmes
* arrivees attendues

Test :
Un chef peut suivre un trajet de depart a arrivee sans changer de module.

Reversible :
Oui.

## P1.4 - Recentrer Finance

Objectif :
Afficher uniquement les decisions chef et la consultation finance.

Sections :

* depenses
* validations
* transferts en consultation
* ecarts

Test :
Le chef ne peut pas faire une action comptable primaire.

Reversible :
Oui.

## P1.5 - Refaire Rapports

Objectif :
Remplacer les rapports partiels par un rapport chef consolide.

Periodes :

* jour
* semaine
* mois
* annee
* personnalise

Test :
Les ventes, courrier, departs, caisse, depenses et personnel sont consultables depuis un seul espace.

Reversible :
Oui.

## P1.6 - Simplifier Equipe

Objectif :
Donner au chef une gestion locale claire.

Test :
Un role global ne peut pas etre cree par erreur.

Reversible :
Oui.

## P1.7 - Simplifier Trajets et horaires recurrents

Objectif :
Rendre les trajets comprehensibles pour un superviseur.

Test :
Le chef voit les departs recurrents et leur impact operationnel.

Reversible :
Oui.

# P2 - Confort

## P2.1 - Ajouter des filtres rapides

Filtres :

* aujourd'hui
* hier
* semaine
* mois
* periode personnalisee

Test :
Les rapports et historiques sont consultables sans manipulation complexe.

Reversible :
Oui.

## P2.2 - Ajouter des exports consolides

Exports :

* rapport jour
* rapport caisse
* rapport departs
* rapport courrier
* rapport personnel

Test :
Chaque export correspond a une vue chef.

Reversible :
Oui.

## P2.3 - Ajouter un historique des decisions chef

Objectif :
Tracer les approbations, refus et renvois.

Sources :

* agentHistory
* logs metier existants

Test :
Toute decision chef importante est consultable.

Reversible :
Oui.

## P2.4 - Ajouter des indicateurs de tendance

Indicateurs :

* evolution ventes
* evolution colis
* retards recurrents
* ecarts recurrents
* absences passagers

Test :
Les tendances ne remplacent pas les alertes operationnelles.

Reversible :
Oui.

## P2.5 - Ajouter des recommandations

Objectif :
Aider le chef a anticiper.

Exemples :

* trajet sous-rempli
* poste actif trop longtemps
* depense recurrente
* ecart frequent

Test :
Chaque recommandation doit mener a une action claire.

Reversible :
Oui.

## P2.6 - Ajouter un mode lecture seule audit

Objectif :
Permettre au chef ou a l'admin de consulter sans risque d'action.

Test :
Aucun bouton d'action sensible visible en mode audit.

Reversible :
Oui.

# Ordre recommande

Ne pas lancer Activite, Postes, Departs, Finance et Rapports en meme temps.

Le chantier doit commencer par une seule surface fonctionnelle, puis avancer par phases independantes.

## Phase 0 - Validation documentaire

1. P0.1 - Geler le perimetre Chef d'Agence
2. P0.2 - Valider le menu final
3. P0.3 - Classer les actions interdites
4. P0.4 - Clarifier Chef vs Comptable
5. P0.5 - Clarifier Chef vs Chef Embarquement
6. P0.6 - Clarifier Chef vs Agent Courrier
7. P0.7 - Definir les sources de verite par menu
8. P0.8 - Identifier les pages legacy a declasser

## Phase 1 - Activite

Objectif :
Faire d'Activite le cockpit principal du Chef d'Agence.

Statut :
Audit Phase 1 VALIDE apres corrections documentaires obligatoires.

Regles obligatoires Phase 1 :

* Activite = synthese et supervision.
* Postes = detail operationnel des services.
* Finance = detail financier.
* Aucune duplication massive des memes tableaux entre Activite, Postes, Finance et Departs.
* Presence du personnel reportee a une future phase RH.
* Departs operationnels lus uniquement via `departures` + `reservations`.
* Ne pas utiliser `tripInstances`, `boardingClosures` ou `weeklyTrips` pour les widgets Depart de l'Activite.

Taches :

* P1.1 - Concevoir Activite comme cockpit principal
* limiter cette phase aux informations du jour
* ne pas refondre Postes, Departs, Finance ou Rapports dans cette phase
* appliquer la matrice widgets Phase 1 comme reference unique

Avancement :

* [x] Corrections documentaires obligatoires appliquees.
* [x] Audit Phase 1 marque comme valide.
* [x] StaffPresenceCard et indicateurs de presence exclus de la Phase 1.
* [x] Widgets Depart de l'Activite relies a `departures` + `reservations`.
* [x] Alertes Depart du shell Chef d'Agence reliees a `departures`.
* [x] Actions Finance renvoyees vers Finance, sans execution comptable dans Activite.
* [x] Widgets Analyse/Premium/recommandations retires du cockpit Phase 1.
* [x] Build Phase 1 OK.
* [ ] Validation visuelle et metier par utilisateur sur donnees reelles.

## Phase 2 - Postes

Objectif :
Regrouper et clarifier les postes Billetterie et Courrier.

Taches :

* P1.2 - Creer le menu Postes
* separer supervision chef et execution agent
* confirmer les actions autorisees et interdites

## Phase 3 - Departs

Objectif :
Unifier la supervision depart sans remplacer le Chef Embarquement.

Taches :

* P1.3 - Creer le menu Departs
* integrer departs du jour, retards, absents, reports, departs confirmes et arrivees attendues
* conserver la regle : le Chef supervise, le Chef Embarquement execute

## Phase 4 - Finance

Objectif :
Recentrer Finance sur les decisions du Chef d'Agence.

Taches :

* P1.4 - Recentrer Finance
* isoler approbation chef et validation comptable
* interdire les actions de saisie tresorerie au Chef d'Agence

## Phase 5 - Rapports

Objectif :
Creer des rapports consolides en lecture seule.

Taches :

* P1.5 - Refaire Rapports
* couvrir jour, semaine, mois, annee et periode personnalisee
* interdire toute modification de donnees depuis Rapports

## Phase 6 - Configuration

Objectif :
Stabiliser les zones de configuration.

Taches :

* P1.6 - Simplifier Equipe
* P1.7 - Simplifier Trajets et horaires recurrents

## Phase 7 - Nettoyage legacy et optimisation

Objectif :
Nettoyer seulement apres validation des surfaces principales.

Taches :

* masquer ou rediriger les pages legacy
* supprimer les doublons de navigation
* optimiser les lectures
* ajouter les conforts P2.1 a P2.6
