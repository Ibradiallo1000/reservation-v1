# TELIYA — Écarts rôles, routes et sécurité — Phase 3

## Portée

Ce registre sépare navigation visuelle et autorisation. La normalisation Phase 3 reconnaît uniquement `admin_company → admin_compagnie` et `chefagence → chefAgence` pour filtrer/présenter les menus. Elle ne modifie ni guards, claims, données utilisateur ni Rules.

| ID | Espace/route | Type d'écart | Preuve | Correction Phase 3 | Correction différée |
|---|---|---|---|---|---|
| SEC-01 | `/agence/treasury/new-*` | guard / Rules potentielle | Routes sous le shell agence large, contrairement à `/agence/comptabilite/treasury/*`. | Aucun lien ajouté ; route conservée. | Audit action/service/Rules puis canonisation comptable. |
| SEC-02 | CEO dépenses/approbations | responsabilité et navigation | `/payment-approvals`, aliases dépenses et ancien compteur `pending_ceo`. | Retrait de ces concepts de la navigation CEO et suppression du listener de badge ; routes/guards inchangés. | Décision métier et audit Rules avant dépréciation. |
| SEC-03 | `/debug-auth` | diagnostic public | Route montée sans guard en production. | Route et import disponibles uniquement avec `import.meta.env.DEV`. | Aucun si la vérification build confirme l'absence. |
| SEC-04 | rôles compagnie | rôle | `admin_company` et `admin_compagnie` coexistent. | Alias visuel documenté et testé. | Registre canonique global et migration de données séparée. |
| SEC-05 | chef d'agence | rôle | `chefAgence` et `chefagence` coexistent. | Alias visuel documenté et testé. | Normalisation guards/Rules séparée. |
| SEC-06 | `superviseur` | rôle/capacité | Shell large, capacités précises non uniformes. | Ancienne navigation conservée ; aucune destination nouvelle. | Matrice action par action. |
| SEC-07 | contrôleur flotte | feature/landing | Landing `/agence/fleet` malgré `ENABLE_FLEET=false`. | Flotte absente des nouvelles configurations. | État indisponible explicite ou changement de landing après décision produit. |
| SEC-08 | comptabilité agence | guard/navigation | Route principale accepte plusieurs rôles historiques et l'écran possède son propre cadre. | Aucun guard ni écran interne modifié. | Clarifier accès lecture/action avec Rules avant nouveau shell. |
| SEC-09 | Escale Équipe | shell | `/agence/team` force `ManagerShell`. | Ajout canonique `/agence/escale/equipe` sous le guard Escale ; ancien chemin conservé. | Déprécier l'ancien lien après mesure d'usage. |
| SEC-10 | admin plateforme dans compagnie | contexte tenant | Inspection autorisée par routes existantes. | Configurations reconnaissent ce rôle sans modifier l'accès. | Vérifier Rules et journalisation de l'impersonation. |

## Matrice interne de décision

| Route/groupe | Rôles acceptés observés | Shell avant | Shell cible Phase 3 | Risque | Action |
|---|---|---|---|---|---|
| `/admin/*` | `admin_platforme` | `AdminSidebarLayout` | même shell, config typée | faible | consolidé |
| `/compagnie/:id/*` | admins compagnie/plateforme selon route | `CompagnieLayout` | Command Center | approbations CEO | menu restreint à la supervision |
| `/compagnie/:id/accounting/*` | comptables/directeur/admins | `CompanyAccountantLayout` | Comptabilité compagnie | aliases finance | config canonique |
| `/agence/*` | shell agence large | `ManagerShellPage` | Supervision agence | guards hétérogènes | chef migré, autres conservés |
| `/agence/comptabilite*` | matrice historique | écran autonome | module gelé | critique métier | intact |
| `/agence/guichet` | guichet/chef/escale/admin | poste autonome | opérations spécialisées | module gelé | intact |
| `/agence/boarding/*` | boarding/chef/escale/admin | `BoardingLayout` | même shell | tabs/query | config typée |
| `/agence/courrier/*` | courrier/chef/admin | `CourierLayout` | même shell spécialisé | module gelé | intact |
| `/agence/escale/*` | escale/chef/admin | `EscaleLayout` | shell Escale unique | double shell Équipe | route canonique ajoutée |

## Garantie

Le filtrage de navigation constitue uniquement une réduction d'affichage. Il n'est jamais utilisé comme guard et n'accorde aucune permission.
