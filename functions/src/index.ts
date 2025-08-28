import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

admin.initializeApp();

export const adminDeleteUser = functions.https.onCall(async (data, context) => {
  // Vérifier que l'appelant est authentifié
  if (!context.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'Vous devez être connecté.'
    );
  }

  // (Optionnel) Vérifier que l'appelant a un rôle autorisé
  // if (context.auth.token.role !== 'admin_compagnie' && context.auth.token.role !== 'chefAgence') {
  //   throw new functions.https.HttpsError('permission-denied', 'Non autorisé.');
  // }

  const { uid } = data;
  if (!uid) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'UID manquant pour suppression.'
    );
  }

  try {
    await admin.auth().deleteUser(uid);
    return { success: true };
  } catch (error) {
    console.error('Erreur suppression Auth:', error);
    throw new functions.https.HttpsError('internal', 'Suppression Auth échouée.');
  }
});
