# TELIYA — Audit performance dashboards

## Plateforme

- trois listeners existants : `companies`, `adminSettings/plans`, `subscriptionRequests` ;
- aucune requête ajoutée ;
- tous les KPI et classements dérivent d’un sélecteur pur mémoïsé ;
- six compagnies maximum dans la liste principale et cinq dans la liste récente ;
- aucun graphique et aucune bibliothèque supplémentaire.

## CEO

- une lecture des métadonnées agences par changement de période ;
- chargements consolidés parallèles via les quatre services existants ;
- fallback activity logs limité à 31 jours ;
- sept contrôles journaliers historiques pouvant produire des lectures supplémentaires ;
- `RevenueMiniChart` réutilisé, aucune nouvelle dépendance Recharts ;
- calculs de présentation déjà mémoïsés.

Le build garde un chunk vendor d’environ 4,16 MB non compressé (environ 1,18 MB gzip). Cette dette globale n’a pas été traitée car elle dépasse le périmètre. L’optimisation prioritaire future est de mutualiser les contrôles journaliers CEO dans une source agrégée existante, après preuve d’équivalence métier.

