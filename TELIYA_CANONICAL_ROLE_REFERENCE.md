# TELIYA — Référence canonique des rôles frontend

Cette référence décrit la compatibilité frontend. Elle ne modifie ni les profils Firestore, ni les claims, ni les Rules.

| Rôle canonique | Alias confirmés | Responsabilité / espace | Contexte | Restrictions / statut |
|---|---|---|---|---|
| `admin_platforme` | — | administration Plateforme | aucun | confirmé |
| `admin_compagnie` | `admin_company`, `company_ceo` | command center et administration compagnie | compagnie | aucune validation opérationnelle ni mutation comptable ; confirmé |
| `financial_director` | — | finance réseau | compagnie | pas d’opération agence ; confirmé |
| `company_accountant` | — | comptabilité compagnie | compagnie | pas de guichet/embarquement ; confirmé |
| `operator_digital` | — | paiements et réservations en ligne | compagnie | aucun autre espace ; confirmé |
| `responsable_logistique` | `chef_garage`, `chefgarage` | logistique compagnie | compagnie | feature désactivée ; différé |
| `chefAgence` | `chefagence` | supervision agence | compagnie + agence | ni guichet, ni mutation/validation comptable ; confirmé |
| `superviseur` | — | supervision agence minimale observée | compagnie + agence | aucune capacité nouvelle ; ambigu contrôlé |
| `agentCourrier` | `agentcourrier`, `agent_courrier` | courrier | compagnie + agence | courrier uniquement ; confirmé |
| `agency_accountant` | — | comptabilité agence | compagnie + agence | workflow gelé conservé ; confirmé |
| `guichetier` | — | guichet | compagnie + agence | vente uniquement ; confirmé |
| `chefEmbarquement` | `chefembarquement`, `agency_boarding_officer`, `embarquement` | embarquement | compagnie + agence | embarquement uniquement ; confirmé |
| `agency_fleet_controller` | — | flotte agence | compagnie + agence | feature désactivée ; différé |
| `escale_agent` | — | opérations escale | compagnie + agence | confirmé |
| `escale_manager` | — | supervision escale | compagnie + agence | confirmé |

## Valeurs non normalisées

| Valeur | Décision | Motif |
|---|---|---|
| `comptable` | ambiguë | sa résolution dépend historiquement de `agencyId`; la fonction pure retourne `null` |
| `gestionnaire` | non prouvée | présente dans une constante partielle, sans parcours autorisé confirmé |
| `support` | non prouvée | présente dans une constante partielle, sans parcours autorisé confirmé |
| toute autre valeur | inconnue | aucun fallback permissif |

