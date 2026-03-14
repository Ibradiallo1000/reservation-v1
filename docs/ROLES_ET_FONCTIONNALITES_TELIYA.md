# Rôles et fonctionnalités TELIYA — Référentiel complet

Document de référence : **qui fait quoi** dans l’application. Chaque rôle est décrit avec ses **écrans**, **actions** et **données** accessibles.  
Source : code (routes, permissions, pages) — état actuel de l’application.

---

## Légende

- **Route** = chemin d’URL après connexion.
- **Actions** = ce que l’utilisateur peut faire (boutons, formulaires, validations).
- **Données** = collections / écrans de données (lecture ou écriture).

---

## 1. Client (non connecté, pas de rôle)

**Accès :** Portail public, pas de compte TELIYA.

| Fonctionnalité | Détail |
|----------------|--------|
| **Réserver un billet** | Va sur `/:slug/reserver` (ex. `/mali-trans/reserver`). Choisit trajet, date/heure, saisit nom/téléphone, passe au paiement. |
| **Envoyer une preuve de paiement** | Après réservation : `/:slug/upload-preuve/:id`. Téléverse la preuve (référence transaction, etc.). |
| **Voir son billet (QR)** | `/:slug/reservation/:id` ou `/:slug/mon-billet?r=token`. Affiche le billet, QR code, détails du trajet. |
| **Retrouver une réservation** | `/:slug/retrouver-reservation` (téléphone). |
| **Mes réservations / Mes billets** | Liens dans le portail public selon la compagnie. |

**Données :** Aucun accès back-office. Données créées : réservations (agence), preuves (Cloud Function).

---

## 2. Guichetier (`guichetier`)

**Landing après login :** `/agence/guichet`.

| Écran / Route | Actions |
|---------------|--------|
| **Poste de vente (Guichet)** `/agence/guichet` | **Ouvrir** un poste (shift) ; **vendre** des billets (sélection trajet, date/heure, client, places, tarifs) ; **encaisser** l’argent ; **imprimer** reçus ; **fermer** le poste en fin de service. Consultation des ventes récentes, recherche par code réservation. |

**Données :** Sessions guichet (postes), réservations créées au guichet, reçus. Pas d’accès à la comptabilité ni à la trésorerie.

**Résumé métier :** Ouvre son poste → vend des billets → encaisse → imprime les reçus → ferme le poste.

---

## 3. Comptable d’agence (`agency_accountant`)

**Landing après login :** `/agence/comptabilite`.

| Écran / Route | Actions |
|---------------|--------|
| **Comptabilité agence** `/agence/comptabilite` | **Contrôler les postes guichet** : activer / mettre en pause / clôturer les postes ; **valider** les postes clôturés (validation comptable). **Réception et validation** des remises de caisse. **Consulter** les rapports (guichet + réservations en ligne). **Gérer la caisse** d’agence : entrées, sorties, soldes. **Réconcilier** ventes vs encaissements. |
| **Sessions courrier** | **Valider** les sessions courrier clôturées (même principe que guichet). |
| **Trésorerie agence** (depuis comptabilité ou lien dédié) | Nouvelle opération, versement compagnie, nouveau payable fournisseur. |
| **Sessions caisse** `/agence/cash-sessions` | Ouvrir / clôturer une session caisse (guichet ou courrier) ; **valider** ou **rejeter** les sessions clôturées (réconciliation). |

**Données :** Postes guichet, sessions courrier, sessions caisse, rapports ventes, trésorerie agence.

**Résumé métier :** Valide les postes guichet et courrier, contrôle la caisse, voit les ventes, gère la trésorerie de l’agence.

---

## 4. Chef embarquement (`chefEmbarquement`)

**Landing après login :** `/agence/boarding`.

| Écran / Route | Actions |
|---------------|--------|
| **Tableau de bord embarquement** `/agence/boarding` | Voir les départs du jour, listes de passagers par trajet. |
| **Scan** `/agence/boarding/scan` | **Scanner le QR** du billet du passager ; **marquer** le passager comme embarqué. Suivi de la capacité véhicule (si flotte renseignée). **Fermer** la liste d’embarquement pour un départ. |

**Données :** Réservations (payées/confirmées), statut d’embarquement, trajets, affectations véhicules (lecture capacité).

**Résumé métier :** Scanne les billets QR, marque les passagers embarqués, ferme les listes.

---

## 5. Agent courrier (`agentCourrier`)

**Landing après login :** `/agence/courrier` (redirection automatique).

| Écran / Route | Actions |
|---------------|--------|
| **Session courrier** `/agence/courrier/session` | **Ouvrir** une session courrier (comme un poste) ; voir les envois de la session ; **fermer** la session en fin de service. |
| **Nouvel envoi** `/agence/courrier/nouveau` | **Créer un envoi** (colis / lettre) : expéditeur, destinataire, agence de destination, nature, valeur déclarée, assurance, frais. **Paiement à l’origine** (ORIGIN) ou **à la destination** (DESTINATION). **Imprimer** reçu et étiquette. |
| **Réception** `/agence/courrier/reception` | Pour les colis **qui arrivent** à l’agence : les **marquer « Arrivés »** (CREATED/IN_TRANSIT → ARRIVED), puis **« Prêt à retirer »** (ARRIVED → READY_FOR_PICKUP). |
| **Remise** `/agence/courrier/remise` | Quand le **destinataire** vient retirer : **recherche** par code envoi ou téléphone destinataire ; affichage du détail ; **encaissement** éventuel à la destination ; **confirmer la remise** → statut DELIVERED. |
| **Lots** `/agence/courrier/lots` | Consulter et gérer les **lots** (regroupement d’envois pour le transport). |
| **Rapports courrier** `/agence/courrier/rapport` | **Rapports par session** : envois créés, revenus origine, envois livrés, revenus destination, totaux. |

**Non disponible aujourd’hui :** « Retour à l’expéditeur » (statut RETURNED prévu dans le modèle, mais pas d’écran ni d’action dans l’app).

**Données :** Sessions courrier, envois (shipments), lots, événements livraison.

**Résumé métier :** Ouvre sa session → crée les envois quand l’expéditeur vient → encaisse (ou reporte au destinataire) → à l’arrivée marque « arrivés » puis « prêts à retirer » → à la remise confirme la livraison au destinataire → consulte les rapports. Il ne peut pas marquer un colis « retourné à l’expéditeur » dans l’app.

---

## 6. Responsable flotte (agence) (`agency_fleet_controller`)

**Landing après login :** `/agence/fleet`.

| Écran / Route | Actions |
|---------------|--------|
| **Tableau de bord flotte** `/agence/fleet` | Vue d’ensemble des véhicules et des opérations de l’agence. |
| **Exploitation** `/agence/fleet/operations` | Suivi des départs / arrivées, opérations du jour. |
| **Affectation** `/agence/fleet/assignment` | **Affecter** un véhicule (et éventuellement chauffeur / convoyeur) aux trajets (départ, arrivée, date, heure). Gestion des affectations par trajet. |
| **Véhicules** `/agence/fleet/vehicles` | Consulter les véhicules (liste, statut) visibles pour l’agence. |
| **Équipage** `/agence/fleet/crew` | Consulter et **gérer l’équipage** de l’agence : chauffeurs, convoyeurs (rôle crew), **affectation d’un véhicule** à chaque membre (assignedVehicleId). Activer / désactiver les membres. |
| **Mouvements** `/agence/fleet/movements` | Historique des mouvements (départs, arrivées, changements de statut). |

**Données :** Véhicules (company), utilisateurs agence (crew, assignedVehicleId), affectations (trajets × date × heure), mouvements.

**Résumé métier :** À l’agence : affecte les véhicules aux trajets, gère l’équipage (chauffeurs, convoyeurs), affecte un véhicule à chaque conducteur, suit les départs et confirme les arrivées.

---

## 7. Responsable logistique / Chef garage (compagnie) (`responsable_logistique`, `chef_garage`)

**Landing après login :** `/compagnie/:companyId/garage/dashboard`.

`chef_garage` est un **alias** de `responsable_logistique` (même périmètre).

| Écran / Route | Actions |
|---------------|--------|
| **Dashboard garage** `/compagnie/:companyId/garage/dashboard` | Vue d’accueil du module garage / logistique. |
| **Logistique** `/compagnie/:companyId/garage/logistics` | **Tableau de bord logistique** : vue d’ensemble flotte, trajets, envois courrier (nombre, en transit), alertes (assurance, inspection, vignette), remplacement véhicule en urgence. |
| **Équipage (compagnie)** `/compagnie/:companyId/garage/logistics/crew` | **Gérer les conducteurs et convoyeurs** au niveau **compagnie** : **créer** un membre d’équipage (nom, prénom, téléphone, adresse, ville, **rôle : chauffeur ou convoyeur**). **Modifier** ou désactiver. **Affecter un véhicule** à chaque membre (assignedVehicleId). Les données sont dans `companies/:companyId/personnel` (crewRole, assignedVehicleId). |
| **Logistique / Conformité & Urgence** `logistics/compliance`, `logistics/emergency` | Même dashboard en mode conformité (échéances) ou urgence (incidents, remplacement véhicule). |
| **Flotte** `/compagnie/:companyId/garage/fleet` | **Liste des véhicules** de la compagnie. **Créer** un véhicule (immatriculation, modèle, année, etc.). **Modifier** (statut technique, opérationnel, ville, etc.). **Archiver** un véhicule. **Changer le statut technique** (normal, maintenance, accidenté, hors service) et **opérationnel** (garage, affecté, en transit). |
| **Maintenance / Transit / Incidents** `garage/maintenance`, `garage/transit`, `garage/incidents` | Vues filtrées du même module flotte (maintenance, en transit, incidents). |

**Données :** Véhicules (fleetVehicles), personnel compagnie (conducteurs / convoyeurs), affectations, envois courrier (lecture), trajets.

**Résumé métier :** Au niveau **compagnie** : gère la flotte (création, statuts, maintenance), **gère les conducteurs et convoyeurs** (création, rôle, affectation à un véhicule), suit la logistique (trajets, colis, conformité, urgence). C’est le rôle qui **ajoute** les chauffeurs et les **affecte aux véhicules** au niveau global compagnie.

---

## 8. Chef d’agence (`chefAgence`)

**Landing après login :** `/agence/dashboard`.

Accès au **shell agence** (menu unique) avec toutes les sections autorisées.

| Écran / Route | Actions |
|---------------|--------|
| **Poste de pilotage** `/agence/dashboard` | Vue d’ensemble : activité, alertes, indicateurs de l’agence. |
| **Opérations** `/agence/operations` | Suivi des opérations (trajets, ventes, embarquements). |
| **Finances** `/agence/finances` | Vue finances agence (revenus, ventes). |
| **Trésorerie** `/agence/treasury` | Trésorerie agence : vue générale, nouvelle opération, versement compagnie, nouveau payable. |
| **Validation dépenses** `/agence/expenses-approval` | **Valider** ou **rejeter** les demandes de dépenses en attente (statut pending_manager). |
| **Rapports** `/agence/reports` | Rapports de l’agence. |
| **Trajets** `/agence/trajets` | Gestion des trajets (offre agence). |
| **Équipe** `/agence/team` | Gestion du **personnel** de l’agence (ajout, rôles, affectation). |
| **Équipage flotte** (lien vers `/agence/fleet/crew`) | Accès à l’équipage agence (chauffeurs, convoyeurs, affectation véhicule). |
| **Courrier** (si activé) | Même périmètre que l’agent courrier : session, nouvel envoi, réception, remise, lots, rapports. |
| **Guichet** | Accès au poste guichet (vente, reçus). |
| **Comptabilité** | Accès à la comptabilité agence (postes, caisse, trésorerie). |
| **Sessions caisse** | Ouverture / clôture, validation (avec comptable). |
| **Embarquement** (via boarding) | Accès au scan et à la fermeture des listes. |
| **Flotte** (via fleet) | Tableau de bord, exploitation, affectation, véhicules, équipage, mouvements. |

**Données :** Tout ce qui concerne l’agence : ventes, réservations, guichet, courrier, caisse, trésorerie, dépenses, équipe, flotte, embarquement.

**Résumé métier :** Supervise toute l’agence : ventes, guichet, courrier, embarquement, flotte, équipe, valide les dépenses, contrôle la trésorerie et la comptabilité.

---

## 9. Superviseur agence (`superviseur`)

**Landing après login :** `/agence/dashboard`.

Même **périmètre d’écrans** que le chef d’agence (shell agence) : dashboard, opérations, finances, trésorerie, **validation dépenses**, rapports, trajets, équipe, équipage flotte, courrier, guichet, comptabilité, sessions caisse, embarquement, flotte.

**Différence métier :** Rôle « superviseur » (niveau hiérarchique) ; dans le code, les **actions** accessibles sont les mêmes que pour le chef d’agence. Utilisation typique : délégué du chef d’agence ou superviseur de plusieurs postes.

---

## 10. Chef comptable compagnie / DAF (`company_accountant`, `financial_director`)

**Landing après login :** `/compagnie/:companyId/accounting` (Vue Globale).

| Écran / Route | Actions |
|---------------|--------|
| **Vue Globale** (accueil accounting) | Synthèse : toutes les agences, trésoreries, indicateurs financiers. |
| **Réservations en ligne** | Consultation des réservations en ligne (toutes agences). |
| **Finances** | Vue finances compagnie (revenus, coûts). |
| **Compta** | Comptabilité détaillée. |
| **Dépenses** | Liste des dépenses ; **approbation** selon seuils (company_accountant / financial_director). |
| **Trésorerie** | Opérations de trésorerie, **transferts** (inter-agences, vers compagnie), **payables** fournisseurs, **paiements** fournisseurs. |
| **Rapports** | Rapports financiers et comptables. |
| **Paramètres** | Paramètres du module comptabilité. |
| **Trip costs** (hors layout) | Coûts par trajet (si accès route). |
| **Financial settings** | Paramètres financiers compagnie. |

**Données :** Toutes les agences, toutes les trésoreries, transferts, dépenses, comptabilité, payables.

**Résumé métier :** Voit toutes les agences et trésoreries, les transferts bancaires, les dépenses globales ; gère la trésorerie et les payables au niveau compagnie.

---

## 11. CEO / Directeur général (`admin_compagnie`)

**Landing après login :** `/compagnie/:companyId/command-center`.

| Zone | Écrans / Actions |
|------|-------------------|
| **Command center** | **Tableau de bord temps réel** : état global, risques, activité opérationnelle, flotte, alertes, position financière, performance réseau, actions rapides. Revenus billets, revenus colis, revenus par agence, statistiques, dépenses. |
| **Layout Compagnie** (`/compagnie/:companyId/*`) | Accès à l’ensemble des pages CEO : command-center, payment-approvals, ceo-expenses, revenus-liquidites, dashboard, agences, paramètres, réservations, clients, images, payment-settings, avis-clients, **garage** (flotte, logistique, équipage), **accounting** (même vue que chef comptable). |
| **Côté agence** | Accès au **shell agence** : dashboard, opérations, finances, trésorerie, validation dépenses, courrier, guichet, comptabilité, cash-sessions, receipt, boarding, flotte (dont équipage). |

**Données :** Toutes les données compagnie et agences (lecture + actions selon les écrans).

**Résumé métier :** Vision temps réel (revenus billets/colis, par agence, stats, flotte, dépenses) ; pilotage global ; accès garage (flotte, conducteurs) et comptabilité ; peut tout faire côté agence comme un chef d’agence.

---

## 12. Admin plateforme (`admin_platforme`)

**Landing après login :** `/admin/dashboard`.

| Écran / Route | Actions |
|---------------|--------|
| **Dashboard admin** `/admin/dashboard` | Métriques SaaS, compagnies, abonnements. |
| **Compagnies** | Créer, modifier, configurer les compagnies (plans, fonctionnalités). |
| **Plans / Abonnements** | Gestion des offres et abonnements. |
| **Revenus / Statistiques** | Revenus plateforme, statistiques globales. |
| **Réservations / Finances** (admin) | Vue plateforme sur les données. |
| **Paramètres plateforme** | Logo, bannière, présentation produit, médias. |
| **Impersonation** | Accéder à une compagnie en « inspection » : mêmes routes que CEO / comptable / garage selon le contexte. |

**Données :** Toutes les données de la plateforme et des compagnies (lecture + configuration). Contourne le TenantGuard (accès multi-tenant).

**Résumé métier :** Gestion de la plateforme SaaS (compagnies, plans, paramètres) ; pas un rôle métier transport au quotidien.

---

## Synthèse : qui gère les conducteurs et les véhicules

| Niveau | Rôle | Conducteurs / équipage | Véhicules | Affectation véhicule ↔ trajet |
|--------|------|-------------------------|-----------|--------------------------------|
| **Compagnie** | Responsable logistique / Chef garage | **Oui** — Crée et gère chauffeurs et convoyeurs (`logistics/crew`), **affecte un véhicule à chaque membre**. | **Oui** — Crée, modifie, archive, statuts (garage/fleet). | Vue globale, maintenance, transit, incidents. |
| **Agence** | Responsable flotte (agency_fleet_controller) | **Oui** — Gère l’équipage de **l’agence** (`/agence/fleet/crew`), affecte véhicule à chaque membre. | Lecture + exploitation. | **Oui** — Affecte véhicules (et équipage) aux trajets (`/agence/fleet/assignment`). |
| **Agence** | Chef d’agence | **Oui** — Accès à l’équipage flotte agence et à l’affectation. | Oui (via flotte agence). | Oui (affectation trajets). |

Les **conducteurs** sont donc :
- **Au niveau compagnie** : créés et affectés aux véhicules par le **responsable logistique** (ou chef garage) dans `LogisticsCrewPage` (`/compagnie/:companyId/garage/logistics/crew`).
- **Au niveau agence** : gérés (et affectés à un véhicule) par le **responsable flotte** ou le **chef d’agence** dans `FleetCrewPage` (`/agence/fleet/crew`). L’**affectation des véhicules aux trajets** (départ, heure) se fait dans `FleetAssignmentPage` (`/agence/fleet/assignment`).

---

*Document généré à partir du code (AppRoutes, routePermissions, roles-permissions, roleCapabilities, pages). Dernière mise à jour : mars 2025.*
