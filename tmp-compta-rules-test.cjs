const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const { doc, setDoc, serverTimestamp } = require('firebase/firestore');
const fs = require('fs');

(async () => {
  const env = await initializeTestEnvironment({
    projectId: 'demo-teliya',
    firestore: {
      rules: fs.readFileSync('firestore.rules', 'utf8'),
    },
  });

  const uid = 'acct_uid';
  const companyId = 'c1';
  const agencyId = 'a1';
  const otherAgency = 'a2';

  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, `users/${uid}`), { role: 'comptable', agencyId, companyId });
    await setDoc(doc(db, `companies/${companyId}/agences/${agencyId}`), { name: 'A1' });
    await setDoc(doc(db, `companies/${companyId}/agences/${otherAgency}`), { name: 'A2' });
  });

  const db = env.authenticatedContext(uid).firestore();
  const basePath = `companies/${companyId}/agences/${agencyId}/comptaEncaissements/`;

  // 1) payload minimal valide : montant + sessionId
  await assertSucceeds(
    setDoc(doc(db, `${basePath}okMinimal`), {
      type: 'encaissement',
      montant: 1500,
      source: 'guichet',
      sessionId: 'sess1',
      agencyId,
      companyId,
      createdAt: serverTimestamp(),
    }),
  );

  // 2) payload variante valide : amount + shiftId + createdBy + validatedBy + currency + status + updatedAt
  await assertSucceeds(
    setDoc(doc(db, `${basePath}okVariant`), {
      type: 'encaissement',
      amount: 2500,
      source: 'courrier',
      shiftId: 'shift9',
      agencyId,
      companyId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      currency: 'XOF',
      createdBy: uid,
      validatedBy: { id: uid },
      status: 'posted',
    }),
  );

  // 3) rejets critiques
  await assertFails(
    setDoc(doc(db, `${basePath}failAgency`), {
      type: 'encaissement',
      montant: 1000,
      source: 'guichet',
      sessionId: 'sess2',
      agencyId: otherAgency,
      companyId,
      createdAt: serverTimestamp(),
    }),
  );

  await assertFails(
    setDoc(doc(db, `${basePath}failAmount`), {
      type: 'encaissement',
      amount: 0,
      source: 'guichet',
      shiftId: 's3',
      agencyId,
      companyId,
      createdAt: serverTimestamp(),
    }),
  );

  await assertFails(
    setDoc(doc(db, `${basePath}failSource`), {
      type: 'encaissement',
      montant: 1000,
      source: 'mobile',
      sessionId: 'sess4',
      agencyId,
      companyId,
      createdAt: serverTimestamp(),
    }),
  );

  await env.cleanup();
  console.log('CRITICAL_PATH_RULES_TEST_OK');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
