// ✅ Correction du fichier generateWeeklyTrips.ts avec bon ID compagnie

import { addDoc, collection, Timestamp } from 'firebase/firestore';
import { db } from '../firebaseConfig';

export const generateWeeklyTrips = async (
  companyId: string, // ⚠️ Doit être l'ID de la compagnie, pas le uid de l'utilisateur
  departure: string,
  arrival: string,
  price: number,
  horaires: { [key: string]: string[] },
  places: number,
  agencyId: string
) => {
  try {
    await addDoc(collection(db, 'weeklyTrips'), {
      companyId, // ✅ ID de la compagnie
      agencyId,
      departure,
      arrival,
      price,
      horaires,
      places,
      active: true,
      createdAt: Timestamp.now(),
    });
  } catch (error) {
    console.error('Erreur lors de la création du trajet hebdomadaire :', error);
    throw error;
  }
};
