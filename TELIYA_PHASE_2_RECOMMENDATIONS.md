# TELIYA — Recommandations de Phase 2

## Décision globale

Ne pas lancer une refonte visuelle globale immédiatement. La Phase 3 doit commencer par une **fondation de navigation et de shells**, précédée d'un verrouillage de la matrice rôles/routes/actions/Rules. Le premier lot visuel doit être réversible, sans mutation métier, et exclure les calculs comptables ainsi que les workflows guichet/courrier.

## Recommandation exacte pour la Phase 3

> Construire et valider les shells et composants de navigation communs sur un périmètre non métier, en commençant par la taxonomie, le header, la sidebar desktop, la navigation mobile et les états accessibles ; appliquer d'abord ces fondations au shell Plateforme et à une page de synthèse en lecture seule, après validation de la matrice canonique rôle → route → action → règle. Ne modifier aucun workflow gelé, calcul financier, statut, collection, permission ou route publique pendant ce premier lot.

## Lot 3.0 — Précondition sécurité et taxonomie

- Établir une table canonique par action, pas seulement par page : rôle déclaré, alias accepté, route, guard, action affichée, service appelé et règle Firestore.
- Décider l'autorité réelle sur dépenses/remises ; isoler le CEO de toute validation opérationnelle.
- Auditer les routes directes `/agence/treasury/new-*` avant toute migration de menu.
- Définir le lexique UX : Activité, Caisse agence, Trésorerie compagnie, Flux financiers, Rapprochement, Validation.
- Classer chaque alias : canonique, compatibilité temporaire ou candidat retrait. Aucun retrait avant inventaire des liens entrants.

**Critère de sortie :** aucune destination Phase 3 ne repose sur une divergence connue entre navigation, guard et règle.

## Lot 3.1 — Fondations de shell

- Consolider les primitives existantes d'`InternalLayout` sans réécrire les pages métier.
- Définir header, sidebar, drawer mobile, breadcrumbs, titre/action principale, alertes et changement de contexte.
- Garantir focus visible, navigation clavier, fermeture Échap des drawers, restauration du focus, libellés accessibles, contraste AA et zones tactiles.
- Prévoir un mécanisme explicite de transition vers Guichet, Embarquement, Courrier et Escale, avec retour au shell agence.
- Garantir une taxonomie identique sur desktop/mobile ; quatre destinations prioritaires maximum sur mobile.

**Premier pilote recommandé :** Plateforme (`/admin`) puis une synthèse en lecture seule. C'est le périmètre le moins susceptible d'altérer les workflows gelés.

## Lot 3.2 — Supervision agence et compagnie

- Recomposer les synthèses autour du travail quotidien et des alertes, sans déplacer les mutations.
- Chef d'agence : Aujourd'hui, Départs, Réservations et accès explicites aux espaces spécialisés.
- CEO : activité réseau, performance agences, finances consolidées, trésorerie, alertes, agences et configuration.
- Les drill-down conservent filtres et période au retour.
- Ne pas commencer le nouveau Command Center fonctionnel ; seulement préparer sa structure et ses composants de lecture.

## Lot 3.3 — Présentation des écrans sensibles

- Traiter Comptabilité agence, Comptabilité compagnie, Guichet et Courrier uniquement avec un plan de non-régression approuvé.
- Extraire visuellement sections et détails sans changer appels de service, transactions, statuts, collections ni calculs.
- Ajouter tests de parcours et captures d'états avant/après pour chaque écran gelé.
- Préserver impression, tickets/reçus, raccourcis et reprise de session.

## Phase publique dédiée — après Phase 3 fondations

- Déplacer la landing actuelle de `/` vers `/landing` et faire de `/` la Marketplace seulement dans la phase explicitement autorisée.
- Définir une URL canonique de recherche avec départ, arrivée et date ; assurer refresh, partage, retour et modification.
- Décider si `/:slug/resultats` est une étape réelle. Si oui, la recherche plateforme y mène ; sinon, la route devient compatibilité et l'étape est retirée de la carte cible.
- Centraliser les générateurs d'URL publiques pour éliminer `/compagnie/:slug/...` lorsqu'il ne correspond pas au résolveur.
- Tester domaine principal, path slug et sous-domaine pour réservation, paiement, confirmation et billets.

## Responsive

- Concevoir mobile à partir des tâches prioritaires, pas en masquant la sidebar desktop.
- Plateforme/finance : tableaux à colonnes prioritaires et page détail.
- Embarquement : Scan toujours accessible et alternative manuelle.
- Guichet/courrier : état de session persistant, action primaire fixe sans masquer les erreurs.
- Escale : bus actif et étape courante persistants.

## Accessibilité

- Définir une checklist WCAG 2.2 AA pour chaque composant commun.
- Tester clavier complet, focus après navigation/modale, lecteurs d'écran, zoom 200 %, contraste et erreurs de formulaire.
- Annoncer chargement, nombre de résultats, scan accepté/refusé, paiement et confirmation.
- Ne jamais coder un statut uniquement par couleur ou icône.
- Respecter `prefers-reduced-motion` pour scroll et transitions.

## Mesures de validation

- Parcours public reproductible après rafraîchissement et partage de l'URL.
- Une destination quotidienne atteignable en au plus deux choix depuis le landing du rôle.
- Zéro rôle envoyé vers une feature désactivée.
- Zéro action financière visible dans le shell d'un rôle non autorisé.
- Même ensemble de domaines sur desktop et mobile.
- Zéro divergence non documentée entre rôle, guard, menu, action et règle.
- Aucun changement des tests/invariants des modules gelés.

## Risques restants

- Les Rules n'ont pas été réauditées action par action en Phase 2 ; un guard UI n'est pas une frontière de sécurité.
- Les alias de rôles rendent toute migration de menu risquée avant matrice canonique.
- Les pages comptables et guichet sont fortement couplées à leur présentation actuelle ; une extraction naïve peut modifier le timing ou l'état.
- Les feature flags masquent certaines destinations sans neutraliser toutes les routes.
- L'usage réel des pages non découvrables n'est pas mesuré ; aucune suppression ne doit être décidée sans télémétrie/liens entrants.
- Le parcours public varie entre domaine, sous-domaine et path slug ; les trois variantes doivent être testées ensemble.

## Hors périmètre immédiat

Garage, flotte, maintenance, transit, incidents, conformité, urgence, équipages et logistique avancée restent différés. La Marketplace, le déplacement de la landing et le nouveau Command Center CEO ne sont pas implémentés dans cette phase. Le courrier actif reste gelé malgré son appartenance au domaine logistique.
