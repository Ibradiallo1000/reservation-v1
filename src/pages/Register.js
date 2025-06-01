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
// Exemple : Register.tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebaseConfig';
const Register = () => {
    const navigate = useNavigate();
    const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '', role: 'compagnie' });
    const [error, setError] = useState('');
    const handleChange = (e) => {
        const { name, value } = e.target;
        setForm(prev => (Object.assign(Object.assign({}, prev), { [name]: value })));
    };
    const handleSubmit = (e) => __awaiter(void 0, void 0, void 0, function* () {
        e.preventDefault();
        const { name, email, password, confirm, role } = form;
        if (!name || !email || !password || !confirm)
            return setError('Veuillez remplir tous les champs.');
        if (password !== confirm)
            return setError("Les mots de passe ne correspondent pas.");
        try {
            const userCredential = yield createUserWithEmailAndPassword(auth, email, password);
            yield updateProfile(userCredential.user, { displayName: name });
            // Stocker le role de l'utilisateur dans Firestore
            yield setDoc(doc(db, 'users', userCredential.user.uid), {
                name,
                email,
                role,
                createdAt: new Date()
            });
            alert('Compte créé avec succès !');
            navigate('/login');
        }
        catch (err) {
            console.error(err);
            setError(err.message);
        }
    });
    return (_jsx("form", { onSubmit: handleSubmit, children: _jsxs("select", { name: "role", value: form.role, onChange: handleChange, className: "w-full border rounded px-3 py-2 mb-3", children: [_jsx("option", { value: "compagnie", children: "Compte Compagnie" }), _jsx("option", { value: "admin", children: "Administrateur principal" })] }) }));
};
export default Register;
