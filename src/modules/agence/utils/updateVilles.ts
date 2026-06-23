import { db } from '@/firebaseConfig';
import { doc, getDoc, setDoc } from 'firebase/firestore';

export const ajouterVillesDepuisTrajet = async (departure: string, arrival: string) => {
  const normaliserVille = (ville: string) =>
    ville.trim().toLowerCase().replace(/\s+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

  const villes = [departure, arrival].map(normaliserVille).filter(Boolean);

  for (const ville of villes) {
    try {
      const villeRef = doc(db, 'villes', ville);
      const snap = await getDoc(villeRef);

      if (!snap.exists()) {
        await setDoc(villeRef, { nom: ville });
      }
    } catch (error) {
      console.warn('[ajouterVillesDepuisTrajet] Ville non ajoutée, sans bloquer le trajet:', ville, error);
    }
  }
};