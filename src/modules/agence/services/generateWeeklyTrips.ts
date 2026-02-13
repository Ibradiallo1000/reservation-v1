import { collection, doc, setDoc, Timestamp } from 'firebase/firestore';
import { db } from '@/firebaseConfig';

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
    const tripsCollection = collection(
      db,
      'companies',
      companyId,
      'agences',
      agencyId,
      'weeklyTrips'
    );
    
    const newTripRef = doc(tripsCollection);
    
    const tripData = {
      id: newTripRef.id,
      departure: departure.trim(),
      arrival: arrival.trim(),
      price: price,
      places: places,
      horaires: horaires,
      active: true,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now()
    };
    
    await setDoc(newTripRef, tripData);
    
    return newTripRef.id;
  } catch (error) {
    console.error('Erreur lors de la création du trajet:', error);
    throw error;
  }
};