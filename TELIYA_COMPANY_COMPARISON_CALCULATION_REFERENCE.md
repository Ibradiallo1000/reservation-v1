# Teliya — Référence de calcul de comparaison

## Trajet compatible

Départ et arrivée correspondent à la même configuration, après normalisation espaces/casse/accents. La compagnie doit être active, publiée et posséder un slug.

## Départ disponible

Un créneau `weeklyTrips` actif circule le jour français de la date choisie. Une `tripInstance` de cette date enrichit ce créneau. Une instance annulée le retire. Pour aujourd’hui, les heures passées sont exclues. Aucune recherche sur une autre date n’est faite.

## Prix minimum

Minimum des prix numériques strictement positifs des offres compatibles. Le prix d’instance remplace celui du template correspondant. Sans prix fiable : `Prix indisponible`.

## Nombre et déduplication

Clé template : `companyId|weeklyTripId|date|heure`. Clé instance sans template : `companyId|instance|id`. Un créneau n’est compté qu’une fois.

## Prochain départ

Première heure normalisée `HH:mm`. Le champ est masqué sans heure valide. Le jour de circulation est calculé en UTC à midi pour éviter les changements de date ; le filtrage « déjà passé » utilise l’heure locale du navigateur, limite à confirmer lors de la Phase 7.4 tenant/timezone.

## Places

Non affichées : les holds, réservations, segments, ventes guichet et réaffectations empêchent un calcul exact dans une agrégation globale bornée.

