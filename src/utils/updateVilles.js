var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { db } from '../firebaseConfig';
import { doc, getDoc, setDoc } from 'firebase/firestore';
export const ajouterVillesDepuisTrajet = (departure, arrival) => __awaiter(void 0, void 0, void 0, function* () {
    const normaliserVille = (ville) => ville.trim().toLowerCase().replace(/\s+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    const villes = [departure, arrival].map(normaliserVille);
    for (const ville of villes) {
        const villeRef = doc(db, 'villes', ville);
        const snap = yield getDoc(villeRef);
        if (!snap.exists()) {
            yield setDoc(villeRef, { nom: ville });
        }
    }
});
