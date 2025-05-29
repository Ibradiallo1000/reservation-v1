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
// ✅ FICHIER 2 — MentionsPage.tsx (à placer dans src/pages)
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { db } from '../firebaseConfig';
import { collection, getDocs, query, where } from 'firebase/firestore';
const MentionsPage = () => {
    const { slug } = useParams();
    const [texte, setTexte] = useState('');
    useEffect(() => {
        const fetch = () => __awaiter(void 0, void 0, void 0, function* () {
            const q = query(collection(db, 'companies'), where('slug', '==', slug));
            const snap = yield getDocs(q);
            if (!snap.empty) {
                const data = snap.docs[0].data();
                setTexte(data.mentionsLegales || 'Aucune mention disponible.');
            }
        });
        fetch();
    }, [slug]);
    return (_jsxs("div", { className: "max-w-4xl mx-auto p-6 text-justify", children: [_jsx("h1", { className: "text-2xl font-bold mb-4", children: "Mentions l\u00E9gales" }), _jsx("p", { className: "whitespace-pre-wrap", children: texte })] }));
};
export default MentionsPage;
