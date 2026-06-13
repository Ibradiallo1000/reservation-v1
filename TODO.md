# TODO (BlackboxAI)

## Invitation link “Copier” dans AdminCompagniesPage
- [ ] Mettre en place la récupération des invitations `pending` par `companyId` dans `AdminCompagniesPage.tsx`
- [ ] Construire le lien `origin + /accept-invitation/:token`
- [ ] Ajouter un bouton “Copier le lien invitation” dans la carte compagnie
- [ ] Gérer les cas: aucune invitation pending, ou erreur de lecture Firestore
- [ ] (Optionnel) Ajouter action “Renvoi / resend invitation” si vous avez un endpoint
- [ ] Tester sur dev (localhost) puis sur prod

