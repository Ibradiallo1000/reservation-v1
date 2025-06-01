import { onSchedule } from "firebase-functions/v2/scheduler";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

initializeApp();
const db = getFirestore();

const DAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

export const syncDailyTrips = onSchedule("every day 03:00", async () => {
  console.log("🚀 Lancement de la synchronisation des DailyTrips");

  const today = new Date();
  const dates = Array.from({ length: 8 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    return d;
  });

  const weeklyTripsSnap = await db.collection("weeklyTrips").get();
  for (const docWeekly of weeklyTripsSnap.docs) {
    const data = docWeekly.data();
    const { companyId, agencyId, departure, arrival, horaires, price, places = 30 } = data;

    const companySnap = await db.collection("companies").doc(companyId).get();
    const companyName = companySnap.exists ? companySnap.data()?.nom : "Compagnie";

    for (const date of dates) {
      const jour = DAYS[date.getDay()];
      const dateStr = date.toISOString().split("T")[0];
      const heures = horaires[jour] || [];

      for (const heure of heures) {
        const existing = await db.collection("dailyTrips")
          .where("companyId", "==", companyId)
          .where("agencyId", "==", agencyId)
          .where("departure", "==", departure)
          .where("arrival", "==", arrival)
          .where("date", "==", dateStr)
          .where("time", "==", heure)
          .get();

        if (existing.empty) {
          await db.collection("dailyTrips").add({
            companyId,
            agencyId,
            companyName,
            departure,
            arrival,
            date: dateStr,
            day: jour,
            time: heure,
            price,
            places,
            active: true,
            weeklyTripId: docWeekly.id,
            createdAt: new Date()
          });

          console.log(`✔️ Ajouté : ${departure} → ${arrival} à ${heure} (${dateStr})`);
        }
      }
    }
  }

  console.log("🎯 Synchronisation terminée.");
});
