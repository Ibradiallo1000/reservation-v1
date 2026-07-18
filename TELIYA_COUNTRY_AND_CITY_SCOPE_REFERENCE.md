# Teliya — Référence pays et périmètre des villes

Le formulaire de création d’une compagnie écrit actuellement `pays` comme libellé libre. Les lectures historiques montrent aussi `country`, `countryName`, `countryCode`, `phoneCountryCode`, devise et timezone, mais aucun code pays canonique obligatoire et universel n’est prouvé.

Décision Phase 7.6 :

- afficher le pays public existant sur une carte partenaire lorsqu’il est présent ;
- limiter les villes d’une page tenant aux trajets de cette compagnie ;
- ne pas attribuer de pays aux anciennes compagnies ;
- ne pas coder une table pays dans la Marketplace ;
- ne pas activer de sélecteur pays tant qu’un code ISO fiable n’est pas garanti.

Migration future minimale : normaliser explicitement le pays dans l’administration, sans déduire silencieusement depuis la devise ou la timezone, puis backfill vérifié séparément.
