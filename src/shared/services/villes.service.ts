import { collection, getDocs } from "firebase/firestore";
import { db } from "@/firebaseConfig";

/**
 * Récupère toutes les villes depuis Firestore (collection "villes").
 * Retourne un tableau de noms de villes, triés par ordre alphabétique (fr).
 */
export async function getAllVilles(): Promise<string[]> {
  const snap = await getDocs(collection(db, "villes"));
  const names = snap.docs
    .map((doc) => {
      const data = doc.data() as { nom?: unknown };
      return (data?.nom ?? "").toString().trim();
    })
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, "fr"));
  return names;
}
