var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
// ✅ setUserRole.ts
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, updateDoc } from 'firebase/firestore';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
// ✅ Ton config Firebase (copie celle de firebaseConfig.ts)
const firebaseConfig = {
    apiKey: "AIzaSyB9sGzgvdzhxxhIshtPprPix7oBfCB2OuM",
    authDomain: "monbillet-95b77.firebaseapp.com",
    projectId: "monbillet-95b77",
    storageBucket: "monbillet-95b77.appspot.com", // ✅ Corrigé ici : il manquait ".appspot.com"
    messagingSenderId: "337289733382",
    appId: "1:337289733382:web:bb99ee8f48861b47226a87",
    measurementId: "G-69G3YRS7S6"
};
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
// ✅ MODIFIE ICI les valeurs selon l'utilisateur cible
const userEmail = 'dialloibra1000@gmail.com';
const userPassword = 'Ibra.Diallo.1000';
const nouveauRole = 'admin_platforme';
function updateUserRole() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            // ✅ Auth temporaire pour identifier l’UID (optionnel si tu l’as déjà)
            const userCredential = yield signInWithEmailAndPassword(auth, userEmail, userPassword);
            const user = userCredential.user;
            const uid = user.uid;
            const userRef = doc(db, 'users', uid);
            yield updateDoc(userRef, { role: nouveauRole });
            console.log(`✅ Rôle de ${userEmail} mis à jour en : ${nouveauRole}`);
        }
        catch (error) {
            console.error('❌ Erreur lors de la mise à jour du rôle :', error);
        }
    });
}
updateUserRole();
