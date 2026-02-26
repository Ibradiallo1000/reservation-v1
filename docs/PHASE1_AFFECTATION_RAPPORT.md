# Phase 1 – Affectation Refactor & Agency Operational Alignment  
## Rapport de mise en œuvre (français)

---

## 1. Fichiers modifiés / créés

### Créés
- `src/modules/compagnie/fleet/affectationTypes.ts` — Types et constantes (AFFECTATION_STATUS, AffectationDoc, AFFECTATIONS_COLLECTION).
- `src/modules/compagnie/fleet/affectationService.ts` — Service affectations : listAffectationsByAgency, listAffectationsByCompany, getAffectation, getActiveAffectationByVehicle, getAffectationForBoarding, createAffectation, updateAffectationStatus.

### Modifiés
- **Rôles agence (retrait Chef garage)**  
  - `src/modules/agence/pages/AgencePersonnelPage.tsx` — Suppression du rôle « Chef garage » dans les selects d’ajout/édition d’équipe.  
  - `src/modules/agence/manager/ManagerTeamPage.tsx` — Retrait de `agency_fleet_controller` des libellés et des rôles assignables ; Chef garage uniquement au niveau compagnie.

- **Bannière « Période d’essai » masquée pour Chef Agence**  
  - `src/modules/agence/pages/AgenceShellPage.tsx` — `banner={null}` (plus de SubscriptionBanner).  
  - `src/modules/agence/manager/ManagerShellPage.tsx` — Idem. La bannière reste visible pour CEO et Chef Comptable (CompagnieLayout / CompanyAccountantLayout).

- **Flotte / affectation**  
  - `src/modules/compagnie/fleet/vehicleTransitions.ts` — Transitions opérationnelles : GARAGE → AFFECTE, AFFECTE → EN_TRANSIT, EN_TRANSIT → GARAGE.  
  - `src/modules/compagnie/fleet/vehiclesService.ts` — assignVehicle, confirmDepartureAffectation, confirmArrivalAffectation ; vérifications technicalStatus / operationalStatus / currentCity ; double affectation interdite ; historique statusHistory.  
  - `src/modules/agence/fleet/FleetLayout.tsx` — Libellé du menu : « Opérations » → « Exploitation ».  
  - `src/modules/agence/fleet/AgenceFleetOperationsPage.tsx` — Réécriture : chargement via listAffectationsByCompany ; 3 sections (Véhicules disponibles, Départs affectés, En transit vers moi) ; modal affectation ; confirmations départ/arrivée avec agencyId pour l’arrivée.

- **Embarquement**  
  - `src/modules/agence/embarquement/pages/AgenceEmbarquementPage.tsx` — Données véhicule / chauffeur / convoyeur lues depuis le document affectation Phase 1 (getAffectationForBoarding) ; affichage plaque, modèle, chauffeur, tél. chauffeur, convoyeur, tél. convoyeur dans la vue liste et dans la zone imprimable.

---

## 2. Schéma du document affectation

Chemin Firestore : `companies/{companyId}/agences/{agencyId}/affectations/{affectationId}`.

Structure étendue :

```ts
{
  vehicleId: string,
  vehiclePlate: string,
  vehicleModel: string,
  tripId: string,
  departureCity: string,
  arrivalCity: string,
  departureTime: string | Timestamp,

  driverName?: string,
  driverPhone?: string,
  convoyeurName?: string,
  convoyeurPhone?: string,

  status: "AFFECTE" | "DEPART_CONFIRME" | "ARRIVE",

  assignedBy: string,
  assignedAt: Timestamp,
  departureConfirmedAt?: Timestamp,
  arrivalConfirmedAt?: Timestamp
}
```

Les champs véhicule (vehiclePlate, vehicleModel) sont renseignés automatiquement à partir de la collection `vehicles` lors de la création de l’affectation.

---

## 3. Logique d’assignation implémentée

- **Assignation (Chef Agence)**  
  - Conditions : `technicalStatus === "NORMAL"`, `operationalStatus === "GARAGE"`, `currentCity === agency.city`.  
  - Vérification d’absence d’affectation active pour le véhicule (getActiveAffectationByVehicle sur toutes les agences).  
  - À la confirmation : `operationalStatus = "AFFECTE"`, création du document affectation, push dans `vehicle.statusHistory`.

- **Confirmer départ**  
  - Visible si `affectation.status === "AFFECTE"` et véhicule en AFFECTE.  
  - À la confirmation : `operationalStatus = "EN_TRANSIT"`, `destinationCity = arrivalCity`, `affectation.status = "DEPART_CONFIRME"`, `departureConfirmedAt`, historique.

- **Confirmer arrivée (agence de destination)**  
  - Visible si `affectation.status === "DEPART_CONFIRME"`, véhicule `EN_TRANSIT`, `destinationCity === agency.city`.  
  - L’affectation peut appartenir à une autre agence (celle du départ) ; l’agence de destination appelle `confirmArrivalAffectation(companyId, affectationAgencyId, affectationId, agencyCity, ...)`.  
  - À la confirmation : `operationalStatus = "GARAGE"`, `currentCity = agency.city`, `destinationCity = null`, `affectation.status = "ARRIVE"`, `arrivalConfirmedAt`, historique.

---

## 4. Règles de blocage implémentées

- **Assignation interdite** si :  
  - `operationalStatus` ∈ { EN_TRANSIT, MAINTENANCE, ACCIDENTE } ou déjà AFFECTE,  
  - ou `technicalStatus !== "NORMAL"`,  
  - ou `currentCity !== agency.city`,  
  - ou véhicule déjà concerné par une affectation active (AFFECTE ou DEPART_CONFIRME).

- **Confirmation départ** : refusée si `technicalStatus !== "NORMAL"` (vérification côté véhicule).

- **Confirmation arrivée** : refusée si véhicule pas en EN_TRANSIT ou si `destinationCity !== agency.city`.

---

## 5. Intégration boarding confirmée

- **Source des données** : document affectation Phase 1, via `getAffectationForBoarding(companyId, agencyId, departureCity, arrivalCity, dateStr, timeStr)` qui renvoie l’affectation active (AFFECTE ou DEPART_CONFIRME) correspondant au trajet (départ, arrivée, date, heure).

- **Vue liste** : cartes « Véhicule / Plaque », « Chauffeur » (nom + tél.), « Convoyeur » (nom + tél.) remplies depuis l’affectation (vehiclePlate, vehicleModel, driverName, driverPhone, convoyeurName, convoyeurPhone).

- **Export imprimable** : même bloc « Méta » (Véhicule/Plaque, Chauffeur + tél., Convoyeur + tél., Totaux) alimenté par les mêmes champs ; présent dans la zone `#print-area` utilisée pour l’impression.

- **Compatibilité** : BoardingScanPage utilise AgenceEmbarquementPage ; liste et impression bénéficient donc des mêmes données affectation.

---

## 6. UI agence mise à jour

- **Menu** : entrée « Opérations (départ/arrivée) » renommée en **« Exploitation »** (chemin inchangé : `/agence/fleet/operations`).

- **Page Exploitation** :  
  - **Section 1 – Véhicules disponibles** : filtre `operationalStatus = GARAGE`, `technicalStatus = NORMAL`, `currentCity = agency.city`, véhicule non présent dans une affectation active ; bouton « Affecter » ouvrant le modal (arrivalCity requis, optionnels : departureCity, tripId, departureTime, chauffeur/convoyeur).  
  - **Section 2 – Départs affectés** : affectations de cette agence avec `status = AFFECTE` ; bouton « Confirmer départ ».  
  - **Section 3 – En transit vers moi** : affectations (toutes agences) avec `status = DEPART_CONFIRME` et `arrivalCity = agency.city` ; bouton « Confirmer arrivée » (avec passage de l’agencyId propriétaire du document affectation).

---

## 7. Nettoyage des rôles confirmé

- **Au niveau agence (« Équipe »)** : seuls rôles disponibles — Guichetier, Contrôleur, Chef embarquement, Comptable (si existant). **Chef garage retiré** (plus proposé dans AgencePersonnelPage ni dans ManagerTeamPage).

- **Chef garage** : existe **uniquement au niveau compagnie** (gestion du technicalStatus des véhicules ; pas d’affectation ni de confirmation départ/arrivée).

- **Chef Agence** : peut affecter, confirmer départ et confirmer arrivée ; ne peut pas modifier le technicalStatus.

- **CEO** : vue lecture seule (aucune modification de logique métier dans le CEO Cockpit demandée ; blocs en lecture seule respectés).

---

## 8. Confirmations demandées

| Point | Statut |
|-------|--------|
| Un véhicule ne peut pas être affecté deux fois | Oui. `getActiveAffectationByVehicle` est appelé avant toute assignation ; si une affectation active existe pour le véhicule, l’assignation est refusée. |
| Confirmation départ fonctionne | Oui. Passage à EN_TRANSIT, destinationCity, mise à jour affectation DEPART_CONFIRME et historique. |
| Confirmation arrivée fonctionne | Oui. Passage à GARAGE, currentCity, destinationCity = null, affectation ARRIVE, avec utilisation de l’agencyId du document affectation pour l’agence de destination. |
| Boarding affiche les bonnes données | Oui. Données véhicule (plaque, modèle), chauffeur (nom, tél.), convoyeur (nom, tél.) issues du document affectation, en liste et à l’impression. |
| Chef garage retiré du niveau agence | Oui. Rôle supprimé des équipes agence (AgencePersonnelPage, ManagerTeamPage). |

---

## 9. Historique (statusHistory)

Chaque changement d’état opérationnel du véhicule (assignation, confirmation départ, confirmation arrivée) enregistre une entrée dans `vehicle.statusHistory` (champ, ancienne valeur, nouvelle valeur, userId, role, timestamp). Aucune mise à jour silencieuse : les transitions passent par vehiclesService avec push dans statusHistory.

---

## 10. Contraintes respectées

- Aucune modification des modules financiers.  
- Aucune modification de la logique CEO Cockpit (sauf blocs en lecture seule).  
- Structure Firestore existante préservée ; extension des documents affectation et véhicule sans rupture.  
- Phase 2 (remplacement incident, rentabilité, automatisation) non implémentée.
