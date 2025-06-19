import { collection, addDoc, Timestamp } from 'firebase/firestore';
import { db } from '../firebaseConfig';

export const sendNotification = async (message: string, lien: string, type: 'info' | 'warning' | 'success' = 'info') => {
  try {
    await addDoc(collection(db, 'notifications'), {
      message,
      lien,
      type,
      lu: false,
      createdAt: Timestamp.now()
    });
  } catch (error) {
    console.error("❌ Erreur lors de l'envoi de notification :", error);
  }
};
