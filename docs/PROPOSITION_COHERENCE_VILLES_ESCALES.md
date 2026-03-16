# Proposition : Cohérence des villes (routes, stops, escales)

## Problème

Aujourd’hui, le nom de **ville** peut être saisi à deux endroits différents :

1. **Réseau / Logistique (Routes)** : quand on ajoute un **stop** (escale) à une route, on saisit un nom de **ville** (ex. Bougouni).
2. **Compagnie → Agences** : quand on crée une **agence de type escale**, on saisit une **ville** (et on choisit une route + un stop).

Risque : des incohérences (Bougouni vs bougouni vs BOUGOUNI), ou une ville d’agence qui ne correspond pas au stop choisi. On ne sait pas non plus quoi créer en premier (l’escale agence ou les stops sur la route).

---

## Principe proposé : une seule source de vérité pour la ville

- **Sur le réseau** : la liste des villes “officielles” sur une route = les **stops** de cette route (champ `city` de chaque stop).
- **Pour une agence escale** : elle est liée à **un** stop (route + ordre). Sa **ville** doit être **celle du stop**, pas une saisie libre.

Donc : **on définit d’abord les villes dans les routes (stops), puis on crée les escales en choisissant un stop** ; la ville de l’escale est dérivée du stop.

---

## Ordre recommandé des opérations

### À faire en premier : Routes et stops (espace Logistique / Réseau)

1. Aller dans **Logistics → Routes** (ou “Routes réseau”).
2. Créer la **route** (ex. Bamako → Sikasso).
3. Ajouter les **stops** (escales) avec pour chaque stop :
   - **ville** (ex. Bamako, Bougouni, Koutiala, Sikasso),
   - ordre, distance, etc.

Les noms de ville sont normalisés (ex. première lettre en majuscule). À ce stade, on a défini **quelles villes existent sur la route** et dans quel ordre.

### Ensuite : Créer l’agence “point d’escale” (Compagnie → Agences)

1. Aller dans **Compagnie → Agences → Ajouter une agence**.
2. Choisir le type **Escale**.
3. Choisir la **route** (ex. Bamako → Sikasso).
4. Choisir l’**escale (stop)** dans la liste (ex. “2 Bougouni”).
5. **Ne plus saisir la ville à la main** : la **ville de l’agence** est **automatiquement celle du stop** sélectionné (ex. “Bougouni”). Soit le champ “Ville” est pré-rempli et verrouillé pour une escale, soit il est caché et renseigné à l’enregistrement à partir du stop.

Résultat : même ville partout (route → stop → agence escale), pas de doublon ni de faute de frappe.

---

## Règle proposée

| Contexte | Qui définit la ville ? | Rôle du formulaire |
|----------|------------------------|--------------------|
| **Route / stops** (Logistique) | Saisie du nom de ville pour chaque stop. Normalisation appliquée. | Source de vérité pour “quelle ville à quel ordre” sur la route. |
| **Agence principale** | Saisie libre de la ville (comme aujourd’hui). | Aucun lien avec une route. |
| **Agence escale** | **Dérivée du stop** : ville = `stop.city` du stop sélectionné. | Ne pas demander de saisie de ville : soit champ pré-rempli et en lecture seule, soit champ absent et rempli à l’enregistrement. |

En résumé : **on crée d’abord la route et les stops (avec les noms de ville), puis on crée l’escale en choisissant un stop ; la ville de l’escale vient toujours du stop.**

---

## Modifications à prévoir (côté interface, après validation)

1. **Création / édition d’une agence escale**
   - Dès qu’un **stop** est sélectionné (route + escale sur la route) :
     - soit **verrouiller** le champ “Ville” et le remplir avec `stop.city` ;
     - soit **masquer** le champ “Ville” et, à l’enregistrement, écrire dans l’agence la ville du stop sélectionné.
   - Objectif : plus de saisie manuelle de ville pour une escale, donc plus d’écart avec le stop.

2. **Cohérence à l’affichage**
   - Partout où on affiche “ville de l’escale”, utiliser la même valeur (celle du stop si agence escale).

3. **Optionnel**
   - Si une agence escale existe déjà avec une ville saisie à la main, on peut proposer un recalcul “ville = stop.city” à l’édition pour aligner les données.

---

## Résumé en une phrase

**Créer d’abord les routes et leurs stops (avec les noms de ville) dans l’espace Réseau / Logistique ; puis créer les escales (agences) en choisissant un stop — la ville de l’escale étant toujours prise du stop, sans saisie libre, pour garder une seule source de vérité et éviter les erreurs.**

Si cette proposition vous convient, on pourra passer à la phase codage (verrouillage ou masquage du champ ville + remplissage automatique à partir du stop).
