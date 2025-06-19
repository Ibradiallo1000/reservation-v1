import { addDoc, collection, Timestamp } from 'firebase/firestore';
import { db } from '../firebaseConfig';

export const generateWeeklyTrips = async (
  companyId: string,
  departure: string,
  arrival: string,
  price: number,
  horaires: { [key: string]: string[] },
  places: number,
  agencyId: string
): Promise<string> => {
  try {
    const docRef = await addDoc(collection(db, 'weeklyTrips'), {
      companyId,
      agencyId,
      departure,
      arrival,
      price,
      horaires,
      places,
      active: true,
      createdAt: Timestamp.now(),
    });

    return docRef.id; // ✅ Retourne l'ID du trajet créé
  } catch (error) {
    console.error('Erreur lors de la création du trajet hebdomadaire :', error);
    throw error;
  }
};
