# Teliya — Audit de visibilité des partenaires

| Condition | Attendu | Filtre | Effet/correction |
|---|---|---|---|
| `publicPageEnabled` | `true` | requête publique | inchangé |
| `status` | `actif` | projection locale stricte | inchangé |
| nom et slug | non vides | projection locale | inchangé |
| trajet actif | facultatif pour partenaire | compteur seulement | partenaire sans trajet conservé |
| trajet recherché | obligatoire dans `/resultats` | agrégateur de comparaison | strict, inchangé |
| limite compagnies | 24 auparavant | 100 documents publics | disparition par fenêtre réduite corrigée |
| requête | deux `where` auparavant | un `where`, statut filtré en mémoire | dépendance à l’index composé retirée |
| aliases trajets | seulement `departure/arrival` | quatre familles historiques | villes/trajets canoniques restaurés |

La compagnie réelle ne peut pas être diagnostiquée champ par champ sans accès à un environnement Firebase de test autorisé. L’outil DEV expose uniquement les volumes et limites, jamais les identifiants.
