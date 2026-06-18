# BOARDING_FINAL_UI_REVIEW (audit produit UI — Phase 1)

> Audit critique de `docs/BOARDING_FINAL_UI_SPEC.md` uniquement (cohérence produit/métier). Aucun audit code, aucune relecture Firestore.

## 0) Résumé exécutif
Le document propose un flux opérationnel **réaliste** et **réducteur** pour un Chef d’embarquement :
- départ du jour → ouverture → liste + impression → scan → statuts → clôture → départ,
- historique léger en complément.

Cependant, il faut corriger 2 points de cohérence métier et 3 points UX opérationnels pour éviter des blocages en utilisation réelle.

**Conclusion : B = corrections nécessaires avant implémentation.**

---

## 1) Utilisabilité réelle en agence de transport
### 1.1 Oui sur le principe
- Le flux “ouvrir un départ” protège contre une mauvaise opération.
- La priorité scan et le feedback immédiat (succès/erreur + beep) sont adaptés terrain.
- Le fait que l’interface n’expose pas `tripAssignments`/flotte/logistique réduit fortement la charge cognitive.

### 1.2 Points qui peuvent bloquer en conditions réelles
1) **Impression** : le document ne rend pas explicite la règle “quand imprimer” (avant scan ? après certains scans ?). Un chef peut avoir besoin d’imprimer **avant** ouverture réelle.
2) **Reports** : “reporté = clôture” est simplificateur. En pratique, les absents reportés peuvent exiger une compréhension claire : le chef doit savoir ce que “reporté” signifie *dans le processus* (nouveau départ). Le document utilise “reporté = clôture” sans expliquer “sur quel départ ça reporte”.
3) **Historique** : “boardingLogs” est mentionné, mais pas de stratégie de consultation *pendant* l’opération (historique utile après coup vs pendant le scan).

---

## 2) Travail toute une journée avec cette interface
### 2.1 Possible
- Menu à 2 entrées (Départs / Historique) est léger.
- “Ouvrir un départ” + écran scan réduit le temps d’apprentissage.

### 2.2 Risque d’usure / surcharge
- L’écran principal cumule KPI + carte + historique récent : sur un poste réel (téléphone/tablette), la “Section 4” (historique récent) peut distraire le chef pendant une opération longue.
- Le document demande une recherche dans l’historique ; en pratique, l’historique complet sera peu utilisé “toute la journée” si les workflows de correction n’y sont pas guidés.

---

## 3) Opérations métier importantes manquantes encore
Sans auditer le code, on peut constater des manques métier probables au regard du flux scan/embarquement.

### Manques à clarifier/ajouter dans l’UI spec
1) **Revenir à la liste des départs sans casser l’opération**
   - Besoin réel : quand un départ est terminé (clôturé) → retourner aux “Départs du jour”.
2) **Indicateur d’état du départ**
   - “Planifié / En cours / Clôturé” est mentionné en carte, mais dans l’écran scan il manque un état visible et persistent (ex. barre “Mode : Clôturé / Scan désactivé”).
3) **Gestion des erreurs scan**
   - On a “feedback overlay”, mais pas de guide : que faire après une erreur (ex. “billet non valide”, “capacité atteinte”, “déjà embarqué”).
4) **Règle d’accès impression**
   - Le document dit “visible seulement si chef agence”, mais ne décrit pas le comportement si le chef demande l’impression (message explicite / bouton absent / lecture seule).

---

## 4) Écrans inutiles ou surchargés
### 4.1 Surcharge potentielle : “Historique récent” sur l’écran principal
- En opération, la principale surcharge vient de “trop d’infos en même temps”.
- Recommandation : limiter l’historique récent à 3 items ou le rendre collapsible.

### 4.2 Écran “Ouvrir un départ”
- Très court et utile, mais doit inclure un rappel : “impression possible maintenant” et “scan prêt”.

---

## 5) Éléments risquant de compliquer inutilement l'exploitation
1) **“Historique récent”** : peut distraire.
2) **“Reporté = clôture”** : simplification qui peut être comprise comme un simple état et pas comme une reprogrammation vers un nouveau départ.
3) **Champs optionnels non définis** : “téléphone optionnel”, “canal optionnel” → risque d’incohérence entre équipes.

---

## 6) Déplacer en Phase 2
### Phase 2 (probable)
- “Activité live” (déjà optionnelle dans le menu)
- Recherche avancée dans historique (si nécessaire)
- Badges “progression” fins (si la carte suffit)

---

## 7) Éléments à rendre obligatoires dès la Phase 1
### Obligatoires
- Etat du départ (planifié/en cours/clôturé) visible **dans l’écran scan**
- Retour explicite vers “Départs du jour” après clôture
- Impression disponible dès l’ouverture du départ (et comportement si non autorisé)
- Explication des statuts : embarqué / absent / reporté (dans le contexte métier)
- Gestion claire des erreurs scan (actions recommandées)

---

## 8) Vérification ciblée (points demandés)

### Départ du bus
- ✅ Présent : bouton “Valider et lancer le trajet”.
- ⚠️ Manque : état “quand” il devient cliquable et ce que l’utilisateur doit vérifier avant (ex. scan désactivé + au moins un embarqué).

### Clôture embarquement
- ✅ Présent : bouton “Clôturer embarquement” puis état.
- ⚠️ Manque : confirmation explicite post-clôture (ex. “absents reprogrammés” + où retrouver ce résultat (historique)).

### Impression manifeste
- ✅ Présente.
- ⚠️ Manque : quand imprimer (avant scan vs après mise à jour) et que le document reflète l’état actuel.

### Gestion absents
- ✅ Basculer “absent”.
- ⚠️ Manque : libellé clair “Absent (no_show)” et conséquence “reprogrammation au départ reporté”.

### Gestion reports
- ⚠️ Présent sous forme d’interprétation. Doit être formulé comme :
  - “Reporté = reprogrammé sur un autre départ après clôture”
  - “Détails disponibles dans historique”
  - (si possible) “notification du prochain départ”

### Historique
- ✅ Ecran dédié.
- ⚠️ Manque : différence “historique opérationnel utile pendant scan” vs “audit après”.

### Supervision des départs du jour
- ✅ KPI + badges sur cartes.
- ⚠️ Risque surcharge : l’historique récent doit être secondaire/collapsible.

---

## 9) Conclusion (A/B)
### Décision
**B = corrections nécessaires avant implémentation.**

---

## Corrections obligatoires avant implémentation
Modifications précises à apporter à `docs/BOARDING_FINAL_UI_SPEC.md` :

### (1) Rendre explicite l’état cliquable du “Départ du bus”
- Dans la section **Écran Scan → Confirmation départ**, ajouter une ligne “Conditions préalables visibles” :
  - Scan désactivé
  - au moins 1 passager “Embarqué”
  - départ en mode “Clôture faite” (si requis par process UI)

### (2) Clarifier le statut “Reporté”
- Dans la section **Rôle / Stats** (et dans **Actions embarquement**), remplacer la formulation :
  - “reporté = clôture”
- Par une formulation produit :
  - “Absent marqués → après clôture : reprogrammation (report) vers un autre départ. Le détail apparaît dans l’historique.”

### (3) Impression : règle et instantané
- Dans l’écran principal et/ou écran scan, ajouter :
  - “Impression manifeste = état actuel au moment où l’on clique ‘Imprimer’.”
  - “Recommandation opérationnelle : imprimer avant scan si besoin de contrôle terrain ; réimprimer après clôture si nécessaire.”

### (4) Réduction de surcharge : historique récent
- Dans **Départs du jour → Section 4**, rendre l’historique récent :
  - collapsible (par défaut réduit)
  - ou limité à 3 items

### (5) Ajout d’un bouton “Retour Départs du jour” après clôture
- Dans **Écran Scan → Clôture** ajouter :
  - “Après clôture : bouton Retour à Départs du jour”

### (6) Clarifier les erreurs scan (actions recommandées)
- Dans la section **Feedback overlay**, ajouter :
  - “Selon le type d’erreur : (1) vérifier code, (2) vérifier trajet/date, (3) vérifier capacité, (4) demander chef si accès refusé.”

---

## 10) Réponse finale demandée
**B = corrections nécessaires avant implémentation.**

