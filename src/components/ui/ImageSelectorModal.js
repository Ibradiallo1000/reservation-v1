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
// ✅ src/components/ImageSelectorModal.tsx
import { useEffect, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../firebaseConfig';
const ImageSelectorModal = ({ companyId, onSelect, onClose }) => {
    const [images, setImages] = useState([]);
    const [loading, setLoading] = useState(true);
    useEffect(() => {
        const fetchImages = () => __awaiter(void 0, void 0, void 0, function* () {
            try {
                const q = query(collection(db, 'imagesBibliotheque'), where('companyId', '==', companyId));
                const snapshot = yield getDocs(q);
                const data = snapshot.docs.map(doc => (Object.assign({ id: doc.id }, doc.data())));
                setImages(data);
            }
            catch (error) {
                console.error("Erreur lors de la récupération des images :", error);
            }
            setLoading(false);
        });
        fetchImages();
    }, [companyId]);
    return (_jsx("div", { className: "fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50", children: _jsxs("div", { className: "bg-white rounded-lg p-6 max-w-4xl w-full max-h-[80vh] overflow-y-auto", children: [_jsxs("div", { className: "flex justify-between items-center mb-4", children: [_jsx("h2", { className: "text-lg font-bold", children: "Choisir une image" }), _jsx("button", { onClick: onClose, className: "text-gray-500 hover:text-red-500 text-sm", children: "\u2716 Fermer" })] }), loading ? (_jsx("p", { children: "Chargement..." })) : images.length === 0 ? (_jsx("p", { className: "text-gray-500", children: "Aucune image trouv\u00E9e pour cette compagnie." })) : (_jsx("div", { className: "grid grid-cols-2 md:grid-cols-4 gap-4", children: images.map((img) => (_jsxs("div", { className: "border rounded overflow-hidden shadow hover:shadow-lg cursor-pointer", onClick: () => onSelect(img.url), children: [_jsx("img", { src: img.url, alt: img.nom, className: "w-full h-32 object-cover" }), _jsx("div", { className: "p-2 text-sm text-center truncate", children: img.nom })] }, img.id))) }))] }) }));
};
export default ImageSelectorModal;
