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
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import { addDoc, collection } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useAuth } from '@/contexts/AuthContext';
const UploadImageCloudinary = ({ label, onUpload, dossier }) => {
    const { user } = useAuth();
    const handleFileChange = (event) => __awaiter(void 0, void 0, void 0, function* () {
        var _a;
        const file = (_a = event.target.files) === null || _a === void 0 ? void 0 : _a[0];
        if (!file || !(user === null || user === void 0 ? void 0 : user.companyId))
            return;
        const formData = new FormData();
        formData.append('file', file);
        formData.append('upload_preset', 'ml_default');
        formData.append('public_id', `${dossier}/${uuidv4()}`);
        try {
            const response = yield axios.post('https://api.cloudinary.com/v1_1/dj697honl/image/upload', formData);
            const imageUrl = response.data.secure_url;
            const nom = prompt("Nom de l'image (ex: logo, bannière, etc.)") || 'image';
            yield addDoc(collection(db, 'imagesBibliotheque'), {
                companyId: user.companyId,
                url: imageUrl,
                type: 'libre', // toutes les images uploadées sont utilisables librement
                nom,
                createdAt: new Date()
            });
            if (onUpload)
                onUpload(imageUrl);
            alert('Image ajoutée avec succès.');
        }
        catch (error) {
            console.error('Erreur lors du téléversement sur Cloudinary :', error);
            alert("Échec de l'upload. Vérifie ta connexion et ton VPN.");
        }
    });
    return (_jsxs("div", { className: "mb-4", children: [_jsx("label", { className: "font-semibold block mb-1", children: label }), _jsx("input", { type: "file", accept: "image/*", onChange: handleFileChange })] }));
};
export default UploadImageCloudinary;
