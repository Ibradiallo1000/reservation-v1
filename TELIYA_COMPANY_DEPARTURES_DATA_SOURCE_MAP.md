# Teliya — Sources des départs compagnie

| Champ | Source | Priorité/filtre | Fallback | Confiance | Limitation |
|---|---|---|---|---|---|
| identité | compagnie résolue par `RouteResolver` | slug public, page et plan actifs | aucun | élevée | résolution canonique via alias existant |
| date/OD | URL `from/to/date`, aliases `departure/arrival` | validation avant service | aucun | élevée | date limitée à 60 jours par service existant |
| horaire | instance puis template actif | jour réel, heure future dans timezone agence | aucun | élevée | instance-only legacy sans timezone explicite |
| prix | instance positive puis template positif | jamais de zéro affiché | Prix indisponible | élevée | frais non reconstruits |
| disponibilité | `tripInstanceRemainingFromDoc` moins holds existants | service public existant | À vérifier | élevée si numérique | service masque déjà les départs sans place |
| agence | `agencyId` nécessaire au handoff | non rendu | aucun | technique | nom public absent du contrat courant |

