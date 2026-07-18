# Validation de sécurité publique

`npm run test:rules` réussit sur `demo-teliya-local` avec les Rules actuelles. La CLI signale des refus attendus et des limites d’évaluation dans ses logs, mais le runner termine avec succès. Aucun fichier Rules ou index n’a été modifié.

La garde frontend bloque localhost → production sans dérogation explicite. Le script de migration refuse tout projet différent de `teliya-staging`, exige des credentials explicites et ne contient aucun fallback production. Le backup exclut les champs sensibles et l’application ne produit que `{countryCode}`.

Les lectures/écritures réelles staging, données passager, finance, comptes marchands et réservations tierces n’ont pas pu être retestées contre le backend distant. Ce contrôle reste bloquant.
