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
import { useAuth } from '@/contexts/AuthContext';
import { updatePassword } from 'firebase/auth';
import { auth } from '../firebaseConfig';
const ParametresSecurite = () => {
    const { user } = useAuth();
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [message, setMessage] = useState('');
    const handleChangePassword = () => __awaiter(void 0, void 0, void 0, function* () {
        if (newPassword !== confirmPassword) {
            setMessage("Les mots de passe ne correspondent pas.");
            return;
        }
        try {
            if (auth.currentUser) {
                yield updatePassword(auth.currentUser, newPassword);
                setMessage("Mot de passe mis à jour avec succès !");
            }
        }
        catch (error) {
            setMessage("Erreur lors de la mise à jour du mot de passe.");
        }
    });
    return (_jsxs("div", { children: [_jsx("h2", { className: "text-xl font-bold mb-4", children: "S\u00E9curit\u00E9" }), _jsx("input", { type: "password", placeholder: "Nouveau mot de passe", value: newPassword, onChange: (e) => setNewPassword(e.target.value), className: "block mb-2 border px-2 py-1" }), _jsx("input", { type: "password", placeholder: "Confirmer le mot de passe", value: confirmPassword, onChange: (e) => setConfirmPassword(e.target.value), className: "block mb-2 border px-2 py-1" }), _jsx("button", { onClick: handleChangePassword, className: "bg-orange-600 text-white px-4 py-1 rounded", children: "Modifier le mot de passe" }), message && _jsx("p", { className: "mt-2 text-green-600", children: message })] }));
};
export default ParametresSecurite;
