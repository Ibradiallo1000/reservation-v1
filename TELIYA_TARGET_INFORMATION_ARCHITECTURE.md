# TELIYA — Architecture de l'information UX cible

## Principes

1. Un espace correspond à une responsabilité et possède un shell stable.
2. Les synthèses mènent aux détails ; les mutations restent dans l'espace du rôle responsable.
3. Les routes principales sont visibles dans la navigation ; les routes de détail sont contextuelles.
4. Desktop et mobile présentent les mêmes domaines, avec une priorité différente mais sans permission différente.
5. Les termes « activité », « caisse », « trésorerie », « flux », « réservation » et « validation » ont un sens unique.
6. Les modules gelés conservent workflows, statuts, calculs, collections et permissions.

## Carte cible

```text
Teliya
├─ Public
│  ├─ Marketplace (future /)
│  ├─ Landing SaaS (future /landing)
│  └─ Compagnie publique (/:slug et sous-domaine)
│     ├─ Recherche et résultats
│     ├─ Réservation / paiement / confirmation
│     └─ Mes réservations / mes billets / aide
├─ Plateforme SaaS (/admin)
│  ├─ Supervision
│  ├─ Compagnies et abonnements
│  ├─ Offre, facturation et revenus plateforme
│  └─ Configuration et contenu public
├─ Compagnie (/compagnie/:companyId)
│  ├─ Command Center CEO
│  ├─ Agences et configuration compagnie
│  ├─ Clients et qualité
│  └─ Comptabilité compagnie (/accounting)
│     ├─ Réseau financier
│     ├─ Trésorerie et comptes
│     ├─ Flux / rapprochements
│     └─ Rapports
├─ Agence (/agence)
│  ├─ Supervision chef d'agence
│  ├─ Comptabilité agence (/comptabilite)
│  ├─ Guichet (/guichet)
│  ├─ Embarquement (/boarding)
│  ├─ Courrier (/courrier)
│  └─ Escale (/escale)
└─ Modules différés
   ├─ Garage, flotte, maintenance et équipages
   └─ Transit, incidents, conformité, urgence et logistique avancée
```

## Espace Public

- **Rôle principal :** visiteur/voyageur.
- **Entrée cible :** future Marketplace `/`; landing SaaS `/landing`; compagnie `/:slug` ou sous-domaine.
- **Shell :** shell public unique par contexte, avec header, contenu et navigation mobile cohérents.
- **Desktop :** recherche, compagnies, mes réservations/billets, aide.
- **Mobile :** Accueil, Rechercher, Billets, Aide.
- **Actions globales :** rechercher ; retrouver un billet.
- **Routes principales :** `/`, `/resultats`, `/:slug`, `/:slug/resultats`, `/:slug/booking`, `/:slug/mes-reservations`, `/:slug/mes-billets`.
- **Secondaires/détail :** paiement, preuve, confirmation/reçu, détail réservation, mentions, confidentialité, à propos.
- **Interdit :** exposition de données internes ou de diagnostics.
- **Responsive :** recherche compacte et persistante ; progression de réservation visible ; critères dans l'URL.
- **Décision différée :** migration de la landing et création Marketplace dans la phase publique dédiée.

## Espace Plateforme SaaS

- **Rôle :** `admin_platforme`.
- **Entrée :** `/admin/dashboard`.
- **Shell :** `AdminLayout` unique.
- **Desktop :** Vue d'ensemble, Compagnies, Abonnements, Offre & plans, Facturation/revenus, Supervision, Contenu public, Configuration.
- **Mobile :** Dashboard, Compagnies, Abonnements, Plus.
- **Actions globales :** créer une compagnie ; rechercher ; voir alertes plateforme.
- **Principales :** dashboard, compagnies, abonnements, plans, finances/revenus, paramètres.
- **Secondaires/détail :** ajout/édition/plan compagnie, moyens de paiement, médias, réservations globales, statistiques.
- **Interdit :** opérations quotidiennes d'une agence ou validation comptable d'une compagnie.
- **Responsive :** listes et tableaux adaptatifs ; actions destructives explicites et confirmées.

## Espace Compagnie — Command Center

- **Rôle :** CEO / administrateur compagnie.
- **Entrée :** `/compagnie/:companyId/command-center`.
- **Shell :** shell compagnie exécutif unique.
- **Desktop :** Vue réseau, Activité, Performance, Finances consolidées, Trésorerie, Alertes, Agences, Clients, Configuration.
- **Mobile :** Vue réseau, Activité, Alertes, Plus.
- **Actions globales :** changer période/agence de comparaison ; accéder à une alerte ; configurer la compagnie.
- **Principales :** synthèses consolidées et drill-down en lecture.
- **Secondaires/détail :** agence, route, client, erreur système, paramètres de paiement et images.
- **Interdit :** ouvrir un poste, vendre, embarquer, créer une écriture quotidienne, valider une dépense ou une remise de caisse.
- **Responsive :** cartes consolidées puis listes ; pas de dashboard desktop compressé tel quel.

## Espace Comptabilité compagnie

- **Rôle :** chef comptable et rôles financiers compagnie confirmés.
- **Entrée :** `/compagnie/:companyId/accounting`.
- **Shell :** shell comptable compagnie unique, distinct du CEO.
- **Desktop :** Dashboard, Réseau financier, Trésorerie, Flux, Rapprochements/Anomalies, Rapports.
- **Mobile :** Dashboard, Trésorerie, Flux, Plus.
- **Actions globales :** période ; compte/agence ; nouvelle opération autorisée.
- **Secondaires/détail :** compte, opération, transfert, bénéficiaire/fournisseur, rapport, diagnostic.
- **Interdit :** vente et opérations terrain ; reconstruction des finances depuis réservations/paiements UI.
- **Responsive :** opérations en assistant ou pages dédiées, jamais dans des tableaux débordants.

## Espace Agence — Supervision

- **Rôle :** chef d'agence ; superviseur uniquement selon capacités confirmées.
- **Entrée :** `/agence/activite`.
- **Shell :** shell agence unique pour les pages de supervision.
- **Desktop :** Aujourd'hui, Départs, Réservations, Guichets, Embarquement, Courrier, Équipe, Rapports, Configuration autorisée.
- **Mobile :** Aujourd'hui, Départs, Réservations, Plus.
- **Actions globales :** choisir le jour/départ ; voir alertes ; changer de module opérationnel.
- **Principales :** supervision et drill-down ; aucune mutation comptable.
- **Secondaires/détail :** historique, agent, arrivée, trajet, rapport.
- **Interdit :** validation comptable, rapprochement, création directe d'opération de trésorerie.
- **Responsive :** résumé du jour avant les tableaux ; transitions explicites vers les shells spécialisés.

## Espace Comptabilité agence

- **Rôle :** `agency_accountant`.
- **Entrée :** `/agence/comptabilite`.
- **Shell :** shell comptable agence dédié.
- **Desktop :** À traiter, Caisse, Écarts, Historique/Journal, Rapports, Trésorerie autorisée.
- **Mobile :** À traiter, Caisse, Historique, Plus.
- **Actions globales :** date ; type de session ; rechercher ; traiter la prochaine remise.
- **Principales :** réception et validation selon workflow existant.
- **Secondaires/détail :** session, écart, trace, écriture, rapport.
- **Interdit :** vente, embarquement, administration compagnie.
- **Responsive :** découper visuellement la page longue en destinations sans modifier ses services ni calculs.

## Espace Guichet

- **Rôle :** guichetier.
- **Entrée :** `/agence/guichet`.
- **Shell :** poste de vente dédié et stable.
- **Desktop :** Vente, Rapport, Historique ; état de session permanent.
- **Mobile :** Vente, Rapport, Plus, si le terminal mobile est supporté.
- **Actions globales :** ouvrir/suspendre/reprendre/clôturer selon état.
- **Principales :** vendre puis imprimer.
- **Détail :** réservation, reçu, historique de vente.
- **Interdit :** validation comptable de sa propre remise.
- **Responsive :** priorité au trajet, client, paiement et confirmation ; actions irréversibles protégées.

## Espace Embarquement

- **Rôle :** chef d'embarquement ; supervision explicitement admise.
- **Entrée :** `/agence/boarding`.
- **Shell :** `BoardingLayout` unique.
- **Desktop :** Départs, Scan, Liste, Rapports.
- **Mobile :** Départs, Scan, Liste, Plus.
- **Actions globales :** sélectionner départ ; signaler anomalie.
- **Interdit :** modifier paiement ou caisse.
- **Responsive :** accès au scan toujours visible ; alternative manuelle ; état de synchronisation et erreurs annoncés.

## Espace Courrier

- **Rôle :** agent courrier ; supervision limitée confirmée.
- **Entrée :** `/agence/courrier`.
- **Shell :** shell courrier dédié, inchangé fonctionnellement.
- **Desktop :** Tableau, Nouveau, Expéditions, Arrivées, Remises, Rapport/Historique.
- **Mobile :** Tableau, Nouveau, Arrivées, Plus.
- **Actions globales :** session courrier ; rechercher par référence/téléphone.
- **Interdit :** validation comptable de la session par l'agent.
- **Responsive :** référence et statut toujours visibles ; origine/destination non tronquées.

## Espace Escale

- **Rôle :** agent/manager d'escale.
- **Entrée :** `/agence/escale`.
- **Shell :** shell Escale unique, y compris pour Équipe.
- **Desktop :** Aujourd'hui, Bus, Embarquement, Manifeste, Caisse, Équipe.
- **Mobile :** Aujourd'hui, Bus, Embarquement, Plus.
- **Interdit :** bascule implicite vers le shell général agence.
- **Responsive :** bus actif persistant dans le header ; opérations ordonnées dans le temps.

## Règles de routes et de détails

- Une route principale doit avoir une entrée de navigation pour chaque rôle qui en dépend quotidiennement.
- Un alias est réservé à la compatibilité et redirige vers une route canonique unique ; il ne doit pas faire office de taxonomie.
- Les filtres/onglets partageables utilisent l'URL ; les données nécessaires à une reprise ne dépendent pas uniquement de `location.state`.
- Une page détail possède un retour vers sa liste avec filtres conservés.
- Les flags masquent une capacité et son point d'entrée de façon cohérente ; un rôle ne doit jamais atterrir sur un module différé.
- Les shells spécialisés peuvent être ouverts depuis la supervision, mais le changement d'espace est explicite et offre un retour stable.
