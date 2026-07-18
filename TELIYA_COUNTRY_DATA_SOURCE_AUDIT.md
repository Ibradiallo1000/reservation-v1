# Audit des sources pays

| Champ | Chemins observés | Type/valeurs | Fiabilité | Consommateurs | Décision Phase 8 |
|---|---|---|---|---|---|
| `countryCode` | `companies` (nouveau), réglages paiements ponctuels | ISO alpha-2 | canonique lorsqu’il est reconnu | Marketplace, formulaires, diagnostic | source prioritaire |
| `isoCountryCode` | compatibilité potentielle | texte | historique | adaptateur | lecture seule |
| `pays` | compagnies, agences, billets/rapports et réglages | libellé libre ou sélection historique | variable | affichage, téléphone, paiements | conservé, normalisé en lecture |
| `country`, `countryName` | projections publiques/configurations | libellé | variable | Marketplace | fallback lecture |
| `devise`/`currency` | compagnies et paiements | code monnaie | indice ambigu | prix, affichage, paiement | jamais migré automatiquement |
| `timezone` | agences/compagnies | IANA | indice contextuel | journées opérationnelles | priorité agence, puis compagnie; aucun remplacement |
| `phoneCountryCode`/`phonePrefix` | compagnie, paiement, téléphone | préfixe | indice ambigu | formulaires | valeur par défaut seulement |
| `locale` | configurations ponctuelles | BCP 47 | faible | affichage | métadonnée du référentiel |

Le formulaire de création contenait déjà 16 pays codés en dur. Deux pages de paiement et les règles téléphoniques maintiennent encore des tables historiques séparées : elles sont documentées comme dette, sans réécriture risquée dans cette phase. Les villes et trajets ne possèdent pas partout un pays d’origine/destination fiable.
