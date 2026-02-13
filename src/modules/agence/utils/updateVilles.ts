import { db } from '@/firebaseConfig';
import { collection, doc, getDoc, setDoc } from 'firebase/firestore';

export const ajouterVillesDepuisTrajet = async (departure: string, arrival: string) => {
  const normaliserVille = (ville: string) =>
    ville.trim().toLowerCase().replace(/\s+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

  const villes = [departure, arrival].map(normaliserVille);

  for (const ville of villes) {
    const villeRef = doc(db, 'villes', ville);
    const snap = await getDoc(villeRef);
    if (!snap.exists()) {
      await setDoc(villeRef, { nom: ville });
    }
  }
};
