var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { collection, getDocs, addDoc, query, where, doc, getDoc, } from 'firebase/firestore';
import { db } from '../firebaseConfig';
const DAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const formatDate = (date) => {
    return date.toISOString().split('T')[0];
};
export const generateDailyTrips = () => __awaiter(void 0, void 0, void 0, function* () {
    console.log('🚀 Début génération des dailyTrips...');
    const today = new Date();
    const dates = Array.from({ length: 8 }, (_, i) => {
        const d = new Date(today);
        d.setDate(today.getDate() + i);
        return d;
    });
    const weeklyTripsSnapshot = yield getDocs(collection(db, 'weeklyTrips'));
    if (weeklyTripsSnapshot.empty) {
        console.log('Aucun weeklyTrip trouvé.');
        return;
    }
    for (const weeklyDoc of weeklyTripsSnapshot.docs) {
        const weeklyData = weeklyDoc.data();
        const { companyId, departure, arrival, price, horaires } = weeklyData;
        const weeklyTripId = weeklyDoc.id;
        const places = weeklyData.places || 30;
        // 🔹 Récupérer le nom de la compagnie
        const companySnap = yield getDoc(doc(db, 'companies', companyId));
        const companyName = companySnap.exists() ? companySnap.data().nom : 'Compagnie';
        // 🔹 Récupérer la première agence liée à la compagnie
        const agenceSnap = yield getDocs(query(collection(db, 'agences'), where('companyId', '==', companyId)));
        if (agenceSnap.empty) {
            console.warn(`⚠️ Aucune agence pour la compagnie ${companyId}`);
            continue;
        }
        const agencyId = agenceSnap.docs[0].id;
        // 🔄 Boucle sur les 8 jours à venir
        for (const date of dates) {
            const jour = DAYS[date.getDay()];
            const dateStr = formatDate(date);
            const heures = (horaires[jour] || []).filter(Boolean).sort();
            if (heures.length === 0)
                continue;
            for (const heure of heures) {
                const exists = yield checkTripExists(companyId, departure, arrival, dateStr, heure);
                if (!exists) {
                    yield addDoc(collection(db, 'dailyTrips'), {
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
                        createdAt: new Date(),
                        weeklyTripId,
                    });
                    console.log(`✅ Trajet ajouté : ${departure} → ${arrival} à ${heure} (${dateStr})`);
                }
            }
        }
    }
    console.log('🎉 Génération des dailyTrips terminée.');
});
const checkTripExists = (companyId, departure, arrival, date, time) => __awaiter(void 0, void 0, void 0, function* () {
    const q = query(collection(db, 'dailyTrips'), where('companyId', '==', companyId), where('departure', '==', departure), where('arrival', '==', arrival), where('date', '==', date), where('time', '==', time));
    const snap = yield getDocs(q);
    return !snap.empty;
});
