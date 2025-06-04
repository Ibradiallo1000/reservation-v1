// ✅ generateDailyTripsForWeeklyTrip.ts — version corrigée et prête pour la production

import {
  collection,
  getDoc,
  getDocs,
  addDoc,
  doc,
  query,
  where,
  Timestamp,
  updateDoc
} from "firebase/firestore";
import { db } from "../firebaseConfig";

const DAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

export const generateDailyTripsForWeeklyTrip = async (weeklyTripId: string) => {
  const ref = doc(db, 'weeklyTrips', weeklyTripId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;

  const data = snap.data();
  const { companyId, agencyId, departure, arrival, price, horaires } = data;
  const capacity = data.places || 30;

  // ✅ Vérification que 'horaires' est bien un objet
  if (!horaires || typeof horaires !== 'object') {
    console.warn("⛔ Horaires invalides ou absents pour ce WeeklyTrip.");
    return;
  }

  // ✅ Nettoyage des horaires vides
  for (const jour in horaires) {
    horaires[jour] = horaires[jour].filter((h: string) => h && h.trim() !== '');
  }

  // 🔁 Récupérer le nom de la compagnie
  let companyName = 'Compagnie';
  if (companyId) {
    const companySnap = await getDoc(doc(db, 'compagnies', companyId));
    if (companySnap.exists()) {
      companyName = companySnap.data()?.nom || 'Compagnie';
    }
  }

  const today = new Date();
  const dates = Array.from({ length: 8 }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    return d;
  });

  for (const date of dates) {
    const jour = DAYS[date.getDay()];
    const dateStr = date.toISOString().split("T")[0];

    if (!horaires[jour] || horaires[jour].length === 0) continue;

    for (const heure of horaires[jour]) {
      const q = query(
        collection(db, 'dailyTrips'),
        where('companyId', '==', companyId),
        where('agencyId', '==', agencyId),
        where('departure', '==', departure),
        where('arrival', '==', arrival),
        where('date', '==', dateStr),
        where('time', '==', heure)
      );

      const snapshot = await getDocs(q);

      if (snapshot.docs.length > 1) {
        console.warn(`⚠️ Plusieurs dailyTrips identiques trouvés pour ${dateStr} ${heure}`);
      }

      if (!snapshot.empty) {
        const docId = snapshot.docs[0].id;
        await updateDoc(doc(db, 'dailyTrips', docId), {
          price,
          places: capacity,
          companyName,
          weeklyTripId,
          agencyId
        });
        console.log(`✅ Mis à jour : ${departure} → ${arrival} à ${heure} le ${dateStr}`);
      } else {
        await addDoc(collection(db, "dailyTrips"), {
          companyId,
          agencyId,
          companyName,
          departure,
          arrival,
          price,
          time: heure,
          date: dateStr,
          day: jour,
          places: capacity,
          createdAt: Timestamp.now(),
          weeklyTripId
        });
        console.log(`✔️ Ajouté : ${departure} → ${arrival} à ${heure} le ${dateStr}`);
      }
    }
  }
};
