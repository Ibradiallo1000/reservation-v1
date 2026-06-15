# TODO.md

- [ ] Comprendre le bloc `match /companies/{companyId}/paymentConfigs/{configId}` dans `firestore.rules`.
- [ ] Remplacer uniquement ce bloc par la règle attendue (get/list public via active+isEnabled; create/update/delete via isAuth + userCompanyId == companyId ou isPlatformAdmin; **pas** de isAuth() sur get/list).
- [ ] Déployer uniquement les règles Firestore : `firebase deploy --only firestore:rules`.
- [ ] Retester `/payment/{reservationId}` (lecture `companies/{companyId}/paymentConfigs/...`) et vérifier disparition du `permission-denied`.

