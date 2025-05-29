var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { collection, getDoc, getDocs, addDoc, doc, query, where, Timestamp, updateDoc } from "firebase/firestore";
import { db } from "../firebaseConfig";
const DAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
export const generateDailyTripsForWeeklyTrip = (weeklyTripId) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const ref = doc(db, 'weeklyTrips', weeklyTripId);
    const snap = yield getDoc(ref);
    if (!snap.exists())
        return;
    const data = snap.data();
    const { companyId, agencyId, departure, arrival, price, horaires } = data;
    const capacity = data.places || 30;
    // 🔁 Récupérer le nom de la compagnie depuis Firestore
    let companyName = 'Compagnie';
    if (companyId) {
        const companySnap = yield getDoc(doc(db, 'compagnies', companyId));
        if (companySnap.exists()) {
            companyName = ((_a = companySnap.data()) === null || _a === void 0 ? void 0 : _a.nom) || 'Compagnie';
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
        if (!horaires[jour] || horaires[jour].length === 0)
            continue;
        for (const heure of horaires[jour]) {
            const q = query(collection(db, 'dailyTrips'), where('companyId', '==', companyId), where('agencyId', '==', agencyId), // ✅ pour éviter collision inter-agence
            where('departure', '==', departure), where('arrival', '==', arrival), where('date', '==', dateStr), where('time', '==', heure));
            const snapshot = yield getDocs(q);
            if (!snapshot.empty) {
                const docId = snapshot.docs[0].id;
                yield updateDoc(doc(db, 'dailyTrips', docId), {
                    price,
                    places: capacity,
                    companyName,
                    weeklyTripId,
                    agencyId // ✅ on conserve dans la mise à jour aussi
                });
                console.log(`✅ Mis à jour : ${departure} → ${arrival} à ${heure} le ${dateStr}`);
            }
            else {
                yield addDoc(collection(db, "dailyTrips"), {
                    companyId,
                    agencyId, // ✅ Ajouté ici
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
});
