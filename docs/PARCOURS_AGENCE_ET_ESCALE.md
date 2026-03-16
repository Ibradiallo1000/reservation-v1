# Parcours : Ajouter une agence vs Ajouter une escale

Ce document décrit comment la compagnie ajoute une **agence** ou un **point d’escale**, et comment le responsable (chef d’agence ou chef d’escale) ajoute **son équipe**.

---

## 1. Où se trouve le menu « Agences » ?

- La compagnie (admin_compagnie) se connecte et accède à l’espace **Compagnie**.
- Dans le menu de gauche (layout compagnie), la section **Structure** ou **Agences** mène à la page **Agences** :  
  **Compagnie → Agences**  
  (chemin typique : `/compagnie/:companyId/agences` — nom du lien peut être « Agences » ou « Structure » selon le layout).
- Ce n’est pas dans « Paramètres » (Configuration) : les agences et les escales se gèrent depuis cette page **Agences**.

---

## 2. Ajouter une agence (principale)

1. Aller dans **Compagnie → Agences**.
2. Cliquer sur **« Ajouter une agence »** (ou équivalent).
3. Remplir le formulaire :
   - **Type d’agence** : **Principale**.
   - Nom de l’agence, ville, pays, gérant (nom, email, téléphone), etc.
4. Enregistrer.
5. La compagnie reçoit un **lien d’activation** pour le gérant. Ce gérant est invité avec le rôle **Chef d’agence** (chefAgence).
6. Le **chef d’agence** :
   - active son compte via le lien ;
   - est redirigé vers le **tableau de bord agence** (`/agence/dashboard`) ;
   - peut aller dans **Équipe** (`/agence/team`) pour **inviter son personnel** : guichetiers, comptable, chef embarquement, agents courrier, etc.

Résumé : **Compagnie crée l’agence → Premier utilisateur = Chef d’agence → Il ajoute son équipe dans Équipe.**

---

## 3. Ajouter un point d’escale (escale)

1. Aller dans **Compagnie → Agences** (même entrée que pour les agences).
2. Cliquer sur **« Ajouter une agence »**.
3. Dans le formulaire :
   - **Type d’agence** : **Escale**.
   - **Route (escale)** : choisir une route existante (ex. Bamako → Sikasso).
   - **Escale (stop) sur la route** : choisir dans la liste (ex. « 2 Bougouni »). La liste est chargée automatiquement à partir des stops de la route.
   - Renseigner **ville**, **nom du gérant**, **email**, **téléphone**, etc. (la ville peut être pré-remplie par le stop choisi).
4. Enregistrer.
5. La compagnie reçoit un **lien d’activation** pour le gérant. Ce gérant est invité avec le rôle **Chef d’escale** (escale_manager).
6. Le **chef d’escale** :
   - active son compte via le lien ;
   - est redirigé vers le **tableau de bord escale** (`/agence/escale`) : bus du jour, passage à l’escale, places restantes, caisse, bouton « Vendre billet » ;
   - peut cliquer sur **« Équipe »** (lien en haut) pour aller sur la page **Équipe** (`/agence/team`) et **inviter son personnel** : **Agent d’escale** (escale_agent), ou un autre **Chef d’escale** (escale_manager).

Résumé : **Compagnie crée l’escale (agence type escale + route + stop) → Premier utilisateur = Chef d’escale → Il a son interface escale et ajoute son équipe dans Équipe.**

---

## 4. Comparaison

| Étape | Agence principale | Escale |
|--------|-------------------|--------|
| Où créer ? | Compagnie → Agences → Ajouter une agence | Compagnie → Agences → Ajouter une agence |
| Type choisi | Principale | Escale (+ route + stop) |
| Premier rôle invité | Chef d’agence (chefAgence) | Chef d’escale (escale_manager) |
| Interface du responsable | Tableau de bord agence (`/agence/dashboard`) | Tableau de bord escale (`/agence/escale`) |
| Où ajouter l’équipe ? | Équipe (`/agence/team`) | Équipe (`/agence/team`) — lien « Équipe » sur le tableau de bord escale |
| Rôles qu’il peut inviter | Guichetier, Comptable, Chef embarquement, Agent courrier, etc. | Agent d’escale, Chef d’escale (et les autres rôles si agence escale) |

Les deux parcours sont alignés : la compagnie crée le **point** (agence ou escale), le **responsable** (chef d’agence ou chef d’escale) a **sa propre interface** et gère **son équipe** depuis la même page **Équipe**, avec les rôles adaptés (agence vs escale).
