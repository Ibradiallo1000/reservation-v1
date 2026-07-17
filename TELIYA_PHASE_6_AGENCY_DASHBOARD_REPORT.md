# TELIYA — Rapport Phase 6

## Décision d’architecture

`/agence/activite` reste la route canonique « Aujourd’hui ». Les aliases `/agence/dashboard`, `/agence/operations` et la redirection de `/agence` sont conservés.

Le composant historique mélangeait synthèse, panneaux modaux et libellés orientés action. Il n’a pas été modifié ni supprimé. Une nouvelle vue `AgencyTodayPage` consomme le même hook de lecture et les mêmes calculs, mais n’expose que des KPI, états, listes et liens.

## Sécurité et responsabilités

- vérification rôle/capacité/contexte avant toute lecture ;
- filtre strict par `companyId` et `agencyId` existants ;
- superviseur limité aux mêmes capacités explicitement confirmées, sans liens guichet, embarquement ou courrier ;
- aucune validation de départ, mutation, vente ou action de module gelé ;
- synthèse financière uniquement sous `agency.cash.read`.
- aucun état d’embarquement n’est déduit des départs : la donnée est marquée indisponible tant qu’une source distincte n’est pas prouvée.

## Validation fonctionnelle statique

Les sélecteurs couvrent route canonique, aliases, contextes manquants, rôle interdit, départs multiples/retardés/confirmés et accès rapides. La recette avec comptes réels n’est pas possible dans l’environnement actuel.
