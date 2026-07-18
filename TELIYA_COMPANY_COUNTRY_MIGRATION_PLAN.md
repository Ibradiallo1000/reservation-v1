# Plan de migration du pays compagnie

1. Exporter/sauvegarder les documents `companies` de staging avec les procédures Firebase autorisées.
2. Produire le dry-run avec `buildCountryBackfillPlan` et le diagnostic `diagnoseCompanyCountry`.
3. Faire examiner chaque proposition et chaque contradiction par un administrateur humain.
4. Corriger manuellement les valeurs ambiguës; ne jamais déduire du nom de compagnie seul.
5. Appliquer sur staging uniquement des patches `{ countryCode: "XX" }` validés.
6. Relancer le plan : toutes les lignes appliquées doivent devenir `already-canonical`.
7. Recetter Marketplace, tenant direct, domaines, réservation, paiement et billet sans modifier leurs écritures.
8. Préparer une autorisation et une sauvegarde production distinctes; aucune exécution production en Phase 8.

Sources de confirmation, par ordre : champ canonique, libellé historique non ambigu, pays agences concordants, puis indices timezone/devise/téléphone/paiement examinés humainement. Ces indices seuls ne déclenchent aucune écriture.
