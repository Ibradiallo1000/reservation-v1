# TELIA - Plan de masquage Phase 1

**Objectif :** simplifier l'interface utilisateur pour un MVP commercialisable sans supprimer code, routes ou collections.  
**Base :** `docs/PRODUCT_AUDIT.md` et strategie Phase 1.

## 1. Principe technique

Le masquage est pilote par `src/config/featureFlags.ts` :

| Flag | Valeur Phase 1 | Effet |
|---|---:|---|
| `ENABLE_PHASE1_ONLY` | `true` | Active la reduction de navigation |
| `ENABLE_COURIER` | `true` | Garde Courrier/Colis visible |
| `ENABLE_FLEET` | `false` | Masque flotte, vehicules, maintenance, transit, incidents |
| `ENABLE_ADVANCED_FINANCE` | `false` | Masque depenses, tresorerie avancee, audit financier |
| `ENABLE_LOGISTICS` | `false` | Masque logistique avancee, equipage, conformite, urgence trajet |

## 2. Menus conserves

### Compagnie

- Dashboard
- Activite reseau
- Finances simplifiees
- Configuration essentielle
- Parametres paiement via route directe existante

### Agence

- Activite
- Caisse
- Equipe
- Trajets
- Validation departs
- Rapports
- Courrier, quand le role a le droit d'acces

### Courrier

- Session
- Nouvel envoi
- Lots
- Arrivages
- Remise
- Rapport
- Historique

### Embarquement / escale

- Departs planifies
- Scan / liste
- Bus du jour
- Manifeste
- Caisse escale

## 3. Menus masques

| Zone | Menus masques |
|---|---|
| Direction compagnie | Flotte, Audit & controle avance |
| Comptabilite compagnie | Tresorerie avancee, Depenses |
| Agence | Planification avancee, Arrivees attendues |
| Exploitation agence | Flotte, affectation vehicules, vehicules, equipage, mouvements |
| Garage | Logistique, equipage, flotte, maintenance, transit, incidents, conformite bus, urgence trajet |

## 4. Lien casse neutralise

Le menu comptable `.../accounting/cash-control` etait signale comme route inexistante dans `PRODUCT_AUDIT.md`.

Neutralisation Phase 1 :

- le menu `Controle des caisses` pointe vers `.../accounting/finances`, route existante ;
- aucune route n'a ete supprimee ;
- aucune page metier n'a ete modifiee.

## 5. Impact roles

| Role | Impact Phase 1 |
|---|---|
| `admin_compagnie` | Voit le pilotage, l'activite reseau et les finances simplifiees ; ne voit plus flotte/audit avance dans le menu |
| `company_accountant` / `financial_director` | Voit dashboard, activite et controle des caisses ; ne voit plus depenses/tresorerie avancee |
| `chefAgence` | Voit activite, caisse, equipe, trajets, validation departs, rapports et courrier |
| `superviseur` | Voit le coeur agence ; courrier seulement si droits effectifs ajoutes au role |
| `agentCourrier` | Reste dirige vers l'espace courrier |
| `agency_fleet_controller` | Ne recoit plus de menu flotte visible en Phase 1 |
| `responsable_logistique` / `chef_garage` | Espace garage non expose depuis les menus Phase 1 |
| `guichetier` | Parcours guichet conserve |
| `chefEmbarquement` | Parcours boarding conserve |
| `escale_agent` / `escale_manager` | Parcours escale conserve |

## 6. Non-actions explicites

- Pas de suppression de fichier.
- Pas de suppression de route dans `AppRoutes.tsx`.
- Pas de suppression de collection Firestore.
- Pas de modification de `firestore.rules`.
- Pas de modification de logique metier de reservation, paiement, caisse, courrier ou boarding.

## 7. Verification attendue

Apres masquage :

1. `npm run build` doit passer.
2. Les menus ne doivent plus exposer les modules ERP avances.
3. Les routes existantes doivent rester declarees.
4. Les parcours Phase 1 doivent rester accessibles selon les roles existants.
