var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
// ✅ VERSION COMPLÈTE ET STABLE DU FICHIER `ParametresVitrine.tsx`
// Ce fichier contient : logo, favicon, bannières, thème, couleur, police, réseaux sociaux, footer config
import { useEffect, useState } from 'react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useAuth } from '@/contexts/AuthContext';
import ImageSelectorModal from '../components/ui/ImageSelectorModal';
import { HexColorPicker } from 'react-colorful';
import { CheckCircle, AlertCircle, Save, Trash2, Upload, Image as ImageIcon, Palette, Moon, Sun, Type } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
const ParametresVitrine = () => {
    const { user } = useAuth();
    const [companyData, setCompanyData] = useState({
        nom: '',
        telephone: '',
        description: '',
        logoUrl: '',
        faviconUrl: '',
        banniereUrl: '',
        imagesSlider: [],
        couleurPrimaire: '#3B82F6',
        couleurSecondaire: '#10B981',
        themeStyle: 'moderne',
        police: 'sans-serif',
        socialMedia: {
            facebook: '', instagram: '', whatsapp: '', tiktok: '', linkedin: '', youtube: ''
        },
        footerConfig: {
            showSocialMedia: true,
            showTestimonials: true,
            showLegalLinks: true,
            showContactForm: true,
            customLinks: []
        }
    });
    const [message, setMessage] = useState({ text: '', type: '' });
    const [modalType, setModalType] = useState(null);
    const [showColorPicker, setShowColorPicker] = useState(null);
    const themeOptions = [
        { name: 'moderne', value: 'moderne', description: 'Style contemporain avec couleurs vives', icon: _jsx(Palette, { size: 16 }) },
        { name: 'classique', value: 'classique', description: 'Style traditionnel épuré', icon: _jsx(Type, { size: 16 }) },
        { name: 'sombre', value: 'sombre', description: 'Mode nuit élégant', icon: _jsx(Moon, { size: 16 }) },
        { name: 'contraste', value: 'contraste', description: 'Fort impact visuel', icon: _jsx(Sun, { size: 16 }) },
        { name: 'minimaliste', value: 'minimaliste', description: 'Design ultra épuré', icon: _jsx(Type, { size: 16 }) },
        { name: 'glassmorphism', value: 'glassmorphism', description: 'Effets de transparence moderne', icon: _jsx(Palette, { size: 16 }) },
    ];
    useEffect(() => {
        if (user === null || user === void 0 ? void 0 : user.companyId) {
            const fetchData = () => __awaiter(void 0, void 0, void 0, function* () {
                const docRef = doc(db, 'companies', user.companyId);
                const docSnap = yield getDoc(docRef);
                if (docSnap.exists()) {
                    setCompanyData(prev => (Object.assign(Object.assign({}, prev), docSnap.data())));
                }
            });
            fetchData();
        }
    }, [user]);
    const handleSave = () => __awaiter(void 0, void 0, void 0, function* () {
        if (!(user === null || user === void 0 ? void 0 : user.companyId))
            return;
        setMessage({ text: 'Enregistrement en cours...', type: 'info' });
        try {
            const docRef = doc(db, 'companies', user.companyId);
            yield updateDoc(docRef, companyData);
            setMessage({ text: 'Modifications enregistrées avec succès', type: 'success' });
        }
        catch (err) {
            console.error("Erreur d'enregistrement:", err);
            setMessage({ text: "Échec de l'enregistrement. Veuillez réessayer.", type: 'error' });
        }
    });
    const handleChange = (e) => {
        const { name, value } = e.target;
        setCompanyData(prev => (Object.assign(Object.assign({}, prev), { [name]: value })));
    };
    const handleImageSelect = (url) => {
        if (!modalType)
            return;
        setCompanyData(prev => (Object.assign(Object.assign(Object.assign(Object.assign(Object.assign({}, prev), (modalType === 'logo' && { logoUrl: url })), (modalType === 'favicon' && { faviconUrl: url })), (modalType === 'banniereStatique' && { banniereUrl: url })), (modalType === 'banniere' && { imagesSlider: [...prev.imagesSlider, url] }))));
        setModalType(null);
    };
    const handleImageRemove = (index) => {
        setCompanyData(prev => (Object.assign(Object.assign({}, prev), { imagesSlider: prev.imagesSlider.filter((_, i) => i !== index) })));
    };
    return (_jsxs("div", { className: "max-w-5xl mx-auto p-6 bg-white rounded-lg shadow-sm", children: [_jsx("h2", { className: "text-2xl font-bold mb-4", children: "Personnalisation de la vitrine" }), _jsx(AnimatePresence, { children: message.text && (_jsx(motion.div, { initial: { opacity: 0, y: -20 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -20 }, className: `fixed top-4 right-4 p-4 rounded-md shadow-lg z-50 ${message.type === 'success'
                        ? 'bg-green-100 text-green-800 border-l-4 border-green-500'
                        : message.type === 'error'
                            ? 'bg-red-100 text-red-800 border-l-4 border-red-500'
                            : 'bg-blue-100 text-blue-800 border-l-4 border-blue-500'}`, children: _jsxs("div", { className: "flex items-center justify-between gap-4", children: [_jsxs("div", { className: "flex items-center", children: [message.type === 'success' ? (_jsx(CheckCircle, { className: "h-6 w-6 mr-2" })) : message.type === 'error' ? (_jsx(AlertCircle, { className: "h-6 w-6 mr-2" })) : (_jsx("div", { className: "h-6 w-6 mr-2 animate-spin rounded-full border-t-2 border-b-2 border-blue-500" })), _jsx("span", { children: message.text })] }), message.type === 'success' && (_jsx("button", { onClick: () => setMessage({ text: '', type: '' }), className: "text-sm underline text-green-800 hover:text-green-900", type: "button", children: "OK" }))] }) })) }), _jsxs("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-8", children: [_jsxs("div", { className: "space-y-6", children: [_jsxs("div", { className: "border-b pb-4", children: [_jsxs("h3", { className: "text-lg font-semibold mb-4 flex items-center gap-2", children: [_jsx(Palette, { size: 18 }), "Identit\u00E9 visuelle"] }), _jsxs("div", { className: "space-y-4", children: [_jsxs("div", { children: [_jsx("label", { className: "block text-sm font-medium text-gray-700 mb-2", children: "Couleur principale" }), _jsxs("div", { className: "flex items-center gap-3", children: [_jsx("div", { className: "h-10 w-10 rounded-md cursor-pointer border", style: { backgroundColor: companyData.couleurPrimaire }, onClick: () => setShowColorPicker('primary') }), showColorPicker === 'primary' && (_jsxs("div", { className: "absolute z-10 mt-2 bg-white p-2 rounded-md shadow-xl", children: [_jsx(HexColorPicker, { color: companyData.couleurPrimaire, onChange: (color) => setCompanyData(Object.assign(Object.assign({}, companyData), { couleurPrimaire: color })) }), _jsxs("div", { className: "mt-2 flex justify-between items-center", children: [_jsx("input", { type: "text", value: companyData.couleurPrimaire, onChange: (e) => setCompanyData(Object.assign(Object.assign({}, companyData), { couleurPrimaire: e.target.value })), className: "text-sm border rounded px-2 py-1 w-24" }), _jsx("button", { onClick: () => setShowColorPicker(null), className: "text-sm bg-gray-100 hover:bg-gray-200 px-3 py-1 rounded", children: "Valider" })] })] }))] })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-sm font-medium text-gray-700 mb-2", children: "Couleur secondaire" }), _jsxs("div", { className: "flex items-center gap-3", children: [_jsx("div", { className: "h-10 w-10 rounded-md cursor-pointer border", style: { backgroundColor: companyData.couleurSecondaire }, onClick: () => setShowColorPicker('secondary') }), showColorPicker === 'secondary' && (_jsxs("div", { className: "absolute z-10 mt-2 bg-white p-2 rounded-md shadow-xl", children: [_jsx(HexColorPicker, { color: companyData.couleurSecondaire, onChange: (color) => setCompanyData(Object.assign(Object.assign({}, companyData), { couleurSecondaire: color })) }), _jsxs("div", { className: "mt-2 flex justify-between items-center", children: [_jsx("input", { type: "text", value: companyData.couleurSecondaire, onChange: (e) => setCompanyData(Object.assign(Object.assign({}, companyData), { couleurSecondaire: e.target.value })), className: "text-sm border rounded px-2 py-1 w-24" }), _jsx("button", { onClick: () => setShowColorPicker(null), className: "text-sm bg-gray-100 hover:bg-gray-200 px-3 py-1 rounded", children: "Valider" })] })] }))] })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-sm font-medium text-gray-700 mb-2", children: "Police de caract\u00E8res" }), _jsxs("select", { name: "police", value: companyData.police, onChange: handleChange, className: "w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-yellow-500", children: [_jsx("option", { value: "sans-serif", children: "Moderne (sans-serif)" }), _jsx("option", { value: "serif", children: "Classique (serif)" }), _jsx("option", { value: "monospace", children: "Technique (monospace)" })] })] })] })] }), _jsxs("div", { className: "border-b pb-4", children: [_jsxs("h3", { className: "text-lg font-semibold mb-4 flex items-center gap-2", children: [_jsx(ImageIcon, { size: 18 }), "Images"] }), _jsxs("div", { className: "space-y-4", children: [_jsxs("div", { children: [_jsx("label", { className: "block text-sm font-medium text-gray-700 mb-2", children: "Logo" }), companyData.logoUrl ? (_jsxs("div", { className: "flex items-center gap-3", children: [_jsx("img", { src: companyData.logoUrl, alt: "Logo", className: "h-16 w-16 object-contain" }), _jsx("button", { onClick: () => setModalType('logo'), className: "text-sm bg-gray-100 hover:bg-gray-200 px-3 py-1 rounded", children: "Changer" })] })) : (_jsxs("button", { onClick: () => setModalType('logo'), className: "w-full py-4 border-2 border-dashed rounded-lg flex flex-col items-center justify-center text-gray-400 hover:text-gray-600 hover:border-gray-400", children: [_jsx(ImageIcon, { className: "mb-1" }), _jsx("span", { children: "Ajouter un logo" })] }))] }), _jsxs("div", { children: [_jsx("label", { className: "block text-sm font-medium text-gray-700 mb-2", children: "Favicon" }), companyData.faviconUrl ? (_jsxs("div", { className: "flex items-center gap-3", children: [_jsx("img", { src: companyData.faviconUrl, alt: "Favicon", className: "h-8 w-8 object-contain" }), _jsx("button", { onClick: () => setModalType('favicon'), className: "text-sm bg-gray-100 hover:bg-gray-200 px-3 py-1 rounded", children: "Changer" })] })) : (_jsxs("button", { onClick: () => setModalType('favicon'), className: "w-full py-4 border-2 border-dashed rounded-lg flex flex-col items-center justify-center text-gray-400 hover:text-gray-600 hover:border-gray-400", children: [_jsx(ImageIcon, { className: "mb-1" }), _jsx("span", { children: "Ajouter un favicon" })] }))] })] })] })] }), _jsxs("div", { className: "space-y-6", children: [_jsxs("div", { className: "border-b pb-4", children: [_jsxs("h3", { className: "text-lg font-semibold mb-4 flex items-center gap-2", children: [_jsx(Palette, { size: 18 }), "Th\u00E8me graphique"] }), _jsx("div", { className: "grid grid-cols-2 gap-3", children: themeOptions.map((theme) => (_jsxs("div", { onClick: () => setCompanyData(Object.assign(Object.assign({}, companyData), { themeStyle: theme.value })), className: `p-3 border rounded-lg cursor-pointer transition-all ${companyData.themeStyle === theme.value
                                                ? 'ring-2 ring-yellow-500 border-transparent'
                                                : 'hover:shadow-md'}`, children: [_jsxs("div", { className: "flex items-center gap-2 mb-1", children: [theme.icon, _jsx("span", { className: "capitalize font-medium", children: theme.name })] }), _jsx("p", { className: "text-xs text-gray-500", children: theme.description })] }, theme.value))) })] }), _jsxs("div", { className: "border-b pb-4", children: [_jsxs("h3", { className: "text-lg font-semibold mb-4 flex items-center gap-2", children: [_jsx(ImageIcon, { size: 18 }), "Banni\u00E8re"] }), _jsxs("div", { className: "space-y-4", children: [_jsxs("div", { children: [_jsx("label", { className: "block text-sm font-medium text-gray-700 mb-2", children: "Image de couverture statique" }), companyData.banniereUrl ? (_jsxs("div", { className: "flex flex-col", children: [_jsx("img", { src: companyData.banniereUrl, alt: "Banni\u00E8re", className: "h-32 w-full object-cover rounded mb-2" }), _jsx("button", { onClick: () => setModalType('banniereStatique'), className: "text-sm bg-gray-100 hover:bg-gray-200 px-3 py-1 rounded self-start", children: "Changer l'image" })] })) : (_jsxs("button", { onClick: () => setModalType('banniereStatique'), className: "w-full py-8 border-2 border-dashed rounded-lg flex flex-col items-center justify-center text-gray-400 hover:text-gray-600 hover:border-gray-400", children: [_jsx(ImageIcon, { className: "mb-1" }), _jsx("span", { children: "Ajouter une banni\u00E8re" })] }))] }), _jsxs("div", { children: [_jsxs("label", { className: "block text-sm font-medium text-gray-700 mb-2", children: ["Images du slider (", companyData.imagesSlider.length, ")"] }), companyData.imagesSlider.length > 0 ? (_jsxs("div", { className: "space-y-3", children: [_jsx("div", { className: "grid grid-cols-3 gap-2", children: companyData.imagesSlider.map((url, index) => (_jsxs("div", { className: "relative group", children: [_jsx("img", { src: url, alt: `Slide ${index}`, className: "h-20 w-full object-cover rounded" }), _jsx("button", { onClick: () => handleImageRemove(index), className: "absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition", children: _jsx(Trash2, { size: 14 }) })] }, index))) }), _jsxs("button", { onClick: () => setModalType('banniere'), className: "text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1", children: [_jsx(Upload, { size: 14 }), " Ajouter des images"] })] })) : (_jsxs("button", { onClick: () => setModalType('banniere'), className: "w-full py-8 border-2 border-dashed rounded-lg flex flex-col items-center justify-center text-gray-400 hover:text-gray-600 hover:border-gray-400", children: [_jsx(ImageIcon, { className: "mb-1" }), _jsx("span", { children: "Ajouter des images au slider" })] }))] })] })] })] })] }), _jsx("div", { className: "mt-8 flex justify-end", children: _jsx("button", { onClick: handleSave, className: `px-6 py-2 text-white font-medium rounded-md shadow-sm transition flex items-center justify-center ${message.type === 'success'
                        ? 'bg-green-500 hover:bg-green-600'
                        : message.type === 'error'
                            ? 'bg-red-500 hover:bg-red-600'
                            : 'bg-yellow-600 hover:bg-yellow-700'}`, style: { backgroundColor: message.type ? undefined : companyData.couleurPrimaire }, disabled: false, children: message.type === 'success' ? (_jsxs(_Fragment, { children: [_jsx(CheckCircle, { className: "h-5 w-5 mr-2" }), _jsx("span", { children: "Enregistr\u00E9 !" })] })) : message.type === 'error' ? (_jsxs(_Fragment, { children: [_jsx(AlertCircle, { className: "h-5 w-5 mr-2" }), "R\u00E9essayer"] })) : (_jsxs(_Fragment, { children: [_jsx(Save, { className: "h-5 w-5 mr-2" }), "Enregistrer les modifications"] })) }) }), modalType && (user === null || user === void 0 ? void 0 : user.companyId) && (_jsx(ImageSelectorModal, { companyId: user.companyId, onSelect: handleImageSelect, onClose: () => setModalType(null) }))] }));
};
export default ParametresVitrine;
