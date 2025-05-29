// ✅ Correction du fichier generateWeeklyTrips.ts avec bon ID compagnie
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { addDoc, collection, Timestamp } from 'firebase/firestore';
import { db } from '../firebaseConfig';
export const generateWeeklyTrips = (companyId, // ⚠️ Doit être l'ID de la compagnie, pas le uid de l'utilisateur
departure, arrival, price, horaires, places, agencyId) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        yield addDoc(collection(db, 'weeklyTrips'), {
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
    }
    catch (error) {
        console.error('Erreur lors de la création du trajet hebdomadaire :', error);
        throw error;
    }
});
