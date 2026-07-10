# TELIYA - Procedure Git Snapshot Stable et Rollback

Date de creation: 2026-07-10  
Phase: 1.1 - Creation du snapshot stable et securisation Git minimale

## 1. Reference stable officielle

Commit stable audite:

```text
7ed12e2198ec86c6e1b1dd7064767f9a210442d6
```

Message du commit:

```text
correction de validation de session caisse par le comptable agence
```

Tag annote local:

```text
stable-phase0-2026-07-10
```

Branche d'infrastructure locale:

```text
infra/phase-1.1-snapshot
```

## 2. Verifier le snapshot

Verifier le commit pointe par le tag:

```bash
git rev-list -n 1 stable-phase0-2026-07-10
```

Resultat attendu:

```text
7ed12e2198ec86c6e1b1dd7064767f9a210442d6
```

Verifier que le tag est annote:

```bash
git cat-file -t stable-phase0-2026-07-10
```

Resultat attendu:

```text
tag
```

Afficher le detail du tag:

```bash
git show --no-patch --format=fuller stable-phase0-2026-07-10
```

## 3. Pousser le tag vers GitHub

Commande:

```bash
git push origin stable-phase0-2026-07-10
```

Verification apres push:

```bash
git ls-remote --tags origin stable-phase0-2026-07-10
```

Le hash du tag distant doit exister. Pour verifier le commit cible localement:

```bash
git rev-list -n 1 stable-phase0-2026-07-10
```

## 4. Revenir exactement au snapshot stable

### Consultation seule

Utiliser cette commande pour inspecter l'etat stable sans modifier une branche existante:

```bash
git switch --detach stable-phase0-2026-07-10
```

Revenir ensuite a la branche de travail:

```bash
git switch infra/phase-1.1-snapshot
```

ou:

```bash
git switch main
```

### Creer une branche de restauration

Commande recommandee pour restaurer sans toucher directement `main`:

```bash
git switch -c restore/stable-phase0-2026-07-10 stable-phase0-2026-07-10
```

Cette branche permet de tester, comparer et preparer une restauration propre.

### Restaurer `main` apres validation humaine

Ne pas executer automatiquement. Procedure uniquement apres validation explicite:

```bash
git switch main
git merge --ff-only stable-phase0-2026-07-10
```

Si `main` a avance apres le snapshot, un retour arriere de production doit passer par une branche de restauration et une Pull Request documentee. Ne pas utiliser `git reset --hard` sans decision explicite.

## 5. Verification avant toute Phase 1 ulterieure

Avant toute modification d'infrastructure:

```bash
git status --short --branch
git tag --list
git rev-list -n 1 stable-phase0-2026-07-10
```

Le commit attendu doit rester:

```text
7ed12e2198ec86c6e1b1dd7064767f9a210442d6
```

## 6. Interdictions associees au snapshot

Le tag `stable-phase0-2026-07-10` ne doit pas etre deplace.

Ne pas executer:

```bash
git tag -f stable-phase0-2026-07-10
git push --force origin stable-phase0-2026-07-10
```

Ne pas utiliser ce snapshot pour declencher un deploiement Firebase sans procedure separee.

## 7. Etat Firebase

Aucune commande Firebase n'a ete executee pendant la creation du snapshot.

Aucun deploiement n'a ete effectue:

- pas de `firebase deploy`;
- pas de deploiement Firestore Rules;
- pas de deploiement Firestore Indexes;
- pas de deploiement Cloud Functions;
- aucune ecriture Firestore.
