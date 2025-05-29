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
// ✅ src/pages/BibliothequeImagesPage.tsx
import { useEffect, useState } from 'react';
import { collection, getDocs, deleteDoc, doc, query, where } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useAuth } from '@/contexts/AuthContext';
import UploadImageCloudinary from './UploadImageCloudinary';
const BibliothequeImagesPage = () => {
    const { user } = useAuth();
    const [images, setImages] = useState([]);
    const [loading, setLoading] = useState(false);
    const fetchImages = () => __awaiter(void 0, void 0, void 0, function* () {
        if (!(user === null || user === void 0 ? void 0 : user.companyId))
            return;
        setLoading(true);
        const q = query(collection(db, 'imagesBibliotheque'), where('companyId', '==', user.companyId));
        const snap = yield getDocs(q);
        const data = snap.docs.map((d) => (Object.assign({ id: d.id }, d.data())));
        setImages(data);
        setLoading(false);
    });
    useEffect(() => {
        fetchImages();
    }, [user === null || user === void 0 ? void 0 : user.companyId]);
    const supprimerImage = (id) => __awaiter(void 0, void 0, void 0, function* () {
        const confirm = window.confirm("Supprimer cette image ?");
        if (!confirm)
            return;
        yield deleteDoc(doc(db, 'imagesBibliotheque', id));
        fetchImages();
    });
    return (_jsxs("div", { className: "p-6 max-w-5xl mx-auto", children: [_jsx("h1", { className: "text-2xl font-bold mb-4", children: "Biblioth\u00E8que d'images" }), _jsx(UploadImageCloudinary, { label: "Ajouter une image", dossier: `compagnies/${user === null || user === void 0 ? void 0 : user.companyId}`, onUpload: () => fetchImages() }), _jsx("hr", { className: "my-6" }), _jsx("h2", { className: "text-xl font-semibold mb-4", children: "Images enregistr\u00E9es" }), loading ? (_jsx("p", { children: "Chargement..." })) : images.length === 0 ? (_jsx("p", { className: "text-gray-500", children: "Aucune image enregistr\u00E9e pour cette compagnie." })) : (_jsx("div", { className: "grid grid-cols-1 md:grid-cols-3 gap-4", children: images.map((img) => (_jsxs("div", { className: "border rounded p-2 shadow-sm", children: [_jsx("img", { src: img.url, alt: img.nom, className: "w-full h-40 object-cover rounded mb-2" }), _jsx("p", { className: "text-sm font-semibold truncate", children: img.nom }), _jsx("p", { className: "text-xs text-gray-500", children: img.type }), _jsx("button", { onClick: () => supprimerImage(img.id), className: "text-red-500 text-xs mt-2 hover:underline", children: "Supprimer" })] }, img.id))) }))] }));
};
export default BibliothequeImagesPage;
