var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth, db } from '../firebaseConfig';
import { doc, getDoc } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
const LoginPage = () => {
    const [email, setEmail] = useState('');
    const [motDePasse, setMotDePasse] = useState('');
    const [message, setMessage] = useState('');
    const navigate = useNavigate();
    const handleLogin = (e) => __awaiter(void 0, void 0, void 0, function* () {
        e.preventDefault();
        setMessage('');
        try {
            console.log('Tentative de connexion avec :', email);
            const userCredential = yield signInWithEmailAndPassword(auth, email, motDePasse);
            const uid = userCredential.user.uid;
            console.log('✅ Authentification Firebase réussie, UID :', uid);
            const userDoc = yield getDoc(doc(db, 'users', uid));
            if (!userDoc.exists()) {
                console.error('❌ Aucune donnée utilisateur trouvée dans Firestore pour UID :', uid);
                setMessage("Aucune information utilisateur trouvée.");
                return;
            }
            const userData = userDoc.data();
            console.log('✅ Données Firestore récupérées :', userData);
            const role = userData.role;
            localStorage.setItem('user', JSON.stringify(Object.assign({ uid, email, role }, userData)));
            switch (role) {
                case 'admin_platforme':
                    navigate('/admin/dashboard');
                    break;
                case 'admin_compagnie':
                    navigate('/compagnie/dashboard');
                    break;
                case 'chefAgence':
                    navigate('/agence/dashboard');
                    break;
                default:
                    console.error('❌ Rôle inconnu ou non autorisé :', role);
                    setMessage("Rôle utilisateur inconnu ou non autorisé.");
            }
        }
        catch (error) {
            console.error('❌ Erreur de connexion :', error);
            setMessage("Erreur de connexion : " + error.message);
        }
    });
    return (_jsx("div", { className: "min-h-screen flex items-center justify-center bg-gray-100", children: _jsxs("form", { onSubmit: handleLogin, className: "bg-white p-6 rounded shadow w-full max-w-sm space-y-4", children: [_jsx("h2", { className: "text-xl font-bold", children: "Rapport" }), _jsx("input", { type: "email", placeholder: "Email", value: email, onChange: (e) => setEmail(e.target.value), className: "w-full border rounded p-2" }), _jsx("input", { type: "password", placeholder: "Mot de passe", value: motDePasse, onChange: (e) => setMotDePasse(e.target.value), className: "w-full border rounded p-2" }), _jsx("button", { type: "submit", className: "w-full bg-blue-600 text-white p-2 rounded", children: "Se connecter" }), message && _jsx("p", { className: "text-red-600 text-sm text-center", children: message })] }) }));
};
export default LoginPage;
