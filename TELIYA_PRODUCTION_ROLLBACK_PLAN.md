# Plan de rollback production

| Domaine | Déclencheur | Retour arrière | Preuve requise |
|---|---|---|---|
| Frontend | erreur critique après publication | republier l’artefact/commit stable précédent | hash artefact, smoke tests |
| `countryCode` | pays erroné | restaurer chaque ancienne valeur depuis le backup horodaté et vérifié SHA-256 | journal avant/après, second dry-run |
| Domaine | DNS/TLS/résolution cassés | restaurer les entrées/configurations précédentes | export DNS et certificat antérieurs |
| PWA | cache ou mise à jour dangereux | republier le SW stable, augmenter le cache id et vérifier l’activation | test navigateur propre + existant |
| Variables | environnement incorrect | restaurer le snapshot des noms/valeurs dans le gestionnaire sécurisé | comparaison sans exposer les secrets |

Le rollback pays doit distinguer champ absent et valeur présente. Il ne doit toucher aucun ancien champ, trajet, réservation ou paiement. Aucun rollback n’a été exécuté en Phase 9.
