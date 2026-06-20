# Vision

Le Chef d'Agence est un superviseur operationnel.

Il ne remplace pas :

* le guichetier
* le comptable
* le chef embarquement
* l'agent courrier

Il supervise leurs activites.

Son espace doit donc etre construit autour de trois principes :

1. Voir rapidement l'etat reel de l'agence.
2. Traiter les validations et anomalies qui bloquent l'exploitation.
3. Consulter les details sans prendre la place des agents operationnels.

Le Chef d'Agence ne doit pas devenir un "super agent" capable de tout faire. Il doit disposer d'un cockpit de decision, pas d'une copie des interfaces metier des autres roles.

Le Chef d'Agence ne realise pas les operations suivantes :

* vente de billet
* scan embarquement
* validation comptable
* creation de colis
* remise de colis
* saisie de tresorerie

Ces operations appartiennent respectivement :

* Guichetier
* Chef Embarquement
* Comptable
* Agent Courrier

# Menus valides

1. Activite
2. Postes
3. Departs
4. Finance
5. Rapports
6. Equipe
7. Trajets

Les cinq premiers menus constituent l'espace de supervision quotidien :

1. Activite
2. Postes
3. Departs
4. Finance
5. Rapports

Les deux derniers menus sont des zones de configuration et doivent rester en bas du menu :

6. Equipe
7. Trajets

# Responsabilites de chaque menu

## Activite

### Objectif metier

Piloter la journee en cours.

Ce menu doit repondre a la question :

> Qu'est-ce que le Chef d'Agence doit traiter maintenant ?

### Donnees affichees

* ventes guichet du jour
* ventes en ligne du jour
* colis crees ou traites
* postes guichet actifs
* sessions courrier actives
* departs du jour
* departs en retard
* departs a valider
* depenses en attente chef
* ecarts caisse ouverts
* alertes personnel
* activite recente

### Actions autorisees

* ouvrir le detail d'un poste
* ouvrir le detail d'un depart
* ouvrir le detail d'une session courrier
* approuver ou refuser une depense en attente chef
* acceder a une validation bloquante
* consulter une alerte
* marquer une alerte comme traitee si un mecanisme existe

### Actions interdites

* vendre un billet
* scanner un billet d'embarquement
* creer un colis
* saisir une remise caisse
* creer une ecriture de tresorerie
* modifier directement un statut passager

## Postes

### Objectif metier

Superviser les postes operationnels de l'agence.

Le menu Postes regroupe les postes Billetterie et Courrier. Il sert a surveiller qui travaille, quel poste est actif, quel poste est cloture, et quels rapports attendent une validation ou une correction.

### Donnees affichees

* postes guichet actifs
* postes guichet clotures
* postes guichet valides par le comptable
* postes guichet en attente d'approbation chef
* sessions courrier actives
* sessions courrier cloturees
* sessions courrier validees par le comptable
* ecarts par poste
* agent responsable
* heure d'ouverture
* duree du poste
* montant attendu
* montant recu si deja valide par comptable

### Actions autorisees

* consulter le detail d'un poste
* approuver un poste deja valide par le comptable
* renvoyer un poste au comptable
* consulter les billets ou colis rattaches au poste
* consulter les ecarts
* signaler une anomalie

### Actions interdites

* ouvrir un poste a la place d'un agent
* vendre au guichet
* cloturer une session comme agent, sauf procedure de secours explicite
* saisir le montant de remise caisse
* valider comptablement la caisse
* modifier les reservations du poste

## Departs

### Objectif metier

Superviser l'exploitation transport de l'agence.

Ce menu doit regrouper les departs planifies, l'etat d'embarquement, les departs confirmes, les absents, les reports et les arrivees attendues.

Regle de responsabilite :

* Le Chef d'Agence supervise.
* Le Chef Embarquement execute.

Le Chef d'Agence consulte les departs, suit les retards, controle les manifestes et valide uniquement les decisions de supervision qui lui sont explicitement attribuees par le workflow. Il ne prend pas la place du Chef Embarquement pour le scan, la cloture operationnelle ou la modification des statuts passagers.

### Donnees affichees

* departs du jour
* departs des prochains jours si necessaire
* statut du depart : OPEN, CLOSED, DEPARTED
* trajet
* date
* heure
* vehicule si affecte
* chauffeur si affecte
* passagers attendus
* passagers embarques
* absents
* reports crees
* retards
* arrivees attendues
* manifeste final

### Actions autorisees

* consulter un depart
* consulter le manifeste
* imprimer le manifeste
* valider une decision de supervision depart si le workflow metier l'exige
* confirmer une arrivee si l'agence est destination et que le role le permet
* consulter les absents et reports

### Actions interdites

* scanner un billet comme agent embarquement
* cocher ou decocher un passager
* cloturer l'embarquement a la place du chef embarquement
* modifier les statuts passagers
* creer un report operationnel si cette responsabilite appartient au chef embarquement

## Finance

### Objectif metier

Donner au Chef d'Agence une vision controlee de la caisse et des validations financieres, sans lui donner le role du comptable.

### Donnees affichees

* rapports de poste valides par comptable
* sessions courrier validees par comptable
* depenses en attente chef
* ecarts caisse
* synthese tresorerie agence
* encaissements du jour
* sorties ou transferts a consulter
* anomalies financieres

### Actions autorisees

* approuver un rapport deja valide par comptable
* renvoyer un rapport au comptable
* approuver une depense en attente chef
* refuser une depense en attente chef
* consulter la tresorerie
* consulter les ecarts
* consulter les justificatifs

### Actions interdites

* saisir une remise caisse
* valider la caisse en tant que comptable
* creer une ecriture ledger
* creer un transfert de fonds
* creer un payable
* modifier une transaction financiere
* valider les paiements en ligne

## Rapports

### Objectif metier

Analyser l'activite passee de l'agence.

Le menu Rapports ne doit pas servir a modifier les donnees. Il doit permettre de filtrer, comparer, exporter et consulter.

### Donnees affichees

* rapport du jour
* rapport semaine
* rapport mois
* rapport annee
* periode personnalisee
* ventes guichet
* ventes en ligne
* activite courrier
* departs
* embarques
* absents
* reports
* depenses
* ecarts
* sessions agents
* performance par agent

### Actions autorisees

* filtrer
* consulter le detail
* exporter
* imprimer
* ouvrir un justificatif

### Actions interdites

* modifier une reservation
* modifier un rapport de poste
* modifier une transaction
* corriger un depart
* changer un statut courrier

## Equipe

### Objectif metier

Gerer le personnel local de l'agence.

### Donnees affichees

* agents de l'agence
* roles operationnels
* statut actif ou inactif
* codes agents
* rattachement agence
* dernieres activites si disponibles
* sessions recentes

### Actions autorisees

* inviter un agent
* activer un agent
* desactiver un agent
* modifier les informations locales
* attribuer un role operationnel autorise
* consulter l'activite d'un agent

### Actions interdites

* creer un role compagnie
* attribuer un role admin global
* modifier son propre role critique
* contourner le comptable agence
* contourner le chef embarquement

## Trajets

### Objectif metier

Superviser ou gerer le planning local selon l'organisation de la compagnie.

Ce menu regroupe les trajets, horaires, departs recurrents et affectations utiles a l'agence.

### Donnees affichees

* trajets de l'agence
* horaires recurrents
* weeklyTrips
* capacite
* departs planifies
* affectations vehicule si disponibles
* taux de remplissage
* trajets sous-remplis
* incoherences de planning

### Actions autorisees

* consulter les trajets
* consulter le planning
* modifier un trajet local si la compagnie autorise ce role
* signaler une incoherence
* ouvrir la vue depart correspondante

### Actions interdites

* modifier le reseau global compagnie sans autorisation
* changer les horaires critiques sans validation metier
* supprimer un trajet utilise par des reservations
* modifier la capacite sans controle de reservations existantes
